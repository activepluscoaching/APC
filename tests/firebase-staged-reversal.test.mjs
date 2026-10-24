import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PaymentError, receiptId, FEE_TYPES, METHODS } = require('../functions/staged-payment-core.cjs');
const { verifiedReversal, requestStagedReversal, decideStagedReversal, netApprovedAmount } =
  require('../functions/staged-reversal-core.cjs');
const caller = (uid, role) => ({ uid, token: { role, status: 'active', email: `${uid}@example.com`,
  firebase: { sign_in_provider: 'password' } } });
const manager = () => caller('manager-1', 'manager');
const admin = () => caller('admin-1', 'admin');
const reason = 'Duplicate payment entry needs a correction';
const note = 'I verified the duplicate against the counter records';
function fixture() {
  const docs = new Map();
  for (const [uid, role] of [['manager-1', 'manager'], ['manager-2', 'manager'],
    ['admin-1', 'admin'], ['admin-2', 'admin'], ['counter-1', 'payment']]) {
    docs.set(`users/${uid}`, { uid, role, status: 'active', email: `${uid}@example.com` });
  }
  const id = receiptId('counter-1', 'clientRequest_0001');
  const receiptNo = `FC${createHash('sha256').update('counter-1').digest('hex').slice(0, 12).toUpperCase()}-00000001`;
  const original = { id, requestId: 'clientRequest_0001', receiptNo, studentId: 'stu-1',
    studentName: 'Student One', className: 'দশম শ্রেণি', month: 'অক্টোবর ২০২৬',
    feeType: FEE_TYPES[0], amount: 1500, method: METHODS[0], trxRef: '', referenceId: '',
    date: '১৩ অক্টোবর ২০২৬', recordedAt: 1791885600000, createdAt: 'server-time',
    createdBy: 'counter-1', status: 'approved', reviewedBy: 'manager-1',
    reviewedAt: 'server-time', reviewNote: '', reviewHistory: [{ decision: 'approved',
      reason: '', reviewedBy: 'manager-1', reviewedAt: 'server-time' }] };
  docs.set(`transactions/${id}`, original);
  docs.set(`receiptNumbers/${receiptNo}`, { transactionId: id, createdBy: 'counter-1' });
  let queue = Promise.resolve(), failCreate = false;
  const db = { doc: path => ({ path }), runTransaction(callback) {
    const work = queue.then(async () => {
      const writes = [], tx = {
        get: async ref => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
        create(ref, row) {
          if (docs.has(ref.path)) throw new Error('already-exists');
          if (failCreate) throw new Error('write-failed');
          writes.push([ref.path, row, 'create']);
        },
        update(ref, patch) { writes.push([ref.path, patch, 'update']); }
      };
      const result = await callback(tx);
      for (const [path, row, op] of writes) docs.set(path, op === 'update' ? { ...docs.get(path), ...row } : row);
      return result;
    });
    queue = work.catch(() => {});
    return work;
  } };
  const opts = { db, serverTimestamp: () => 'server-time' };
  return { docs, id, receiptNo, original, failCreate: () => { failCreate = true; },
    request: (data = { id, receiptNo, reason }, who = manager()) => requestStagedReversal({ ...opts, data, caller: who }),
    decide: (data = { id, decision: 'approved', note }, who = admin()) => decideStagedReversal({ ...opts, data, caller: who }) };
}

test('Manager makes one pending accounting request; it never modifies the original ledger or creates a refund', async () => {
  const env = fixture();
  assert.equal(netApprovedAmount(env.original), 1500);
  assert.deepEqual(await env.request(), { ok: true, id: env.id, state: 'pending', alreadyRequested: false });
  const pending = env.docs.get(`paymentReversals/${env.id}`);
  assert.equal(verifiedReversal(pending, env.original), true);
  assert.equal(pending.amount, 1500);
  assert.equal(pending.receiptNo, env.receiptNo);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.requestedBy, 'manager-1');
  assert.equal(env.docs.get(`transactions/${env.id}`), env.original, 'the receipt remains immutable');
  assert.equal(netApprovedAmount(env.original, pending), 1500, 'pending correction changes no totals');
  assert.equal((await env.request()).alreadyRequested, true);
  assert.equal(env.docs.size, 8);
});

test('a separate Admin decides once; net projection subtracts only an approved correction', async () => {
  const env = fixture(); await env.request();
  assert.deepEqual(await env.decide(), { ok: true, id: env.id, state: 'approved', alreadyDecided: false });
  const approved = env.docs.get(`paymentReversals/${env.id}`);
  assert.equal(verifiedReversal(approved, env.original), true);
  assert.equal(approved.decidedBy, 'admin-1');
  assert.equal(netApprovedAmount(env.original, approved), 0);
  assert.equal(netApprovedAmount(env.original), 1500, 'the raw receipt was not silently overwritten');
  assert.equal((await env.decide()).alreadyDecided, true);
  assert.equal((await env.request()).state, 'approved');
  await assert.rejects(env.decide({ id: env.id, decision: 'rejected', note }), error => error.code === 'reversal-reserved');
  await assert.rejects(env.request({ id: env.id, receiptNo: env.receiptNo, reason: 'A different reason' }),
    error => error.code === 'reversal-reserved');
});

