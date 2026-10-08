/**
 * Invoice calculation engine (pure functions, no I/O).
 *
 * Rules:
 *  - Unit prices are EXCLUSIVE of VAT.
 *  - Each line: gross = qty * unitPrice; lineDiscount = gross * discount%; net = gross - lineDiscount.
 *  - Optional invoice-level discount (amount or percent of net subtotal) is spread
 *    proportionally across lines so VAT is charged on the discounted taxable value.
 *  - VAT per line = taxable * vatRate%.
 *  - Shipping is charged at the shipping VAT rate (defaults to the invoice VAT rate).
 *  - Grand total = taxable + item VAT + shipping + shipping VAT.
 *
 * All returned amounts are rounded to 2 decimals; rounding residue is absorbed by
 * the last line so the per-line figures always add up to the invoice totals.
 */
import { round2 } from './money.js';

/**
 * @typedef {Object} ItemInput
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} [discountPercent]
 * @property {number} [vatRate]
 */

/**
 * @typedef {Object} TotalsInput
 * @property {ItemInput[]} items
 * @property {'amount'|'percent'} [invoiceDiscountType]
 * @property {number} [invoiceDiscountValue]
 * @property {number} [shippingCharge]
 * @property {number} [defaultVatRate]
 * @property {number} [shippingVatRate]
 */

/**
 * Compute line-level and invoice-level totals.
 * @param {TotalsInput} input
 * @returns {{lines: Array<Object>, subtotal: number, discountTotal: number, invoiceDiscount: number,
 *   taxableAmount: number, vatAmount: number, shippingCharge: number, shippingVat: number,
 *   vatTotal: number, grandTotal: number}}
 */
export function computeInvoiceTotals(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const defaultVat = numberOr(input.defaultVatRate, 5);
  const shipping = Math.max(0, round2(numberOr(input.shippingCharge, 0)));
  const shippingVatRate = numberOr(input.shippingVatRate, defaultVat);

  // Pass 1: gross and per-line discounts.
  const base = items.map((item, index) => {
    const quantity = Math.max(0, numberOr(item.quantity, 0));
    const unitPrice = Math.max(0, numberOr(item.unitPrice, 0));
    const discountPercent = clamp(numberOr(item.discountPercent, 0), 0, 100);
    const vatRate = Math.max(0, numberOr(item.vatRate, defaultVat));
    const gross = round2(quantity * unitPrice);
    const lineDiscount = round2((gross * discountPercent) / 100);
    const net = round2(gross - lineDiscount);
    return { index, quantity, unitPrice, discountPercent, vatRate, gross, lineDiscount, net };
  });

  const subtotalGross = round2(base.reduce((a, b) => a + b.gross, 0));
  const lineDiscountTotal = round2(base.reduce((a, b) => a + b.lineDiscount, 0));
  const netSubtotal = round2(base.reduce((a, b) => a + b.net, 0));

  // Pass 2: invoice-level discount, capped at the net subtotal.
  let invoiceDiscount = 0;
  if (input.invoiceDiscountType === 'percent') {
    invoiceDiscount = round2((netSubtotal * clamp(numberOr(input.invoiceDiscountValue, 0), 0, 100)) / 100);
  } else {
    invoiceDiscount = round2(numberOr(input.invoiceDiscountValue, 0));
  }
  invoiceDiscount = clamp(invoiceDiscount, 0, netSubtotal);

  const targetTaxable = round2(netSubtotal - invoiceDiscount);

  // Pass 3: allocate taxable value to lines proportionally; last line absorbs rounding.
  let allocated = 0;
  const lines = base.map((line, i) => {
    let taxable;
    if (i === base.length - 1) {
      taxable = round2(targetTaxable - allocated);
    } else {
      taxable = netSubtotal > 0 ? round2((line.net / netSubtotal) * targetTaxable) : 0;
      allocated = round2(allocated + taxable);
    }
    const vat = round2((taxable * line.vatRate) / 100);
    const lineTotal = round2(taxable + vat);
    const lineInvoiceDiscount = round2(line.net - taxable);
    return {
      index: line.index,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      vatRate: line.vatRate,
      gross: line.gross,
      lineDiscount: round2(line.lineDiscount + lineInvoiceDiscount),
      taxableAmount: taxable,
      vatAmount: vat,
      lineTotal,
    };
  });

  const vatItems = round2(lines.reduce((a, b) => a + b.vatAmount, 0));
  const taxableAmount = round2(lines.reduce((a, b) => a + b.taxableAmount, 0));
  const shippingVat = round2((shipping * shippingVatRate) / 100);
  const vatTotal = round2(vatItems + shippingVat);
  const discountTotal = round2(lineDiscountTotal + invoiceDiscount);
  const subtotal = subtotalGross;
  const grandTotal = round2(taxableAmount + vatTotal + shipping);

  return {
    lines,
    subtotal,
    discountTotal,
    invoiceDiscount,
    taxableAmount,
    vatAmount: vatItems,
    shippingCharge: shipping,
    shippingVat,
    vatTotal,
    grandTotal,
  };
}

/**
 * Derive an invoice status from its payment position.
 * @param {{isDraft: boolean, grandTotal: number, amountPaid: number}} p
 * @returns {'draft'|'paid'|'partial'|'unpaid'}
 */
export function deriveStatus({ isDraft, grandTotal, amountPaid }) {
  if (isDraft) return 'draft';
  const paid = round2(amountPaid || 0);
  if (paid >= round2(grandTotal) - 0.005 && round2(grandTotal) > 0) return 'paid';
  if (paid > 0) return 'partial';
  if (round2(grandTotal) <= 0) return 'paid';
  return 'unpaid';
}

/**
 * Amount still owed on an invoice (never negative).
 * @param {number} grandTotal
 * @param {number} amountPaid
 */
export function balanceDue(grandTotal, amountPaid) {
  return Math.max(0, round2(round2(grandTotal) - round2(amountPaid || 0)));
}

function numberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
