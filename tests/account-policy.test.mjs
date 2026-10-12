import test from 'node:test';
import assert from 'node:assert/strict';
import { protectAccountIdentity, appendAccountMobile, contactNumber, isContactNumber } from '../js/account-policy.js';
import { saveAccount, loadAccount, saveStudent, writeJSON, verifyAccountPassword } from '../js/storage.js';
import { STORAGE_KEYS, DEFAULT_PIN } from '../js/config.js';
import { isPasswordRecord } from '../js/password-hash.js';
const primary = '01711223344', extra = '01811223344';
function setup() {
  const store = new Map(); let broken = false;
  globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { if (broken) throw new Error('quota'); store.set(k, v); } } };
  return { store, fail: () => { broken = true; } };
}
const rawAccount = env => JSON.parse(env.store.get(STORAGE_KEYS.account));
for (const role of ['student', 'teacher']) {
  test(`${role}: first number immutable, contacts append-only, no plaintext password`, async () => {
    const env = setup();
    const initial = protectAccountIdentity({ role, mobile: primary });
    // The default password is only a fallback, and it is stored as a hash.
    assert.equal(initial.pin, undefined);
    assert.equal(await saveAccount({ ...initial, pin: DEFAULT_PIN }), true);
    assert.equal(isPasswordRecord(rawAccount(env).pinHash), true);
    assert.equal(rawAccount(env).pin, undefined);
    const added = appendAccountMobile(initial, '+8801811223344');
    const edited = protectAccountIdentity({ ...added, registrationMobile: '', mobile: extra, additionalMobiles: [] }, added);
    assert.equal(edited.mobile, primary); assert.equal(edited.registrationMobile, primary);
    assert.deepEqual(edited.additionalMobiles, [extra]);
    assert.throws(() => appendAccountMobile(added, primary));
    assert.throws(() => appendAccountMobile(added, extra));
    assert.throws(() => appendAccountMobile(added, '123'));
  });
}

test('Bengali/local/international formats; reject invalid characters and prefixes', () => {
  assert.equal(contactNumber('+৮৮০ ১৭১১-২২৩৩৪৪'), primary);
  for (const value of ['01111223344', 'hello01711223344', '0171122334', '', '017112233444']) assert.equal(isContactNumber(value), false);
});

test('storage enforcement ignores attempted primary replacements and omitted contacts', async () => {
  const env = setup();
  assert.equal(await saveAccount({ mobile: primary, student: { id: 'S-1', studentMobile: extra } }), true);
  let current = loadAccount(); assert.equal(current.student.studentMobile, primary);
  assert.equal(await saveAccount(appendAccountMobile(current, extra)), true);
  assert.equal(await saveAccount({ ...loadAccount(), mobile: '01911223344', registrationMobile: '', additionalMobiles: [], student: { id: 'S-1', studentMobile: '' } }), true);
  current = loadAccount(); assert.equal(current.mobile, primary); assert.deepEqual(current.additionalMobiles, [extra]);
  saveStudent({ id: 'S-1', studentMobile: extra });
  assert.equal(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.student)).studentMobile, primary);
});

test('a saved password is only ever a PBKDF2 record; the default is applied as a hash', async () => {
  const env = setup();
  assert.equal(await saveAccount({ mobile: primary, student: { id: 'S-1' } }), true);
  const stored = rawAccount(env);
  assert.equal(isPasswordRecord(stored.pinHash), true);
  assert.equal(stored.pin, undefined);
  assert.equal(stored.password, undefined);
  // No pin supplied: the fallback PIN is hashed, and the plaintext is gone.
  assert.equal(await verifyAccountPassword(loadAccount(), DEFAULT_PIN), true);
  assert.equal(await verifyAccountPassword(loadAccount(), '000000'), false);
});

test('legacy plaintext account is upgraded to a hash and keeps its custom PIN', async () => {
  const env = setup();
  env.store.set(STORAGE_KEYS.account, JSON.stringify({ mobile: primary, pin: '789789', student: { id: 'S-1', studentMobile: extra } }));
  const current = loadAccount();
  assert.equal(current.registrationMobile, primary); assert.equal(current.student.studentMobile, primary);
  assert.deepEqual(current.additionalMobiles, [extra]); assert.equal(current.pin, '789789');
  // The legacy PIN still verifies while the plaintext record is in place.
  assert.equal(await verifyAccountPassword(current, '789789'), true);
  // Saving hashes it away: the plaintext never survives the write.
  assert.equal(await saveAccount(current), true);
  const stored = rawAccount(env);
  assert.equal(stored.pin, undefined);
  assert.equal(isPasswordRecord(stored.pinHash), true);
  assert.equal(await verifyAccountPassword(loadAccount(), '789789'), true);
  assert.equal(await verifyAccountPassword(loadAccount(), DEFAULT_PIN), false);
  assert.equal(loadAccount().mobile, primary);
});

test('failed/corrupt/unavailable storage is never reported as successful', async () => {
  let env = setup(); await saveAccount({ mobile: primary }); env.fail();
  assert.equal(await saveAccount({ mobile: extra }), false); assert.equal(loadAccount().mobile, primary);
  env = setup(); env.store.set(STORAGE_KEYS.account, '{broken'); assert.equal(await saveAccount({ mobile: primary }), false); assert.equal(env.store.get(STORAGE_KEYS.account), '{broken');
  globalThis.window = { get localStorage() { throw new Error('unavailable'); } };
  assert.equal(writeJSON('test', {}), false); assert.equal(await saveAccount({ mobile: primary }), false);
});
