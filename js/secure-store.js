/* Encryption at rest for the sensitive device records (accounts and sessions).
   The key never leaves the device: a random AES-GCM key is generated once and
   kept in this browser's storage, so a copied or synced storage blob without
   the key is unreadable. This is the strongest protection a static, offline-
   first page can offer — it does not replace the server-side security that
   arrives with Firebase (Phase 3). When Web Crypto is unavailable (plain http
   on a LAN, very old browsers) callers fall back to storing records that
   contain only PBKDF2 hashes, never a plaintext password. */

const KEY_STORAGE = 'activePlus.deviceKey.v1';
const RECORD_VERSION = 1;

function localStore() {
  try { return window.localStorage; } catch { return null; }
}

function subtle() {
  const webcrypto = globalThis.crypto;
  return webcrypto && webcrypto.subtle ? webcrypto.subtle : null;
}

export function canEncrypt() {
  const api = subtle();
  return Boolean(api && typeof api.importKey === 'function' && typeof api.encrypt === 'function');
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  const webcrypto = globalThis.crypto;
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const fromHex = text => {
  const clean = String(text || '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

/** Device-bound AES-GCM key, created on first use. */
async function deviceKey() {
  const store = localStore();
  if (!store) return null;
  let hex = store.getItem(KEY_STORAGE);
  if (!hex) {
    hex = toHex(randomBytes(32));
    store.setItem(KEY_STORAGE, hex);
  }
  const api = subtle();
  if (!api) return null;
  try {
    return await api.importKey('raw', fromHex(hex), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

/** { v, iv, data } envelope, or null when the platform cannot encrypt. */
export async function encryptValue(plaintext) {
  if (!canEncrypt()) return null;
  const key = await deviceKey();
  if (!key) return null;
  const iv = randomBytes(12);
  try {
    const encoded = new TextEncoder().encode(String(plaintext));
    const buffer = await subtle().encrypt({ name: 'AES-GCM', iv }, key, encoded);
    return { v: RECORD_VERSION, iv: toHex(iv), data: toHex(new Uint8Array(buffer)) };
  } catch {
    return null;
  }
}

/** Plaintext string, or null when the envelope is missing or tampered with. */
export async function decryptValue(envelope) {
  if (!envelope || typeof envelope !== 'object' || typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') return null;
  if (!canEncrypt()) return null;
  const key = await deviceKey();
  if (!key) return null;
  try {
    const buffer = await subtle().decrypt({ name: 'AES-GCM', iv: fromHex(envelope.iv) }, key, fromHex(envelope.data));
    return new TextDecoder().decode(buffer);
  } catch {
    return null;
  }
}

export function isEncryptedEnvelope(value) {
  return Boolean(value && typeof value === 'object' && typeof value.iv === 'string' && typeof value.data === 'string');
}
