import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKey, encryptWithKey, decryptWithKey, isEncryptedDatabase, encryptWithPassphrase,
  decryptWithPassphrase, isPasswordBackup, hashPin, verifyPin, isValidPinFormat,
} from '../electron/security/crypto.js';

test('AES-256-GCM round trip and tamper detection', () => {
  const key = generateKey();
  const plain = Buffer.from('invoice data '.repeat(50));
  const enc = encryptWithKey(plain, key);
  assert.ok(isEncryptedDatabase(enc));
  assert.ok(!enc.includes(Buffer.from('invoice data')));
  assert.deepEqual(decryptWithKey(enc, key), plain);
  const tampered = Buffer.from(enc);
  tampered[tampered.length - 1] ^= 0xff;
  assert.throws(() => decryptWithKey(tampered, key), /corrupted|wrong key/);
  assert.throws(() => decryptWithKey(enc, generateKey()), /corrupted|wrong key/);
});

test('password backup container round trip', () => {
  const data = Buffer.from('PK-like payload');
  const enc = encryptWithPassphrase(data, 'correct horse');
  assert.ok(isPasswordBackup(enc));
  assert.deepEqual(decryptWithPassphrase(enc, 'correct horse'), data);
  assert.throws(() => decryptWithPassphrase(enc, 'wrong'), /Wrong password/);
});

test('PIN hashing is salted and verifiable', () => {
  const h1 = hashPin('1234');
  const h2 = hashPin('1234');
  assert.notEqual(h1, h2);
  assert.ok(verifyPin('1234', h1));
  assert.ok(!verifyPin('4321', h1));
  assert.ok(!verifyPin('1234', null));
});

test('PIN format is 4 to 8 digits', () => {
  assert.ok(isValidPinFormat('1234'));
  assert.ok(isValidPinFormat('12345678'));
  assert.ok(!isValidPinFormat('123'));
  assert.ok(!isValidPinFormat('12a4'));
  assert.ok(!isValidPinFormat('123456789'));
});
