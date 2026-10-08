/**
 * Headless UI smoke test.
 *  1. Bundles the real React app (src/) with Vite into a temp file.
 *  2. Runs it in jsdom with a fake `window.gulftech` that serves realistic sample data.
 *  3. Navigates every page, opens an invoice preview and the editor, and fails on any console error.
 */
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-ui-'));

await build({
  root,
  logLevel: 'error',
  configFile: false,
  build: {
    ssr: path.join(root, 'tests/ui/entry.jsx'),
    outDir,
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { format: 'esm', entryFileNames: 'entry.mjs' } },
  },
  ssr: { noExternal: true, target: 'node' },
  esbuild: { jsx: 'automatic' },
  define: { 'process.env.NODE_ENV': '"development"' },
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'app://local/index.html',
  pretendToBeVisual: true,
});
const g = globalThis;
for (const key of ['window', 'document', 'HTMLElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'Blob', 'FileReader']) {
  if (dom.window[key] !== undefined) g[key] = dom.window[key];
}
g.window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
g.window.ResizeObserver = g.ResizeObserver;
g.IS_REACT_ACT_ENVIRONMENT = true;
g.window.alert = () => {};

const errors = [];
const origError = console.error;
console.error = (...args) => {
  errors.push(args.map((a) => (a instanceof Error ? a.stack || a.message : String(a))).join(' '));
};

// ---- Sample data ---------------------------------------------------------
const business = { id: 1, name: 'Gulf Tech Dubai', logoData: null, address: 'Dubai, UAE', phone: '+971 4 000 0000', whatsapp: '+971 50 000 0000', email: 'info@gulftech.example', website: 'gulftech.example', vatNumber: '100000000000003', tradeLicense: 'DED-1', notes: '', signatureData: null, signatureMode: 'printed', signatoryName: 'Roy', signatoryPosition: 'Manager', invoiceCount: 1, createdAt: '', updatedAt: '' };
const customer = { id: 2, name: 'Acme Trading', mobile: '+971501112222', email: 'acme@example.com', address: 'Deira', city: 'Dubai', country: 'UAE', notes: '', openingBalance: 0, invoiceCount: 1, totalBilled: 210, outstanding: 110, balance: 110 };
const product = { id: 3, name: 'Keyboard', sku: 'KB-1', barcode: '6291000000011', category: 'Accessories', unit: 'pcs', costPrice: 50, sellingPrice: 100, stockQty: 2, reorderLevel: 3, vatRate: null, imageData: null, notes: '', lowStock: true };
const invoiceItems = [{ id: 1, productId: 3, position: 0, name: 'Keyboard', sku: 'KB-1', description: 'Wireless', quantity: 2, unitPrice: 100, discountPercent: 0, vatRate: 5, grossAmount: 200, lineDiscount: 0, taxableAmount: 200, vatAmount: 10, lineTotal: 210 }];
const invoiceHeader = { id: 5, number: 'INV-2026-000001', businessId: 1, customerId: 2, customerName: 'Acme Trading', businessName: 'Gulf Tech Dubai', invoiceDate: '2026-10-08', dueDate: '2026-11-07', status: 'partial', paymentMethod: 'Cash', amountPaid: 100, balanceDue: 110, currency: 'AED', defaultVatRate: 5, invoiceDiscountType: 'amount', invoiceDiscountValue: 0, shippingCharge: 0, subtotal: 200, discountTotal: 0, taxableAmount: 200, vatTotal: 10, grandTotal: 210, notes: 'Thanks', terms: 'Pay on time', template: 'modern', businessSnapshot: { ...business }, customerSnapshot: { name: 'Acme Trading', mobile: '+971501112222', email: 'acme@example.com', address: 'Deira', city: 'Dubai', country: 'UAE' }, stockApplied: true, createdAt: '', updatedAt: '' };
const invoiceFull = { ...invoiceHeader, items: invoiceItems };
const settings = {
  'company.defaultBusinessId': 1, 'invoice.vatPercent': 5, 'invoice.currency': 'AED', 'invoice.prefix': 'INV', 'invoice.numberFormat': '{PREFIX}-{YYYY}-{SEQ:6}', 'invoice.dueDays': 30, 'invoice.defaultNotes': 'Thank you', 'invoice.defaultTerms': 'Pay on time', 'pdf.template': 'modern', 'pdf.pageSize': 'A4', 'pdf.showQr': true, 'pdf.showSignatures': true, 'pdf.footerText': '', 'pdf.accentColor': '#1d4ed8', 'pdf.outputFolder': '', 'backup.autoEnabled': false, 'backup.intervalHours': 24, 'backup.retention': 10, 'backup.folder': '', 'backup.lastAuto': '', 'ui.theme': 'light', 'security.sessionTimeoutMinutes': 15,
};
const report = (period) => ({ period, from: '2026-10-01', to: '2026-10-31', summary: { totalRevenue: 210, totalInvoices: 1, averageInvoiceValue: 210, collected: 100, outstanding: 110, vat: 10, discounts: 0 }, series: [{ label: '1', revenue: 210, count: 1 }], paymentMethods: [{ method: 'Cash', amount: 100 }], statusBreakdown: [{ status: 'partial', count: 1 }], bestProducts: [{ name: 'Keyboard', sku: 'KB-1', quantity: 2, revenue: 210 }], topCustomers: [{ name: 'Acme Trading', invoices: 1, revenue: 210 }] });

const calls = [];
const handlers = {
  info: async () => ({ name: 'Gulf Tech', version: '1.0.0', currencies: [], defaults: settings, dbPath: '/x/db', keyProtection: 'dpapi', platform: 'win32', offline: true }),
  settings: { get: async () => settings, update: async (p) => Object.assign(settings, p) && { ...settings } },
  security: { status: async () => ({ hasPin: globalThis.__hasPin === true, locked: globalThis.__locked === true, lockedOutSeconds: 0, sessionTimeoutMinutes: 15 }), unlock: async () => ({ ok: true, locked: false }), lock: async () => ({ locked: true }), setPin: async () => ({}), removePin: async () => ({}) },
  businesses: { list: async () => [business], get: async () => business, save: async () => business, remove: async () => ({}) },
  customers: { list: async () => [customer], get: async () => customer, save: async () => customer, remove: async () => ({}), history: async () => ({ customer, invoices: [{ id: 5, number: 'INV-2026-000001', invoiceDate: '2026-10-08', status: 'partial', grandTotal: 210, amountPaid: 100 }], topItems: [{ name: 'Keyboard', quantity: 2, total: 210 }] }) },
  products: { list: async () => [product], get: async () => product, byCode: async () => product, save: async () => product, remove: async () => ({}), categories: async () => ['Accessories'] },
  invoices: { list: async () => [invoiceHeader], get: async () => invoiceFull, save: async (p) => ({ ...invoiceHeader, id: 6, number: 'INV-2026-000002' }), remove: async () => ({}), previewNumber: async () => ({ number: 'INV-2026-000002' }), numberFor: async () => ({ number: 'INV-2026-000002' }) },
  dashboard: { get: async () => ({ totalSales: 210, todaySales: 0, monthSales: 210, outstanding: 110, totalCustomers: 1, totalProducts: 1, totalInvoices: 1, lowStockCount: 1, recentInvoices: [invoiceHeader], lowStockProducts: [product] }) },
  reports: { get: async (period) => report(period) },
  backup: { list: async () => ({ folder: '/x/backups', files: [] }), export: async () => ({ cancelled: true }), pickFile: async () => ({ cancelled: true }), restore: async () => ({}), runNow: async () => ({}), chooseFolder: async () => ({ cancelled: true }) },
  pdf: { print: async () => ({ printed: true }), export: async () => ({ cancelled: true }), save: async () => ({ path: '/x/a.pdf', folder: '/x' }), chooseFolder: async () => ({ cancelled: true }) },
  share: { reveal: async () => ({}), open: async () => ({}), copyPath: async () => ({}), email: async () => ({}), whatsapp: async () => ({}) },
  files: { pickImage: async () => null, saveText: async () => ({ cancelled: true }) },
};

const infoFn = handlers.info;
delete handlers.info;
g.window.gulftech = new Proxy({}, {
  get(_, ns) {
    if (ns === 'info') return () => { calls.push('info'); return Promise.resolve(infoFn()); };
    return new Proxy({}, {
      get(__, method) {
        return (...args) => {
          calls.push(`${String(ns)}.${String(method)}`);
          const fn = handlers[ns]?.[method] ?? (typeof handlers[ns] === 'function' ? handlers[ns] : null);
          if (!fn) return Promise.reject(new Error(`fake api missing ${String(ns)}.${String(method)}`));
          return Promise.resolve(fn(...args));
        };
      },
    });
  },
});

// ---- Run -----------------------------------------------------------------
const failures = [];
let act = (fn) => fn();
const expect = (cond, msg) => {
  if (!cond) failures.push(msg);
};
const text = () => document.body.textContent || '';
const act2 = null;
const clickNav = async (label) => {
  const btn = [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.trim() === label);
  if (!btn) throw new Error(`nav item "${label}" not found`);
  await act(async () => btn.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })));
  await act(async () => new Promise((r) => setTimeout(r, 60)));
};
const clickButton = async (label) => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(label));
  if (!btn) throw new Error(`button "${label}" not found`);
  await act(async () => btn.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })));
  await act(async () => new Promise((r) => setTimeout(r, 80)));
};

