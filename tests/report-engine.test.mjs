/* The Reports Module's data layer: permissions that really are enforced, and
   totals that really are computed from the app's own records.

   Every test here goes through the same two functions the UI calls —
   report-access.js#enforceAccess and report-catalog.js#buildReportDocument —
   so a role that is only hidden on screen cannot pass. Nothing is mocked
   except jsdom itself: the records below are seeded into the same stores the
   app writes, and the numbers asserted are the numbers a page would print. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';

let access;
let catalog;
let sources;

const TODAY = new Date();
const DAY = 86400000;
const at = daysAgo => TODAY.getTime() - daysAgo * DAY;
const iso = time => new Date(time).toISOString().slice(0, 10);

const CLASS_A = 'নবম শ্রেণি';
const CLASS_B = 'দশম শ্রেণি';
const BATCH_SCIENCE = 'বিজ্ঞান বিভাগ';

/* ---------- seeded records ---------- */

const STUDENTS = [
  { id: 'AP-1001', name: 'রাইসা ইসলাম', className: CLASS_A, group: BATCH_SCIENCE, status: 'approved', mobile: '01711000001', monthlyFee: 1500, enrolledAt: iso(at(40)) },
  { id: 'AP-1002', name: 'তহমিদ হাসান', className: CLASS_A, group: BATCH_SCIENCE, status: 'approved', mobile: '01711000002', monthlyFee: 1500, enrolledAt: iso(at(30)) },
  { id: 'AP-1003', name: 'সুমাইয়া খাতুন', className: CLASS_B, group: 'মানবিক বিভাগ', status: 'pending', mobile: '01711000003', monthlyFee: 2000, enrolledAt: iso(at(2)) }
];

const MONTH = () => catalog && sources ? sources.monthLabelOf(Date.now()) : '';

function transactions(month) {
  return [
    { id: 'TRX-1', receiptNo: 'REC-1', studentId: 'AP-1001', studentName: 'রাইসা ইসলাম', className: CLASS_A, feeType: 'মাসিক বেতন', month, amount: 1500, method: 'নগদ', date: iso(at(1)), recordedAt: at(1), collectedBy: 'এডমিন', status: 'approved' },
    { id: 'TRX-2', receiptNo: 'REC-2', studentId: 'AP-1002', studentName: 'তহমিদ হাসান', className: CLASS_A, feeType: 'মাসিক বেতন', month, amount: 700, method: 'বিকাশ', date: iso(at(1)), recordedAt: at(1), collectedBy: 'পেমেন্ট কাউন্টার', status: 'approved' },
    { id: 'TRX-3', receiptNo: 'REC-3', studentId: 'AP-1003', studentName: 'সুমাইয়া খাতুন', className: CLASS_B, feeType: 'মাসিক বেতন', month, amount: 2000, method: 'নগদ', date: iso(at(2)), recordedAt: at(2), collectedBy: 'পেমেন্ট কাউন্টার', status: 'pending' },
    { id: 'TRX-4', receiptNo: 'REC-4', studentId: 'AP-1001', studentName: 'রাইসা ইসলাম', className: CLASS_A, feeType: 'পরীক্ষার ফি', month, amount: 500, method: 'নগদ', date: iso(at(3)), recordedAt: at(3), collectedBy: 'পেমেন্ট কাউন্টার', status: 'rejected' }
  ];
}

const ACTIVITIES = [
  {
    id: 'ACT-1', type: 'routine', title: 'পদার্থবিজ্ঞান ক্লাস', subject: 'পদার্থবিজ্ঞান',
    className: CLASS_A, group: BATCH_SCIENCE, teacherName: 'শিক্ষক এক', status: 'published',
    date: iso(at(1)), time: '17:00',
    progress: { 'AP-1001': { value: 'present' }, 'AP-1002': { value: 'absent' } }
  },
  {
    id: 'ACT-2', type: 'homework', title: 'অধ্যায় ৩ অনুশীলনী', subject: 'পদার্থবিজ্ঞান',
    className: CLASS_A, group: BATCH_SCIENCE, teacherName: 'শিক্ষক এক', status: 'published',
    date: iso(at(2)), time: '18:00',
    progress: { 'AP-1001': { value: 'done' }, 'AP-1002': { value: 'pending' } }
  },
  {
    id: 'ACT-3', type: 'routine', title: 'রসায়ন ক্লাস', subject: 'রসায়ন',
    className: CLASS_B, group: 'মানবিক বিভাগ', teacherName: 'শিক্ষক দুই', status: 'published',
    date: iso(at(2)), time: '17:00',
    progress: { 'AP-1003': { value: 'present' } }
  }
];

