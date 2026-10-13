import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const NOW = Date.UTC(2026, 9, 13, 10);
const require = createRequire(import.meta.url);
const { PaymentError, receiptId, FEE_TYPES, METHODS } = require('../functions/staged-payment-core.cjs');
const { LIMIT, targetMonth, summarizeVerifiedRows, readStagedPaymentPosition } =
  require('../functions/staged-payment-position-core.cjs');
const admin = () => ({ uid: 'admin-1', token: { role: 'admin', status: 'active', email: 'admin-1@example.com',
  firebase: { sign_in_provider: 'password' } } });
const prefix = `FC${createHash('sha256').update('counter-1').digest('hex').slice(0, 12).toUpperCase()}`;
function fixture() {
  const docs = new Map([
    ['users/admin-1', { uid: 'admin-1', role: 'admin', status: 'active', email: 'admin-1@example.com' }],
    ['users/stu-1', { uid: 'stu-1', role: 'student', status: 'approved', email: 'stu-1@example.com' }],
    ['students/stu-1', { uid: 'stu-1', fullName: 'Student One', status: 'approved',
      mobile: '01711111111', className: 'দশম শ্রেণি', group: 'A' }],
    ['studentSummaries/stu-1', { studentId: 'stu-1', name: 'Student One', status: 'approved',
      mobile: '01711111111', className: 'দশম শ্রেণি', group: 'A', monthlyFee: 1500,
      configuredBy: 'admin-1', configuredAt: { toMillis: () => Date.UTC(2026, 8, 1) } }]
  ]);
  const reads = [];
  const db = {
    doc: path => ({ path }),
    collection(path) { return { where(field, operator, value) {
      return { limit(max) { return { kind: 'query', path, field, operator, value, max }; } };
    } }; },
    async runTransaction(callback) {
      const immutable = new Map(docs);
      const tx = { async get(ref) {
        if (ref.kind === 'query') {
          reads.push(`query:${ref.path}:${ref.field}:${ref.value}:${ref.max}`);
          if (!['transactions', 'paymentReversals'].includes(ref.path) || ref.field !== 'studentId' ||
              ref.operator !== '==' || ref.max !== LIMIT + 1) throw new Error('unsafe query');
          const items = [...immutable].filter(([key, value]) => key.startsWith(`${ref.path}/`) &&
            value.studentId === ref.value).slice(0, ref.max);
          return { docs: items.map(([key, value]) => ({ id: key.split('/')[1], data: () => value })) };
        }
        reads.push(ref.path);
        return { exists: immutable.has(ref.path), data: () => immutable.get(ref.path) };
      } };
      return callback(tx);
    }
  };
  function addReceipt(ordinal, { amount = 800, month = 'অক্টোবর ২০২৬', status = 'approved',
    feeType = FEE_TYPES[0], studentId = 'stu-1', method = METHODS[0], trxRef = '' } = {}) {
    const requestId = `clientRequest_${String(ordinal).padStart(4, '0')}`;
    const id = receiptId('counter-1', requestId);
    const receiptNo = `${prefix}-${String(ordinal).padStart(8, '0')}`;
    const referenceId = trxRef ? createHash('sha256').update(`${method}\0${trxRef.toLowerCase()}`).digest('hex') : '';
    const row = { id, requestId, receiptNo, studentId, studentName: 'Student One',
      className: 'দশম শ্রেণি', amount, month, feeType, method, trxRef, referenceId,
      date: '১৩ অক্টোবর ২০২৬', recordedAt: 1791885600000, createdAt: 'server-time',
      createdBy: 'counter-1', status, reviewHistory: status === 'pending' ? [] : [{
        decision: status, reason: status === 'rejected' ? 'Invalid' : '',
        reviewedBy: 'manager-1', reviewedAt: 'server-time' }] };
    if (status !== 'pending') { row.reviewedBy = 'manager-1'; row.reviewedAt = 'server-time'; }
    docs.set(`transactions/${id}`, row);
    docs.set(`receiptNumbers/${receiptNo}`, { transactionId: id, createdBy: 'counter-1' });
    if (referenceId) docs.set(`paymentReferences/${referenceId}`, { transactionId: id, createdBy: 'counter-1' });
    return row;
  }
  function addReversal(receipt, state = 'approved') {
    const record = { schemaVersion: 1, id: receipt.id, receiptNo: receipt.receiptNo,
      studentId: receipt.studentId, feeType: receipt.feeType, month: receipt.month,
      amount: receipt.amount, originalCounterUid: receipt.createdBy,
      reason: 'Duplicate payment needs correction', requestedBy: 'manager-1',
      requestedAt: 'server-time', state };
    if (state !== 'pending') Object.assign(record, { decidedBy: 'admin-1', decidedAt: 'server-time',
      decisionNote: 'Reviewed original and counter receipts' });
    docs.set(`paymentReversals/${receipt.id}`, record);
    return record;
  }
  return { docs, reads, addReceipt, addReversal,
    read: (data = { studentId: 'stu-1', month: '2026-10' }, caller = admin()) =>
      readStagedPaymentPosition({ db, caller, data, clock: () => NOW }) };
}