try {
  const mod = await import(pathToFileURL(path.join(outDir, 'entry.mjs')).href);
  act = mod.act;
  const root = await mod.mount();
  await act(async () => new Promise((r) => setTimeout(r, 150)));

  expect(text().includes('Total Sales'), 'dashboard shows Total Sales');
  expect(text().includes('Recent Invoices'), 'dashboard shows recent invoices');
  expect(text().includes('Low Stock Warnings'), 'dashboard shows low stock card');

  await clickNav('Invoices');
  expect(text().includes('INV-2026-000001'), 'invoice list shows number');

  await clickNav('Customers');
  expect(text().includes('Acme Trading'), 'customers list shows customer');

  await clickNav('Products & Stock'.replace(' & Stock', '')).catch(() => {});
  await clickNav('Products');
  expect(text().includes('Keyboard'), 'products list shows product');
  expect(text().includes('Low stock') || text().includes('reorder level'), 'low stock warning visible');

  await clickNav('Businesses');
  expect(text().includes('Gulf Tech Dubai'), 'businesses page shows profile');

  await clickNav('Reports');
  expect(text().includes('Total Revenue'), 'reports show revenue');
  expect(text().includes('Best selling products'), 'reports show best sellers');

  await clickNav('Backup & Restore');
  expect(text().includes('Create a backup'), 'backup page renders');

  await clickNav('Settings');
  expect(text().includes('Invoice defaults'), 'settings page renders');
  expect(text().includes('Automatic backup'), 'settings include automatic backup');

  // Invoice preview: click the invoice row on the list page.
  await clickNav('Invoices');
  const row = document.querySelector('tr.clickable');
  expect(!!row, 'invoice row is clickable');
  await act(async () => row.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })));
  await act(async () => new Promise((r) => setTimeout(r, 200)));
  const frame = document.querySelector('iframe.preview-frame');
  expect(!!frame, 'invoice preview iframe rendered');
  const srcdoc = frame?.getAttribute('srcdoc') || '';
  expect(srcdoc.includes('Authorized Signature'), 'preview contains authorised signature block');
  expect(srcdoc.includes('Customer / Recipient Signature'), 'preview contains recipient signature block');
  expect(srcdoc.includes('data:image/png;base64') || srcdoc.includes('Invoice QR'), 'preview contains QR code image');
  expect(srcdoc.includes('Acme Trading'), 'preview shows customer name');
  expect(text().includes('Save PDF') && text().includes('WhatsApp PDF'), 'output actions visible');

  // Editor for new invoice.
  await clickNav('Invoices');
  await clickButton('New Invoice');
  await act(async () => new Promise((r) => setTimeout(r, 120)));
  expect(text().includes('Products & services'), 'editor renders products section');
  expect(text().includes('Summary'), 'editor renders summary');
  // Add a product via picker (type a search term).
  const pickerInput = document.querySelector('.picker input');
  if (pickerInput) {
    const setter = Object.getOwnPropertyDescriptor(g.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(pickerInput, 'key');
      pickerInput.dispatchEvent(new g.window.Event('input', { bubbles: true }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    const option = document.querySelector('.picker-menu button');
    expect(!!option, 'product suggestion appears');
    if (option) await act(async () => option.dispatchEvent(new g.window.MouseEvent('click', { bubbles: true })));
    expect(document.querySelectorAll('.items-table tbody tr').length >= 1, 'product line added to invoice');
  }

  // Lock screen.
  g.__hasPin = true;
  g.__locked = true;
  await act(async () => root.unmount());
  const root2 = await mod.mount();
  await act(async () => new Promise((r) => setTimeout(r, 120)));
  expect(text().includes('Enter your PIN to unlock'), 'lock screen shown when PIN is set');
  expect(!text().includes('Total Sales'), 'dashboard hidden behind lock');
  await act(async () => root2.unmount());
} catch (err) {
  failures.push(`exception: ${err.stack || err}`);
}

console.error = origError; if (process.env.UI_DEBUG) { console.log(errors.slice(0,5).join('\n---\n').slice(0,3000)); console.log('BODY:', text().slice(0,300), document.getElementById('root')?.innerHTML.slice(0,600)); }
const noisy = errors.filter((e) => !/not wrapped in act|Warning: ResizeObserver|The width\(0\)|width\(-1\)|height\(0\)/.test(e));
if (noisy.length) failures.push(`console errors:\n  - ${noisy.slice(0, 8).map((e) => e.split('\n')[0]).join('\n  - ')}`);

if (failures.length) {
  console.error('UI smoke test FAILED');
  for (const f of failures) console.error(' -', f);
  process.exitCode = 1;
} else {
  console.log(`UI smoke test passed (${calls.length} API calls, ${errors.length} console messages ignored/allowed)`);
}
fs.rmSync(outDir, { recursive: true, force: true });
process.exit(process.exitCode || 0);
