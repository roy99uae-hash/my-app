import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoiceTotals, deriveStatus, balanceDue } from '../shared/calc.js';
import { round2, sum2 } from '../shared/money.js';

test('round2 rounds half away from zero and handles floats', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(-1.005), -1.01);
  assert.equal(round2('abc'), 0);
});

test('sum2 adds with rounding', () => {
  assert.equal(sum2([0.1, 0.2]), 0.3);
});

test('basic invoice with 5% VAT', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: 2, unitPrice: 100 }, { quantity: 1, unitPrice: 50.5 }],
    defaultVatRate: 5,
  });
  assert.equal(t.subtotal, 250.5);
  assert.equal(t.discountTotal, 0);
  assert.equal(t.taxableAmount, 250.5);
  assert.equal(t.vatTotal, 12.53); // 12.525 rounds half-up on the per-line sum
  assert.equal(t.grandTotal, 263.03);
});

test('line discount reduces taxable value before VAT', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: 10, unitPrice: 20, discountPercent: 10, vatRate: 5 }],
    defaultVatRate: 5,
  });
  assert.equal(t.subtotal, 200);
  assert.equal(t.discountTotal, 20);
  assert.equal(t.taxableAmount, 180);
  assert.equal(t.vatTotal, 9);
  assert.equal(t.grandTotal, 189);
  assert.equal(t.lines[0].lineTotal, 189);
});

test('invoice-level amount discount is spread over lines', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: 1, unitPrice: 100 }, { quantity: 1, unitPrice: 300 }],
    invoiceDiscountType: 'amount',
    invoiceDiscountValue: 40,
    defaultVatRate: 5,
  });
  assert.equal(t.invoiceDiscount, 40);
  assert.equal(t.taxableAmount, 360);
  assert.equal(t.lines[0].taxableAmount, 90);
  assert.equal(t.lines[1].taxableAmount, 270);
  assert.equal(t.grandTotal, 378);
});

test('invoice-level percentage discount and cap at subtotal', () => {
  const pct = computeInvoiceTotals({
    items: [{ quantity: 1, unitPrice: 200 }],
    invoiceDiscountType: 'percent',
    invoiceDiscountValue: 10,
    defaultVatRate: 0,
  });
  assert.equal(pct.invoiceDiscount, 20);
  assert.equal(pct.grandTotal, 180);

  const capped = computeInvoiceTotals({
    items: [{ quantity: 1, unitPrice: 50 }],
    invoiceDiscountType: 'amount',
    invoiceDiscountValue: 999,
    defaultVatRate: 5,
  });
  assert.equal(capped.invoiceDiscount, 50);
  assert.equal(capped.grandTotal, 0);
});

test('shipping is added with its own VAT', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: 1, unitPrice: 100 }],
    shippingCharge: 20,
    defaultVatRate: 5,
  });
  assert.equal(t.shippingVat, 1);
  assert.equal(t.vatTotal, 6);
  assert.equal(t.grandTotal, 100 + 5 + 20 + 1);
});

test('per-line VAT overrides default (zero-rated line)', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: 1, unitPrice: 100, vatRate: 0 }, { quantity: 1, unitPrice: 100 }],
    defaultVatRate: 5,
  });
  assert.equal(t.vatAmount, 5);
});

test('line amounts always reconcile to invoice totals (rounding residue)', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ quantity: 3, unitPrice: 33.33 + i, discountPercent: 7.5 }));
  const t = computeInvoiceTotals({
    items,
    invoiceDiscountType: 'percent',
    invoiceDiscountValue: 12.5,
    shippingCharge: 15.55,
    defaultVatRate: 5,
  });
  const lineTaxable = sum2(t.lines.map((l) => l.taxableAmount));
  const lineVat = sum2(t.lines.map((l) => l.vatAmount));
  assert.equal(lineTaxable, t.taxableAmount);
  assert.equal(lineVat, t.vatAmount);
  assert.equal(t.grandTotal, round2(t.taxableAmount + t.vatTotal + t.shippingCharge));
});

test('empty invoice has zero totals', () => {
  const t = computeInvoiceTotals({ items: [] });
  assert.equal(t.grandTotal, 0);
  assert.deepEqual(t.lines, []);
});

test('negative and invalid inputs are sanitised', () => {
  const t = computeInvoiceTotals({
    items: [{ quantity: -3, unitPrice: 10 }, { quantity: 'x', unitPrice: 10 }],
    shippingCharge: -5,
    defaultVatRate: 5,
  });
  assert.equal(t.subtotal, 0);
  assert.equal(t.shippingCharge, 0);
});

test('deriveStatus follows payment position', () => {
  assert.equal(deriveStatus({ isDraft: true, grandTotal: 100, amountPaid: 100 }), 'draft');
  assert.equal(deriveStatus({ isDraft: false, grandTotal: 100, amountPaid: 100 }), 'paid');
  assert.equal(deriveStatus({ isDraft: false, grandTotal: 100, amountPaid: 40 }), 'partial');
  assert.equal(deriveStatus({ isDraft: false, grandTotal: 100, amountPaid: 0 }), 'unpaid');
  assert.equal(deriveStatus({ isDraft: false, grandTotal: 0, amountPaid: 0 }), 'paid');
});

test('balanceDue never goes negative', () => {
  assert.equal(balanceDue(100, 30), 70);
  assert.equal(balanceDue(100, 130), 0);
});