test('a bounded read-only transaction reconciles ALL staged rows and subtracts only approved reversals', async () => {
  const env = fixture();
  const tuition = env.addReceipt(1, { amount: 800 });
  const reversed = env.addReceipt(2, { amount: 500 }); env.addReversal(reversed);
  const otherFee = env.addReceipt(3, { amount: 200, feeType: FEE_TYPES[1] });
  const pending = env.addReceipt(4, { amount: 100, status: 'pending' });
  const rejected = env.addReceipt(5, { amount: 300, status: 'rejected' });
  const otherMonth = env.addReceipt(6, { amount: 250, month: 'সেপ্টেম্বর ২০২৬' });
  const before = new Map(env.docs);
  assert.deepEqual(await env.read(), {
    ok: true, studentId: 'stu-1', month: '2026-10', monthlyFee: 1500,
    approvedGross: 1500, approvedReversed: 500, netPaid: 1000,
    tuitionPaid: 800, due: 700, pendingAmount: 100,
    approvedCount: 3, reversedCount: 1, pendingCount: 1, rejectedCount: 1
  });
  assert.deepEqual(env.docs, before, 'read-only: no receipt, reversal or summary update');
  for (const row of [tuition, reversed, otherFee, pending, rejected, otherMonth]) {
    assert.ok(env.reads.includes(`receiptNumbers/${row.receiptNo}`));
    assert.ok(env.reads.includes(`paymentReversals/${row.id}`));
  }
  assert.ok(env.reads.includes(`query:transactions:studentId:stu-1:${LIMIT + 1}`));
  assert.ok(env.reads.includes(`query:paymentReversals:studentId:stu-1:${LIMIT + 1}`));
  const september = await env.read({ studentId: 'stu-1', month: '2026-09' });
  assert.equal(september.netPaid, 250);
  assert.equal(september.due, 1250);
  assert.equal(september.approvedCount, 1);
});

test('empty ledger preserves configured due; pending/rejected corrections do not offset paid', async () => {
  const env = fixture();
  const empty = await env.read();
  assert.equal(empty.due, 1500);
  assert.equal(empty.netPaid, 0);
  const one = env.addReceipt(1, { amount: 700 });
  env.addReversal(one, 'pending');
  assert.equal((await env.read()).tuitionPaid, 700);
  env.addReversal(one, 'rejected');
  assert.equal((await env.read()).tuitionPaid, 700);
  env.addReversal(one, 'approved');
  assert.equal((await env.read()).tuitionPaid, 0);
  assert.equal((await env.read()).due, 1500);
});

test('invalid identity/role/profile, month and client totals are rejected before the ledger query', async () => {
  const env = fixture();
  const denied = [
    [{ studentId: 'stu-1', month: '2026-10' }, { ...admin(), token: { ...admin().token, role: 'manager' } }],
    [{ studentId: 'stu-1', month: '2026-10' }, { ...admin(), token: { ...admin().token, firebase: { sign_in_provider: 'anonymous' } } }],
    [{ studentId: '../stu-1', month: '2026-10' }, admin()],
    [{ studentId: 'stu-1', month: '2026-13' }, admin()],
    [{ studentId: 'stu-1', month: '2026-10', paid: 10000 }, admin()]
  ];
  for (const [input, actor] of denied) await assert.rejects(env.read(input, actor), PaymentError);
  assert.equal(env.reads.some(path => path.startsWith('query:')), false);
  env.docs.set('students/stu-1', { ...env.docs.get('students/stu-1'), className: 'নবম শ্রেণি' });
  await assert.rejects(env.read(), error => error.code === 'student-denied');
  assert.equal(env.reads.some(path => path.startsWith('query:')), false);
  assert.equal(targetMonth('2026-10'), 'অক্টোবর ২০২৬');
  assert.throws(() => targetMonth('2026-00'), PaymentError);
});

