import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoleStore, ROLE_DB_KEY } from '../js/offline-role-store.js';
const memory = () => { const rows = new Map(); return { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v) }; };
async function fixture() { const storage = memory(); const db = createRoleStore(storage); await db.seedDemo(); return { storage, db }; }
const login = (db, role) => db.login(`${role}.demo`, 'Demo12345');
const denied = fn => assert.rejects(fn, { code: 'ACCESS_DENIED' });

test('demo seeding never overwrites legacy or existing v2 data', async () => {
  const { storage, db } = await fixture(); storage.setItem('activePlus.admin.transactions.v1', 'legacy');
  const before = storage.getItem(ROLE_DB_KEY); await assert.rejects(() => db.seedDemo(), { code: 'DATABASE_EXISTS' });
  assert.equal(storage.getItem(ROLE_DB_KEY), before); assert.equal(storage.getItem('activePlus.admin.transactions.v1'), 'legacy');
  assert.ok(!before.includes('Demo12345'));
});

test('payment pending → manager review → finalized, shared by all sessions and counted only once', async () => {
  const { storage, db } = await fixture(); await login(db, 'payment');
  const payment = await db.createPayment({ studentId: 'student-1', amount: 750 });
  assert.equal(payment.status, 'pending'); assert.match(db.receipt(payment.id).label, /অস্থায়ী/);
  await denied(() => db.approvePayment(payment.id));
  const manager = createRoleStore(storage); await login(manager, 'manager');
  assert.equal(manager.report().approvedTotal, 0); assert.equal(manager.report().pendingTotal, 1250);
  await manager.approvePayment(payment.id); assert.equal(manager.report().approvedTotal, 750);
  await assert.rejects(() => manager.approvePayment(payment.id), { code: 'ALREADY_REVIEWED' });
  assert.match(db.receipt(payment.id).label, /অনুমোদিত/);
  const student = createRoleStore(storage); await login(student, 'student');
  assert.equal(student.list('payments').find(p => p.id === payment.id).status, 'approved');
  const admin = createRoleStore(storage); await login(admin, 'admin'); assert.equal(admin.report().approvedTotal, 750);
});

test('explicit role grants deny forbidden action calls, not just hidden menus', async () => {
  const { db } = await fixture();
  for (const role of ['admin', 'teacher', 'student', 'payment']) {
    await login(db, role); await denied(() => db.approvePayment('payment-1'));
    await denied(() => db.updateStudent('student-2', { status: 'approved' }));
    await denied(() => db.publish('exams', 'exam-1'));
  }
  for (const role of ['manager', 'teacher', 'student', 'payment']) {
    await login(db, role); await denied(() => db.saveSettings({ appName: 'Forbidden' }));
    await denied(() => db.saveStaff({ username: 'intruder', role: 'admin', password: 'Password123' }));
    assert.throws(() => db.backup(), { code: 'ACCESS_DENIED' });
  }
  for (const role of ['admin', 'manager', 'teacher', 'student']) {
    await login(db, role); await denied(() => db.createPayment({ studentId: 'student-1', amount: 100 }));
  }
  await login(db, 'admin');
  for (const table of ['notices', 'routines', 'classes', 'attendance', 'exams']) await denied(() => db.saveAcademic(table, { title: 'Forbidden', classId: 'class-8' }));
});

test('student and counter data scope; teacher cannot see other classes or payment data', async () => {
  const { db } = await fixture(); await login(db, 'student');
  assert.deepEqual(db.list('students').map(s => s.id), ['student-1']);
  assert.equal(db.list('accounts').length, 1); assert.equal(db.list('results').length, 0);
  assert.throws(() => db.report(), { code: 'ACCESS_DENIED' });
  await login(db, 'teacher'); assert.equal(db.list('payments').length, 0);
  assert.deepEqual(db.list('students').map(s => s.id), ['student-1']);
  await denied(() => db.saveAcademic('notices', { title: 'Forbidden class', classId: 'class-9' }));
  await denied(() => db.saveAcademic('notices', { title: 'Global', classId: 'all' }));
  await login(db, 'admin');
  await db.saveStaff({ name: 'Second Counter', username: 'second.counter', role: 'payment', password: 'Counter123' });
  await db.login('second.counter', 'Counter123'); assert.equal(db.list('payments').length, 0);
  assert.throws(() => db.receipt('payment-1'), { code: 'ACCESS_DENIED' });
});

