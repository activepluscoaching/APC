import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { financeRepository, TRANSACTIONS_KEY } from '../js/finance-data.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
let data;
beforeEach(() => {
  data = new Map();
  data.set(STAFF_ACCOUNTS.payment.accountKey, JSON.stringify({ role: 'payment', username: STAFF_ACCOUNTS.payment.username, status: 'active' }));
  const localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
  globalThis.window = { localStorage, sessionStorage: { getItem: key => key === STAFF_ACCOUNTS.payment.sessionKey ? '1' : null } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
});
const tx = id => ({ id, studentId: 'TEST-S', studentName: 'নমুনা', amount: 800, status: 'approved' });
const save = id => financeRepository.saveTransaction(tx(id), { counterReceipt: true });
test('new receipts have durable device prefix and six-digit ordinal; date changes do not reset', async () => {
  const first = (await save('T-1'))[0].receiptNo;
  assert.match(first, /^C[0-9A-F]{8}-000001$/);
  const next = (await save('T-2'))[0].receiptNo;
  assert.equal(next, `${first.slice(0, -1)}2`);
  assert.equal(data.get('activePlus.devicePrefix.v1'), first.split('-')[0]);
});
test('legacy receipts remain untouched; retries do not consume ordinals', async () => {
  const legacy = { ...tx('OLD'), receiptNo: 'R261001007-0011223344556677' };
  data.set(TRANSACTIONS_KEY, JSON.stringify([legacy]));
  const first = (await save('NEW'))[0].receiptNo;
  await save('NEW');
  const rows = await save('NEXT');
  assert.deepEqual(rows[2], legacy);
  assert.equal(rows[1].receiptNo, first);
  assert.equal(rows[0].receiptNo, `${first.slice(0, -1)}2`);
});
test('failed write leaves ledger unchanged and does not consume an ordinal', async () => {
  const first = (await save('T-1'))[0].receiptNo;
  const before = data.get(TRANSACTIONS_KEY);
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(() => save('T-2'), /Quota/);
  assert.equal(data.get(TRANSACTIONS_KEY), before);
  window.localStorage.setItem = (key, value) => data.set(key, String(value));
  assert.equal((await save('T-2'))[0].receiptNo, `${first.slice(0, -1)}2`);
  data.set(TRANSACTIONS_KEY, 'broken');
  await assert.rejects(() => save('T-3'));
  assert.equal(data.get(TRANSACTIONS_KEY), 'broken');
});
test('non-counter supplied legacy receipt stays intact', async () => {
  const rows = await financeRepository.saveTransaction({ ...tx('OLD'), receiptNo: 'KEEP-OLD' });
  assert.equal(rows[0].receiptNo, 'KEEP-OLD');
});
