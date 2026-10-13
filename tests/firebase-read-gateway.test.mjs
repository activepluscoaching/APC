import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCloudReadGateway } from '../sync/cloud-read-gateway.js';

function fixture({ role = 'payment', mode = 'firebase', emulatorOnly = true,
  legacyEnabled = false, status = 'active', changePassword = false,
  provider = 'password', fail = false, classes = ['Ten'] } = {}) {
  const calls = [];
  const uid = 'user-1';
  const user = { uid, email: 'first@example.com', isAnonymous: false,
    async getIdTokenResult(force) {
      calls.push(['token', force]);
      return { signInProvider: provider, claims: { role, status, mustChangePassword: changePassword, classes } };
    } };
  const records = new Map([
    [`users/${uid}`, { uid, email: user.email, role, status, username: 'first', fullName: 'First', passwordHash: 'sensitive' }],
    [`students/${uid}`, { uid, status, className: 'Ten', privateNotes: 'sensitive' }],
    ['studentSummaries/stu-1', { studentId: 'stu-1', name: 'A', className: 'Ten',
      status: 'approved', monthlyFee: 1000, guardianSecret: 'do-not-return' }]
  ]);
  const gateway = createCloudReadGateway({
    mode: () => mode, emulatorOnly, legacyEnabled,
    async getCurrentUser() { calls.push(['auth']); if (fail === 'auth') throw new Error('offline'); return user; },
    async readDocument(collection, id) {
      calls.push(['get', collection, id]);
      if (fail === `${collection}/${id}`) throw new Error('permission-denied');
      return records.get(`${collection}/${id}`) || null;
    }
  });
  return { gateway, calls, records, user };
}

test('no authenticated reads in local mode, unreloaded legacy mode, or production project', async () => {
  for (const [change, reason] of [
    [{ mode: 'local' }, 'local-backend'],
    [{ legacyEnabled: true }, 'reload-required'],
    [{ emulatorOnly: false }, 'dev-emulator-required']
  ]) {
    const { gateway, calls } = fixture(change);
    assert.equal((await gateway.ownProfile()).reason, reason);
    assert.deepEqual(calls, [], 'must not initialize Auth or touch Firestore');
  }
});

test('each read refreshes the email Auth token, verifies profile and returns an allowlisted shape', async () => {
  const { gateway, calls } = fixture();
  assert.deepEqual(await gateway.ownProfile(), { ok: true, profile: {
    uid: 'user-1', email: 'first@example.com', username: 'first', fullName: 'First',
    role: 'payment', status: 'active'
  } });
  assert.deepEqual(await gateway.studentSummary('stu-1'), { ok: true, summary: {
    studentId: 'stu-1', name: 'A', className: 'Ten', monthlyFee: 1000, status: 'approved'
  } });
  assert.deepEqual(calls.filter(call => call[0] === 'token'), [['token', true], ['token', true]]);
  assert.deepEqual(calls.filter(call => call[0] === 'get'), [
    ['get', 'users', 'user-1'], ['get', 'users', 'user-1'], ['get', 'studentSummaries', 'stu-1']
  ]);
  assert.equal('write' in gateway, false);
});

test('no profile fetch for wrong provider, inactive account, role or temporary password', async () => {
  for (const options of [
    { provider: 'anonymous' }, { status: 'pending' },
    { changePassword: true }, { role: 'staff-admin' }
  ]) {
    const { gateway, calls } = fixture(options);
    assert.equal((await gateway.ownProfile()).ok, false);
    assert.equal(calls.some(call => call[0] === 'get'), false);
  }
});

test('forged identity, missing account, invalid path and failed network all fail closed', async () => {
  const { gateway, records, calls, user } = fixture();
  records.set('users/user-1', { ...records.get('users/user-1'), role: 'admin' });
  assert.equal((await gateway.studentSummary('stu-1')).reason, 'profile-mismatch');
  assert.equal(calls.some(call => call[1] === 'studentSummaries'), false);
  records.delete('users/user-1');
  assert.equal((await gateway.ownProfile()).reason, 'profile-mismatch');
  assert.equal((await gateway.studentSummary('stu-1/../users/user-1')).reason, 'invalid-student-id');
  user.isAnonymous = true;
  assert.equal((await gateway.ownProfile()).reason, 'email-auth-required');
  assert.equal((await fixture({ fail: 'auth' }).gateway.ownProfile()).reason, 'read-failed');
  assert.equal((await fixture({ fail: 'users/user-1' }).gateway.ownProfile()).reason, 'read-failed');
});

test('student sees only self; payment sees only approved summaries; teacher needs assigned class', async () => {
  const student = fixture({ role: 'student', status: 'approved' });
  assert.equal((await student.gateway.ownProfile()).student.privateNotes, undefined);
  assert.equal((await student.gateway.studentSummary('stu-1')).reason, 'role-denied');
  assert.equal(student.calls.some(call => call[1] === 'studentSummaries'), false);
  student.records.set('students/user-1', { uid: 'other', status: 'approved' });
  assert.equal((await student.gateway.ownProfile()).reason, 'student-profile-mismatch');

  const pending = fixture();
  pending.records.set('studentSummaries/stu-1', { studentId: 'stu-1', status: 'pending' });
  assert.equal((await pending.gateway.studentSummary('stu-1')).reason, 'status-denied');
  assert.equal((await fixture({ role: 'teacher', classes: ['Nine'] }).gateway.studentSummary('stu-1')).reason, 'class-denied');
  assert.equal((await fixture({ role: 'teacher', classes: ['Ten'] }).gateway.studentSummary('stu-1')).ok, true);
  assert.equal((await fixture({ role: 'manager' }).gateway.studentSummary('stu-1')).ok, true);
});

test('in-flight mode changes or sign-out cannot surface a completed read', async () => {
  let currentMode = 'firebase';
  let currentUser = { uid: 'user-1', email: 'first@example.com', isAnonymous: false,
    async getIdTokenResult() { return { signInProvider: 'password', claims: { role: 'admin', status: 'active' } }; } };
  const profile = { uid: 'user-1', email: 'first@example.com', role: 'admin', status: 'active' };
  const reader = createCloudReadGateway({ mode: () => currentMode, legacyEnabled: false, emulatorOnly: true,
    getCurrentUser: async () => currentUser,
    async readDocument(collection) {
      if (collection === 'studentSummaries') {
        currentMode = 'local';
        return { studentId: 'stu-1', status: 'approved' };
      }
      return profile;
    }
  });
  assert.equal((await reader.studentSummary('stu-1')).reason, 'session-changed');
  currentMode = 'firebase';
  const signOut = createCloudReadGateway({ mode: () => 'firebase', legacyEnabled: false, emulatorOnly: true,
    getCurrentUser: async () => currentUser,
    async readDocument() { currentUser = null; return profile; }
  });
  assert.equal((await signOut.ownProfile()).reason, 'session-changed');
});

test('staging entry remains lazy, read-only and disconnected from legacy auto-flush', () => {
  const wrapper = readFileSync(new URL('../sync/cloud-read.js', import.meta.url), 'utf8');
  assert.match(wrapper, /firebaseEnvironment === 'dev' && useFirebaseEmulators/);
  assert.match(wrapper, /COLLECTIONS = new Set\(\['users', 'students', 'studentSummaries'\]\)/);
  assert.doesNotMatch(wrapper, /setDoc\(|addDoc\(|setDatabaseAdapter\(|createFirestoreAdapter\(/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /cloud-read\.js|cloud-read-gateway\.js/);
});
