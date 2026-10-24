/* Academics → teacher-assignment chain, rebuilt after the 2026-10-11 line-by-line
   audit (ACADEMICS-ASSIGNMENT-AUDIT-2026-10-11.md).

   The audit was findings-only: F1 (an Admin-created class could never receive an
   assignment), F2 (a row could not be edited, and the one silent "edit" path
   destroyed subjects), F3 (a disabled subject froze the row that carried it),
   F4 (one renamed class bricked every teacher's assignment list) and F5 (two
   subjects were guaranteed to share one paper code). Each rule below is the
   repro from that audit, written as a test so the fix cannot quietly walk back. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession } from './staff-harness.mjs';
import {
  TEACHER_ASSIGNMENTS_KEY, listTeacherAssignments, saveTeacherAssignment,
  deleteAssignmentSubject, subjectsForTeacherClass
} from '../js/teacher-assignments.js';
import { saveClass, saveSubject, setClassSubjectByName, subjectCodeFor, listClasses, isSubjectEnabled, ACADEMICS_KEY, ACADEMICS_VERSION } from '../js/academics.js';
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

/* The Academic Setup writer is Admin-only; the assignment store is Manager's.
   Swap the session for the setup call, then hand it back. */
async function asAdmin(run) {
  const managerSession = ctx.window.localStorage.getItem(STAFF_ACCOUNTS.manager.sessionKey);
  ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.manager.sessionKey);
  seedStaffSession(ctx.window, 'admin');
  try { return await run(); } finally {
    ctx.window.localStorage.removeItem(STAFF_ACCOUNTS.admin.sessionKey);
    if (managerSession) ctx.window.localStorage.setItem(STAFF_ACCOUNTS.manager.sessionKey, managerSession);
  }
}

test('F1 — a class the Admin created can receive a teacher assignment', async () => {
  /* 'সপ্তম শ্রেণি' is not one of the shipped config classes; it exists only
     because the Admin set it up. That is exactly the case the writer used to
     reject — it validated the CLASS NAME against the SUBJECT list. */
  await asAdmin(async () => {
    await saveClass({ name: 'সপ্তম শ্রেণি' });
    await setClassSubjectByName('সপ্তম শ্রেণি', 'গণিত', true);
  });
  assert.ok(listClasses().some(item => item.name === 'সপ্তম শ্রেণি'), 'the class exists in the Academic Setup');
  assert.equal(isSubjectEnabled('সপ্তম শ্রেণি', 'গণিত'), true, 'the mapping is live');
  await saveTeacherAssignment({ className: 'সপ্তম শ্রেণি', subjects: ['গণিত'] });
  assert.deepEqual(listTeacherAssignments('teacher.apc').map(item => item.className), ['সপ্তম শ্রেণি']);
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'সপ্তম শ্রেণি'), ['গণিত'], 'and the teacher reads it back');
});

test('F2 — an existing row is edited through its id, and a nameless save never rewrites one', async () => {
  /* The row already carries ['গণিত'] from the F1 case. A second save that names no
     row used to be refused for overlapping ticks AND silently destroy the row
     when they did not overlap. Both are now explicit: read-only re-submit is
     refused, and the change itself goes through the row id. */
  await assert.rejects(saveTeacherAssignment({ className: 'সপ্তম শ্রেণি', subjects: ['গণিত'] }), /আগে থেকেই আছে/);
  assert.equal(rows().length, 1, 'a repeated save does not add a second row');

  const [row] = listTeacherAssignments('teacher.apc');
  await asAdmin(async () => { await setClassSubjectByName('সপ্তম শ্রেণি', 'বিজ্ঞান', true); });
  const updated = await saveTeacherAssignment({ id: row.id, className: 'সপ্তম শ্রেণি', subjects: ['বিজ্ঞান'] });
  assert.equal(updated.length, 1, 'the edit replaces the row instead of adding one');
  assert.deepEqual(updated[0].subjects, ['বিজ্ঞান'], 'the row now carries exactly the ticked subjects');
  assert.equal(updated[0].id, row.id, 'same stable id — history keeps pointing at the row');

  /* A disjoint save that names no row must not destroy the subjects on the row
     it lands on. */
  await saveTeacherAssignment({ className: 'নবম শ্রেণি', subjects: ['বাংলা'] });
  const ninth = listTeacherAssignments('teacher.apc').find(item => item.className === 'নবম শ্রেণি');
  await assert.rejects(saveTeacherAssignment({ className: 'নবম শ্রেণি', subjects: ['ইংরেজি'] }), /আগে থেকেই আছে/);
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'নবম শ্রেণি'), ['বাংলা'], 'the untouched row keeps its subject');
  await saveTeacherAssignment({ id: ninth.id, className: 'নবম শ্রেণি', subjects: ['বাংলা', 'ইংরেজি'] });
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'নবম শ্রেণি').slice().sort(), ['বাংলা', 'ইংরেজি'].sort(), 'extending through the id works');
});

