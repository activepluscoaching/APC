import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { loadRoster, saveRoster, ROSTER_KEY } from '../js/office-data.js';
test('legacy roster fractional fee is migrated without removing other fields', () => {
  const original = [{ id: 'S', name: 'নমুনা', monthlyFee: 1200.7, extra: 'keep' }];
  const data = new Map([[ROSTER_KEY, JSON.stringify(original)]]);
  globalThis.window = { localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) } };
  assert.equal(loadRoster().find(row => row.id === 'S').monthlyFee, 1201);
  assert.equal(JSON.parse(data.get(ROSTER_KEY))[0].extra, 'keep');
  assert.equal(saveRoster([{ id: 'S', monthlyFee: 3.6 }]), true);
  assert.equal(JSON.parse(data.get(ROSTER_KEY))[0].monthlyFee, 4);
});
