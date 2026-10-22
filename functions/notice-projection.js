/* Pure, fail-closed projection helpers for authenticated RTDB v2 Notices
 * (docs/RTDB-PER-USER-RULES-PLAN.md §5 & database.rules.v2.draft.json).
 *
 * Canonical `activePlusV2/notices` is staff-readable only because notices can
 * carry class/group targets or staff-only metadata. Approved students read only
 * their server-projected `activePlusV2/studentNotices/<studentId>` subtree, and
 * Teachers draft privately under `activePlusV2/noticeDraftsByAuthor/<uid>` and
 * promote via the assignment-checking `publishNotice` callable. */
'use strict';

const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const STUDENT_AUDIENCES = new Set(['সকল শিক্ষার্থী', 'অভিভাবক', 'শিক্ষার্থী ও অভিভাবক']);
const NOTICE_CATEGORIES = new Set(['urgent', 'academic', 'class', 'fee', 'exam']);
const ALL_CLASS_TOKENS = new Set([
  '', 'all', 'সকল শ্রেণি', 'সব শ্রেণি', 'সকল', 'সব', 'সব ক্লাস', 'সকল ক্লাস', '—', '-'
]);
const ALL_SECTION_TOKENS = new Set([
  '', 'all', 'সকল', 'সব', 'সকল বিভাগ', 'সব বিভাগ', 'সকল শাখা', 'সব শাখা', 'উভয়', '—', '-'
]);
const CLASS_ALIASES = Object.freeze({
  'class-8': 'অষ্টম শ্রেণি', '8': 'অষ্টম শ্রেণি', '০৮': 'অষ্টম শ্রেণি', '08': 'অষ্টম শ্রেণি',
  'ssc-9': 'নবম শ্রেণি', 'class-9': 'নবম শ্রেণি', '9': 'নবম শ্রেণি', '০৯': 'নবম শ্রেণি', '09': 'নবম শ্রেণি',
  'ssc-10': 'দশম শ্রেণি', 'class-10': 'দশম শ্রেণি', '10': 'দশম শ্রেণি', '১০': 'দশম শ্রেণি',
  'hsc-1': 'একাদশ শ্রেণি', 'class-11': 'একাদশ শ্রেণি', '11': 'একাদশ শ্রেণি', '১১': 'একাদশ শ্রেণি',
  'hsc-2': 'দ্বাদশ শ্রেণি', 'class-12': 'দ্বাদশ শ্রেণি', '12': 'দ্বাদশ শ্রেণি', '১২': 'দ্বাদশ শ্রেণি'
});
const SECTION_ALIASES = Object.freeze({
  science: 'বিজ্ঞান', sci: 'বিজ্ঞান',
  humanities: 'মানবিক', arts: 'মানবিক',
  commerce: 'ব্যবসায় শিক্ষা', business: 'ব্যবসায় শিক্ষা',
  'business studies': 'ব্যবসায় শিক্ষা', 'ব্যবসায় শিক্ষা': 'ব্যবসায় শিক্ষা'
});

const object = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeKey = value => typeof value === 'string' && SAFE_KEY.test(value);
const cleanText = (value, max = 2000) => String(value ?? '')
  .normalize('NFC')
  .replace(/\u09af\u09bc/g, '\u09df')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

function normalizeClassKey(input) {
  const rawField = object(input)
    ? (input.classId || input.className || input.class || input.targetClass || '')
    : input;
  let raw = cleanText(rawField, 80);
  if (!raw || ALL_CLASS_TOKENS.has(raw.toLocaleLowerCase('en-US'))) return '';
  if (/^CLASS[\s-]+/i.test(raw)) raw = cleanText(raw.replace(/^CLASS[\s-]+/i, ''), 80);
  const alias = CLASS_ALIASES[raw.toLocaleLowerCase('en-US')];
  return (alias || raw).toLocaleLowerCase('en-US');
}

function normalizeSectionKey(input) {
  const rawField = object(input)
    ? (input.sectionId || input.group || input.section || input.batch || input.targetGroup || input.targetSection || '')
    : input;
  let raw = cleanText(rawField, 80);
  if (!raw || ALL_SECTION_TOKENS.has(raw.toLocaleLowerCase('en-US'))) return '';
  raw = cleanText(raw.replace(/\s*(?:বিভাগ|শাখা|গ্রুপ|group|section)$/i, ''), 80);
  if (!raw || ALL_SECTION_TOKENS.has(raw.toLocaleLowerCase('en-US'))) return '';
  const alias = SECTION_ALIASES[raw.toLocaleLowerCase('en-US')];
  return (alias || raw).toLocaleLowerCase('en-US');
}