const QUESTIONS = Array.from({ length: 12 }, (_, index) => ({
  id: `Q${index + 1}`,
  text: `প্রশ্ন ${index + 1}: আলোর প্রতিসরণ কী?`,
  marks: 2,
  options: [
    { id: 'A', text: `অপশন ক ${index + 1}` },
    { id: 'B', text: `অপশন খ ${index + 1}` },
    { id: 'C', text: `অপশন গ ${index + 1}` },
    { id: 'D', text: `অপশন ঘ ${index + 1}` }
  ],
  answer: 'B',
  explanation: `ব্যাখ্যা ${index + 1}`
}));

function exams() {
  return {
    exams: [
      {
        id: 'EXM-1', title: 'অর্ধবার্ষিক পরীক্ষা', subject: 'পদার্থবিজ্ঞান', className: CLASS_A,
        group: BATCH_SCIENCE, type: 'mcq', status: 'published', startAt: at(5), endAt: at(5) + 3600000,
        lateMinutes: 10, negative: 0.5, passPercent: 33, instructions: 'সব প্রশ্নের উত্তর দিন।',
        questions: QUESTIONS
      },
      {
        id: 'EXM-2', title: 'রসায়ন পরীক্ষা', subject: 'রসায়ন', className: CLASS_B,
        group: 'মানবিক বিভাগ', type: 'mcq', status: 'published', startAt: at(4), endAt: at(4) + 3600000,
        lateMinutes: 10, negative: 0, passPercent: 40, instructions: '',
        questions: QUESTIONS.slice(0, 3)
      }
    ],
    attempts: [
      { id: 'ATT-1', examId: 'EXM-1', studentId: 'AP-1001', name: 'রাইসা ইসলাম', className: CLASS_A, group: BATCH_SCIENCE, number: 1, answers: { Q1: 'B', Q2: 'A', Q3: 'C' }, score: 2.5, status: 'submitted', finishedAt: at(5) + 1800000 },
      { id: 'ATT-2', examId: 'EXM-1', studentId: 'AP-1001', name: 'রাইসা ইসলাম', className: CLASS_A, group: BATCH_SCIENCE, number: 2, answers: { Q1: 'B', Q2: 'A', Q3: 'B', Q4: 'B' }, score: 5.5, status: 'submitted', finishedAt: at(5) + 2400000 },
      { id: 'ATT-3', examId: 'EXM-1', studentId: 'AP-1002', name: 'তহমিদ হাসান', className: CLASS_A, group: BATCH_SCIENCE, number: 1, answers: { Q1: 'A' }, score: 0, status: 'submitted', finishedAt: at(5) + 1200000 },
      { id: 'ATT-4', examId: 'EXM-2', studentId: 'AP-1003', name: 'সুমাইয়া খাতুন', className: CLASS_B, group: 'মানবিক বিভাগ', number: 1, answers: { Q1: 'B' }, score: 2, status: 'submitted', finishedAt: at(4) + 900000 }
    ]
  };
}

const NOTICES = [
  { id: 'NOT-1', title: 'বার্ষিক ক্রীড়া', body: 'আগামী শুক্রবার', audience: 'সব শিক্ষার্থী', author: 'manager', status: 'published', date: iso(at(1)), createdAt: new Date(at(1)).toISOString() },
  { id: 'NOT-2', title: 'বিজ্ঞান বিভাগ সভা', body: 'অভিভাবক সভা', audience: BATCH_SCIENCE, author: 'manager', status: 'published', date: iso(at(3)), createdAt: new Date(at(3)).toISOString() }
];

