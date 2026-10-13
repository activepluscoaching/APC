/* Password hashing for every account on this device.
   PBKDF2-HMAC-SHA256 with a per-password random salt; the plaintext password
   is never written to storage. */
import { pbkdf2, toHex, fromHex } from './password-hash-worker.js';

const ITERATIONS_SUBTLE = 600000;
const ITERATIONS_FALLBACK = 60000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

export const PASSWORD_HASH_INFO = Object.freeze({
  v: 1,
  algo: 'PBKDF2',
  hash: 'SHA-256',
  iterationsSubtle: ITERATIONS_SUBTLE,
  iterationsFallback: ITERATIONS_FALLBACK,
  saltBytes: SALT_BYTES,
  keyBytes: KEY_BYTES
});

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function hasSubtle() {
  return Boolean(globalThis.crypto?.subtle?.importKey && globalThis.crypto?.subtle?.deriveBits);
}

let workerInstance = null;
let workerFailed = false;
let workerSeq = 0;
const workerPending = new Map();

function runInWorker(password, saltHex, iterations, keyBytes) {
  if (workerFailed || typeof Worker !== 'function') return null;
  try {
    if (!workerInstance) {
      workerInstance = new Worker(new URL('./password-hash-worker.js', import.meta.url), { type: 'module' });
      workerInstance.onmessage = event => {
        const { id, ok, digestHex, error } = event.data || {};
        const waiter = workerPending.get(id);
        if (!waiter) return;
        workerPending.delete(id);
        if (ok) waiter.resolve(digestHex);
        else waiter.reject(new Error(error || 'PBKDF2 worker failed'));
      };
      workerInstance.onerror = () => {
        workerFailed = true;
        for (const waiter of workerPending.values()) waiter.reject(new Error('Worker error'));
        workerPending.clear();
      };
    }
    const id = ++workerSeq;
    return new Promise((resolve, reject) => {
      workerPending.set(id, { resolve, reject });
      workerInstance.postMessage({ id, password: String(password), saltHex, iterations, keyBytes });
    });
  } catch {
    workerFailed = true;
    return null;
  }
}

async function deriveDigestHex(password, saltHex, iterations, keyBytes = KEY_BYTES) {
  const salt = fromHex(saltHex);
  if (hasSubtle()) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(String(password)),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      keyBytes * 8
    );
    return toHex(new Uint8Array(bits));
  }
  const workerPromise = runInWorker(password, saltHex, iterations, keyBytes);
  if (workerPromise) {
    try { return await workerPromise; } catch { /* fall back to inline pbkdf2 */ }
  }
  return toHex(pbkdf2(String(password), salt, iterations, keyBytes));
}

export async function hashPassword(password) {
  const text = String(password ?? '');
  if (!text) throw new Error('পাসওয়ার্ড খালি রাখা যাবে না।');
  const saltHex = toHex(randomBytes(SALT_BYTES));
  const iterations = hasSubtle() ? ITERATIONS_SUBTLE : ITERATIONS_FALLBACK;
  const digest = await deriveDigestHex(text, saltHex, iterations, KEY_BYTES);
  return {
    v: 1,
    algo: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: saltHex,
    digest
  };
}

export function isPasswordRecord(record) {
  return Boolean(record && typeof record === 'object' && !Array.isArray(record)
    && record.algo === 'PBKDF2' && record.hash === 'SHA-256'
    && Number.isInteger(record.iterations) && record.iterations > 0
    && typeof record.salt === 'string' && typeof record.digest === 'string'
    && record.salt.length >= SALT_BYTES * 2 && record.digest.length === KEY_BYTES * 2);
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, record) {
  if (typeof password !== 'string' || !password || !isPasswordRecord(record)) return false;
  try {
    const derived = await deriveDigestHex(password, record.salt.toLowerCase(), Number(record.iterations), KEY_BYTES);
    return timingSafeEqualHex(derived.toLowerCase(), record.digest.toLowerCase());
  } catch {
    return false;
  }
}

export function passwordNeedsUpgrade(record) {
  if (!isPasswordRecord(record)) return true;
  const target = hasSubtle() ? ITERATIONS_SUBTLE : ITERATIONS_FALLBACK;
  return Number(record.iterations) < target;
}
