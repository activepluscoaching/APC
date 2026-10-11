/* Password hashing for every account on this device.
   PBKDF2-HMAC-SHA256 with a per-password random salt; the plaintext password
   is never written to storage. Web Crypto (crypto.subtle) is used whenever the
   page runs in a secure context; on plain http (a coaching-centre LAN, for
   example) the same PBKDF2 construction runs in a small pure-JS fallback so
   passwords are hashed everywhere — never stored as text. Records are
   portable: both paths produce and verify the identical format, so a record
   written on one device verifies on another. */

const RECORD_VERSION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/* OWASP-grade work factor where the platform can afford it, and a lighter
   (still strong) work factor for the pure-JS path. The count is stored in
   every record, so verification always uses the count the password was
   created with. */
const ITERATIONS_SUBTLE = 600000;
const ITERATIONS_FALLBACK = 60000;

const subtle = () => {
  const webcrypto = globalThis.crypto;
  return webcrypto && webcrypto.subtle ? webcrypto.subtle : null;
};

const hasSubtle = () => Boolean(subtle());

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

/* ---------- Pure-JS SHA-256 / HMAC / PBKDF2 (fallback path) ---------- */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const rotr = (value, bits) => (value >>> bits) | (value << (32 - bits));

function sha256Bytes(message) {
  const bitLength = message.length * 8;
  const padded = new Uint8Array(Math.ceil((message.length + 9) / 64) * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(block + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const digest = new Uint8Array(32);
  const out = new DataView(digest.buffer);
  h.forEach((word, index) => out.setUint32(index * 4, word, false));
  return digest;
}

function hmacSha256(key, message) {
  const blockKey = new Uint8Array(64);
  blockKey.set(key.length > 64 ? sha256Bytes(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i += 1) {
    inner[i] = blockKey[i] ^ 0x36;
    outer[i] = blockKey[i] ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(sha256Bytes(inner), 64);
  return sha256Bytes(outer);
}

function pbkdf2Fallback(password, salt, iterations, keyBytes) {
  const passwordBytes = new TextEncoder().encode(String(password));
  const blocks = Math.ceil(keyBytes / 32);
  const output = new Uint8Array(blocks * 32);
  for (let block = 1; block <= blocks; block += 1) {
    const salted = new Uint8Array(salt.length + 4);
    salted.set(salt);
    new DataView(salted.buffer).setUint32(salt.length, block, false);
    let previous = hmacSha256(passwordBytes, salted);
    const chunk = previous.slice();
    for (let iteration = 1; iteration < iterations; iteration += 1) {
      previous = hmacSha256(passwordBytes, previous);
      for (let i = 0; i < 32; i += 1) chunk[i] ^= previous[i];
    }
    output.set(chunk, (block - 1) * 32);
  }
  return output.slice(0, keyBytes);
}

/* ---------- PBKDF2 entry points ---------- */

async function derive(password, salt, iterations, keyBytes) {
  const webcrypto = globalThis.crypto;
  if (webcrypto && webcrypto.subtle && typeof webcrypto.subtle.importKey === 'function') {
    try {
      const key = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(String(password)), 'PBKDF2', false, ['deriveBits']);
      const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, keyBytes * 8);
      return new Uint8Array(bits);
    } catch { /* fall through to the portable implementation */ }
  }
  return pbkdf2Fallback(password, salt, iterations, keyBytes);
}

/** Shape check: a stored record, not a legacy plaintext password. */
export function isPasswordRecord(value) {
  const record = value;
  return Boolean(record && typeof record === 'object' && !Array.isArray(record)
    && record.algo === 'PBKDF2' && record.hash === 'SHA-256'
    && Number.isInteger(record.iterations) && record.iterations > 0
    && typeof record.salt === 'string' && typeof record.digest === 'string'
    && record.salt.length >= SALT_BYTES * 2 && record.digest.length === KEY_BYTES * 2);
}

/** A stored record older than the current work factor. */
export function passwordNeedsUpgrade(record) {
  if (!isPasswordRecord(record)) return true;
  const target = hasSubtle() ? ITERATIONS_SUBTLE : ITERATIONS_FALLBACK;
  return record.iterations < target;
}

export async function hashPassword(password) {
  const text = String(password ?? '');
  const salt = randomBytes(SALT_BYTES);
  const iterations = hasSubtle() ? ITERATIONS_SUBTLE : ITERATIONS_FALLBACK;
  const digest = await derive(text, salt, iterations, KEY_BYTES);
  return {
    v: RECORD_VERSION,
    algo: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: toHex(salt),
    digest: toHex(digest)
  };
}

/** Length-safe, value-independent comparison. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, record) {
  if (!isPasswordRecord(record)) return false;
  const salt = fromHex(record.salt);
  if (!salt.length) return false;
  const digest = await derive(String(password ?? ''), salt, record.iterations, KEY_BYTES);
  return timingSafeEqual(toHex(digest), record.digest);
}

export const PASSWORD_HASH_INFO = Object.freeze({
  algo: 'PBKDF2', hash: 'SHA-256', saltBytes: SALT_BYTES, keyBytes: KEY_BYTES,
  iterationsSubtle: ITERATIONS_SUBTLE, iterationsFallback: ITERATIONS_FALLBACK
});
