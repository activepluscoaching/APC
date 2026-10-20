import test from 'node:test';
import assert from 'node:assert/strict';
import {
  teachingRepository as repo,
  setTeachingScope,
  currentTeacherId,
  resolveTeacherName
} from '../js/teaching-data.js';
import { examRepository, examTemplate, TEACHER_ACTOR } from '../js/exam-data.js';
import { STAFF_ACCOUNTS, saveStaffSession, readActiveStaffIdentity } from '../js/staff-auth.js';
import { STAFF_DIRECTORY_KEY } from '../js/staff-directory.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { STORAGE_KEYS } from '../js/config.js';
import { adminStudents } from '../js/admin-data.js';

function createEnv() {
  const student = { ...adminStudents[0], className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', status: 'approved' };
  const directory = {
    version: 1,
    records: [
      {
        id: 'staff-1',
        staffId: 'STF-0005',
        kind: 'directory',
        role: 'teacher',
        fullName: 'রহিম উদ্দিন স্যার',
        username: 'rahim.teacher.apc',
        mobile: '01711112222',
        status: 'active',
        assignment: {
          classes: ['দশম শ্রেণি'],
          subjects: ['গণিত'],
          batches: ['বিজ্ঞান'],
          classSubjects: { 'দশম শ্রেণি': ['গণিত'] }
        }
      },
      {
        id: 'staff-2',
        staffId: 'STF-0006',
        kind: 'directory',
        role: 'teacher',
        fullName: 'সালমা খাতুন ম্যাডাম',
        username: 'salma.teacher.apc',
        mobile: '01733334444',
        status: 'active',
        assignment: {
          classes: ['নবম শ্রেণি'],
          subjects: ['ইংরেজি'],
          batches: [],
          classSubjects: { 'নবম শ্রেণি': ['ইংরেজি'] }
        }
      }
    ]
  };
  const assignments = [
    {
      id: 'TAS-R1',
      teacherUsername: 'rahim.teacher.apc',
      teacherName: 'রহিম উদ্দিন স্যার',
      staffId: 'STF-0005',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান',
      subject: 'গণিত',
      subjects: ['গণিত']
    },
    {
      id: 'TAS-S1',
      teacherUsername: 'salma.teacher.apc',
      teacherName: 'সালমা খাতুন ম্যাডাম',
      staffId: 'STF-0006',
      className: 'নবম শ্রেণি',
      group: '',
      subject: 'ইংরেজি',
      subjects: ['ইংরেজি']
    }
  ];
  const storage = new Map([
    [ROSTER_KEY, JSON.stringify([student])],
    [STAFF_DIRECTORY_KEY, JSON.stringify(directory)],
    [TEACHER_ASSIGNMENTS_KEY, JSON.stringify(assignments)],
    [STORAGE_KEYS.account, JSON.stringify({ status: 'active', student })]
  ]);
  const sessions = new Map([[STORAGE_KEYS.session, '1']]);
  globalThis.window = {
    localStorage: {
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    sessionStorage: {
      getItem: k => sessions.get(k) ?? null,
      setItem: (k, v) => sessions.set(k, String(v)),
      removeItem: k => sessions.delete(k)
    },
    dispatchEvent: () => true
  };
  return { storage, sessions, student, directory };
}

test('Staff Directory teacher session carries staffId and stamps teacherId on activities and exams', async () => {
  const { storage, student, directory } = createEnv();
  await saveStaffSession('teacher', false, {
    username: 'rahim.teacher.apc',
    staffId: 'STF-0005',
    fullName: 'রহিম উদ্দিন স্যার'
  });
  setTeachingScope('rahim.teacher.apc', 'STF-0005');

  const identity = readActiveStaffIdentity();
  assert.equal(identity?.staffId, 'STF-0005');
  assert.equal(currentTeacherId(), 'STF-0005');

  // Cannot create activity for unassigned class or unassigned subject
  await assert.rejects(
    repo.saveActivity({
      type: 'homework',
      title: 'ইংরেজি কাজ',
      subject: 'ইংরেজি',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান',
      date: '2026-10-20',
      time: '17:00',
      status: 'published',
      details: 'Chapter 1'
    }),
    /বিষয়ে আপনার ম্যানেজার অ্যাসাইনমেন্ট নেই/
  );

  const saved = await repo.saveActivity({
    type: 'homework',
    title: 'বীজগণিত অনুশীলন',
    subject: 'গণিত',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    date: '2026-10-20',
    time: '17:00',
    status: 'published',
    details: 'অনুশীলনী ৩.১'
  });
  assert.equal(saved.activities.length, 1);
  assert.equal(saved.activities[0].teacherId, 'STF-0005');

  // Exam also stamps STF-0005
  const examSnap = await examRepository.saveDraft({
    type: 'mcq',
    title: 'বীজগণিত কুইজ',
    subject: 'গণিত',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান',
    startAt: Date.now() + 3600000,
    endAt: Date.now() + 7200000,
    template: examTemplate('mcq')
  }, TEACHER_ACTOR);
  assert.equal(examSnap.exams[0].teacherId, 'STF-0005');

  // Another teacher (STF-0006) does not see STF-0005's work
  await saveStaffSession('teacher', false, {
    username: 'salma.teacher.apc',
    staffId: 'STF-0006',
    fullName: 'সালমা খাতুন ম্যাডাম'
  });
  setTeachingScope('salma.teacher.apc', 'STF-0006');
  const salmaActivities = await repo.list({ role: 'teacher' });
  assert.equal(salmaActivities.activities.length, 0);
  const salmaExams = await examRepository.list({ role: 'teacher' });
  assert.equal(salmaExams.exams.length, 0);

  // Student sees teacherName dynamically resolved from teacherId (STF-0005)
  directory.records[0].fullName = 'প্রফেসর রহিম উদ্দিন';
  storage.set(STAFF_DIRECTORY_KEY, JSON.stringify(directory));
  assert.equal(resolveTeacherName('STF-0005', 'পুরোনো নাম'), 'প্রফেসর রহিম উদ্দিন');
  const studentView = await repo.listForStudent(student.id);
  assert.equal(studentView.activities[0].teacherName, 'প্রফেসর রহিম উদ্দিন');
});
