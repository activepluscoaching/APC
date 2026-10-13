import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { nowEpoch, setTimeProvider } from '../js/time.js';
test('last observed time is kept for the tab session across subsequent readings', () => {
  const items = new Map();
  globalThis.sessionStorage = { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  try {
    setTimeProvider(() => 1000000);
    assert.equal(nowEpoch(), 1000000);
    setTimeProvider(() => 990000);
    items.set('activePlus.lastSeenClock.v1', '1000000');
    assert.equal(nowEpoch(), 990000);
    assert.equal(items.get('activePlus.lastSeenClock.v1'), '1000000', 'backward clock cannot lower the last-known time');
  } finally { setTimeProvider(() => Date.now()); delete globalThis.sessionStorage; }
});
