/* What the class sees when an MCQ result publishes itself (school request,
   2026-10-12): "MCQ পরীক্ষা অটো সাবমিট হওয়ার পর অটো রেজাল্ট পাবলিশ করতে হবে,
   আর কে কত পেয়েছে তা ঐ ক্লাসের সবাই দেখতে পারবে."
     • the last sheet in — including the one the timer submits for a student who
       walked away — publishes the paper in the same write;
     • the paper's results view then carries a board of every student of THAT
       class: name, marks, grade, rank, and whoever never submitted;
     • before publication no classmate's name is readable anywhere;
     • a written paper in the same store keeps waiting for its teacher's marks.

   Real page, real store, real 1-second heartbeat: the clock is moved past the
   closing bell and the panel is expected to catch up on its own. */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { examTemplate, validateExam, EXAM_KEY } from '../js/exam-data.js';
import { STORAGE_KEYS } from '../js/config.js';
import { initStudentExams } from '../js/student-exams.js';
import { examRepository as repo } from '../js/exam-data.js';

const realNow = Date.now;
let offset = 0;
const clockNow = () => realNow() + offset;
const setLeft = ms => { offset = (mcq.endAt - ms) - realNow(); };

const me = { id: 'AP-BOARD-1', name: 'বোর্ড দেখার শিক্ষার্থী', className: 'দশম শ্রেণি', group: '' };
const mate = { id: 'AP-BOARD-2', name: 'সহপাঠী শিক্ষার্থী', className: 'দশম শ্রেণি', group: '' };
const absent = { id: 'AP-BOARD-3', name: 'অনুপস্থিত শিক্ষার্থী', className: 'দশম শ্রেণি', group: '' };

const seeded = (type, id) => ({
  ...validateExam({
    type, title: type === 'mcq' ? 'আইসিটি এমসিকিউ' : 'গণিত লিখিত', subject: type === 'mcq' ? 'আইসিটি' : 'গণিত',
    className: 'দশম শ্রেণি', startAt: realNow() - 5 * 60000, endAt: realNow() + 60 * 60000,
    lateMinutes: 10, negative: 0.5, passPercent: 33, template: examTemplate(type)
  }),
  id, teacherId: 'DEMO-TEACHER', teacherName: 'Demo Teacher', status: 'published',
  resultsPublished: false, participants: type === 'mcq' ? [me, mate, absent] : [me],
  createdAt: realNow(), updatedAt: realNow()
});
const mcq = seeded('mcq', 'EX-BOARD-MCQ');
const written = seeded('written', 'EX-BOARD-WRITTEN');

let ctx;
const $ = sel => ctx.$(sel);
const $$ = sel => ctx.$$(sel);
const stored = () => JSON.parse(ctx.window.localStorage.getItem(EXAM_KEY));
const examIn = id => stored().exams.find(exam => exam.id === id);
const attemptOf = student => stored().attempts.find(a => a.studentId === student.id && a.examId === 'EX-BOARD-MCQ');
/* ো is a canonical composition of ে+া and য় splits into য+ZWNJ, so a word the
   panel writes and the same word typed here can differ in codepoints. Compare
   both sides decomposed. */
