import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backendMode } from '../sync/backend-selection.js';
import { checkCloudIdentity, normalizeAuthEmail } from '../sync/cloud-identity-policy.js';

const user = Object.freeze({ uid: 'u-1', email: 'ADMIN@example.com', isAnonymous: false });
const token = Object.freeze({ signInProvider: 'password', claims: { role: 'admin', status: 'active', mustChangePassword: false } });
const profile = Object.freeze({ uid: 'u-1', email: 'admin@example.com', role: 'admin', status: 'active' });
const decision = (change = {}) => checkCloudIdentity({ user, token, profile, ...change });

test('new backend selection is local by default and remembered only in the current tab', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(backendMode({ search: '', storage }), 'local');
  assert.equal(backendMode({ search: '?backend=firebase', storage }), 'firebase');
  assert.equal(backendMode({ search: '', storage }), 'firebase');
  assert.equal(backendMode({ search: '?backend=local', storage }), 'local');
  assert.equal(backendMode({ search: '?backend=unknown', storage }), 'local');
  assert.equal(backendMode({ search: '?backend=firebase', storage: null }), 'firebase');
  assert.equal(backendMode({ search: '', storage: null }), 'local');
});

test('opt-in Firebase Auth cannot reuse the anonymous RTDB bridge', () => {
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const [mode, enabled] of [['', true], ['?backend=local', true], ['?backend=firebase', false]]) {
    const script = `globalThis.location={search:${JSON.stringify(mode)}};
      const {LEGACY_CLOUD_ENABLED}=await import('./sync/cloud-access.js'); console.log(LEGACY_CLOUD_ENABLED);`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), String(enabled));
  }
});

test('a browser blocking sessionStorage still respects the in-memory Firebase opt-in', () => {
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const script = `globalThis.__apcPublicFlags={backend:'firebase'};
    Object.defineProperty(globalThis,'sessionStorage',{get(){throw new Error('blocked')}});
    const m=await import('./sync/cloud-access.js');
    console.log(m.backendMode(),m.LEGACY_CLOUD_ENABLED);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'firebase false');
});

test('Auth UID + password provider + trusted role/status must match the Firestore profile', () => {
  assert.equal(decision().ok, true);
  assert.equal(decision({ profile: { ...profile, role: 'manager' } }).reason, 'profile-mismatch');
  assert.equal(decision({ profile: { ...profile, uid: 'attacker' } }).reason, 'profile-mismatch');
  assert.equal(decision({ profile: { ...profile, email: 'elsewhere@example.com' } }).reason, 'profile-mismatch');
  assert.equal(decision({ expectedRole: 'teacher' }).reason, 'role-denied');
  assert.equal(decision({ token: { ...token, claims: { ...token.claims, role: 'root' } } }).reason, 'role-denied');
  assert.equal(decision({ token: { ...token, claims: { ...token.claims, status: 'pending' } } }).reason, 'account-inactive');
  assert.equal(decision({ token: { ...token, claims: { ...token.claims, mustChangePassword: true } } }).reason, 'must-change-password');
  assert.equal(decision({ token: { ...token, signInProvider: 'anonymous' } }).reason, 'email-auth-required');
  assert.equal(decision({ user: { ...user, isAnonymous: true } }).reason, 'email-auth-required');
  assert.equal(normalizeAuthEmail('owner@accounts.activeplus.app'), '');
});

test('students additionally need their own approved profile, never a client-set role', () => {
  const student = { ...token, claims: { role: 'student', status: 'approved', mustChangePassword: false } };
  const studentAccount = { ...profile, role: 'student', status: 'approved' };
  assert.equal(decision({ token: student, profile: studentAccount }).reason, 'student-profile-mismatch');
  assert.equal(decision({ token: student, profile: studentAccount, studentProfile: { uid: 'u-1', status: 'approved' } }).ok, true);
  assert.equal(decision({ token: student, profile: studentAccount, studentProfile: { uid: 'u-2', status: 'approved' } }).ok, false);
});
