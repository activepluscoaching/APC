import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { taka, addTaka, migrateAmounts } from '../js/money.js';
import { studentFeeSummary } from '../js/finance-data.js';
test('legacy fractional taka migrates without mutating original objects; integer math', () => {
  const old = [{ id: 'one', amount: 12.51 }, { id: 'two', amount: '৭.৪' }];
  const { rows, changed } = migrateAmounts(old);
  assert.equal(changed, true); assert.deepEqual(rows.map(r => r.amount), [13, 7]);
  assert.equal(old[0].amount, 12.51); assert.equal(addTaka(rows[0].amount, rows[1].amount), 20);
  assert.equal(studentFeeSummary({ id: 'S', monthlyFee: 10.5 }, [{ studentId: 'S', month: 'অক্টোবর ২০২৬', amount: 2.9, feeType: 'মাসিক বেতন' }], new Date('2026-10-10T00:00:00Z')).due, 8);
});
test('bad/unsafe taka cannot be saved or summed', () => {
  for (const v of [-1, 'NaN', '', Infinity, 9007199254740992]) assert.throws(() => taka(v));
  assert.throws(() => addTaka(Number.MAX_SAFE_INTEGER - 1, 2));
});
