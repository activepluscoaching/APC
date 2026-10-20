import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { provisionStaff, seedStaffSession, STAFF_TEST_PASSWORD } from './staff-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { ROSTER_KEY, blankRoutine, saveRoutine, saveNotices } from '../js/office-data.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { STAFF_DIRECTORY_KEY } from '../js/staff-directory.js';
import { TEACHING_KEY, setTeachingScope, teachingRepository } from '../js/teaching-data.js';
import { courseRepository } from '../js/course-data.js';
import { examRepository, MANAGER_ACTOR, totalMarks } from '../js/exam-data.js';
import { calculateStudentHomeStats, initStudentDashboard } from '../js/student-dashboard.js';
import { initStudentStudySections } from '../js/student-study-sections.js';
import { initStudentNoticeBoard } from '../js/student-notice-board.js';
import { initStudentTeaching } from '../js/student-teaching.js';

const CLASS_10 = 'দশম শ্রেণি';
const GROUP_SCI = 'বিজ্ঞান বিভাগ';
const STUDENT_OWN = Object.freeze({
  id: 'STD-E2E-10',
  name: 'আরিফ রহমান',
  className: CLASS_10,
  group: GROUP_SCI,
  studentMobile: '01711112222',
  guardianMobile: '01811112222',
  status: 'approved'
});
const STUDENT_WRONG_CLASS = Object.freeze({
  id: 'STD-E2E-09',
  name: 'সাব্বির আহমেদ',
  className: 'নবম শ্রেণি',
  group: GROUP_SCI,
  studentMobile: '01733334444',
  guardianMobile: '01833334444',
  status: 'approved'
});
const STUDENT_WRONG_GROUP = Object.freeze({
  id: 'STD-E2E-10-ARTS',
  name: 'নাদিয়া সুলতানা',
  className: CLASS_10,
  group: 'মানবিক বিভাগ',
  studentMobile: '01755556666',
  guardianMobile: '01855556666',
  status: 'approved'
});

const TEACHER_RECORD = Object.freeze({
  id: 'DIR-E2E-1',
  staffId: 'STF-7777',
  fullName: 'মাহমুদ স্যার',
  role: 'teacher',
  username: 'mahmud.teacher.apc',
  mobile: '01799990000',
  status: 'active',
  assignment: {
    classes: [CLASS_10],
    subjects: ['গণিত'],
    classSubjects: { [CLASS_10]: ['গণিত'] }
  }
});

