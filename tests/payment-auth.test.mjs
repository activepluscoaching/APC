/* Shared counter credentials: the payment desk and the student login page both
   rely on this module, so the rules live in one place and are tested here.
   Phase 1: there is no built-in default password — the first sign-in on a
   device sets one, passwords are PBKDF2 hashes, and sessions are device-bound
   tokens with an expiry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAYMENT_USER_ID,
  PAYMENT_ACCOUNT_KEY,
  PAYMENT_SESSION_KEY,
  PAYMENT_PORTAL_PATH,
  PAYMENT_REMEMBER_DAYS,
  authenticatePayment,
  loadPaymentAccount,
  isPaymentUserId,
  verifyPaymentCredentials,
  savePaymentSession,
  hasPaymentSession,
  clearPaymentSession,
  changePaymentPin,
  provisionPaymentPassword
} from '../js/payment-auth.js';
import { decryptValue } from '../js/secure-store.js';

const PASSWORD = 'Counter-2026';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map
  };
}

function freshBrowser() {
  globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage() };
  return window;
}

test('no default password exists anywhere in the shipped code', () => {
  for (const file of ['js/staff-auth.js', 'js/payment-auth.js', 'js/login.js', 'js/teacher.js', 'js/admin.js', 'js/payment.js', 'js/register.js', 'js/recovery.js']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/Apc@2026/.test(source), false, `${file} still mentions the retired default password`);
    assert.equal(/password\s*[:=]\s*['"][^'"]{4,}['"]/.test(source.replace(/error\s*[:=]/g, '')), false, `${file} still hardcodes a password`);
  }
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.equal(/Apc@2026/.test(readme), false, 'README still documents the retired default password');
});

test('a fresh device asks the counter to set its own password first', async () => {
  const browser = freshBrowser();
  assert.equal(PAYMENT_USER_ID, 'payment.apc');
  assert.equal(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY), null);

  const first = await authenticatePayment('payment.apc', 'anything');
  assert.equal(first.ok, false, 'a reserved ID without a password cannot authenticate');
  assert.equal(first.needsSetup, true);
  // No session is written before a password exists.
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);
  assert.equal(await hasPaymentSession(), false);

  // A wrong username never reaches the setup path.
  const wrongUser = await authenticatePayment('admin.apc', 'anything');
  assert.equal(wrongUser.ok, false);
  assert.equal(wrongUser.needsSetup, undefined);
});

test('the password the counter sets is stored as a hash and then works', async () => {
  const browser = freshBrowser();
  const setup = await provisionPaymentPassword(PASSWORD, PASSWORD);
  assert.equal(setup.ok, true);
  const raw = browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY);
  assert.equal(/"password"/.test(raw), false, 'the stored record must not contain password text');
  assert.equal(JSON.parse(raw).username, undefined, 'the envelope hides the username too');

  const account = await loadPaymentAccount();
  assert.deepEqual(account, { userId: 'payment.apc', username: 'payment.apc', hasPassword: true, mustChangePassword: false });

  assert.equal(await verifyPaymentCredentials('payment.apc', PASSWORD), true);
  assert.equal(await verifyPaymentCredentials('  Payment.APC ', PASSWORD), true);
  assert.equal(await verifyPaymentCredentials('payment.apc', 'wrong'), false);
  assert.equal(await verifyPaymentCredentials('admin.apc', PASSWORD), false);
  assert.equal(await verifyPaymentCredentials('payment.apc', ''), false);
  assert.equal(await verifyPaymentCredentials('01700000000', PASSWORD), false);

  const signIn = await authenticatePayment('payment.apc', PASSWORD);
  assert.deepEqual(signIn, { ok: true, needsPasswordChange: false });
});

test('provisioning twice is refused, so a set password cannot be overwritten blindly', async () => {
  freshBrowser();
  assert.equal((await provisionPaymentPassword(PASSWORD, PASSWORD)).ok, true);
  const second = await provisionPaymentPassword('Another-2026', 'Another-2026');
  assert.equal(second.ok, false);
  assert.equal(await verifyPaymentCredentials('payment.apc', PASSWORD), true);
});

test('the payment username is recognised without creating the account; other names are not', () => {
  const browser = freshBrowser();
  assert.equal(isPaymentUserId('payment.apc'), true);
  assert.equal(isPaymentUserId('Payment.APC'), true);
  assert.equal(isPaymentUserId('payment apc'), false);
  assert.equal(isPaymentUserId('APC-PAY-001'), false);
  assert.equal(isPaymentUserId('01700000000'), false);
  assert.equal(isPaymentUserId('রাইসা'), false);
  assert.equal(isPaymentUserId(''), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY), null);
});

test('remembered sessions last 90 days in localStorage; tab sessions do not survive a closed tab', async () => {
  const browser = freshBrowser();
  assert.equal(await hasPaymentSession(), false);

  assert.equal(await savePaymentSession(true), true);
  assert.equal(await hasPaymentSession(), true);
  const raw = browser.localStorage.getItem(PAYMENT_SESSION_KEY);
  assert.equal(raw !== null, true);
  // The record is encrypted when the platform allows; decrypt to inspect it.
  const envelope = JSON.parse(raw);
  const plaintext = envelope && envelope.iv ? await decryptValue(envelope) : raw;
  const stored = JSON.parse(plaintext);
  assert.equal(typeof stored.token, 'string');
  assert.equal(stored.owner, 'payment.apc');
  const days = (stored.expiry - Date.now()) / 86400000;
  assert.ok(days > PAYMENT_REMEMBER_DAYS - 1 && days <= PAYMENT_REMEMBER_DAYS);
  assert.equal(browser.sessionStorage.getItem(PAYMENT_SESSION_KEY), null);

  clearPaymentSession();
  assert.equal(await hasPaymentSession(), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);

  // Not remembered: the marker lives only in sessionStorage.
  await savePaymentSession(false);
  assert.equal(await hasPaymentSession(), true);
  assert.equal(browser.sessionStorage.getItem(PAYMENT_SESSION_KEY), '1');
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);
  browser.sessionStorage._map.clear(); // simulate closing the tab
  assert.equal(await hasPaymentSession(), false);
});

test('a session copied to another device does not validate', async () => {
  const browser = freshBrowser();
  browser.localStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify({
    token: 'stolen-token', deviceId: 'another-device', owner: 'payment.apc',
    issuedAt: Date.now(), expiry: Date.now() + 60000
  }));
  assert.equal(await hasPaymentSession(), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null, 'the foreign record is dropped');
});

test('expired sessions are dropped, and unreadable storage counts as signed out', async () => {
  const browser = freshBrowser();
  const { buildSessionRecord } = await import('../js/session.js');
  const expired = buildSessionRecord({ owner: 'payment.apc', ttlDays: -1 });
  browser.localStorage.setItem(PAYMENT_SESSION_KEY, JSON.stringify(expired));
  assert.equal(await hasPaymentSession(), false);
  assert.equal(browser.localStorage.getItem(PAYMENT_SESSION_KEY), null);

  browser.localStorage.setItem(PAYMENT_SESSION_KEY, '{not json');
  assert.equal(await hasPaymentSession(), false);

  globalThis.window = {
    get localStorage() { throw new Error('blocked'); },
    get sessionStorage() { throw new Error('blocked'); }
  };
  assert.equal(await hasPaymentSession(), false);
  assert.equal(await savePaymentSession(true), false);
  clearPaymentSession(); // must not throw
});

test('password change keeps the username and rejects a short or mismatched password', async () => {
  const browser = freshBrowser();
  await provisionPaymentPassword(PASSWORD, PASSWORD);
  assert.deepEqual(await changePaymentPin('wrong', '456789', '456789'), { ok: false, error: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' });
  assert.deepEqual(await changePaymentPin(PASSWORD, '123', '123'), { ok: false, error: 'নতুন পাসওয়ার্ড ৬–৩২ অক্ষরের হতে হবে।' });
  assert.deepEqual(await changePaymentPin(PASSWORD, '456789', '456780'), { ok: false, error: 'দুইবার লেখা নতুন পাসওয়ার্ড মিলছে না।' });

  assert.deepEqual(await changePaymentPin(PASSWORD, '456789', '456789'), { ok: true, pin: '456789', password: '456789' });
  const raw = browser.localStorage.getItem(PAYMENT_ACCOUNT_KEY);
  assert.equal(/"password"/.test(raw), false);
  assert.equal(await verifyPaymentCredentials('payment.apc', PASSWORD), false);
  assert.equal(await verifyPaymentCredentials('payment.apc', '456789'), true);
});

test('password change reports a storage failure instead of pretending to save', async () => {
  freshBrowser();
  await provisionPaymentPassword(PASSWORD, PASSWORD);
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.deepEqual(
    await changePaymentPin(PASSWORD, '456789', '456789'),
    { ok: false, error: 'পাসওয়ার্ড সংরক্ষণ করা যায়নি — ব্রাউজারের স্টোরেজ পরীক্ষা করুন।' }
  );
});

test('the handoff target is the counter page that actually ships', () => {
  assert.equal(PAYMENT_PORTAL_PATH, 'payment.html');
  const html = readFileSync(new URL('../payment.html', import.meta.url), 'utf8');
  assert.match(html, /id="payShell"/);
});
