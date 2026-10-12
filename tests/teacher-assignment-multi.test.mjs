/* Teacher assignment — one Teacher + Class row carrying every subject.
   Older single-subject records must keep working, and a subject the Admin has
   not enabled for that class must not be handed out again. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import {
  TEACHER_ASSIGNMENTS_KEY, listTeacherAssignments, teacherScope, assignedClasses,
  subjectsForTeacherClass, isTeacherAssigned, isTeacherAssignedSubject,
  saveTeacherAssignment, deleteTeacherAssignment, deleteAssignmentSubject, selectableSubjects
} from '../js/teacher-assignments.js';
import { isSubjectEnabled, setClassSubjectByName } from '../js/academics.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';

let ctx;
const rows = () => JSON.parse(ctx.window.localStorage.getItem(TEACHER_ASSIGNMENTS_KEY) || '[]');

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  await provisionStaff('manager');
  ctx.window.localStorage.setItem(STAFF_ACCOUNTS.teacher.accountKey, JSON.stringify({ role: 'teacher', username: 'teacher.apc', fullName: 'Rahim Uddin', status: 'active' }));
  seedStaffSession(ctx.window, 'manager');
  await provisionStaff('admin');
});
after(() => ctx?.window.close());

async function asAdmin(run) {
  const staff = await import('../js/staff-auth.js');
  const managerSession = ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey);
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.manager.sessionKey);
  seedStaffSession(ctx.window, 'admin');
  try { return await run(); } finally {
    ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.admin.sessionKey);
    if (managerSession) ctx.window.localStorage.setItem(STAFF_ACCOUNTS.manager.sessionKey, managerSession);
    void staff;
  }
}

test('a legacy single-subject assignment still answers every question', async () => {
  ctx.window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
    { id: 'TAS-OLD', teacherUsername: 'teacher.apc', teacherName: 'Rahim Uddin', className: 'দশম শ্রেণি', group: '', subject: 'গণিত' }
  ]));
  const [record] = listTeacherAssignments('teacher.apc');
  assert.deepEqual(record.subjects, ['গণিত']);
  assert.equal(record.subject, 'গণিত', 'the legacy field stays for older readers');
  assert.equal(isTeacherAssigned('teacher.apc', 'দশম শ্রেণি'), true);
  assert.equal(isTeacherAssignedSubject('teacher.apc', 'দশম শ্রেণি', 'গণিত'), true);
  assert.equal(isTeacherAssignedSubject('teacher.apc', 'দশম শ্রেণি', 'রসায়ন'), false);
  assert.deepEqual(assignedClasses('teacher.apc'), ['দশম শ্রেণি']);
  assert.deepEqual(assignedClasses('teacher.apc', 'রসায়ন'), []);
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'দশম শ্রেণি'), ['গণিত']);
  assert.deepEqual(teacherScope('teacher.apc')[0].subjects, ['গণিত']);
});

test('one Teacher + Class row takes several subjects, and duplicates are refused', async () => {
  await saveTeacherAssignment({ id: 'TAS-OLD', className: 'দশম শ্রেণি', subjects: ['গণিত', 'রসায়ন'] });
  const [record] = listTeacherAssignments('teacher.apc');
  assert.deepEqual(record.subjects, ['গণিত', 'রসায়ন']);
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'দশম শ্রেণি'), ['গণিত', 'রসায়ন']);
  assert.equal(rows().length, 1, 'one row per Teacher + Class, not one per subject');
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subjects: ['গণিত'] }), /আগে থেকেই আছে/);
  /* Adding history/statistics as a second class keeps the first untouched. */
  await saveTeacherAssignment({ className: 'নবম শ্রেণি', subjects: ['ইংরেজি'] });
  assert.deepEqual(assignedClasses('teacher.apc').sort(), ['নবম শ্রেণি', 'দশম শ্রেণি'].sort());
  assert.equal(listTeacherAssignments('teacher.apc').length, 2);
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'নবম শ্রেণি'), ['ইংরেজি']);
});

test('a subject the Admin has not enabled for the class cannot be assigned', async () => {
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subjects: ['কৃষিশিক্ষা'] }), /চালু নেই/);
  await asAdmin(() => setClassSubjectByName('দশম শ্রেণি', 'কৃষিশিক্ষা', true));
  assert.equal(isSubjectEnabled('দশম শ্রেণি', 'কৃষিশিক্ষা'), true);
  await saveTeacherAssignment({ id: listTeacherAssignments('teacher.apc').find(item => item.className === 'দশম শ্রেণি').id, className: 'দশম শ্রেণি', subjects: ['গণিত', 'কৃষিশিক্ষা'] });
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'দশম শ্রেণি'), ['গণিত', 'কৃষিশিক্ষা']);
  /* Admin switches it off again: the stored assignment keeps working, but no
     new assignment may pick it. */
  await asAdmin(() => setClassSubjectByName('দশম শ্রেণি', 'কৃষিশিক্ষা', false));
  assert.equal(isTeacherAssignedSubject('teacher.apc', 'দশম শ্রেণি', 'কৃষিশিক্ষা'), true, 'history is untouched');
  await assert.rejects(saveTeacherAssignment({ id: 'TAS-NEW', className: 'নবম শ্রেণি', subjects: ['কৃষিশিক্ষা'] }), /চালু নেই/);
});

test('a subject can be dropped from a row, and the row disappears when empty', async () => {
  const tenth = listTeacherAssignments('teacher.apc').find(item => item.className === 'দশম শ্রেণি');
  await deleteAssignmentSubject(tenth.id, 'কৃষিশিক্ষা');
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'দশম শ্রেণি'), ['গণিত']);
  await deleteAssignmentSubject(tenth.id, 'গণিত');
  assert.equal(listTeacherAssignments('teacher.apc').some(item => item.className === 'দশম শ্রেণি'), false);
  assert.equal(isTeacherAssigned('teacher.apc', 'দশম শ্রেণি'), false);
  const ninth = listTeacherAssignments('teacher.apc').find(item => item.className === 'নবম শ্রেণি');
  await deleteTeacherAssignment(ninth.id);
  assert.deepEqual(listTeacherAssignments('teacher.apc'), []);
});

test('the picker offers the Admin-enabled subjects plus whatever the record already had', async () => {
  ctx.window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
    { id: 'TAS-LEGACY', teacherUsername: 'teacher.apc', teacherName: 'Rahim Uddin', className: 'একাদশ শ্রেণি', group: '', subject: 'Old Free Text' }
  ]));
  const options = selectableSubjects('একাদশ শ্রেণি', { includeLegacy: ['Old Free Text'] });
  assert.ok(options.includes('গণিত'), 'the class subjects come from the Admin structure');
  assert.ok(options.includes('Old Free Text'), 'a legacy value stays selectable so no record is stranded');
  await assert.rejects(saveTeacherAssignment({ className: 'একাদশ শ্রেণি', subjects: [] }), /অন্তত একটি বিষয়/);
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subjects: ['গণিত', 'রসায়ন', ...Array.from({ length: 30 }, (_, index) => `Extra ${index}`)] }), /সর্বোচ্চ ৩০/);
});

test('only a Manager session may change assignments', async () => {
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.manager.sessionKey);
  ctx.window.sessionStorage.clear();
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subjects: ['গণিত'] }), /Manager/);
  await assert.rejects(deleteTeacherAssignment('TAS-LEGACY'), /Manager/);
  seedStaffSession(ctx.window, 'manager');
  assert.ok(rows().length >= 1, 'nothing was dropped by the refused calls');
});