test('E2E: Manager sets routine -> Teacher takes attendance, gives homework & exam, updates course/chapters, posts notice -> Own student receives all & Home stats match -> Wrong-class/section student sees nothing', async () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const ctx = await loadPage('student.html', {
    seed: {
      'activePlus.demo.autofill.v1': 'off',
      [ROSTER_KEY]: JSON.stringify([STUDENT_OWN, STUDENT_WRONG_CLASS, STUDENT_WRONG_GROUP]),
      [STAFF_DIRECTORY_KEY]: JSON.stringify({ version: 1, records: [TEACHER_RECORD] }),
      [TEACHER_ASSIGNMENTS_KEY]: JSON.stringify([
        {
          id: 'TAS-E2E-1',
          teacherUsername: TEACHER_RECORD.username,
          teacherName: TEACHER_RECORD.fullName,
          staffId: TEACHER_RECORD.staffId,
          className: CLASS_10,
          group: GROUP_SCI,
          subject: 'গণিত',
          subjects: ['গণিত']
        }
      ])
    }
  });

  try {
    await provisionStaff('manager', STAFF_TEST_PASSWORD);
    await provisionStaff('teacher', STAFF_TEST_PASSWORD);
    seedStaffSession(ctx.window, 'manager');
    seedStaffSession(ctx.window, 'teacher');
    ctx.window.localStorage.setItem('activePlus.activeStaffIdentity.v1', JSON.stringify({
      role: 'teacher',
      username: TEACHER_RECORD.username,
      staffId: TEACHER_RECORD.staffId,
      fullName: TEACHER_RECORD.fullName
    }));
    setTeachingScope(TEACHER_RECORD.username, TEACHER_RECORD.staffId);

    // 1. Manager sets weekly routine with teacherId
    const routine = blankRoutine();
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const todayKey = dayKeys[new Date().getDay()] === 'fri' ? 'sat' : dayKeys[new Date().getDay()];
    routine[todayKey].classes.push({
      id: 'RT-SLOT-E2E',
      subject: 'গণিত',
      teacher: TEACHER_RECORD.fullName,
      teacherId: TEACHER_RECORD.staffId,
      time: '১০:০০',
      rawTime: '10:00',
      period: 'সকাল',
      room: 'রুম ২০২',
      className: CLASS_10,
      group: GROUP_SCI
    });
    assert.equal(saveRoutine(routine), true);

    // 2. Teacher records date-session attendance & room/notes for that routine slot
    let teachingDb = await teachingRepository.saveActivity({
      type: 'routine',
      title: 'গণিত — সাপ্তাহিক ক্লাস',
      subject: 'গণিত',
      className: CLASS_10,
      group: GROUP_SCI,
      date: todayStr,
      time: '10:00',
      duration: 60,
      room: 'রুম ২০২',
      details: 'অধ্যায় ১ আলোচনা সম্পন্ন',
      status: 'published',
      routineSlotId: 'RT-SLOT-E2E'
    });
    const sessionActId = teachingDb.activities[0].id;
    await teachingRepository.saveProgress(sessionActId, {
      [STUDENT_OWN.id]: 'present'
    });

    // 3. Teacher publishes homework
    teachingDb = await teachingRepository.saveActivity({
      type: 'homework',
      title: 'বীজগণিত অনুশীলনী ৩.১',
      subject: 'গণিত',
      className: CLASS_10,
      group: GROUP_SCI,
      date: todayStr,
      time: '18:00',
      details: '১ থেকে ১০ নং সমাধান করবে।',
      status: 'published'
    });
    const hwId = teachingDb.activities.find(a => a.type === 'homework').id;

    // 4. Teacher creates exam -> requests approval -> Manager publishes -> Student submits -> Teacher/auto-scored
    const startAt = Date.now() + 60000;
    const endAt = startAt + 3600000;
    const teacherActor = { role: 'teacher', id: TEACHER_RECORD.staffId };
    let examDb = await examRepository.saveDraft({
      type: 'mcq',
      title: 'বীজগণিত কুইজ ১',
      subject: 'গণিত',
      className: CLASS_10,
      group: GROUP_SCI,
      startAt,
      endAt,
      lateMinutes: 15,
      negative: 0,
      passPercent: 40,
      template: 'প্রশ্ন: ৫ + ৫ = কত?\nA: ৮\nB: ১০\nC: ১২\nD: ১৫\nউত্তর: B'
    }, teacherActor);
    const examId = examDb.exams[0].id;
    assert.equal(examDb.exams[0].teacherId, TEACHER_RECORD.staffId);
    await examRepository.requestApproval(examId, teacherActor);
    await examRepository.publish(examId, MANAGER_ACTOR);

    // 5. Teacher creates course and updates chapter status (১টি শেষ, ১টি চলছে => ৫০% অগ্রগতি)
    let courseDb = await courseRepository.saveCourse({
      subject: 'গণিত',
      className: CLASS_10,
      group: GROUP_SCI,
      status: 'published',
      chapters: [
        { id: 'CH-1', title: 'অধ্যায় ১: বাস্তব সংখ্যা', order: 1, status: 'শেষ', completedAt: todayStr },
        { id: 'CH-2', title: 'অধ্যায় ২: সেট ও ফাংশন', order: 2, status: 'চলছে' }
      ]
    });
    assert.equal(courseDb.courses.length, 1);
    assert.equal(courseDb.courses[0].teacherId, TEACHER_RECORD.staffId);

    // 6. Teacher posts notice to own class-section
    saveNotices([{
      id: 'NTC-E2E-1',
      title: 'আগামীকাল গণিত ক্লাস টেস্ট',
      body: 'অধ্যায় ১ এর ওপর সংক্ষিপ্ত পরীক্ষা হবে।',
      category: 'exam',
      audience: 'সকল শিক্ষার্থী',
      className: CLASS_10,
      group: GROUP_SCI,
      classId: CLASS_10,
      sectionId: 'বিজ্ঞান',
      teacherId: TEACHER_RECORD.staffId,
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: TEACHER_RECORD.username,
      createdByRole: 'teacher',
      authorName: TEACHER_RECORD.fullName
    }]);

    // 7. Student (separate profile: STUDENT_OWN) logs in, submits homework answer, and views panel
    ctx.window.localStorage.setItem(STORAGE_KEYS.account, JSON.stringify({ status: 'active', student: STUDENT_OWN }));
    ctx.window.sessionStorage.setItem(STORAGE_KEYS.session, '1');

    // Student submits written homework answer (<=500 chars)
    await teachingRepository.markHomeworkDone(hwId, STUDENT_OWN, {
      answer: 'সবগুলো অংক খাতায় সমাধান করেছি।'
    });
    // Teacher reviews homework ("দেখা হয়েছে") and leaves comment (<=200 chars)
    await teachingRepository.saveProgress(hwId, {
      [STUDENT_OWN.id]: { value: 'reviewed', comment: 'খুব সুন্দর হয়েছে!' }
    });

    const studentTeaching = await teachingRepository.listForStudent(STUDENT_OWN.id);
    const studentCourses = await courseRepository.listForStudent(STUDENT_OWN);
    const studentExams = await examRepository.listForStudent(STUDENT_OWN.id);

    assert.equal(studentTeaching.activities.length, 2, 'own student receives routine session + homework');
    assert.equal(studentTeaching.activities.find(a => a.id === hwId).teacherName, 'মাহমুদ স্যার', 'teacherName resolved from teacherId');
    assert.equal(studentTeaching.activities.find(a => a.id === hwId).progress[STUDENT_OWN.id].value, 'reviewed');
    assert.equal(studentTeaching.activities.find(a => a.id === hwId).progress[STUDENT_OWN.id].comment, 'খুব সুন্দর হয়েছে!');
    assert.equal(studentCourses.courses.length, 1, 'own student receives published course');
    assert.equal(studentExams.exams.length, 1, 'own student receives published exam');

    // Verify Home stats calculation matches exact real data:
    // - Attendance: 1 present / 1 session = 100%
    // - Homework: 1 reviewed / 1 homework = 100%
    // - Weekly progress: (1 reviewed homework + 1 present session) / 2 = 100%
    // - Term progress: (1 completed chapter + 1 reviewed homework) / (2 chapters + 1 homework) = 2/3 = 67%
    const homeStats = calculateStudentHomeStats({
      student: STUDENT_OWN,
      activities: studentTeaching.activities,
      examDb: studentExams,
      courses: studentCourses.courses
    });
    assert.equal(homeStats.attendancePercent, 100);
    assert.equal(homeStats.attendanceLabel, '১০০%');
    assert.equal(homeStats.weeklyProgressPercent, 100);
    assert.equal(homeStats.weeklyProgressLabel, '১০০%');
    assert.equal(homeStats.termProgressPercent, 67);
    assert.equal(homeStats.termProgressLabel, '৬৭%');
    assert.equal(homeStats.doneCount, 1);
    assert.equal(homeStats.pendingCount, 0);

    // Mount student dashboard, study sections, and notice board for STUDENT_OWN
    const refreshDash = initStudentDashboard({ getStudent: () => STUDENT_OWN, getAccount: () => ({ student: STUDENT_OWN }) });
    await refreshDash();
    const studyApi = initStudentStudySections({ getStudent: () => STUDENT_OWN });
    await studyApi.refresh();
    const noticeApi = initStudentNoticeBoard({ getStudent: () => STUDENT_OWN });
    noticeApi.refresh();

    assert.equal(ctx.$('#dashboardAttendanceRate').textContent, '১০০%');
    assert.equal(ctx.$$('#homeRealStatsRow > div').length, 2, 'Home only shows attendance and average result metrics');
    assert.deepEqual(ctx.$$('#homeRealStatsRow small').map(node => node.textContent.trim()), ['উপস্থিতি', 'গড় ফলাফল']);
    assert.match(ctx.$('[data-daily-advice-summary]').textContent, /^আজ .+ · বাড়ির কাজ বাকি নেই$/);
    assert.match(ctx.$('#studentCourseChaptersList').textContent, /বাস্তব সংখ্যা/);
    assert.match(ctx.$('#studentCourseChaptersList').textContent, /৫০%/);
    assert.match(ctx.$('#noticeBoardList').textContent, /আগামীকাল গণিত ক্লাস টেস্ট/);

    // 8. Wrong-class student (নবম শ্রেণি) and wrong-section student (দশম শ্রেণি • মানবিক) see NOTHING
    for (const outsider of [STUDENT_WRONG_CLASS, STUDENT_WRONG_GROUP]) {
      ctx.window.localStorage.setItem(STORAGE_KEYS.account, JSON.stringify({ status: 'active', student: outsider }));
      const outTeaching = await teachingRepository.listForStudent(outsider.id);
      const outCourses = await courseRepository.listForStudent(outsider);
      const outExams = await examRepository.listForStudent(outsider.id);
      assert.equal(outTeaching.activities.length, 0, `${outsider.id} sees 0 activities`);
      assert.equal(outCourses.courses.length, 0, `${outsider.id} sees 0 courses`);
      assert.equal(outExams.exams.length, 0, `${outsider.id} sees 0 exams`);

      const outStats = calculateStudentHomeStats({
        student: outsider,
        activities: outTeaching.activities,
        examDb: outExams,
        courses: outCourses.courses
      });
      assert.equal(outStats.attendanceLabel, '—');
      assert.equal(outStats.weeklyProgressLabel, '—');
      assert.equal(outStats.termProgressLabel, '—');
    }
  } finally {
    ctx.window.close();
    setTeachingScope('teacher.apc');
  }
});
