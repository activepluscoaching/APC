/* Password policy contract (Step 2 of the security review):
   • registration with an empty password shows a Bengali error — it never
     falls through to a built-in default;
   • the Admin/Manager reset dialogs accept a typed 4–6 digit password, and a
     RANDOM 6-digit password is generated (shown once) when the field is
     empty;
   • no module ships a DEFAULT_PIN constant or the retired 123123 default. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  registrationPasswordError, randomNumericPassword, resolveResetPassword,
  EMPTY_PASSWORD_ERROR, PASSWORD_SHAPE_ERROR, PASSWORD_MISMATCH_ERROR
} from '../js/password-policy.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('registration rejects an empty password with a Bengali error', () => {
  assert.equal(registrationPasswordError('', ''), EMPTY_PASSWORD_ERROR);
  assert.equal(registrationPasswordError('   ', '   '), EMPTY_PASSWORD_ERROR);
  assert.equal(registrationPasswordError(null, null), EMPTY_PASSWORD_ERROR);
  assert.notEqual(EMPTY_PASSWORD_ERROR, '');
  assert.match(EMPTY_PASSWORD_ERROR, /[\u0980-\u09FF]/); // written in Bengali
});

test('registration still enforces 4–6 digits and a matching confirmation', () => {
  assert.equal(registrationPasswordError('1234', '1234'), '');
  assert.equal(registrationPasswordError('123456', '123456'), '');
  assert.equal(registrationPasswordError('123', '123'), PASSWORD_SHAPE_ERROR);
  assert.equal(registrationPasswordError('1234567', '1234567'), PASSWORD_SHAPE_ERROR);
  assert.equal(registrationPasswordError('12ab', '12ab'), PASSWORD_SHAPE_ERROR);
  assert.equal(registrationPasswordError('1234', '1235'), PASSWORD_MISMATCH_ERROR);
});

test('randomNumericPassword returns exactly 6 digits when asked', () => {
  for (let i = 0; i < 20; i += 1) {
    const password = randomNumericPassword(6);
    assert.match(password, /^\d{6}$/);
    assert.ok(Number(password) >= 100000 && Number(password) <= 999999);
  }
  assert.match(randomNumericPassword(), /^\d{6}$/);
});

test('an empty reset field generates a random password for one-time display', () => {
  for (const empty of ['', '   ', null, undefined]) {
    const resolved = resolveResetPassword(empty);
    assert.equal(resolved.generated, true);
    assert.equal(resolved.error, '');
    assert.match(resolved.password, /^\d{6}$/);
  }
});

test('a typed reset password is used as-is; bad shapes are refused', () => {
  assert.deepEqual(resolveResetPassword('246810'), { password: '246810', generated: false, error: '' });
  assert.equal(resolveResetPassword('12').error, PASSWORD_SHAPE_ERROR);
  assert.equal(resolveResetPassword('abcdef').error, PASSWORD_SHAPE_ERROR);
  assert.equal(resolveResetPassword('1234567').error, PASSWORD_SHAPE_ERROR);
});

test('no module ships the retired DEFAULT_PIN / 123123 default', () => {
  for (const file of ['js/config.js', 'js/storage.js', 'js/admin.js', 'js/manager.js', 'js/register.js']) {
    assert.doesNotMatch(read(file), /DEFAULT_PIN/, `${file} still references DEFAULT_PIN`);
    assert.doesNotMatch(read(file), /123123/, `${file} still hard-codes 123123`);
  }
});

test('registration routes the empty password through the policy error', () => {
  assert.match(read('js/register.js'), /registrationPasswordError\(pin, pinConfirm\)/);
});

test('the reset dialogs resolve empty input to a generated one-time password', () => {
  const admin = read('js/admin.js');
  const manager = read('js/manager.js');
  for (const [name, source, box] of [
    ['admin.js', admin, 'pinResetBox'],
    ['manager.js', manager, 'managerPinBox']
  ]) {
    assert.match(source, /resolveResetPassword\(.*\.value\)/, `${name} resolves the reset input`);
    assert.match(source, /resolved\.generated/, `${name} branches on generated passwords`);
    assert.ok(source.includes(box), `${name} has the one-time display box`);
    assert.match(source, /একবারই দেখানো হচ্ছে/, `${name} warns that the password shows only once`);
    assert.doesNotMatch(source, /pin: DEFAULT_PIN|pin: '123123'/, `${name} never applies a default pin`);
  }
});
