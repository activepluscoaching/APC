/* "পাসওয়ার্ড রিসেট করুন" is two steps: the student is verified first (username or
   mobile + security question + answer), the short account summary appears, and
   only then does the new password (typed twice) replace the old one.
   One jsdom page per test file: the app modules read the page's window globals. */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { persistAccount, loadAccount } from '../js/storage.js';
import { verifyPassword } from '../js/password-hash.js';
import { initRecovery } from '../js/recovery.js';

const USERNAME = 'recovery.student';
const QUESTION = 'তোমার শৈশবের ডাকনাম কী?';
const ANSWER = 'রাইসা';

let ctx;
const state = { account: null };

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  state.account = await persistAccount({
    username: USERNAME,
    mobile: '01712345678',
    registrationMobile: '01712345678',
    pin: '123456',
    securityQuestion: QUESTION,
    securityAnswer: ANSWER,
    status: 'active',
    studentId: 'QA-RECOVERY-1',
    student: { id: 'QA-RECOVERY-1', name: 'রাইসা আক্তার', nameBn: 'রাইসা আক্তার', className: 'দশম শ্রেণি', group: 'বিজ্ঞান' }
  });
  initRecovery({ state });
  ctx.click(ctx.$('#forgotPinButton'));   // the way a student opens the reset
});
after(() => ctx?.window.close());

test('the reset always opens on step 1 and prefills no password', () => {
  const { $ } = ctx;
  assert.equal($('#recoveryModal').hidden, false, 'the reset dialog is open');
  assert.equal($('#recoveryPasswordStep').hidden, true, 'step 2 starts hidden');
  assert.equal($('#recoveryVerifyStep').hidden, false);
  assert.equal($('#recoveryPin').value, '', 'no default password is pre-filled');
  assert.equal($('#recoveryPinConfirm').value, '');
});

test('a wrong answer keeps step 2 closed and changes nothing', async () => {
  const { $, type, submit } = ctx;
  type($('#recoveryMobile'), USERNAME);
  $('#recoveryQuestion').value = QUESTION;
  type($('#recoveryAnswer'), 'ভুল উত্তর');
  submit($('#recoveryForm'));

  await ctx.waitFor(() => !$('#recoveryVerifyError').hidden);
  assert.match($('#recoveryVerifyError').textContent, /সঠিক নয়/);
  assert.equal($('#recoveryPasswordStep').hidden, true, 'step 2 stays closed');
  assert.equal(await verifyPassword('123456', loadAccount().pinHash), true, 'the old password still works');
});

test('matching information shows the student summary and opens the password step', async () => {
  const { $, type, submit } = ctx;
  type($('#recoveryAnswer'), ANSWER);
  submit($('#recoveryForm'));

  await ctx.waitFor(() => $('#recoveryPasswordStep').hidden === false);
  assert.equal($('#recoveryVerifyStep').hidden, true, 'step 1 gives way');
  const summary = $('#recoveryStudentSummary').textContent;
  assert.ok(summary.includes('রাইসা আক্তার'), 'the name is shown');
  assert.ok(summary.includes('QA-RECOVERY-1'), 'the Student ID is shown');
  assert.ok(summary.includes('দশম শ্রেণি'), 'the class is shown');
  assert.ok(summary.includes(USERNAME), 'the login ID is shown');
  assert.ok(!summary.includes('01712345678'), 'the mobile number is masked, not printed');
});

test('the two new passwords must match before anything is saved', async () => {
  const { $, type, submit } = ctx;
  type($('#recoveryPin'), '654321');
  type($('#recoveryPinConfirm'), '654322');
  submit($('#recoveryPasswordForm'));

  await ctx.waitFor(() => !$('#recoveryPasswordError').hidden);
  assert.match($('#recoveryPasswordError').textContent, /এক নয়/);
  assert.equal(await verifyPassword('123456', loadAccount().pinHash), true, 'the old password is untouched');
});

test('a matching pair changes the password and returns to login', async () => {
  const { $, type, submit } = ctx;
  type($('#recoveryPin'), '654321');
  type($('#recoveryPinConfirm'), '654321');
  submit($('#recoveryPasswordForm'));

  await ctx.waitFor(() => /নতুন পাসওয়ার্ড সংরক্ষণ/.test($('#authMessage').textContent));
  assert.equal($('#recoveryModal').hidden, true, 'the dialog closes only after the change');
  const stored = loadAccount();
  assert.equal(await verifyPassword('654321', stored.pinHash), true, 'the new password is stored as a hash');
  assert.equal(await verifyPassword('123456', stored.pinHash), false, 'the old password no longer works');
  assert.ok(!('pin' in stored) && !('securityAnswer' in stored), 'nothing plaintext is written');
  assert.equal($('#loginMobile').value, USERNAME, 'the login form is filled in');
  assert.match($('#authMessage').textContent, /নতুন পাসওয়ার্ড সংরক্ষণ/);
  assert.equal($('#recoveryPasswordStep').hidden, true, 'the modal is back on step 1 for next time');
  assert.equal($('#recoveryMobile').value, '', 'step 1 is cleared');
  assert.equal($('#recoveryStudentSummary').textContent, '', 'the summary is not left behind');
});
