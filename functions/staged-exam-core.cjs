'use strict';

/* Staged, server-owned MCQ submission. This is NOT the live local exam flow.
 * No Firebase imports: transaction, authorization and key isolation are tested
 * without credentials. The callable uses only Admin SDK refs/transactions. */
const crypto = require('node:crypto');
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
const safeId = value => typeof value === 'string' && SAFE_ID.test(value) && !RESERVED.has(value);
const OPTIONS = ['A', 'B', 'C', 'D'];
const SCHEMA_VERSION = 1;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (data, keys) => object(data) && Object.keys(data).every(key => keys.includes(key));

class ExamSubmissionError extends Error {
  constructor(code) { super(code); this.name = 'ExamSubmissionError'; this.code = code; }
}
const refuse = code => { throw new ExamSubmissionError(code); };

function text(value, max) {
  if (typeof value !== 'string' || value !== value.normalize('NFC') || value !== value.trim() ||
      !value || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) refuse('invalid-exam');
  return value;
}

function prepareExamSubmission(data, { uid, classes, now }) {
  if (!safeId(uid || '') || !exactKeys(data, ['examId', 'title', 'subject', 'className', 'group', 'startAt', 'endAt', 'questions'])) refuse('invalid-exam');
  const examId = text(data.examId, 128);
  if (!safeId(examId)) refuse('invalid-exam');
  const title = text(data.title, 150), subject = text(data.subject, 80), className = text(data.className, 80);
  const group = data.group === undefined ? '' : (data.group === '' ? '' : text(data.group, 80));
  if (!Array.isArray(classes) || !classes.includes(className)) refuse('class-denied');
  if (!Number.isSafeInteger(data.startAt) || !Number.isSafeInteger(data.endAt) ||
      !Number.isFinite(now) || data.startAt < now + 5 * 60_000 ||
      data.startAt > now + 365 * 86_400_000 || data.endAt <= data.startAt ||
      data.endAt - data.startAt > 86_400_000) refuse('invalid-window');
  if (!Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 50) refuse('invalid-questions');
  const ids = new Set(), answers = Object.create(null);
  const questions = data.questions.map(question => {
    if (!exactKeys(question, ['uid', 'text', 'options', 'answer']) ||
        !safeId(question.uid || '') || ids.has(question.uid) ||
        !Array.isArray(question.options) || question.options.length !== 4 ||
        !OPTIONS.includes(question.answer)) refuse('invalid-questions');
    ids.add(question.uid);
    const options = question.options.map((option, index) => {
      if (!exactKeys(option, ['id', 'text']) || option.id !== OPTIONS[index]) refuse('invalid-questions');
      return { id: option.id, text: text(option.text, 500) };
    });
    const result = { uid: question.uid, text: text(question.text, 1200), options };
    answers[question.uid] = question.answer;
    return result;
  });
  const exam = { id: examId, schemaVersion: SCHEMA_VERSION, status: 'pending', type: 'mcq',
    teacherUid: uid, title, subject, className, group, startAt: data.startAt, endAt: data.endAt, questions };
  // Digest stays ONLY in the private key document, never in the public exam:
  // a public hash of four-choice answers would allow brute-force disclosure.
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ exam, answers })).digest('hex');
  return { examId, exam, key: { examId, answers, requestHash, schemaVersion: SCHEMA_VERSION } };
}