test('Admin rejection stays auditable and cannot be re-opened; retry remains idempotent', async () => {
  const env = fixture(); await env.request();
  const rejected = { id: env.id, decision: 'rejected', note: 'Original receipt was valid after reconciliation' };
  assert.equal((await env.decide(rejected)).state, 'rejected');
  assert.equal(netApprovedAmount(env.original, env.docs.get(`paymentReversals/${env.id}`)), 1500);
  assert.equal((await env.decide(rejected)).alreadyDecided, true);
  await assert.rejects(env.decide(), error => error.code === 'reversal-reserved');
  await assert.rejects(env.request(undefined, caller('manager-2', 'manager')),
    error => error.code === 'reversal-reserved');
});

test('competing Admin decisions serialize; no double reversal or changed decision', async () => {
  const env = fixture(); await env.request();
  const replies = await Promise.allSettled([
    env.decide(),
    env.decide({ id: env.id, decision: 'rejected', note: 'Original receipt was valid after reconciliation' },
      caller('admin-2', 'admin'))
  ]);
  assert.equal(replies.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(replies.filter(x => x.status === 'rejected').length, 1);
  assert.equal(env.docs.get(`paymentReversals/${env.id}`).state, 'approved');
  assert.equal(env.docs.get(`transactions/${env.id}`), env.original);
});

test('concurrent request race, rollback and invalid receipt/index leave no partial correction', async () => {
  const env = fixture();
  const answers = await Promise.allSettled([
    env.request(), env.request({ id: env.id, receiptNo: env.receiptNo,
      reason: 'Another correction reason from the other Manager' }, caller('manager-2', 'manager'))
  ]);
  assert.equal(answers.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(answers.filter(x => x.status === 'rejected').length, 1);
  assert.equal(env.docs.get(`paymentReversals/${env.id}`).requestedBy, 'manager-1');
  const failed = fixture(); failed.failCreate();
  await assert.rejects(failed.request(), /write-failed/);
  assert.equal(failed.docs.has(`paymentReversals/${failed.id}`), false);
  const corrupt = fixture(); corrupt.docs.set(`receiptNumbers/${corrupt.receiptNo}`, { transactionId: 'other' });
  await assert.rejects(corrupt.request(), error => error.code === 'unverified-receipt');
  assert.equal(corrupt.docs.has(`paymentReversals/${corrupt.id}`), false);
});

test('unreviewed/rejected/forged originals and malformed requests or actors fail closed', async () => {
  for (const status of ['pending', 'rejected']) {
    const env = fixture();
    env.docs.set(`transactions/${env.id}`, { ...env.original, status,
      reviewedBy: undefined, reviewHistory: [] });
    await assert.rejects(env.request(), PaymentError);
    assert.equal(env.docs.has(`paymentReversals/${env.id}`), false);
  }
  const env = fixture();
  for (const changed of [
    { id: env.id, receiptNo: 'FC000000000000-00000001', reason },
    { id: '../' + env.id, receiptNo: env.receiptNo, reason },
    { id: env.id, receiptNo: env.receiptNo, reason: 'short' },
    { id: env.id, receiptNo: env.receiptNo, reason, amount: -1500 }
  ]) await assert.rejects(env.request(changed), PaymentError);
  await assert.rejects(env.request(undefined, admin()), error => error.code === 'role-denied');
  await assert.rejects(env.decide(), error => error.code === 'unverified-reversal');
  await env.request();
  await assert.rejects(env.decide(undefined, manager()), error => error.code === 'role-denied');
  await assert.rejects(env.decide({ id: env.id, decision: 'approved', note: 'short' }),
    error => error.code === 'invalid-decision');
  env.docs.set(`paymentReversals/${env.id}`, { ...env.docs.get(`paymentReversals/${env.id}`), amount: 200 });
  await assert.rejects(env.decide(), error => error.code === 'unverified-reversal');
  assert.throws(() => netApprovedAmount(env.original, env.docs.get(`paymentReversals/${env.id}`)), PaymentError);
  assert.equal(env.docs.get(`transactions/${env.id}`).status, 'approved');
});

test('Firestore remains client-write-denied and both reversal callables require App Check', () => {
  const code = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  for (const name of ['managerRequestPaymentReversal', 'adminDecidePaymentReversal']) {
    assert.match(code, new RegExp(`exports\\.${name} = onCall\\(\\{ enforceAppCheck: true \\}`));
  }
  const block = rules.split('match /paymentReversals/{receiptId}')[1].split('match /')[0];
  assert.match(block, /allow read: if isAdmin\(\)/);
  assert.match(block, /allow create, update, delete: if false/);
  assert.match(code, /requestStagedReversal\(\{ db, caller: request\.auth/);
  assert.match(code, /decideStagedReversal\(\{ db, caller: request\.auth/);
});
