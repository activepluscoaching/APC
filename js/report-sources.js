/* Reports System — data source layer.

   Every number a report prints is computed here, straight from the app's own
   records (roster, transactions, exams, attempts, teaching activities, notices,
   routine, staff accounts). Nothing is hard-coded: an empty browser produces an
   empty report, and each record is counted exactly once because every filter
   walks one source list once and every total is reduced over the already
   filtered list.

   The module is deliberately free of DOM work so it can be unit-tested. */
import { toBanglaNumber as bn } from './ui.js';
import { MONTHS, DEFAULT_MONTHLY_FEE, latinDigits } from './finance-data.js';
import { loadRoster, loadNotices, loadRoutine } from './office-data.js';
import { listDocuments } from './database.js';
import { enabledClasses } from './config.js';
import { loadAppConfig } from './storage.js';
import { totalMarks, gradeFor, EXAM_TYPES, EXAM_STATUSES } from './exam-data.js';

export const DAY_MS = 86400000;

/* ---------- numbers and dates ---------- */

export const number = value => {
  const parsed = Number(latinDigits(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const money = value => `৳${bn(Math.round(Number(value) || 0).toLocaleString('en-US'))}`;

/** Bangla "২২ সেপ্টেম্বর ২০২৬" / ISO "2026-09-22" / timestamp → timestamp. */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = latinDigits(String(value)).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const time = new Date(`${text}T12:00:00`).getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (/^\d+$/.test(text) && text.length >= 10) return Number(text);
  const parts = text.split(/[\s,/.-]+/).filter(Boolean);
  if (parts.length >= 3) {
    const monthIndex = MONTHS.findIndex(name => text.includes(name) || parts.includes(String(MONTHS.indexOf(name))));
    const day = Number(parts.find(part => /^\d{1,2}$/.test(part) && Number(part) <= 31));
    const year = Number(parts.find(part => /^\d{4}$/.test(part)));
    if (monthIndex >= 0 && day && year) {
      const time = new Date(year, monthIndex, day, 12, 0, 0).getTime();
      if (!Number.isNaN(time)) return time;
    }
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

const pad = value => String(value).padStart(2, '0');

export const isoDay = time => {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function formatDate(time) {
  const parsed = parseDate(time);
  if (parsed === null) return '—';
  const date = new Date(parsed);
  return `${bn(date.getDate())} ${MONTHS[date.getMonth()]} ${bn(date.getFullYear())}`;
}

export const startOfDay = time => { const d = new Date(time); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const endOfDay = time => { const d = new Date(time); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const monthLabelOf = time => { const d = new Date(time); return `${MONTHS[d.getMonth()]} ${bn(d.getFullYear())}`; };

/** The Bangladeshi week runs Saturday → Friday. */
export function weekRange(time) {
  const day = new Date(time);
  const shift = (day.getDay() + 1) % 7; // 0 on Saturday
  const start = startOfDay(day.getTime() - shift * DAY_MS);
  return { from: start, to: endOfDay(start + 6 * DAY_MS) };
}

export function monthRange(time) {
  const day = new Date(time);
  const from = new Date(day.getFullYear(), day.getMonth(), 1).getTime();
  const to = endOfDay(new Date(day.getFullYear(), day.getMonth() + 1, 0).getTime());
  return { from, to };
}

/**
 * Resolve a period selection into an inclusive timestamp range.
 * `controls` carries the raw input values (day / week / month / from / to).
 */
export function periodRange(period, controls = {}, now = Date.now()) {
  if (period === 'all') return { from: -Infinity, to: Infinity, label: 'সব সময়' };
  if (period === 'daily') {
    const day = parseDate(controls.date) ?? now;
    return { from: startOfDay(day), to: endOfDay(day), label: formatDate(day) };
  }
  if (period === 'weekly') {
    const day = parseDate(controls.week) ?? now;
    const { from, to } = weekRange(day);
    return { from, to, label: `${formatDate(from)} – ${formatDate(to)}` };
  }
  if (period === 'monthly') {
    const month = controls.month || isoDay(now).slice(0, 7);
    const [year, index] = month.split('-').map(Number);
    const base = Number.isFinite(year) && Number.isFinite(index)
      ? new Date(year, Math.min(11, Math.max(0, index - 1)), 1, 12).getTime()
      : now;
    const { from, to } = monthRange(base);
    return { from, to, label: monthLabelOf(from) };
  }
  if (period === 'custom') {
    const rawFrom = parseDate(controls.from);
    const rawTo = parseDate(controls.to);
    const from = rawFrom === null ? -Infinity : startOfDay(rawFrom);
    const to = rawTo === null ? Infinity : endOfDay(rawTo);
    return { from, to, label: `${rawFrom === null ? 'শুরু থেকে' : formatDate(from)} – ${rawTo === null ? 'আজ পর্যন্ত' : formatDate(to)}` };
  }
  return { from: -Infinity, to: Infinity, label: 'সব সময়' };
}

/** Inclusive range test that tolerates records with no usable timestamp. */
export function inRange(time, range) {
  if (!range) return true;
  if (range.from === -Infinity && range.to === Infinity) return true;
  if (time === null || time === undefined) return false;
  return time >= range.from && time <= range.to;
}

/* ---------- snapshots ---------- */

/** Read every collection a report can draw on, in one pass. */
export function loadSnapshot() {
  return {
    students: loadRoster(),
    transactions: listDocuments('transactions'),
    notices: loadNotices(),
    routine: loadRoutine(),
    teaching: readTeaching(),
    exams: readExams(),
    appConfig: loadAppConfig()
  };
}

/* The teaching and exam stores keep their own versioned envelope; read them
   defensively so a report never breaks the panel when a store is corrupt. */
function readTeaching() {
  try {
    const raw = window.localStorage.getItem('activePlus.teaching.v1');
    if (!raw) return { activities: [] };
    const db = JSON.parse(raw);
    return Array.isArray(db?.activities) ? db : { activities: [] };
  } catch { return { activities: [] }; }
}

function readExams() {
  try {
    const raw = window.localStorage.getItem('activePlus.exams.v1');
    if (!raw) return { exams: [], attempts: [] };
    const db = JSON.parse(raw);
    return {
      exams: Array.isArray(db?.exams) ? db.exams : [],
      attempts: Array.isArray(db?.attempts) ? db.attempts : []
    };
  } catch { return { exams: [], attempts: [] }; }
}

/* ---------- record helpers ---------- */

/** Machine time wins; the printed Bangla date is the fallback. */
export function txTime(tx) {
  if (Number.isFinite(tx?.recordedAt)) return tx.recordedAt;
  if (Number.isFinite(tx?.createdAt)) return tx.createdAt;
  const parsed = tx?.createdAt ? Date.parse(tx.createdAt) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return parseDate(tx?.date);
}

export function studentEnrolledAt(student) {
  return parseDate(student?.enrolledAt) ?? parseDate(student?.createdAt);
}

export function activityTime(activity) {
  const base = parseDate(activity?.date);
  if (base === null) return null;
  if (activity?.time && /^\d{2}:\d{2}$/.test(activity.time)) {
    const [hour, minute] = activity.time.split(':').map(Number);
    return base + hour * 3600000 + minute * 60000;
  }
  return base;
}

export function monthlyFeeOf(student) {
  const configured = Number(student?.monthlyFee);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_MONTHLY_FEE;
}

/**
 * Fee position of one student for one month. Each transaction is counted once:
 * the month is matched on the ledger's own month label, so a payment recorded
 * for another month can never cancel this month's due.
 */
export function dueSummary(student, transactions, month) {
  const own = transactions.filter(tx => tx.studentId === student.id);
  const monthlyTx = own.filter(tx => tx.month === month && tx.feeType === 'মাসিক বেতন');
  const tuitionPaid = monthlyTx.reduce((sum, tx) => sum + number(tx.amount), 0);
  const monthlyFee = monthlyFeeOf(student);
  const anyPaid = own.filter(tx => tx.month === month).reduce((sum, tx) => sum + number(tx.amount), 0);
  return {
    month,
    monthlyFee,
    tuitionPaid,
    paid: anyPaid,
    due: Math.max(0, monthlyFee - tuitionPaid),
    lastPayment: own.map(tx => txTime(tx) || 0).sort((a, b) => b - a)[0] || null
  };
}

export const studentStatusLabel = Object.freeze({
  approved: 'অনুমোদিত',
  active: 'অনুমোদিত',
  pending: 'অপেক্ষমাণ',
  rejected: 'বাতিল'
});

export function studentBatchOf(student) { return student?.group || 'সাধারণ'; }

/* ---------- exams ---------- */

export const examTime = exam => Number(exam?.startAt) || null;
export const examEndTime = exam => Number(exam?.endAt) || null;
export const examDuration = exam => {
  const start = examTime(exam), end = examEndTime(exam);
  if (start === null || end === null || end <= start) return '—';
  const minutes = Math.round((end - start) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${bn(hours)} ঘণ্টা ${bn(minutes % 60)} মিনিট` : `${bn(minutes)} মিনিট`;
};
export { totalMarks, gradeFor, EXAM_TYPES, EXAM_STATUSES };

/* A finished paper keeps its results and reports: 'completed' is published
   plus a workflow stamp, not a different visibility. */
export const isPublishedExam = exam => exam?.status === 'published' || exam?.status === 'completed';
export const isTakenExam = exam => isPublishedExam(exam) && (examEndTime(exam) ?? Infinity) < Date.now();
export const isUpcomingExam = exam => isPublishedExam(exam) && (examTime(exam) ?? 0) > Date.now();

export function submittedAttempts(attempts, examId) {
  return attempts.filter(a => a.examId === examId && a.status === 'submitted');
}

/** Best attempt per student (a retry never double-counts a student). */
export function bestAttempts(attempts, examId) {
  const best = new Map();
  for (const attempt of submittedAttempts(attempts, examId)) {
    if (!best.has(attempt.studentId) || Number(attempt.score) > Number(best.get(attempt.studentId).score)) {
      best.set(attempt.studentId, attempt);
    }
  }
  return [...best.values()].sort((a, b) => Number(b.score) - Number(a.score) || (a.finishedAt || 0) - (b.finishedAt || 0));
}

export function resultFor(exam, attempt) {
  const total = totalMarks(exam);
  const score = Number(attempt?.score) || 0;
  const percent = total ? score / total * 100 : 0;
  return {
    score,
    total,
    percent,
    percentLabel: total ? `${bn(percent.toFixed(1))}%` : '—',
    grade: gradeFor(score, total, exam?.passPercent ?? 33),
    pass: total ? percent >= (exam?.passPercent ?? 33) : false
  };
}

/**
 * Question-by-question performance for one attempt.
 * `unanswered` questions carry a null student answer and never earn marks.
 */
export function questionBreakdown(exam, attempt, { withOptions = true } = {}) {
  const negative = Number(exam?.negative) || 0;
  const questions = exam?.questions || [];
  return questions.map((question, index) => {
    const chosen = attempt?.answers?.[question.id] || null;
    const correct = Boolean(chosen) && chosen === question.answer;
    const unanswered = !chosen;
    let obtained = 0;
    if (exam.type === 'mcq') {
      if (correct) obtained = question.marks;
      else if (!unanswered) obtained = -negative;
    } else {
      obtained = Number(attempt?.questionScores?.[question.id]) || 0;
    }
    return {
      no: bn(index + 1),
      text: question.text,
      marks: question.marks,
      options: withOptions ? (question.options || []).map(option => ({ ...option })) : [],
      answer: question.answer || null,
      chosen,
      chosenText: chosen ? (question.options || []).find(o => o.id === chosen)?.text || chosen : null,
      answerText: (question.options || []).find(o => o.id === question.answer)?.text || question.answer || '—',
      status: unanswered ? 'অনুত্তরিত' : correct ? 'সঠিক' : 'ভুল',
      state: unanswered ? 'unanswered' : correct ? 'correct' : 'wrong',
      obtained,
      explanation: question.explanation || ''
    };
  });
}

/** Aggregate MCQ counters for one attempt (each question counted once). */
export function attemptCounters(exam, attempt) {
  const rows = questionBreakdown(exam, attempt, { withOptions: false });
  const attempted = rows.filter(row => row.state !== 'unanswered').length;
  const correct = rows.filter(row => row.state === 'correct').length;
  const wrong = rows.filter(row => row.state === 'wrong').length;
  const unanswered = rows.length - attempted;
  const total = rows.length;
  return {
    total,
    totalLabel: bn(total),
    attempted: bn(attempted),
    correct: bn(correct),
    wrong: bn(wrong),
    unanswered: bn(unanswered),
    accuracy: attempted ? `${bn(Math.round(correct / attempted * 100))}%` : '—',
    accuracyOfTotal: total ? `${bn(Math.round(correct / total * 100))}%` : '—',
    obtained: bn(Math.round(Number(attempt?.score) || 0)),
    marks: bn(totalMarks(exam))
  };
}

/* ---------- teaching ---------- */

export const ACTIVITY_LABELS = Object.freeze({
  exam: 'পরীক্ষা',
  homework: 'বাড়ির কাজ',
  suggestion: 'সাজেশন',
  routine: 'ক্লাস'
});

export const PROGRESS_TEXT = Object.freeze({
  pending: 'বাকি',
  done: 'জমা দিয়েছে',
  reviewed: 'দেখা হয়েছে',
  present: 'উপস্থিত',
  absent: 'অনুপস্থিত',
  late: 'দেরিতে উপস্থিত'
});

export function attendanceStats(activity) {
  const counts = { present: 0, absent: 0, late: 0 };
  for (const entry of Object.values(activity?.progress || {})) {
    if (entry?.value in counts) counts[entry.value]++;
  }
  const total = counts.present + counts.absent + counts.late;
  return { ...counts, total, rate: total ? Math.round((counts.present + counts.late) / total * 100) : 0 };
}

/* ---------- option lists for the filter bar ---------- */

export function distinctBatches(students) {
  return [...new Set(students.map(studentBatchOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bn'));
}

export function distinctClasses(students) {
  const used = new Set(students.map(s => s.className).filter(Boolean));
  return enabledClasses.filter(name => used.has(name) || true);
}

export function distinctSubjects(snapshot) {
  const subjects = new Set();
  for (const exam of snapshot.exams?.exams || []) if (exam.subject) subjects.add(exam.subject);
  for (const activity of snapshot.teaching?.activities || []) if (activity.subject) subjects.add(activity.subject);
  for (const day of Object.values(snapshot.routine || {})) {
    for (const cls of day?.classes || []) if (cls.subject) subjects.add(cls.subject);
  }
  return [...subjects].sort((a, b) => a.localeCompare(b, 'bn'));
}

export function distinctTeachers(snapshot) {
  const teachers = new Set();
  for (const exam of snapshot.exams?.exams || []) if (exam.teacherName) teachers.add(exam.teacherName);
  for (const activity of snapshot.teaching?.activities || []) if (activity.teacherName) teachers.add(activity.teacherName);
  for (const day of Object.values(snapshot.routine || {})) {
    for (const cls of day?.classes || []) if (cls.teacher) teachers.add(cls.teacher);
  }
  return [...teachers].sort((a, b) => a.localeCompare(b, 'bn'));
}

/** Cash counters are the people/roles that actually collected money. */
export function distinctCounters(transactions) {
  return [...new Set(transactions.map(tx => tx.collectedBy).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bn'));
}

export { enabledClasses };
