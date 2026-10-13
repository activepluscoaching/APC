import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { prepareExamSubmission, safeForStagedRelease } = require('../functions/staged-exam-core.cjs');
const { AttemptError, attemptId, resultId, validStagedAttempt, submitStagedAttempt } = require('../functions/staged-attempt-core.cjs');
const { ReleaseError, closeStagedExamForRelease } = require('../functions/staged-release-core.cjs');
const { scoreAttempt } = require('../functions/exam-scoring.js');

const NOW = Date.UTC(2026, 9, 13, 10);
const START = NOW + 3_600_000, END = START + 3_600_000;
const caller = (uid = 'stu-1') => ({ uid, token: {
  role: 'student', status: 'approved', studentId: uid, email: 'student@example.com',
  firebase: { sign_in_provider: 'password' }
} });
const manager = () => ({ uid: 'manager-1', token: {
  role: 'manager', status: 'active', firebase: { sign_in_provider: 'password' }
} });

function fixture() {
  const question = { uid: 'q-1', text: 'Two plus two?', options: [
    { id: 'A', text: '3' }, { id: 'B', text: '4' }, { id: 'C', text: '5' }, { id: 'D', text: '6' }
  ], answer: 'B' };
  const { exam, key } = prepareExamSubmission({
    examId: 'exam-1', title: 'Math', subject: 'Math', className: 'Ten', group: 'A',
    startAt: START, endAt: END, questions: [question]
  }, { uid: 'teacher-1', classes: ['Ten'], now: NOW });
  const docs = new Map([
    ['users/stu-1', { uid: 'stu-1', email: 'student@example.com', role: 'student', status: 'approved' }],
    ['students/stu-1', { uid: 'stu-1', status: 'approved', className: 'Ten', group: 'A' }],
    ['exams/exam-1', { ...exam, createdAt: 'server-time', status: 'published',
      reviewedBy: 'manager-1', reviewedAt: 'server-time', reviewNote: '', publishedAt: 'server-time' }],
    ['exams/exam-1/private/key', { ...key, createdAt: 'server-time' }]
  ]);
  const reads = [];
  let queue = Promise.resolve();
  const db = {
    doc: path => ({ path }),
    runTransaction(callback) {
      const work = queue.then(async () => {
        const writes = [], tx = {
          get: async ref => { reads.push(ref.path); return { exists: docs.has(ref.path), data: () => docs.get(ref.path) }; },
          create(ref, data) { if (docs.has(ref.path)) throw new Error('already exists'); writes.push([ref.path, data]); },
          update(ref, patch) { writes.push([ref.path, { ...docs.get(ref.path), ...patch }]); }
        };
        const result = await callback(tx);
        for (const [path, value] of writes) docs.set(path, value);
        return result;
      });
      queue = work.catch(() => {});
      return work;
    }
  };
  const submit = (data = { examId: 'exam-1', answers: { 'q-1': 'B' } }, auth = caller(), time = START + 500) =>
    submitStagedAttempt({ db, caller: auth, data, clock: () => time, serverTimestamp: () => 'server-time' });
  const close = (auth = manager(), time = END) =>
    closeStagedExamForRelease({ db, caller: auth, examId: 'exam-1', clock: () => time,
      serverTimestamp: () => 'server-time' });
  return { db, docs, reads, submit, close };
}

test('an approved student submits one own-class answer sheet without reading the key', async () => {
  const env = fixture();
  const expectedId = attemptId('exam-1', 'stu-1');
  assert.deepEqual(await env.submit(), { ok: true, attemptId: expectedId, alreadySubmitted: false });
  const row = env.docs.get(`attempts/${expectedId}`);
  assert.deepEqual({ ...row.answers }, { 'q-1': 'B' });
  assert.equal(row.studentId, 'stu-1');
  assert.equal(row.submittedAt, START + 500);
  assert.equal(row.score, undefined);
  assert.equal(env.reads.includes('exams/exam-1/private/key'), false);
  assert.equal(validStagedAttempt(row, env.docs.get('exams/exam-1'), expectedId), true);
  assert.equal(scoreAttempt(env.docs.get('exams/exam-1/private/key'), row).score, 1);
  assert.deepEqual(await env.submit(undefined, undefined, END + 1),
    { ok: true, attemptId: expectedId, alreadySubmitted: true }, 'identical retry is safe after the window');
  assert.equal(env.docs.size, 5);
  assert.notEqual(attemptId('a_b', 'c'), attemptId('a', 'b_c'));
  assert.notEqual(resultId('a_b', 'c'), resultId('a', 'b_c'));
});

test('wrong role/provider/status/identity, unapproved profile and class/group mismatch fail before writes', async () => {
  for (const changed of [
    { role: 'teacher' }, { status: 'pending' }, { studentId: 'other' },
    { mustChangePassword: true }, { firebase: { sign_in_provider: 'anonymous' } }
  ]) {
    const env = fixture();
    await assert.rejects(env.submit(undefined, { ...caller(), token: { ...caller().token, ...changed } }), AttemptError);
    assert.equal(env.docs.size, 4);
  }
  for (const field of [
    ['users/stu-1', 'status', 'pending'], ['users/stu-1', 'role', 'admin'],
    ['students/stu-1', 'status', 'pending'], ['students/stu-1', 'className', 'Nine'],
    ['students/stu-1', 'group', 'B'], ['exams/exam-1', 'status', 'pending']
  ]) {
    const env = fixture();
    env.docs.set(field[0], { ...env.docs.get(field[0]), [field[1]]: field[2] });
    await assert.rejects(env.submit(), AttemptError);
    assert.equal(env.docs.size, 4);
  }
});