/* ---------- actors ---------- */

const ADMIN = { kind: 'staff', role: 'admin', username: 'admin.apc', name: 'Admin' };
const MANAGER = { kind: 'staff', role: 'manager', username: 'manager.apc', name: 'Manager' };
const TEACHER = { kind: 'staff', role: 'teacher', username: 'teacher.one', name: 'শিক্ষক এক' };
const CASH = { kind: 'staff', role: 'cash', username: 'payment.apc', name: 'পেমেন্ট কাউন্টার' };
const STUDENT = { kind: 'student', role: 'student', studentId: 'AP-1001', username: 'raisa', name: 'রাইসা ইসলাম', className: CLASS_A, group: BATCH_SCIENCE };

let snapshot;

before(async () => {
  const page = await loadPage('index.html');
  page.window.localStorage.setItem('activePlus.manager.teacherAssignments.v1', JSON.stringify([
    { id: 'TAS-1', teacherUsername: 'teacher.one', teacherName: 'শিক্ষক এক', className: CLASS_A, group: BATCH_SCIENCE, subject: 'পদার্থবিজ্ঞান' }
  ]));
  sources = await import('../js/report-sources.js');
  access = await import('../js/report-access.js');
  catalog = await import('../js/report-catalog.js');
  snapshot = {
    students: STUDENTS,
    transactions: transactions(sources.monthLabelOf(Date.now())),
    notices: NOTICES,
    routine: {},
    teaching: { activities: ACTIVITIES },
    exams: exams(),
    appConfig: {}
  };
});

/* ---------- helpers ---------- */

function report(id) {
  const definition = catalog.findReport(id);
  assert.ok(definition, `report ${id} exists in the catalog`);
  return definition;
}

async function build(id, actor, filters = {}) {
  const definition = report(id);
  const { filters: safe, scope } = access.enforceAccess(definition, actor, filters);
  const result = await catalog.buildReportDocument(definition, { filters: safe, actor, scope, snapshot });
  return { ...result, scope, filters: safe };
}

const tables = blocks => blocks.filter(item => item && item.type === 'table');
const questionBlocks = blocks => blocks.filter(item => item && item.type === 'questions');
const tilesOf = blocks => blocks.filter(item => item && item.type === 'tiles').flatMap(item => item.tiles);
const kvOf = blocks => blocks.filter(item => item && item.type === 'keyValues').flatMap(item => item.pairs);
/** Every string a report prints: table rows, key/values, tiles and questions. */
const flat = blocks => blocks.map(item => {
  if (!item) return '';
  if (item.type === 'table') return item.rows.map(row => row.join(' | ')).join('\n');
  if (item.type === 'keyValues') return item.pairs.map(pair => pair.join(': ')).join('\n');
  if (item.type === 'tiles') return item.tiles.map(tile => `${tile.label}: ${tile.value}`).join('\n');
  if (item.type === 'questions') return item.questions.map(question => [question.no, question.text, question.status, question.answerText].join(' | ')).join('\n');
  return String(item.text || '');
}).join('\n');

const forbidden = error => error?.code === 'FORBIDDEN';

/* ==========================================================================
   1. the catalog itself is role-aware
   ========================================================================== */

