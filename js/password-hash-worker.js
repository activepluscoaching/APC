/* Portable PBKDF2-HMAC-SHA256 core for password-hash.js — the pure-JS
   fallback used on plain-http pages (a coaching-centre LAN) where Web Crypto
   is unavailable.

   This file is the ONE implementation of that core and it runs two ways:
     • imported inline (Node tests, engines without Worker), and
     • inside a module Web Worker (browsers), so a cheap phone's UI thread
       never freezes while a password hashes.
   Keep it dependency-free — it must load standalone in a Worker. */

export const toHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
export const fromHex = text => {
  const clean = String(text || '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
};

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

export function pbkdf2(password, salt, iterations, keyBytes) {
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


/* Worker protocol: { id, password, saltHex, iterations, keyBytes } in,
   { id, ok, digestHex | error } out. Attached only when this file is running
   inside an actual Worker (WorkerGlobalScope); Node and page imports just get
   the pbkdf2 export. */
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = event => {
    const { id, password, saltHex, iterations, keyBytes } = event.data || {};
    try {
      const digest = pbkdf2(password, fromHex(saltHex), Number(iterations), Number(keyBytes));
      self.postMessage({ id, ok: true, digestHex: toHex(digest) });
    } catch (error) {
      self.postMessage({ id, ok: false, error: String((error && error.message) || error) });
    }
  };
}
