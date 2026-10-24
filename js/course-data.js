import { KEYS, readRaw, writeRaw, newId } from './database.js';
import { normalizeClassId, normalizeSectionId, matchesClassSection } from './class-key.js';
import { isTeacherAssigned } from './teacher-assignments.js';
import { hasStaffSession, readStaffAccount } from './staff-auth.js';
import { authenticatedStudent } from './student-access.js';
import {
  teachingScopeUsername,
  currentTeacherProfile,
  currentTeacherId,
  isOwnTeacherRecord,
  isTeacherAllowedSubject,
  resolveTeacherName,
  todayISO
} from './teaching-data.js';

export const COURSES_KEY = 'activePlus.courses.v1';
export const CHAPTER_STATUSES = Object.freeze(['শুরু হয়নি', 'চলছে', 'শেষ']);

function fail(message) {
  throw new Error(message);
}

export function nextChapterStatus(status) {
  const idx = CHAPTER_STATUSES.indexOf(String(status || '').normalize('NFC').trim());
  if (idx < 0) return CHAPTER_STATUSES[1];
  return CHAPTER_STATUSES[(idx + 1) % CHAPTER_STATUSES.length];
}

export function normalizeChapter(raw = {}, index = 0) {
  const title = String(raw?.title || '').normalize('NFC').trim().slice(0, 150);
  if (!title) fail('অধ্যায়ের শিরোনাম লিখুন।');
  const order = Number.isFinite(Number(raw?.order)) && Number(raw.order) > 0
    ? Math.round(Number(raw.order))
    : index + 1;
  const rawStatus = String(raw?.status || 'শুরু হয়নি').normalize('NFC').trim();
  const status = CHAPTER_STATUSES.includes(rawStatus) ? rawStatus : 'শুরু হয়নি';
  const completedDate = status === 'শেষ'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(String(raw?.completedDate || '')) ? String(raw.completedDate) : todayISO())
    : '';
  return {
    id: String(raw?.id || '').trim() || newId('CHP'),
    title,
    order,
    status,
    completedDate
  };
}

export function courseProgress(course) {
  const chapters = Array.isArray(course?.chapters) ? course.chapters : [];
  const total = chapters.length;
  const completed = chapters.filter(ch => ch.status === 'শেষ').length;
  const running = chapters.filter(ch => ch.status === 'চলছে').length;
  const notStarted = total - completed - running;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, running, notStarted, percent };
}

function normalizeCourse(raw = {}) {
  const subject = String(raw?.subject || '').normalize('NFC').trim().slice(0, 80);
  const className = String(raw?.className || raw?.classId || '').normalize('NFC').trim();
  const group = String(raw?.group ?? raw?.sectionId ?? '').normalize('NFC').trim().slice(0, 80);
  const classId = normalizeClassId({ classId: raw?.classId, className });
  const sectionId = normalizeSectionId({ sectionId: raw?.sectionId, group });
  if (!subject || !classId) fail('কোর্সের বিষয় ও শ্রেণি নির্বাচন করুন।');
  const status = raw?.status === 'published' ? 'published' : 'draft';
  const chapters = (Array.isArray(raw?.chapters) ? raw.chapters : [])
    .map((ch, idx) => normalizeChapter(ch, idx))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'bn'));
  return {
    id: String(raw?.id || '').trim() || newId('CRS'),
    title: String(raw?.title || `${subject} (${classId})`).normalize('NFC').trim().slice(0, 150),
    subject,
    className: className || classId,
    group,
    classId,
    sectionId,
    teacherId: String(raw?.teacherId || '').trim(),
    teacherName: String(raw?.teacherName || '').trim(),
    status,
    chapters,
    createdAt: String(raw?.createdAt || new Date().toISOString()),
    updatedAt: String(raw?.updatedAt || new Date().toISOString())
  };
}

function readData() {
  const raw = readRaw(COURSES_KEY);
  if (raw === null) return { version: 1, courses: [] };
  let db;
  try { db = JSON.parse(raw); } catch { fail('কোর্সের সংরক্ষিত ডেটা পড়া যাচ্ছে না।'); }
  if (db?.version !== 1 || !Array.isArray(db.courses)) fail('কোর্সের সংরক্ষিত ডেটা সঠিক নয়।');
  return {
    version: 1,
    courses: db.courses.map(course => normalizeCourse(course))
  };
}

