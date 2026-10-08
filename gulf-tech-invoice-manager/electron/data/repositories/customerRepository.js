/**
 * Customer repository, including computed billing statistics and the
 * "future ready" customer balance (opening balance + outstanding invoices).
 */
import { nullIfEmpty, now, num } from './base.js';

/** Map a DB row (with optional aggregates) to the public customer shape. */
export function mapCustomer(row) {
  if (!row) return null;
  const outstanding = num(row.outstanding);
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    address: row.address,
    city: row.city,
    country: row.country,
    notes: row.notes,
    openingBalance: num(row.opening_balance),
    invoiceCount: num(row.invoice_count),
    totalBilled: num(row.total_billed),
    outstanding,
    balance: Math.round((num(row.opening_balance) + outstanding) * 100) / 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const STATS_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.status <> 'draft') AS invoice_count,
    (SELECT COALESCE(SUM(i.grand_total), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status <> 'draft') AS total_billed,
    (SELECT COALESCE(SUM(i.grand_total - i.amount_paid), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status <> 'draft') AS outstanding
  FROM customers c`;

export class CustomerRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * @param {{search?: string}} [opts]
   */
  list({ search = '' } = {}) {
    const term = `%${search.trim()}%`;
    const rows = search.trim()
      ? this.db.all(
          `${STATS_SELECT} WHERE c.name LIKE ? OR c.mobile LIKE ? OR c.email LIKE ? OR c.city LIKE ?
           ORDER BY c.name COLLATE NOCASE`,
          [term, term, term, term],
        )
      : this.db.all(`${STATS_SELECT} ORDER BY c.name COLLATE NOCASE`);
    return rows.map(mapCustomer);
  }

  get(id) {
    return mapCustomer(this.db.get(`${STATS_SELECT} WHERE c.id = ?`, [id]));
  }

  create(d) {
    const t = now();
    const r = this.db.run(
      `INSERT INTO customers (name, mobile, email, address, city, country, notes, opening_balance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...this.values(d), t, t],
    );
    return this.get(r.lastInsertRowid);
  }

  update(id, d) {
    this.db.run(
      `UPDATE customers SET name = ?, mobile = ?, email = ?, address = ?, city = ?, country = ?, notes = ?,
         opening_balance = ?, updated_at = ? WHERE id = ?`,
      [...this.values(d), now(), id],
    );
    return this.get(id);
  }

  invoiceCount(id) {
    return this.db.get('SELECT COUNT(*) AS n FROM invoices WHERE customer_id = ?', [id]).n;
  }

  remove(id) {
    this.db.run('DELETE FROM customers WHERE id = ?', [id]);
  }

  /** Column values in the order used by the INSERT/UPDATE statements. */
  values(d) {
    return [
      d.name.trim(),
      nullIfEmpty(d.mobile),
      nullIfEmpty(d.email),
      nullIfEmpty(d.address),
      nullIfEmpty(d.city),
      nullIfEmpty(d.country),
      nullIfEmpty(d.notes),
      num(d.openingBalance),
    ];
  }
}
