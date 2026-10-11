/* End-to-end (jsdom) check of the username feature on the real index.html:
   a student picks a username while registering, it is claimed on the device,
   login then works with that username (or the mobile number), and the name can
   never be changed afterwards. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';

const DEMO_OFF = { 'activePlus.demo.autofill.v1': 'off' };
let ctx;
let registered = 0;
let loggedIn = 0;
let state;

before(async () => {
  ctx = await loadPage('index.html', { seed: DEMO_OFF });
  const { initLogin } = await import('../js/login.js');
  const { initRegister } = await import('../js/register.js');
  state = { student: {}, account: null };
  initRegister({ state, onRegistered: () => { registered += 1; } });
  initLogin({ state, onAuthenticated: () => { loggedIn += 1; }, onDemo: () => { loggedIn += 1; } });
});

const account = () => JSON.parse(ctx.window.localStorage.getItem(STORAGE_KEYS.account));
const usernameIndex = () => JSON.parse(ctx.window.localStorage.getItem(STORAGE_KEYS.usernames) || '{}');

function fillRegistration(overrides = {}) {
  const values = {
    regMobile: '01711223344',
    regUsername: 'raisa.islam',
    regPin: '123123',
    regPinConfirm: '123123',
    nameBn: 'রাইসা ইসলাম',
    nameEn: 'Raisa Islam',
    fatherName: 'আব্দুল করিম',
    motherName: 'সালমা বেগম',
    birthDate: '2010-03-15',
    gender: 'নারী',
    guardianMobile: '01811223344',
    address: 'দিনাজপুর সদর',
    regClass: 'দশম শ্রেণি',
    regGroup: 'বিজ্ঞান',
    securityQuestion: 'তোমার শৈশবের ডাকনাম কী?',
    securityAnswer: 'রাইসা',
    ...overrides
  };
  for (const [id, value] of Object.entries(values)) ctx.$(`#${id}`).value = value;
  ctx.$('#studentMobile').value = values.regMobile;
  ctx.$('#terms').checked = true;
}

test('the registration form asks for a permanent username and validates it live', () => {
  const { $, type } = ctx;
  assert.equal($('#regUsername').required, true);
  assert.match($('#regUsernameHint').textContent, /৪–২০ অক্ষর/);

  type($('#regUsername'), 'abc');
  assert.match($('#regUsernameStatus').textContent, /৪–২০ অক্ষরের/);
  type($('#regUsername'), '7raisa');
  assert.match($('#regUsernameStatus').textContent, /ইংরেজি অক্ষর দিয়ে শুরু/);
  type($('#regUsername'), 'admin');
  assert.match($('#regUsernameStatus').textContent, /সংরক্ষিত/);
  type($('#regUsername'), 'raisa.islam');
  assert.match($('#regUsernameStatus').textContent, /নেওয়া যাবে/);

  // The suggestion button builds a usable name from the English name.
  type($('#nameEn'), 'Raisa Islam');
  ctx.click($('#regUsernameSuggest'));
  assert.equal($('#regUsername').value, 'raisa.islam');
  assert.match($('#regUsernameStatus').textContent, /নেওয়া যাবে/);
});

test('registration stores the username and claims it on this device', async () => {
  const { $, submit, waitFor } = ctx;
  fillRegistration();
  submit($('#registrationForm'));
  await waitFor(() => registered === 1);

  assert.equal(registered, 1);
  const saved = account();
  assert.equal(saved.username, 'raisa.islam');
  assert.equal(saved.student.username, 'raisa.islam');
  assert.equal(saved.registrationMobile, '01711223344');
  assert.equal(usernameIndex()['raisa.islam'], saved.studentId);
  // Registration reports the permanent username back to the student.
  assert.match(ctx.$('.feedback-toast').textContent, /raisa\.islam/);
});

test('the same username cannot be taken twice', async () => {
  const { $, submit, waitFor } = ctx;
  fillRegistration({ regMobile: '01799887766' }); // 'raisa.islam' again
  submit($('#registrationForm'));
  await waitFor(() => /আগেই নেওয়া হয়েছে/.test($('#authMessage').textContent));
  assert.match($('#authMessage').textContent, /আগেই নেওয়া হয়েছে/);
  assert.equal(registered, 1, 'a duplicate username must not create a second account');
  // Another name is still free for the next student.
  const { usernameTaken } = await import('../js/storage.js');
  assert.equal(usernameTaken('raisa.islam'), true);
  assert.equal(usernameTaken('tahmid.hasan'), false);
});

test('login accepts the username, in any case, and still accepts the mobile number', async () => {
  const { $, type, submit, waitFor } = ctx;
  const saved = account();
  assert.equal(saved.username, 'raisa.islam');
  // The stored account holds a PBKDF2 hash, never the plaintext password.
  assert.equal(saved.pin, undefined);
  assert.equal(typeof saved.pinHash, 'object');

  state.account = null;
  type($('#loginMobile'), '  RAISA.ISLAM ');
  type($('#loginPin'), '123123');
  submit($('#loginForm'));
  await waitFor(() => loggedIn === 1);
  assert.equal(loggedIn, 1, 'username login must succeed');

  state.account = null;
  type($('#loginMobile'), '01711223344');
  type($('#loginPin'), '123123');
  submit($('#loginForm'));
  await waitFor(() => loggedIn === 2);
  assert.equal(loggedIn, 2, 'the registration mobile must still work');

  state.account = null;
  type($('#loginMobile'), 'raisa.islam');
  type($('#loginPin'), '999999');
  submit($('#loginForm'));
  await waitFor(() => /সঠিক নয়/.test($('#authMessage').textContent));
  assert.equal(loggedIn, 2, 'a wrong password must be rejected');
  assert.match($('#authMessage').textContent, /সঠিক নয়/);

  state.account = null;
  type($('#loginMobile'), 'someone.else');
  type($('#loginPin'), '123123');
  submit($('#loginForm'));
  await waitFor(() => /সঠিক নয়/.test($('#authMessage').textContent));
  assert.equal(loggedIn, 2, 'an unknown username must be rejected');
  assert.match($('#authMessage').textContent, /সঠিক নয়/);
});

test('the profile shows the username locked and it survives an edit', async () => {
  const { $, window } = ctx;
  const { openProfileEditor } = await import('../js/profile.js');
  openProfileEditor(account().student);
  assert.equal($('#editUsername').value, 'raisa.islam');
  assert.equal($('#editUsername').readOnly, true);

  // Saving the profile with a tampered username field changes nothing.
  const { saveAccount, loadAccount } = await import('../js/storage.js');
  saveAccount({ ...loadAccount(), username: 'hacker.name' });
  assert.equal(loadAccount().username, 'raisa.islam');
  assert.equal(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.account)).username, 'raisa.islam');
});
