/* Shared student/teacher account policy; enforce the same rules on the future server.
   Extra contacts are append-only and are not alternate login IDs.
   A username is a second login ID the student picks once; like the registration
   mobile and Student ID it is immutable, so it can be used safely instead of the phone number.
   Passwords and recovery answers are carried as PBKDF2 hash records
   (pinHash / securityAnswerHash); plaintext never reaches storage. */

import { STAFF_USERNAMES } from './staff-auth.js';

export const BD_MOBILE_PATTERN = /^01[3-9]\d{8}$/;
export const EMAIL_MAX = 254;
export const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function contactNumber(value) {
  let number = String(value ?? '')
    .trim()
    .replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/[\s()+-]/g, '');
  if (number.startsWith('88001') && number.length === 14) number = number.slice(3);
  else if (number.startsWith('880') && number.length === 13) number = number.slice(2);
  return number;
}
export const isContactNumber = value => BD_MOBILE_PATTERN.test(contactNumber(value));

export function mobileError(value) {
  const normalized = contactNumber(value);
  if (!normalized) return 'মোবাইল নম্বর দিন।';
  if (!BD_MOBILE_PATTERN.test(normalized)) {
    return 'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: ০১৭XXXXXXXX)।';
  }
  return '';
}

/* ---------- Email: optional, normalized & unique if provided ---------- */

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function emailError(value) {
  const email = normalizeEmail(value);
  if (!email) return '';
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    return 'সঠিক ইমেইল ঠিকানা দিন অথবা ঘরটি ফাঁকা রাখুন।';
  }
  return '';
}

export const isValidEmail = value => emailError(value) === '';

/* ---------- Username: student-chosen, permanent login ID ---------- */

export const USERNAME_MIN = 4;
export const USERNAME_MAX = 20;
const bnDigits = value => String(value).replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[digit]);
export const USERNAME_REGEX = /^[a-z][a-z0-9._]{3,19}$/;
// Reserved so a username can never impersonate a role or the payment counter ID.
export const RESERVED_USERNAMES = Object.freeze([
  'admin', 'administrator', 'manager', 'teacher', 'office', 'support', 'help', 'root',
  'payment', 'counter', 'apcpay', 'activeplus', 'null', 'undefined',
  ...STAFF_USERNAMES
]);

/** Lowercase and space-free: the only stored form of a username. */
export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Bengali explanation of the rule that failed, or '' when the name is usable. */
export function usernameError(value) {
  const name = normalizeUsername(value);
  if (!name) return 'ইউজারনেম দিন — লগইনে মোবাইল নম্বরের বদলে এটি ব্যবহার করা যাবে।';
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) {
    return `ইউজারনেম ${bnDigits(USERNAME_MIN)}–${bnDigits(USERNAME_MAX)} অক্ষরের হতে হবে।`;
  }
  if (!USERNAME_REGEX.test(name)) {
    return 'ইংরেজি অক্ষর দিয়ে শুরু করুন; তারপর ছোট হাতের অক্ষর, সংখ্যা, ডট (.) বা আন্ডারস্কোর (_) দিন। স্পেস বা অন্য চিহ্ন চলবে না।';
  }
  if (RESERVED_USERNAMES.includes(name)) return 'এই ইউজারনেমটি সংরক্ষিত — অন্য একটি বেছে নিন।';
  return '';
}

export const isValidUsername = value => usernameError(value) === '';

/** "Raisa Islam" → raisa.islam: a starting suggestion the student can edit. */
export function suggestUsername(...sources) {
  const base = sources
    .flatMap(source => String(source ?? '').toLowerCase().split(/[^a-z0-9]+/))
    .filter(Boolean)
    .join('.');
  const candidate = /^[a-z]/.test(base) ? base : base ? `apc.${base}` : 'apc.student';
  return candidate.slice(0, USERNAME_MAX).replace(/\.+$/g, '');
}

export function protectAccountIdentity(candidate, previous = null) {
  const registrationMobile = contactNumber(previous?.registrationMobile || previous?.mobile || candidate.registrationMobile || candidate.mobile);
  if (!isContactNumber(registrationMobile)) throw new Error('সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।');
  const additionalMobiles = [...new Set([
    ...(previous?.additionalMobiles || []), ...(candidate.additionalMobiles || []),
    // Preserve an existing legacy profile contact instead of silently losing it.
    previous?.student?.studentMobile
  ].filter(Boolean).map(contactNumber))].filter(n => n !== registrationMobile);
  if (additionalMobiles.some(n => !isContactNumber(n))) throw new Error('অতিরিক্ত মোবাইল নম্বর সঠিক নয়।');
  // A username set once is permanent: later writes cannot rename or drop it.
  const lockedUsername = normalizeUsername(previous?.username || previous?.student?.username || '');
  const requested = normalizeUsername(candidate.username);
  const username = lockedUsername || (isValidUsername(requested) ? requested : '');
  // A Student ID set once is permanent: later writes cannot replace or blank it.
  const lockedStudentId = String(previous?.student?.id || previous?.studentId || '').trim();
  const candidateStudentId = String(candidate.student?.id || candidate.studentId || '').trim();
  const resolvedStudentId = lockedStudentId || candidateStudentId;
  // Optional email: normalized when valid; once set, locked against mutation.
  const lockedEmail = normalizeEmail(previous?.email || previous?.student?.email || '');
  const rawEmail = candidate.email !== undefined
    ? candidate.email
    : (candidate.student?.email !== undefined ? candidate.student.email : '');
  const requestedEmail = normalizeEmail(rawEmail);
  if (!lockedEmail && requestedEmail && !isValidEmail(requestedEmail)) throw new Error(emailError(requestedEmail));
  const email = lockedEmail || requestedEmail;

  const account = { ...candidate, registrationMobile, mobile: registrationMobile, additionalMobiles, username };
  if (resolvedStudentId && (previous?.studentId !== undefined || candidate.studentId !== undefined)) {
    account.studentId = resolvedStudentId;
  }
  if (email) account.email = email;
  else if (account.email !== undefined) account.email = '';

  // Secrets travel as hash records only; a new plaintext secret is hashed by
  // storage.js before it is written. A legacy plaintext value survives here
  // only so it can be verified once and upgraded — it is dropped as soon as a
  // hash record exists.
  const pinHash = candidate.pinHash || previous?.pinHash || null;
  const securityAnswerHash = candidate.securityAnswerHash || previous?.securityAnswerHash || null;
  if (pinHash) { account.pinHash = pinHash; delete account.pin; }
  if (securityAnswerHash) { account.securityAnswerHash = securityAnswerHash; delete account.securityAnswer; }
  if (candidate.student || previous?.student) {
    account.student = {
      ...(previous?.student || {}),
      ...(candidate.student || {}),
      studentMobile: registrationMobile
    };
    if (resolvedStudentId) account.student.id = resolvedStudentId;
    if (username) account.student.username = username;
    if (email) account.student.email = email;
    else if (account.student.email !== undefined) account.student.email = '';
  }
  return account;
}

export function appendAccountMobile(account, value) {
  const current = protectAccountIdentity(account, account);
  const number = contactNumber(value);
  if (!isContactNumber(number)) throw new Error('সঠিক ১১ সংখ্যার নতুন মোবাইল নম্বর দিন।');
  if ([current.registrationMobile, ...current.additionalMobiles].includes(number)) throw new Error('এই নম্বরটি আগেই যুক্ত আছে।');
  return { ...current, additionalMobiles: [...current.additionalMobiles, number] };
}
