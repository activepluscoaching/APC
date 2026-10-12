/* Shared decision helpers for cross-device identity merges. Kept separate from
   the Firebase module so the rules themselves can be unit-tested without a
   project or a browser. */
import { isPasswordRecord } from './password-hash.js';
import { normalizeUsername, contactNumber } from './account-policy.js';

/** Wall-clock of the newest change; 0 for records written by older versions
    (they carry no timestamp, so they must never outrank a stamped copy). */
export const recordTime = record => Date.parse(record?.updatedAt || '') || 0;

/**
 * True when the local copy should be kept (and uploaded) instead of the remote
 * one. `sameRecord` guards against adopting a record that belongs to another
 * login ID; `localWinsTie` decides records whose timestamps are equal or absent.
 */
export function preferLocalCopy(local, remote, { sameRecord = () => true, localWinsTie = true } = {}) {
  if (!remote) return true;
  if (!local) return false;
  if (!sameRecord(remote)) return false;
  const localTime = recordTime(local);
  const remoteTime = recordTime(remote);
  return localTime === remoteTime ? localWinsTie : localTime > remoteTime;
}

const staffRecordValid = value =>
  Boolean(value) && typeof value === 'object' &&
  typeof value.username === 'string' && isPasswordRecord(value.password);

/**
 * Which copy of a staff role account wins: 'local', 'remote' or 'conflict'.
 *
 *  • the cloud copy is the one every other device knows, so it is the default;
 *  • a newer local change (a password changed while offline) is uploaded;
 *  • a local account that was never personalised (a fresh default from a
 *    re-installed or reset device) never overrides a real cloud account;
 *  • two different Admin usernames mean two different owners: the real Admin
 *    must not be replaced by a system created on an unsynced device.
 */
export function chooseStaffCopy(local, remote, { role = '' } = {}) {
  if (!staffRecordValid(remote)) return 'local';
  if (!staffRecordValid(local)) return 'remote';
  if (role === 'admin' && local.username !== remote.username) return 'conflict';
  const personalised = !local.mustChangePassword;
  // If both copies are from an older schema without `updatedAt`, preserve the
  // already-personalised local credential. A stale cloud copy must never make
  // an existing password stop working during background sync. Any deliberate
  // password/profile change writes `updatedAt`, so a newer remote copy still
  // wins normally on a real update.
  return personalised && preferLocalCopy(local, remote, { localWinsTie: true }) ? 'local' : 'remote';
}

/** Two login records describe the same student only when the person matches. */
export function sameStudentRecord(first, second) {
  if (!first || !second) return false;
  const idOf = value => value.student?.id || value.studentId || '';
  const firstId = idOf(first), secondId = idOf(second);
  if (firstId && secondId) return firstId === secondId;
  const phoneOf = value => contactNumber(value.registrationMobile || value.mobile || '');
  const firstPhone = phoneOf(first), secondPhone = phoneOf(second);
  return Boolean(firstPhone) && firstPhone === secondPhone;
}

export const loginIdOf = record =>
  normalizeUsername(record?.username || record?.student?.username || '');

/** The permanent Student ID shown on the profile ("s260929001-…"). */
export const studentIdOf = record =>
  normalizeUsername(record?.student?.id || record?.studentId || '');

/**
 * Does what the student typed (and remembers) belong to this account?
 * Accepted: the login User ID, the mobile number used at registration, or the
 * permanent Student ID. The Student ID may be typed in the short form
 * ("s260929001") — see findLoginMatches for that.
 */
export function matchesLoginIdentifier(account, identifier) {
  if (!account || !identifier) return false;
  const typed = normalizeUsername(identifier);
  const phone = contactNumber(identifier);
  if (typed && (typed === loginIdOf(account) || typed === studentIdOf(account))) return true;
  const registered = contactNumber(account.registrationMobile || account.mobile || '');
  return Boolean(phone) && Boolean(registered) && phone === registered;
}

const STUDENT_ID_PREFIX = /^s\d{6}/;

/** Login IDs that look like what was typed (a typo is far more likely than a
    missing account). Safe: only IDs sharing the first three characters. */
export function suggestIdentifiers(accounts, identifier, limit = 2) {
  const typed = normalizeUsername(identifier);
  if (!typed || typed.length < 3) return [];
  const prefix = typed.slice(0, 3);
  return (Array.isArray(accounts) ? accounts : [])
    .map(loginIdOf)
    .filter(id => id && id !== typed && (id.startsWith(prefix) || typed.startsWith(id.slice(0, 3))))
    .slice(0, limit);
}

/**
 * Every account a typed identifier could mean, most exact first: the direct
 * match, then Student IDs that start with the typed digits (the random suffix
 * of a new ID is hard to read out, so the short form is accepted when only one
 * student matches). An empty list means "no such login here".
 */
export function findLoginMatches(accounts, identifier) {
  const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
  const exact = list.filter(account => matchesLoginIdentifier(account, identifier));
  if (exact.length) return exact;
  const typed = normalizeUsername(identifier);
  if (!STUDENT_ID_PREFIX.test(typed)) return [];
  return list.filter(account => studentIdOf(account).startsWith(typed));
}

/**
 * Which copy of a student login wins: 'local', 'remote' or 'conflict'. The
 * record is keyed by the login ID, so a *different* student under the same key
 * can only mean a duplicate registration on a device that had not synced yet —
 * that must never overwrite the account other devices already use.
 */
export function chooseStudentCopy(local, remote) {
  if (!local) return 'remote';
  if (!remote || !isPasswordRecord(remote.pinHash)) return 'local';
  if (!sameStudentRecord(local, remote)) return 'conflict';
  return preferLocalCopy(local, remote) ? 'local' : 'remote';
}
