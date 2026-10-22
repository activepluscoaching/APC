/* Client-side selector for the Notices v2 paths (docs/RTDB-PER-USER-RULES-PLAN.md §5).
 * Defense in depth only: database.rules.v2.draft.json remains the server authorization boundary. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const safeId = value => typeof value === 'string' && SAFE_ID.test(value);

export function noticeSyncPlan(claims = {}, signInProvider = '', uid = '') {
  if (!claims || typeof claims !== 'object' || !claims.role || signInProvider === 'anonymous' || claims.mustChangePassword === true) {
    return { ok: false, reason: 'authenticated-claims-required' };
  }
  if (['admin', 'manager'].includes(claims.role) && claims.status === 'active') {
    return {
      ok: true,
      role: claims.role,
      mode: 'canonical',
      canWrite: true,
      readPath: 'activePlusV2/notices',
      writePath: 'activePlusV2/notices'
    };
  }
  if (claims.role === 'teacher' && claims.status === 'active' && safeId(claims.teacherId) && safeId(uid)) {
    return {
      ok: true,
      role: 'teacher',
      mode: 'teacher',
      canWrite: true,
      teacherId: claims.teacherId,
      authorUid: uid,
      readPaths: [
        'activePlusV2/notices',
        `activePlusV2/noticeDraftsByAuthor/${uid}`,
        'activePlusV2/teacherAssignments'
      ],
      draftPath: `activePlusV2/noticeDraftsByAuthor/${uid}`
    };
  }
  if (claims.role === 'payment' && claims.status === 'active') {
    return {
      ok: true,
      role: 'payment',
      mode: 'staff-readonly',
      canWrite: false,
      readPath: 'activePlusV2/notices'
    };
  }
  if (claims.role === 'student' && claims.status === 'approved' && safeId(claims.studentId)) {
    return {
      ok: true,
      role: 'student',
      mode: 'student',
      canWrite: false,
      studentId: claims.studentId,
      readPath: `activePlusV2/studentNotices/${claims.studentId}`
    };
  }
  return { ok: false, reason: 'role-not-authorized' };
}

/* Signed-out, anonymous, claimless, or unauthorized roles are persistent no-work
 * states — session events restart the controller when Auth state changes. */
const NO_RETRY_REASONS = new Set([
  'authentication-required',
  'authenticated-claims-required',
  'role-not-authorized'
]);

export function noticesV2RetryDecision(result) {
  if (result?.ok) return { retry: false, started: true, reason: '' };
  const reason = String(result?.reason || 'unknown');
  if (NO_RETRY_REASONS.has(reason)) return { retry: false, started: false, reason };
  return { retry: true, started: false, reason };
}