test('historical or future due without an effective fee schedule is not invented', async () => {
  const env = fixture();
  await assert.rejects(env.read({ studentId: 'stu-1', month: '2026-08' }),
    error => error.code === 'fee-period-unverified');
  await assert.rejects(env.read({ studentId: 'stu-1', month: '2026-11' }),
    error => error.code === 'fee-period-unverified');
  env.docs.set('studentSummaries/stu-1', { ...env.docs.get('studentSummaries/stu-1'),
    configuredAt: 'not-a-server-timestamp' });
  await assert.rejects(env.read(), error => error.code === 'fee-period-unverified');
  assert.equal(env.reads.some(path => path.startsWith('query:')), false);
});

test('legacy/forged/tampered rows fail closed even when outside the requested month', async () => {
  const cases = [
    env => { env.docs.set('transactions/legacy-1', { studentId: 'stu-1', amount: 99999, status: 'approved' }); },
    env => { const row = env.addReceipt(1, { month: 'সেপ্টেম্বর ২০২৬' }); env.docs.set(`receiptNumbers/${row.receiptNo}`, { transactionId: 'other' }); },
    env => { const row = env.addReceipt(1, { month: 'সেপ্টেম্বর ২০২৬' }); env.addReversal(row); env.docs.set(`paymentReversals/${row.id}`, { ...env.docs.get(`paymentReversals/${row.id}`), amount: 999 }); },
    env => { const row = env.addReceipt(1, { month: 'সেপ্টেম্বর ২০২৬' }); env.docs.set(`transactions/${row.id}`, { ...row, month: 'not a valid month' }); },
    env => { const row = env.addReceipt(1); env.addReversal(row); env.docs.delete(`transactions/${row.id}`); }
  ];
  for (const mutate of cases) {
    const env = fixture(); mutate(env);
    await assert.rejects(env.read(), PaymentError);
  }
});

test('digital reference index, cap and safe integer accumulation are enforced', async () => {
  const digital = fixture();
  const row = digital.addReceipt(1, { amount: 100, method: METHODS[1], trxRef: 'WALLET-REF-01' });
  assert.equal((await digital.read()).netPaid, 100);
  const refId = row.referenceId;
  digital.docs.delete(`paymentReferences/${refId}`);
  await assert.rejects(digital.read(), error => error.code === 'unverified-receipt');
  const large = fixture();
  for (let n = 1; n <= LIMIT + 1; n++) large.addReceipt(n, { amount: 1 });
  await assert.rejects(large.read(), error => error.code === 'ledger-too-large');
  assert.equal(large.reads.some(key => key.startsWith('receiptNumbers/')), false, 'reject before partial processing');
  const sum = summarizeVerifiedRows({ studentId: 'stu-1', month: '2026-10', monthlyFee: 1500,
    entries: [{ receipt: { ...row, method: METHODS[0], trxRef: '', referenceId: '', amount: 100 }, reversal: null }] });
  assert.equal(sum.netPaid, 100);
});

test('only App Check Admin callable can access this read path; no UI/adapter cutover', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const core = readFileSync(new URL('../functions/staged-payment-position-core.cjs', import.meta.url), 'utf8');
  assert.match(source, /exports.adminReadStudentPaymentPosition = onCall\(\{ enforceAppCheck: true \}/);
  assert.match(core, /tx\.get\(query\)/);
  assert.match(core, /\.where\('studentId', '==', data\.studentId\)\.limit\(LIMIT \+ 1\)/);
  assert.match(core, /tx\.get\(db\.doc\(`paymentReversals\/\$\{doc\.id\}`\)\)/);
  assert.doesNotMatch(core, /tx\.(create|set|update|delete)\(/);
});