function normalizeTimestamp(value, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  const str = cleanText(value, 64);
  if (str) return str;
  return fallback;
}

function normalizeCategory(value, urgentFlag = false) {
  const raw = cleanText(value, 40).toLocaleLowerCase('en-US');
  if (NOTICE_CATEGORIES.has(raw)) return raw;
  if (urgentFlag === true) return 'urgent';
  return 'academic';
}

function normalizeNoticeRecord(input, { id = input?.id } = {}) {
  if (!object(input)) throw new TypeError('notice must be an object');
  const noticeId = cleanText(id, 128);
  if (!safeKey(noticeId) || cleanText(input.id, 128) !== noticeId) {
    throw new TypeError('notice id does not match its safe key');
  }
  if (input.published !== true || input.status === 'draft') {
    throw new TypeError('canonical notice must be published');
  }
  const title = cleanText(input.title, 200);
  const body = cleanText(input.body ?? input.summary, 4000);
  if (!title) throw new TypeError('notice title is required');
  const classId = cleanText(input.classId || input.className, 80);
  const className = cleanText(input.className || classId, 80);
  const group = cleanText(input.group || input.sectionId, 80);
  const audience = cleanText(input.audience, 80) || 'সকল শিক্ষার্থী';
  const createdAt = normalizeTimestamp(input.createdAt, new Date(0).toISOString());
  const updatedAt = normalizeTimestamp(input.updatedAt, createdAt);
  return {
    id: noticeId,
    title,
    body,
    summary: cleanText(input.summary ?? body, 500),
    category: normalizeCategory(input.category, input.urgent),
    audience,
    classId,
    className,
    group,
    date: cleanText(input.date, 40),
    status: 'published',
    published: true,
    createdBy: cleanText(input.createdBy, 100) || 'অফিস',
    createdAt,
    updatedAt
  };
}

function normalizeNoticeDraft(input, { id = input?.id, authorUid = input?.authorUid } = {}) {
  if (!object(input)) throw new TypeError('notice draft must be an object');
  const noticeId = cleanText(id, 128);
  const uid = cleanText(authorUid, 128);
  if (!safeKey(noticeId) || cleanText(input.id, 128) !== noticeId) {
    throw new TypeError('notice draft id does not match its safe key');
  }
  if (!safeKey(uid) || cleanText(input.authorUid, 128) !== uid) {
    throw new TypeError('notice draft authorUid does not match authenticated author');
  }
  if (input.status !== 'draft' || input.published !== false) {
    throw new TypeError('notice draft must remain unpublished draft');
  }
  if (typeof input.classId !== 'string' || typeof input.group !== 'string') {
    throw new TypeError('notice draft requires string classId and group');
  }
  const title = cleanText(input.title, 200);
  if (!title) throw new TypeError('notice draft title is required');
  const body = cleanText(input.body ?? input.summary, 4000);
  const classId = cleanText(input.classId, 80);
  const className = cleanText(input.className || classId, 80);
  const group = cleanText(input.group, 80);
  const createdAt = normalizeTimestamp(input.createdAt, new Date(0).toISOString());
  const updatedAt = normalizeTimestamp(input.updatedAt, createdAt);
  return {
    id: noticeId,
    authorUid: uid,
    title,
    body,
    summary: cleanText(input.summary ?? body, 500),
    category: normalizeCategory(input.category, input.urgent),
    audience: cleanText(input.audience, 80) || 'সকল শিক্ষার্থী',
    classId,
    className,
    group,
    date: cleanText(input.date, 40),
    status: 'draft',
    published: false,
    createdBy: cleanText(input.createdBy, 100) || 'শিক্ষক',
    createdAt,
    updatedAt
  };
}

function publicStudentNoticeCopy(notice) {
  return {
    id: notice.id,
    title: notice.title,
    body: notice.body,
    summary: notice.summary,
    category: notice.category,
    audience: notice.audience,
    classId: notice.classId,
    className: notice.className,
    group: notice.group,
    date: notice.date,
    status: 'published',
    published: true,
    createdBy: notice.createdBy,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt
  };
}

