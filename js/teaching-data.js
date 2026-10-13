/* Local academic repository. Keep the existing Student and Transaction schemas intact.
   These async methods can be replaced with authenticated API calls later. */
import { enabledClasses, STORAGE_KEYS } from './config.js';
import { loadRoster, loadRoutine } from './office-data.js';
import { KEYS, readRaw, writeRaw, newId } from './database.js';
import { isTeacherAssigned, isTeacherAssignedSubject, subjectsForTeacherClass, assignedScopeForStudent } from './teacher-assignments.js';
import { normalizeClassId, normalizeSectionId, matchesClassSection } from './class-key.js';
import { hasStaffSession, readStaffAccount, readActiveStaffIdentity } from './staff-auth.js';
import { authenticatedStudent } from './student-access.js';
import { searchStudentsByQuery } from './student-search.js';

export const TEACHING_KEY = KEYS.teaching;
export const DEMO_TEACHER = Object.freeze({ id: 'TCH-001', name: 'মো. সাইফুল ইসলাম' });

/* ---------- Signed-in teacher identity ----------
   Scope checks must key on WHO signed in (the active staff identity's Login
   User ID), not on a hard-coded role account. Before this, every gate below
   asked `isTeacherAssigned('teacher.apc', …)` and a Staff Directory teacher
   ("rahim.teacher.apc") saw another person's — or no — classes. */

let scopeUsername = 'teacher.apc';
let scopeTeacherId = DEMO_TEACHER.id;
const teacherNameCache = new Map([[DEMO_TEACHER.id, DEMO_TEACHER.name]]);

