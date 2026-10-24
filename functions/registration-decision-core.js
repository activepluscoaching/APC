/* Pure server-side role & payload validator for `decideStudentRegistration` Cloud Function. */

function validateRegistrationDecisionRequest(auth, data = {}) {
  if (!auth?.uid) {
    return { ok: false, code: 'unauthenticated', message: 'অনুমোদনের জন্য লগইন প্রয়োজন।' };
  }
  const token = auth.token || {};
  const role = typeof token.role === 'string' ? token.role : '';
  const status = typeof token.status === 'string' ? token.status : 'active';
  const activeOk = token.active === undefined ? status === 'active' : token.active === true && status === 'active';
  if ((role !== 'admin' && role !== 'manager') || !activeOk || token.mustChangePassword === true) {
    return { ok: false, code: 'permission-denied', message: 'শুধুমাত্র সক্রিয় এডমিন ও ম্যানেজার রেজিস্ট্রেশন অনুমোদন বা বাতিল করতে পারবেন।' };
  }
  const studentId = String(data?.studentId || '').trim();
  if (!studentId || /[.#$/[\]]/.test(studentId)) {
    return { ok: false, code: 'invalid-argument', message: 'বৈধ শিক্ষার্থী আইডি দিন।' };
  }
  const rawDecision = String(data?.decision || '').trim();
  const decision = rawDecision === 'active' || rawDecision === 'approved'
    ? 'approved'
    : rawDecision === 'rejected'
      ? 'rejected'
      : '';
  if (!decision) {
    return { ok: false, code: 'invalid-argument', message: 'অনুমোদন অথবা বাতিল সিদ্ধান্ত নির্বাচন করুন।' };
  }
  const note = String(data?.note || data?.reason || '').trim().slice(0, 500);
  if (decision === 'rejected' && !note) {
    return { ok: false, code: 'invalid-argument', message: 'বাতিল করার কারণ লিখুন।' };
  }
  return { ok: true, role, reviewer: String(token.username || auth.uid), studentId, decision, note };
}

module.exports = { validateRegistrationDecisionRequest };
