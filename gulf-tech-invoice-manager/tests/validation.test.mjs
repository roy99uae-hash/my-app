import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInvoice, validateCustomer, validateProduct, validateBusiness } from '../shared/validation.js';
import { addDays, toIsoDate, formatMoney } from '../shared/format.js';
import { sanitizeFileName } from '../electron/services/fileService.js';
import { buildMailto, buildWhatsAppUrl } from '../electron/ipc/registerHandlers.js';

const goodInvoice = () => ({
  businessId: 1, customerId: 2, invoiceDate: '2026-10-08', dueDate: '2026-11-07',
  items: [{ name: 'Widget', quantity: 2, unitPrice: 10, discountPercent: 0 }],
});

test('valid invoice has no errors', () => {
  assert.deepEqual(validateInvoice(goodInvoice()), []);
});

test('invoice validation reports every problem', () => {
  const errors = validateInvoice({ invoiceDate: 'nope', items: [{ name: '', quantity: 0, unitPrice: -1 }], amountPaid: -5 });
  assert.ok(errors.some((e) => e.includes('business')));
  assert.ok(errors.some((e) => e.includes('customer')));
  assert.ok(errors.some((e) => e.includes('Invoice date')));
  assert.ok(errors.some((e) => e.includes('item name')));
  assert.ok(errors.some((e) => e.includes('quantity')));
  assert.ok(errors.some((e) => e.includes('unit price')));
  assert.ok(errors.some((e) => e.includes('Amount paid')));
});

test('due date may not precede invoice date', () => {
  const errors = validateInvoice({ ...goodInvoice(), dueDate: '2026-10-01' });
  assert.ok(errors.some((e) => e.includes('Due date cannot be before')));
});

test('invoice needs at least one line', () => {
  assert.ok(validateInvoice({ ...goodInvoice(), items: [] }).some((e) => e.includes('at least one')));
});

test('customer and business validation', () => {
  assert.ok(validateCustomer({ name: '  ' }).length > 0);
  assert.deepEqual(validateCustomer({ name: 'Ali', email: 'ali@example.com' }), []);
  assert.ok(validateCustomer({ name: 'Ali', email: 'bad' }).length > 0);
  assert.ok(validateBusiness({ name: '' }).length > 0);
  assert.deepEqual(validateBusiness({ name: 'Gulf Tech', signatureMode: 'digital' }), []);
});

test('product validation rejects negative prices and bad VAT', () => {
  assert.ok(validateProduct({ name: 'X', sellingPrice: -1 }).length > 0);
  assert.ok(validateProduct({ name: 'X', vatRate: 150 }).length > 0);
  assert.deepEqual(validateProduct({ name: 'X', sellingPrice: 5, costPrice: 2, stockQty: 3, reorderLevel: 1, vatRate: null }), []);
});

test('date helpers', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(toIsoDate(new Date(2026, 9, 8)), '2026-10-08');
});

test('money formatting uses currency code', () => {
  assert.equal(formatMoney(1234.5, 'AED'), 'AED 1,234.50');
  assert.equal(formatMoney(0, 'BDT'), 'BDT 0.00');
});

test('file names are sanitised for Windows', () => {
  assert.equal(sanitizeFileName('INV/2026: Acme? <test>.'), 'INV-2026- Acme- -test-');
  assert.equal(sanitizeFileName(''), 'document');
});

test('mailto and WhatsApp links are well formed', () => {
  const m = buildMailto({ to: 'a@b.com', subject: 'Invoice #1 & more', body: 'Line 1\nLine 2' });
  assert.ok(m.startsWith('mailto:a%40b.com?subject=Invoice%20%231%20%26%20more'));
  assert.equal(buildWhatsAppUrl('+971 50-123 4567', 'Hi there'), 'https://wa.me/971501234567?text=Hi%20there');
  assert.throws(() => buildWhatsAppUrl(''), /WhatsApp number/);
});
