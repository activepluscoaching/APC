import test from 'node:test';
import assert from 'node:assert/strict';
import { preferLocalCopy, recordTime } from '../js/sync-merge.js';

test('the copy with the newest timestamp wins, whichever side it is on', () => {
  const older = { id: 'dolon', pinHash: 'old', updatedAt: '2026-09-20T10:00:00.000Z' };
  const newer = { id: 'dolon', pinHash: 'new', updatedAt: '2026-09-29T10:00:00.000Z' };
  assert.equal(preferLocalCopy(newer, older), true, 'a change made offline must not be reverted');
  assert.equal(preferLocalCopy(older, newer), false, 'a newer cloud copy must be adopted');
});

test('identical and missing timestamps follow the caller rule', () => {
  const one = { pinHash: 'a' };
  const two = { pinHash: 'b' };
  assert.equal(preferLocalCopy(one, two), true, 'a student keeps the copy verified on this device');
  assert.equal(preferLocalCopy(one, two, { localWinsTie: false }), false, 'staff keeps the long-standing cloud-first rule');
  assert.equal(preferLocalCopy(one, null), true, 'nothing in the cloud to prefer');
  assert.equal(preferLocalCopy(null, one), false, 'no local record to keep');
});

test('a record that belongs to another login ID is never preferred', () => {
  const mine = { username: 'dolon', updatedAt: '2026-09-29T10:00:00.000Z' };
  const theirs = { username: 'raisa', updatedAt: '2026-09-20T10:00:00.000Z' };
  const sameRecord = record => record?.username === 'dolon';
  assert.equal(preferLocalCopy(mine, theirs, { sameRecord }), false);
  assert.equal(preferLocalCopy(mine, { username: 'dolon' }, { sameRecord }), true);
});

test('an unparsable timestamp counts as "no timestamp" instead of NaN', () => {
  assert.equal(recordTime({ updatedAt: 'not a date' }), 0);
  assert.equal(recordTime({}), 0);
  assert.equal(recordTime(null), 0);
  assert.equal(recordTime({ updatedAt: '2026-09-29T10:00:00.000Z' }) > 0, true);
});

/* ---- staff and student copy decisions (added by audit round 3) ---- */
import { chooseStaffCopy, chooseStudentCopy, sameStudentRecord, loginIdOf } from '../js/sync-merge.js';

// The exact shape js/password-hash.js accepts (algo/hash/iterations/salt/digest).
const hash = marker => ({
  algo: 'PBKDF2', hash: 'SHA-256', iterations: 150000,
  salt: String(marker).padEnd(32, '0').slice(0, 32),
  digest: String(marker).padEnd(64, '0').slice(0, 64)
});
const staff = (username, { at = '2026-09-01T00:00:00.000Z', mustChange = false } = {}) =>
  ({ username, password: hash(username), updatedAt: at, mustChangePassword: mustChange });
const student = (id, { at = '2026-09-01T00:00:00.000Z', mobile = '01711111111' } = {}) =>
  ({ username: 'dolon', student: { id }, registrationMobile: mobile, pinHash: hash(id), updatedAt: at });

test('two different Admin usernames are a conflict, never a takeover', () => {
  const real = staff('rasal.admin.apc', { at: '2026-09-01T00:00:00.000Z' });
  const fake = staff('fake.admin.apc', { at: '2026-09-29T00:00:00.000Z' });
  assert.equal(chooseStaffCopy(fake, real, { role: 'admin' }), 'conflict', 'the real Admin survives');
  assert.equal(chooseStaffCopy(real, fake, { role: 'admin' }), 'conflict', 'in both directions');
});

test('a fresh default account never overrides a real cloud account', () => {
  const fresh = staff('teacher.apc', { at: '2026-09-29T00:00:00.000Z', mustChange: true });
  const real = staff('teacher.apc', { at: '2026-09-01T00:00:00.000Z', mustChange: false });
  assert.equal(chooseStaffCopy(fresh, real, { role: 'teacher' }), 'remote', 'newer timestamp does not win');
  const personalised = staff('teacher.apc', { at: '2026-09-29T00:00:00.000Z', mustChange: false });
  assert.equal(chooseStaffCopy(personalised, real, { role: 'teacher' }), 'local', 'a real offline change still uploads');
});

test('a student copy is only merged with the same person, and newest wins', () => {
  const older = student('s260929001');
  const newer = student('s260929001', { at: '2026-09-29T00:00:00.000Z' });
  assert.equal(chooseStudentCopy(newer, older), 'local');
  assert.equal(chooseStudentCopy(older, newer), 'remote');
  assert.equal(chooseStudentCopy(student('s260929002'), older), 'conflict', 'a different student never takes the ID');
  assert.equal(chooseStudentCopy(older, null), 'local', 'an empty cloud path is seeded');
  assert.equal(chooseStudentCopy(older, { username: 'dolon' }), 'local', 'a record without a password is not trusted');
});

