import test from 'node:test';
import assert from 'node:assert/strict';
import { teachingRepository as repo, setTeachingScope } from '../js/teaching-data.js';
import { saveStaffSession } from '../js/staff-auth.js';
import { STAFF_DIRECTORY_KEY } from '../js/staff-directory.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { ROSTER_KEY, ROUTINE_KEY, blankRoutine } from '../js/office-data.js';
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
        status: 'active',
        assignment: { classes: ['দশম শ্রেণি'], subjects: ['গণিত', 'পদার্থবিজ্ঞান'], classSubjects: { 'দশম শ্রেণি': ['গণিত', 'পদার্থবিজ্ঞান'] } }
      }
    ]
  };
  const assignments = [
    {
      id: 'TAS-1',
      teacherUsername: 'rahim.teacher.apc',
      teacherName: 'রহিম উদ্দিন স্যার',
      staffId: 'STF-0005',
      className: 'দশম শ্রেণি',
      group: '',
      subject: 'গণিত, পদার্থবিজ্ঞান',
      subjects: ['গণিত', 'পদার্থবিজ্ঞান']
    }
  ];
  const routine = blankRoutine();
  // 2026-10-17 is a Saturday ('sat')
  routine.sat.classes.push({
    id: 'RTN-SLOT-1',
    className: 'দশম শ্রেণি',
    classId: 'দশম শ্রেণি',
    group: 'বিজ্ঞান',
    sectionId: 'বিজ্ঞান',
    subject: 'গণিত',
    teacher: 'রহিম উদ্দিন স্যার',
    teacherName: 'রহিম উদ্দিন স্যার',
    teacherId: 'STF-0005',
    room: 'রুম ১০১',
    time: '১০:০০',
    rawTime: '10:00',
    duration: 60,
    period: 'সকাল',
    status: 'published'
  });

  const storage = new Map([
    [ROSTER_KEY, JSON.stringify([student])],
    [STAFF_DIRECTORY_KEY, JSON.stringify(directory)],
    [TEACHER_ASSIGNMENTS_KEY, JSON.stringify(assignments)],
    [ROUTINE_KEY, JSON.stringify(routine)],
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
  return { storage, student };
}

test('weekly routine slot blocks conflicting extra class at the same time, but allows opening its own date-session and non-overlapping extra classes', async () => {
  const { student } = createEnv();
  await saveStaffSession('teacher', false, {
    username: 'rahim.teacher.apc',
    staffId: 'STF-0005',
    fullName: 'রহিম উদ্দিন স্যার'
  });
  setTeachingScope('rahim.teacher.apc', 'STF-0005');

  // 2026-10-17 is Saturday; weekly routine slot is 10:00-11:00 for STF-0005.
  // Adding a DIFFERENT extra class at 10:30 on Saturday must fail with weekly routine conflict.
  await assert.rejects(
    repo.saveActivity({
      type: 'routine',
      title: 'বিশেষ ক্লাস',
      subject: 'পদার্থবিজ্ঞান',
      className: 'দশম শ্রেণি',
      group: 'বিজ্ঞান',
      date: '2026-10-17',
      time: '10:30',
      duration: 60,
      room: 'রুম ১০২',
      status: 'published',
      details: 'ভেক্টর'
    }),
    /সাপ্তাহিক রুটিনে আপনার আরেকটি ক্লাস আছে/
  );

  // Opening a date-session FOR that weekly routine slot (routineSlotId = 'RTN-SLOT-1') succeeds and takes attendance
  const sessionDb = await repo.saveActivity({
    type: 'routine',
    routineSlotId: 'RTN-SLOT-1',
    title: 'গণিত — উপস্থিতি সেশন',
    subject: 'গণিত',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান',
    date: '2026-10-17',
    time: '10:00',
    duration: 60,
    room: 'রুম ১০১',
    status: 'published',
    details: 'ত্রিকোণমিতি অধ্যায় ৯'
  });
  const sessionAct = sessionDb.activities[0];
  assert.equal(sessionAct.routineSlotId, 'RTN-SLOT-1');
  assert.equal(sessionAct.teacherId, 'STF-0005');

  const withAttendance = await repo.saveProgress(sessionAct.id, { [student.id]: 'present' });
  assert.equal(withAttendance.activities[0].progress[student.id].value, 'present');

  // Non-overlapping one-off extra class at 15:00 succeeds
  const extraDb = await repo.saveActivity({
    type: 'routine',
    title: 'একদিনের বিশেষ ক্লাস — পদার্থবিজ্ঞান',
    subject: 'পদার্থবিজ্ঞান',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান',
    date: '2026-10-17',
    time: '15:00',
    duration: 60,
    room: 'রুম ১০৫',
    status: 'published',
    details: 'গতিবিদ্যা রিভিশন'
  });
  assert.equal(extraDb.activities.length, 2);
});
