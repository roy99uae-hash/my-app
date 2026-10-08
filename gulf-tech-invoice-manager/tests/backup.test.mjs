import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase, loadSqlEngine } from '../electron/data/database.js';
import { createContainer } from '../electron/services/container.js';
import { generateKey } from '../electron/security/crypto.js';
import { formatStamp } from '../electron/services/backupService.js';

let SQL;
before(async () => {
  SQL = await loadSqlEngine();
});
const electronStub = { BrowserWindow: class {}, dialog: {}, shell: {} };

async function setup(dir, key = generateKey()) {
  const file = path.join(dir, 'app.db');
  const db = await AppDatabase.open({ SQL, filePath: file, key, saveDelayMs: 0 });
  const c = createContainer({
    db, SQL, key, userDataDir: dir, electron: electronStub,
    now: () => new Date('2026-10-08T09:30:00Z'),
  });
  return { db, file, key, ...c };
}

function populate(s) {
  const b = s.masterData.saveBusiness({ name: 'Gulf Tech Dubai', signatureMode: 'none' });
  const c = s.masterData.saveCustomer({ name: 'Customer One', mobile: '0501234567' });
  const p = s.masterData.saveProduct({ name: 'Keyboard', sku: 'KB-1', sellingPrice: 80, stockQty: 5, reorderLevel: 1 });
  const inv = s.invoices.save({ businessId: b.id, customerId: c.id, invoiceDate: '2026-10-08', paymentMethod: 'Cash', amountPaid: 50,
    items: [{ productId: p.id, name: 'Keyboard', quantity: 1, unitPrice: 80, vatRate: 5 }] });
  return { b, c, p, inv };
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gtbk-'));
}

test('ZIP export restores into an empty database with identical data', async () => {
  const src = await setup(tmp());
  const { inv } = populate(src.services);
  const zip = src.services.backup.exportBuffer('zip');
  assert.equal(zip.subarray(0, 2).toString(), 'PK');

  const dstDir = tmp();
  const dst = await setup(dstDir);
  const res = dst.services.backup.restore(zip);
  assert.equal(res.tables.invoices, 1);
  assert.equal(res.tables.customers, 1);
  const restored = dst.services.invoices.get(inv.id);
  assert.equal(restored.number, inv.number);
  assert.equal(restored.grandTotal, inv.grandTotal);
  assert.equal(restored.items[0].name, 'Keyboard');
  assert.equal(fs.readdirSync(path.join(dstDir, 'backups')).filter((f) => f.startsWith('pre-restore')).length, 1, 'safety backup written');
  src.db.close();
  dst.db.close();
});

test('JSON export restores data and keeps the local PIN', async () => {
  const src = await setup(tmp());
  populate(src.services);
  const json = src.services.backup.exportBuffer('json');
  const doc = JSON.parse(json.toString('utf8'));
  assert.equal(doc.format, 'gulftech-invoice-manager-json');
  assert.ok(doc.data.invoices.length === 1);
  assert.ok(!doc.data.settings.some((s) => s.key === 'security.pinHash'), 'secrets are excluded');

  const dst = await setup(tmp());
  dst.services.security.setPin({ currentPin: '', newPin: '1111' });
  dst.services.backup.restore(json);
  assert.equal(dst.services.security.hasPin(), true, 'local PIN survives restore');
  assert.equal(dst.services.masterData.listCustomers().length, 1);
  src.db.close();
  dst.db.close();
});

test('SQLite export restores as a raw database copy', async () => {
  const src = await setup(tmp());
  const { inv } = populate(src.services);
  const bytes = src.services.backup.exportBuffer('sqlite');
  assert.equal(bytes.subarray(0, 15).toString('latin1'), 'SQLite format 3');
  const dst = await setup(tmp());
  dst.services.backup.restore(bytes);
  assert.equal(dst.services.invoices.get(inv.id).number, inv.number);
  src.db.close();
  dst.db.close();
});

test('password-protected backups need the password and reject wrong ones', async () => {
  const src = await setup(tmp());
  populate(src.services);
  const enc = src.services.backup.exportBuffer('zip', { password: 'Secret123' });
  const dst = await setup(tmp());
  assert.throws(() => dst.services.backup.restore(enc), (e) => e.code === 'NEED_PASSWORD');
  assert.throws(() => dst.services.backup.restore(enc, { password: 'wrong-pass' }), /Wrong password/);
  dst.services.backup.restore(enc, { password: 'Secret123' });
  assert.equal(dst.services.masterData.listCustomers().length, 1);
  src.db.close();
  dst.db.close();
});

test('invalid files are rejected with a helpful message', async () => {
  const dst = await setup(tmp());
  assert.throws(() => dst.services.backup.restore(Buffer.from('hello world')), /Unrecognised backup/);
  assert.throws(() => dst.services.backup.restore(Buffer.from('{"format":"other"}')), /not a Gulf Tech/);
  dst.db.close();
});

test('automatic backups are encrypted with the local key, rotate and respect the interval', async () => {
  const dir = tmp();
  let now = new Date('2026-10-08T00:00:00Z');
  const key = generateKey();
  const file = path.join(dir, 'app.db');
  const db = await AppDatabase.open({ SQL, filePath: file, key, saveDelayMs: 0 });
  const { services } = createContainer({ db, SQL, key, userDataDir: dir, electron: electronStub, now: () => now });
  services.settings.update({ 'backup.autoEnabled': true, 'backup.intervalHours': 24, 'backup.retention': 2 });

  const first = services.backup.runAutoIfDue();
  assert.ok(first, 'first run creates a backup');
  const raw = fs.readFileSync(first);
  assert.ok(!raw.subarray(0, 2).equals(Buffer.from('PK')), 'backup is encrypted, not a plain ZIP');
  assert.equal(services.backup.runAutoIfDue(), null, 'not due yet');

  now = new Date('2026-10-09T01:00:00Z');
  services.backup.runAutoIfDue();
  now = new Date('2026-10-10T02:00:00Z');
  services.backup.runAutoIfDue();
  const autos = services.backup.listBackups().filter((f) => f.name.startsWith('auto-'));
  assert.equal(autos.length, 2, 'retention keeps only the newest 2');

  // Restore an auto backup on the same machine (same key).
  const other = await AppDatabase.open({ SQL, filePath: path.join(tmp(), 'x.db'), key, saveDelayMs: 0 });
  const restorer = createContainer({ db: other, SQL, key, userDataDir: dir, electron: electronStub, now: () => now });
  restorer.services.backup.restore(fs.readFileSync(autos[0].path));
  db.close();
  other.close();
});

test('backup folder setting is honoured', async () => {
  const dir = tmp();
  const custom = tmp();
  const { db, services } = await setup(dir);
  services.settings.update({ 'backup.folder': custom });
  assert.equal(services.backup.backupDir(), custom);
  services.backup.writeAuto('manual');
  assert.equal(fs.readdirSync(custom).length, 1);
  db.close();
});

test('timestamp format is sortable and Windows-safe', () => {
  const stamp = formatStamp(new Date(2026, 9, 8, 14, 30, 5));
  assert.equal(stamp, '20261008-143005');
  assert.ok(!/[:\\/]/.test(stamp));
});
