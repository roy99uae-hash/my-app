/**
 * Cryptographic helpers (Node.js built-in crypto only, no network).
 *
 *  - Data-at-rest encryption: AES-256-GCM with a random 256-bit key. The key is
 *    itself protected by the OS (Electron safeStorage / Windows DPAPI).
 *  - Password-protected backups: AES-256-GCM with a key derived via scrypt from a
 *    user passphrase, so a backup can be restored on another machine.
 *  - PIN hashing: scrypt with a random salt, verified in constant time.
 */
import crypto from 'node:crypto';

const DB_MAGIC = Buffer.from('GTDIM1'); // Gulf Tech Dubai Invoice Manager, format v1
const BACKUP_MAGIC = Buffer.from('GTBK1'); // password-protected backup container, format v1
const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

/** Generate a fresh 256-bit key. */
export function generateKey() {
  return crypto.randomBytes(32);
}

/**
 * Encrypt a buffer with AES-256-GCM.
 * Layout: MAGIC | iv(12) | tag(16) | ciphertext
 * @param {Buffer} plain
 * @param {Buffer} key 32 bytes
 * @param {Buffer} magic
 */
export function encryptWithKey(plain, key, magic = DB_MAGIC) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ct]);
}

/**
 * Decrypt a buffer produced by encryptWithKey. Throws on wrong key or tampering.
 * @param {Buffer} data
 * @param {Buffer} key
 * @param {Buffer} magic
 */
export function decryptWithKey(data, key, magic = DB_MAGIC) {
  if (!hasMagic(data, magic)) throw new Error('Unrecognised encrypted file format.');
  const offset = magic.length;
  const iv = data.subarray(offset, offset + 12);
  const tag = data.subarray(offset + 12, offset + 28);
  const ct = data.subarray(offset + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Decryption failed: the data is corrupted or the key is wrong.');
  }
}

/** True when the buffer starts with the encrypted-database magic header. */
export function isEncryptedDatabase(buf) {
  return hasMagic(buf, DB_MAGIC);
}

/** True when the buffer is a password-protected backup container. */
export function isPasswordBackup(buf) {
  return hasMagic(buf, BACKUP_MAGIC);
}

/**
 * Encrypt arbitrary bytes with a passphrase (for backup files).
 * Layout: MAGIC | salt(16) | iv(12) | tag(16) | ciphertext
 * @param {Buffer} plain
 * @param {string} passphrase
 */
export function encryptWithPassphrase(plain, passphrase) {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, salt, iv, cipher.getAuthTag(), ct]);
}

/**
 * Decrypt a password-protected backup container.
 * @param {Buffer} data
 * @param {string} passphrase
 */
export function decryptWithPassphrase(data, passphrase) {
  if (!hasMagic(data, BACKUP_MAGIC)) throw new Error('Not a password-protected backup file.');
  const o = BACKUP_MAGIC.length;
  const salt = data.subarray(o, o + 16);
  const iv = data.subarray(o + 16, o + 28);
  const tag = data.subarray(o + 28, o + 44);
  const ct = data.subarray(o + 44);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('Wrong password or corrupted backup file.');
  }
}

/**
 * Hash a PIN for storage. Format: scrypt$<saltHex>$<hashHex>
 * @param {string} pin
 */
export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Verify a PIN against a stored hash in constant time.
 * @param {string} pin
 * @param {string} stored
 */
export function verifyPin(pin, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pin), Buffer.from(saltHex, 'hex'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(actual, expected);
}

/** Validate PIN format: 4 to 8 digits. */
export function isValidPinFormat(pin) {
  return /^\d{4,8}$/.test(String(pin || ''));
}

function deriveKey(passphrase, salt) {
  if (!passphrase) throw new Error('A passphrase is required.');
  return crypto.scryptSync(String(passphrase), salt, 32, SCRYPT_PARAMS);
}

function hasMagic(buf, magic) {
  return Buffer.isBuffer(buf) && buf.length > magic.length && buf.subarray(0, magic.length).equals(magic);
}
