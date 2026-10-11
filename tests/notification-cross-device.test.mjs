/* Role notifications across real phones: the counter's fee entry reaches the
   Manager's phone as "waiting for approval"; the Manager's decision reaches the
   student ("fee confirmed") or the counter ("rejected" with the reason); a
   paper the Manager returns reaches the teacher. Isolated jsdom phones, real
   app modules and sync bridge, mock cloud enforcing database.rules.json. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockCloud, Device } from './two-device-harness.mjs';
import { KEYS } from '../js/database.js';

let cloud;
let managerPhone;
let counterPhone;
let studentPhone;
let studentId;

before(async () => {
  cloud = await startMockCloud();
  const harness = await import('./two-device-harness.mjs');
  harness.buildDevices().buildAppCopy(cloud.url);
  managerPhone = new Device('manager-phone', cloud.url);
  counterPhone = new Device('counter-phone', cloud.url);
  studentPhone = new Device('student-phone', cloud.url);
  for (const phone of [managerPhone, counterPhone, studentPhone]) phone.start();
});

after(async () => {
  await Promise.allSettled([managerPhone?.stop(), counterPhone?.stop(), studentPhone?.stop()]);
  await new Promise(resolve => cloud?.server?.close(resolve));
});

const kinds = feed => feed.items.map(item => item.kind).sort();
const entry = extra => ({
  id: 'TX-100', receiptNo: 'R-100', studentId, studentName: 'রহিম', className: 'দশম', feeType: 'মাসিক বেতন',
  month: 'অক্টোবর ২০২৬', amount: 1500, method: 'Cash', status: 'pending', reviewHistory: [], recordedAt: Date.now(), ...extra
});

test('the office and a student phone are set up and syncing', async () => {
  const created = await managerPhone.run('create-first-admin', { fullName: 'Office Admin', password: 'Admin-2026' });
  const login = await managerPhone.run('form-login', { username: created.account.username, pin: 'Admin-2026' });
  assert.equal(login.adminSession, true, login.message);
  await managerPhone.run('boot');
  await counterPhone.run('boot');
  await studentPhone.run('boot');
  const result = await studentPhone.run('register-student', { username: 'rahim.fee', pin: '4827' });
  assert.equal(result.registered, true, result.message);
  studentId = result.account?.student?.id || result.account?.studentId;
});

test('a fee entry typed at the counter rings on the Manager phone, not the student', async () => {
  await counterPhone.run('wait-content', { key: KEYS.students, id: studentId });
  await counterPhone.run('write-records', { key: KEYS.transactions, value: [entry()] });
  await managerPhone.run('wait-content', { key: KEYS.transactions, id: 'TX-100' });
  const manager = await managerPhone.run('notification-feed', { role: 'manager' });
  assert.ok(manager.items.some(item => item.key === 'payment-review:TX-100' && /রহিম/.test(item.body)));
  await studentPhone.run('wait-content', { key: KEYS.transactions, id: 'TX-100' });
  const student = await studentPhone.run('notification-feed', { studentId });
  assert.ok(!kinds(student).includes('payment'), 'not confirmed yet');
});

test('the Manager approves: the student phone announces "fee confirmed"', async () => {
  await managerPhone.run('write-records', { key: KEYS.transactions, value: [entry({ status: 'approved', reviewedAt: new Date().toISOString(), reviewedBy: 'manager.apc' })] });
  await studentPhone.run('wait-record-status', { key: KEYS.transactions, id: 'TX-100', status: 'approved' });
  const student = await studentPhone.run('notification-feed', { studentId });
  const fee = student.items.find(item => item.kind === 'payment');
  assert.ok(fee, JSON.stringify(student.items));
  assert.match(fee.body, /৳1500/);
  const manager = await managerPhone.run('notification-feed', { role: 'manager' });
  assert.ok(!kinds(manager).includes('payment-review'), 'the task left the Manager list');
});

test('a rejected entry reaches the counter with the reason', async () => {
  await counterPhone.run('write-records', { key: KEYS.transactions, value: [
    entry({ status: 'approved', reviewedAt: new Date().toISOString() }), entry({ id: 'TX-101', receiptNo: 'R-101' })
  ] });
  await managerPhone.run('wait-content', { key: KEYS.transactions, id: 'TX-101' });
  const list = [entry({ status: 'approved', reviewedAt: new Date().toISOString() }),
    entry({ id: 'TX-101', receiptNo: 'R-101', status: 'rejected', reviewedAt: new Date().toISOString(), reviewNote: 'মাস ভুল' })];
  await managerPhone.run('write-records', { key: KEYS.transactions, value: list });
  await counterPhone.run('wait-record-status', { key: KEYS.transactions, id: 'TX-101', status: 'rejected' });
  const counter = await counterPhone.run('notification-feed', { role: 'payment' });
  assert.deepEqual(kinds(counter), ['payment-rejected']);
  assert.match(counter.items[0].body, /মাস ভুল/);
});

const paper = extra => ({
  id: 'EX-7', title: 'রসায়ন সাপ্তাহিক', subject: 'রসায়ন', type: 'mcq', className: 'দশম', teacherId: 'teacher-1', teacherName: 'করিম',
  status: 'pending', reviewNote: '', createdAt: 1, updatedAt: 1, submittedAt: Date.now(), startAt: Date.now() + 5 * 60000,
  endAt: Date.now() + 35 * 60000, participants: [], questions: [], ...extra
});

test('a paper sent by the teacher rings on the Manager phone', async () => {
  // The counter phone doubles as the teacher's phone here.
  await counterPhone.run('seed-exam-db', { exams: [paper()] });
  await managerPhone.run('wait-exam-status', { examId: 'EX-7', status: 'pending' });
  const manager = await managerPhone.run('notification-feed', { role: 'manager' });
  assert.ok(manager.items.some(item => item.kind === 'exam-review'), JSON.stringify(manager.items));
});

test('returned with a reason: the teacher phone is told', async () => {
  await managerPhone.run('seed-exam-db', { exams: [paper({ status: 'rejected', reviewNote: 'প্রশ্ন ২ অস্পষ্ট', reviewedAt: Date.now() })] });
  await counterPhone.run('wait-exam-status', { examId: 'EX-7', status: 'rejected' });
  const teacher = await counterPhone.run('notification-feed', { role: 'teacher' });
  assert.deepEqual(kinds(teacher), ['exam-returned']);
  assert.match(teacher.items[0].body, /প্রশ্ন ২ অস্পষ্ট/);
});

test('published with the student as participant: reminder and start reach the student phone', async () => {
  const published = paper({ status: 'published', publishedAt: Date.now(), reviewNote: '', participants: [{ id: studentId, name: 'রহিম', className: 'দশম', group: '' }] });
  await managerPhone.run('seed-exam-db', { exams: [published] });
  await studentPhone.run('wait-exam-status', { examId: 'EX-7', status: 'published' });
  const soon = await studentPhone.run('notification-feed', { studentId });
  assert.ok(kinds(soon).includes('exam-soon'), JSON.stringify(soon.items));
  const live = await studentPhone.run('notification-feed', { studentId, now: published.startAt + 60000 });
  assert.ok(kinds(live).includes('exam-live'));
  await counterPhone.run('wait-exam-status', { examId: 'EX-7', status: 'published' });
  const teacher = await counterPhone.run('notification-feed', { role: 'teacher' });
  assert.deepEqual(kinds(teacher), ['exam-approved'], 'the returned notice is replaced by "published"');
});

test('every read and write was allowed by the deployed database.rules.json', () => {
  assert.deepEqual(cloud.ruleViolations, []);
});
