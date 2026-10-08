/**
 * Product / inventory repository with search, barcode lookup and low-stock queries.
 */
import { nullIfEmpty, now, num } from './base.js';

/** Map a DB row to the public product shape. */
export function mapProduct(row) {
  if (!row) return null;
  const stock = num(row.stock_qty);
  const reorder = num(row.reorder_level);
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    barcode: row.barcode,
    category: row.category,
    unit: row.unit || 'pcs',
    costPrice: num(row.cost_price),
    sellingPrice: num(row.selling_price),
    stockQty: stock,
    reorderLevel: reorder,
    vatRate: row.vat_rate === null || row.vat_rate === undefined ? null : num(row.vat_rate),
    imageData: row.image_data,
    notes: row.notes,
    lowStock: reorder > 0 && stock <= reorder,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProductRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{search?: string, lowStockOnly?: boolean, category?: string}} [opts]
   */
  list({ search = '', lowStockOnly = false, category = '' } = {}) {
    const where = [];
    const params = [];
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      where.push('(name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)');
      params.push(term, term, term, term);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (lowStockOnly) where.push('reorder_level > 0 AND stock_qty <= reorder_level');
    const sql = `SELECT * FROM products ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name COLLATE NOCASE`;
    return this.db.all(sql, params).map(mapProduct);
  }

  get(id) {
    return mapProduct(this.db.get('SELECT * FROM products WHERE id = ?', [id]));
  }

  /** Find by barcode or SKU (used by the barcode input on invoices). */
  findByCode(code) {
    const c = String(code || '').trim();
    if (!c) return null;
    return mapProduct(this.db.get('SELECT * FROM products WHERE barcode = ? OR sku = ? LIMIT 1', [c, c]));
  }

  categories() {
    return this.db
      .all("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category <> '' ORDER BY category")
      .map((r) => r.category);
  }

  countLowStock() {
    return this.db.get('SELECT COUNT(*) AS n FROM products WHERE reorder_level > 0 AND stock_qty <= reorder_level').n;
  }

  count() {
    return this.db.get('SELECT COUNT(*) AS n FROM products').n;
  }

  create(d) {
    const t = now();
    const r = this.db.run(
      `INSERT INTO products (name, sku, barcode, category, unit, cost_price, selling_price, stock_qty, reorder_level,
         vat_rate, image_data, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this.values(d), t, t],
    );
    return this.get(r.lastInsertRowid);
  }

  update(id, d) {
    this.db.run(
      `UPDATE products SET name = ?, sku = ?, barcode = ?, category = ?, unit = ?, cost_price = ?, selling_price = ?,
         stock_qty = ?, reorder_level = ?, vat_rate = ?, image_data = ?, notes = ?, updated_at = ? WHERE id = ?`,
      [...this.values(d), now(), id],
    );
    return this.get(id);
  }

  /** Adjust stock by a signed delta (used by invoice issuing / cancellation). */
  adjustStock(id, delta) {
    this.db.run('UPDATE products SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?', [delta, now(), id]);
  }

  remove(id) {
    this.db.run('DELETE FROM products WHERE id = ?', [id]);
  }

  values(d) {
    return [
      d.name.trim(),
      nullIfEmpty(d.sku),
      nullIfEmpty(d.barcode),
      nullIfEmpty(d.category),
      d.unit || 'pcs',
      num(d.costPrice),
      num(d.sellingPrice),
      num(d.stockQty),
      num(d.reorderLevel),
      d.vatRate === null || d.vatRate === undefined || d.vatRate === '' ? null : num(d.vatRate),
      nullIfEmpty(d.imageData),
      nullIfEmpty(d.notes),
    ];
  }
}
