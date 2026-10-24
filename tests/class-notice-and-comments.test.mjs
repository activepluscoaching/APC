import test from 'node:test';
import assert from 'node:assert/strict';
import { teachingRepository as repo, TEACHING_KEY } from '../js/teaching-data.js';
import { adminStudents } from '../js/admin-data.js';
import { STORAGE_KEYS, enabledClasses } from '../js/config.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { noticeScopeMatches } from '../js/notification-rules.js';

const student = adminStudents[0];

function setup() {
  const assignments = enabledClasses.map((className, index) => ({
    id: `TAS-${index}`,
    teacherUsername: 'teacher.apc',
    teacherName: 'Test Teacher',
    className,
    group: '',
    subject: 'গণিত'
  }));
  const storage = new Map([
    [ROSTER_KEY, JSON.stringify(adminStudents)],
    [TEACHER_ASSIGNMENTS_KEY, JSON.stringify(assignments)],
    [STAFF_ACCOUNTS.teacher.accountKey, JSON.stringify({ role: 'teacher', username: 'teacher.apc', fullName: 'Test Teacher', status: 'active' })],
    [STAFF_ACCOUNTS.manager.accountKey, JSON.stringify({ role: 'manager', username: 'manager.apc', fullName: 'Test Manager', status: 'active' })],
    [STORAGE_KEYS.account, JSON.stringify({ status: 'active', student })]
  ]);
  const sessions = new Map([
    [STAFF_ACCOUNTS.teacher.sessionKey, '1'],
    [STAFF_ACCOUNTS.manager.sessionKey, '1'],
    [STORAGE_KEYS.session, '1']
  ]);
  globalThis.window = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    sessionStorage: {
      getItem: key => sessions.get(key) ?? null,
      setItem: (key, value) => sessions.set(key, value),
      removeItem: key => sessions.delete(key)
    },
    dispatchEvent: () => {}
  };
  return { storage };
}

test('student submits homework written answer (<=500 chars) and teacher marks reviewed with comment (<=200 chars)', async () => {
  setup();
  let db = await repo.saveActivity({
    type: 'homework',
    title: 'সমীকরণ সমাধান',
    subject: 'গণিত',
    className: student.className,
    group: student.group,
    date: '2026-10-13',
    time: '17:00',
    status: 'published',
    details: '১ থেকে ৫ নং অংক করো'
  });
  const hwId = db.activities[0].id;

  // Rejects answer > 500 chars
  await assert.rejects(
    repo.markHomeworkDone(hwId, student, { answer: 'ক'.repeat(501) }),
    /৫০০ অক্ষর/
  );

  // Accepts answer <= 500 chars and preserves attachmentUrl field
  const studentSnap = await repo.markHomeworkDone(hwId, student, {
    answer: 'x = 5 এবং y = 3 পাওয়া গেছে।',
    attachmentUrl: ''
  });
  const prog = studentSnap.activities[0].progress[student.id];
  assert.equal(prog.value, 'done');
  assert.equal(prog.answer, 'x = 5 এবং y = 3 পাওয়া গেছে।');
  assert.equal(prog.attachmentUrl, '');

  // Teacher rejects comment > 200 chars
  await assert.rejects(
    repo.saveProgress(hwId, { [student.id]: { value: 'reviewed', comment: 'ম'.repeat(201) } }),
    /২০০ অক্ষর/
  );

  // Teacher marks "দেখা হয়েছে" ('reviewed') and leaves a comment <= 200 chars
  await repo.saveProgress(hwId, {
    [student.id]: { value: 'reviewed', comment: 'চমৎকার সমাধান! এভাবেই অনুশীলন চালিয়ে যাও।' }
  });

  const viewForStudent = await repo.listForStudent(student.id);
  const finalProg = viewForStudent.activities[0].progress[student.id];
  assert.equal(finalProg.value, 'reviewed');
  assert.equal(finalProg.answer, 'x = 5 এবং y = 3 পাওয়া গেছে।');
  assert.equal(finalProg.comment, 'চমৎকার সমাধান! এভাবেই অনুশীলন চালিয়ে যাও।');
});

test('teacher class-section notice reaches only matching class-section students', () => {
  const notice = {
    id: 'notice-1',
    title: 'আগামীকাল অতিরিক্ত ক্লাস',
    body: 'সকাল ১০টায় গণিত অতিরিক্ত ক্লাস হবে।',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    classId: 'দশম শ্রেণি',
    sectionId: 'বিজ্ঞান',
    status: 'published'
  };
  assert.equal(noticeScopeMatches(notice, { className: 'দশম শ্রেণি', group: 'বিজ্ঞান' }), true);
  assert.equal(noticeScopeMatches(notice, { className: 'দশম শ্রেণি', group: 'মানবিক' }), false);
  assert.equal(noticeScopeMatches(notice, { className: 'নবম শ্রেণি', group: 'বিজ্ঞান' }), false);
});
