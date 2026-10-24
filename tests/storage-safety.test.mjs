import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { safeSetItem, isQuotaError, backupOverdue, requestPersistentStorage } from '../js/storage-safety.js';
test('quota failure does not erase existing value', () => {
  const data = new Map([['ledger','old']]);
  const storage = { setItem() { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); } };
  assert.throws(() => safeSetItem(storage, 'ledger', 'new'), isQuotaError);
  assert.equal(data.get('ledger'), 'old');
});
test('seven-day backup reminder and best-effort persistence', async () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  assert.equal(backupOverdue(null, now), true);
  assert.equal(backupOverdue(new Date(now - 7 * 86400000).toISOString(), now), true);
  assert.equal(backupOverdue(new Date(now - 6 * 86400000).toISOString(), now), false);
  assert.equal(await requestPersistentStorage({ storage: { persist: async () => true } }), true);
});
