'use strict';

/* The release lock is committed BEFORE querying attempts. Attempt transactions
 * read this same exam document, so a concurrent close forces a retry which
 * sees the lock and refuses to create a late row. A failed release remains
 * 'closing' and can safely resume without admitting new submissions. */
const { safeId, safeForStagedRelease } = require('./staged-exam-core.cjs');

class ReleaseError extends Error {
  constructor(code) { super(code); this.name = 'ReleaseError'; this.code = code; }
}
const refuse = code => { throw new ReleaseError(code); };

async function closeStagedExamForRelease({ db, serverTimestamp, caller, examId, clock = Date.now } = {}) {
  if (!db || typeof db.doc !== 'function' || typeof db.runTransaction !== 'function' ||
      typeof serverTimestamp !== 'function' || typeof clock !== 'function') refuse('trusted-admin-required');
  if (!safeId(examId)) refuse('invalid-id');
  const claims = caller?.token || {};
  if (!safeId(caller?.uid) || claims.status !== 'active' || claims.mustChangePassword === true ||
      claims.firebase?.sign_in_provider !== 'password' ||
      !['admin', 'manager', 'teacher'].includes(claims.role)) refuse('role-denied');
  const ref = db.doc(`exams/${examId}`), keyRef = db.doc(`exams/${examId}/private/key`);
  return db.runTransaction(async tx => {
    const [snap, keySnap] = await Promise.all([tx.get(ref), tx.get(keyRef)]);
    const exam = snap.exists ? snap.data() : null;
    const key = keySnap.exists ? keySnap.data() : null;
    if (!exam || (claims.role === 'teacher' && exam.teacherUid !== caller.uid)) refuse('role-denied');
    if (!key || !safeForStagedRelease(exam, key, clock())) refuse('unverified-or-running');
    if (exam.resultsReleased === true) return { alreadyReleased: true, exam, key };
    if (exam.resultsReleaseState !== 'closing') {
      tx.update(ref, { resultsReleaseState: 'closing', releaseStartedAt: serverTimestamp() });
    }
    return { alreadyReleased: false, exam, key };
  });
}

module.exports = { ReleaseError, closeStagedExamForRelease };
