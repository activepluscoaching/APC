/* Remember-device expiry is one constant table in js/session.js:
   admin & payment ৭ days, manager ৭ days, teacher ৩০ days, student ৯০ days.
   The README, the panels' session-policy copy and the staff/payment session
   writers all read that table — nothing may restate a day count of its own. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SESSION_TTL_DAYS, sessionTtlDays, buildSessionRecord, DAY_MS } from '../js/session.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('SESSION_TTL_DAYS pins every role window', () => {
  assert.deepEqual({ ...SESSION_TTL_DAYS }, {
    admin: 7, manager: 7, payment: 7, teacher: 30, student: 90
  });
  assert.equal(sessionTtlDays('admin'), 7);
  assert.equal(sessionTtlDays('payment'), 7);
  assert.equal(sessionTtlDays('manager'), 7);
  assert.equal(sessionTtlDays('teacher'), 30);
  assert.equal(sessionTtlDays('student'), 90);
  assert.equal(sessionTtlDays('unknown-role'), 90, 'unknown roles fall back to the student window');
});

test('session records carry an absolute expiry from the table', () => {
  const now = 1_700_000_000_000;
  const record = buildSessionRecord({ owner: 'student', ttlDays: sessionTtlDays('student'), now });
  assert.equal(record.expiry, now + 90 * DAY_MS);
  const staff = buildSessionRecord({ owner: 'payment.apc', ttlDays: sessionTtlDays('payment'), now });
  assert.equal(staff.expiry, now + 7 * DAY_MS);
  // The default stays the student window so old callers keep their meaning.
  assert.equal(buildSessionRecord({ owner: 'x', now }).expiry, now + 90 * DAY_MS);
});

test('the staff/payment session writers and panels read the shared table', () => {
  const staffAuth = read('js/staff-auth.js');
  assert.match(staffAuth, /ttlDays: sessionTtlDays\(role\)/, 'saveStaffSession uses the role window');
  assert.match(staffAuth, /rememberDays: SESSION_TTL_DAYS/, 'STAFF_SESSION_RULES exposes the table');
  assert.doesNotMatch(staffAuth, /REMEMBER_DAYS = \d/, 'no private day count may survive');

  const paymentAuth = read('js/payment-auth.js');
  assert.match(paymentAuth, /PAYMENT_REMEMBER_DAYS = STAFF_SESSION_RULES\.rememberDays\.payment/);

  const storage = read('js/storage.js');
  assert.match(storage, /ttlDays: SESSION_TTL_DAYS\.student/);
  assert.doesNotMatch(storage, /SESSION_DAYS_REMEMBER = \d/);

  assert.match(read('js/admin.js'), /rememberDays\.admin/);
  assert.match(read('js/manager.js'), /rememberDays\.manager/);
});

test('the README states the same windows as the table', () => {
  const readme = read('README.md');
  assert.match(readme, /Admin\/Manager\/Payment ৭ দিন, Teacher ৩০ দিন, Student ৯০ দিন/);
  assert.match(readme, /SESSION_TTL_DAYS/);
  assert.doesNotMatch(readme, /সেশন ৯০ দিন/);
  assert.doesNotMatch(readme, /থাকে ২০ দিন/);
});
