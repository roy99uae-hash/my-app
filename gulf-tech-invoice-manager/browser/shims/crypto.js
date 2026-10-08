/**
 * Browser replacement for the parts of `node:crypto` used by the backend:
 * random bytes, scrypt key derivation, AES-256-GCM and timing-safe comparison.
 * Implemented with @noble/hashes and @noble/ciphers (pure JavaScript, synchronous),
 * so the existing synchronous crypto module works unchanged.
 */
import { Buffer } from 'buffer';
import { scrypt } from '@noble/hashes/scrypt.js';
import { gcm } from '@noble/ciphers/aes.js';

const toU8 = (v) => (typeof v === 'string' ? new TextEncoder().encode(v) : new Uint8Array(v));

export function randomBytes(n) {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n)));
}

export function scryptSync(password, salt, keylen, opts = {}) {
  const out = scrypt(toU8(password), toU8(salt), { N: opts.N, r: opts.r, p: opts.p, dkLen: keylen });
  return Buffer.from(out);
}

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Mirrors Node's cipher/decipher streaming interface for aes-256-gcm. */
class GcmStream {
  constructor(key, iv, decrypting) {
    if (key.length !== 32) throw new Error('Invalid key length');
    this.key = toU8(key);
    this.iv = toU8(iv);
    this.decrypting = decrypting;
    this.chunks = [];
    this.tag = null;
  }
  update(data) {
    this.chunks.push(toU8(data));
    return Buffer.alloc(0);
  }
  final() {
    const data = concat(this.chunks);
    this.chunks = [];
    const cipher = gcm(this.key, this.iv);
    if (!this.decrypting) {
      const out = cipher.encrypt(data);
      this.tag = Buffer.from(out.subarray(out.length - 16));
      return Buffer.from(out.subarray(0, out.length - 16));
    }
    if (!this.tag) throw new Error('Unsupported state: auth tag not set');
    // Throws when the authentication tag does not match (tampered or wrong key).
    return Buffer.from(cipher.decrypt(concat([data, this.tag])));
  }
  getAuthTag() {
    return this.tag;
  }
  setAuthTag(tag) {
    this.tag = toU8(tag);
  }
}

export function createCipheriv(algorithm, key, iv) {
  assertGcm(algorithm);
  return new GcmStream(key, iv, false);
}

export function createDecipheriv(algorithm, key, iv) {
  assertGcm(algorithm);
  return new GcmStream(key, iv, true);
}

function assertGcm(algorithm) {
  if (algorithm !== 'aes-256-gcm') throw new Error(`Unsupported cipher ${algorithm}`);
}

export function timingSafeEqual(a, b) {
  const x = toU8(a);
  const y = toU8(b);
  if (x.length !== y.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export default { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual };
