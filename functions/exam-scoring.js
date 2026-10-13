'use strict';

/* Pure MCQ scoring for releaseExamResults.
 * No firebase-admin here on purpose: the maths is unit-testable from the root
 * `npm test` without an emulator or credentials.
 *
 * Key shapes accepted (both live under exams/{id}/private/key):
 *   { questions: [{ uid, answer }] }   — the exam-flow shape
 *   { answers: { <uid>: 'B' } }        — the flat shape
 * Attempt shape: { studentId, answers: { <uid>: 'B' } }. */

/** Normalize a stored answer ('B', ' b ', '২') to a comparable token. */
function normalizeAnswer(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/** Scorable answers from a key document: uid → normalized answer. */
function keyAnswers(key) {
  const map = {};
  if (!key || typeof key !== 'object') return map;
  if (key.answers && typeof key.answers === 'object') {
    for (const [uid, answer] of Object.entries(key.answers)) {
      const normalized = normalizeAnswer(answer);
      if (normalized !== '') map[String(uid)] = normalized;
    }
  }
  if (Array.isArray(key.questions)) {
    for (const question of key.questions) {
      if (!question) continue;
      const uid = question.uid != null ? question.uid : question.id;
      if (uid == null) continue;
      const normalized = normalizeAnswer(question.answer);
      if (normalized !== '') map[String(uid)] = normalized;
    }
  }
  return map;
}

/** Normalized answers a student gave: uid → token. */
function attemptAnswers(attempt) {
  const map = {};
  const source = attempt && typeof attempt === 'object' && attempt.answers && typeof attempt.answers === 'object'
    ? attempt.answers : {};
  for (const [uid, answer] of Object.entries(source)) map[String(uid)] = normalizeAnswer(answer);
  return map;
}

/** Score one attempt against the key. Questions the key does not score
 * (missing/blank answers) are excluded; unknown question ids in the attempt
 * are ignored; a blank answer counts as unanswered, never as correct. */
function scoreAttempt(key, attempt) {
  const expected = keyAnswers(key);
  const given = attemptAnswers(attempt);
  let correct = 0, wrong = 0, unanswered = 0;
  for (const [uid, answer] of Object.entries(expected)) {
    const value = given[uid];
    if (value == null || value === '') unanswered += 1;
    else if (value === answer) correct += 1;
    else wrong += 1;
  }
  const total = Object.keys(expected).length;
  return {
    total,
    correct,
    wrong,
    unanswered,
    score: correct,
    answersGiven: Object.keys(given).length
  };
}

module.exports = { normalizeAnswer, keyAnswers, attemptAnswers, scoreAttempt };
