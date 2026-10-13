import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { ExamSubmissionError, prepareExamSubmission, safeForManagerReview, submitStagedExam } =
  require('../functions/staged-exam-core.cjs');
const { scoreAttempt } = require('../functions/exam-scoring.js');

const NOW = Date.UTC(2026, 9, 13, 10);
const paper = () => ({
  examId: 'paper-1', title: 'Math MCQ', subject: 'Math', className: 'Ten', group: 'A',
  startAt: NOW + 3_600_000, endAt: NOW + 7_200_000,
  questions: [
    { uid: 'q-1', text: 'Two plus two?', options: [
      { id: 'A', text: 'Three' }, { id: 'B', text: 'Four' },
      { id: 'C', text: 'Five' }, { id: 'D', text: 'Six' }
    ], answer: 'B' }
  ]
});
const caller = () => ({ uid: 'teacher-1', token: {
  role: 'teacher', status: 'active', mustChangePassword: false,
  email: 'teacher@example.com', firebase: { sign_in_provider: 'password' }, classes: ['Ten']
} });
const profile = () => ({ uid: 'teacher-1', role: 'teacher', status: 'active', email: 'teacher@example.com' });

function fixture() {
  const docs = new Map([['users/teacher-1', profile()]]);
  let queue = Promise.resolve(), failKey = false;
  const db = {
    doc: path => ({ path }),
    runTransaction(callback) {
      const work = queue.then(async () => {
        const changes = [], tx = {
          get: async ref => ({ exists: docs.has(ref.path), data: () => docs.get(ref.path) }),
          create(ref, value) {
            if (docs.has(ref.path) || changes.some(change => change.path === ref.path)) throw new Error('already-exists');
            if (failKey && ref.path.endsWith('/private/key')) throw new Error('key-write-failed');
            changes.push({ path: ref.path, value });
          }
        };
        const result = await callback(tx);
        for (const change of changes) docs.set(change.path, change.value);
        return result;
      });
      queue = work.catch(() => {});
      return work;
    }
  };
  return { docs, db, failKey: () => { failKey = true; },
    submit: (data = paper(), auth = caller()) => submitStagedExam({
      db, caller: auth, data, now: NOW, serverTimestamp: () => 'server-time'
    }) };
}

test('one atomic Teacher transaction stores no answer in the public exam; scoring reads only private key', async () => {
  const env = fixture();
  assert.deepEqual(await env.submit(), { ok: true, examId: 'paper-1', alreadyExists: false });
  const publicExam = env.docs.get('exams/paper-1');
  const privateKey = env.docs.get('exams/paper-1/private/key');
  assert.equal(publicExam.status, 'pending');
  assert.equal(publicExam.teacherUid, 'teacher-1');
  assert.equal(publicExam.schemaVersion, 1);
  assert.equal(JSON.stringify(publicExam).includes('"answer"'), false);
  assert.equal(JSON.stringify(publicExam).includes('"requestHash"'), false);
  assert.deepEqual({ ...privateKey.answers }, { 'q-1': 'B' });
  assert.equal(safeForManagerReview(publicExam, privateKey, NOW), true);
  assert.equal(scoreAttempt(privateKey, { answers: { 'q-1': 'B' } }).score, 1);
  assert.deepEqual(await env.submit(), { ok: true, examId: 'paper-1', alreadyExists: true });
  assert.equal(env.docs.size, 3);
});

test('untrusted clients cannot smuggle keys, nested answer fields or path segments', () => {
  const validate = data => prepareExamSubmission(data, { uid: 'teacher-1', classes: ['Ten'], now: NOW });
  for (const invalid of [
    { ...paper(), answerKey: { 'q-1': 'B' } },
    { ...paper(), examId: '../students/stu-1' },
    { ...paper(), examId: '__proto__' },
    { ...paper(), questions: paper().questions.map(q => ({ ...q, uid: 'constructor' })) },
    { ...paper(), questions: paper().questions.map(q => ({ ...q, correct: 'B' })) },
    { ...paper(), questions: paper().questions.map(q => ({ ...q, options: [{ id: 'A', text: 'A', answer: 'B' }, ...q.options.slice(1)] })) },
    { ...paper(), questions: [paper().questions[0], paper().questions[0]] },
    { ...paper(), questions: [{ ...paper().questions[0], uid: { toString: () => 'q-1' } }] },
    { ...paper(), questions: [] },
    { ...paper(), className: 'Nine' },
    { ...paper(), startAt: NOW - 1 },
    { ...paper(), endAt: NOW + 100 * 86_400_000 },
    { ...paper(), title: ' Math MCQ' }
  ]) assert.throws(() => validate(invalid), ExamSubmissionError);
});

