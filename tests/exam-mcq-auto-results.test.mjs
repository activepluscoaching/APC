/* MCQ results publish themselves. An MCQ paper is auto-scored the moment an
   answer sheet arrives — including the sheet the timer submits for a student who
   walked away — so once the window is closed and every sheet of that paper is in,
   a separate "Manager, press publish" step only delays what the class is waiting
   for. Reported 2026-10-12: after auto-submit, students sat on
   "ফলাফল Manager-এর প্রকাশের অপেক্ষায়" while their marks already existed.

   Pinned here:
     • the last sheet in publishes the paper in the same write;
     • a sheet still queued on an offline device holds publication back;
     • written papers and a paper nobody attempted are never auto-published;
     • the next list read sweeps a paper that closed while every device was away,
       idempotently (no second write when nothing is ready);
     • the class board (`classResults`) reaches a student only once results are
       published, carries marks and rank only — no answer sheet, no attempt id —
       and lists whoever never submitted as not submitted, not as zero.

   Harness: the same fake window + exam store tests/exams.test.mjs drives, with a
   moved clock. Nothing here touches the DOM; the panel is covered by
   tests/student-mcq-class-board.test.mjs. */
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  examRepository as repo, EXAM_KEY, examTemplate, MANAGER_ACTOR, totalMarks,
  mcqResultsReady, autoPublishMcqResults, classResultRows
} from '../js/exam-data.js';
import { adminStudents } from '../js/admin-data.js';
import { ROSTER_KEY } from '../js/office-data.js';
import { enabledClasses } from '../js/config.js';
import { TEACHER_ASSIGNMENTS_KEY } from '../js/teacher-assignments.js';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { STORAGE_KEYS } from '../js/config.js';

const realNow = Date.now;
let clock;
const startAt = new Date('2026-10-01T10:00:00Z').getTime();
const endAt = startAt + 3600000;
const [one, two, three] = adminStudents.filter(s => s.status === 'approved');
let env;

function setup() {
  const assignments = enabledClasses.map((className, index) => ({
    id: `TAS-${index}`, teacherUsername: 'teacher.apc', teacherName: 'Test Teacher',
    className, group: '', subject: 'Test', subjects: ['গণিত', 'ইংরেজি', 'বিজ্ঞান', 'বাংলা', 'Test']
  }));
  const store = new Map([
    [ROSTER_KEY, JSON.stringify(adminStudents)],
    [TEACHER_ASSIGNMENTS_KEY, JSON.stringify(assignments)],
    [STAFF_ACCOUNTS.teacher.accountKey, JSON.stringify({ role: 'teacher', username: 'teacher.apc', fullName: 'Test Teacher', status: 'active' })],
    [STAFF_ACCOUNTS.manager.accountKey, JSON.stringify({ role: 'manager', username: 'manager.apc', fullName: 'Test Manager', status: 'active' })],
    [STORAGE_KEYS.account, JSON.stringify({ status: 'active', student: one })]
  ]);
  clock = startAt - 3600000;
  Date.now = () => clock;
  const nav = { onLine: true };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: nav });
  const sessions = new Map([[STAFF_ACCOUNTS.teacher.sessionKey, '1'], [STAFF_ACCOUNTS.manager.sessionKey, '1'], [STORAGE_KEYS.session, '1']]);
  const state = { writes: 0 };
  globalThis.window = {
    localStorage: {
      getItem: key => store.get(key) ?? null,
      setItem: (key, value) => { state.writes++; store.set(key, value); },
      removeItem: key => { state.writes++; store.delete(key); }
    },
    sessionStorage: {
      getItem: key => sessions.get(key) ?? null,
      setItem: (key, value) => sessions.set(key, value),
      removeItem: key => sessions.delete(key)
    },
    dispatchEvent: () => {}
  };
  env = {
    store, nav, state, sessions,
    db: () => JSON.parse(store.get(EXAM_KEY) || '{"version":1,"exams":[],"attempts":[]}'),
    seedDb: db => store.set(EXAM_KEY, JSON.stringify(db)),
    exam: id => JSON.parse(store.get(EXAM_KEY)).exams.find(exam => exam.id === id),
    published: id => JSON.parse(store.get(EXAM_KEY)).exams.find(exam => exam.id === id).resultsPublished === true
  };
  return env;
}
function seedSession(student) {
  window.localStorage.setItem(STORAGE_KEYS.account, JSON.stringify({ status: 'active', student }));
  window.sessionStorage.setItem(STORAGE_KEYS.session, '1');
}
const fields = (extra = {}) => ({
  title: 'গণিত মূল্যায়ন', subject: 'গণিত', className: 'দশম শ্রেণি', type: 'mcq',
  startAt, endAt, lateMinutes: 10, negative: 0.5, passPercent: 33,
  template: examTemplate('mcq'), ...extra
});
async function publish(extra = {}) {
  let db = await repo.saveDraft(fields(extra));
  const id = db.exams[0].id;
  await repo.requestApproval(id);
  db = await repo.review(id, 'publish', {}, MANAGER_ACTOR);
  return db.exams.find(exam => exam.id === id);
}
/** Start and answer a paper — the clock must be INSIDE the window, like real
    sitting. `submit` then lands the sheet whenever it arrives: on the student's
    own tap, or after the timer, which is the case that must publish. */
