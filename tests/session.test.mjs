/* Session records: random token, device binding, expiry. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionRecord, isSessionRecordValid, getDeviceId, sessionRemainingDays, newSessionToken, DAY_MS } from '../js/session.js';

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

test('the device id is stable for a browser and random per browser', () => {
  const store = freshBrowser();
  const first = getDeviceId();
  assert.equal(getDeviceId(), first, 'the id is remembered');
  assert.equal(store.get('activePlus.device.v1'), first);
  freshBrowser();
  assert.notEqual(getDeviceId(), first, 'a new browser gets a new id');
});

test('tokens are unique random strings', () => {
  freshBrowser();
  const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken()));
  assert.equal(tokens.size, 50);
  for (const token of tokens) assert.equal(token.length >= 16, true);
});

test('a fresh session record is valid, bound to this device and expires on time', () => {
  freshBrowser();
  const now = Date.now();
  const record = buildSessionRecord({ owner: 'student', ttlDays: 90, now });
  assert.equal(record.deviceId, getDeviceId());
  assert.equal(record.owner, 'student');
  assert.equal(record.issuedAt, now);
  assert.equal(record.expiry, now + 90 * DAY_MS);
  assert.equal(isSessionRecordValid(record, { now }), true);
  assert.equal(isSessionRecordValid(record, { now: now + 89 * DAY_MS }), true);
  assert.equal(isSessionRecordValid(record, { now: now + 91 * DAY_MS }), false);
  assert.equal(sessionRemainingDays(record, { now }), 90);
});

test('a record from another device never validates', () => {
  freshBrowser();
  const now = Date.now();
  const foreign = { ...buildSessionRecord({ owner: 'student', now }), deviceId: 'someone-else' };
  assert.equal(isSessionRecordValid(foreign, { now }), false);
  assert.equal(isSessionRecordValid({ ...buildSessionRecord({ now }), token: '' }, { now }), false);
  assert.equal(isSessionRecordValid({ ...buildSessionRecord({ now }), expiry: 'soon' }, { now }), false);
  assert.equal(isSessionRecordValid(null), false);
  assert.equal(isSessionRecordValid('nope'), false);
});

test('a session survives being serialised and parsed again', () => {
  freshBrowser();
  const record = JSON.parse(JSON.stringify(buildSessionRecord({ owner: 'payment.apc', ttlDays: 1 })));
  assert.equal(isSessionRecordValid(record), true);
});
