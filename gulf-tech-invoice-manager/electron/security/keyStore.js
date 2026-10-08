/**
 * Database key management.
 *
 * A random 256-bit key encrypts the database file. The key itself is stored in
 * `keystore.json`, wrapped by Electron's safeStorage (Windows DPAPI, bound to the
 * Windows user account). Copying the data folder to another user or computer
 * therefore does not expose the data.
 *
 * If safeStorage is unavailable (rare, e.g. a stripped-down Linux desktop), the key
 * is stored unwrapped with restrictive file permissions and the protection level is
 * reported to the UI so the administrator is aware.
 */
import fs from 'node:fs';
import path from 'node:path';
import { generateKey } from './crypto.js';

/**
 * @param {Object} opts
 * @param {string} opts.dir        Directory for keystore.json
 * @param {*} opts.safeStorage     Electron safeStorage (or a test double)
 * @returns {{key: Buffer, protection: 'dpapi'|'plain', created: boolean}}
 */
export function loadOrCreateKey({ dir, safeStorage }) {
  const file = path.join(dir, 'keystore.json');
  const available = !!safeStorage && safeStorage.isEncryptionAvailable();

  if (fs.existsSync(file)) {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (record.protection === 'dpapi') {
      if (!available) {
        throw new Error('The database key is protected by Windows and cannot be opened in this session.');
      }
      const raw = safeStorage.decryptString(Buffer.from(record.data, 'base64'));
      return { key: Buffer.from(raw, 'base64'), protection: 'dpapi', created: false };
    }
    return { key: Buffer.from(record.data, 'base64'), protection: 'plain', created: false };
  }

  fs.mkdirSync(dir, { recursive: true });
  const key = generateKey();
  let record;
  if (available) {
    record = { version: 1, protection: 'dpapi', data: safeStorage.encryptString(key.toString('base64')).toString('base64') };
  } else {
    record = { version: 1, protection: 'plain', data: key.toString('base64') };
  }
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  return { key, protection: record.protection, created: true };
}
