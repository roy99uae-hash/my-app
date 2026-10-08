import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadOrCreateKey } from '../electron/security/keyStore.js';

function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^enc:/, ''),
  };
}

test('key is created once, wrapped by safeStorage, and reloaded', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtkey-'));
  const first = loadOrCreateKey({ dir, safeStorage: fakeSafeStorage(true) });
  assert.equal(first.created, true);
  assert.equal(first.protection, 'dpapi');
  assert.equal(first.key.length, 32);
  const raw = fs.readFileSync(path.join(dir, 'keystore.json'), 'utf8');
  assert.ok(!raw.includes(first.key.toString('base64')), 'key must not be stored in clear text');
  const second = loadOrCreateKey({ dir, safeStorage: fakeSafeStorage(true) });
  assert.equal(second.created, false);
  assert.ok(second.key.equals(first.key));
});

test('falls back to plain storage when safeStorage is unavailable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtkey-'));
  const k = loadOrCreateKey({ dir, safeStorage: fakeSafeStorage(false) });
  assert.equal(k.protection, 'plain');
});

test('refuses to open a DPAPI key when protection is unavailable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtkey-'));
  loadOrCreateKey({ dir, safeStorage: fakeSafeStorage(true) });
  assert.throws(() => loadOrCreateKey({ dir, safeStorage: fakeSafeStorage(false) }), /protected by Windows/);
});