const has = (text, needle) => String(text).normalize('NFD').includes(String(needle).normalize('NFD'));
const openResults = async id => {
  await ctx.waitFor(() => {
    const button = $(`[data-student-exam="${id}"] [data-student-exam-action="results"]`);
    if (!button) { ctx.click($('#examTabs [data-exam-tab="results"]')); return false; }
    ctx.click(button);
    return true;
  }, 25000);
};

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  Date.now = clockNow;
  ctx.window.Date.now = clockNow;
  ctx.window.sessionStorage.setItem(STORAGE_KEYS.session, '1');
  ctx.window.localStorage.setItem(EXAM_KEY, JSON.stringify({ version: 1, exams: [mcq, written], attempts: [] }));
  const signIn = student => ctx.window.localStorage.setItem(STORAGE_KEYS.account, JSON.stringify({ status: 'active', student }));

  /* Every sheet is sat through the repository — the same calls a phone makes,
     including its "only your own account may write here" gate. The classmate's
     paper is finished; mine is left open so the closing bell has something to
     submit on its own. */
  signIn(mate);
  const theirs = (await repo.startAttempt('EX-BOARD-MCQ', mate)).attempts
    .find(a => a.examId === 'EX-BOARD-MCQ' && a.studentId === mate.id && a.status === 'active');
  await repo.saveAnswer(theirs.id, mate.id, 'q1', 'A');
  await repo.saveAnswer(theirs.id, mate.id, 'q2', 'C');
  await repo.finishAttempt(theirs.id, mate.id);
  assert.equal(examIn('EX-BOARD-MCQ').resultsPublished, false, 'সময় খোলা থাকলে শেষ উত্তরপত্রও প্রকাশ করে না');

  signIn(me);
  const mine = (await repo.startAttempt('EX-BOARD-MCQ', me)).attempts
    .find(a => a.examId === 'EX-BOARD-MCQ' && a.studentId === me.id && a.status === 'active');
  await repo.saveAnswer(mine.id, me.id, 'q1', 'A');
  initStudentExams({ getStudent: () => me, getAccount: () => ({ status: 'active' }) });
});
after(() => { Date.now = realNow; ctx?.window.close(); });

test('before the bell the paper promises it will publish itself and shows nothing about the class', async () => {
  ctx.click($('#examTabs [data-exam-tab="live"]'));
  await ctx.waitFor(() => Boolean($('[data-student-exam="EX-BOARD-MCQ"]')));
  await ctx.waitFor(() => Boolean($('[data-student-exam="EX-BOARD-MCQ"]')));
  const card = $('[data-student-exam="EX-BOARD-MCQ"]');
  assert.ok(has(card.textContent, 'সবার উত্তরপত্র জমা হলেই ফলাফল নিজে থেকেই প্রকাশিত হবে'), 'কার্ডে স্বয়ংক্রিয় প্রকাশের কথা');
  assert.ok(has($('.exam-card, .exam-list').textContent, 'সব প্রশ্ন একসঙ্গে'), 'এমসিকিউর নিয়মটাও কার্ডে আছে');
  assert.equal(examIn('EX-BOARD-MCQ').resultsPublished, false, 'সময় খোলা — এখনো প্রকাশ পায়নি');
  assert.equal($('#studentExamWorkspace')?.querySelector('[data-exam-board]'), null, 'বোর্ড আসেনি');
  assert.equal(has($('#studentExamWorkspace').textContent, mate.name), false, 'সহপাঠীর নাম কোথাও নাই');
  assert.equal(has($('#studentExamWorkspace').textContent, absent.name), false, 'যে বসেনি তার নামও নাই');
});

