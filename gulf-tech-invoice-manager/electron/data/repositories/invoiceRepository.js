/**
 * Invoice repository: persistence for invoice headers and line items.
 * Business rules (numbering, totals, stock) live in the invoice service.
 */
import { nullIfEmpty, now, num } from './base.js';

/** Map an invoice header row to the public shape. */
export function mapInvoiceHeader(row) {
  if (!row) return null;
  const grand = num(row.grand_total);
  const paid = num(row.amount_paid);
  return {
    id: row.id,
    number: row.number,
    businessId: row.business_id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? undefined,
    businessName: row.business_name ?? undefined,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    status: row.status,
    paymentMethod: row.payment_method,
    amountPaid: paid,
    balanceDue: Math.max(0, Math.round((grand - paid) * 100) / 100),
    currency: row.currency,
    defaultVatRate: num(row.default_vat_rate),
    invoiceDiscountType: row.invoice_discount_type,
    invoiceDiscountValue: num(row.invoice_discount_value),
    shippingCharge: num(row.shipping_charge),
    subtotal: num(row.subtotal),
    discountTotal: num(row.discount_total),
    taxableAmount: num(row.taxable_amount),
    vatTotal: num(row.vat_total),
    grandTotal: grand,
    notes: row.notes,
    terms: row.terms,
    template: row.template,
    businessSnapshot: parseJson(row.business_snapshot),
    customerSnapshot: parseJson(row.customer_snapshot),
    stockApplied: !!row.stock_applied,
    itemCount: row.item_count === undefined ? undefined : num(row.item_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Map an item row to the public shape. */
export function mapItem(row) {
  return {
    id: row.id,
    productId: row.product_id,
    position: row.position,
    name: row.name,
    sku: row.sku,
    description: row.description,
    quantity: num(row.quantity),
    unitPrice: num(row.unit_price),
    discountPercent: num(row.discount_percent),
    vatRate: num(row.vat_rate),
    grossAmount: num(row.gross_amount),
    lineDiscount: num(row.line_discount),
    taxableAmount: num(row.taxable_amount),
    vatAmount: num(row.vat_amount),
    lineTotal: num(row.line_total),
  };
}

const HEADER_SELECT = `
  SELECT i.*, c.name AS customer_name, b.name AS business_name,
    (SELECT COUNT(*) FROM invoice_items it WHERE it.invoice_id = i.id) AS item_count
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id
  LEFT JOIN businesses b ON b.id = i.business_id`;

export class InvoiceRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{search?: string, status?: string, from?: string, to?: string, customerId?: number, limit?: number}} [f]
   */
  list(f = {}) {
    const where = [];
    const params = [];
    if (f.search && f.search.trim()) {
      const term = `%${f.search.trim()}%`;
      where.push('(i.number LIKE ? OR c.name LIKE ? OR i.notes LIKE ?)');
      params.push(term, term, term);
    }
    if (f.status) {
      where.push('i.status = ?');
      params.push(f.status);
    }
    if (f.from) {
      where.push('i.invoice_date >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('i.invoice_date <= ?');
      params.push(f.to);
    }
    if (f.customerId) {
      where.push('i.customer_id = ?');
      params.push(f.customerId);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = f.limit ? `LIMIT ${Math.max(1, Number(f.limit))}` : '';
    return this.db
      .all(`${HEADER_SELECT} ${clause} ORDER BY i.invoice_date DESC, i.id DESC ${limit}`, params)
      .map(mapInvoiceHeader);
  }

  /** Full invoice including line items. */
  get(id) {
    const header = this.db.get(`${HEADER_SELECT} WHERE i.id = ?`, [id]);
    if (!header) return null;
    const items = this.db
      .all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id', [id])
      .map(mapItem);
    return { ...mapInvoiceHeader(header), items };
  }

  /** Raw lightweight row (no joins), used by the service for stock reconciliation. */
  getRaw(id) {
    return this.db.get('SELECT * FROM invoices WHERE id = ?', [id]);
  }

  findByNumber(number) {
    return this.db.get('SELECT id FROM invoices WHERE number = ?', [number]);
  }

  itemsOf(invoiceId) {
    return this.db.all('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id', [invoiceId]);
  }

  insertHeader(h) {
    const t = now();
    const r = this.db.run(
      `INSERT INTO invoices (number, business_id, customer_id, invoice_date, due_date, status, payment_method, amount_paid,
         currency, default_vat_rate, invoice_discount_type, invoice_discount_value, shipping_charge, subtotal, discount_total,
         taxable_amount, vat_total, grand_total, notes, terms, template, business_snapshot, customer_snapshot,
         stock_applied, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this.headerValues(h), t, t],
    );
    return r.lastInsertRowid;
  }

  updateHeader(id, h) {
    this.db.run(
      `UPDATE invoices SET number = ?, business_id = ?, customer_id = ?, invoice_date = ?, due_date = ?, status = ?,
         payment_method = ?, amount_paid = ?, currency = ?, default_vat_rate = ?, invoice_discount_type = ?,
         invoice_discount_value = ?, shipping_charge = ?, subtotal = ?, discount_total = ?, taxable_amount = ?,
         vat_total = ?, grand_total = ?, notes = ?, terms = ?, template = ?, business_snapshot = ?,
         customer_snapshot = ?, stock_applied = ?, updated_at = ?
       WHERE id = ?`,
      [...this.headerValues(h), now(), id],
    );
  }

  /** Replace all line items of an invoice. */
  replaceItems(invoiceId, items) {
    this.db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    items.forEach((it, index) => {
      this.db.run(
        `INSERT INTO invoice_items (invoice_id, product_id, position, name, sku, description, quantity, unit_price,
           discount_percent, vat_rate, gross_amount, line_discount, taxable_amount, vat_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          it.productId ?? null,
          index,
          it.name,
          nullIfEmpty(it.sku),
          nullIfEmpty(it.description),
          it.quantity,
          it.unitPrice,
          it.discountPercent,
          it.vatRate,
          it.grossAmount,
          it.lineDiscount,
          it.taxableAmount,
          it.vatAmount,
          it.lineTotal,
        ],
      );
    });
  }

  remove(id) {
    this.db.run('DELETE FROM invoices WHERE id = ?', [id]);
  }

  headerValues(h) {
    return [
      h.number,
      h.businessId,
      h.customerId,
      h.invoiceDate,
      nullIfEmpty(h.dueDate),
      h.status,
      nullIfEmpty(h.paymentMethod),
      num(h.amountPaid),
      h.currency,
      num(h.defaultVatRate),
      h.invoiceDiscountType,
      num(h.invoiceDiscountValue),
      num(h.shippingCharge),
      num(h.subtotal),
      num(h.discountTotal),
      num(h.taxableAmount),
      num(h.vatTotal),
      num(h.grandTotal),
      nullIfEmpty(h.notes),
      nullIfEmpty(h.terms),
      h.template,
      JSON.stringify(h.businessSnapshot || null),
      JSON.stringify(h.customerSnapshot || null),
      h.stockApplied ? 1 : 0,
    ];
  }
}

function parseJson(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
