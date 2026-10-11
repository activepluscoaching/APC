/* A registration made on a student's phone reaches the Admin's phone as a
   "new registration" notification, and the Admin's decision travels back —
   two isolated jsdom phones, real app modules, the mock cloud enforcing the
   deployed database.rules.json. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockCloud, Device } from './two-device-harness.mjs';
import { KEYS } from '../js/database.js';

let cloud;
let studentPhone;
let adminPhone;
let studentId;

before(async () => {
  cloud = await startMockCloud();
  const harness = await import('./two-device-harness.mjs');
  harness.buildDevices().buildAppCopy(cloud.url);
  adminPhone = new Device('admin-phone', cloud.url);
  studentPhone = new Device('student-phone', cloud.url);
  adminPhone.start();
  studentPhone.start();
});

after(async () => {
  await Promise.allSettled([adminPhone?.stop(), studentPhone?.stop()]);
  await new Promise(resolve => cloud?.server?.close(resolve));
});

test('the Admin phone is set up and syncing', async () => {
  const created = await adminPhone.run('create-first-admin', { fullName: 'Office Admin', password: 'Admin-2026' });
  assert.ok(created.account?.username, created.formError || created.message);
  const login = await adminPhone.run('form-login', { username: created.account.username, pin: 'Admin-2026' });
  assert.equal(login.adminSession, true, login.message);
  await adminPhone.run('boot');
});

test('a student registers on their own phone', async () => {
  await studentPhone.run('boot');
  const result = await studentPhone.run('register-student', { username: 'rahim.student', pin: '4827' });
  assert.equal(result.registered, true, result.message);
  studentId = result.account?.student?.id || result.account?.studentId;
  assert.match(String(studentId), /^s\d{9}-/, 'collision-free Student ID');
});

test('the Admin phone lists it as a new registration', async () => {
  await adminPhone.run('wait-content', { key: KEYS.students, id: studentId });
  const feed = await adminPhone.run('registration-feed', { role: 'admin' });
  assert.deepEqual(feed.keys, [`registration:${studentId}`]);
  const manager = await adminPhone.run('registration-feed', { role: 'manager' });
  assert.deepEqual(manager.keys, [`registration:${studentId}`], 'a Manager device would list it too');
  const teacher = await adminPhone.run('registration-feed', { role: 'teacher' });
  assert.deepEqual(teacher.keys, [], 'a Teacher is not told');
});

test('the Admin approves and the student phone receives the decision', async () => {
  const decided = await adminPhone.run('decide-registration', { studentId, decision: 'approved', role: 'admin' });
  assert.equal(decided.ok, true, decided.reason);
  await studentPhone.run('wait-roster-status', { studentId, status: 'approved' });
  const feed = await adminPhone.run('registration-feed', { role: 'admin' });
  assert.deepEqual(feed.keys, [], 'the notification is gone once decided');
});

test('every read and write was allowed by the deployed database.rules.json', () => {
  assert.deepEqual(cloud.ruleViolations, []);
});