test('the closing bell submits the sheet, publishes the marks and paints the class board', async () => {
  setLeft(-2000);   // two seconds past the closing time; the panel re-checks every second

  await ctx.waitFor(() => attemptOf(me)?.status === 'submitted', 25000);
  assert.equal(attemptOf(me).finishedAt >= mcq.endAt, true, 'সময় শেষের জমা সেই সময়েই লেখা');
  await ctx.waitFor(() => examIn('EX-BOARD-MCQ').resultsPublished === true, 25000);
  const published = examIn('EX-BOARD-MCQ');
  assert.equal(published.resultsPublishedBy, 'auto', 'প্রকাশক স্বয়ংক্রিয় মূল্যায়ন, Manager নয়');
  assert.equal(stored().attempts.filter(a => a.examId === 'EX-BOARD-MCQ').every(a => a.status === 'submitted'), true, 'সবার উত্তরপত্র জমা');

  await openResults('EX-BOARD-MCQ');
  await ctx.waitFor(() => Boolean($('[data-exam-board]')), 25000);
  const board = $('[data-exam-board]');
  const text = board.textContent;


  assert.equal(board.tagName, 'SECTION', 'বোর্ড ফলাফল স্ক্রিনের ভেতরেই, নতুন স্ক্রিন নয়');
  assert.ok(has(text, 'পুরো ক্লাসের ফলাফল'), 'শিরোনাম');
  assert.ok(has(text, 'দশম শ্রেণি'), 'কোনো ক্লাসের তা লেখা');
  assert.ok(has(text, mate.name), 'সহপাঠীর নাম');
  assert.ok(has(text, '২ / ২'), 'সহপাঠী পূর্ণমানে');
  assert.ok(text.includes('A+'), 'গ্রেড');
  assert.ok(has(text, me.name), 'নিজের নাম');
  assert.ok(has(text, absent.name), 'যে বসেনি সেও তালিকায়');
  assert.ok(has(text, 'জমা দেয়নি'), 'তার পাশে জমা দেয়নি');
  assert.ok(has(text, 'তোমার ক্লাসের সব শিক্ষার্থীরাই দেখতে পাবে'), 'কারা দেখবে তাও লেখা');
  assert.ok(has(text, 'তোমার অবস্থান: মেধাক্রম ২'), 'নিজের অবস্থান স্বয়ংক্রিয়ভাবে বলা হয়');

  const rows = $$('.exam-board-row');
  assert.equal(rows.length, 3, 'এই ক্লাসের তিনজন — একজনও বাদ পড়েনি');
  const rowOf = student => rows.find(row => row.dataset.examBoardRow === student.id);
  assert.ok(has(rowOf(mate).textContent, '২ / ২'));
  assert.ok(has(rowOf(me).textContent, '১ / ২'));
  assert.ok(has(rowOf(absent).textContent, 'জমা দেয়নি'), 'অনুপস্থিতকে ০ নম্বর দেখানো হয় না');
  assert.ok(rowOf(absent).textContent.includes('—'), 'তার রেংক নেই');
  assert.equal(rowOf(me).classList.contains('is-me'), true, 'নিজের সারি চিহ্নিত');
  assert.equal(rowOf(me).getAttribute('aria-current'), 'true');
  assert.equal(rowOf(mate).getAttribute('aria-current'), null, 'সারিগুলোতে ভূমিকা নেই');
  assert.equal(rowOf(me).textContent.includes('(তুমি)'), true, 'তুমি লেবেল');
  assert.equal(board.querySelectorAll('input, select, textarea, button').length, 0, 'বোর্ড শুধু পড়া');

  const summary = $('.exam-summary');
  assert.ok(summary, 'নিজের সারাংশও আছে');
  assert.ok(has(summary.textContent, 'সময় শেষে স্বয়ংক্রিয় জমা'), 'কীভাবে জমা হয়েছে সেটাও বলা');
});

test('the marks never leave this class, and a written paper still waits for its teacher', async () => {
  assert.equal(examIn('EX-BOARD-MCQ').resultsPublished, true);
  assert.equal($$('[data-exam-board]').length, 1, 'প্রকাশিত এমসিকিউয়ের বোর্ডটাই একমাত্র');
  assert.equal(examIn('EX-BOARD-WRITTEN').resultsPublished, false, 'লিখিত প্রশ্নপত্র শিক্ষকের চান্ডা না হওয়া পর্যন্ত অপেক্ষা করে');

  ctx.click($('#examTabs [data-exam-tab="done"]'));
  await ctx.waitFor(() => Boolean($('[data-student-exam="EX-BOARD-WRITTEN"]')), 25000);
  const card = $('[data-student-exam="EX-BOARD-WRITTEN"]');
  assert.ok(has(card.textContent, 'ফলাফল Manager-এর প্রকাশের অপেক্ষায়'), 'লিখিতের অপেক্ষার বার্তা অপরিবর্তিত');
  assert.equal(has(card.textContent, 'প্রকাশিত ফলাফল ও'), false, 'লিখিত পরীক্ষায় ক্লাস-বোর্ডের বোতাম নেই');
});