test('each role is offered only the reports it may run', () => {
  const idsFor = role => catalog.catalogFor(role).flatMap(category => category.reports.map(item => item.id));
  assert.ok(idsFor('admin').includes('staff.teachers'), 'Admin gets the staff directory reports');
  assert.ok(idsFor('admin').includes('management.summary'));

  const manager = idsFor('manager');
  // The staff directory itself is Admin's; the teacher work the Manager owns
  // (assignments, activity) is theirs.
  assert.deepEqual(manager.filter(id => id.startsWith('staff.')), ['staff.teacher-assignment', 'staff.activity']);
  assert.ok(manager.includes('fee.daily') && manager.includes('management.summary'));

  const teacher = idsFor('teacher');
  assert.equal(teacher.some(id => id.startsWith('fee.')), false, 'Teacher is never offered fee reports');
  assert.equal(teacher.some(id => id.startsWith('cash.')), false, 'Teacher is never offered cash reports');
  assert.equal(teacher.some(id => id.startsWith('staff.')), false);
  assert.ok(teacher.includes('teacher.my-class') && teacher.includes('exam.complete'));

  const cash = idsFor('cash');
  assert.deepEqual(cash.filter(id => id.startsWith('student.')), [], 'Cash Counter gets no student roster report');
  assert.ok(cash.includes('cash.own-history') && cash.includes('fee.daily') && cash.includes('fee.receipts'));

  const student = idsFor('student');
  assert.ok(student.every(id => ['student.profile', 'exam.complete-student', 'exam.combined', 'notice.audience-wise'].includes(id) || id.startsWith('mine.')));
});

test('a report only declares the filters it actually uses', () => {
  for (const definition of catalog.REPORTS) {
    for (const key of definition.filters || []) {
      assert.ok(catalog.FILTER_META[key], `${definition.id} declares a known filter (${key})`);
    }
  }
});

/* ==========================================================================
   2. permission is enforced in the data layer, not just in the markup
   ========================================================================== */

test('a Student cannot ask for another student\'s records', async () => {
  assert.throws(() => access.enforceAccess(report('student.profile'), STUDENT, { studentId: 'AP-1003' }), forbidden);
  // Even without asking, the report is pinned to their own id.
  const { filters, blocks } = await build('student.profile', STUDENT, {});
  assert.equal(filters.studentId, 'AP-1001');
  const printed = flat(blocks);
  assert.ok(printed.includes('AP-1001'));
  assert.equal(printed.includes('AP-1003'), false, 'another student never appears');
});

test('a Teacher cannot reach a class outside the assignment', () => {
  assert.throws(() => access.enforceAccess(report('academic.class'), TEACHER, { className: CLASS_B }), forbidden);
  assert.throws(() => access.enforceAccess(report('academic.class'), TEACHER, { subject: 'রসায়ন' }), forbidden);
  assert.throws(() => access.enforceAccess(report('academic.teacher-wise'), TEACHER, { teacher: 'শিক্ষক দুই' }), forbidden);
  // Their own class passes.
  assert.doesNotThrow(() => access.enforceAccess(report('academic.class'), TEACHER, { className: CLASS_A }));
});

test('a Teacher\'s student report holds only their own students', async () => {
  const { blocks } = await build('teacher.student-academic', TEACHER, { studentId: 'AP-1001' });
  const printed = flat(blocks);
  assert.ok(printed.includes('AP-1001'));
  assert.equal(printed.includes('AP-1003'), false, 'another class\'s student is out of scope');
});

test('a Teacher\'s attendance report holds only their own sessions', async () => {
  const { blocks } = await build('academic.attendance', TEACHER, {});
  const printed = flat(blocks);
  assert.ok(printed.includes('পদার্থবিজ্ঞান'), 'their own session is there');
  assert.equal(printed.includes('রসায়ন'), false, 'another teacher\'s session is not');
});

test('a Teacher\'s exam report holds only their own exams', async () => {
  const { blocks } = await build('exam.list', TEACHER, {});
  const printed = flat(blocks);
  assert.ok(printed.includes('EXM-1'));
  assert.equal(printed.includes('EXM-2'), false, 'another subject\'s exam is out of scope');
});

test('a Cash Counter cannot widen "Own Transaction History"', async () => {
  const { filters, blocks } = await build('cash.own-history', CASH, { counter: 'এডমিন' });
  assert.equal(filters.counter, access.CASH_COUNTER_LABEL, 'the counter stays pinned to this desk');
  const printed = flat(blocks);
  assert.ok(printed.includes('REC-2') && printed.includes('REC-3'), 'the desk\'s own collections are listed');
  assert.equal(printed.includes('REC-1'), false, 'the Admin desk\'s collection is not theirs');
});

