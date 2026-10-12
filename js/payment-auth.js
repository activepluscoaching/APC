/* Payment-desk credentials. The only login is payment.html — the student
   login page does not accept these credentials. All password handling is
   delegated to staff-auth.js: PBKDF2 hashes, device-bound session tokens, and
   a mandatory password change after first-use setup or migration. */

import {
  STAFF_ACCOUNTS,
  authenticateStaff,
  loadStaffAccount,
  provisionStaffAccount,
  verifyStaffCredentials,
  saveStaffSession,
  hasStaffSession,
  clearStaffSession,
  changeStaffPassword,
  normalizeStaffUsername,
  STAFF_SESSION_RULES
} from './staff-auth.js';

export const PAYMENT_USER_ID = STAFF_ACCOUNTS.payment.username;
export const PAYMENT_ACCOUNT_KEY = STAFF_ACCOUNTS.payment.accountKey;
export const PAYMENT_SESSION_KEY = STAFF_ACCOUNTS.payment.sessionKey;
export const PAYMENT_PORTAL_PATH = 'payment.html';
export const PAYMENT_REMEMBER_DAYS = STAFF_SESSION_RULES.rememberDays;

/** { ok, needsSetup?, needsPasswordChange?, error? } for the desk login form. */
export async function authenticatePayment(userId, password) {
  return authenticateStaff('payment', userId, password);
}

export async function loadPaymentAccount() {
  const account = await loadStaffAccount('payment');
  return { userId: account.username, username: account.username, hasPassword: account.hasPassword, mustChangePassword: account.mustChangePassword };
}

export function isPaymentUserId(value) {
  return normalizeStaffUsername(value) === PAYMENT_USER_ID;
}

export async function verifyPaymentCredentials(userId, password) {
  return verifyStaffCredentials('payment', userId, password);
}

export async function savePaymentSession(remember = true) {
  return saveStaffSession('payment', remember);
}

export async function hasPaymentSession() {
  return hasStaffSession('payment');
}

export function clearPaymentSession() {
  clearStaffSession('payment');
}

export async function changePaymentPin(currentPassword, nextPassword, confirmPassword) {
  const result = await changeStaffPassword('payment', currentPassword, nextPassword, confirmPassword);
  if (!result.ok) return result;
  return { ok: true, pin: result.password, password: result.password };
}

/** First-use setup for the desk: sets the password when none exists yet. */
export async function provisionPaymentPassword(nextPassword, confirmPassword) {
  return provisionStaffAccount('payment', nextPassword, confirmPassword);
}
