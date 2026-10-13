// Pure authorization checks: Auth UID and server-issued claims are authoritative.
// Browser localStorage, typed role and a profile's role field never grant access.
export const FIREBASE_ROLES = Object.freeze(['admin', 'manager', 'teacher', 'payment', 'student']);

export function normalizeAuthEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith('@accounts.activeplus.app') ? email : '';
}

export function checkCloudIdentity({ user, token, profile, studentProfile = null, expectedRole = '' } = {}) {
  if (!user?.uid || user.isAnonymous || !normalizeAuthEmail(user.email)) return { ok: false, reason: 'email-auth-required' };
  const claims = token?.claims || {};
  const provider = token?.signInProvider || claims.firebase?.sign_in_provider;
  if (provider !== 'password') return { ok: false, reason: 'email-auth-required' };
  if (!FIREBASE_ROLES.includes(claims.role) || (expectedRole && claims.role !== expectedRole)) {
    return { ok: false, reason: 'role-denied' };
  }
  if (!['active', 'approved'].includes(claims.status)) return { ok: false, reason: 'account-inactive' };
  if (claims.mustChangePassword === true) return { ok: false, reason: 'must-change-password' };
  if (!profile || profile.uid !== user.uid || profile.role !== claims.role ||
      profile.status !== claims.status || normalizeAuthEmail(profile.email) !== normalizeAuthEmail(user.email)) {
    return { ok: false, reason: 'profile-mismatch' };
  }
  if (claims.role === 'student' && (!studentProfile || studentProfile.uid !== user.uid ||
      studentProfile.status !== claims.status)) return { ok: false, reason: 'student-profile-mismatch' };
  return { ok: true, role: claims.role, uid: user.uid };
}