test('two login records are the same student by id, or by mobile for legacy records', () => {
  assert.equal(sameStudentRecord(student('s1'), student('s1', { mobile: '01799999999' })), true);
  assert.equal(sameStudentRecord(student('s1'), student('s2')), false, 'different ids win over a shared mobile');
  const legacy = { username: 'dolon', registrationMobile: '01711111111', pinHash: hash('x') };
  assert.equal(sameStudentRecord(student('s1'), legacy), true, 'no id → the mobile decides');
  assert.equal(sameStudentRecord(student('s1'), { username: 'dolon', pinHash: hash('x') }), false);
  assert.equal(sameStudentRecord(null, legacy), false);
  assert.equal(loginIdOf({ student: { username: 'DoLoN' } }), 'dolon');
});

/* ---- login identifiers (added for the Student ID login) ---- */
import { matchesLoginIdentifier, findLoginMatches, studentIdOf, suggestIdentifiers } from '../js/sync-merge.js';

const rakib = {
  username: 'rakib', studentId: 's260929001-abcdef0123456789',
  student: { id: 's260929001-abcdef0123456789', username: 'rakib' },
  registrationMobile: '01755556666', pinHash: hash('rakib')
};
const raisa = {
  username: 'raisa', studentId: 's260929002-fedcba9876543210',
  student: { id: 's260929002-fedcba9876543210' }, registrationMobile: '01855556666', pinHash: hash('raisa')
};

test('a student may log in with the User ID, the mobile number or the Student ID', () => {
  assert.equal(matchesLoginIdentifier(rakib, 'rakib'), true, 'login User ID');
  assert.equal(matchesLoginIdentifier(rakib, 'Rakib'), true, 'the typed id is normalised');
  assert.equal(matchesLoginIdentifier(rakib, '01755556666'), true, 'registration mobile');
  assert.equal(matchesLoginIdentifier(rakib, '+8801755556666'), true, 'mobile in +88 form');
  assert.equal(matchesLoginIdentifier(rakib, 's260929001-abcdef0123456789'), true, 'full Student ID');
  assert.equal(matchesLoginIdentifier(rakib, 'S260929001-ABCDEF0123456789'), true, 'and in capitals');
  assert.equal(matchesLoginIdentifier(rakib, 'raisa'), false, 'another student never matches');
  assert.equal(matchesLoginIdentifier(rakib, '01855556666'), false, 'another mobile never matches');
  assert.equal(matchesLoginIdentifier(null, 'rakib'), false);
  assert.equal(matchesLoginIdentifier(rakib, ''), false);
});

test('the short Student ID works while exactly one student matches it', () => {
  assert.deepEqual(findLoginMatches([rakib, raisa], 's260929001').map(item => item.username), ['rakib']);
  assert.deepEqual(findLoginMatches([rakib, raisa], 's260929002-fedcba9876543210').map(item => item.username), ['raisa']);
  assert.equal(findLoginMatches([rakib, raisa], 's2609290').length, 2, 'a shared prefix finds both');
  assert.deepEqual(findLoginMatches([rakib, raisa], 's260929009'), [], 'an unknown ID finds nothing');
  assert.deepEqual(findLoginMatches([rakib], 'rakib').map(item => item.username), ['rakib'], 'an exact id is not a scan');
  assert.deepEqual(findLoginMatches([rakib], '01755556666').map(item => item.username), ['rakib'], 'phone numbers are exact');
  assert.deepEqual(findLoginMatches(null, 'rakib'), []);
  assert.equal(studentIdOf({ studentId: 's1' }), 's1', 'both storage shapes are read');
});

test('a typo in a login ID suggests the close cloud IDs, never the whole list', () => {
  assert.deepEqual(suggestIdentifiers([rakib, raisa], 'raki'), ['rakib']);
  assert.deepEqual(suggestIdentifiers([rakib, raisa], 'rakib.hasan'), ['rakib']);
  assert.deepEqual(suggestIdentifiers([rakib, raisa], 's2609'), [], 'a short id is not a suggestion source');
  assert.deepEqual(suggestIdentifiers([rakib, raisa], 'dolan'), [], 'nothing close means no guess');
  assert.deepEqual(suggestIdentifiers([rakib, raisa, { username: 'rakib2' }], 'rakib', 1), ['rakib2'], 'the limit is honoured');
  assert.deepEqual(suggestIdentifiers(null, 'rakib'), []);
});
