import { dhakaKey, nowEpoch } from './time.js';
import { iconMarkup } from './icons.js';
/* Data-driven student home dashboard. The UI only shows records already stored
   for this student; absent classes, results or fees are never filled with demo values. */
import { loadRoutine, ROUTINE_KEY } from './office-data.js';
import { teachingRepository, publishedForStudent } from './teaching-data.js';
import { examRepository, examMatchesStudent, watchExams, isStudentVisibleExam, totalMarks } from './exam-data.js';
import { courseRepository, watchCourses } from './course-data.js';
import { matchesClassSection } from './class-key.js';
import { financeRepository, studentFeeSummary } from './finance-data.js';
import { toBanglaNumber as bn } from './ui.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const DAY_FOR_DATE = ['sun', 'mon', 'tue', 'wed', 'thu', null, 'sat'];
const DHAKA_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});
const TIME_TOKEN = /(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*(am|pm))?/gi;
const toLatinDigits = value => String(value ?? '').replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)));

function clockMinutes(hourValue, minuteValue, marker, context) {
  let hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  const cue = `${context || ''} ${marker || ''}`.toLowerCase();
  if (marker) {
    if (marker.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (marker.toLowerCase() === 'am' && hour === 12) hour = 0;
  } else if (hour <= 12 && /দুপুর|বিকেল|সন্ধ্যা|রাত/u.test(cue) && hour < 12) {
    hour += 12;
  } else if (hour === 12 && /ভোর|সকাল/u.test(cue)) {
    hour = 0;
  }
  return hour * 60 + minute;
}

/** Converts a saved routine's 24-hour start/range into Dhaka clock minutes. */
export function routineInterval(item = {}) {
  const context = `${item.period || ''} ${item.time || ''}`;
  const timeText = toLatinDigits(item.time);
  const matches = [...timeText.matchAll(TIME_TOKEN)];
  const raw = toLatinDigits(item.rawTime).match(/^(\d{1,2})\s*:\s*(\d{2})$/);
  const start = raw
    ? clockMinutes(raw[1], raw[2], '', context)
    : matches.length
      ? clockMinutes(matches[0][1], matches[0][2], matches[0][3], context)
      : null;
  if (start === null) return null;
  const rangeEnd = matches.length > 1
    ? clockMinutes(matches[1][1], matches[1][2], matches[1][3], context)
    : null;
  const duration = Number(item.duration);
  let end = rangeEnd ?? start + (Number.isFinite(duration) && duration > 0 ? duration : 60);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

/** True only while the saved class interval is active in Asia/Dhaka. */
export function isClassInProgress(item, at = nowEpoch()) {
  const interval = routineInterval(item);
  const epoch = at instanceof Date ? at.getTime() : Number(at);
  if (!interval || !Number.isFinite(epoch)) return false;
  const parts = Object.fromEntries(DHAKA_CLOCK.formatToParts(new Date(epoch)).map(part => [part.type, part.value]));
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return minute >= interval.start && minute < interval.end;
}

function iconFor(subject = '') {
  const text = String(subject).toLowerCase();
  if (/গণিত|math/.test(text)) return 'icon-trending';
  if (/পদার্থ|physics/.test(text)) return 'icon-award';
  if (/পরীক্ষা|test|exam/.test(text)) return 'icon-clipboard';
  return 'icon-book';
}

function routineTimeLabel(item) {
  const period = String(item.period || '').trim();
  let time = String(item.time || item.rawTime || '').trim();
  if (period && !time.includes(period)) time = `${period} ${time}`.trim();
  return time ? bn(time) : 'সময় নির্ধারিত নয়';
}

function roomLabel(value) {
  const room = String(value || '').trim();
  if (!room) return 'রুম নির্ধারিত নয়';
  return /^(?:রুম|কক্ষ|room)(?:\s|$)/iu.test(room) ? room : `রুম ${room}`;
}

function routineCard(item, index, kind = 'class', at = nowEpoch()) {
  const title = kind === 'teacher' ? item.title : item.subject;
  const subtitle = kind === 'teacher'
    ? [item.subject, item.teacherName || item.teacher].filter(Boolean).join(' · ')
    : item.teacher || 'শিক্ষক নির্ধারিত';
  const timeAndRoom = `${routineTimeLabel(item)} · ${roomLabel(item.room)}`;
  const running = isClassInProgress(item, at);
  const status = running ? 'চলছে' : kind === 'teacher' ? 'শিক্ষকের কাজ' : 'রুটিনে আছে';
  return `<article class="dashboard-routine-card" data-dashboard-class="${esc(item.id || index)}">
    <span class="dashboard-routine-icon tone-${index % 3}" aria-hidden="true">${iconMarkup(iconFor(title))}</span>
    <span class="dashboard-routine-main">
      <span class="dashboard-routine-status${running ? ' is-running' : ''}" data-routine-status="${running ? 'running' : 'scheduled'}"><i></i>${status}</span>
      <strong>${esc(title)}</strong><small>${esc(subtitle)}</small><span class="dashboard-time-pill">${esc(timeAndRoom)}</span>
    </span>
  </article>`;
}

function renderRoutine(student, teachingActivities, at = nowEpoch()) {
  const today = dhakaKey(at);
  const key = DAY_FOR_DATE[new Date(`${today}T12:00:00Z`).getUTCDay()];
  const dayClasses = key ? loadRoutine()[key]?.classes || [] : [];
  const officeClasses = student ? dayClasses.filter(item => matchesClassSection(item, student)) : dayClasses;
  const teacherClasses = teachingActivities.filter(item => item.type === 'routine' && item.date === today);
  const cards = [
    ...officeClasses.map((item, index) => routineCard(item, index, 'class', at)),
    ...teacherClasses.map((item, index) => routineCard(item, officeClasses.length + index, 'teacher', at))
  ];
  const root = $('#dashboardRoutineList');
  if (!root) return cards.length;
  // Presentation state only: the empty home can fill the first screen without
  // inventing classes or changing which real office/teacher records qualify.
  $('#homeView')?.classList.toggle('is-empty-routine', cards.length === 0);
  root.dataset.state = cards.length ? 'ready' : 'empty';
  root.innerHTML = cards.length
    ? cards.join('')
    : `<article class="challenge-card dashboard-empty-card"><span class="challenge-icon dashboard-empty-icon" aria-hidden="true">${iconMarkup("calendar")}</span><span class="challenge-copy dashboard-empty-copy"><strong>আজ কোনো ক্লাস নেই</strong><small>সব রুটিন দেখতে রুটিন খুলুন।</small></span><button class="challenge-open" type="button" data-view="routine" aria-label="সব রুটিন দেখুন">${iconMarkup("chevron-right", "apc-icon-svg", { variant: "glyph" })}</button></article>`;
  return cards.length;
}


export function calculateStudentHomeStats({
  student = {},
  activities = [],
  examDb = { exams: [], attempts: [] },
  courses = [],
  routine = {},
  now = new Date()
} = {}) {
  const studentId = String(student?.id || '');
  const scopedActivities = Array.isArray(activities) ? activities : [];
  const homework = scopedActivities.filter(item => item.type === 'homework');
  const doneCount = homework.filter(item => ['done', 'reviewed'].includes(item.progress?.[studentId]?.value)).length;
  const pendingCount = Math.max(0, homework.length - doneCount);

  // 1. Attendance %
  const attendanceActivities = scopedActivities.filter(item =>
    item.type === 'routine' && ['present', 'late', 'absent'].includes(item.progress?.[studentId]?.value)
  );
  const attendedCount = attendanceActivities.filter(item =>
    ['present', 'late'].includes(item.progress?.[studentId]?.value)
  ).length;
  const attendancePercent = attendanceActivities.length > 0
    ? Math.round((attendedCount / attendanceActivities.length) * 100)
    : null;
  const attendanceLabel = attendancePercent === null ? '—' : `${bn(attendancePercent)}%`;

  // 2. Average Result %
  const scorePercents = [];
  for (const act of scopedActivities) {
    if (act.type === 'exam' && Number(act.totalMarks) > 0) {
      const val = act.progress?.[studentId]?.value;
      if (typeof val === 'number' && Number.isFinite(val)) {
        scorePercents.push((val / Number(act.totalMarks)) * 100);
      }
    }
  }
  const examsList = Array.isArray(examDb?.exams) ? examDb.exams : [];
  const attemptsList = Array.isArray(examDb?.attempts) ? examDb.attempts : [];
  for (const att of attemptsList) {
    if (att?.studentId !== studentId || att?.status !== 'submitted') continue;
    const ex = examsList.find(e => e.id === att.examId);
    if (!ex) continue;
    const total = Number(att.total) || totalMarks(ex) || 0;
    if (total > 0 && Number.isFinite(Number(att.score))) {
      scorePercents.push((Number(att.score) / total) * 100);
    }
  }
  const averageResultPercent = scorePercents.length > 0
    ? Math.round(scorePercents.reduce((a, b) => a + b, 0) / scorePercents.length)
    : null;
  const averageResultLabel = averageResultPercent === null ? '—' : `${bn(averageResultPercent)}%`;

  // 3. Weekly Progress % (last 7 days homework + attendance sessions)
  const refTime = now instanceof Date ? now.getTime() : nowEpoch();
  const todayStr = dhakaKey(refTime);
  const weekAgoStr = dhakaKey(refTime - 7 * 86400000);
  const weeklyItems = scopedActivities.filter(item =>
    ['homework', 'routine'].includes(item.type)
    && typeof item.date === 'string'
    && item.date >= weekAgoStr
    && item.date <= todayStr
  );
  const weeklyPool = weeklyItems.length > 0 ? weeklyItems : homework;
  const weeklyDone = weeklyPool.filter(item =>
    ['done', 'reviewed', 'present', 'late'].includes(item.progress?.[studentId]?.value)
  ).length;
  const weeklyProgressPercent = weeklyPool.length > 0
    ? Math.round((weeklyDone / weeklyPool.length) * 100)
    : null;
  const weeklyProgressLabel = weeklyProgressPercent === null ? '—' : `${bn(weeklyProgressPercent)}%`;

  // 4. Term Progress % (published courses chapters + homework)
  const allChapters = (Array.isArray(courses) ? courses : []).flatMap(c => Array.isArray(c?.chapters) ? c.chapters : []);
  const completedChapters = allChapters.filter(ch => ch.status === 'শেষ').length;
  const termTotal = allChapters.length + homework.length;
  const termDone = completedChapters + doneCount;
  const termProgressPercent = termTotal > 0 ? Math.round((termDone / termTotal) * 100) : null;
  const termProgressLabel = termProgressPercent === null ? '—' : `${bn(termProgressPercent)}%`;

  // 5. Today's Study item
  const nextPendingHw = homework.find(item => !['done', 'reviewed'].includes(item.progress?.[studentId]?.value));
  let RunningChapter = null;
  for (const c of Array.isArray(courses) ? courses : []) {
    const ch = (c.chapters || []).find(item => item.status === 'চলছে');
    if (ch) { RunningChapter = { course: c, chapter: ch }; break; }
  }
  const todayStudy = nextPendingHw
    ? { kind: 'homework', title: nextPendingHw.title, meta: `${nextPendingHw.subject} · জমা: ${nextPendingHw.date || 'তারিখ দেওয়া হয়নি'}`, percent: Math.max(8, termProgressPercent ?? 0), complete: false }
    : RunningChapter
      ? { kind: 'chapter', title: RunningChapter.chapter.title, meta: `${RunningChapter.course.subject} · চলমান অধ্যায়`, percent: Math.max(15, termProgressPercent ?? 0), complete: false }
      : (homework.length > 0 || allChapters.length > 0)
        ? { kind: 'complete', title: 'সব বাড়ির কাজ সম্পন্ন!', meta: 'দারুণ কাজ—এবার ফলাফল ও নতুন কাজ দেখে নাও।', percent: 100, complete: true }
        : { kind: 'empty', title: 'এখনও কোনো কাজ প্রকাশ হয়নি', meta: 'শিক্ষকের দেওয়া কাজ ও উপকরণ এখানে দেখা যাবে।', percent: 0, complete: false };

  return {
    homework,
    doneCount,
    pendingCount,
    attendancePercent,
    attendanceLabel,
    averageResultPercent,
    averageResultLabel,
    weeklyProgressPercent,
    weeklyProgressLabel,
    termProgressPercent,
    termProgressLabel,
    todayStudy
  };
}

function renderProgress(activities, exams, student, examDb, courses) {
  const stats = calculateStudentHomeStats({ student, activities, examDb, courses });
  const percent = stats.termProgressPercent ?? 0;
  const ring = $('#studyProgressRing');
  if (ring) {
    ring.style.setProperty('--progress', `${percent * 3.6}deg`);
    ring.setAttribute('aria-label', stats.termProgressPercent === null
      ? 'পড়াশোনার অগ্রগতি এখনো নেই'
      : `পড়াশোনার অগ্রগতি ${bn(percent)} শতাংশ`);
  }
  if ($('#studyProgressValue')) $('#studyProgressValue').textContent = stats.termProgressPercent === null ? '—' : `${bn(percent)}%`;
  if ($('#dashboardDoneCount')) $('#dashboardDoneCount').textContent = `${bn(stats.doneCount)}টি কাজ`;
  if ($('#dashboardPendingSummary')) $('#dashboardPendingSummary').textContent = stats.homework.length
    ? `${bn(stats.doneCount)}টি কাজ সম্পন্ন, ${bn(stats.pendingCount)}টি বাকি`
    : 'এখনও কোনো বাড়ির কাজ প্রকাশ হয়নি';
  if ($('#dashboardPendingCount')) $('#dashboardPendingCount').textContent = `${bn(stats.pendingCount)}টি কাজ`;
  if ($('#dashboardExamCount')) $('#dashboardExamCount').textContent = `${bn(exams.length)}টি পরীক্ষা`;
  /* No data yet is not an error and must not read like one: a cold dash
     says "broken", এখনো নেই says "not yet" (owner report 2026-10-15). The
     computed numbers are untouched — only the empty label is worded. */
  const paintStat = (selector, percent, label) => {
    const el = $(selector);
    if (!el) return;
    el.textContent = percent === null ? 'এখনো নেই' : label;
    el.classList.toggle('is-empty-stat', percent === null);
  };
  paintStat('#dashboardWeeklyProgress', stats.weeklyProgressPercent, stats.weeklyProgressLabel);
  paintStat('#dashboardAttendanceRate', stats.attendancePercent, stats.attendanceLabel);
  paintStat('#dashboardAverageResult', stats.averageResultPercent, stats.averageResultLabel);
  paintStat('#dashboardTermProgress', stats.termProgressPercent, stats.termProgressLabel);
  if ($('#studyProgressNote')) $('#studyProgressNote').textContent = stats.termProgressPercent !== null
    ? `মোট ${bn(stats.homework.length)}টি বাড়ির কাজ ও ${bn((courses || []).length)}টি কোর্সের অগ্রগতির ভিত্তিতে।`
    : 'এখনও কোনো বাড়ির কাজ বা কোর্সের অগ্রগতি পাওয়া যায়নি।';
  return { ...stats, done: stats.doneCount, pending: stats.pendingCount, percent };
}

function renderDailyAdviceSummary(classCount, pendingCount, error = false) {
  const summary = $('[data-daily-advice-summary]');
  if (!summary) return;
  if (error) {
    summary.textContent = 'আজকের ক্লাস ও কাজের তথ্য পাওয়া যায়নি';
    return;
  }
  const classes = Math.max(0, Number(classCount) || 0);
  const pending = Math.max(0, Number(pendingCount) || 0);
  const classText = classes ? `${bn(classes)}টি ক্লাস` : 'ক্লাস নেই';
  const homeworkText = pending ? `${bn(pending)}টি বাড়ির কাজ বাকি` : 'বাড়ির কাজ বাকি নেই';
  summary.textContent = `আজ ${classText} · ${homeworkText}`;
}

function renderChallenge(stats) {
  const study = stats.todayStudy;
  const title = $('#dashboardChallengeTitle');
  const meta = $('#dashboardChallengeMeta');
  const bar = $('#dashboardChallengeProgress');
  const card = $('#dashboardChallengeCard');
  if (title) title.textContent = study.title;
  if (meta) meta.textContent = study.meta;
  if (bar) bar.style.width = `${study.percent}%`;
  card?.classList.toggle('is-complete', Boolean(study.complete));
}

function renderExam(exams) {
  const card = $('#dashboardExamCard');
  if (!card) return;
  card.hidden = exams.length === 0;
  if (!exams.length) return;
  const first = [...exams].sort((a, b) => a.startAt - b.startAt)[0];
  $('#dashboardExamTitle').textContent = first.title;
  $('#dashboardExamMeta').textContent = `${bn(exams.length)}টি প্রকাশিত পরীক্ষা · ${first.subject || 'পরীক্ষা'}`;
}

function renderFees(student, account, transactions) {
  const fee = student.monthlyFee ?? account?.student?.monthlyFee;
  const card = $('#dashboardFeeCard');
  // Never display a guessed/default fee as a real balance.
  if (!card || fee === null || fee === undefined || fee === '') { if (card) card.hidden = true; return; }
  const summary = studentFeeSummary({ ...student, monthlyFee: fee }, transactions);
  card.hidden = false;
  $('#dashboardFeeTitle').textContent = summary.due > 0 ? 'বকেয়া ফি আছে' : 'এই মাসের ফি পরিশোধ হয়েছে';
  $('#dashboardFeeMeta').textContent = summary.due > 0 ? `${summary.month} · পরিশোধের জন্য অফিসে যোগাযোগ করুন` : `${summary.month} · ধন্যবাদ`;
  $('#dashboardFeeAmount').textContent = `৳ ${bn(summary.due.toLocaleString('en-IN'))}`;
  card.classList.toggle('is-paid', summary.due === 0);
}

export function initStudentDashboard({ getStudent, getAccount }) {
  let request = 0;
  async function refresh() {
    const current = ++request;
    const student = getStudent() || {};
    const account = getAccount() || {};
    $('#homeView')?.setAttribute('data-student-id', student.id || '');
    try {
      const [teachingDb, examDb, transactions] = await Promise.all([
        teachingRepository.listForStudent(student.id), examRepository.listForStudent(student.id), financeRepository.listTransactions({ role: 'student', studentId: student.id })
      ]);
      if (current !== request) return;
      const activities = publishedForStudent(teachingDb.activities || [], student);
      const exams = (examDb.exams || []).filter(exam => isStudentVisibleExam(exam) && examMatchesStudent(exam, student));
      const todayClassCount = renderRoutine(student, activities);
      const courses = courseRepository.readStudentCoursesSync(student);
      const progress = renderProgress(activities, exams, student, examDb, courses);
      renderDailyAdviceSummary(todayClassCount, progress.pendingCount);
      renderChallenge(progress);
      renderExam(exams);
      renderFees(student, account, transactions);
    } catch {
      if (current !== request) return;
      $('#homeView')?.classList.remove('is-empty-routine');
      renderDailyAdviceSummary(0, 0, true);
      const list = $('#dashboardRoutineList');
      /* Off the panel page (or before the view exists) there is no list to
         paint the error into — the next panel render retries anyway. */
      if (!list) return;
      list.dataset.state = 'error';
      /* Full-width row, readable when it wraps, and the retry lives inside the
         same component — a half-width chip would break the dashboard grid. */
      list.innerHTML = '<div class="dashboard-routine-error" role="alert" data-routine-error>'
        + '<span class="dashboard-routine-error-icon" aria-hidden="true">!</span>'
        + '<div class="dashboard-routine-error-copy"><strong>আজকের ক্লাস আনা যায়নি</strong>'
        + '<p>সংরক্ষিত রুটিন পড়া যায়নি বা সংযোগ বিচ্ছিন্ন। তথ্য মুছে যায়নি — আবার চেষ্টা করুন।</p></div>'
        + '<button type="button" class="mini-btn primary" data-routine-retry>আবার চেষ্টা করুন</button></div>';
    }
  }
  /* The retry button sits inside the error row itself. */
  $('#dashboardRoutineList')?.addEventListener('click', event => {
    if (event.target.closest('[data-routine-retry]')) void refresh();
  });
  watchCourses(() => { void refresh(); });
  watchExams(() => { void refresh(); });
  window.addEventListener('teaching-data-updated', refresh);
  window.addEventListener('storage', event => {
    if (!event.key || [ROUTINE_KEY, 'activePlus.teaching.v1', 'activePlus.exams.v1', 'activePlus.admin.transactions.v1'].includes(event.key)) void refresh();
  });
  void refresh();
  return refresh;
}
