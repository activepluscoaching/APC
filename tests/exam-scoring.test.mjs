/* Unit tests for functions/exam-scoring.js — the pure scoring core of the
   releaseExamResults Cloud Function. Runs in the root suite without the
   Firebase emulator or credentials. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeAnswer, keyAnswers, attemptAnswers, scoreAttempt } =
  require('../functions/exam-scoring.js');

test('scoreAttempt counts correct, wrong and unanswered per key question', () => {
  const key = { questions: [
    { uid: 'q1', answer: 'B' },
    { uid: 'q2', answer: 'A' },
    { uid: 'q3', answer: 'D' }
  ] };
  const attempt = { studentId: 'stu-1', answers: { q1: 'B', q2: 'C' } };
  const scored = scoreAttempt(key, attempt);
  assert.equal(scored.total, 3);
  assert.equal(scored.correct, 1);
  assert.equal(scored.wrong, 1);
  assert.equal(scored.unanswered, 1);
  assert.equal(scored.score, 1);
});

test('scoreAttempt accepts the flat answers map key shape', () => {
  const key = { answers: { q1: 'a', q2: 'b' } };
  const scored = scoreAttempt(key, { answers: { q1: 'A', q2: 'B' } });
  assert.equal(scored.total, 2);
  assert.equal(scored.score, 2);
  assert.deepEqual(keyAnswers(key), { q1: 'a', q2: 'b' });
});

test('answers compare case- and whitespace-insensitively', () => {
  assert.equal(normalizeAnswer(' B '), 'b');
  const key = { questions: [{ uid: 'q1', answer: ' C ' }] };
  assert.equal(scoreAttempt(key, { answers: { q1: 'c' } }).score, 1);
});

test('unknown question ids in the attempt are ignored, never scored', () => {
  const key = { answers: { q1: 'a' } };
  const scored = scoreAttempt(key, { answers: { q1: 'a', ghost: 'a' } });
  assert.equal(scored.total, 1);
  assert.equal(scored.score, 1);
  assert.equal(scored.answersGiven, 2);
});

test('questions the key does not score are excluded from the total', () => {
  const key = { questions: [{ uid: 'q1', answer: 'A' }, { uid: 'q2', answer: '' }] };
  const scored = scoreAttempt(key, { answers: { q1: 'A', q2: 'B' } });
  assert.equal(scored.total, 1);
  assert.equal(scored.score, 1);
});

test('an empty or missing attempt leaves every question unanswered', () => {
  const key = { answers: { q1: 'a', q2: 'b' } };
  for (const attempt of [{}, null, { answers: {} }]) {
    const scored = scoreAttempt(key, attempt);
    assert.equal(scored.unanswered, 2);
    assert.equal(scored.score, 0);
    assert.equal(scored.wrong, 0);
  }
});

test('a blank given answer counts as unanswered, never as correct', () => {
  const key = { answers: { q1: '' } }; // unkeyed → unscorable
  const scored = scoreAttempt(key, { answers: { q1: '' } });
  assert.equal(scored.total, 0);
  const keyed = scoreAttempt({ answers: { q1: 'a' } }, { answers: { q1: ' ' } });
  assert.equal(keyed.unanswered, 1);
  assert.equal(keyed.score, 0);
});

test('attemptAnswers and keyAnswers normalize to comparable tokens', () => {
  assert.deepEqual(attemptAnswers({ answers: { q1: 'A ', q2: 'b' } }), { q1: 'a', q2: 'b' });
  assert.deepEqual(keyAnswers({ questions: [{ uid: 'q1', answer: 'D' }] }), { q1: 'd' });
  assert.deepEqual(keyAnswers(null), {});
});