test('academic preparation, manager publishing and assignment submission/assessment', async () => {
  const { db } = await fixture(); await login(db, 'teacher');
  const result = await db.saveAcademic('results', { title: 'Test', classId: 'class-8', studentId: 'student-1', marks: 88, status: 'published' });
  assert.equal(result.status, 'pending');
  const assignment = await db.saveAcademic('assignments', { title: 'Homework', classId: 'class-8' });
  await login(db, 'student'); assert.equal(db.list('results').length, 0);
  const submission = await db.submit(assignment.id, 'আমার উত্তর');
  await login(db, 'teacher'); await db.grade(submission.id, 90);
  await login(db, 'manager'); await db.publish('results', result.id);
  assert.ok(!Object.hasOwn(db.report(), 'staff')); assert.ok(!Object.hasOwn(db.report(), 'audit'));
  await login(db, 'student'); assert.equal(db.list('results')[0].marks, 88); assert.equal(db.list('submissions')[0].marks, 90);
});

test('admin staff edit/deactivation/reset invalidate existing sessions; no role escalation', async () => {
  const { storage, db } = await fixture(); await login(db, 'admin');
  const teacher = createRoleStore(storage); await login(teacher, 'teacher');
  await db.saveStaff({ id: 'teacher', active: false });
  assert.throws(() => teacher.list('students'), { code: 'LOGIN_REQUIRED' });
  await db.saveStaff({ id: 'teacher', active: true, password: 'NewPassword123' });
  await assert.rejects(() => teacher.login('teacher.demo', 'Demo12345'), { code: 'INVALID_LOGIN' });
  await teacher.login('teacher.demo', 'NewPassword123');
  await denied(() => db.saveStaff({ id: 'teacher', role: 'admin' }));
  await denied(() => db.saveStaff({ id: 'student', role: 'teacher' }));
});

test('manager student approval, edit/reset and disjoint academic settings', async () => {
  const { db } = await fixture(); await login(db, 'manager');
  await db.updateStudent('student-2', { status: 'approved' });
  assert.equal(db.list('students')[1].reviewedBy, 'manager');
  await db.updateStudent('student-1', { name: 'Updated', password: 'NewStudent123' });
  await db.saveSettings({ showRoutine: true }, true);
  await denied(() => db.saveSettings({ maintenance: true }, true));
  await db.login('student.demo', 'NewStudent123'); assert.equal(db.list('students')[0].name, 'Updated');
});

test('storage failure, corrupt database and restore fail closed', async () => {
  const { storage, db } = await fixture(); await login(db, 'admin'); const backup = db.backup();
  await assert.rejects(() => db.restore('{"version":2}'), { code: 'CORRUPT_DATABASE' });
  await db.restore(backup); assert.throws(() => db.current(), { code: 'LOGIN_REQUIRED' });
  await login(db, 'payment'); const before = storage.getItem(ROLE_DB_KEY);
  storage.setItem = () => { throw new Error('Disk full'); };
  await assert.rejects(() => db.createPayment({ studentId: 'student-1', amount: 10 }), /Disk full/);
  assert.equal(storage.getItem(ROLE_DB_KEY), before);
});

test('student self-registration requires Manager approval; registration cannot inject a staff role', async () => {
  const { db } = await fixture();
  const registered = await db.registerStudent({ name: 'New Student', username: 'new.student', password: 'Student123', classId: 'class-8', role: 'admin', status: 'approved' });
  await assert.rejects(() => db.login('new.student', 'Student123'), { code: 'STUDENT_NOT_APPROVED' });
  await login(db, 'manager'); await db.updateStudent(registered.studentId, { status: 'approved' });
  const account = await db.login('new.student', 'Student123');
  assert.equal(account.role, 'student'); assert.equal(db.list('students').length, 1);
  assert.equal(db.list('students')[0].id, registered.studentId);
});

test('running-center demo fills all 14 sections, preserves edits and is idempotent', async () => {
  const { db } = await fixture(); await login(db, 'admin');
  const counts = await db.populateDemo();
  assert.equal(counts.classes, 14); assert.equal(counts.students, 114);
  assert.equal(counts.payments, 257);
  for (const table of ['routines', 'notices', 'assignments', 'exams', 'results', 'attendance', 'feedback', 'submissions']) {
    const rows = db.list(table);
    for (const c of db.list('classes')) assert.ok(rows.some(r => r.classId === c.id), `${table} missing ${c.id}`);
  }
  await login(db, 'manager'); await db.updateStudent('student-1', { name: 'Preserve this edit' });
  await db.approvePayment('payment-1');
  await login(db, 'admin'); assert.deepEqual(await db.populateDemo(), counts);
  assert.equal(db.list('students').find(r => r.id === 'student-1').name, 'Preserve this edit');
  assert.equal(db.list('payments').find(r => r.id === 'payment-1').status, 'approved');
  await db.login('teacher12b.demo', 'Demo12345');
  assert.equal(db.list('classes').length, 1);
  assert.ok(db.list('students').every(r => r.classId === 'demo-class-12-B'));
  await db.login('student12b1.demo', 'Demo12345');
  assert.equal(db.list('students').length, 1);
  assert.equal(db.list('payments').length, 3);
  assert.equal(db.list('results').length, 3);
});
