import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStudentHomeStats, initStudentDashboard } from '../js/student-dashboard.js';
import { loadPage } from './jsdom-harness.mjs';
import { blankRoutine, ROUTINE_KEY } from '../js/office-data.js';
import { TEACHING_KEY } from '../js/teaching-data.js';
import { COURSES_KEY } from '../js/course-data.js';
import { KEYS } from '../js/database.js';
import { STORAGE_KEYS } from '../js/config.js';

const student = { id: 'STD-100', name: 'রহিম', className: 'দশম শ্রেণি', group: 'বিজ্ঞান' };

test('calculateStudentHomeStats returns em-dash and empty study message when no data exists', () => {
  const stats = calculateStudentHomeStats({ student, activities: [], examDb: { exams: [], attempts: [] }, courses: [] });
  assert.equal(stats.attendancePercent, null);
  assert.equal(stats.attendanceLabel, '—');
  assert.equal(stats.averageResultPercent, null);
  assert.equal(stats.averageResultLabel, '—');
  assert.equal(stats.weeklyProgressPercent, null);
  assert.equal(stats.weeklyProgressLabel, '—');
  assert.equal(stats.termProgressPercent, null);
  assert.equal(stats.termProgressLabel, '—');
  assert.equal(stats.doneCount, 0);
  assert.equal(stats.pendingCount, 0);
  assert.equal(stats.todayStudy.kind, 'empty');
});

test('calculateStudentHomeStats computes real weekly progress, attendance %, average result, term progress, and today study', () => {
  const now = new Date('2026-10-13T10:00:00Z');
  const activities = [
    {
      id: 'HW-1',
      type: 'homework',
      title: 'বীজগণিত অনুশীলন',
      subject: 'গণিত',
      date: '2026-10-12',
      progress: { 'STD-100': { value: 'done' } }
    },
    {
      id: 'HW-2',
      type: 'homework',
      title: 'গতি অধ্যায় কাজ',
      subject: 'পদার্থবিজ্ঞান',
      date: '2026-10-13',
      progress: {}
    },
    {
      id: 'RT-1',
      type: 'routine',
      title: 'ক্লাস ১',
      subject: 'গণিত',
      date: '2026-10-11',
      progress: { 'STD-100': { value: 'present' } }
    },
    {
      id: 'RT-2',
      type: 'routine',
      title: 'ক্লাস ২',
      subject: 'পদার্থবিজ্ঞান',
      date: '2026-10-12',
      progress: { 'STD-100': { value: 'absent' } }
    },
    {
      id: 'EX-1',
      type: 'exam',
      title: 'কুইজ ১',
      subject: 'গণিত',
      totalMarks: 20,
      progress: { 'STD-100': { value: 16 } } // 80%
    }
  ];
  const examDb = {
    exams: [{ id: 'ON-1', totalMarks: 50, questions: [{ marks: 50 }] }],
    attempts: [{ examId: 'ON-1', studentId: 'STD-100', status: 'submitted', score: 45, total: 50 }] // 90%
  };
  const courses = [
    {
      id: 'CRS-1',
      subject: 'গণিত',
      chapters: [
        { id: 'CH-1', title: 'অধ্যায় ১', status: 'শেষ' },
        { id: 'CH-2', title: 'অধ্যায় ২', status: 'চলছে' }
      ]
    }
  ];

  const stats = calculateStudentHomeStats({ student, activities, examDb, courses, now });
  assert.equal(stats.doneCount, 1);
  assert.equal(stats.pendingCount, 1);
  // Attendance: 1 present out of 2 sessions = 50%
  assert.equal(stats.attendancePercent, 50);
  assert.equal(stats.attendanceLabel, '৫০%');
  // Average result: (80% + 90%) / 2 = 85%
  assert.equal(stats.averageResultPercent, 85);
  assert.equal(stats.averageResultLabel, '৮৫%');
  // Weekly progress: 4 items in last 7 days (HW-1 done, HW-2 pending, RT-1 present, RT-2 absent) -> 2/4 = 50%
  assert.equal(stats.weeklyProgressPercent, 50);
  assert.equal(stats.weeklyProgressLabel, '৫০%');
  // Term progress: (1 completed chapter + 1 done homework) / (2 chapters + 2 homework) = 2/4 = 50%
  assert.equal(stats.termProgressPercent, 50);
  assert.equal(stats.termProgressLabel, '৫০%');
  // Today's study: pending homework HW-2
  assert.equal(stats.todayStudy.kind, 'homework');
  assert.equal(stats.todayStudy.title, 'গতি অধ্যায় কাজ');
});

test('Home view renders real stats and shows em-dash when empty', async () => {
  const seed = {
    'activePlus.demo.autofill.v1': 'off',
    [ROUTINE_KEY]: JSON.stringify(blankRoutine()),
    [TEACHING_KEY]: JSON.stringify({ version: 1, activities: [] }),
    [COURSES_KEY]: JSON.stringify({ version: 1, courses: [] }),
    [KEYS.exams]: JSON.stringify({ version: 1, exams: [], attempts: [] }),
    [STORAGE_KEYS.account]: JSON.stringify({ status: 'active', student })
  };
  const ctx = await loadPage('index.html', { seed });
  ctx.window.sessionStorage.setItem(STORAGE_KEYS.session, '1');
  const refresh = initStudentDashboard({ getStudent: () => student, getAccount: () => ({ student }) });
  await refresh();

  assert.equal(ctx.$('#studyProgressValue').textContent, '—');
  assert.equal(ctx.$('#dashboardWeeklyProgress').textContent, '—');
  assert.equal(ctx.$('#dashboardAttendanceRate').textContent, '—');
  assert.equal(ctx.$('#dashboardAverageResult').textContent, '—');
  assert.equal(ctx.$('#dashboardTermProgress').textContent, '—');

  ctx.window.close();
});
