/** Test bundle entry: the browser backend plus the crypto and fs helpers it exposes. */
export { startBackend } from '../../browser/backend.js';
export { default as fs, getExportedBytes } from '../../browser/shims/fs.js';
export { encryptWithPassphrase, decryptWithPassphrase, encryptWithKey, decryptWithKey, hashPin, verifyPin } from '../../electron/security/crypto.js';