async function begin(exam, student, answers) {
  seedSession(student);
  let db = await repo.startAttempt(exam.id, student);
  const attempt = db.attempts.find(item => item.examId === exam.id && item.studentId === student.id && item.status === 'active');
  for (const [questionId, option] of Object.entries(answers)) db = await repo.saveAnswer(attempt.id, student.id, questionId, option);
  return attempt.id;
}
const submit = (attemptId, student) => repo.finishAttempt(attemptId, student.id);

afterEach(() => { Date.now = realNow; });

test('the answer sheet that closes the paper publishes the result itself', async () => {
  setup();
  const exam = await publish();
  // One sheet in while the window is still open: nothing to publish yet.
  clock = startAt + 60000;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  assert.equal(env.published(exam.id), false, 'সময় খোলা থাকলে প্রকাশ হয় না');
  // The second student is still writing when time runs out.
  const second = await begin(exam, two, { q1: 'B' });
  clock = endAt + 60000;
  assert.equal(env.published(exam.id), false, 'একজনের উত্তরপত্র তখনও চলছে');
  await submit(second, two);
  const after = env.exam(exam.id);
  assert.equal(after.resultsPublished, true, 'শেষ উত্তরপত্রের লেখাতেই ফলাফল প্রকাশিত');
  assert.equal(after.resultsPublishedAt, endAt + 60000, 'প্রকাশের সময় বসেছে');
  assert.equal(after.resultsPublishedBy, 'auto', 'কে প্রকাশ করেছে স্পষ্ট — Manager নয়, স্বয়ংক্রিয় মূল্যায়ন');
  assert.equal(env.db().attempts.find(attempt => attempt.studentId === two.id).finishedAt, endAt,
    'সময় শেষের জমা সেই সময়েই লেখা হয় (গণনার ঘড়ি বাড়ে না)');
});

test('a sheet queued on an offline device holds the result back until it lands', async () => {
  setup();
  const exam = await publish();
  clock = startAt + 60000;
  env.nav.onLine = false;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  assert.equal(env.db().attempts[0].status, 'queued', 'অফলাইনে সারি ফোনেই থাকে');
  assert.equal(env.published(exam.id), false, 'জমা-অপেক্ষমাণ সারি থাকলে প্রকাশ নয়');
  env.nav.onLine = true;
  const second = await begin(exam, two, { q1: 'A' });
  clock = endAt + 60000;
  await submit(second, two);
  assert.equal(env.published(exam.id), false, 'একজনের সারি এখনও বাকি');
  seedSession(one);
  await repo.syncStudent(one.id);
  assert.equal(env.db().attempts.find(attempt => attempt.studentId === one.id).status, 'submitted', 'ডিভাইস অনলাইনে এলে সারি জমা');
  assert.equal(env.published(exam.id), true, 'সবার সারি হলেই ফলাফল প্রকাশ');
});

