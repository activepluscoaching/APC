/* Session records: random token + device binding + expiry.
   A session is only valid when the token matches, the device id matches the
   device that signed in, and the expiry is still in the future. Copying the
   stored record to another browser (or another phone) fails the device check,
   and an old record expires on its own. */

const DEVICE_ID_KEY = 'activePlus.device.v1';

function localStore() {
  try { return window.localStorage; } catch { return null; }
}

const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

function randomId() {
  const webcrypto = globalThis.crypto;
  if (webcrypto && typeof webcrypto.randomUUID === 'function') return webcrypto.randomUUID();
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    return toHex(webcrypto.getRandomValues(new Uint8Array(16)));
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Stable per-device identifier; created once and kept in localStorage. */
export function getDeviceId() {
  const store = localStore();
  if (!store) return 'device-unavailable';
  let id = store.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomId();
    try { store.setItem(DEVICE_ID_KEY, id); } catch { /* storage blocked */ }
  }
  return id;
}

export const DAY_MS = 86400000;

export function newSessionToken() {
  return randomId();
}

/** A fresh session record for this device. */
export function buildSessionRecord({ owner = '', ttlDays = 90, now = Date.now() } = {}) {
  return {
    token: newSessionToken(),
    deviceId: getDeviceId(),
    owner: String(owner || ''),
    issuedAt: now,
    expiry: now + ttlDays * DAY_MS
  };
}

export function isSessionRecordValid(record, { now = Date.now() } = {}) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.token !== 'string' || !record.token) return false;
  if (record.deviceId !== getDeviceId()) return false;
  if (!Number.isFinite(record.expiry)) return false;
  return now < record.expiry;
}

/** Remaining lifetime in days, for tests and diagnostics. */
export function sessionRemainingDays(record, { now = Date.now() } = {}) {
  if (!record || !Number.isFinite(record.expiry)) return 0;
  return Math.max(0, (record.expiry - now) / DAY_MS);
}
