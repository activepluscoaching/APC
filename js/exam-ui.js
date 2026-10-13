import { nowEpoch } from './time.js';
import { escapeText as esc } from './teaching-data.js';
import { toBanglaNumber as bn } from './ui.js';
import { EXAM_TYPES, EXAM_STATUSES, totalMarks, examResults, firstAttemptMean, classExamDate, examDateOf, examDurationMinutes, examCodeOf, examStageKey, examStageLabel } from './exam-data.js';
import { examDateLabel, examDateShort, durationLabel, statusLabel, statusTone, shortExamId } from './exam-archive.js';
import { downloadBlob } from './exam-pdf.js';
export { esc };
export const num = value => esc(bn(value));
export const when = value => new Date(value).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
export function examMeta(e) {
  return `<span class="exam-tag">${EXAM_TYPES[e.type]}</span><span class="exam-tag">${EXAM_STATUSES[e.status]}</span><h3>${esc(e.title)}</h3><p>${esc(e.subject)} • ${esc(e.className || 'সব শ্রেণি')}${e.group ? ` • ${esc(e.group)}` : ''} • পূর্ণমান ${num(totalMarks(e))}</p><small>পরীক্ষার কোড: <strong>${esc(examCodeOf(e))}</strong>${e.chapterName ? ` • অধ্যায়: ${esc(e.chapterName)}` : ''}<br>শুরু: ${esc(when(e.startAt))}<br>শেষ: ${esc(when(e.endAt))}</small>${e.type !== 'mcq' ? `<p class="exam-note">প্রশ্ন ডাউনলোড করে পরের দিন ক্লাসে পরীক্ষা: ${esc(classExamDate(e.startAt))}</p>` : ''}`;
}
export function questionPreview(e, answers = false) {
  return `<div class="exam-question-list">${e.questions.map((q, i) => `<article class="exam-question"><small>প্রশ্ন ${num(i + 1)} • ${num(q.marks)} নম্বর</small><p>${esc(q.text)}</p>${q.options ? q.options.map(o => `<p>${o.id}. ${esc(o.text)}</p>`).join('') : ''}${answers && q.answer ? `<strong>সঠিক উত্তর: ${q.answer}</strong>` : ''}</article>`).join('')}</div>`;
}
export function resultMarkup(db, e, includeRoster = false, { pdf = false } = {}) {
  const rows = examResults(db, e), mean = firstAttemptMean(db, e.id);
  const absent = e.participants.filter(s => !db.attempts.some(a => a.examId === e.id && a.studentId === s.id));
  const pending = db.attempts.filter(a => a.examId === e.id && a.status !== 'submitted');
  return `<div class="exam-summary"><h3>${esc(e.subject)} — ফলাফল</h3><p class="exam-note">প্রতি শিক্ষার্থী একটি চেষ্টা; পুরোনো রেকর্ডে একাধিক চেষ্টা থাকলে সেরা নম্বর দিয়ে মেধাক্রম।</p><dl><div><dt>প্রকাশিত ফলাফল</dt><dd>${num(rows.length)}</dd></div><div><dt>প্রথম প্রচেষ্টার গড়</dt><dd>${mean === null ? '—' : num(mean.toFixed(2))}</dd></div></dl>${nowEpoch() < e.endAt ? '<p class="exam-note">পরীক্ষা চলছে—গড় ও মেধাক্রম বদলাতে পারে।</p>' : ''}</div>
    <div class="exam-results">${rows.map(a => `<article class="exam-card"><span class="exam-tag">মেধাক্রম ${num(a.rank)}</span><h3>${esc(a.name)}</h3><small>${esc(a.className)} • চেষ্টা ${num(a.number)}</small><p><strong>${num(a.score)} / ${num(totalMarks(e))}</strong> • গ্রেড ${esc(a.grade)}</p>${e.type === 'mcq' ? `<small>সঠিক ${num(a.correct)} • ভুল ${num(a.wrong)} • অনুত্তরিত ${num(a.unanswered)}</small>` : ''}${pdf ? `<div class="exam-actions"><button type="button" data-exam-action="student-pdf" data-id="${esc(e.id)}" data-attempt="${esc(a.id)}">এই শিক্ষার্থীর উত্তরপত্র PDF</button></div>` : ''}</article>`).join('') || '<p class="exam-note">এখনও কোনো ফলাফল প্রকাশ হয়নি।</p>'}</div>
    ${includeRoster ? `<h3>অংশগ্রহণ / জমার অবস্থা</h3><p class="exam-note">অংশ নিয়েছে ${num(new Set(db.attempts.filter(a => a.examId === e.id).map(a => a.studentId)).size)} জন • জমা অপেক্ষমাণ ${num(new Set(pending.map(a => a.studentId)).size)} জন</p><div class="exam-results">${absent.map(s => `<article class="exam-card"><strong>${esc(s.name)}</strong><p>${esc(s.className)} • ${e.type === 'mcq' ? (nowEpoch() >= e.endAt ? 'অনুপস্থিত' : 'এখনও অংশ নেয়নি') : (e.absentIds || []).includes(s.id) ? 'অনুপস্থিত' : 'নম্বর/উপস্থিতি নথিভুক্ত হয়নি'}</p></article>`).join('')}</div>` : ''}`;
}
/**
 * The class-wide board: once a paper's results are out, every student of that
 * class sees who got what. Rows come from the Student snapshot's `classResults`
 * (marks only — no answer sheets, no attempt ids), so the board can only ever be
 * built for a paper that already matched this student's class/batch.
 */
