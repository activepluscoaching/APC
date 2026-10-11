/* Password hashing rules: PBKDF2-HMAC-SHA256 with per-password salt, portable
   records, and no plaintext anywhere. The pure-JS fallback (used on plain
   http/LAN pages) is checked against Node's reference PBKDF2 so both paths
   produce and verify identical records. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import {
  hashPassword, verifyPassword, isPasswordRecord, passwordNeedsUpgrade, PASSWORD_HASH_INFO
} from '../js/password-hash.js';

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
