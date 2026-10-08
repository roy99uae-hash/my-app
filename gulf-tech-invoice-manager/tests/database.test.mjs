import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppDatabase, loadSqlEngine } from '../electron/data/database.js';
import { createContainer } from '../electron/services/container.js';
import { generateKey } from '../electron/security/crypto.js';
import { LATEST_SCHEMA_VERSION } from '../electron/data/schema.js';

let SQL;
before(async () => {
  SQL = await loadSqlEngine();
});

const electronStub = { BrowserWindow: class {}, dialog: {}, shell: {} };

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gtdb-'));
}

async function openDb(file, key) {
  const db = await AppDatabase.open({ SQL, filePath: file, key, saveDelayMs: 0 });
  const container = createContainer({ db, SQL, key, userDataDir: path.dirname(file), electron: electronStub, now: () => new Date('2026-10-08T10:00:00Z') });
  return { db, ...container };
}

function seed(s) {
  const business = s.masterData.saveBusiness({ name: 'Gulf Tech Trading LLC', vatNumber: '100000000000003', signatureMode: 'printed', signatoryName: 'Roy', signatoryPosition: 'Manager' });
  const customer = s.masterData.saveCustomer({ name: 'Acme Trading', mobile: '+971500000001', email: 'acme@example.com' });
  const product = s.masterData.saveProduct({ name: 'Laptop Stand', sku: 'LS-1', barcode: '6291000000011', sellingPrice: 150, costPrice: 90, stockQty: 10, reorderLevel: 3 });
  return { business, customer, product };
}

test('schema migrations apply and record the version', async () => {
  const dir = tmpDir();
  const { db } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  assert.equal(db.userVersion(), LATEST_SCHEMA_VERSION);
  db.close();
});

test('database file on disk is encrypted and reopens with the right key only', async () => {
  const dir = tmpDir();
  const file = path.join(dir, 'db.sqlite');
  const key = generateKey();
  const { db, services } = await openDb(file, key);
  seed(services);
  db.flush();
  const onDisk = fs.readFileSync(file);
  assert.ok(!onDisk.subarray(0, 15).toString('latin1').startsWith('SQLite format'), 'file must be encrypted');
  db.close();

  const reopened = await openDb(file, key);
  assert.equal(reopened.services.masterData.listCustomers().length, 1);
  reopened.db.close();

  await assert.rejects(() => AppDatabase.open({ SQL, filePath: file, key: generateKey() }), /corrupted|wrong key/);
});

test('invoices: numbering, totals, stock deduction and reversal', async () => {
  const dir = tmpDir();
  const { db, services, repos } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer, product } = seed(services);

  const payload = (extra = {}) => ({
    businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', dueDate: '2026-11-07',
    paymentMethod: 'Card', amountPaid: 0, items: [{ productId: product.id, name: 'Laptop Stand', quantity: 2, unitPrice: 150, discountPercent: 0, vatRate: 5 }],
    ...extra,
  });

  const draft = services.invoices.save(payload({ isDraft: true }));
  assert.equal(draft.number, 'INV-2026-000001');
  assert.equal(draft.status, 'draft');
  assert.equal(repos.products.get(product.id).stockQty, 10, 'drafts do not move stock');

  const issued = services.invoices.save(payload({ id: draft.id, isDraft: false, amountPaid: 100 }));
  assert.equal(issued.number, 'INV-2026-000001', 'number is kept on edit');
  assert.equal(issued.status, 'partial');
  assert.equal(issued.grandTotal, 315); // 300 + 5% VAT
  assert.equal(issued.vatTotal, 15);
  assert.equal(repos.products.get(product.id).stockQty, 8, 'issuing deducts stock');

  const second = services.invoices.save(payload({ isDraft: false, amountPaid: 315 }));
  assert.equal(second.number, 'INV-2026-000002');
  assert.equal(second.status, 'paid');
  assert.equal(repos.products.get(product.id).stockQty, 6);

  services.invoices.remove(second.id);
  assert.equal(repos.products.get(product.id).stockQty, 8, 'deleting restores stock');

  // Reverting an issued invoice to draft restores stock too.
  services.invoices.save(payload({ id: issued.id, isDraft: true }));
  assert.equal(repos.products.get(product.id).stockQty, 10);

  const cust = repos.customers.get(customer.id);
  assert.equal(cust.invoiceCount, 0, 'drafts are not counted as purchases');
  db.close();
});

test('overpayment is rejected and product snapshot survives product deletion', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer, product } = seed(services);
  assert.throws(
    () => services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', amountPaid: 9999, items: [{ name: 'X', quantity: 1, unitPrice: 10 }] }),
    /cannot exceed/,
  );
  const inv = services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', items: [{ productId: product.id, name: 'Laptop Stand', quantity: 1, unitPrice: 150 }] });
  services.masterData.deleteProduct(product.id);
  const after = services.invoices.get(inv.id);
  assert.equal(after.items[0].name, 'Laptop Stand');
  assert.equal(after.items[0].productId, null);
  db.close();
});

test('businesses and customers with invoices cannot be deleted', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer } = seed(services);
  services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', items: [{ name: 'Service', quantity: 1, unitPrice: 100 }] });
  assert.throws(() => services.masterData.deleteBusiness(business.id), /cannot be deleted/);
  assert.throws(() => services.masterData.deleteCustomer(customer.id), /cannot be deleted/);
  db.close();
});

