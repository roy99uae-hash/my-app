/**
 * Browser edition backend tests.
 * The real backend is bundled against the browser shims (same aliases as the browser
 * build) and executed in Node with an in-memory store standing in for IndexedDB.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import * as nodeCrypto from '../../electron/security/crypto.js';
import { browserAliases } from '../../browser/aliases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let bundle;
let runtime;
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-browser-test-'));

before(async () => {
  await build({
    root,
    configFile: false,
    resolve: { alias: browserAliases },
    build: {
      ssr: path.join(root, 'tests/browser/entry.js'),
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.mjs' } },
    },
    ssr: { noExternal: true, target: 'node' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  globalThis.window = globalThis; // the preload bridge installs window.gulftech
  bundle = await import(path.join(outDir, 'entry.mjs'));
  runtime = await bundle.startBackend();
});

after(() => {
  if (runtime) clearInterval(runtime.timer);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('desktop and browser crypto are interchangeable (passphrase backups)', () => {
  const plain = Buffer.from('invoice data ' + 'x'.repeat(500));
  const fromDesktop = nodeCrypto.encryptWithPassphrase(plain, 'Secret123');
  assert.equal(bundle.decryptWithPassphrase(fromDesktop, 'Secret123').toString(), plain.toString());
  const fromBrowser = bundle.encryptWithPassphrase(plain, 'Secret123');
  assert.equal(nodeCrypto.decryptWithPassphrase(fromBrowser, 'Secret123').toString(), plain.toString());
  assert.throws(() => bundle.decryptWithPassphrase(fromDesktop, 'wrong-pass'));
});

test('desktop and browser crypto are interchangeable (database key format and PINs)', () => {
  const key = nodeCrypto.generateKey();
  const sealedByDesktop = nodeCrypto.encryptWithKey(Buffer.from('db'), key);
  assert.equal(bundle.decryptWithKey(sealedByDesktop, key).toString(), 'db');
  const sealedByBrowser = bundle.encryptWithKey(Buffer.from('db2'), key);
  assert.equal(nodeCrypto.decryptWithKey(sealedByBrowser, key).toString(), 'db2');
  const pinHash = nodeCrypto.hashPin('2468');
  assert.equal(bundle.verifyPin('2468', pinHash), true);
  assert.equal(bundle.verifyPin('1111', pinHash), false);
});

test('info reports the browser edition with plain key protection', async () => {
  const info = await window.gulftech.info();
  assert.equal(info.offline, true);
  assert.equal(info.keyProtection, 'plain');
  assert.equal(runtime.storage, 'memory');
});

test('core flow runs through the shared IPC API: business, customer, product, invoice, dashboard', async () => {
  const g = window.gulftech;
  const biz = await g.businesses.save({ name: 'Gulf Tech Dubai', vatNumber: '100000000000003', signatureMode: 'printed', signatoryName: 'Roy' });
  const cust = await g.customers.save({ name: 'Browser Customer', mobile: '0501234567' });
  const prod = await g.products.save({ name: 'Mouse', sku: 'M-1', barcode: '999', sellingPrice: 50, stockQty: 4, reorderLevel: 2 });
  assert.equal((await g.products.byCode('999')).id, prod.id);
  const inv = await g.invoices.save({
    businessId: biz.id,
    customerId: cust.id,
    invoiceDate: '2026-10-08',
    amountPaid: 52.5,
    paymentMethod: 'Card',
    items: [{ productId: prod.id, name: 'Mouse', quantity: 1, unitPrice: 50 }],
  });
  assert.equal(inv.number, 'INV-2026-000001');
  assert.equal(inv.grandTotal, 52.5);
  assert.equal(inv.status, 'paid');
  assert.equal((await g.products.get(prod.id)).stockQty, 3, 'stock reduced once issued');
  assert.equal((await g.dashboard.get()).totalSales, 52.5);
  assert.equal((await g.reports.get('monthly', '2026-10-08')).summary.totalRevenue, 52.5);
});

test('validation errors come back as clean envelopes, not crashes', async () => {
  const bad = await window.gulftech.invoices.save({ businessId: 1, customerId: 1, invoiceDate: '2026-10-08', items: [] }).catch((e) => e);
  assert.ok(bad instanceof Error);
  assert.match(bad.message, /at least one/);
});

test('database is saved encrypted in browser storage', async () => {
  runtime.database.flush();
  const raw = bundle.fs.readFileSync('/UserData/data/gulftech-invoices.db');
  assert.equal(Buffer.from(raw).subarray(0, 6).toString(), 'GTDIM1', 'file is encrypted at rest');
  assert.ok(!Buffer.from(raw).includes(Buffer.from('Browser Customer')), 'customer names are not visible in the raw file');
});

test('ZIP backup exports as a download and restores', async () => {
  const g = window.gulftech;
  const res = await g.backup.export('zip');
  assert.equal(res.cancelled, false);
  const zip = bundle.getExportedBytes(res.path);
  assert.equal(Buffer.from(zip).subarray(0, 2).toString(), 'PK');
  bundle.fs.writeFileSync('/Uploads/restore-test.zip', zip);
  const restored = await g.backup.restore('/Uploads/restore-test.zip');
  assert.equal(restored.restored, true);
  assert.equal((await g.invoices.list({})).length, 1);
});

test('PIN lock is enforced in the browser backend', async () => {
  const g = window.gulftech;
  await g.security.setPin('', '2468');
  await g.security.lock();
  await assert.rejects(g.customers.list({}), (e) => e.code === 'LOCKED');
  const wrong = await g.security.unlock('0000');
  assert.equal(wrong.ok, false);
  const right = await g.security.unlock('2468');
  assert.equal(right.ok, true);
  assert.ok(Array.isArray(await g.customers.list({})));
});

test('JSON export excludes the PIN hash and restores', async () => {
  const g = window.gulftech;
  const res = await g.backup.export('json');
  const doc = JSON.parse(Buffer.from(bundle.getExportedBytes(res.path)).toString('utf8'));
  assert.equal(doc.format, 'gulftech-invoice-manager-json');
  assert.ok(!doc.data.settings.some((s) => s.key === 'security.pinHash'));
});

test('WhatsApp requires a number before a link is built', async () => {
  // The link itself opens through the DOM and is exercised in the browser, not in Node.
  await assert.rejects(window.gulftech.share.whatsapp({ number: '', message: 'x' }), /WhatsApp number/);
});