/* ১য়/২য়/৩য় is what a class reads a result board as; below the top three the
   plain number carries better than ৪য়/৫য়. A shared rank keeps the shared label. */
const BOARD_PODIUM = Object.freeze({ 1: '১য়', 2: '২য়', 3: '৩য়' });
const boardRank = (value, absent = false) => {
  if (absent) return '—';
  return BOARD_PODIUM[Number(value)] || num(value);
};

export function classResultBoard(exam, rows, { meId = '', heading = 'পুরো ক্লাসের ফলাফল' } = {}) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const total = totalMarks(exam);
  const ordered = [...rows.filter(row => !row.absent && Number.isFinite(Number(row.rank)))].sort((a, b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name), 'bn'));
  const absent = rows.filter(row => row.absent);
  const listed = [...ordered, ...absent];
  const me = meId ? rows.find(row => row.studentId === meId) || null : null;
  const publishedAt = Number(exam.resultsPublishedAt) ? ` • প্রকাশিত: ${esc(when(exam.resultsPublishedAt))}` : '';
  const rowsHtml = listed.map(row => {
    const mine = me && row.studentId === me.studentId;
    const marks = row.absent
      ? `<span class="exam-board-absent">${row.markedAbsent ? 'অনুপস্থিত' : 'জমা দেয়নি'}</span>`
      : `<span class="exam-board-marks"><strong>${num(row.score)}</strong> / ${num(row.total ?? total)}</span><span class="exam-board-grade">${esc(row.grade || '—')}</span>`;
    const podium = !row.absent && Boolean(BOARD_PODIUM[Number(row.rank)]);
    return `<li class="exam-board-row${row.absent ? ' is-absent' : ''}${mine ? ' is-me' : ''}${podium ? ' is-podium' : ''}" data-exam-board-row="${esc(String(row.studentId))}"${mine ? ' aria-current="true"' : ''}>
      <span class="exam-board-rank${podium ? ' is-podium' : ''}">${boardRank(row.rank, row.absent)}</span>
      <span class="exam-board-name">${esc(row.name || '—')}${mine ? ' <small>(তুমি)</small>' : ''}</span>
      ${marks}
    </li>`;
  }).join('');
  const detail = me && !me.absent && exam.type === 'mcq' && Number.isFinite(Number(me.correct))
    ? `<p class="exam-note">তোমার প্রতিটি উত্তর: সঠিক ${num(me.correct)} • ভুল ${num(me.wrong)} • অনুত্তরিত ${num(me.unanswered)}${me.autoSubmitted ? ' • সময় শেষে স্বয়ংক্রিয়ভাবে জমা' : ''}</p>` : '';
  return `<section class="exam-board" data-exam-board aria-labelledby="examBoardTitle-${esc(exam.id)}">
    <h3 id="examBoardTitle-${esc(exam.id)}">${esc(heading)}</h3>
    <p class="exam-note">${esc(exam.className || 'সব শ্রেণি')}${exam.group ? ` • ${esc(exam.group)}` : ''} • অংশগ্রহী ${num(ordered.length)} জন${absent.length ? ` • অনুপস্থিত/অনজ্চিত ${num(absent.length)} জন` : ''} • পূর্ণমান ${num(total)}${publishedAt}</p>
    <ol class="exam-board-list">${rowsHtml}</ol>
    ${me && !me.absent ? `<p class="exam-note exam-board-me">তোমার অবস্থান: মেধাক্রম ${boardRank(me.rank)} • ${num(me.score)} / ${num(me.total ?? total)} • গ্রেড ${esc(me.grade || '—')}</p>${detail}` : ''}
    <p class="exam-note">সেরা মেধাক্রম সবার সেরা নম্বরে। এই ফলাফল তোমার ক্লাসের সব শিক্ষার্থীরাই দেখতে পাবে।</p>
  </section>`;
}

