import test from 'node:test';
import assert from 'node:assert/strict';
import { enabledClasses } from '../js/config.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { TEACHER_ASSIGNMENTS_KEY, listTeacherAssignments, isTeacherAssigned, saveTeacherAssignment, deleteTeacherAssignment } from '../js/teacher-assignments.js';

function setup(role = 'manager') {
  const store = new Map([
    [STAFF_ACCOUNTS.teacher.accountKey, JSON.stringify({ role: 'teacher', username: 'teacher.apc', fullName: 'Teacher profile', status: 'active' })],
    [STAFF_ACCOUNTS.manager.accountKey, JSON.stringify({ role: 'manager', username: 'manager.apc', fullName: 'Manager profile', status: 'active' })]
  ]);
  const sessions = new Map([[STAFF_ACCOUNTS[role].sessionKey, '1']]);
  globalThis.window = {
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    sessionStorage: { getItem: key => sessions.get(key) ?? null, setItem: (key, value) => sessions.set(key, value), removeItem: key => sessions.delete(key) },
    dispatchEvent() {}
  };
  return { store, sessions };
}

test('Manager assignment controls persist class, batch/group and subject; reads are teacher-specific', async () => {
  const env = setup('manager');
  await assert.rejects(saveTeacherAssignment({ className: 'সপ্তম শ্রেণি', subject: 'গণিত' }));
  const rows = await saveTeacherAssignment({ className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', subject: 'গণিত' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].teacherUsername, 'teacher.apc');
  assert.deepEqual(listTeacherAssignments('other.teacher'), []);
  assert.equal(isTeacherAssigned('teacher.apc', 'দশম শ্রেণি', 'বিজ্ঞান'), true);
  assert.equal(isTeacherAssigned('teacher.apc', 'দশম শ্রেণি', 'মানবিক'), false);
  assert.equal(isTeacherAssigned('teacher.apc', enabledClasses[0], ''), false);
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', group: 'বিজ্ঞান', subject: 'গণিত' }), /আগে থেকেই/);
  await deleteTeacherAssignment(rows[0].id);
  assert.deepEqual(listTeacherAssignments('teacher.apc'), []);
  assert.equal(env.store.has(TEACHER_ASSIGNMENTS_KEY), true);
});

test('Teacher or logged-out callers cannot grant or revoke Manager assignments', async () => {
  setup('teacher');
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subject: 'গণিত' }), /শুধু Manager/);
  await assert.rejects(deleteTeacherAssignment('anything'), /শুধু Manager/);
  setup('teacher');
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subject: 'গণিত' }), /শুধু Manager/);
});

test('corrupt assignment storage fails closed and remains untouched', async () => {
  const env = setup('manager');
  env.store.set(TEACHER_ASSIGNMENTS_KEY, '{bad');
  assert.throws(() => listTeacherAssignments('teacher.apc'), /সংরক্ষিত তথ্য/);
  assert.equal(env.store.get(TEACHER_ASSIGNMENTS_KEY), '{bad');
});