test('F3 — disabling a subject does not freeze the row that already carries it', async () => {
  ctx.window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
    { id: 'TAS-F3', teacherUsername: 'teacher.apc', teacherName: 'Rahim Uddin', className: 'সপ্তম শ্রেণি', group: '', subjects: ['গণিত', 'বিজ্ঞান'], subject: 'গণিত, বিজ্ঞান' }
  ]));
  await asAdmin(async () => { await setClassSubjectByName('সপ্তম শ্রেণি', 'গণিত', false); });
  assert.equal(isSubjectEnabled('সপ্তম শ্রেণি', 'গণিত'), false, 'Admin turned one subject off');
  /* Removing the OTHER subject used to be refused, because every subject still
     on the row was re-validated against the Admin setup. */
  await deleteAssignmentSubject('TAS-F3', 'বিজ্ঞান');
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'সপ্তম শ্রেণি'), ['গণিত'], 'the row stays editable and keeps its history');
  /* The other half of the rule: a subject the class never ran is still refused,
     and it is refused for the reason that is actually true. */
  await assert.rejects(saveTeacherAssignment({ className: 'দশম শ্রেণি', subjects: ['অবৈধ বিষয়'] }), error => error.message.includes('চালু নেই'));
  await deleteAssignmentSubject('TAS-F3', 'গণিত');
  assert.equal(rows().some(item => item.id === 'TAS-F3'), false, 'the emptied row goes away');
});

test('F4 — a renamed or retired class cannot brick the whole assignment store', async () => {
  ctx.window.localStorage.setItem(TEACHER_ASSIGNMENTS_KEY, JSON.stringify([
    { id: 'TAS-GONE', teacherUsername: 'teacher.apc', teacherName: 'Rahim Uddin', className: 'অষ্টম শ্রেণি (renamed)', group: '', subjects: ['গণিত'], subject: 'গণিত' },
    { id: 'TAS-LIVE', teacherUsername: 'teacher.apc', teacherName: 'Rahim Uddin', className: 'নবম শ্রেণি', group: '', subjects: ['ইংরেজি'], subject: 'ইংরেজি' }
  ]));
  const mine = listTeacherAssignments('teacher.apc');
  assert.deepEqual(mine.map(item => item.id), ['TAS-GONE', 'TAS-LIVE'], 'reads stay total: nothing is dropped, nothing throws');
  assert.deepEqual(subjectsForTeacherClass('teacher.apc', 'নবম শ্রেণি'), ['ইংরেজি'], 'and the healthy rows still answer');
});

test('F5 — two subjects that share a master code do not get the same paper code', () => {
  /* 'ICT' stands for both আইসিটি and তথ্য ও যোগাযোগ প্রযুক্তি in the school's
     master list. The allocation consulted that list first and never consulted
     the codes already in use, so whichever subject asked second was handed a
     code another record already carried. Seeded here so the case is exact and
     independent of whatever the demo data happens to hold. */
  ctx.window.localStorage.setItem(ACADEMICS_KEY, JSON.stringify({
    version: ACADEMICS_VERSION, updatedAt: Date.now(), createdBy: 'TEST',
    classes: [], mappings: [], chapters: [],
    subjects: [
      { id: 'SUBJ-A', name: 'আইসিটি', active: true },
      { id: 'SUBJ-B', name: 'তথ্য ও যোগাযোগ প্রযুক্তি', active: true }
    ]
  }));
  const first = subjectCodeFor('আইসিটি');
  const second = subjectCodeFor('তথ্য ও যোগাযোগ প্রযুক্তি');
  assert.equal(first, 'ICT', 'the master list still answers first for the subject that owns the code');
  assert.ok(second, 'the second subject gets a code too');
  assert.notEqual(first, second, 'no two subjects share one paper code');
});

test('the Manager form drives the row id and preselects what the row already holds', async () => {
  const source = readFileSync(new URL('../js/manager.js', import.meta.url), 'utf8');
  assert.match(source, /saveTeacherAssignment\(\{ id: editingAssignmentId/, 'the submit passes the row being edited');
  assert.match(source, /data-manager-action="edit-teacher-assignment"/, 'every row offers an explicit edit action');
  assert.match(source, /renderTeacherSubjectPicker\(editing\.className, editing\.subjects, \{ preferSelected: true \}\)/, 'the picker shows the stored ticks, not an empty list');
  /* Audit F8: ticks used to ride across a class change. */
  assert.match(source, /preferSelected \|\| pickerClass !== className \? \[\] :/, 'switching class drops the previous class\u2019 ticks');
});
