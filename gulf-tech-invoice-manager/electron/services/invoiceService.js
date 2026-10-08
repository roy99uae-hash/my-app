/**
 * Invoice service: the business rules for creating, editing and deleting invoices.
 *
 *  - Numbers are generated from the configured pattern and an atomic counter.
 *  - Totals are computed here (never trusted from the renderer).
 *  - Stock is deducted when an invoice leaves Draft and restored if it returns to Draft
 *    or is deleted. The `stock_applied` flag keeps this idempotent.
 *  - Business and customer details are snapshotted on the invoice so historical PDFs
 *    stay correct even after profiles change.
 */
import { computeInvoiceTotals, deriveStatus } from '../../shared/calc.js';
import { counterKeyFor, formatInvoiceNumber } from '../../shared/numbering.js';
import { validateInvoice } from '../../shared/validation.js';
import { round2 } from '../../shared/money.js';

export class InvoiceService {
  /**
   * @param {Object} deps
   * @param {import('../data/database.js').AppDatabase} deps.db
   * @param {import('../data/repositories/invoiceRepository.js').InvoiceRepository} deps.invoices
   * @param {*} deps.businesses
   * @param {*} deps.customers
   * @param {*} deps.products
   * @param {*} deps.settings
   * @param {*} deps.counters
   */
  constructor({ db, invoices, businesses, customers, products, settings, counters }) {
    Object.assign(this, { db, invoices, businesses, customers, products, settings, counters });
  }

  list(filters) {
    return this.invoices.list(filters);
  }

  get(id) {
    const inv = this.invoices.get(id);
    if (!inv) throw new Error('Invoice not found.');
    return inv;
  }

  /** The number the next new invoice will receive (not reserved). */
  previewNumber(date = new Date()) {
    const s = this.settings.getAll();
    const key = counterKeyFor({ pattern: s['invoice.numberFormat'], prefix: s['invoice.prefix'], date });
    return formatInvoiceNumber({
      pattern: s['invoice.numberFormat'],
      prefix: s['invoice.prefix'],
      date,
      seq: this.counters.peek(key),
    });
  }

