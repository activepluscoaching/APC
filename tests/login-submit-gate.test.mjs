import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STAFF_ACCOUNTS } from '../js/staff-auth.js';
import { STORAGE_KEYS } from '../js/config.js';

// Exercise the real login form, hashing and storage without importing Firebase.
test('a saved account and legacy skip flag cannot create a login session; a wrong ID or PIN cannot enter', async () => {
  const ctx = await loadPage('index.html', { seed: {
    [STAFF_ACCOUNTS.admin.accountKey]: '{}',
    'active-plus-skip-security-v1': '1',
    'activePlus.demo.autofill.v1': 'off'
  } });
  Object.defineProperty(ctx.window.navigator, 'onLine', { configurable: true, value: false });
  const storage = await import('../js/storage.js');
  const { initLogin } = await import('../js/login.js');
  const { initRegister } = await import('../js/register.js');
  const account = await storage.persistAccount({
    username: 'login.student', mobile: '01712345678', pin: '123456', status: 'active',
    student: { id: 'STU-GATE', name: 'শিক্ষার্থী' }
  });
  assert.equal(await storage.hasSession(), false, 'a stored account and old skip preference are not authentication');
  const { initProfile } = await import('../js/profile.js');
  initProfile({ state: { account, student: account.student } });
  const trusted = ctx.$('#trustedDeviceToggle');
  trusted.checked = true;
  trusted.dispatchEvent(new ctx.window.Event('change'));
  await ctx.waitFor(() => trusted.checked === false);
  assert.equal(await storage.hasSession(), false, 'a profile preference cannot manufacture a session');
  let admitted = 0;
  initLogin({ state: { account, student: account.student }, onAuthenticated: () => { admitted++; } });
  const submit = async (identifier, password) => {
    ctx.type(ctx.$('#loginMobile'), identifier);
    ctx.type(ctx.$('#loginPin'), password);
    ctx.submit(ctx.$('#loginForm'));
    await ctx.waitFor(() => ctx.$('#loginForm').getAttribute('aria-busy') !== 'true');
  };
  await submit('login.student', '999999');
  assert.equal(admitted, 0);
  assert.equal(await storage.hasSession(), false);
  await submit('not.this.student', '123456');
  assert.equal(admitted, 0);
  assert.equal(await storage.hasSession(), false);
  await submit('login.student', '123456');
  assert.equal(admitted, 1);
  assert.equal(await storage.hasSession(), true);
  storage.clearSession();
  assert.equal(await storage.hasSession(), false);

  // A brand-new reserved staff ID is not a panel entry point on its own.
  await submit('manager.apc', 'whatever-password');
  assert.match(ctx.$('#authMessage').textContent, /অ্যাকাউন্ট সংরক্ষিত নেই/);
  assert.equal(await storage.hasSession(), false);

  // Registration saves an account but deliberately returns to the login page;
  // the just-created credentials still have to be submitted.
  ctx.window.localStorage.removeItem(STORAGE_KEYS.account);
  const registrationState = { account: null, student: {} };
  let registered = 0;
  initRegister({ state: registrationState, onRegistered: () => { registered++; } });
  const values = {
    regMobile: '01711223344', regUsername: 'gate.student', regPin: '246810', regPinConfirm: '246810',
    nameBn: 'গেট শিক্ষার্থী', nameEn: 'Gate Student', fatherName: 'পিতা', motherName: 'মাতা',
    birthDate: '2010-01-01', gender: 'নারী', guardianMobile: '01811223344', address: 'ঠিকানা',
    regClass: 'দশম শ্রেণি', regGroup: 'বিজ্ঞান', securityAnswer: 'উত্তর'
  };
  for (const [id, value] of Object.entries(values)) ctx.$('#' + id).value = value;
  const question = ctx.$('#securityQuestion');
  question.value = [...question.options].map(option => option.value).find(Boolean);
  ctx.$('#studentMobile').value = values.regMobile;
  ctx.$('#terms').checked = true;
  ctx.submit(ctx.$('#registrationForm'));
  await ctx.flush();
  await ctx.waitFor(() => registered === 1, 5000);
  assert.equal(registered, 1, ctx.$('#authMessage').textContent);
  assert.equal(ctx.$('#authScreen').hidden, false, 'registration must not enter the app');
  assert.equal(ctx.$('#loginMobile').value, 'gate.student');
  assert.equal(ctx.$('#loginPin').value, '');
  assert.equal(await storage.hasSession(), false);
  await submit('gate.student', '246810');
  assert.equal(admitted, 2);
  assert.equal(await storage.hasSession(), true);
  ctx.window.close();
});