function safeForManagerReview(exam, key, now) {
  if (!exactKeys(exam, ['id', 'schemaVersion', 'status', 'type', 'teacherUid', 'title', 'subject',
      'className', 'group', 'startAt', 'endAt', 'questions', 'createdAt']) ||
      !exactKeys(key, ['examId', 'answers', 'requestHash', 'schemaVersion', 'createdAt']) ||
      exam.type !== 'mcq' || exam.schemaVersion !== SCHEMA_VERSION ||
      exam.status !== 'pending' || !safeId(exam.id || '') ||
      !safeId(exam.teacherUid || '') || !Number.isFinite(now) ||
      !Number.isSafeInteger(exam.startAt) || !Number.isSafeInteger(exam.endAt) ||
      exam.startAt <= now || exam.endAt <= exam.startAt || exam.endAt - exam.startAt > 86_400_000 ||
      key.examId !== exam.id || key.schemaVersion !== SCHEMA_VERSION ||
      !/^[a-f0-9]{64}$/.test(key.requestHash || '') || !object(key.answers) ||
      !Array.isArray(exam.questions) || exam.questions.length < 1 || exam.questions.length > 50) return false;
  const ids = new Set();
  for (const question of exam.questions) {
    if (!exactKeys(question, ['uid', 'text', 'options']) || !safeId(question.uid || '') ||
        ids.has(question.uid) || typeof question.text !== 'string' ||
        !Array.isArray(question.options) || question.options.length !== 4) return false;
    ids.add(question.uid);
    for (let index = 0; index < 4; index++) {
      const option = question.options[index];
      if (!exactKeys(option, ['id', 'text']) || option.id !== OPTIONS[index] || typeof option.text !== 'string') return false;
    }
    if (!OPTIONS.includes(key.answers[question.uid])) return false;
  }
  if (Object.keys(key.answers).length !== ids.size) return false;
  const { createdAt: _examCreatedAt, ...originalExam } = exam;
  const orderedAnswers = Object.fromEntries(exam.questions.map(q => [q.uid, key.answers[q.uid]]));
  const digest = crypto.createHash('sha256').update(JSON.stringify({ exam: originalExam, answers: orderedAnswers })).digest('hex');
  return digest === key.requestHash;
}

function safeForStagedRelease(exam, key, now) {
  if (!exactKeys(exam, ['id', 'schemaVersion', 'status', 'type', 'teacherUid', 'title', 'subject',
      'className', 'group', 'startAt', 'endAt', 'questions', 'createdAt', 'reviewedBy',
      'reviewedAt', 'reviewNote', 'publishedAt', 'resultsReleaseState', 'releaseStartedAt',
      'resultsReleased', 'resultsReleasedAt']) || exam.status !== 'published' ||
      !Number.isSafeInteger(now) || now < exam.endAt ||
      !exam.reviewedBy || !exam.publishedAt) return false;
  const { reviewedBy, reviewedAt, reviewNote, publishedAt, resultsReleaseState,
    releaseStartedAt, resultsReleased, resultsReleasedAt, ...original } = exam;
  return safeForManagerReview({ ...original, status: 'pending' }, key, exam.startAt - 1);
}

async function submitStagedExam({ db, serverTimestamp, caller, data, now = Date.now() } = {}) {
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function' ||
      typeof serverTimestamp !== 'function') refuse('trusted-admin-required');
  const uid = caller?.uid, claims = caller?.token || {};
  if (!safeId(uid || '') || claims.role !== 'teacher' || claims.status !== 'active' ||
      claims.mustChangePassword === true || claims.firebase?.sign_in_provider !== 'password' ||
      typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) refuse('teacher-auth-required');
  const { examId, exam, key } = prepareExamSubmission(data, { uid, classes: claims.classes, now });
  const examRef = db.doc(`exams/${examId}`), keyRef = db.doc(`exams/${examId}/private/key`);
  const profileRef = db.doc(`users/${uid}`);
  return db.runTransaction(async tx => {
    // Firestore transactions require ALL reads before any writes.
    const [profile, existing, existingKey] = await Promise.all([
      tx.get(profileRef), tx.get(examRef), tx.get(keyRef)
    ]);
    const user = profile.exists ? profile.data() : null;
    if (user?.uid !== uid || user.role !== 'teacher' || user.status !== 'active' ||
        user.mustChangePassword === true || user.email?.toLowerCase() !== claims.email.toLowerCase()) refuse('profile-mismatch');
    if (existing.exists || existingKey.exists) {
      if (existing.exists && existingKey.exists && existing.data().teacherUid === uid &&
          existing.data().id === examId && existingKey.data().requestHash === key.requestHash &&
          safeForManagerReview(existing.data(), existingKey.data(), now)) {
        return { ok: true, examId, alreadyExists: true };
      }
      refuse('exam-id-reserved');
    }
    const createdAt = serverTimestamp();
    tx.create(examRef, { ...exam, createdAt });
    tx.create(keyRef, { ...key, createdAt });
    return { ok: true, examId, alreadyExists: false };
  });
}

module.exports = { ExamSubmissionError, safeId, prepareExamSubmission, safeForManagerReview, safeForStagedRelease, submitStagedExam };
