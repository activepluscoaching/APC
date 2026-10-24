import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseRepository,
  COURSES_KEY,
  CHAPTER_STATUSES,
  nextChapterStatus,
  courseProgress
} from '../js/course-data.js';
import { setTeachingScope } from '../js/teaching-data.js';
import { saveStaffSession } from '../js/staff-auth.js';
import { STAFF_DIRECTORY_KEY } from '../js/staff-directory.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { STORAGE_KEYS } from '../js/config.js';

function createEnv() {
  const sciStudent = { id: 'STU-SCI', name: 'রাকিব হাসান', className: 'দশম শ্রেণি', group: 'বিজ্ঞান বিভাগ', status: 'approved' };
  const artsStudent = { id: 'STU-ART', name: 'রাইসা আক্তার', className: 'দশম শ্রেণি', group: 'মানবিক', status: 'approved' };
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
        assignment: { classes: ['দশম শ্রেণি'], subjects: ['গণিত'], classSubjects: { 'দশম শ্রেণি': ['গণিত'] } }
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
      group: 'বিজ্ঞান',
      subject: 'গণিত',
      subjects: ['গণিত']
    }
  ];
  const storage = new Map([
    [ROSTER_KEY, JSON.stringify([sciStudent, artsStudent])],
    [STAFF_DIRECTORY_KEY, JSON.stringify(directory)],
    [TEACHER_ASSIGNMENTS_KEY, JSON.stringify(assignments)],
    [STORAGE_KEYS.account, JSON.stringify({ status: 'active', student: sciStudent })]
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
  return { storage, sciStudent, artsStudent };
}

test('courseRepository creates course, adds chapters, cycles chapter status in one tap, and scopes published courses to student class-section', async () => {
  const { sciStudent, artsStudent } = createEnv();
  await saveStaffSession('teacher', false, {
    username: 'rahim.teacher.apc',
    staffId: 'STF-0005',
    fullName: 'রহিম উদ্দিন স্যার'
  });
  setTeachingScope('rahim.teacher.apc', 'STF-0005');

  assert.deepEqual(CHAPTER_STATUSES, ['শুরু হয়নি', 'চলছে', 'শেষ']);
  assert.equal(nextChapterStatus('শুরু হয়নি'), 'চলছে');
  assert.equal(nextChapterStatus('চলছে'), 'শেষ');
  assert.equal(nextChapterStatus('শেষ'), 'শুরু হয়নি');

  // Create draft course
  let snap = await courseRepository.saveCourse({
    subject: 'গণিত',
    className: 'দশম শ্রেণি',
    group: 'বিজ্ঞান বিভাগ',
    status: 'draft'
  });
  assert.equal(snap.courses.length, 1);
  const courseId = snap.courses[0].id;
  assert.equal(snap.courses[0].teacherId, 'STF-0005');
  assert.equal(snap.courses[0].classId, 'দশম শ্রেণি');
  assert.equal(snap.courses[0].sectionId, 'বিজ্ঞান');

  // Draft course is not visible to student
  assert.equal(courseRepository.readStudentCoursesSync(sciStudent).length, 0);

  // Add two chapters
  await courseRepository.addChapter(courseId, { title: 'অধ্যায় ১ — বাস্তব সংখ্যা', order: 1 });
  snap = await courseRepository.addChapter(courseId, { title: 'অধ্যায় ২ — সেট ও ফাংশন', order: 2 });
  const ch1 = snap.courses[0].chapters[0].id;
  assert.equal(snap.courses[0].chapters[0].status, 'শুরু হয়নি');

  // One-tap cycle: শুরু হয়নি -> চলছে -> শেষ
  snap = await courseRepository.cycleChapterStatus(courseId, ch1);
  assert.equal(snap.courses[0].chapters[0].status, 'চলছে');
  snap = await courseRepository.cycleChapterStatus(courseId, ch1, '2026-10-13');
  assert.equal(snap.courses[0].chapters[0].status, 'শেষ');
  assert.equal(snap.courses[0].chapters[0].completedDate, '2026-10-13');

  // Publish course
  await courseRepository.setCourseStatus(courseId, 'published');

  // Science student sees the published course with 50% progress (1 of 2 chapters completed)
  const sciCourses = courseRepository.readStudentCoursesSync(sciStudent);
  assert.equal(sciCourses.length, 1);
  assert.equal(sciCourses[0].teacherName, 'রহিম উদ্দিন স্যার');
  assert.deepEqual(courseProgress(sciCourses[0]), {
    total: 2,
    completed: 1,
    running: 0,
    notStarted: 1,
    percent: 50
  });

  // Humanities student does not see the Science course
  assert.equal(courseRepository.readStudentCoursesSync(artsStudent).length, 0);
});