async function mutate(change) {
  const save = () => {
    const db = readData();
    change(db);
    writeRaw(COURSES_KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('courses-data-updated'));
    return db;
  };
  return navigator?.locks ? navigator.locks.request(COURSES_KEY, save) : save();
}

async function requireTeacherSession() {
  if (!(await hasStaffSession('teacher'))) fail('সক্রিয় শিক্ষক সেশন ছাড়া এই কাজ করা যাবে না।');
  const profile = await currentTeacherProfile();
  if (!profile || ['disabled', 'inactive', 'rejected'].includes(profile.status || '')) {
    fail('সক্রিয় শিক্ষক প্রোফাইল ছাড়া এই কাজ করা যাবে না।');
  }
  return profile;
}

function teacherSnapshot(db) {
  const username = teachingScopeUsername();
  const activeId = currentTeacherId();
  return {
    version: db.version,
    courses: db.courses.filter(course =>
      isOwnTeacherRecord(course.teacherId, activeId)
      && isTeacherAssigned(username, course.className, course.group)
      && isTeacherAllowedSubject(username, course.className, course.subject, course.group)
    )
  };
}

export function publishedCoursesForStudent(courses = [], student = null) {
  if (!student) return [];
  return (Array.isArray(courses) ? courses : [])
    .filter(course => course?.status === 'published' && matchesClassSection(course, student, { requireViewerClass: true, allowGlobalItem: false }))
    .map(course => ({
      ...course,
      teacherName: resolveTeacherName(course.teacherId, course.teacherName),
      progress: courseProgress(course)
    }));
}

function ownedCourse(db, courseId, activeId = currentTeacherId()) {
  const course = db.courses.find(c => c.id === courseId);
  const username = teachingScopeUsername();
  if (
    !course
    || !isOwnTeacherRecord(course.teacherId, activeId)
    || !isTeacherAssigned(username, course.className, course.group)
    || !isTeacherAllowedSubject(username, course.className, course.subject, course.group)
  ) {
    fail('কোর্সটি পাওয়া যায়নি বা আপনার অ্যাসাইনমেন্টের অন্তর্ভুক্ত নয়।');
  }
  return course;
}

