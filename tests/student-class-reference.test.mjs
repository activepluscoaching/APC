import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyClassAttendance } from '../js/student-hubs.js';
const student = { id: 'S-CLASS', className: 'দশম শ্রেণি', group: 'বিজ্ঞান' };
const row = (id, value, extra = {}) => ({ id, type: 'routine', status: 'published', className: student.className,
  group: student.group, date: '2026-10-10', progress: { [student.id]: { value } }, ...extra });

test('monthly class attendance is student, section, month and publication scoped', () => {
  const stats = monthlyClassAttendance([
    row('P', 'present'), row('A', 'absent'), row('L', 'late'), row('U', undefined),
    row('OLD', 'absent', { date: '2026-09-30' }), row('FUTURE', 'absent', { date: '2026-10-20' }),
    row('OTHER-CLASS', 'absent', { className: 'নবম শ্রেণি' }), row('OTHER-GROUP', 'absent', { group: 'মানবিক' }),
    row('DRAFT', 'absent', { status: 'draft' }), row('HW', 'done', { type: 'homework' })
  ], student, '2026-10-16');
  assert.deepEqual(stats.rows.map(item => item.id), ['P', 'A', 'L', 'U']);
  assert.equal(stats.percent, 67, 'late counts as attendance, unknown is not an absence');
});
test('no recorded attendance yields no invented percentage', () => {
  assert.deepEqual(monthlyClassAttendance([], student, '2026-10-16'), { rows: [], percent: null });
  assert.equal(monthlyClassAttendance([row('U', undefined)], student, '2026-10-16').percent, null);
});