function syncDirectoryLookup(predicate) {
  try {
    const raw = readRaw('activePlus.staffDirectory.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const records = Array.isArray(parsed?.records) ? parsed.records : [];
    return records.find(predicate) || null;
  } catch { return null; }
}

/** Set the Login User ID (and optional staffId) every scope gate checks against. */
export function setTeachingScope(username, teacherId = '') {
  scopeUsername = String(username || '').trim().toLowerCase() || 'teacher.apc';
  if (teacherId) {
    scopeTeacherId = String(teacherId).trim();
  } else {
    const identity = readActiveStaffIdentity();
    if (identity?.role === 'teacher' && identity.staffId && String(identity.username || '').toLowerCase() === scopeUsername) {
      scopeTeacherId = String(identity.staffId).trim();
    } else if (teachingScopeUsername() === 'teacher.apc') {
      scopeTeacherId = DEMO_TEACHER.id;
    } else {
      const found = syncDirectoryLookup(r => String(r?.username || '').toLowerCase() === scopeUsername);
      scopeTeacherId = String(found?.staffId || DEMO_TEACHER.id);
    }
  }
  return scopeUsername;
}

export function teachingScopeUsername() {
  if (scopeUsername !== 'teacher.apc') {
    const id = readActiveStaffIdentity();
    if (!id && !syncDirectoryLookup(r => String(r?.username || '').toLowerCase() === scopeUsername)) {
      scopeUsername = 'teacher.apc';
      scopeTeacherId = DEMO_TEACHER.id;
    }
  }
  return scopeUsername;
}

export function currentTeacherId() {
  const identity = readActiveStaffIdentity();
  if (identity?.role === 'teacher' && identity.staffId) {
    const idUser = String(identity.username || '').toLowerCase();
    if (!idUser || idUser === scopeUsername) return String(identity.staffId).trim();
  }
  if (teachingScopeUsername() !== 'teacher.apc') {
    const found = syncDirectoryLookup(r => String(r?.username || '').toLowerCase() === scopeUsername);
    if (found?.staffId) return String(found.staffId).trim();
  }
  return scopeTeacherId || DEMO_TEACHER.id;
}

export function isOwnTeacherRecord(recordTeacherId, expectedId = currentTeacherId()) {
  const id = String(recordTeacherId || '').trim();
  const exp = String(expectedId || '').trim();
  if (!id || !exp) return false;
  if (id === exp) return true;
  if (teachingScopeUsername() === 'teacher.apc' && (exp === DEMO_TEACHER.id || exp === 'STF-0003') && (id === DEMO_TEACHER.id || id === 'STF-0003')) return true;
  return false;
}

export function resolveTeacherName(teacherId, fallback = '') {
  const id = String(teacherId || '').trim();
  if (id) {
    const dir = syncDirectoryLookup(r => r?.staffId === id || r?.id === id || String(r?.username || '').toLowerCase() === id.toLowerCase());
    if (dir?.fullName) {
      teacherNameCache.set(id, String(dir.fullName).trim());
      return String(dir.fullName).trim();
    }
    if (id === DEMO_TEACHER.id || id === 'STF-0003' || id === 'teacher.apc') {
      try {
        const acc = JSON.parse(readRaw('activePlus.teacherAccount.v1') || 'null');
        if (acc?.fullName && !acc.fullName.startsWith('প্রাথমিক ')) return String(acc.fullName).trim();
      } catch { /* encrypted or absent */ }
    }
    if (teacherNameCache.has(id) && id !== DEMO_TEACHER.id) return teacherNameCache.get(id);
  }
  const fb = String(fallback || '').trim();
  if (fb) return fb;
  return id ? (teacherNameCache.get(id) || id) : '';
}

export async function currentTeacherProfile() {
  const identity = readActiveStaffIdentity();
  const handle = String(identity?.username || scopeUsername || '').trim().toLowerCase();
  if (handle && handle !== 'teacher.apc') {
    try {
      const { findDirectoryStaffByUsername } = await import('./staff-directory.js');
      const record = await findDirectoryStaffByUsername(handle);
      if (record) {
        scopeTeacherId = record.staffId || scopeTeacherId;
        if (record.staffId && record.fullName) teacherNameCache.set(record.staffId, record.fullName);
        return record;
      }
    } catch { /* offline lookup failure: fall back to the device account */ }
  }
  const account = await readStaffAccount('teacher');
  if (account?.fullName) teacherNameCache.set(DEMO_TEACHER.id, account.fullName);
  return account;
}
export const ACTIVITY_TYPES = Object.freeze({
  exam: { label: 'নম্বর ও ফলাফল', plural: 'নম্বর ও ফলাফল', progress: '' },
  homework: { label: 'বাড়ির কাজ', plural: 'বাড়ির কাজ', progress: 'জমার অবস্থা' },
  suggestion: { label: 'সাজেশন', plural: 'সাজেশন', progress: '' },
  routine: { label: 'উপস্থিতি ক্লাস', plural: 'উপস্থিতি ক্লাস', progress: 'উপস্থিতি' }
});
export const PROGRESS_LABELS = Object.freeze({ pending: 'বাকি', done: 'সম্পন্ন জানিয়েছে', reviewed: 'দেখা হয়েছে', present: 'উপস্থিত', absent: 'অনুপস্থিত', late: 'দেরিতে উপস্থিত' });
export { escapeHtml as escapeText } from './sanitize.js';
export function todayISO(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
export function displayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });
}
export function safeResourceURL(value) {
  if (!value) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
const groupKey = value => normalizeSectionId(value);
export function matchesStudent(activity, student) {
  return matchesClassSection(activity, student, { requireViewerClass: true, allowGlobalItem: false });
}
export function publishedForStudent(activities, student) {
  return activities.filter(a => a.status === 'published' && matchesStudent(a, student));
}
export const searchTeachingStudents = searchStudentsByQuery;
function fail(message) { throw new Error(message); }
function academicClassNames() {
  try {
    const saved = JSON.parse(readRaw(KEYS.academics) || 'null');
    if (Array.isArray(saved?.classes)) return saved.classes.map(item => item?.name).filter(Boolean);
  } catch { /* retain the shipped class list when old Academic Setup is unreadable */ }
  return enabledClasses;
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && todayISO(date) === value;
}
export function validateActivity(input) {
  const text = key => String(input[key] || '').trim();
  const type = text('type'), title = text('title'), subject = text('subject'), className = text('className');
  if (!Object.hasOwn(ACTIVITY_TYPES, type) || !['draft', 'published'].includes(input.status)) fail('কাজের ধরন ও অবস্থা সঠিকভাবে নির্বাচন করুন।');
  if (!title || title.length > 150 || !subject || subject.length > 80) fail('শিরোনাম ও বিষয় পূরণ করুন (সর্বোচ্চ ১৫০ ও ৮০ অক্ষর)।');
  if (!academicClassNames().includes(className)) fail('সঠিক শ্রেণি নির্বাচন করুন।');
  const group = text('group'), details = text('details'), room = text('room'), resourceURL = text('resourceURL');
  if (group.length > 80 || details.length > 3000 || room.length > 120 || resourceURL.length > 1000) fail('লেখা নির্ধারিত সীমার মধ্যে রাখুন।');
  if (resourceURL && !safeResourceURL(resourceURL)) fail('সহায়ক লিংকটি https:// বা http:// দিয়ে দিন।');
  const date = type === 'suggestion' ? (text('date') || todayISO()) : text('date');
  const time = type === 'suggestion' ? '' : text('time');
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (type === 'homework') {
    if (Boolean(date) !== Boolean(time)) fail('জমার তারিখ দিলে সময়ও দিন, অথবা দুটোই ফাঁকা রাখুন।');
    if (date && (!validDate(date) || !validTime)) fail('সঠিক জমার তারিখ ও সময় দিন।');
  } else {
    if (!validDate(date)) fail('সঠিক তারিখ দিন।');
    if (type !== 'suggestion' && !validTime) fail('সঠিক সময় দিন।');
  }
  const timed = ['exam', 'routine'].includes(type);
  const duration = timed ? Number(input.duration) : 0;
  if (timed && (!Number.isInteger(duration) || duration < 5 || duration > 300)) fail('সময়কাল ৫ থেকে ৩০০ মিনিটের মধ্যে দিন।');
  if (timed && minutes(time) + duration > 1440) fail('ক্লাস/পরীক্ষা একই দিনের মধ্যে শেষ হতে হবে।');
  const totalMarks = type === 'exam' ? Number(input.totalMarks) : 0;
  if (type === 'exam' && (!Number.isInteger(totalMarks) || totalMarks < 1 || totalMarks > 1000)) fail('পূর্ণমান ১ থেকে ১০০০-এর মধ্যে দিন।');
  const routineSlotId = String(input.routineSlotId || '').trim().slice(0, 80);
  return { type, title, subject, className, group, classId: normalizeClassId(className), sectionId: normalizeSectionId(group), details, room: timed ? room : '', resourceURL, date, time, duration, totalMarks, status: input.status, ...(routineSlotId ? { routineSlotId } : {}) };
}
function routineSlotMinutes(item) {
  const raw = String(item?.rawTime || item?.time || '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return null;
  let h = Number(m[1]), min = Number(m[2]);
  if (!item?.rawTime && (item?.period === 'বিকেল' || item?.period === 'সন্ধ্যা') && h < 12) h += 12;
  return h * 60 + min;
}
function weekdayKeyForDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || '';
}
function minutes(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
function readData() {
  const raw = readRaw(TEACHING_KEY);
  if (raw === null) return { version: 1, activities: [] };
  let db;
  try { db = JSON.parse(raw); } catch { fail('শিক্ষকের সংরক্ষিত ডেটা পড়া যাচ্ছে না। ডেটা না মুছে সহায়তা নিন।'); }
  if (db?.version !== 1 || !Array.isArray(db.activities) || db.activities.some(a => !a || typeof a.id !== 'string' || !a.teacherId || !a.progress || typeof a.progress !== 'object' || Array.isArray(a.progress))) fail('শিক্ষকের সংরক্ষিত ডেটা সঠিক নয়।');
  const ids = new Set();
  for (const a of db.activities) {
    validateActivity(a);
    a.classId = normalizeClassId(a);
    a.sectionId = normalizeSectionId(a);
    if (ids.has(a.id) || !a.id || typeof a.updatedAt !== 'string' || typeof a.createdAt !== 'string' || typeof a.teacherName !== 'string' || !Number.isFinite(Date.parse(a.updatedAt)) || !Number.isFinite(Date.parse(a.createdAt))) fail('শিক্ষকের সংরক্ষিত ডেটা সঠিক নয়।');
    ids.add(a.id);
    for (const p of Object.values(a.progress)) {
      const value = p?.value;
      const valid = a.type === 'exam' ? typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= a.totalMarks && Number.isInteger(value * 2)
        : a.type === 'homework' ? ['pending', 'done', 'reviewed'].includes(value)
        : a.type === 'routine' && ['present', 'absent', 'late'].includes(value);
      if (p.comment !== undefined && (typeof p.comment !== 'string' || p.comment.length > 200)) fail('মন্তব্য সর্বোচ্চ ২০০ অক্ষরের হতে পারে।');
      if (p.answer !== undefined && (typeof p.answer !== 'string' || p.answer.length > 500)) fail('লিখিত উত্তর সর্বোচ্চ ৫০০ অক্ষরের হতে পারে।');
      if (p.attachmentUrl !== undefined && (typeof p.attachmentUrl !== 'string' || p.attachmentUrl.length > 1000)) fail('সংযুক্তি লিংক সঠিক নয়।');
      if (!valid || !Number.isFinite(Date.parse(p.updatedAt))) fail('সংরক্ষিত নম্বর/অগ্রগতির ডেটা সঠিক নয়।');
    }
  }
  return db;
}
function approvedRoster() {
  const students = loadRoster().filter(s => s.status === 'approved').map(s => ({ ...s }));
  // Include the current approved student account without changing stored office records.
  try {
    const account = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.account) || 'null');
    if (account?.status === 'active' && typeof account.student?.id === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(account.student.id) && typeof account.student.name === 'string' && account.student.name.trim() && academicClassNames().includes(account.student.className)) {
      const current = { ...account.student, mobile: account.student.studentMobile || account.mobile, status: 'approved' };
      const index = students.findIndex(s => s.id === current.id);
      if (index < 0) students.push(current); else students[index] = { ...students[index], ...current };
    }
  } catch { /* Existing app owns student-account recovery. */ }
  return students;
}
function roster() { return approvedRoster().filter(student => assignedScopeForStudent(teachingScopeUsername(), student)); }
export function isTeacherAllowedSubject(username, className, subject = '', group = '') {
  if (!subject) return true;
  const handle = String(username || '').trim().toLowerCase();
  if (handle === 'teacher.apc') {
    try {
      const raw = JSON.parse(readRaw('activePlus.manager.teacherAssignments.v1') || '[]');
      if (Array.isArray(raw) && raw.every(r => !Array.isArray(r?.subjects) && r?.teacherUsername === 'teacher.apc')) return true;
    } catch { /* fall through */ }
  }
  const subjects = subjectsForTeacherClass(username, className);
  if (!subjects.length || (subjects.length === 1 && subjects[0] === 'Test')) return true;
  return isTeacherAssignedSubject(username, className, subject, group);
}
function teacherSnapshot(db) {
  return {
    ...db,
    activities: db.activities.filter(activity =>
      isOwnTeacherRecord(activity.teacherId)
      && isTeacherAssigned(teachingScopeUsername(), activity.className, activity.group)
      && isTeacherAllowedSubject(teachingScopeUsername(), activity.className, activity.subject, activity.group)
    )
  };
}
function studentSnapshot(db, student) {
  return {
    version: db.version,
    activities: db.activities
      .filter(activity => activity.status === 'published' && matchesStudent(activity, student))
      .map(activity => {
        const ownProgress = activity.progress?.[student.id];
        const teacherName = resolveTeacherName(activity.teacherId, activity.teacherName);
        return { ...activity, teacherName, progress: ownProgress ? { [student.id]: { ...ownProgress } } : {} };
      })
  };
}
function assertAssigned(className, group = '', subject = '') {
  if (!isTeacherAssigned(teachingScopeUsername(), className, group)) fail('এই class/batch-এ আপনার Manager assignment নেই।');
  if (subject && !isTeacherAllowedSubject(teachingScopeUsername(), className, subject, group)) {
    fail('এই বিষয়ে আপনার Manager assignment নেই।');
  }
}
async function roleProfileAccount(role) {
  const account = await readStaffAccount(role);
  const accountActive = Boolean(account)
    && !['disabled', 'inactive', 'rejected'].includes(account.status || '')
    && account.accountStatus !== 'disabled';
  if (accountActive) return account;
  /* A Staff Directory sign-in carries its own profile: the built-in device
     account may not even exist on this device. The active identity decides
     who is at the panel; only an inactive record is refused. */
  if (role === 'teacher') {
    try {
      const identity = readActiveStaffIdentity();
      const record = identity?.role === 'teacher' && identity.username
        ? await (await import('./staff-directory.js')).findDirectoryStaffByUsername(identity.username)
        : null;
      if (record && record.status === 'active') return { ...record, status: 'active', accountStatus: 'active' };
    } catch { /* fall through to the caller's refusal */ }
  }
  return account;
}
async function requireRoleSession(role) {
  if (!(await hasStaffSession(role))) fail(`সক্রিয় ${role === 'teacher' ? 'Teacher' : 'Manager'} session ছাড়া এই কাজ করা যাবে না।`);
  const account = await roleProfileAccount(role);
  if (!account || ['disabled', 'inactive', 'rejected'].includes(account.status) || account.accountStatus === 'disabled') fail(`সক্রিয় ${role === 'teacher' ? 'Teacher' : 'Manager'} profile ছাড়া এই কাজ করা যাবে না।`);
}
async function mutate(change) {
  const save = () => {
    const db = readData();
    change(db);
    writeRaw(TEACHING_KEY, JSON.stringify(db));
    window.dispatchEvent(new Event('teaching-data-updated'));
    return db;
  };
  return navigator.locks ? navigator.locks.request(TEACHING_KEY, save) : save();
}
function ownedActivity(db, id) {
  const activity = db.activities.find(a => a.id === id);
  if (!activity || !isOwnTeacherRecord(activity.teacherId) || !isTeacherAssigned(teachingScopeUsername(), activity.className, activity.group) || !isTeacherAllowedSubject(teachingScopeUsername(), activity.className, activity.subject, activity.group)) fail('কাজটি পাওয়া যায়নি বা এই class/batch-এর assignment নেই।');
  return activity;
}
export const teachingRepository = {
  async list(actor = null) {
    if (actor?.role === 'student') return teachingRepository.listForStudent(actor.studentId || actor.id);
    if (actor?.role === 'manager') { await requireRoleSession('manager'); return readData(); }
    if (actor?.role === 'teacher') { await requireRoleSession('teacher'); return teacherSnapshot(readData()); }
    if (await hasStaffSession('manager')) { await requireRoleSession('manager'); return readData(); }
    if (await hasStaffSession('teacher')) { await requireRoleSession('teacher'); return teacherSnapshot(readData()); }
    const student = await authenticatedStudent();
    return studentSnapshot(readData(), student);
  },
  async listForStudent(studentId) {
    const student = await authenticatedStudent(studentId);
    return studentSnapshot(readData(), student);
  },
  async listForManager() { await requireRoleSession('manager'); return readData(); },
  async listStudents() { await requireRoleSession('teacher'); return roster(); },
  async listApprovedStudents() { await requireRoleSession('manager'); return approvedRoster(); },
  async saveActivity(input) {
    await requireRoleSession('teacher');
    const fields = validateActivity(input);
    if (fields.type === 'exam') fail('পরীক্ষার খসড়া ও অনুমোদনের জন্য Examination workflow ব্যবহার করুন।');
    const teacher = await currentTeacherProfile();
    assertAssigned(fields.className, fields.group, fields.subject);
    const activeId = teacher?.staffId && teacher?.kind !== 'system' ? String(teacher.staffId) : currentTeacherId();
    const teacherName = String(teacher?.fullName || teacher?.username || '').trim();
    if (!teacherName) fail('Teacher profile পাওয়া যায়নি।');
    const db = await mutate(db => {
      const old = input.id ? ownedActivity(db, input.id) : null;
      if (old && old.type !== fields.type) fail('কাজের ধরন বদলানো যাবে না।');
      if (old && Object.keys(old.progress).length && (old.className !== fields.className || groupKey(old.group) !== groupKey(fields.group))) fail('নম্বর/অগ্রগতি আছে। এই কাজের শ্রেণি বা বিভাগ বদলানো যাবে না।');
      if (fields.type === 'exam' && old && Object.values(old.progress).some(p => Number(p.value) > fields.totalMarks)) fail('পূর্ণমান সংরক্ষিত নম্বরের চেয়ে কম হতে পারে না।');
      if (fields.status === 'published' && ['exam', 'routine'].includes(fields.type)) {
        const conflict = db.activities.some(a => a.id !== old?.id && isOwnTeacherRecord(a.teacherId, activeId) && a.status === 'published' && ['exam', 'routine'].includes(a.type) && a.date === fields.date && minutes(a.time) < minutes(fields.time) + fields.duration && minutes(fields.time) < minutes(a.time) + a.duration);
        if (conflict) fail('এই সময়ে আপনার আরেকটি ক্লাস/পরীক্ষা আছে। সময় বদলান।');
        const dayKey = weekdayKeyForDate(fields.date);
        const slotId = fields.routineSlotId || old?.routineSlotId || '';
        const weeklySlots = (loadRoutine()?.[dayKey]?.classes || []).filter(slot =>
          slot?.teacherId && isOwnTeacherRecord(slot.teacherId, activeId) && (!slotId || slot.id !== slotId)
        );
        const weeklyConflict = weeklySlots.some(slot => {
          const startMin = routineSlotMinutes(slot);
          if (startMin === null) return false;
          const dur = Number(slot.duration) || 60;
          return startMin < minutes(fields.time) + fields.duration && minutes(fields.time) < startMin + dur;
        });
        if (weeklyConflict) fail('এই সময়ে সাপ্তাহিক রুটিনে আপনার আরেকটি ক্লাস আছে। সময় বদলান।');
      }
      const now = new Date().toISOString();
      const activity = { ...fields, id: old?.id || newId('ACT'), teacherId: activeId, teacherName, createdAt: old?.createdAt || now, updatedAt: now, progress: old?.progress || {} };
      if (old) db.activities[db.activities.indexOf(old)] = activity; else db.activities.unshift(activity);
    });
    return teacherSnapshot(db);
  },
  async deleteActivity(id) {
    await requireRoleSession('teacher');
    const db = await mutate(data => { const activity = ownedActivity(data, id); if (activity.type === 'exam') fail('পরীক্ষার রেকর্ড এখানে মুছতে বা পরিবর্তন করতে পারবেন না।'); data.activities = data.activities.filter(a => a.id !== id); });
    return teacherSnapshot(db);
  },
  async saveProgress(id, entries) {
    await requireRoleSession('teacher');
    const db = await mutate(db => {
      const activity = ownedActivity(db, id);
      if (activity.type === 'exam') fail('নম্বর ও ফলাফল কেবল Manager-approved Examination workflow-এ পরিবর্তন করা যাবে।');
      if (activity.status !== 'published' || activity.type === 'suggestion') fail('আগে কাজটি প্রকাশ করুন।');
      const allowed = roster().filter(s => matchesStudent(activity, s));
      for (const [studentId, entry] of Object.entries(entries)) {
        if (!allowed.some(s => s.id === studentId)) fail('শিক্ষার্থী এই শ্রেণি/বিভাগের অন্তর্ভুক্ত নয়।');
        const prev = activity.progress[studentId] || {};
        const isObj = entry && typeof entry === 'object' && !Array.isArray(entry);
        const raw = isObj ? (entry.value !== undefined ? entry.value : prev.value) : entry;
        const comment = isObj && entry.comment !== undefined ? String(entry.comment || '').trim() : String(prev.comment || '').trim();
        if (comment.length > 200) fail('মন্তব্য সর্বোচ্চ ২০০ অক্ষরের হতে পারে।');
        if (raw === '' || raw === undefined || raw === null) {
          if (comment && activity.type === 'homework') {
            activity.progress[studentId] = {
              ...prev,
              value: prev.value || 'pending',
              comment,
              attachmentUrl: String(prev.attachmentUrl || ''),
              updatedAt: new Date().toISOString()
            };
          } else {
            delete activity.progress[studentId];
          }
          continue;
        }
        const value = activity.type === 'exam' ? Number(raw) : raw;
        if (activity.type === 'exam' && (!['number', 'string'].includes(typeof raw) || !String(raw).trim() || !Number.isFinite(value) || value < 0 || value > activity.totalMarks || !Number.isInteger(value * 2))) fail('নম্বর শূন্য থেকে পূর্ণমানের মধ্যে দিন (০.৫ ধাপে)।');
        if (activity.type === 'homework' && !['pending', 'done', 'reviewed'].includes(value)) fail('জমার অবস্থা সঠিক নয়।');
        if (activity.type === 'routine' && !['present', 'absent', 'late'].includes(value)) fail('উপস্থিতির অবস্থা সঠিক নয়।');
        activity.progress[studentId] = {
          ...prev,
          value,
          ...(comment ? { comment } : {}),
          attachmentUrl: String(prev.attachmentUrl || ''),
          updatedAt: new Date().toISOString()
        };
        if (!comment) delete activity.progress[studentId].comment;
      }
    });
    return teacherSnapshot(db);
  },
  async markHomeworkDone(id, student, submission = {}) {
    const actual = await authenticatedStudent(student?.id);
    const rawAnswer = typeof submission === 'string' ? submission : submission?.answer;
    const answer = rawAnswer !== undefined ? String(rawAnswer || '').trim() : undefined;
    if (answer !== undefined && answer.length > 500) fail('লিখিত উত্তর সর্বোচ্চ ৫০০ অক্ষরের হতে পারে।');
    const attachmentUrl = typeof submission === 'object' && submission?.attachmentUrl !== undefined
      ? String(submission.attachmentUrl || '').trim()
      : undefined;
    if (attachmentUrl && (attachmentUrl.length > 1000 || !safeResourceURL(attachmentUrl))) fail('সংযুক্তি লিংক সঠিক নয়।');
    const db = await mutate(db => {
      const activity = db.activities.find(item => item.id === id);
      if (!activity || activity.type !== 'homework' || activity.status !== 'published'
        || !matchesStudent(activity, actual)
        || !approvedRoster().some(row => row.id === actual.id && matchesStudent(activity, row))) {
        fail('এই বাড়ির কাজ সম্পন্ন জানানোর অনুমতি নেই।');
      }
      const prev = activity.progress[actual.id] || {};
      if (prev.value === 'reviewed') return;
      const finalAnswer = answer !== undefined ? answer : String(prev.answer || '').trim();
      const finalAttachment = attachmentUrl !== undefined ? attachmentUrl : String(prev.attachmentUrl || '');
      activity.progress[actual.id] = {
        ...prev,
        value: 'done',
        ...(finalAnswer ? { answer: finalAnswer } : {}),
        attachmentUrl: finalAttachment,
        updatedAt: new Date().toISOString()
      };
      if (!finalAnswer) delete activity.progress[actual.id].answer;
    });
    return studentSnapshot(db, actual);
  }
};
export function watchTeachingData(callback) {
  window.addEventListener('storage', event => {
    if ([null, TEACHING_KEY, STORAGE_KEYS.account, STORAGE_KEYS.student, 'activePlus.manager.teacherAssignments.v1'].includes(event.key)) callback();
  });
  window.addEventListener('teaching-data-updated', callback);
}