function noticeMatchesStudent(notice, student) {
  if (!object(notice) || !object(student) || student.status !== 'approved' || notice.published !== true) {
    return false;
  }
  const audience = cleanText(notice.audience, 80);
  if (audience && !STUDENT_AUDIENCES.has(audience)) return false;
  const studentClass = normalizeClassKey(student);
  if (!studentClass) return false;
  const noticeClass = normalizeClassKey(notice);
  if (noticeClass && noticeClass !== studentClass) return false;
  const noticeGroup = normalizeSectionKey(notice);
  if (noticeGroup && noticeGroup !== normalizeSectionKey(student)) return false;
  return true;
}

function assignmentMatchesNotice(assignment, teacherId, notice) {
  if (!object(assignment) || !object(notice) || !safeKey(teacherId)) return false;
  if (cleanText(assignment.teacherId, 128) !== teacherId) return false;
  const noticeClass = normalizeClassKey(notice);
  // Teachers cannot broadcast institution-wide unscoped notices; their notice
  // must target an assigned class (and matching or class-wide section).
  if (!noticeClass) return false;
  if (normalizeClassKey(assignment) !== noticeClass) return false;
  const assignmentGroup = normalizeSectionKey(assignment);
  const noticeGroup = normalizeSectionKey(notice);
  return noticeGroup ? (!assignmentGroup || assignmentGroup === noticeGroup) : !assignmentGroup;
}

function noticeMatchesTeacher(notice, teacherId, assignments) {
  const rows = Array.isArray(assignments)
    ? assignments
    : (object(assignments) ? Object.values(assignments) : []);
  return rows.some(assignment => assignmentMatchesNotice(assignment, teacherId, notice));
}

function buildStudentNoticeProjection(notices, student) {
  const projection = {};
  for (const [key, value] of Object.entries(notices || {})) {
    if (!safeKey(key) || !object(value) || value.id !== key || !noticeMatchesStudent(value, student)) continue;
    try {
      projection[key] = publicStudentNoticeCopy(normalizeNoticeRecord(value, { id: key }));
    } catch { /* malformed canonical rows fail closed */ }
  }
  return projection;
}

function buildNoticeFanout({ noticeId, before = null, after = null, students = {} } = {}) {
  if (!safeKey(noticeId)) throw new TypeError('unsafe notice id');
  const previous = object(before) && before.id === noticeId ? before : null;
  const next = object(after) && after.id === noticeId ? after : null;
  const studentRows = Object.entries(object(students) ? students : {});
  const updates = {};

  for (const [studentId, student] of studentRows) {
    if (!safeKey(studentId) || !object(student) || (student.id && String(student.id) !== studentId)) continue;
    const wasTarget = previous && noticeMatchesStudent(previous, student);
    const isTarget = next && noticeMatchesStudent(next, student);
    if (!wasTarget && !isTarget) continue;
    updates[`studentNotices/${studentId}/${noticeId}`] = isTarget
      ? publicStudentNoticeCopy(normalizeNoticeRecord(next, { id: noticeId }))
      : null;
  }
  return updates;
}

function canonicalJSON(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
}

/**
 * Remove the private Teacher draft after `publishNotice` promotes it ONLY when
 * the stored draft is still byte-identical to the draft snapshot that was just
 * published. If the Teacher edited the draft while `publishNotice` was in
 * flight, return `undefined` so the newer draft stays queued for republishing.
 */
function advanceNoticeDraftAfterPublish(current, { authorUid, noticeId, publishedDraft } = {}) {
  if (!object(current) || !object(publishedDraft)) return undefined;
  if (current.authorUid !== authorUid || current.id !== noticeId) return undefined;
  if (current.status !== 'draft' || current.published !== false) return undefined;
  if (canonicalJSON(current) !== canonicalJSON(publishedDraft)) return undefined;
  return null;
}

module.exports = {
  SAFE_KEY,
  safeKey,
  normalizeClassKey,
  normalizeSectionKey,
  normalizeNoticeRecord,
  normalizeNoticeDraft,
  publicStudentNoticeCopy,
  noticeMatchesStudent,
  assignmentMatchesNotice,
  noticeMatchesTeacher,
  buildStudentNoticeProjection,
  buildNoticeFanout,
  canonicalJSON,
  advanceNoticeDraftAfterPublish
};