test('a Manager is refused the staff directory reports', () => {
  for (const id of ['staff.teachers', 'staff.managers', 'staff.cashiers', 'staff.status']) {
    assert.throws(() => access.enforceAccess(report(id), MANAGER, {}), forbidden, `${id} refuses a Manager`);
  }
  assert.doesNotThrow(() => access.enforceAccess(report('staff.teachers'), ADMIN, {}), 'Admin is allowed');
});

test('a Manager may still report on the teacher work they own', () => {
  // Assignments and teaching activity are the Manager's own records; the
  // staff directory (Staff ID, username, mobile, status) is not.
  for (const id of ['staff.teacher-assignment', 'staff.activity']) {
    assert.doesNotThrow(() => access.enforceAccess(report(id), MANAGER, {}), `${id} is a Manager report`);
    assert.doesNotThrow(() => access.enforceAccess(report(id), ADMIN, {}), `${id} is an Admin report`);
    assert.throws(() => access.enforceAccess(report(id), TEACHER, {}), forbidden, `${id} is not for Teachers`);
  }
});

test('nobody at all may run a report without signing in', () => {
  assert.throws(() => access.enforceAccess(report('student.all'), null, {}), forbidden);
});

/* ==========================================================================
   3. the complete examination report
   ========================================================================== */

test('a complete exam report carries the whole exam, not just the result', async () => {
  const { blocks } = await build('exam.complete', ADMIN, { examId: 'EXM-1' });
  const info = Object.fromEntries(kvOf(blocks));
  assert.equal(info['Exam ID'], 'EXM-1');
  assert.equal(info['পরীক্ষার নাম'], 'অর্ধবার্ষিক পরীক্ষা');
  assert.equal(info['বিষয়'], 'পদার্থবিজ্ঞান');
  assert.equal(info['শ্রেণি'], CLASS_A);
  assert.equal(info['মোট প্রশ্ন'], '১২', 'all 12 questions are counted');
  assert.equal(info['মোট নম্বর'], '২৪', '12 questions × 2 marks');
  assert.ok(info['তারিখ'] && info['সময়কাল'] && info['পাস নম্বর']);

  const questions = questionBlocks(blocks);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].questions.length, 12, 'every question is printed — not the first few');
  for (const [index, question] of questions[0].questions.entries()) {
    assert.equal(question.options.length, 4, `question ${index + 1} prints all four options`);
    assert.deepEqual(question.options.map(option => option.id), ['A', 'B', 'C', 'D']);
    assert.equal(question.answer, 'B', 'the correct answer is carried');
    assert.equal(question.explanation, `ব্যাখ্যা ${index + 1}`, 'the explanation is carried when stored');
    assert.equal(question.marks, '২', 'the per-question marks are printed in Bengali');
  }
});

test('the answer key and the question paper print every question', async () => {
  const key = await build('exam.answer-key', ADMIN, { examId: 'EXM-1' });
  const rows = tables(key.blocks).find(item => item.title === 'উত্তরমালা').rows;
  assert.equal(rows.length, 12);
  assert.equal(rows[0][2], `অপশন খ 1`, 'the correct option text is shown');
  const paper = await build('exam.question-paper', ADMIN, { examId: 'EXM-1' });
  assert.equal(questionBlocks(paper.blocks)[0].questions.length, 12);
  assert.equal(questionBlocks(paper.blocks)[0].showAnswer, false, 'a question paper hides the answer');
});