test('written papers are never auto-published — marks are a human decision', async () => {
  setup();
  const exam = await publish({ type: 'written', title: 'লিখিত পরীক্ষা', template: examTemplate('written') });
  clock = endAt + 60000;
  const db = { version: 1, exams: [env.exam(exam.id)], attempts: [{
    id: 'A-W1', examId: exam.id, studentId: one.id, name: one.name, className: one.className,
    number: 1, status: 'submitted', startedAt: startAt, savedAt: endAt, finishedAt: endAt,
    score: 1, order: [], answers: {}
  }] };
  env.seedDb(db);
  assert.equal(mcqResultsReady(db.exams[0], db, clock), false, 'type mcq না হলে ready-ই নয়');
  await repo.sweepResults();
  assert.equal(env.published(exam.id), false, 'লিখিত: Manager-এর প্রকাশেই থামে');
  assert.equal(autoPublishMcqResults(env.db(), clock), 0, 'কোনো স্বয়ংক্রিয় প্রকাশ হয়নি');
});

test('a paper nobody attempted is not "published" as an empty board', async () => {
  setup();
  const exam = await publish();
  clock = endAt + 60000;
  assert.equal(mcqResultsReady(env.exam(exam.id), env.db(), clock), false, 'উত্তরপত্র নেই — মানে ফলাফল নয়');
  await repo.sweepResults();
  assert.equal(env.published(exam.id), false);
  assert.equal(env.db().attempts.length, 0, 'কিছুই বানানো হয়নি');
});

test('the next read sweeps a paper that closed while every device was away — once', async () => {
  setup();
  const exam = await publish();
  clock = startAt + 60000;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  assert.equal(env.published(exam.id), false, 'সারি জমা হয়েছে, কিন্তু জানালা খোলা');
  clock = endAt + 60000;
  const list = await repo.list(MANAGER_ACTOR);
  assert.equal(list.exams.find(item => item.id === exam.id).resultsPublished, true,
    'পরের বার তালিকা পড়তেই প্রকাশ হয়ে গেছে — কারও বাটন চেপার প্রয়োজন নেই');
  const writes = env.state.writes;
  await repo.list(MANAGER_ACTOR);
  await repo.sweepResults();
  assert.equal(env.state.writes, writes, 'আর কিছু ready না থাকলে লেখা হয়ই না (idempotent)');
  assert.deepEqual(Object.keys(env.exam(exam.id)).filter(key => /^results/i.test(key)).sort(),
    ['resultsPublished', 'resultsPublishedAt', 'resultsPublishedBy'], 'স্বয়ংক্রিয় প্রকাশ শুধু এই তিনটি ফিল্ড বদলায়');
  assert.equal(env.exam(exam.id).status, 'published', 'পরীক্ষার workflow status-এ হাত দেয় না');
});