test('duplicate SKU and barcode are rejected', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  seed(services);
  assert.throws(() => services.masterData.saveProduct({ name: 'Other', sku: 'LS-1', sellingPrice: 1 }), /SKU/);
  assert.throws(() => services.masterData.saveProduct({ name: 'Other', barcode: '6291000000011', sellingPrice: 1 }), /Barcode/);
  db.close();
});

test('customer balance includes opening balance and unpaid invoices', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer } = seed(services);
  services.masterData.saveCustomer({ id: customer.id, name: 'Acme Trading', openingBalance: 50 });
  services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', amountPaid: 40, items: [{ name: 'Service', quantity: 1, unitPrice: 100, vatRate: 0 }] });
  const c = services.masterData.getCustomer(customer.id);
  assert.equal(c.outstanding, 60);
  assert.equal(c.balance, 110);
  db.close();
});

test('invoice numbers continue sequence per year and are unique', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer } = seed(services);
  const nums = [];
  for (let i = 0; i < 5; i++) {
    nums.push(services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', items: [{ name: 'S', quantity: 1, unitPrice: 1 }] }).number);
  }
  assert.deepEqual(nums, ['INV-2026-000001', 'INV-2026-000002', 'INV-2026-000003', 'INV-2026-000004', 'INV-2026-000005']);
  const next = services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2027-01-02', items: [{ name: 'S', quantity: 1, unitPrice: 1 }] });
  assert.equal(next.number, 'INV-2027-000001');
  db.close();
});

test('dashboard and reports aggregate only non-draft invoices', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  const { business, customer, product } = seed(services);
  services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', isDraft: true, items: [{ productId: product.id, name: 'Laptop Stand', quantity: 1, unitPrice: 1000, vatRate: 0 }] });
  services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-10-08', paymentMethod: 'Cash', amountPaid: 100, items: [{ productId: product.id, name: 'Laptop Stand', quantity: 1, unitPrice: 100, vatRate: 0 }] });
  services.invoices.save({ businessId: business.id, customerId: customer.id, invoiceDate: '2026-09-15', paymentMethod: 'Card', amountPaid: 50, items: [{ productId: product.id, name: 'Laptop Stand', quantity: 2, unitPrice: 50, vatRate: 0 }] });

  const daily = services.reports.report('daily', '2026-10-08');
  assert.equal(daily.summary.totalRevenue, 100);
  assert.equal(daily.summary.totalInvoices, 1);
  assert.equal(daily.bestProducts[0].quantity, 1);

  const monthly = services.reports.report('monthly', '2026-10-01');
  assert.equal(monthly.from, '2026-10-01');
  assert.equal(monthly.to, '2026-10-31');
  assert.equal(monthly.series.length, 31);

  const yearly = services.reports.report('yearly', '2026-06-01');
  assert.equal(yearly.summary.totalRevenue, 200);
  assert.equal(yearly.series.length, 12);
  assert.equal(yearly.topCustomers[0].name, 'Acme Trading');

  const dash = services.reports.dashboard(new Date('2026-10-08T12:00:00'));
  assert.equal(dash.totalSales, 200);
  assert.equal(dash.todaySales, 100);
  assert.equal(dash.monthSales, 100);
  assert.equal(dash.totalCustomers, 1);
  assert.equal(dash.totalProducts, 1);
  db.close();
});

test('weekly report runs Monday to Sunday', async () => {
  const { periodRange } = await import('../electron/services/reportService.js');
  assert.deepEqual(periodRange('weekly', '2026-10-08'), { from: '2026-10-05', to: '2026-10-11' }); // Thursday
  assert.deepEqual(periodRange('weekly', '2026-10-05'), { from: '2026-10-05', to: '2026-10-11' }); // Monday
});

test('security: PIN lock with throttling', async () => {
  const dir = tmpDir();
  const { db, services, repos } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  let t = 0;
  const { SecurityService } = await import('../electron/services/securityService.js');
  const sec = new SecurityService({ settings: repos.settings, now: () => t });
  assert.equal(sec.hasPin(), false);
  sec.setPin({ currentPin: '', newPin: '2468' });
  assert.equal(sec.unlock('0000').ok, false);
  assert.equal(sec.unlock('2468').ok, true);
  for (let i = 0; i < 5; i++) sec.unlock('0000');
  assert.match(sec.unlock('2468').message, /Try again/);
  t += 31_000;
  assert.equal(sec.unlock('2468').ok, true);
  assert.throws(() => sec.setPin({ currentPin: '0000', newPin: '1357' }), /current PIN/);
  assert.throws(() => sec.setPin({ currentPin: '2468', newPin: '12' }), /4 to 8/);
  db.close();
});

test('settings validation rejects unsafe values', async () => {
  const dir = tmpDir();
  const { db, services } = await openDb(path.join(dir, 'db.sqlite'), generateKey());
  assert.throws(() => services.settings.update({ 'invoice.vatPercent': 500 }), /between 0 and 100/);
  assert.throws(() => services.settings.update({ 'invoice.currency': 'XXX' }), /Unsupported currency/);
  assert.throws(() => services.settings.update({ 'security.pinHash': 'x' }), /Unknown setting/);
  assert.throws(() => services.settings.update({ 'invoice.numberFormat': '{PREFIX}' }), /SEQ/);
  const s = services.settings.update({ 'invoice.currency': 'BDT', 'invoice.prefix': 'bd' });
  assert.equal(s['invoice.currency'], 'BDT');
  assert.equal(s['invoice.prefix'], 'BD');
  db.close();
});
