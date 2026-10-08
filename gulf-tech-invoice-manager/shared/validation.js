/**
 * Input validation shared by the renderer (instant feedback) and the main
 * process (authoritative checks). Each validator returns an array of error
 * strings; an empty array means the input is valid.
 */
import { PAYMENT_METHODS, SIGNATURE_MODES } from './constants.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBusiness(b) {
  const errors = [];
  if (!text(b.name)) errors.push('Business name is required.');
  if (b.email && !EMAIL_RE.test(b.email)) errors.push('Business email is not valid.');
  if (b.signatureMode && !SIGNATURE_MODES[b.signatureMode]) errors.push('Unknown signature mode.');
  return errors;
}

export function validateCustomer(c) {
  const errors = [];
  if (!text(c.name)) errors.push('Customer name is required.');
  if (c.email && !EMAIL_RE.test(c.email)) errors.push('Customer email is not valid.');
  if (c.openingBalance !== undefined && !Number.isFinite(Number(c.openingBalance))) {
    errors.push('Opening balance must be a number.');
  }
  return errors;
}

export function validateProduct(p) {
  const errors = [];
  if (!text(p.name)) errors.push('Product name is required.');
  if (num(p.sellingPrice) < 0) errors.push('Selling price cannot be negative.');
  if (num(p.costPrice) < 0) errors.push('Cost price cannot be negative.');
  if (num(p.stockQty) < 0) errors.push('Stock quantity cannot be negative.');
  if (num(p.reorderLevel) < 0) errors.push('Reorder level cannot be negative.');
  if (p.vatRate !== null && p.vatRate !== undefined && p.vatRate !== '' && (num(p.vatRate) < 0 || num(p.vatRate) > 100)) {
    errors.push('VAT rate must be between 0 and 100.');
  }
  return errors;
}

/**
 * Validate an invoice draft payload before it is saved.
 * @param {Object} inv
 */
export function validateInvoice(inv) {
  const errors = [];
  if (!inv.businessId) errors.push('Select a business profile.');
  if (!inv.customerId) errors.push('Select a customer.');
  if (!isIsoDate(inv.invoiceDate)) errors.push('Invoice date is required.');
  if (inv.dueDate && !isIsoDate(inv.dueDate)) errors.push('Due date is not valid.');
  if (inv.dueDate && isIsoDate(inv.invoiceDate) && inv.dueDate < inv.invoiceDate) {
    errors.push('Due date cannot be before the invoice date.');
  }
  if (!Array.isArray(inv.items) || inv.items.length === 0) errors.push('Add at least one product or service line.');
  (inv.items || []).forEach((item, i) => {
    if (!text(item.name)) errors.push(`Line ${i + 1}: item name is required.`);
    if (num(item.quantity) <= 0) errors.push(`Line ${i + 1}: quantity must be greater than zero.`);
    if (num(item.unitPrice) < 0) errors.push(`Line ${i + 1}: unit price cannot be negative.`);
    if (num(item.discountPercent) < 0 || num(item.discountPercent) > 100) {
      errors.push(`Line ${i + 1}: discount must be between 0 and 100%.`);
    }
  });
  if (num(inv.shippingCharge) < 0) errors.push('Shipping charge cannot be negative.');
  if (num(inv.amountPaid) < 0) errors.push('Amount paid cannot be negative.');
  if (inv.paymentMethod && !PAYMENT_METHODS.includes(inv.paymentMethod)) errors.push('Unknown payment method.');
  return errors;
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function text(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
