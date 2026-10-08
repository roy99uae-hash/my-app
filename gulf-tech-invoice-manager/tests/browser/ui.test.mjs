/**
 * Integration test for the browser edition UI: the real React app (browser/main.jsx)
 * runs on the real browser backend inside jsdom. Data is created through the API and
 * must appear in the rendered pages.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { JSDOM } from 'jsdom';
import { browserAliases } from '../../browser/aliases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-browser-ui-'));
let dom;
let g;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (check()) return;
    } catch {
      /* keep waiting */
    }
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
const text = () => dom.window.document.body.textContent || '';
const clickNav = async (label) => {
  const btn = [...dom.window.document.querySelectorAll('.nav-item')].find((b) => b.textContent.trim() === label);
  assert.ok(btn, `nav item ${label}`);
  btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
};

let consoleErrors = [];
const realError = console.error;

before(async () => {
  // The backend's background timers must not keep the test process alive.
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => realSetInterval(...args).unref();

  // Same browser-side module resolution as the production build (not the Node one).
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    resolve: { alias: browserAliases },
    build: {
      target: 'esnext',
      outDir,
      emptyOutDir: true,
      minify: false,
      cssCodeSplit: false,
      rollupOptions: {
        input: path.join(root, 'browser/main.jsx'),
        output: { format: 'es', entryFileNames: 'app.mjs', chunkFileNames: 'chunk-[name].mjs' },
      },
    },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });

  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  for (const key of ['document', 'HTMLElement', 'HTMLIFrameElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    globalThis[key] = w[key];
  }
  globalThis.window = w;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.ResizeObserver = w.ResizeObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  w.alert = () => {};
  console.error = (...args) => consoleErrors.push(args.map(String).join(' '));

  await import(path.join(outDir, 'app.mjs'));
  await waitFor(() => w.gulftech, 'backend to expose window.gulftech', 15000);
  g = w.gulftech;
  await waitFor(() => text().includes('Total Sales'), 'dashboard to render', 15000);
});

after(() => {
  console.error = realError;
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('the browser edition renders the dashboard with the offline backend', () => {
  assert.ok(text().includes('Recent Invoices'));
  assert.ok(text().includes('Quick actions') || text().includes('Create Invoice'));
});

test('records created through the backend appear in the UI', async () => {
  const biz = await g.businesses.save({ name: 'Gulf Tech Dubai', vatNumber: '100000000000003', signatureMode: 'printed', signatoryName: 'Roy' });
  const cust = await g.customers.save({ name: 'Browser UI Customer', mobile: '0501234567' });
  const prod = await g.products.save({ name: 'Keyboard', sku: 'KB-1', sellingPrice: 100, stockQty: 10, reorderLevel: 2 });
  await g.invoices.save({
    businessId: biz.id,
    customerId: cust.id,
    invoiceDate: '2026-10-08',
    amountPaid: 0,
    paymentMethod: 'Cash',
    items: [{ productId: prod.id, name: 'Keyboard', quantity: 1, unitPrice: 100 }],
  });
  await clickNav('Invoices');
  await waitFor(() => text().includes('INV-2026-000001'), 'invoice list to show the new invoice');
  await clickNav('Customers');
  assert.ok(text().includes('Browser UI Customer'));
  await clickNav('Products');
  assert.ok(text().includes('Keyboard'));
});

test('the interface reports no console errors during normal use', () => {
  const relevant = consoleErrors.filter((e) => !/not wrapped in act|width\(0\)|height\(0\)|The width|chart should/.test(e));
  assert.deepEqual(relevant.slice(0, 3), []);
});
