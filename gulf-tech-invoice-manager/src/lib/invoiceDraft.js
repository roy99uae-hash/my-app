/**
 * Conversion helpers between saved invoices and editor drafts.
 */
import { addDays, todayIso } from '../../shared/format.js';

let keySeq = 0;
/** Stable React key for editor lines. */
export const newKey = () => `line-${Date.now()}-${keySeq++}`;

/** A blank editor draft. */
export function emptyDraft(settings) {
  return {
    id: null,
    businessId: settings['company.defaultBusinessId'] || '',
    customerId: '',
    invoiceDate: todayIso(),
    dueDate: addDays(todayIso(), Number(settings['invoice.dueDays']) || 0),
    paymentMethod: 'Cash',
    amountPaid: 0,
    notes: settings['invoice.defaultNotes'] || '',
    terms: settings['invoice.defaultTerms'] || '',
    invoiceDiscountType: 'amount',
    invoiceDiscountValue: 0,
    shippingCharge: 0,
    status: 'draft',
    number: '',
    items: [],
  };
}

/** Build an editor draft from a saved invoice. */
export function draftFromInvoice(inv) {
  return {
    id: inv.id,
    businessId: inv.businessId,
    customerId: inv.customerId,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate || '',
    paymentMethod: inv.paymentMethod || '',
    amountPaid: inv.amountPaid,
    notes: inv.notes || '',
    terms: inv.terms || '',
    invoiceDiscountType: inv.invoiceDiscountType || 'amount',
    invoiceDiscountValue: inv.invoiceDiscountValue || 0,
    shippingCharge: inv.shippingCharge || 0,
    status: inv.status,
    number: inv.number,
    items: inv.items.map((it) => ({
      key: newKey(),
      productId: it.productId,
      name: it.name,
      sku: it.sku || '',
      description: it.description || '',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent,
      vatRate: it.vatRate,
    })),
  };
}

/** Convert an editor draft into the payload expected by invoice:save. */
export function payloadFromDraft(draft, { isDraft }) {
  return {
    id: draft.id || undefined,
    businessId: Number(draft.businessId) || null,
    customerId: Number(draft.customerId) || null,
    invoiceDate: draft.invoiceDate,
    dueDate: draft.dueDate || null,
    paymentMethod: draft.paymentMethod || null,
    amountPaid: Number(draft.amountPaid) || 0,
    notes: draft.notes,
    terms: draft.terms,
    invoiceDiscountType: draft.invoiceDiscountType,
    invoiceDiscountValue: Number(draft.invoiceDiscountValue) || 0,
    shippingCharge: Number(draft.shippingCharge) || 0,
    isDraft,
    items: draft.items.map((it) => ({
      productId: it.productId || null,
      name: it.name,
      sku: it.sku || null,
      description: it.description || '',
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      vatRate: it.vatRate === '' || it.vatRate === null || it.vatRate === undefined ? null : Number(it.vatRate),
    })),
  };
}
