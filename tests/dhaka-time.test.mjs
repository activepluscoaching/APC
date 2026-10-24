import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { dhakaKey, dhakaParts, nowEpoch, setTimeProvider } from '../js/time.js';
import { monthLabel, dateLabel } from '../js/finance-data.js';
test('UTC day boundary is Dhaka day boundary everywhere', () => {
  const time = new Date('2026-12-31T20:00:00Z');
  assert.equal(dhakaKey(time), '2027-01-01');
  assert.deepEqual(dhakaParts(time), { year: 2027, month: 1, day: 1 });
  assert.equal(monthLabel(time), 'জানুয়ারি ২০২৭');
  assert.equal(dateLabel(time), '১ জানুয়ারি ২০২৭');
});
test('clock source can be replaced by a trusted server offset', () => {
  try { setTimeProvider(() => 123456); assert.equal(nowEpoch(), 123456); }
  finally { setTimeProvider(() => Date.now()); }
});
