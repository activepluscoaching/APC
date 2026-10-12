/* Student username rules: a self-chosen, permanent login ID.
   Validation, normalisation, suggestions, immutability and the device-local
   claim table that stops two accounts picking the same name. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername, usernameError, isValidUsername, suggestUsername,
  protectAccountIdentity, USERNAME_MAX, RESERVED_USERNAMES
} from '../js/account-policy.js';
import { saveAccount, loadAccount, usernameTaken, usernameOwner, reserveUsername, releaseUsername } from '../js/storage.js';
import { STORAGE_KEYS } from '../js/config.js';
import { isPasswordRecord } from '../js/password-hash.js';

function setup() {
  const store = new Map();
  globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) } };
  return store;
}

test('usernames normalise to lowercase without spaces', () => {
  assert.equal(normalizeUsername('  Raisa.Islam '), 'raisa.islam');
  assert.equal(normalizeUsername('Raisa Islam'), 'raisaislam');
  assert.equal(normalizeUsername('tahmid_07'), 'tahmid_07');
  assert.equal(normalizeUsername(''), '');
  assert.equal(normalizeUsername(null), '');
});

test('usable names pass; each rule reports its own Bengali message', () => {
  for (const ok of ['raisa.islam', 'tahmid_07', 'sadia', 'a1.b', 'x'.repeat(USERNAME_MAX)]) assert.equal(isValidUsername(ok), true, ok);
  assert.match(usernameError(''), /ইউজারনেম দিন/);
  assert.match(usernameError('abc'), /৪–২০ অক্ষরের/); // Bengali digits, like the rest of the UI
  assert.match(usernameError('x'.repeat(USERNAME_MAX + 1)), /৪–২০ অক্ষরের/);
  assert.match(usernameError('7raisa'), /ইংরেজি অক্ষর দিয়ে শুরু/);
  assert.match(usernameError('rai-sa'), /ইংরেজি অক্ষর দিয়ে শুরু/);
  assert.match(usernameError('রাইসা'), /ইংরেজি অক্ষর দিয়ে শুরু/);
  for (const reserved of RESERVED_USERNAMES) assert.match(usernameError(reserved), /সংরক্ষিত/, reserved);
  // The payment counter ID can never be a student username.
  assert.equal(isValidUsername('apc-pay-001'), false);
});

test('a username can be suggested from the English name and stays valid', () => {
  assert.equal(suggestUsername('Raisa Islam'), 'raisa.islam');
  assert.equal(suggestUsername('  Tahmid   Hasan ', ''), 'tahmid.hasan');
  assert.equal(isValidUsername(suggestUsername('7up Kid')), true);
  assert.equal(isValidUsername(suggestUsername('রাইসা ইসলাম')), true);
  assert.equal(isValidUsername(suggestUsername('')), true);
  assert.ok(suggestUsername('A'.repeat(60)).length <= USERNAME_MAX);
});

test('an account keeps the first username forever', () => {
  const created = protectAccountIdentity({ mobile: '01711223344', username: 'Raisa.Islam', student: { id: 'S-1' } });
  assert.equal(created.username, 'raisa.islam');
  assert.equal(created.student.username, 'raisa.islam');

  const renamed = protectAccountIdentity({ ...created, username: 'hacker.name' }, created);
  assert.equal(renamed.username, 'raisa.islam');
  const cleared = protectAccountIdentity({ ...created, username: '' }, created);
  assert.equal(cleared.username, 'raisa.islam');
  assert.equal(cleared.student.username, 'raisa.islam');

  // An invalid or missing username never lands on the account.
  assert.equal(protectAccountIdentity({ mobile: '01711223344', username: 'admin' }).username, '');
  assert.equal(protectAccountIdentity({ mobile: '01711223344' }).username, '');

  // A legacy record that only stored it on the student is picked up.
  const legacy = protectAccountIdentity({ mobile: '01711223344', student: { id: 'S-2', username: 'legacy.name' } });
  assert.equal(protectAccountIdentity({ ...legacy, username: 'other' }, legacy).username, 'legacy.name');
});

test('storage keeps the username through saves and rewrites', async () => {
  setup();
  assert.equal(await saveAccount({ mobile: '01711223344', username: 'raisa.islam', pin: '123123', student: { id: 'S-1' } }), true);
  assert.equal(loadAccount().username, 'raisa.islam');
  assert.equal(await saveAccount({ ...loadAccount(), username: 'other.name', pin: '654321' }), true);
  const current = loadAccount();
  assert.equal(current.username, 'raisa.islam');
  // The PIN still changes — but only as a PBKDF2 hash, never as plaintext.
  assert.equal(current.pin, undefined);
  assert.equal(isPasswordRecord(current.pinHash), true);
  const { verifyAccountPassword } = await import('../js/storage.js');
  assert.equal(await verifyAccountPassword(current, '654321'), true);
  assert.equal(await verifyAccountPassword(current, '123123'), false);
  assert.equal(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.account)).username, 'raisa.islam');
});

test('two accounts on one device cannot claim the same username', () => {
  const store = setup();
  assert.equal(usernameTaken('raisa.islam'), false);
  assert.equal(reserveUsername('Raisa.Islam', 'S-1'), true);
  assert.equal(usernameOwner('raisa.islam'), 'S-1');
  assert.equal(usernameTaken('raisa.islam'), true);
  assert.equal(reserveUsername('raisa.islam', 'S-2'), false); // somebody else holds it
  assert.equal(reserveUsername('raisa.islam', 'S-1'), true); // the owner can re-save
  assert.equal(reserveUsername('', 'S-3'), false);
  assert.equal(releaseUsername('raisa.islam', 'S-2'), false); // not the owner
  assert.equal(usernameTaken('raisa.islam'), true);
  assert.equal(releaseUsername('raisa.islam', 'S-1'), true);
  assert.equal(usernameTaken('raisa.islam'), false);
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEYS.usernames)), {});
});