export const courseRepository = {
  async list(actor = null) {
    if (actor?.role === 'student') return courseRepository.listForStudent(actor.student || actor.studentId || actor.id);
    if (actor?.role === 'manager' || (await hasStaffSession('manager'))) {
      return readData();
    }
    if (actor?.role === 'teacher' || (await hasStaffSession('teacher'))) {
      await requireTeacherSession();
      return teacherSnapshot(readData());
    }
    const student = await authenticatedStudent();
    return { version: 1, courses: publishedCoursesForStudent(readData().courses, student) };
  },

  async listForStudent(studentOrId) {
    const student = typeof studentOrId === 'object' && studentOrId?.className
      ? studentOrId
      : await authenticatedStudent(typeof studentOrId === 'string' ? studentOrId : studentOrId?.id);
    return { version: 1, courses: publishedCoursesForStudent(readData().courses, student) };
  },

  readStudentCoursesSync(student) {
    try {
      return publishedCoursesForStudent(readData().courses, student);
    } catch {
      return [];
    }
  },

  async saveCourse(input = {}) {
    const teacher = await requireTeacherSession();
    const username = teachingScopeUsername();
    const className = String(input.className || input.classId || '').normalize('NFC').trim();
    const group = String(input.group ?? input.sectionId ?? '').normalize('NFC').trim();
    const subject = String(input.subject || '').normalize('NFC').trim();
    if (!className || !subject) fail('শ্রেণি ও বিষয় নির্বাচন করুন।');
    if (!isTeacherAssigned(username, className, group)) fail('এই শ্রেণি/বিভাগে আপনার ম্যানেজার অ্যাসাইনমেন্ট নেই।');
    if (!isTeacherAllowedSubject(username, className, subject, group)) fail('এই বিষয়ে আপনার ম্যানেজার অ্যাসাইনমেন্ট নেই।');
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const teacherName = String(teacher?.fullName || teacher?.username || '').trim();
    const now = new Date().toISOString();

    const db = await mutate(db => {
      const old = input.id ? ownedCourse(db, input.id, activeId) : null;
      const chapters = input.chapters !== undefined
        ? (Array.isArray(input.chapters) ? input.chapters : []).map((ch, idx) => normalizeChapter(ch, idx))
        : (old?.chapters || []);
      const record = normalizeCourse({
        ...(old || {}),
        ...input,
        id: old?.id || newId('CRS'),
        subject,
        className,
        group,
        teacherId: activeId,
        teacherName,
        chapters,
        status: input.status ? (input.status === 'published' ? 'published' : 'draft') : (old?.status || 'draft'),
        createdAt: old?.createdAt || now,
        updatedAt: now
      });
      if (old) db.courses[db.courses.indexOf(old)] = record;
      else db.courses.unshift(record);
    });
    return teacherSnapshot(db);
  },

  async setCourseStatus(courseId, status) {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    if (!['draft', 'published'].includes(status)) fail('কোর্সের অবস্থা সঠিক নয়।');
    const db = await mutate(db => {
      const course = ownedCourse(db, courseId, activeId);
      course.status = status;
      course.updatedAt = new Date().toISOString();
    });
    return teacherSnapshot(db);
  },

  async deleteCourse(courseId) {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const db = await mutate(db => {
      ownedCourse(db, courseId, activeId);
      db.courses = db.courses.filter(c => c.id !== courseId);
    });
    return teacherSnapshot(db);
  },

  async addChapter(courseId, chapterInput = {}) {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const db = await mutate(db => {
      const course = ownedCourse(db, courseId, activeId);
      const nextOrder = Number.isFinite(Number(chapterInput.order)) && Number(chapterInput.order) > 0
        ? Math.round(Number(chapterInput.order))
        : course.chapters.length + 1;
      const chapter = normalizeChapter({ ...chapterInput, order: nextOrder }, course.chapters.length);
      course.chapters.push(chapter);
      course.chapters.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'bn'));
      course.updatedAt = new Date().toISOString();
    });
    return teacherSnapshot(db);
  },

  async cycleChapterStatus(courseId, chapterId, completedDate = '') {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const db = await mutate(db => {
      const course = ownedCourse(db, courseId, activeId);
      const chapter = course.chapters.find(ch => ch.id === chapterId);
      if (!chapter) fail('অধ্যায়টি পাওয়া যায়নি।');
      const next = nextChapterStatus(chapter.status);
      chapter.status = next;
      chapter.completedDate = next === 'শেষ'
        ? (/^\d{4}-\d{2}-\d{2}$/.test(String(completedDate || '')) ? String(completedDate) : todayISO())
        : '';
      course.updatedAt = new Date().toISOString();
    });
    return teacherSnapshot(db);
  },

  async updateChapter(courseId, chapterId, patch = {}) {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const db = await mutate(db => {
      const course = ownedCourse(db, courseId, activeId);
      const idx = course.chapters.findIndex(ch => ch.id === chapterId);
      if (idx < 0) fail('অধ্যায়টি পাওয়া যায়নি।');
      course.chapters[idx] = normalizeChapter({ ...course.chapters[idx], ...patch, id: chapterId }, idx);
      course.chapters.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'bn'));
      course.updatedAt = new Date().toISOString();
    });
    return teacherSnapshot(db);
  },

  async deleteChapter(courseId, chapterId) {
    const teacher = await requireTeacherSession();
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const db = await mutate(db => {
      const course = ownedCourse(db, courseId, activeId);
      course.chapters = course.chapters.filter(ch => ch.id !== chapterId);
      course.updatedAt = new Date().toISOString();
    });
    return teacherSnapshot(db);
  }
};

export function watchCourses(callback) {
  window.addEventListener('storage', event => {
    if (!event.key || event.key === COURSES_KEY) callback();
  });
  window.addEventListener('courses-data-updated', callback);
}
