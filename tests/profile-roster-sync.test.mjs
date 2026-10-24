/* A student edits their own profile: the change must reach the shared roster,
   because that is what the Admin, Manager and Cash Counter panels read — and
   the roster is what the online bridge uploads to the other devices. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { loadPage } from './jsdom-harness.mjs';
import { STORAGE_KEYS } from '../js/config.js';
import { KEYS } from '../js/database.js';

let ctx;
let state;

before(async () => {
  ctx = await loadPage('index.html', { seed: { 'activePlus.demo.autofill.v1': 'off' } });
  const { initRegister } = await import('../js/register.js');
  const { initLogin } = await import('../js/login.js');
  const { initProfile } = await import('../js/profile.js');
  state = { student: {}, account: null };
  initRegister({ state, onRegistered: () => {} });
  initLogin({ state, onAuthenticated: () => {} });
  initProfile({ state, onStudentChange: student => { state.student = student; } });
});

function fillRegistration() {
  const values = {
    regMobile: '01711223344', regUsername: 'raisa.islam', regPin: '123123', regPinConfirm: '123123',
    nameBn: 'রাইসা ইসলাম', nameEn: 'Raisa Islam', fatherName: 'আব্দুল করিম', motherName: 'সালমা বেগম',
    birthDate: '2010-03-15', gender: 'নারী', guardianMobile: '01811223344', address: 'দিনাজপুর সদর',
    regClass: 'দশম শ্রেণি', regGroup: 'বিজ্ঞান', securityAnswer: 'রাইসা'
  };
  for (const [id, value] of Object.entries(values)) ctx.$(`#${id}`).value = value;
  // The security question is a list of prepared questions: take a real option.
  const question = ctx.$('#securityQuestion');
  question.value = [...question.options].map(option => option.value).find(value => value);
  ctx.$('#studentMobile').value = values.regMobile;
  ctx.$('#terms').checked = true;
  ctx.$('#guardianConsent').checked = true;
}


/* Whole-device storage copy: the profile editor lives on student.html now,
   so its test drives that page with everything registration just wrote. */
const dumpStorage = w => {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const key = w.localStorage.key(i);
    out[key] = w.localStorage.getItem(key);
  }
  return out;
};

const roster = () => JSON.parse(ctx.window.localStorage.getItem(KEYS.students) || '[]');
const account = () => JSON.parse(ctx.window.localStorage.getItem(STORAGE_KEYS.account));
const profile = () => JSON.parse(ctx.window.localStorage.getItem(STORAGE_KEYS.student) || '{}');

test('registration writes the student into the shared roster', async () => {
  fillRegistration();
  ctx.submit(ctx.$('#registrationForm'));
  await ctx.waitFor(() => Boolean(account()));
  state.account = account();
  state.student = profile();
  const row = roster().find(student => student.id === account().student.id);
  assert.ok(row, 'the roster row exists — this is what the cloud syncs');
  assert.equal(row.name, 'রাইসা ইসলাম');
  assert.equal(row.birthDate, '2010-03-15', 'staff devices read birthdays from the roster');
  assert.equal(row.status, 'pending');
});

test('a profile edit updates the roster too, so other devices see the new details', async () => {
  // The editor is part of the student panel (student.html since 2026-10-14);
  // open that page with the storage the registration just produced.
  const appCtx = await loadPage('student.html', { seed: dumpStorage(ctx.window) });
  const read = (key, fallback) => JSON.parse(appCtx.window.localStorage.getItem(key) || fallback);
  const appRoster = () => read(KEYS.students, '[]');
  const appAccount = () => read(STORAGE_KEYS.account, 'null');
  const appProfile = () => read(STORAGE_KEYS.student, '{}');
  const { initProfile, openProfileEditor } = await import('../js/profile.js');
  initProfile({ state, onStudentChange: student => { state.student = student; } });
  openProfileEditor(state.student);
  appCtx.$('#editNameBn').value = 'রাইসা ইসলাম সুমি';
  appCtx.$('#editNameEn').value = 'Raisa Islam Sumi';
  appCtx.$('#editGuardianMobile').value = '01911223344';
  appCtx.$('#editAddress').value = 'রংপুর সদর';
  appCtx.submit(appCtx.$('#profileForm'));
  await appCtx.waitFor(() => appRoster().some(student => student.name === 'রাইসা ইসলাম সুমি'));

  const id = appAccount().student.id;
  const row = appRoster().find(student => student.id === id);
  assert.equal(row.nameEn, 'Raisa Islam Sumi', 'roster row carries the English name');
  assert.equal(row.guardianMobile, '01911223344', 'and the new guardian number');
  assert.equal(appAccount().student.name, 'রাইসা ইসলাম সুমি', 'the login record changed as well');
  assert.equal(appProfile().name, 'রাইসা ইসলাম সুমি', 'and the device profile');
  assert.equal(appRoster().filter(student => student.id === id).length, 1, 'the row is updated, never duplicated');
});
