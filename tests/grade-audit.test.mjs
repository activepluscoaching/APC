import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { gradeEditPolicy, appendGradeAudit, EDIT_WINDOW_MS } from '../js/grade-audit.js';
test('teacher may edit for seven days; manager after that needs reason; audit preserves before/after', () => {
  const now = 2000000000; const previous = { score: 2, at: now - EDIT_WINDOW_MS - 1 };
  assert.throws(() => gradeEditPolicy({ actor: { role: 'teacher' }, previous, now }), /৭ দিন/);
  assert.throws(() => gradeEditPolicy({ actor: { role: 'manager' }, previous, now }), /কারণ/);
  const reason = gradeEditPolicy({ actor: { role: 'manager' }, previous, reason: 'পুনঃমূল্যায়ন', now });
  const db = { version: 1, exams: [], attempts: [] };
  appendGradeAudit(db, { examId: 'E', studentId: 'S', actor: { role: 'manager', id: 'M' }, before: previous, after: { score: 3 }, reason, at: now });
  assert.equal(db.auditLog[0].who, 'M'); assert.equal(db.auditLog[0].before.score, 2);
});
