/**
 * Master data service: businesses (multi-profile), customers and products.
 * Validates input and enforces referential rules (e.g. a customer with invoices
 * cannot be deleted, which protects billing history).
 */
import { validateBusiness, validateCustomer, validateProduct } from '../../shared/validation.js';
import { MAX_IMAGE_BYTES } from '../../shared/constants.js';

export class MasterDataService {
  /**
   * @param {Object} deps
   * @param {*} deps.businesses
   * @param {*} deps.customers
   * @param {*} deps.products
   * @param {*} deps.settings  SettingsRepository (for the default business)
   * @param {import('../data/database.js').AppDatabase} deps.db
   */
  constructor({ businesses, customers, products, settings, db }) {
    Object.assign(this, { businesses, customers, products, settings, db });
  }

  // ---- Businesses -------------------------------------------------------
  listBusinesses() {
    return this.businesses.list();
  }

  getBusiness(id) {
    const b = this.businesses.get(id);
    if (!b) throw new Error('Business profile not found.');
    return b;
  }

  saveBusiness(data) {
    const errors = validateBusiness(data);
    if (errors.length) throw new Error(errors.join('\n'));
    checkImage(data.logoData, 'logo');
    checkImage(data.signatureData, 'signature');
    return this.db.transaction(() => {
      const saved = data.id ? this.businesses.update(data.id, data) : this.businesses.create(data);
      if (!data.id && this.settings.get('company.defaultBusinessId') === null) {
        this.settings.setMany({ 'company.defaultBusinessId': saved.id });
      }
      return saved;
    });
  }

  deleteBusiness(id) {
    const count = this.businesses.invoiceCount(id);
    if (count > 0) {
      throw new Error(
        `This business has ${count} invoice(s). Businesses with billing history cannot be deleted to keep records intact.`,
      );
    }
    return this.db.transaction(() => {
      this.businesses.remove(id);
      if (this.settings.get('company.defaultBusinessId') === id) {
        const next = this.businesses.list()[0];
        this.settings.setMany({ 'company.defaultBusinessId': next ? next.id : null });
      }
      return { ok: true };
    });
  }

  // ---- Customers --------------------------------------------------------
  listCustomers(filters) {
    return this.customers.list(filters);
  }

  getCustomer(id) {
    const c = this.customers.get(id);
    if (!c) throw new Error('Customer not found.');
    return c;
  }

  saveCustomer(data) {
    const errors = validateCustomer(data);
    if (errors.length) throw new Error(errors.join('\n'));
    return data.id ? this.customers.update(data.id, data) : this.customers.create(data);
  }

  deleteCustomer(id) {
    const count = this.customers.invoiceCount(id);
    if (count > 0) {
      throw new Error(`This customer has ${count} invoice(s) and cannot be deleted. Keep the history for your records.`);
    }
    this.customers.remove(id);
    return { ok: true };
  }

  /** Purchase history: invoices plus totals for one customer. */
  customerHistory(id) {
    const customer = this.getCustomer(id);
    const invoices = this.db
      .all(
        `SELECT id, number, invoice_date, status, grand_total, amount_paid FROM invoices
         WHERE customer_id = ? AND status <> 'draft' ORDER BY invoice_date DESC, id DESC`,
        [id],
      )
      .map((r) => ({
        id: r.id,
        number: r.number,
        invoiceDate: r.invoice_date,
        status: r.status,
        grandTotal: Number(r.grand_total),
        amountPaid: Number(r.amount_paid),
      }));
    const items = this.db.all(
      `SELECT ii.name AS name, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS total
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.customer_id = ? AND i.status <> 'draft' GROUP BY ii.name ORDER BY total DESC LIMIT 10`,
      [id],
    );
    return {
      customer,
      invoices,
      topItems: items.map((r) => ({ name: r.name, quantity: Number(r.quantity), total: Number(r.total) })),
    };
  }

  // ---- Products ---------------------------------------------------------
  listProducts(filters) {
    return this.products.list(filters);
  }

  getProduct(id) {
    const p = this.products.get(id);
    if (!p) throw new Error('Product not found.');
    return p;
  }

  findProductByCode(code) {
    return this.products.findByCode(code);
  }

  saveProduct(data) {
    const errors = validateProduct(data);
    if (errors.length) throw new Error(errors.join('\n'));
    checkImage(data.imageData, 'product image');
    this.ensureUniqueCodes(data);
    return data.id ? this.products.update(data.id, data) : this.products.create(data);
  }

  ensureUniqueCodes(data) {
    const sku = (data.sku || '').trim();
    const barcode = (data.barcode || '').trim();
    if (sku) {
      const dup = this.db.get('SELECT id FROM products WHERE sku = ? AND id <> ?', [sku, data.id || -1]);
      if (dup) throw new Error(`SKU "${sku}" is already used by another product.`);
    }
    if (barcode) {
      const dup = this.db.get('SELECT id FROM products WHERE barcode = ? AND id <> ?', [barcode, data.id || -1]);
      if (dup) throw new Error(`Barcode "${barcode}" is already used by another product.`);
    }
  }

  deleteProduct(id) {
    this.products.remove(id);
    return { ok: true };
  }

  productCategories() {
    return this.products.categories();
  }
}

/** Reject data-URL images that are too large or not images. */
export function checkImage(dataUrl, label) {
  if (!dataUrl) return;
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) throw new Error(`The ${label} must be a PNG, JPG or WebP image.`);
  const bytes = Math.floor((dataUrl.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) throw new Error(`The ${label} is larger than 2 MB.`);
}
