export const EDIT_WINDOW_MS = 7 * 86400000;
export function gradeEditPolicy({ actor, previous, reason, now = Date.now() }) {
  if (!['teacher', 'manager', 'admin'].includes(actor?.role)) throw new Error('সম্পাদনার অনুমতি নেই।');
  if (actor.role === 'teacher' && previous && now - Number(previous.at || 0) > EDIT_WINDOW_MS) throw new Error('৭ দিন পেরিয়েছে; শুধু ম্যানেজার/অ্যাডমিন কারণ লিখে বদলাতে পারবেন।');
  if (previous && now - Number(previous.at || 0) > EDIT_WINDOW_MS && !String(reason || '').trim()) throw new Error('সম্পাদনার কারণ লিখুন।');
  return String(reason || '').trim().slice(0, 500);
}
export function appendGradeAudit(db, { examId, studentId, actor, before, after, reason = '', at = Date.now() }) {
  const row = { examId, studentId, who: String(actor.id || actor.role), role: actor.role, at, before, after, reason };
  db.auditLog = [...(db.auditLog || []), row];
  return row;
}