test('the student exam report adds student info, question-wise performance and a summary', async () => {
  const { blocks } = await build('exam.complete-student', ADMIN, { examId: 'EXM-1', studentId: 'AP-1001' });
  const printed = flat(blocks);
  assert.ok(printed.includes('AP-1001'), 'the student is named');

  const questions = questionBlocks(blocks)[0];
  assert.equal(questions.showStudent, true);
  assert.equal(questions.questions.length, 12, 'the whole paper is printed for the student too');
  const first = questions.questions[0];
  assert.equal(first.chosen, 'B', 'the student\'s own answer');
  assert.equal(first.status, 'সঠিক');
  assert.equal(questions.questions[1].status, 'ভুল');
  assert.equal(questions.questions[4].status, 'অনুত্তরিত');

  const summary = Object.fromEntries(kvOf(blocks));
  assert.equal(summary['গ্রেড'] !== undefined, true);
  assert.equal(summary['ফলাফল'] !== undefined, true);
  const tiles = Object.fromEntries(tilesOf(blocks).map(tile => [tile.label, tile.value]));
  // A retry never double-counts: AP-1001 attempted twice, the best one counts.
  assert.equal(tiles['মোট প্রশ্ন'], '১২');
  assert.equal(tiles['উত্তর'], '৪', 'the best attempt answered four questions');
  assert.equal(tiles['সঠিক'], '৩');
  assert.equal(tiles['ভুল'], '১');
  assert.equal(tiles['অনুত্তরিত'], '৮');
  assert.equal(tiles['নির্ভুলতা'], '৭৫%', '3 correct out of 4 answered');
  assert.equal(tiles['প্রাপ্ত নম্বর'], '৬ / ২৪', 'the best attempt\'s score, once');
});

test('the combined report carries the paper, the answers and the summary together', async () => {
  const { blocks } = await build('exam.combined', ADMIN, { examId: 'EXM-1', studentId: 'AP-1001' });
  assert.equal(questionBlocks(blocks)[0].questions.length, 12, 'the full paper');
  assert.equal(questionBlocks(blocks)[0].showStudent, true, 'with the student\'s answers');
  const summary = tables(blocks).find(item => item.rows.some(row => row[0] === 'মোট প্রশ্ন'));
  assert.ok(summary, 'a summary table closes the report');
  const values = Object.fromEntries(summary.rows);
  assert.equal(values['মোট প্রশ্ন'], '১২');
  assert.equal(values['প্রাপ্ত নম্বর'], '৬ / ২৪');
  assert.ok(values['গ্রেড'] && values['ফলাফল']);
});

test('a Student may run their own exam report and nobody else\'s', async () => {
  // Handing another student's id is refused outright — not silently rewritten.
  assert.throws(() => access.enforceAccess(report('exam.complete-student'), STUDENT, { examId: 'EXM-1', studentId: 'AP-1003' }), forbidden);
  const { blocks } = await build('exam.complete-student', STUDENT, { examId: 'EXM-1' });
  const printed = flat(blocks);
  assert.ok(printed.includes('AP-1001'), 'their own id is used');
  assert.equal(printed.includes('AP-1003'), false);
});

/* ==========================================================================
   4. totals are computed, never invented, and never double counted
   ========================================================================== */

test('a fee collection total is the sum of the rows it prints — each row once', async () => {
  const { blocks } = await build('fee.transactions', ADMIN, {});
  const rows = tables(blocks).find(item => item.title === 'লেনদেন').rows;
  assert.equal(rows.length, snapshot.transactions.length, 'every ledger row is printed exactly once');
  assert.equal(new Set(rows.map(row => row[1])).size, rows.length, 'no transaction is repeated');
  const tiles = Object.fromEntries(tilesOf(blocks).map(tile => [tile.label, tile.value]));
  // Approved money only: 1500 + 700 = 2200 (the pending 2000 and the rejected 500 are not collections).
  assert.equal(tiles['অনুমোদিত আদায়'], '৳২,২০০');
  assert.equal(tiles['মোট লেনদেন'], '৪', 'every ledger row is counted, including pending and rejected');
  assert.equal(tiles['অপেক্ষমাণ'], '১');
  assert.equal(tiles['বাতিল'], '১');
});

test('a retaken exam never counts one student twice', async () => {
  const { blocks } = await build('exam.summary', ADMIN, { examId: 'EXM-1' });
  const rows = tables(blocks).find(item => item.title === 'ফলাফলের তালিকা').rows;
  assert.equal(rows.length, 2, 'two students sat the exam — one row each');
  assert.equal(rows.filter(row => row[1] === 'AP-1001').length, 1, 'the retry is not a second row');
  const tiles = Object.fromEntries(tilesOf(blocks).map(tile => [tile.label, tile.value]));
  assert.equal(tiles['অংশগ্রহণ'], '২');
  assert.equal(tiles['সর্বোচ্চ'], '৬', 'the best of the two attempts, rounded for display');
});