test('exact question set, answer values, time limits and single-use ID are enforced', async () => {
  for (const payload of [
    { examId: 'exam-1', answers: {} },
    { examId: 'exam-1', answers: { 'q-1': 'A', extra: 'B' } },
    { examId: 'exam-1', answers: { 'q-1': 'E' } },
    { examId: 'exam-1', answers: { 'q-1': 'b' } },
    { examId: 'exam-1', answers: { 'q-1': 'B' }, score: 100 },
    { examId: '../exam-1', answers: { 'q-1': 'B' } }
  ]) {
    const env = fixture();
    await assert.rejects(env.submit(payload), AttemptError);
    assert.equal(env.docs.size, 4);
  }
  for (const at of [START - 1, END]) {
    const env = fixture();
    await assert.rejects(env.submit(undefined, undefined, at), error => error.code === 'window-closed');
    assert.equal(env.docs.size, 4);
  }
  const env = fixture();
  await env.submit();
  await assert.rejects(env.submit({ examId: 'exam-1', answers: { 'q-1': 'C' } }),
    error => error.code === 'attempt-exists');
  assert.equal(env.docs.get(`attempts/${attemptId('exam-1', 'stu-1')}`).answers['q-1'], 'B');
});

test('release closes the exam before reading attempts and rejects new writes; retries resume', async () => {
  const env = fixture();
  await env.submit();
  await assert.rejects(env.close(manager(), END - 1), error => error.code === 'unverified-or-running');
  assert.equal(env.docs.get('exams/exam-1').resultsReleaseState, undefined);
  const closed = await env.close();
  assert.equal(closed.alreadyReleased, false);
  assert.equal(safeForStagedRelease(closed.exam, closed.key, END), true);
  assert.equal(env.docs.get('exams/exam-1').resultsReleaseState, 'closing');
  const retry = await env.close();
  assert.equal(retry.alreadyReleased, false, 'a crash before scoring remains retryable');
  const second = { ...caller('stu-2'), token: { ...caller('stu-2').token, email: 'second@example.com' } };
  env.docs.set('users/stu-2', { uid: 'stu-2', email: 'second@example.com', role: 'student', status: 'approved' });
  env.docs.set('students/stu-2', { uid: 'stu-2', status: 'approved', className: 'Ten', group: 'A' });
  await assert.rejects(env.submit(undefined, second, END - 1), error => error.code === 'window-closed');
  env.docs.set('exams/exam-1', { ...env.docs.get('exams/exam-1'), resultsReleaseState: 'released', resultsReleased: true });
  assert.equal((await env.close()).alreadyReleased, true);
});

test('closing or released marker denies a new submission even before its scheduled end', async () => {
  for (const patch of [{ resultsReleaseState: 'closing' }, { resultsReleased: true }]) {
    const env = fixture();
    env.docs.set('exams/exam-1', { ...env.docs.get('exams/exam-1'), ...patch });
    await assert.rejects(env.submit(undefined, undefined, START + 10), error => error.code === 'window-closed');
    assert.equal(env.docs.size, 4);
  }
});

test('release refuses anonymous/other-role/other-teacher and tampered public or private key', async () => {
  for (const auth of [
    { uid: 'teacher-2', token: { role: 'teacher', status: 'active', firebase: { sign_in_provider: 'password' } } },
    { uid: 'stu-1', token: { role: 'student', status: 'approved', firebase: { sign_in_provider: 'password' } } },
    { uid: 'manager-1', token: { role: 'manager', status: 'suspended', firebase: { sign_in_provider: 'password' } } },
    { uid: 'manager-1', token: { role: 'manager', status: 'active', firebase: { sign_in_provider: 'anonymous' } } }
  ]) await assert.rejects(fixture().close(auth), ReleaseError);
  for (const [path, patch] of [
    ['exams/exam-1', { answerKey: 'B' }],
    ['exams/exam-1', { questions: [{ uid: 'q-1', answer: 'B' }] }],
    ['exams/exam-1/private/key', { answers: { 'q-1': 'C' } }]
  ]) {
    const env = fixture();
    env.docs.set(path, { ...env.docs.get(path), ...patch });
    await assert.rejects(env.close(), error => error.code === 'unverified-or-running');
    assert.equal(env.docs.get('exams/exam-1').resultsReleaseState, undefined);
  }
});

test('release scorer rejects legacy/forged attempts before any result or answer write', () => {
  const env = fixture();
  const exam = env.docs.get('exams/exam-1');
  const row = { id: attemptId('exam-1', 'stu-1'), examId: 'exam-1', studentId: 'stu-1',
    className: 'Ten', group: 'A', status: 'submitted', answers: { 'q-1': 'B' },
    submittedAt: START + 1, createdAt: 'server-time' };
  assert.equal(validStagedAttempt(row, exam, row.id), true);
  for (const changed of [
    { ...row, studentId: 'stu-2' }, { ...row, answers: { 'q-1': 'E' } },
    { ...row, submittedAt: END }, { ...row, score: 100 }, { ...row, id: 'wrong' }
  ]) assert.equal(validStagedAttempt(changed, exam, row.id), false);
  const code = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const release = code.slice(code.indexOf('exports.releaseExamResults ='), code.indexOf('/* ---------------------------------------------------------------------------\n   Push notifications'));
  assert.ok(release.indexOf('closeStagedExamForRelease(') < release.indexOf("collection('attempts').where("));
  assert.ok(release.indexOf('if (!validStagedAttempt(') < release.indexOf("collection('results').doc("));
  assert.match(release, /resultsReleaseState: 'released'/);
  assert.match(code, /exports.studentSubmitExamAttempt = onCall\(\{ enforceAppCheck: true \}/);
});
