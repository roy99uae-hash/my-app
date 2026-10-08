import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppDatabase, loadSqlEngine } from '../electron/data/database.js';
import { createContainer } from '../electron/services/container.js';
import { registerHandlers, assertTrustedSender } from '../electron/ipc/registerHandlers.js';
import { generateKey } from '../electron/security/crypto.js';
import { OPEN_CHANNELS } from '../electron/ipc/channels.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let SQL;
before(async () => {
  SQL = await loadSqlEngine();
});

/** Fake ipcMain that records handlers so tests can invoke them like the renderer would. */
function fakeIpc() {
  const handlers = new Map();
  return {
    handle: (channel, fn) => handlers.set(channel, fn),
    invoke: (channel, payload, sender = 'app://local/index.html') =>
      handlers.get(channel)({ senderFrame: { url: sender } }, payload),
    channels: () => [...handlers.keys()],
  };
}

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtipc-'));
  const key = generateKey();
  const db = await AppDatabase.open({ SQL, filePath: path.join(dir, 'a.db'), key, saveDelayMs: 0 });
  const container = createContainer({
    db, SQL, key, userDataDir: dir,
    electron: { BrowserWindow: class {}, dialog: {}, shell: {} },
    now: () => new Date('2026-10-08T10:00:00Z'),
  });
  const ipcMain = fakeIpc();
  const session = { locked: false };
  registerHandlers({
    ipcMain,
    app: { getVersion: () => '1.0.0', getPath: () => dir },
    shell: {},
    clipboard: {},
    getWindow: () => null,
    container,
    session,
    dbPath: path.join(dir, 'a.db'),
    keyProtection: 'dpapi',
  });
  return { ipcMain, session, db, container, dir };
}

test('preload only calls channels that the main process registers', () => {
  const preload = fs.readFileSync(path.join(here, '..', 'electron', 'preload.cjs'), 'utf8');
  const used = [...preload.matchAll(/call\('([a-z]+:[A-Za-z:]+)'/g)].map((m) => m[1]);
  assert.ok(used.length > 40, 'expected many channels');
  const registered = fs.readFileSync(path.join(here, '..', 'electron', 'ipc', 'registerHandlers.js'), 'utf8');
  const missing = used.filter((c) => !registered.includes(`'${c}'`));
  assert.deepEqual(missing, []);
});

test('every open channel is registered', () => {
  const registered = fs.readFileSync(path.join(here, '..', 'electron', 'ipc', 'registerHandlers.js'), 'utf8');
  for (const c of OPEN_CHANNELS) assert.ok(registered.includes(`'${c}'`), c);
});

test('requests from untrusted origins are refused', async () => {
  const { ipcMain } = await setup();
  const res = await ipcMain.invoke('app:info', undefined, 'https://evil.example.com/');
  assert.equal(res.ok, false);
  assert.match(res.error, /Untrusted/);
});

test('data channels are refused while locked, and PIN unlock works', async () => {
  const { ipcMain, session, container } = await setup();
  container.services.security.setPin({ currentPin: '', newPin: '1357' });
  session.locked = true;
  const locked = await ipcMain.invoke('customer:list', {});
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'LOCKED');
  const wrong = await ipcMain.invoke('security:unlock', { pin: '0000' });
  assert.equal(wrong.ok, true);
  assert.equal(wrong.data.ok, false);
  const right = await ipcMain.invoke('security:unlock', { pin: '1357' });
  assert.equal(right.data.ok, true);
  assert.equal(session.locked, false);
  const after = await ipcMain.invoke('customer:list', {});
  assert.equal(after.ok, true);
});

test('end-to-end through IPC: create business, customer, product, invoice, dashboard, report', async () => {
  const { ipcMain, db } = await setup();
  const call = async (ch, p) => {
    const r = await ipcMain.invoke(ch, p);
    assert.equal(r.ok, true, `${ch}: ${r.error}`);
    return r.data;
  };
  const biz = await call('business:save', { name: 'Gulf Tech Dubai', vatNumber: '100000000000003', signatureMode: 'printed', signatoryName: 'Roy' });
  const cust = await call('customer:save', { name: 'Test Customer', mobile: '0501112222' });
  const prod = await call('product:save', { name: 'Mouse', sku: 'M-1', barcode: '111', sellingPrice: 50, stockQty: 4, reorderLevel: 2 });
  const found = await call('product:byCode', { code: '111' });
  assert.equal(found.id, prod.id);
  const inv = await call('invoice:save', {
    businessId: biz.id, customerId: cust.id, invoiceDate: '2026-10-08', amountPaid: 52.5, paymentMethod: 'Card',
    items: [{ productId: prod.id, name: 'Mouse', quantity: 1, unitPrice: 50 }],
  });
  assert.equal(inv.number, 'INV-2026-000001');
  assert.equal(inv.status, 'paid');
  const dash = await call('dashboard:get', {});
  assert.equal(dash.totalSales, 52.5);
  const rep = await call('report:get', { period: 'monthly', anchor: '2026-10-08' });
  assert.equal(rep.summary.totalRevenue, 52.5);
  const hist = await call('customer:history', { id: cust.id });
  assert.equal(hist.invoices.length, 1);
  const num = await call('invoice:previewNumber', {});
  assert.equal(num.number, 'INV-2026-000002');
  const bad = await ipcMain.invoke('invoice:save', { businessId: biz.id, customerId: cust.id, invoiceDate: '2026-10-08', items: [] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /at least one/);
  db.close();
});

test('share actions are limited to files generated in this session', async () => {
  const { ipcMain, db } = await setup();
  const r = await ipcMain.invoke('share:reveal', { path: '/etc/passwd' });
  assert.equal(r.ok, false);
  assert.match(r.error, /Only invoice PDFs/);
  db.close();
});

test('assertTrustedSender accepts only the app scheme', () => {
  assert.doesNotThrow(() => assertTrustedSender({ senderFrame: { url: 'app://local/index.html' } }));
  assert.throws(() => assertTrustedSender({ senderFrame: { url: 'file:///x.html' } }));
});