test('the class board carries marks to the class — and nothing else', async () => {
  setup();
  const exam = await publish();
  clock = startAt + 60000;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  const second = await begin(exam, two, { q1: 'B' });
  await submit(second, two);
  // A third approved student of the class never opened the paper; the Teacher
  // also marked them absent. Both must show on the board, neither as "০".
  const withRoster = env.db();
  withRoster.exams[0].participants = [...withRoster.exams[0].participants, { id: 'AP-ABSENT-1', name: 'অনুপস্থিত শিক্ষার্থী', className: 'দশম শ্রেণি', group: '' }];
  withRoster.exams[0].absentIds = ['AP-ABSENT-1'];
  env.seedDb(withRoster);
  // The class roster the student's device carries: two of them sat the paper, one
  // never opened it, and two more must stay off the board (not approved yet).
  const rosterRows = [...adminStudents,
    { id: 'AP-QUIET-1', name: 'চুপচাপ শিক্ষার্থী', className: 'দশম শ্রেণি', status: 'approved' },
    { id: 'AP-PENDING-1', name: 'অনুমোদনের অপেক্ষায় শিক্ষার্থী', className: 'দশম শ্রেণি', status: 'pending' }];
  env.store.set(ROSTER_KEY, JSON.stringify(rosterRows));
  const db = env.db();
  const stored = db.exams.find(item => item.id === exam.id);
  const rows = classResultRows(db, stored);
  const total = totalMarks(stored);
  /* The board is the class, not the guest list: every approved student of this
     class has a row — from the paper when they sat it, from the device's roster
     copy when they did not — and no student of another class ever appears. */
  const classmates = rosterRows.filter(person => person.status === 'approved' && person.className === 'দশম শ্রেণি');
  assert.equal(classmates.length, 3, 'দুজনে বসেছে, একজন বসেনি');
  assert.equal(rows.length, classmates.length + 1, 'পুরো ক্লাস + যাকে উত্তরপত্র খুলতে দেখা গেছে');
  const ids = rows.map(row => row.studentId);
  for (const person of classmates) assert.ok(ids.includes(person.id), `${person.name}-এর সারি রোস্টার থেকে এসেছে`);
  assert.ok(ids.includes('AP-ABSENT-1'), 'কার্ডে-থাকা অনুপস্থিতের সারি');
  assert.equal(ids.includes(three.id), false, 'অন্য ক্লাসের শিক্ষার্থী বোর্ডে আসে না');
  assert.ok(!rows.some(row => row.studentId === 'AP-PENDING-1'), 'অনুমোদিত নয় এমন শিক্ষার্থী বোর্ডে আসে না');
  assert.ok(!rows.some(row => row.studentId === '260810019'), 'রোস্টারে বাতিল হওয়া শিক্ষার্থীও আসে না');
  const quiet = rows.find(row => row.studentId === 'AP-QUIET-1');
  assert.equal(quiet.absent, true, 'যে একবারও খোলেনি সে জমা দেয়নি');
  assert.equal(quiet.score, null, 'তাকে ০ নম্বর দেওয়া হয় না');
  assert.equal(quiet.rank, null, 'তার মেধাক্রম নেই');
  assert.equal(classResultRows(db, stored, []).length, 3, 'রোস্টারের কপি না থাকলে শুধু যারা বসেছে তারাই — কিছু গড়া হয় না');
  const scored = rows.filter(row => !row.absent);
  assert.equal(scored.length, 2, 'জমা দেওয়া দুজনের সারি');
  assert.deepEqual(scored.map(row => row.rank), [1, 2], 'মেধাক্রম সাজানো');
  for (const row of scored) {
    assert.equal(row.total, total, 'পূর্ণমান সঙ্গে আছে');
    assert.ok(Number.isFinite(row.score) && row.score >= 0);
    assert.ok(typeof row.grade === 'string' && row.grade, 'গ্রেড আছে');
    assert.deepEqual(Object.keys(row).sort(),
      ['absent', 'attempts', 'autoSubmitted', 'className', 'correct', 'grade', 'group', 'name', 'rank', 'score', 'studentId', 'total', 'unanswered', 'wrong'],
      'উত্তরপত্র, প্রচেষ্টার id বা অপশনের ক্রম — কোনোটিই বোর্ডে নেই');
    assert.equal(row.autoSubmitted, false, 'সময় থাকতে দেওয়া সারি স্বয়ংক্রিয় বলে না');
  }
  const missing = rows.filter(row => row.absent);
  assert.equal(missing.length, classmates.length - 2 + 1, 'যে অংশ নেয়নি তার সারিও আছে');
  assert.equal(missing[0].markedAbsent, true, 'শিক্ষকের চিহ্নিত অনুপস্থিতি বোর্ডে ধরা পড়ে');
  for (const row of missing) {
    assert.equal(row.score, null, 'অনুপস্থিত শিক্ষার্থীকে ০ নম্বর দেওয়া হয় না');
    assert.equal(row.grade, null);
    assert.equal(row.rank, null);
  }
});