test('the management summary counts the institute from its own records', async () => {
  const { blocks } = await build('management.summary', ADMIN, { period: 'all' });
  const index = Object.fromEntries(tables(blocks).find(item => item.rows.some(row => row[0] === 'মোট শিক্ষার্থী')).rows);
  assert.equal(index['মোট শিক্ষার্থী'], '৩');
  assert.equal(index['সক্রিয় শিক্ষার্থী'], '২');
  assert.equal(index['নিষ্ক্রিয় / বাতিল'], '১');
  assert.equal(index['মোট লেনদেন'], '৪');
  assert.equal(index['অনুমোদনের অপেক্ষায়'], '১');
  assert.equal(index['মোট ফি আদায়'], '৳২,২০০');
});

test('an empty filter result reports honestly instead of printing blanks', async () => {
  const { blocks, empty } = await build('student.all', ADMIN, { className: 'অনার্স ৪র্থ বর্ষ' });
  assert.equal(empty, true, 'the engine knows there is nothing to print');
  assert.equal(catalog.blocksHaveData(blocks), false);
});

test('the period filter really filters: this week is not last month', async () => {
  const all = await build('fee.transactions', ADMIN, { period: 'all' });
  const old = await build('fee.transactions', ADMIN, { period: 'custom', from: iso(at(120)), to: iso(at(60)) });
  assert.ok(tables(all.blocks)[0].rows.length > 0);
  assert.equal(catalog.blocksHaveData(old.blocks), false, 'a range with no payments prints nothing');
});

/* ==========================================================================
   5. student self-service reports stay inside one student
   ========================================================================== */

test('every "আমার রিপোর্ট" is built from that one student\'s records', async () => {
  const ids = ['mine.payment', 'mine.due', 'mine.receipt', 'mine.attendance', 'mine.assignment', 'mine.examination', 'mine.marks', 'mine.result', 'mine.performance'];
  for (const id of ids) {
    const { blocks } = await build(id, STUDENT, {});
    const printed = flat(blocks);
    assert.equal(printed.includes('AP-1003'), false, `${id} never shows another student`);
    assert.equal(printed.includes('সুমাইয়া'), false, `${id} never shows another student's name`);
  }
});

test('my payment report lists only my own transactions', async () => {
  const { blocks } = await build('mine.payment', STUDENT, {});
  const printed = flat(blocks);
  assert.ok(printed.includes('REC-1'), 'my payment is there');
  assert.equal(printed.includes('REC-2'), false, 'another student\'s payment is not');
});

test('a notice report for a student carries the notices meant for them', async () => {
  const { blocks } = await build('notice.audience-wise', STUDENT, {});
  const printed = flat(blocks);
  assert.ok(printed.includes('বার্ষিক ক্রীড়া'), 'the notice for everyone');
  assert.ok(printed.includes('বিজ্ঞান বিভাগ সভা'), 'the notice for my batch');
});

/* ==========================================================================
   6. filter validation
   ========================================================================== */

test('a custom range must run forward', () => {
  const definition = report('fee.custom');
  assert.match(catalog.validateFilters(definition, { period: 'custom', from: '2026-09-30', to: '2026-09-01' }), /From Date/);
  assert.match(catalog.validateFilters(definition, { period: 'custom', from: '2026-09-01' }), /To Date/);
  assert.equal(catalog.validateFilters(definition, { period: 'custom', from: '2026-09-01', to: '2026-09-30' }), '');
});

test('a report that needs an exam or a student says so', () => {
  assert.match(catalog.validateFilters(report('exam.complete'), {}), /পরীক্ষা/);
  assert.match(catalog.validateFilters(report('student.profile'), {}), /শিক্ষার্থী/);
});