export function downloadResults(db, e) {
  const rows = examResults(db, e), best = new Map(rows.map(a => [a.studentId, a])), mean = firstAttemptMean(db, e.id);
  const cells = value => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, match => "'" + match).replace(/"/g, '""')}"`;
  const table = [['পরীক্ষা', 'বিষয়', 'নাম', 'শ্রেণি', 'অবস্থা', 'নম্বর', 'পূর্ণমান', 'গ্রেড', 'মেধাক্রম', 'প্রচেষ্টা', 'সঠিক', 'ভুল', 'অনুত্তরিত', 'প্রথম প্রচেষ্টার গড়']];
  const people = [...new Map([...e.participants, ...rows.map(a => ({ id: a.studentId, name: a.name, className: a.className }))].map(s => [s.id, s])).values()];
  people.forEach(s => {
    const a = best.get(s.id), own = db.attempts.filter(a => a.examId === e.id && a.studentId === s.id);
    const status = a ? 'ফলাফল প্রকাশিত' : own.length ? 'জমা অপেক্ষমাণ' : e.type === 'mcq' && nowEpoch() >= e.endAt || (e.absentIds || []).includes(s.id) ? 'অনুপস্থিত' : 'অংশগ্রহণ/নম্বর বাকি';
    table.push([e.title, e.subject, s.name, s.className, status, a?.score, totalMarks(e), a?.grade, a?.rank, own.length, a?.correct, a?.wrong, a?.unanswered, mean?.toFixed(2)]);
  });
  downloadBlob(new Blob(['\ufeff', table.map(row => row.map(cells).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `ActivePlus-results-${e.id.slice(-8)}.csv`);
}

/** The six-stage chip (খসড়া/নির্ধারিত/প্রকাশিত/চলছে/সম্পন্ন/সংরক্ষিত) a paper
    wears next to its workflow status: the stage is what a person reads at a
    glance, the stored status stays available for the review screens. */
export function stageTag(exam, now = nowEpoch()) {
  const key = examStageKey(exam, now);
  return `<span class="exam-tag exam-stage exam-stage-${esc(key)}">${esc(examStageLabel(exam, now))}</span>`;
}
/** Where one attempt stands, in the words a student understands. A paper that
    is written on paper (short/written) says so instead of pretending to be an
    online submission. */
export function attemptStage(attempt, exam = null) {
  if (!attempt) return '';
  if (attempt.status === 'active') return 'চলছে — উত্তর সংরক্ষিত হচ্ছে';
  if (attempt.status === 'queued') return 'জমা হয়েছে — ইন্টারনেট এলে পাঠানো হবে';
  if (exam && exam.type !== 'mcq') return 'জমা হয়েছে — শিক্ষক পর্যালোচনা করছেন';
  return 'জমা হয়েছে — ফলাফল প্রকাশের অপেক্ষায়';
}

/** The permanent Exam Code, monospaced so it is easy to read aloud/copy. */
export const codeTag = exam => `<span class="exam-tag exam-code-tag" data-exam-code="${esc(examCodeOf(exam))}">${esc(examCodeOf(exam))}</span>`;
/** The coloured workflow tag a record wears everywhere it appears. */
export function statusTag(exam) {
  return `<span class="exam-tag exam-status exam-status-${statusTone(exam.status)}">${esc(statusLabel(exam.status))}</span>`;
}
export function typeTag(exam) { return `<span class="exam-tag">${esc(EXAM_TYPES[exam.type])}</span>`; }
/** Every field a question record must show together with the exam it belongs
    to: name, date, subject, class/batch, totals, duration, creator and status. */
export function examRecord(exam, { heading = true } = {}) {
  const moment = value => Number(value) ? esc(when(value)) : '—';
  const date = examDateOf(exam);
  const rows = [
    ['পরীক্ষার কোড', `<strong>${esc(examCodeOf(exam))}</strong>`],
    ['Exam ID', esc(exam.id)],
    ['পরীক্ষার তারিখ', `${esc(examDateShort(date))} — ${esc(examDateLabel(date))}`],
    ['বিষয়', `${esc(exam.subject)}${exam.subjectCode ? ` (${esc(exam.subjectCode)})` : ''}`],
    ['অধ্যায়', esc(exam.chapterName || '—')],
    ['Batch', esc(exam.batchName || exam.group || '—')],
    ['শ্রেণি / Batch', `${esc(exam.className || 'সব শ্রেণি')}${exam.group ? ` • ${esc(exam.group)}` : ''}`],
    ['মোট প্রশ্ন', num((exam.questions || []).length)],
    ['পূর্ণমান', num(totalMarks(exam))],
    ['সময়কাল', esc(durationLabel(examDurationMinutes(exam)))],
    ['পাস নম্বর', num(Number(exam.passingMarks) || Math.round(totalMarks(exam) * (Number(exam.passPercent) || 33) / 100))],
    ['প্রতি ভুলে কাটা', exam.type === 'mcq' ? num(Number(exam.negativeMarks ?? exam.negative) || 0) : 'প্রযোজ্য নয়'],
    ['প্রশ্নের ক্রম', exam.questionOrder === 'fixed' ? 'নির্ধারিত ক্রম' : 'প্রতিটি শিক্ষার্থীর জন্য আলাদা'],
    ['অবস্থা (পর্যায়)', stageTag(exam)],
    ['তৈরি করেছেন', esc(exam.createdBy || exam.teacherName || '—')],
    ['তৈরি সময়', moment(exam.createdAt)],
    ['সর্বশেষ হালনাগাদ', moment(exam.updatedAt)],
    ['অবস্থা', statusTag(exam)],
    ['সময়সূচি', `${moment(exam.startAt)} → ${moment(exam.endAt)}`]
  ];
  return `${heading ? `<h3>${esc(exam.title)}</h3>` : ''}<p class="exam-note">${typeTag(exam)}${codeTag(exam)}</p><dl class="exam-record">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
/** One line of exam identity for compact lists ('০২-১০-২০২৬ • বিষয় • শ্রেণি'). */
export function examLine(exam) {
  const date = examDateOf(exam);
  return `${esc(examDateShort(date))} • ${esc(exam.subject)} • ${esc(exam.className || 'সব শ্রেণি')}${exam.group ? ` • ${esc(exam.group)}` : ''} • প্রশ্ন ${num((exam.questions || []).length)} • পূর্ণমান ${num(totalMarks(exam))}`;
}
export { shortExamId, examDateOf, examDurationMinutes, durationLabel, statusLabel, statusTone };