  /**
   * Create or update an invoice. Returns the saved invoice.
   * @param {Object} payload  See renderer InvoiceEditor for the shape.
   */
  save(payload) {
    const errors = validateInvoice(payload);
    if (errors.length) throw new Error(errors.join('\n'));

    const s = this.settings.getAll();
    const business = this.businesses.get(payload.businessId);
    if (!business) throw new Error('The selected business profile no longer exists.');
    const customer = this.customers.get(payload.customerId);
    if (!customer) throw new Error('The selected customer no longer exists.');

    const defaultVat = Number(s['invoice.vatPercent']);
    const items = payload.items.map((it) => {
      const product = it.productId ? this.products.get(it.productId) : null;
      return {
        productId: product ? product.id : null,
        name: it.name.trim(),
        sku: it.sku || product?.sku || null,
        description: it.description || '',
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discountPercent: Number(it.discountPercent) || 0,
        vatRate: it.vatRate !== undefined && it.vatRate !== null && it.vatRate !== ''
          ? Number(it.vatRate)
          : product?.vatRate ?? defaultVat,
      };
    });

    const totals = computeInvoiceTotals({
      items,
      invoiceDiscountType: payload.invoiceDiscountType === 'percent' ? 'percent' : 'amount',
      invoiceDiscountValue: Number(payload.invoiceDiscountValue) || 0,
      shippingCharge: Number(payload.shippingCharge) || 0,
      defaultVatRate: defaultVat,
      shippingVatRate: defaultVat,
    });

    const amountPaid = round2(Number(payload.amountPaid) || 0);
    if (amountPaid > totals.grandTotal + 0.005) {
      throw new Error(`Amount paid (${amountPaid}) cannot exceed the grand total (${totals.grandTotal}).`);
    }
    const isDraft = !!payload.isDraft;
    const status = deriveStatus({ isDraft, grandTotal: totals.grandTotal, amountPaid });

    return this.db.transaction(() => {
      const existing = payload.id ? this.invoices.getRaw(payload.id) : null;
      if (payload.id && !existing) throw new Error('Invoice not found.');

      let number = existing?.number;
      if (!existing) {
        const date = payload.invoiceDate;
        const key = counterKeyFor({ pattern: s['invoice.numberFormat'], prefix: s['invoice.prefix'], date });
        const seq = this.counters.next(key);
        number = formatInvoiceNumber({ pattern: s['invoice.numberFormat'], prefix: s['invoice.prefix'], date, seq });
      }

      // Revert stock applied by the previous version of this invoice.
      if (existing?.stock_applied) {
        for (const row of this.invoices.itemsOf(existing.id)) {
          if (row.product_id) this.products.adjustStock(row.product_id, Number(row.quantity));
        }
      }

      const willApplyStock = !isDraft;
      const header = {
        number,
        businessId: business.id,
        customerId: customer.id,
        invoiceDate: payload.invoiceDate,
        dueDate: payload.dueDate || null,
        status,
        paymentMethod: payload.paymentMethod || null,
        amountPaid,
        currency: s['invoice.currency'],
        defaultVatRate: defaultVat,
        invoiceDiscountType: payload.invoiceDiscountType === 'percent' ? 'percent' : 'amount',
        invoiceDiscountValue: Number(payload.invoiceDiscountValue) || 0,
        shippingCharge: totals.shippingCharge,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxableAmount: totals.taxableAmount,
        vatTotal: totals.vatTotal,
        grandTotal: totals.grandTotal,
        notes: payload.notes || null,
        terms: payload.terms || null,
        template: payload.template || s['pdf.template'],
        businessSnapshot: snapshotBusiness(business),
        customerSnapshot: snapshotCustomer(customer),
        stockApplied: willApplyStock,
      };

      let id;
      if (existing) {
        this.invoices.updateHeader(existing.id, header);
        id = existing.id;
      } else {
        id = Number(this.invoices.insertHeader(header));
      }

      const lineRows = totals.lines.map((line, i) => ({
        ...items[line.index],
        grossAmount: line.gross,
        lineDiscount: line.lineDiscount,
        taxableAmount: line.taxableAmount,
        vatAmount: line.vatAmount,
        lineTotal: line.lineTotal,
        vatRate: line.vatRate,
        position: i,
      }));
      this.invoices.replaceItems(id, lineRows);

      if (willApplyStock) {
        for (const it of lineRows) {
          if (it.productId) this.products.adjustStock(it.productId, -it.quantity);
        }
      }
      return this.get(id);
    });
  }

  /** Delete an invoice and restore any stock it had deducted. */
  remove(id) {
    return this.db.transaction(() => {
      const existing = this.invoices.getRaw(id);
      if (!existing) throw new Error('Invoice not found.');
      if (existing.stock_applied) {
        for (const row of this.invoices.itemsOf(id)) {
          if (row.product_id) this.products.adjustStock(row.product_id, Number(row.quantity));
        }
      }
      this.invoices.remove(id);
      return { ok: true };
    });
  }
}

/** Snapshot the business fields that appear on printed invoices. */
export function snapshotBusiness(b) {
  return {
    name: b.name,
    logoData: b.logoData,
    address: b.address,
    phone: b.phone,
    whatsapp: b.whatsapp,
    email: b.email,
    website: b.website,
    vatNumber: b.vatNumber,
    tradeLicense: b.tradeLicense,
    signatureData: b.signatureData,
    signatureMode: b.signatureMode,
    signatoryName: b.signatoryName,
    signatoryPosition: b.signatoryPosition,
  };
}

/** Snapshot the customer fields that appear on printed invoices. */
export function snapshotCustomer(c) {
  return {
    name: c.name,
    mobile: c.mobile,
    email: c.email,
    address: c.address,
    city: c.city,
    country: c.country,
  };
}
