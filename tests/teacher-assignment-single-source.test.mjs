/* Issue 3 — one shared assignment source (reported 2026-10-19).

   The teacher's PROFILE and every publish gate (homework / suggestion / notice
   / exam) must answer from the same rows at the same moment. Two failure modes
   are pinned here:
     a) the teacher-assignments store is empty (device that never ran the
        projection, or a record saved before the projection bridge) while the
        Staff Directory still carries the record — the merged read must answer
        from the directory, so `isTeacherAssigned` agrees with the profile;
     b) a Super Admin on one device saves an assignment from the Admin session —
        `requireManagerSession` must accept the admin session (super-admin
        authority), not fail with "সক্রিয় Manager profile ছাড়া …". */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import { enabledClasses } from '../js/config.js';
import { subjectsForClass, isSubjectEnabled } from '../js/academics.js';
import { createStaff } from '../js/staff-directory.js';
import {
  TEACHER_ASSIGNMENTS_KEY, listTeacherAssignments, isTeacherAssigned,
  isTeacherAssignedSubject, effectiveTeacherAssignments, saveTeacherAssignment
} from '../js/teacher-assignments.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';

let ctx;
const storeRows = () => JSON.parse(ctx.window.localStorage.getItem(TEACHER_ASSIGNMENTS_KEY) || '[]');

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await provisionStaff('admin');
  seedStaffSession(ctx.window, 'admin');
});
after(() => ctx?.window.close());

test('profile and publish gates share one source even when the store is empty', async () => {
  const className = enabledClasses[0];
  const subject = subjectsForClass(className)[0]?.name;
  assert.ok(subject, `${className} has a live subject in Academic Setup`);

  const created = await createStaff({
    fullName: 'Sadia Islam', role: 'teacher', status: 'active',
    mobile: '01711009901', email: 'sadia@example.com', joiningDate: '2026-02-01',
    password: 'Sadia-2026', confirmPassword: 'Sadia-2026',
    assignment: { classes: [className], subjects: [subject], classSubjects: { [className]: [subject] } }
  });
  assert.equal(created.ok, true, created.error);
  const username = created.staff.username;
  assert.ok(storeRows().some(row => row.teacherUsername === username), 'the projection wrote the store');

  /* Wipe the projection — exactly the "saved before the bridge" state. */
  ctx.window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([]));

  const rows = listTeacherAssignments(username);
  assert.ok(rows.some(row => row.className === className),
    'the merged read answers from the Staff Directory without the store');
  assert.equal(isTeacherAssigned(username, className), true,
    'publish gate agrees with the profile: class is assigned');
  assert.equal(isTeacherAssignedSubject(username, className, subject), true,
    'publish gate agrees on the subject too');
  assert.equal(isSubjectEnabled(className, subject), true, 'the subject is live in Academic Setup');
  const eff = await effectiveTeacherAssignments(username);
  assert.ok(eff.some(row => row.className === className), 'the async merged read agrees as well');
  assert.notEqual(username, 'teacher.apc', 'a real directory login, not the device placeholder');
  assert.equal(isTeacherAssigned('some.other.teacher.apc', className), false,
    'another teacher never inherits the record');
});

test('a super-admin (admin session) can save a teacher assignment', async () => {
  /* No manager session and no device manager account — only the admin
     session from the before() hook. This is the super-admin entry that used to
     fail with "সক্রিয় Manager profile ছাড়া assignment পরিবর্তন করা যাবে না।" */
  assert.equal(ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey), null, 'no manager session');
  const className = enabledClasses[1] || enabledClasses[0];
  const subject = subjectsForClass(className)[0]?.name;
  assert.ok(subject, `${className} has a live subject`);
  const teacherUsername = 'teacher.apc';
  ctx.window.localStorage.setItem(STAFF_ACCOUNTS.teacher.accountKey, JSON.stringify({
    role: 'teacher', username: teacherUsername, fullName: 'Rahim Uddin', status: 'active'
  }));

  const saved = await saveTeacherAssignment({ className, subjects: [subject], teacherUsername });
  assert.ok(Array.isArray(saved) && saved.some(row => row.teacherUsername === teacherUsername && row.className === className),
    'the assignment is stored under the admin session');
  assert.equal(isTeacherAssigned(teacherUsername, className), true, 'the gate sees it immediately');
});
