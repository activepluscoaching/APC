/* Read-only staging gateway. Firestore rules are the actual authorization
 * boundary; this client check only prevents accidental cross-role UI reads.
 * Do not connect this to the legacy localStorage adapter or mirror its data. */
import { checkCloudIdentity } from './cloud-identity-policy.js';

const SUMMARY_FIELDS = Object.freeze([
  'studentId', 'name', 'className', 'group', 'mobile', 'monthlyFee', 'status'
]);
const OWN_FIELDS = Object.freeze(['uid', 'email', 'username', 'fullName', 'role', 'status']);
const STUDENT_FIELDS = Object.freeze(['uid', 'studentId', 'name', 'fullName', 'className', 'group', 'status']);
const STAFF_SUMMARY_ROLES = Object.freeze(['admin', 'manager', 'teacher', 'payment']);
const safeId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const pick = (data, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
const reject = reason => ({ ok: false, reason });

/** Inject the transport to test the policy without a live Firebase project.
 * `readDocument` must use Firestore's authenticated client SDK, never Admin SDK. */
export function createCloudReadGateway({ getCurrentUser, readDocument, mode, legacyEnabled, emulatorOnly } = {}) {
  if (typeof getCurrentUser !== 'function' || typeof readDocument !== 'function' || typeof mode !== 'function') {
    throw new TypeError('Authenticated read transport required');
  }

  async function identity() {
    if (mode() !== 'firebase') return reject('local-backend');
    if (legacyEnabled) return reject('reload-required');
    if (!emulatorOnly) return reject('dev-emulator-required');
    try {
      const user = await getCurrentUser();
      if (!user?.uid || !safeId(user.uid) || user.isAnonymous) return reject('email-auth-required');
      const token = await user.getIdTokenResult(true);
      // Reject invalid claims before even reading a profile.
      const preliminary = checkCloudIdentity({ user, token });
      if (!preliminary.ok && !['profile-mismatch', 'student-profile-mismatch'].includes(preliminary.reason)) return preliminary;
      const profile = await readDocument('users', user.uid);
      const studentProfile = token.claims?.role === 'student'
        ? await readDocument('students', user.uid) : null;
      const decision = checkCloudIdentity({ user, token, profile, studentProfile });
      if (!decision.ok) return decision;
      return { ...decision, user, token, profile, studentProfile };
    } catch { return reject('read-failed'); }
  }

  async function stillCurrent(uid) {
    try {
      return mode() === 'firebase' && !legacyEnabled && emulatorOnly &&
        (await getCurrentUser())?.uid === uid;
    } catch { return false; }
  }

  async function ownProfile() {
    const verified = await identity();
    if (!verified.ok) return verified;
    if (!await stillCurrent(verified.uid)) return reject('session-changed');
    return { ok: true, profile: pick(verified.profile, OWN_FIELDS),
      ...(verified.role === 'student' ? { student: pick(verified.studentProfile, STUDENT_FIELDS) } : {}) };
  }

  async function studentSummary(studentId) {
    if (!safeId(studentId)) return reject('invalid-student-id');
    const verified = await identity();
    if (!verified.ok) return verified;
    if (!STAFF_SUMMARY_ROLES.includes(verified.role)) return reject('role-denied');
    try {
      const row = await readDocument('studentSummaries', studentId);
      if (!row || row.studentId !== studentId) return reject('summary-mismatch');
      if (!['pending', 'approved'].includes(row.status) ||
          (verified.role !== 'manager' && row.status !== 'approved')) return reject('status-denied');
      if (verified.role === 'teacher' &&
          (!Array.isArray(verified.token.claims.classes) ||
           !verified.token.claims.classes.includes(row.className))) return reject('class-denied');
      if (!await stillCurrent(verified.uid)) return reject('session-changed');
      return { ok: true, summary: pick(row, SUMMARY_FIELDS) };
    } catch { return reject('read-failed'); }
  }

  return Object.freeze({ ownProfile, studentSummary });
}
