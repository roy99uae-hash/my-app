import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInvoiceHtml, escapeHtml } from '../shared/invoiceTemplates.js';
import { TEMPLATES } from '../shared/constants.js';

const base = (overrides = {}) => ({
  invoice: { number: 'INV-2026-000001', invoiceDate: '2026-10-08', dueDate: '2026-11-07', status: 'partial', paymentMethod: 'Cash', amountPaid: 100, notes: 'Thanks <b>a lot</b>', terms: 'Pay on time', currency: 'AED' },
  business: { name: 'Gulf Tech Dubai', logoData: null, address: 'Dubai, UAE', phone: '+971 4 000 0000', whatsapp: '+971 50 000 0000', email: 'info@example.com', website: 'example.com', vatNumber: '100000000000003', tradeLicense: 'DED-123', signatureMode: 'printed', signatoryName: 'Roy', signatoryPosition: 'Manager', signatureData: null },
  customer: { name: 'Acme & Sons <Ltd>', mobile: '+971 50 111 2222', email: 'acme@example.com', address: 'Deira', city: 'Dubai', country: 'UAE' },
  lines: [{ name: 'Keyboard', sku: 'KB-1', description: 'Wireless', quantity: 2, unitPrice: 100, discountPercent: 0, vatRate: 5, vatAmount: 10, lineTotal: 210 }],
  totals: { subtotal: 200, discountTotal: 0, taxableAmount: 200, vatTotal: 10, shippingCharge: 0, grandTotal: 210 },
  settings: { template: 'modern', pageSize: 'A4', showQr: true, showSignatures: true, footerText: 'Thank you', accentColor: '#1d4ed8' },
  qrDataUrl: 'data:image/png;base64,AAAA',
  ...overrides,
});

test('all five templates render a complete HTML document', () => {
  assert.equal(TEMPLATES.length, 5);
  for (const t of TEMPLATES) {
    const html = renderInvoiceHtml(base({ settings: { ...base().settings, template: t.id } }));
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /<\/html>$/);
    assert.ok(html.includes('INV-2026-000001'), `${t.id} shows invoice number`);
    assert.ok(html.includes('Grand Total'), `${t.id} shows grand total`);
  }
});

test('templates differ from each other', () => {
  const outputs = TEMPLATES.map((t) => renderInvoiceHtml(base({ settings: { ...base().settings, template: t.id } })));
  assert.equal(new Set(outputs).size, 5);
});

test('user text is escaped (no HTML injection)', () => {
  const html = renderInvoiceHtml(base());
  assert.ok(html.includes('Acme &amp; Sons &lt;Ltd&gt;'));
  assert.ok(!html.includes('<Ltd>'));
  assert.ok(html.includes('Thanks &lt;b&gt;a lot&lt;/b&gt;'));
  assert.equal(escapeHtml('"\''), '&quot;&#39;');
});

test('signature block: authorised side filled, recipient side blank', () => {
  const html = renderInvoiceHtml(base());
  assert.ok(html.includes('Authorized Signature'));
  assert.ok(html.includes('printed-sig">Roy'), 'printed signature shows typed name');
  assert.ok(html.includes('Customer / Recipient Signature'));
  const recipient = html.slice(html.indexOf('Customer / Recipient Signature'));
  assert.ok(recipient.includes('Received By:'));
  assert.ok(!recipient.includes('Roy'), 'recipient area does not contain the signatory');
});

test('digital and handwritten signature images are embedded', () => {
  const html = renderInvoiceHtml(base({ business: { ...base().business, signatureMode: 'handwritten', signatureData: 'data:image/png;base64,SIG' } }));
  assert.ok(html.includes('src="data:image/png;base64,SIG"'));
});

test('signature block and QR can be hidden', () => {
  const html = renderInvoiceHtml(base({ settings: { ...base().settings, showSignatures: false, showQr: false } }));
  assert.ok(!html.includes('Authorized Signature'));
  assert.ok(!html.includes('Scan to verify'));
});

test('A5 page size is reflected in the print CSS', () => {
  const html = renderInvoiceHtml(base({ settings: { ...base().settings, pageSize: 'A5' } }));
  assert.match(html, /@page \{ size: A5;/);
});

test('invalid accent colour falls back to the default blue', () => {
  const html = renderInvoiceHtml(base({ settings: { ...base().settings, accentColor: 'red; background:url(x)' } }));
  assert.ok(html.includes('#1d4ed8'));
  assert.ok(!html.includes('background:url(x)'));
});
