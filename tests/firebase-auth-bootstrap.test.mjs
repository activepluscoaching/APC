import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { bootstrapFirstAdmin, profileForBootstrap } = require('../functions/first-admin-bootstrap-core.cjs');
const profile = Object.freeze({ fullName: 'Principal Admin', email: 'OWNER@example.com', username: 'owner.admin', password: 'a-long-secret-2026!' });

function sandbox({ createFails = false, deleteFails = false, finalFails = false } = {}) {
  const records = new Map(), users = new Map(), claims = new Map();
  let queue = Promise.resolve();
  const db = {
    doc: path => ({ path }),
    runTransaction(callback) {
      const work = queue.then(async () => {
        const changes = [];
        const tx = {
          async get(ref) { const value = records.get(ref.path); return { exists: Boolean(value), data: () => value }; },
          create(ref, value) {
            if (records.has(ref.path) || changes.some(c => c.path === ref.path && c.op === 'create')) throw new Error('already-exists');
            if (finalFails && ref.path.startsWith('users/')) throw new Error('final transaction failed');
            changes.push({ op: 'create', path: ref.path, value });
          },
          update(ref, value) { changes.push({ op: 'update', path: ref.path, value }); },
          delete(ref) { changes.push({ op: 'delete', path: ref.path }); }
        };
        const result = await callback(tx);
        for (const c of changes) {
          if (c.op === 'delete') records.delete(c.path);
          else records.set(c.path, c.op === 'update' ? { ...records.get(c.path), ...c.value } : c.value);
        }
        return result;
      });
      queue = work.catch(() => {});
      return work;
    }
  };
  const auth = {
    async createUser(input) {
      if (createFails) throw new Error('email-already-exists');
      const user = { uid: `uid-${users.size + 1}`, ...input }; users.set(user.uid, user); return user;
    },
    async setCustomUserClaims(uid, data) { claims.set(uid, data); },
    async deleteUser(uid) { if (deleteFails) throw new Error('auth delete failed'); users.delete(uid); claims.delete(uid); }
  };
  return { records, users, claims, db, auth, run: data => bootstrapFirstAdmin({ auth, db, serverTimestamp: () => 'server-time', profile: data || profile }) };
}

test('only a real email and strong password can bootstrap; no side effects on rejection', async () => {
  const env = sandbox();
  for (const data of [
    { ...profile, email: 'username' },
    { ...profile, email: 'user.owner@accounts.activeplus.app' },
    { ...profile, password: 'short' },
    { ...profile, username: '../other' }
  ]) await assert.rejects(env.run(data));
  assert.equal(env.records.size, 0);
  assert.equal(env.users.size, 0);
  assert.equal(profileForBootstrap(profile).email, 'owner@example.com');
});

test('the Firestore lock wins before Auth and exactly one Admin is provisioned', async () => {
  const env = sandbox();
  const results = await Promise.allSettled([env.run(), env.run()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(env.users.size, 1);
  const result = results.find(r => r.status === 'fulfilled').value;
  assert.equal(env.users.get(result.uid).email, 'owner@example.com');
  assert.deepEqual(env.claims.get(result.uid), { role: 'admin', status: 'active', mustChangePassword: false });
  assert.equal(env.records.get('system/bootstrap').state, 'active');
  assert.equal(env.records.get('usernameIndex/owner.admin').uid, result.uid);
  assert.equal(env.records.get(`users/${result.uid}`).email, 'owner@example.com');
  assert.equal(env.records.get(`users/${result.uid}`).password, undefined);
  await assert.rejects(env.run(), /Admin already initialized/);
});

test('rollback removes an uncommitted UID; a failed deletion retains the lock', async () => {
  const first = sandbox({ finalFails: true });
  await assert.rejects(first.run(), /final transaction failed/);
  assert.equal(first.users.size, 0);
  assert.equal(first.records.size, 0);
  const second = sandbox({ finalFails: true, deleteFails: true });
  await assert.rejects(second.run(), /final transaction failed/);
  assert.equal(second.users.size, 1);
  assert.equal(second.records.get('system/bootstrap').state, 'provisioning');
  await assert.rejects(second.run(), /already initialized/);
  const third = sandbox({ createFails: true });
  await assert.rejects(third.run(), /email-already-exists/);
  assert.equal(third.records.size, 0);
});

test('the old public callable is deny-all and staff provisioning no longer creates student or fake email', () => {
  const src = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
  const stub = src.slice(src.indexOf('exports.createFirstAdmin ='), src.indexOf('exports.adminCreateAccount ='));
  assert.match(stub, /onCall\(\{ region: 'us-central1' \}/, 'must replace the original deployed URL');
  assert.match(stub, /permission-denied/);
  assert.doesNotMatch(stub, /auth\.createUser|setCustomUserClaims|tx\.create/);
  assert.match(src, /auth\.createUser\(\{ email: profile\.email/);
  assert.doesNotMatch(src, /authEmail\(|accounts\.activeplus\.app`/);
  assert.match(src, /const STAFF_ROLES = new Set\(\['manager', 'teacher', 'payment'\]\)/);
});
