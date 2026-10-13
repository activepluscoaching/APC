/* Password hashing rules: PBKDF2-HMAC-SHA256 with per-password salt, portable
   records, and no plaintext anywhere. The pure-JS fallback (used on plain
   http/LAN pages) is checked against Node's reference PBKDF2 so both paths
   produce and verify identical records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  hashPassword, verifyPassword, isPasswordRecord, passwordNeedsUpgrade, PASSWORD_HASH_INFO
} from '../js/password-hash.js';
import { pbkdf2, toHex, fromHex } from '../js/password-hash-worker.js';

const realCrypto = globalThis.crypto;
function withSubtle(available) {
  if (available) {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true });
    return;
  }
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
    configurable: true,
    writable: true
  });
}

test.after(() => withSubtle(true));

test('a hashed password is a PBKDF2 record with salt, work factor and digest', async () => {
  withSubtle(true);
  const record = await hashPassword('Apc-Test-2026');
  assert.equal(record.v, 1);
  assert.equal(record.algo, 'PBKDF2');
  assert.equal(record.hash, 'SHA-256');
  assert.equal(record.iterations, PASSWORD_HASH_INFO.iterationsSubtle);
  assert.equal(record.salt.length, 32); // 16 bytes of hex
  assert.equal(record.digest.length, 64); // 32 bytes of hex
  assert.equal(/^[0-9a-f]+$/.test(record.salt), true);
  assert.equal(/^[0-9a-f]+$/.test(record.digest), true);
  // The plaintext appears nowhere in the record.
  assert.equal(JSON.stringify(record).includes('Apc-Test-2026'), false);
});

test('verification accepts the right password and rejects everything else', async () => {
  withSubtle(true);
  const record = await hashPassword('123123');
  assert.equal(await verifyPassword('123123', record), true);
  assert.equal(await verifyPassword('123124', record), false);
  assert.equal(await verifyPassword('', record), false);
  assert.equal(await verifyPassword(undefined, record), false);
  // Legacy plaintext values are never valid records.
  assert.equal(await verifyPassword('123123', '123123'), false);
  assert.equal(await verifyPassword('123123', null), false);
  assert.equal(await verifyPassword('123123', { algo: 'PBKDF2' }), false);
});

test('the same password hashes differently every time (unique salt)', async () => {
  withSubtle(true);
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.digest, b.digest);
  assert.equal(await verifyPassword('same-password', a), true);
  assert.equal(await verifyPassword('same-password', b), true);
});

test('the pure-JS fallback matches Node PBKDF2 exactly, on both paths', async () => {
  withSubtle(false);
  const record = await hashPassword('fallback-password');
  assert.equal(record.iterations, PASSWORD_HASH_INFO.iterationsFallback);
  const expected = pbkdf2Sync('fallback-password', Buffer.from(record.salt, 'hex'), record.iterations, 32, 'sha256').toString('hex');
  assert.equal(record.digest, expected);
  assert.equal(await verifyPassword('fallback-password', record), true);
  assert.equal(await verifyPassword('nope', record), false);

  // Records are portable: the Web Crypto path verifies a fallback record.
  withSubtle(true);
  assert.equal(await verifyPassword('fallback-password', record), true);
  assert.equal(passwordNeedsUpgrade(record), true, 'a lighter record is due for an upgrade');
  const strong = await hashPassword('fallback-password');
  assert.equal(passwordNeedsUpgrade(strong), false);
});

test('isPasswordRecord recognises only well-formed records', () => {
  assert.equal(isPasswordRecord({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: 'aa'.repeat(16), digest: 'bb'.repeat(32) }), true);
  assert.equal(isPasswordRecord('plain'), false);
  assert.equal(isPasswordRecord(null), false);
  assert.equal(isPasswordRecord([]), false);
  assert.equal(isPasswordRecord({ algo: 'PBKDF2', hash: 'SHA-1', iterations: 1000, salt: 'aa'.repeat(16), digest: 'bb'.repeat(32) }), false);
  assert.equal(isPasswordRecord({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 0, salt: 'aa'.repeat(16), digest: 'bb'.repeat(32) }), false);
  assert.equal(isPasswordRecord({ algo: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: 'short', digest: 'bb'.repeat(32) }), false);
});

test('the pure-JS work factor stays cheap phones-safe (≤ 1 00 000) and runs off-thread', () => {
  // Cheap-phone budget: the fallback count never exceeds 100 000 iterations…
  assert.ok(PASSWORD_HASH_INFO.iterationsFallback <= 100000,
    `fallback work factor is ${PASSWORD_HASH_INFO.iterationsFallback}, above the 100000 ceiling`);
  assert.ok(PASSWORD_HASH_INFO.iterationsFallback < PASSWORD_HASH_INFO.iterationsSubtle);
  // …and the core lives in the worker module, with no second copy drifting in
  // the main module.
  const core = readFileSync(new URL('../js/password-hash-worker.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../js/password-hash.js', import.meta.url), 'utf8');
  assert.match(core, /export function pbkdf2\(/);
  assert.match(core, /WorkerGlobalScope/); // module doubles as the Web Worker
  assert.doesNotMatch(main, /SHA256_K/, 'password-hash.js must not keep its own copy of the core');
  assert.match(main, /from '\.\/password-hash-worker\.js'/);
  assert.match(main, /new Worker\(new URL\('\.\/password-hash-worker\.js'/, 'the fallback runs in a Worker when available');
});

test('a record created with a lighter work factor keeps verifying as-is', async () => {
  // Per-record iteration counts: a 60 000-iteration record (any older release)
  // still verifies after the work factor is revisited — nothing is re-hashed
  // behind the user's back.
  withSubtle(true);
  const modern = await hashPassword('legacy-kept');
  const salt = fromHex(modern.salt);
  for (const legacyIterations of [60000, 100000, PASSWORD_HASH_INFO.iterationsFallback]) {
    const digest = pbkdf2('legacy-kept', salt, legacyIterations, 32);
    const legacy = { ...modern, iterations: legacyIterations, digest: toHex(digest) };
    assert.equal(await verifyPassword('legacy-kept', legacy), true);
    assert.equal(await verifyPassword('wrong', legacy), false);
  }
});