test('invalid Auth provider, role, status, class or mismatched profile does not write', async () => {
  for (const changed of [
    { role: 'admin' }, { status: 'suspended' }, { mustChangePassword: true },
    { classes: ['Nine'] }, { firebase: { sign_in_provider: 'anonymous' } },
    { email: 'different@example.com' }
  ]) {
    const env = fixture();
    await assert.rejects(env.submit(paper(), { ...caller(), token: { ...caller().token, ...changed } }), ExamSubmissionError);
    assert.equal(env.docs.size, 1);
  }
  const env = fixture();
  env.docs.set('users/teacher-1', { ...profile(), role: 'manager' });
  await assert.rejects(env.submit(), error => error.code === 'profile-mismatch');
  assert.equal(env.docs.size, 1);
});

test('collisions and partial key writes cannot publish or overwrite a paper', async () => {
  const env = fixture();
  const results = await Promise.all([env.submit(), env.submit()]);
  assert.equal(results.filter(result => result.alreadyExists).length, 1);
  const changed = { ...paper(), questions: paper().questions.map(q => ({ ...q, answer: 'C' })) };
  await assert.rejects(env.submit(changed), error => error.code === 'exam-id-reserved');
  assert.deepEqual({ ...env.docs.get('exams/paper-1/private/key').answers }, { 'q-1': 'B' });
  env.docs.set('exams/paper-1', { ...env.docs.get('exams/paper-1'), answerKey: 'leaked' });
  await assert.rejects(env.submit(), error => error.code === 'exam-id-reserved', 'tampered public paper cannot be acknowledged as an identical retry');
  const broken = fixture();
  broken.failKey();
  await assert.rejects(broken.submit(), /key-write-failed/);
  assert.equal(broken.docs.has('exams/paper-1'), false, 'transaction must be atomic');
});

test('Manager publish gate rejects legacy, altered, missing or expired keys', () => {
  const { exam, key } = prepareExamSubmission(paper(), { uid: 'teacher-1', classes: ['Ten'], now: NOW });
  assert.equal(safeForManagerReview({ ...exam, createdAt: 'server-time' }, { ...key, createdAt: 'server-time' }, NOW), true);
  for (const [publicExam, privateKey, at] of [
    [{ ...exam, schemaVersion: undefined }, key, NOW],
    [{ ...exam, answerKey: 'B' }, key, NOW],
    [{ ...exam, questions: [{ ...exam.questions[0], answer: 'B' }] }, key, NOW],
    [exam, { ...key, answers: { 'q-1': 'C' } }, NOW],
    [exam, { ...key, answers: {} }, NOW],
    [exam, null, NOW],
    [exam, key, exam.startAt]
  ]) assert.equal(safeForManagerReview(publicExam, privateKey, at), false);
});

test('callable requires App Check, routes through trusted core, review rejects unvalidated papers', () => {
  const source = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const submit = source.slice(source.indexOf('exports.teacherSubmitExamForReview ='), source.indexOf('exports.managerReviewExam ='));
  const review = source.slice(source.indexOf('exports.managerReviewExam ='), source.indexOf('exports.adminSetAccountStatus ='));
  assert.match(submit, /onCall\(\{ enforceAppCheck: true \}/);
  assert.match(submit, /requireCaller\(request, 'teacher'\)/);
  assert.match(submit, /submitStagedExam\(\{/);
  assert.match(review, /safeQuestionKey\(examId\)/);
  assert.match(review, /decision === 'publish'/);
  assert.match(review, /safeForManagerReview\(exam.data\(\), key.data\(\), Date.now\(\)\)/);
});
