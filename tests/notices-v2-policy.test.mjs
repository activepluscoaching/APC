import test from 'node:test';
import assert from 'node:assert/strict';
import { noticeSyncPlan, noticesV2RetryDecision } from '../sync/notices-v2-policy.js';

test('active custom-claim Admin and Manager use canonical Notices v2 path', () => {
  for (const role of ['admin', 'manager']) {
    const plan = noticeSyncPlan({ role, status: 'active' }, 'password', `uid-${role}`);
    assert.equal(plan.ok, true);
    assert.equal(plan.mode, 'canonical');
    assert.equal(plan.canWrite, true);
    assert.equal(plan.readPath, 'activePlusV2/notices');
    assert.equal(plan.writePath, 'activePlusV2/notices');
  }
  assert.equal(noticeSyncPlan({ role: 'manager', status: 'suspended' }, 'password', 'u-mgr').ok, false);
});

test('Teacher drafts are rooted at authenticated uid and assignment checks require teacherId', () => {
  const plan = noticeSyncPlan({ role: 'teacher', status: 'active', teacherId: 'TCH-01' }, 'password', 'uid-teacher-1');
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'teacher');
  assert.equal(plan.canWrite, true);
  assert.deepEqual(plan.readPaths, [
    'activePlusV2/notices',
    'activePlusV2/noticeDraftsByAuthor/uid-teacher-1',
    'activePlusV2/teacherAssignments'
  ]);
  assert.equal(plan.draftPath, 'activePlusV2/noticeDraftsByAuthor/uid-teacher-1');
  assert.equal(noticeSyncPlan({ role: 'teacher', status: 'active' }, 'password', 'uid-teacher-1').ok, false);
  assert.equal(noticeSyncPlan({ role: 'teacher', status: 'active', teacherId: 'TCH-01' }, 'password', 'bad/uid').ok, false);
});

test('Payment role reads canonical notices read-only', () => {
  const plan = noticeSyncPlan({ role: 'payment', status: 'active' }, 'password', 'uid-pay');
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'staff-readonly');
  assert.equal(plan.canWrite, false);
  assert.equal(plan.readPath, 'activePlusV2/notices');
});

test('Approved students read only their own per-student notice projection', () => {
  const plan = noticeSyncPlan({ role: 'student', status: 'approved', studentId: '261022001' }, 'password', 'uid-stu-1');
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'student');
  assert.equal(plan.canWrite, false);
  assert.equal(plan.readPath, 'activePlusV2/studentNotices/261022001');
  assert.equal(noticeSyncPlan({ role: 'student', status: 'pending', studentId: '261022001' }, 'password', 'uid-stu-1').ok, false);
  assert.equal(noticeSyncPlan({ role: 'student', status: 'approved' }, 'password', 'uid-stu-1').ok, false);
  assert.equal(noticeSyncPlan({ role: 'student', status: 'approved', studentId: 'bad/id' }, 'password', 'uid-stu-1').ok, false);
});

test('anonymous, forced-password-change, and claimless sessions stay persistent no-ops without retries', () => {
  assert.equal(noticeSyncPlan({ role: 'admin', status: 'active' }, 'anonymous', 'u-anon').reason, 'authenticated-claims-required');
  assert.equal(noticeSyncPlan({ role: 'admin', status: 'active', mustChangePassword: true }, 'password', 'u-admin').reason, 'authenticated-claims-required');
  assert.equal(noticeSyncPlan({}, 'password', 'u-none').reason, 'authenticated-claims-required');

  for (const reason of ['authentication-required', 'authenticated-claims-required', 'role-not-authorized']) {
    const decision = noticesV2RetryDecision({ ok: false, reason });
    assert.equal(decision.retry, false, `${reason} must never trigger background retry loops`);
    assert.equal(decision.started, false);
  }
  assert.equal(noticesV2RetryDecision({ ok: true, role: 'student' }).started, true);
  assert.equal(noticesV2RetryDecision({ ok: false, reason: 'notices-v2-sync-failed' }).retry, true);
});