test('a student receives the board only after publication, and only for their own class', async () => {
  setup();
  const exam = await publish();
  clock = startAt + 60000;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  const second = await begin(exam, two, { q1: 'B' });
  await submit(second, two);
  seedSession(one);
  const hiddenExam = (await repo.list({ role: 'student', studentId: one.id })).exams.find(item => item.id === exam.id);
  assert.equal(hiddenExam.resultsPublished, false, 'জানালা খোলা থাকলে প্রকাশ নয়');
  assert.equal(hiddenExam.classResults, undefined, 'অপ্রকাশিত ফলাফল কেউ পায় না');
  assert.equal(hiddenExam.participants.length, 1, 'নিজের participant-ই থাকে');

  clock = endAt + 60000;
  const board = (await repo.listForStudent(one.id)).exams.find(item => item.id === exam.id);
  assert.equal(board.resultsPublished, true, 'সময় শেষ হলে পড়ার সঙ্গে সঙ্গেই প্রকাশ');
  assert.ok(Array.isArray(board.classResults) && board.classResults.length >= 2, 'ক্লাসের বোর্ড সঙ্গে আসে');
  const ids = new Set(board.classResults.map(row => row.studentId));
  assert.ok(ids.has(one.id) && ids.has(two.id), 'নিজের ক্লাসের দুজনেরই সারি');
  assert.ok(board.classResults.every(row => row.answers === undefined && row.id === undefined), 'উত্তরপত্র কারও কাছেই যায় না');
  const twoRow = board.classResults.find(row => row.studentId === two.id);
  assert.ok(twoRow.name && twoRow.name.length > 1, 'নাম থাকলেই "কে কত পেয়েছে" বোঝা যায়');

  // The gate is the flag, not the clock: revoke publication (and hold one sheet
  // back so nothing re-publishes), and the board disappears with it.
  const db = env.db();
  env.seedDb({
    ...db,
    exams: db.exams.map(item => ({ ...item, resultsPublished: false, resultsPublishedAt: undefined, resultsPublishedBy: undefined })),
    attempts: db.attempts.map(attempt => attempt.studentId === two.id ? { ...attempt, status: 'queued' } : attempt)
  });
  const revoked = await repo.list({ role: 'student', studentId: one.id });
  assert.equal(revoked.exams.find(item => item.id === exam.id).classResults, undefined, 'প্রকাশ তুলে নিলে বোর্ড থাকে না');
  assert.equal(revoked.exams.find(item => item.id === exam.id).resultsPublished, false, 'বাকি সারি থাকলে sweep-ও নিজে থেকে প্রকাশ করে না');

  seedSession(three);
  const outsider = await repo.listForStudent(three.id);
  assert.equal(outsider.exams.some(item => item.id === exam.id), false, 'অন্য শ্রেণির শিক্ষার্থী বোর্ডও পায় না');
});

test('a paper that names no class keeps its board to the sheets it has', async () => {
  /* Exams saved before the class picker carry no className, and that emptiness
     means "visible to every class". Widening such a paper's board from the
     roster would print the whole school's name list on one paper — so the roster
     is only consulted for a paper that actually names a class. */
  setup();
  const exam = await publish();
  clock = startAt + 60000;
  const first = await begin(exam, one, { q1: 'A' });
  await submit(first, one);
  const legacy = env.db();
  legacy.exams[0].className = '';
  legacy.exams[0].participants = [];
  env.seedDb(legacy);
  env.store.set(ROSTER_KEY, JSON.stringify([
    { id: 'AP-OTHER-CLASS', name: 'অন্য শ্রেণির শিক্ষার্থী', className: 'নবম শ্রেণি', status: 'approved' }
  ]));
  const stored = env.db().exams.find(item => item.id === exam.id);
  const rows = classResultRows(env.db(), stored);
  assert.deepEqual(rows.map(row => row.studentId), [one.id], 'শুধু যে উত্তরপত্র দিয়েছে');
  assert.equal(rows.some(row => row.name === 'অন্য শ্রেণির শিক্ষার্থী'), false, 'রোস্টার থেকে কারও নাম যোগ হয় না');
  assert.equal(rows[0].absent, false);
});
