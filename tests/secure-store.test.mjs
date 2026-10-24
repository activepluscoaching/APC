/* Encryption at rest for sensitive device records (accounts, sessions). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptValue, decryptValue, canEncrypt, isEncryptedEnvelope } from '../js/secure-store.js';

function freshBrowser() {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key)
    }
  };
  return store;
}

const realCrypto = globalThis.crypto;

test('values round-trip through an encrypted envelope', async () => {
  freshBrowser();
  assert.equal(canEncrypt(), true);
  const secret = JSON.stringify({ username: 'admin.apc', password: { algo: 'PBKDF2', digest: 'abc' } });
  const envelope = await encryptValue(secret);
  assert.equal(isEncryptedEnvelope(envelope), true);
  assert.equal(envelope.v, 1);
  // The plaintext is not readable in the envelope.
  assert.equal(JSON.stringify(envelope).includes('admin.apc'), false);
  assert.equal(JSON.stringify(envelope).includes('PBKDF2'), false);
  assert.equal(await decryptValue(envelope), secret);
});

test('a tampered envelope fails to decrypt instead of returning garbage', async () => {
  freshBrowser();
  const envelope = await encryptValue('sensitive');
  const tampered = { ...envelope, data: `${envelope.data.slice(0, -4)}ffff` };
  assert.equal(await decryptValue(tampered), null);
  const wrongIv = { ...envelope, iv: '00'.repeat(12) };
  assert.equal(await decryptValue(wrongIv), null);
});

test('malformed input and missing platform support are handled safely', async () => {
  freshBrowser();
  assert.equal(await decryptValue(null), null);
  assert.equal(await decryptValue('nope'), null);
  assert.equal(await decryptValue({ iv: 'x' }), null);
  assert.equal(await encryptValue('').then(isEncryptedEnvelope), true);
  assert.equal(await decryptValue(await encryptValue('')), '');
  assert.equal(await decryptValue('{"v":1,"iv":"aa","data":"bb"}'), null);

  // Without Web Crypto there is no envelope; callers fall back to hash-only records.
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: () => new Uint8Array(12) },
    configurable: true,
    writable: true
  });
  assert.equal(canEncrypt(), false);
  assert.equal(await encryptValue('secret'), null);
  assert.equal(await decryptValue({ v: 1, iv: 'aa', data: 'bb' }), null);
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true });
});

test('the device key is created once and reused', async () => {
  const store = freshBrowser();
  await encryptValue('one');
  const key = store.get('activePlus.deviceKey.v1');
  assert.equal(typeof key, 'string');
  assert.equal(key.length, 64); // 32 bytes of hex
  await encryptValue('two');
  assert.equal(store.get('activePlus.deviceKey.v1'), key, 'the key is stable');
  // A record written earlier still decrypts after the key is reused.
  const envelope = await encryptValue('three');
  assert.equal(await decryptValue(envelope), 'three');
});
