/* The path the office runs every day: a student registers, the office approves
   the registration, and the student's phone must unlock and stay unlocked.

   Reported defect (2026-09-30): "এডমিন অনুমোদন দেওয়ার পর ও শিক্ষার্থী লগইন
   করতে পারতাসে না" — after the approval the student still could not use the
   app. Two failures combined to cause it:
     • the phone kept a stale "pending" roster row and pushed it back over the
       approval (a record-level last-write-wins clobber);
     • having adopted the reverted row, nothing flipped the phone's own account
       from 'pending' to 'active', so the pending lock stayed on.

   The student phone below runs the REAL app entry (js/main.js), so the pending
   lock, the storage bridge and the account status all behave like on a phone. */

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockCloud, Device } from './two-device-harness.mjs';
import { KEYS } from '../js/database.js';

const USERNAME = 'rahim.approval';
const PIN = '4827';

let cloud, studentPhone, adminPhone, studentId;

before(async () => {
  cloud = await startMockCloud();
  const harness = await import('./two-device-harness.mjs');
  harness.buildDevices().buildAppCopy(cloud.url);
  adminPhone = new Device('approval-admin', cloud.url);
  studentPhone = new Device('approval-student', cloud.url);
  adminPhone.start();
  studentPhone.start();
});

after(async () => {
  await Promise.allSettled([adminPhone?.stop(), studentPhone?.stop()]);
  await new Promise(resolve => cloud?.server?.close(resolve));
});

const cloudRoot = () => cloud.state.activePlusSync?.v1 || {};
const cloudRosterRow = () => Object.values(cloudRoot().students || {}).find(row => row?.id === studentId);
async function waitForCloud(predicate, what, timeout = 20000) {
  const started = Date.now();
  for (;;) {
    if (predicate(cloudRoot())) return;
    if (Date.now() - started > timeout) throw new Error(`cloud wait timed out: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

test('the office admin is signed in and can approve registrations', async () => {
  const created = await adminPhone.run('create-first-admin', { fullName: 'Office Admin', password: 'Admin-2026' });
  assert.ok(created.account?.username, created.formError || created.message);
  const login = await adminPhone.run('form-login', { username: created.account.username, pin: 'Admin-2026' });
  assert.equal(login.adminSession, true, login.message);
  await adminPhone.run('boot');
});

test('a new student registers on their own phone and enters the pending app', async () => {
  await studentPhone.run('start-app');
  const result = await studentPhone.run('register-student', { username: USERNAME, pin: PIN });
  assert.equal(result.registered, true, result.message);
  studentId = result.account?.student?.id || result.account?.studentId;
  assert.ok(studentId, 'the registration returned a permanent Student ID');
  assert.equal(result.account?.status, 'pending', 'a fresh registration starts pending');

  // The student may sign in while pending — the account is not blocked, its
  // student features are (README: pending accounts can log in, cannot study).
  const login = await studentPhone.run('submit-login', { username: USERNAME, pin: PIN });
  assert.equal(login.studentSession, true, login.message);
  const open = await studentPhone.run('wait-app-open');
  assert.equal(open.pending, true, 'the pending screen is shown until the office decides');
  assert.equal(open.accountStatus, 'pending');
  await waitForCloud(state => Object.values(state.students || {}).some(row => row?.id === studentId), 'roster row uploaded');
});

test('the approval unlocks the phone that was already signed in', async () => {
  await adminPhone.run('wait-content', { key: KEYS.students, id: studentId });
  const decided = await adminPhone.run('decide-registration', { studentId, decision: 'approved', role: 'admin' });
  assert.equal(decided.ok, true, decided.reason);

  const status = await studentPhone.run('wait-account-status', { status: 'active' });
  assert.equal(status.accountStatus, 'active', 'the student account is no longer pending');
  const state = await studentPhone.run('app-state');
  assert.equal(state.pending, false, 'the pending lock is gone');
  await waitForCloud(state => state.students?.[studentId]?.status === 'approved', 'the approval is still on the cloud');
});

test('the student can sign in again after the approval', async () => {
  const login = await studentPhone.run('submit-login', { username: USERNAME, pin: PIN });
  assert.equal(login.studentSession, true, login.message);
  const state = await studentPhone.run('app-state');
  assert.equal(state.accountStatus, 'active');
  assert.equal(state.pending, false, 'a second sign-in stays unlocked');
  assert.deepEqual(cloud.ruleViolations, [], 'the shipped client and database.rules.json agree');
});
