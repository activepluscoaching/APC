/* Exam identity and paper order.
   ---------------------------------------------------------------------------
   This module owns the two things every exam record needs to stay traceable
   and fair:

   1. The permanent Exam Code, e.g. `M2608BN01`
        M  = exam type   (M = MCQ, S = সংক্ষিপ্ত, R = সৃজনশীল/লিখিত)
        26 = year (last two digits, Asia/Dhaka)
        08 = class code   (from Academic Setup)
        BN = subject code (from Academic Setup)
        01 = serial inside that type+year+class+subject
      It is written once and then locked: renaming a class or moving a paper to
      another date never changes the code a printed paper already carries.

   2. The per-attempt order of questions and options. The order is derived
      from a seed (exam code + student id + attempt id) instead of pure chance,
      so a resumed attempt on another device re-renders exactly the same paper.
      Only the *position* is shuffled — every question and option keeps the id
      it was written with, so answers are always stored as option ids.

   No DOM, no storage writes: everything here is pure and unit-tested. */
const DHAKA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` in Asia/Dhaka — the timezone every exam record is filed in. */
export function dhakaDateKey(value = Date.now()) {
  return DHAKA_DATE.format(new Date(value));
}

export const EXAM_CODE_PREFIXES = Object.freeze({ mcq: 'M', short: 'S', written: 'R' });
export const DEFAULT_EXAM_CODE_PREFIX = 'X';

const text = value => String(value ?? '').trim();

/** Latin, upper-case prefix for an exam type (`M`/`S`/`R`, `X` if unknown). */
export function examTypePrefix(type) {
  return EXAM_CODE_PREFIXES[text(type)] || DEFAULT_EXAM_CODE_PREFIX;
}

/** Two-digit year of a date, in Asia/Dhaka (the app's exam timezone). */
export function examCodeYear(value = Date.now()) {
  return dhakaDateKey(value).slice(2, 4);
}

/** Class/subject codes are stored in Academic Setup; keep them code-safe. */
export function safeCodePart(value, fallback = '00') {
  const clean = text(value).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return clean.slice(0, 6) || fallback;
}

export function examCodeFor({ type, startAt, examDate, classCode, subjectCode, serial }) {
  const year = examCodeYear(startAt ?? (examDate ? `${examDate}T00:00:00+06:00` : Date.now()));
  const number = Math.max(1, Math.floor(Number(serial) || 1));
  return `${examTypePrefix(type)}${year}${safeCodePart(classCode)}${safeCodePart(subjectCode, 'XX')}${String(number).padStart(2, '0')}`;
}

/** Reverse lookup for the archive/detail screens. Never fails: unknown codes
    simply come back with the raw prefix and no year. */
export function examCodeParts(code) {
  const raw = text(code);
  const match = /^([A-Za-z])(\d{2})(\d{2})([A-Za-z0-9]{2,4})(\d{2})$/.exec(raw);
  if (!match) return { raw, prefix: raw.slice(0, 1), year: '', classCode: '', subjectCode: '', serial: 0 };
  return { raw, prefix: match[1].toUpperCase(), year: match[2], classCode: match[3], subjectCode: match[4].toUpperCase(), serial: Number(match[5]) };
}

/* ---- code allocation -------------------------------------------------------- */
/** The serial scope of a code: two papers with the same type, year, class and
    subject must never share a code — even if one of them was deleted. */
export function examCodeScope({ type, startAt, examDate, classCode, subjectCode }) {
  return {
    prefix: examTypePrefix(type),
    year: examCodeYear(startAt ?? (examDate ? `${examDate}T00:00:00+06:00` : Date.now())),
    classCode: safeCodePart(classCode),
    subjectCode: safeCodePart(subjectCode, 'XX')
  };
}

/** Highest serial already used inside one scope (0 when the scope is new). */
export function highestExamSerial(exams, scope) {
  return (exams || []).reduce((highest, exam) => {
    const parts = examCodeParts(exam?.code);
    if (!parts.serial || parts.prefix !== scope.prefix || parts.year !== scope.year || parts.classCode !== scope.classCode || parts.subjectCode !== scope.subjectCode) return highest;
    return Math.max(highest, parts.serial);
  }, 0);
}

/** A code no stored exam carries. The serial walks forward until it is free,
    so a duplicated/incomplete old record can never make two exams collide. */
export function allocateExamCode(exams, input) {
  const scope = examCodeScope(input);
  const taken = new Set((exams || []).map(exam => text(exam?.code)).filter(Boolean));
  let serial = highestExamSerial(exams, scope) + 1;
  let code = examCodeFor({ ...input, serial });
  while (taken.has(code)) { serial += 1; code = examCodeFor({ ...input, serial }); }
  return { code, serial, ...scope };
}

/** The code of an existing exam never changes; only a record that has none gets one. */
export function ensureExamCode(exams, exam, { classCode, subjectCode } = {}) {
  const current = text(exam?.code);
  if (current) return { code: current, locked: true, allocated: false, ...examCodeParts(current) };
  const allocated = allocateExamCode((exams || []).filter(row => row !== exam), {
    type: exam?.type,
    startAt: exam?.startAt,
    examDate: exam?.examDate,
    classCode: classCode ?? exam?.classCode,
    subjectCode: subjectCode ?? exam?.subjectCode
  });
  return { ...allocated, locked: false, allocated: true };
}

/* ---- deterministic order ---------------------------------------------------- */
const FNV_OFFSET = 2166136261;
/** FNV-1a over the seed text: same seed, same paper, on every device. */
export function hashSeed(seed) {
  let hash = FNV_OFFSET;
  const source = String(seed ?? '');
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and deterministic across browsers. */
export function seededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(array, seed) {
  const copy = [...(array || [])];
  const random = seededRandom(seed);
  for (let index = copy.length - 1; index > 0; index--) {
    const pick = Math.floor(random() * (index + 1));
    [copy[index], copy[pick]] = [copy[pick], copy[index]];
  }
  return copy;
}

/** The seed of one student's paper. The attempt id keeps attempt 1 and the
    retry independent, while a resume of the same attempt stays identical. */
export function attemptOrderSeed(exam, studentId, attemptId) {
  return `${text(exam?.code) || text(exam?.id)}|${text(studentId)}|${text(attemptId)}`;
}

export const questionOrderMode = exam => (exam?.questionOrder === 'fixed' ? 'fixed' : 'shuffle');
export const optionOrderMode = exam => (exam?.optionOrder === 'fixed' ? 'fixed' : 'shuffle');

/** The order table stored on the attempt. Fixed mode keeps the paper order but
    still records it, so every attempt is self-describing and the archive never
    has to guess. */
export function orderPaperForAttempt(exam, studentId, attemptId) {
  const questions = [...(exam?.questions || [])];
  const seed = attemptOrderSeed(exam, studentId, attemptId);
  const ordered = questionOrderMode(exam) === 'fixed'
    ? questions
    : seededShuffle(questions, `${seed}|q`);
  return ordered.map((question, position) => ({
    id: question.id,
    options: optionOrderMode(exam) === 'fixed'
      ? (question.options || []).map(option => option.id)
      : seededShuffle((question.options || []).map(option => option.id), `${seed}|o|${question.id}|${position}`)
  }));
}

/** Option ids of one question as this attempt displayed them. */
export function attemptOptionOrder(attempt, questionId) {
  const row = (attempt?.order || []).find(item => item?.id === questionId);
  return Array.isArray(row?.options) ? [...row.options] : null;
}

/** The questions of an attempt in the order the student saw them. */
export function attemptQuestions(exam, attempt) {
  const byId = new Map((exam?.questions || []).map(question => [question.id, question]));
  const ordered = (attempt?.order || []).map(row => byId.get(row.id)).filter(Boolean);
  const missing = (exam?.questions || []).filter(question => !(attempt?.order || []).some(row => row.id === question.id));
  return [...ordered, ...missing];
}

/* ---- sequence ids ----------------------------------------------------------- */
/** `QUESTION-0001` style ids: the next number after the highest one stored. */
export function nextSequentialId(prefix, records, width = 4) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = (records || []).reduce((max, record) => {
    const match = pattern.exec(text(record?.id));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(width, '0')}`;
}

/** `HH:mm` in Asia/Dhaka — used on the paper header and in the wizard. */
export function timeLabel(value) {
  if (!Number.isFinite(Number(value))) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(Number(value));
}

/** Small `timeLabel` helpers so exams can store what they print. */
export function examStartTime(exam) { return timeLabel(exam?.startAt); }
export function examEndTime(exam) { return timeLabel(exam?.endAt); }
