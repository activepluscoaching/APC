import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { PaymentError, FEE_TYPES, METHODS, receiptId, preparedReceipt,
  configureStagedFee, submitStagedPayment, inspectStagedPayment, reviewStagedPayment } =
  require('../functions/staged-payment-core.cjs');
const NOW = Date.UTC(2026, 9, 13, 10);
const caller = (uid, role) => ({ uid, token: { role, status: 'active', email: `${uid}@example.com`,
  firebase: { sign_in_provider: 'password' } } });
const admin = () => caller('admin-1', 'admin');
const counter = (uid = 'counter-1') => caller(uid, 'payment');
const manager = () => caller('manager-1', 'manager');
const payload = (requestId = 'clientRequest_0001') => ({ requestId, studentId: 'stu-1',
  amount: 1500, feeType: FEE_TYPES[0], month: '2026-10', method: METHODS[0] });
function fixture() {
  const docs = new Map();
  for (const [uid, role] of [['admin-1', 'admin'], ['counter-1', 'payment'],
    ['counter-2', 'payment'], ['manager-1', 'manager'], ['stu-1', 'student']]) {
    docs.set(`users/${uid}`, { uid, role, status: role === 'student' ? 'approved' : 'active', email: `${uid}@example.com` });
  }
  docs.set('students/stu-1', { uid: 'stu-1', status: 'approved', fullName: 'Student One',
    mobile: '01711111111', className: 'দশম শ্রেণি', group: 'A' });
  const authStudent = { uid: 'stu-1', email: 'stu-1@example.com', emailVerified: true,
    customClaims: { role: 'student', status: 'approved', studentId: 'stu-1' } };
  let queue = Promise.resolve(), failNumber = false;
  const reads = [], db = {
    doc: path => ({ path }),
    runTransaction(callback) {
      const work = queue.then(async () => {
        const writes = [], tx = {
          get: async ref => { reads.push(ref.path); return { exists: docs.has(ref.path), data: () => docs.get(ref.path) }; },
          create(ref, row) {
            if (docs.has(ref.path)) throw new Error('exists');
            if (failNumber && ref.path.startsWith('receiptNumbers/')) throw new Error('number-write-failed');
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
    }
  };
  const auth = { getUser: async uid => uid === authStudent.uid ? authStudent : (() => { throw new Error('missing'); })() };
  const args = { db, auth, serverTimestamp: () => 'server-time', clock: () => NOW };
  return { docs, reads, authStudent, failNumber: () => { failNumber = true; },
    configure: (data = { studentId: 'stu-1', monthlyFee: 1500 }, who = admin()) =>
      configureStagedFee({ ...args, caller: who, data }),
    submit: (data = payload(), who = counter()) => submitStagedPayment({ ...args, caller: who, data }),
    inspect: (id, who = manager()) => inspectStagedPayment({ ...args, caller: who, id }),
    review: (id, decision = 'approved', note = '', who = manager()) =>
      reviewStagedPayment({ ...args, caller: who, data: { id, decision, note } }) };
}

test('Admin makes a create-only, verified minimal fee projection; cannot smuggle extra fields', async () => {
  const env = fixture();
  assert.deepEqual(await env.configure(), { ok: true, studentId: 'stu-1', alreadyConfigured: false });
  assert.deepEqual(Object.keys(env.docs.get('studentSummaries/stu-1')).sort(),
    ['studentId','name','className','group','mobile','monthlyFee','status','configuredBy','configuredAt'].sort());
  assert.equal((await env.configure()).alreadyConfigured, true);
  await assert.rejects(env.configure({ studentId: 'stu-1', monthlyFee: 2500 }),
    error => error.code === 'summary-reserved');
  for (const wrong of [
    { studentId: 'stu-1', monthlyFee: 10.5 }, { studentId: 'stu-1', monthlyFee: -1 },
    { studentId: 'stu-1', monthlyFee: 1500, role: 'admin' }, { studentId: '../stu-1', monthlyFee: 1500 }
  ]) await assert.rejects(env.configure(wrong), PaymentError);
  await assert.rejects(env.configure(undefined, counter()), error => error.code === 'role-denied');
  env.authStudent.emailVerified = false;
  await assert.rejects(env.configure(), error => error.code === 'student-denied');
  assert.equal(env.docs.get('studentSummaries/stu-1').monthlyFee, 1500);
});

test('Counter gets server-only unique pending receipt and idempotent retry; Manager inspects before review', async () => {
  const env = fixture();
  await assert.rejects(env.submit(), error => error.code === 'student-denied', 'no fee projection, no cash entry');
  await env.configure();
  const first = await env.submit();
  assert.equal(first.status, 'pending');
  assert.match(first.receiptNo, /^FC[A-F0-9]{12}-00000001$/);
  assert.equal(first.id, receiptId('counter-1', payload().requestId));
  const row = env.docs.get(`transactions/${first.id}`);
  assert.equal(row.amount, 1500);
  assert.equal(row.status, 'pending');
  assert.equal(row.month, 'অক্টোবর ২০২৬');
  assert.equal(row.date, '১৩ অক্টোবর ২০২৬');
  assert.equal(row.createdBy, 'counter-1');
  assert.equal(row.reviewedBy, undefined);
  assert.equal(env.docs.get(`receiptNumbers/${first.receiptNo}`).transactionId, first.id);
  assert.equal(env.docs.get('receiptSequences/counter-1').last, 1);
  assert.equal((await env.submit()).alreadySubmitted, true);
  assert.equal(env.docs.get('receiptSequences/counter-1').last, 1);
  const inspect = await env.inspect(first.id);
  assert.equal(inspect.receipt.amount, 1500);
  assert.equal(inspect.receipt.mobile, undefined);
  assert.equal(inspect.receipt.monthlyFee, undefined);
  env.docs.set(`receiptNumbers/${first.receiptNo}`, { transactionId: 'other' });
  await assert.rejects(env.review(first.id), error => error.code === 'unverified-receipt');
  env.docs.set(`receiptNumbers/${first.receiptNo}`, { transactionId: first.id });
  assert.equal((await env.review(first.id)).status, 'approved');
  assert.equal(env.docs.get(`transactions/${first.id}`).reviewHistory.length, 1);
  assert.equal((await env.review(first.id)).alreadyReviewed, true);
  assert.equal((await env.submit()).status, 'approved');
  await assert.rejects(env.review(first.id, 'rejected', 'Changed my mind'), error => error.code === 'already-reviewed');
  await assert.rejects(env.submit({ ...payload(), amount: 999 }), error => error.code === 'request-reserved');
  const next = await env.submit(payload('clientRequest_0002'));
  assert.match(next.receiptNo, /-00000002$/);
  assert.notEqual(next.id, first.id);
});

test('concurrent cash submissions serialize on the sequence; failure leaves no partial receipt or consumed number', async () => {
  const env = fixture(); await env.configure();
  const [a,b,c] = await Promise.all([
    env.submit(payload('clientRequest_0001')),
    env.submit(payload('clientRequest_0002')),
    env.submit(payload('clientRequest_0003'), counter('counter-2'))
  ]);
  assert.notEqual(a.receiptNo, b.receiptNo);
  assert.notEqual(c.receiptNo, b.receiptNo);
  assert.match(b.receiptNo, /-00000002$/);
  assert.match(c.receiptNo, /-00000001$/);
  const failed = fixture(); await failed.configure(); failed.failNumber();
  await assert.rejects(failed.submit(), /number-write-failed/);
  assert.equal(failed.docs.has(`transactions/${receiptId('counter-1', payload().requestId)}`), false);
  assert.equal(failed.docs.has('receiptSequences/counter-1'), false);
});

test('digital reference is mandatory, globally reserved per provider, and collision cannot mint a second receipt', async () => {
  const env = fixture(); await env.configure();
  const digital = { ...payload(), method: METHODS[1], trxRef: 'Payment-ABC-123' };
  const first = await env.submit(digital);
  const second = { ...digital, requestId: 'clientRequest_0002', trxRef: 'payment-abc-123' };
  await assert.rejects(env.submit(second), error => error.code === 'reference-reserved');
  assert.equal(env.docs.get('receiptSequences/counter-1').last, 1);
  assert.equal(env.docs.get(`transactions/${first.id}`).trxRef, digital.trxRef);
  assert.equal((await env.submit(digital)).alreadySubmitted, true);
  assert.equal([...env.docs.keys()].filter(path => path.startsWith('paymentReferences/')).length, 1);
});

test('unknown fields, invalid amounts/month/method/provider, forged roles and inactive students fail closed', async () => {
  const env = fixture(); await env.configure();
  for (const bad of [
    { ...payload(), amount: '1500' }, { ...payload(), amount: 10.1 }, { ...payload(), amount: 0 },
    { ...payload(), amount: Number.MAX_SAFE_INTEGER }, { ...payload(), status: 'approved' },
    { ...payload(), receiptNo: 'mine' }, { ...payload(), requestId: 'x' },
    { ...payload(), method: METHODS[1] }, { ...payload(), method: METHODS[1], trxRef: 'ÀBC 123' },
    { ...payload(), month: '2022-01' }, { ...payload(), month: '2026-13' },
    { ...payload(), trxRef: 'pretend-bank' }
  ]) await assert.rejects(env.submit(bad), PaymentError);
  await assert.rejects(env.submit(payload(), admin()), error => error.code === 'role-denied');
  await assert.rejects(env.inspect(receiptId('counter-1', payload().requestId), counter()), PaymentError);
  env.docs.set('students/stu-1', { ...env.docs.get('students/stu-1'), status: 'pending' });
  await assert.rejects(env.submit(), error => error.code === 'student-denied');
  assert.equal(env.docs.has('receiptSequences/counter-1'), false);
  assert.deepEqual(preparedReceipt(payload(), NOW).month, 'অক্টোবর ২০২৬');
});

test('review cannot approve unknown/forged receipt; rejected record cannot be resurrected', async () => {
  const env = fixture(); await env.configure();
  const { id } = await env.submit();
  await assert.rejects(env.review(id, 'rejected'), error => error.code === 'invalid-review');
  await assert.rejects(env.review(id, 'approved', '', counter()), error => error.code === 'role-denied');
  env.docs.set(`transactions/${id}`, { ...env.docs.get(`transactions/${id}`), receiptNo: 'FAKE-00001' });
  await assert.rejects(env.review(id), error => error.code === 'unverified-receipt');
  await assert.rejects(env.inspect(id), error => error.code === 'unverified-receipt');
  env.docs.set(`transactions/${id}`, { ...env.docs.get(`transactions/${id}`), receiptNo:
    [...env.docs.keys()].find(key => key.startsWith('receiptNumbers/')).split('/')[1] });
  assert.equal((await env.review(id, 'rejected', 'Reference could not be confirmed')).status, 'rejected');
  await assert.rejects(env.review(id), error => error.code === 'already-reviewed');
});

test('finance and reservation paths remain browser-write-denied and staged callables use App Check', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  for (const name of ['adminConfigureStudentFee','counterSubmitPayment','managerInspectPayment','managerReviewPayment']) {
    assert.match(source, new RegExp(`exports\\.${name} = onCall\\(\\{ enforceAppCheck: true \\}`));
  }
  for (const name of ['receiptSequences/{counterId}','receiptNumbers/{receiptNo}','paymentReferences/{referenceId}']) {
    assert.match(rules.split(`match /${name}`)[1].split('match /')[0], /allow read, write: if false/);
  }
  assert.match(rules.split('match /transactions/{transactionId}')[1].split('match /')[0], /allow create, update, delete: if false/);
});
