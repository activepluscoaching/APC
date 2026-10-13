'use strict';

/* Staged Firestore MCQ attempts. Admin SDK only; no browser may write attempts.
 * The exam read is inside the transaction so an exam's release lock forces
 * concurrent submissions to retry against the closed state. */
const crypto = require('node:crypto');
const { safeId } = require('./staged-exam-core.cjs');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const CHOICES = ['A', 'B', 'C', 'D', ''];

class AttemptError extends Error {
  constructor(code) { super(code); this.name = 'AttemptError'; this.code = code; }
}
const refuse = code => { throw new AttemptError(code); };
const pairDigest = (examId, uid) => {
  if (!safeId(examId) || !safeId(uid)) refuse('invalid-id');
  // Length-independent separator and different prefixes for the two ledgers.
  return crypto.createHash('sha256').update(`${examId}\0${uid}`).digest('hex');
};
const attemptId = (examId, uid) => `att_${pairDigest(examId, uid)}`;
const resultId = (examId, uid) => `res_${pairDigest(examId, uid)}`;

function validatedAnswers(input, questions) {
  if (!exactKeys(input, ['examId', 'answers']) || !object(input.answers) ||
      !Array.isArray(questions) || !questions.length || questions.length > 50) refuse('invalid-answers');
  const keys = questions.map(q => q?.uid);
  if (keys.some(key => !safeId(key)) || new Set(keys).size !== keys.length ||
      Object.keys(input.answers).length !== keys.length) refuse('invalid-answers');
  const answers = Object.create(null);
  for (const key of keys) {
    if (!Object.hasOwn(input.answers, key) || !CHOICES.includes(input.answers[key])) refuse('invalid-answers');
    answers[key] = input.answers[key];
  }
  return answers;
}

function validStagedAttempt(row, exam, docId) {
  if (!exactKeys(row, ['id', 'examId', 'studentId', 'className', 'group', 'status',
      'answers', 'submittedAt', 'createdAt']) || !object(exam) ||
      !safeId(row.examId) || !safeId(row.studentId) ||
      row.examId !== exam.id || row.id !== docId || attemptId(row.examId, row.studentId) !== docId ||
      row.status !== 'submitted' || row.className !== exam.className ||
      (exam.group && row.group !== exam.group) ||
      !Number.isSafeInteger(row.submittedAt) || row.submittedAt < exam.startAt || row.submittedAt >= exam.endAt) return false;
  try {
    const normalized = validatedAnswers({ examId: row.examId, answers: row.answers }, exam.questions);
    return Object.keys(normalized).every(key => row.answers[key] === normalized[key]);
  } catch { return false; }
}

async function submitStagedAttempt({ db, serverTimestamp, caller, data, clock = Date.now } = {}) {
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function' ||
      typeof serverTimestamp !== 'function' || typeof clock !== 'function') refuse('trusted-admin-required');
  const uid = caller?.uid, claims = caller?.token || {};
  if (!safeId(uid) || claims.role !== 'student' || claims.status !== 'approved' ||
      claims.studentId !== uid || claims.mustChangePassword === true ||
      claims.firebase?.sign_in_provider !== 'password' ||
      typeof claims.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) refuse('student-auth-required');
  const examId = data?.examId;
  if (!safeId(examId)) refuse('invalid-id');
  const id = attemptId(examId, uid);
  const examRef = db.doc(`exams/${examId}`), attemptRef = db.doc(`attempts/${id}`);
  const userRef = db.doc(`users/${uid}`), studentRef = db.doc(`students/${uid}`);
  return db.runTransaction(async tx => {
    const [userSnap, studentSnap, examSnap, attemptSnap] = await Promise.all([
      tx.get(userRef), tx.get(studentRef), tx.get(examRef), tx.get(attemptRef)
    ]);
    const user = userSnap.exists ? userSnap.data() : null;
    const student = studentSnap.exists ? studentSnap.data() : null;
    const exam = examSnap.exists ? examSnap.data() : null;
    if (user?.uid !== uid || user.role !== 'student' || user.status !== 'approved' ||
        user.mustChangePassword === true || typeof user.email !== 'string' ||
        user.email.toLowerCase() !== claims.email.toLowerCase() ||
        student?.uid !== uid || student.status !== 'approved') refuse('profile-mismatch');
    if (!exam || exam.status !== 'published' || exam.schemaVersion !== 1 || exam.type !== 'mcq' ||
        exam.id !== examId || exam.className !== student.className ||
        (exam.group && exam.group !== student.group)) refuse('exam-denied');
    const answers = validatedAnswers(data, exam.questions);
    if (attemptSnap.exists) {
      const prior = attemptSnap.data();
      if (validStagedAttempt(prior, exam, id) && prior.studentId === uid &&
          Object.keys(answers).every(key => prior.answers[key] === answers[key])) {
        return { ok: true, attemptId: id, alreadySubmitted: true };
      }
      refuse('attempt-exists');
    }
    const now = clock();
    if (!Number.isSafeInteger(now) || exam.resultsReleaseState === 'closing' || exam.resultsReleased === true ||
        now < exam.startAt || now >= exam.endAt) refuse('window-closed');
    tx.create(attemptRef, {
      id, examId, studentId: uid, className: student.className,
      group: student.group || '', status: 'submitted', answers,
      submittedAt: now, createdAt: serverTimestamp()
    });
    return { ok: true, attemptId: id, alreadySubmitted: false };
  });
}

module.exports = { AttemptError, attemptId, resultId, validatedAnswers, validStagedAttempt, submitStagedAttempt };
