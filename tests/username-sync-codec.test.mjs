import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeUsernameKey, encodeUsernameRegistry, decodeUsernameRegistry } from '../js/username-sync-codec.js';

test('generated Login IDs use Firebase-safe wire keys without changing the ID', () => {
  const local = { 'test.admin.apc': 'staff:admin', 'rahim.teacher.apc': 'staff:STF-0005', dolon: 'student' };
  const wire = encodeUsernameRegistry(local);
  assert.equal(wire['test%2Eadmin%2Eapc'], 'staff:admin');
  assert.equal(wire['test.admin.apc'], undefined);
  assert.deepEqual(decodeUsernameRegistry(wire), local);
  assert.equal(local['test.admin.apc'], 'staff:admin');
});

test('key encoding escapes all forbidden characters and avoids percent collisions', () => {
  const names = ['a.b', 'a%2Eb', 'a#b$c/d[e]', 'a\u0000b\u001fc\u007f', 'বাংলা', 'plain_name'];
  const registry = Object.fromEntries(names.map(name => [name, 'owner']));
  const wire = encodeUsernameRegistry(registry);
  assert.equal(Object.keys(wire).length, names.length);
  for (const key of Object.keys(wire)) assert.doesNotMatch(key, /[.#$\[\]/\u0000-\u001f\u007f]/);
  assert.deepEqual(decodeUsernameRegistry(wire), registry);
  assert.notEqual(encodeUsernameKey('a.b'), encodeUsernameKey('a%2Eb'));
});

test('decoding retains legacy unencoded valid keys and tolerates malformed escapes', () => {
  assert.deepEqual(decodeUsernameRegistry({ dolon: 'student', 'odd%name': 'owner' }),
    { dolon: 'student', 'odd%name': 'owner' });
  assert.deepEqual(decodeUsernameRegistry({}), {});
});
