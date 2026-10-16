import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeStudyResults } from '../js/student-study-sections.js';
const row = (id, subject, endAt, percent) => ({ exam: { id, subject, endAt }, percent });
test('result summary sorts by exam time, uses percentages, and compares the same subject', () => {
  const rows = [row('M1', 'গণিত', 1, 60), row('E1', 'ইংরেজি', 2, 90), row('M2', 'গণিত', 3, 80), row('M3', 'গণিত', 4, 70)];
  const summary = summarizeStudyResults(rows);
  assert.equal(summary.count, 4);
  assert.equal(summary.average, 75);
  assert.equal(summary.highest, 90);
  assert.deepEqual(summary.recent.map(item => [item.exam.id, item.trend]), [['M3', -1], ['M2', 1], ['E1', null], ['M1', null]]);
  assert.equal(rows[0].exam.id, 'M1', 'sorting must not mutate repository data');
});
test('empty results have no fabricated scores', () => {
  assert.deepEqual(summarizeStudyResults([]), { count: 0, average: null, highest: null, recent: [] });
});
