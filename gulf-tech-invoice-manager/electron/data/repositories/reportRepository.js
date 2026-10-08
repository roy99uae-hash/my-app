/**
 * Read-only aggregate queries for the dashboard and reports module.
 * Only non-draft invoices count towards sales figures.
 */
import { num } from './base.js';

export class ReportRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /** Revenue totals for an inclusive ISO date range. */
  summary(from, to) {
    const r = this.db.get(
      `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total), 0) AS revenue,
              COALESCE(SUM(amount_paid), 0) AS collected, COALESCE(SUM(vat_total), 0) AS vat,
              COALESCE(SUM(discount_total), 0) AS discounts
       FROM invoices WHERE status <> 'draft' AND invoice_date BETWEEN ? AND ?`,
      [from, to],
    );
    const invoices = num(r.invoices);
    const revenue = num(r.revenue);
    return {
      totalRevenue: round(revenue),
      totalInvoices: invoices,
      averageInvoiceValue: invoices ? round(revenue / invoices) : 0,
      collected: round(num(r.collected)),
      outstanding: round(revenue - num(r.collected)),
      vat: round(num(r.vat)),
      discounts: round(num(r.discounts)),
    };
  }

  /** Non-draft invoices in a range, used to bucket charts in JS (local timezone). */
  invoicesInRange(from, to) {
    return this.db.all(
      `SELECT invoice_date, created_at, grand_total, amount_paid, payment_method, status
       FROM invoices WHERE status <> 'draft' AND invoice_date BETWEEN ? AND ?`,
      [from, to],
    );
  }

  /** Best selling products (by revenue) in a range. */
  bestProducts(from, to, limit = 10) {
    return this.db
      .all(
        `SELECT ii.name AS name, ii.sku AS sku, SUM(ii.quantity) AS quantity, SUM(ii.line_total) AS revenue
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
         WHERE i.status <> 'draft' AND i.invoice_date BETWEEN ? AND ?
         GROUP BY ii.name ORDER BY revenue DESC LIMIT ?`,
        [from, to, limit],
      )
      .map((r) => ({ name: r.name, sku: r.sku, quantity: num(r.quantity), revenue: round(num(r.revenue)) }));
  }

  /** Top customers by billed revenue in a range. */
  topCustomers(from, to, limit = 10) {
    return this.db
      .all(
        `SELECT c.name AS name, COUNT(i.id) AS invoices, SUM(i.grand_total) AS revenue
         FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.status <> 'draft' AND i.invoice_date BETWEEN ? AND ?
         GROUP BY i.customer_id ORDER BY revenue DESC LIMIT ?`,
        [from, to, limit],
      )
      .map((r) => ({ name: displayName(r.name), invoices: num(r.invoices), revenue: round(num(r.revenue)) }));
  }

  /** Dashboard headline numbers (not range based). */
  dashboardTotals(todayIso, monthStartIso, monthEndIso) {
    const sales = (from, to) =>
      num(
        this.db.get(
          `SELECT COALESCE(SUM(grand_total), 0) AS v FROM invoices
           WHERE status <> 'draft' AND invoice_date BETWEEN ? AND ?`,
          [from, to],
        ).v,
      );
    const allTime = num(
      this.db.get("SELECT COALESCE(SUM(grand_total), 0) AS v FROM invoices WHERE status <> 'draft'").v,
    );
    const outstanding = num(
      this.db.get(
        "SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS v FROM invoices WHERE status <> 'draft'",
      ).v,
    );
    return {
      totalSales: round(allTime),
      todaySales: round(sales(todayIso, todayIso)),
      monthSales: round(sales(monthStartIso, monthEndIso)),
      outstanding: round(Math.max(0, outstanding)),
      totalCustomers: num(this.db.get('SELECT COUNT(*) AS n FROM customers').n),
      totalProducts: num(this.db.get('SELECT COUNT(*) AS n FROM products').n),
      totalInvoices: num(this.db.get("SELECT COUNT(*) AS n FROM invoices WHERE status <> 'draft'").n),
      lowStockCount: num(
        this.db.get('SELECT COUNT(*) AS n FROM products WHERE reorder_level > 0 AND stock_qty <= reorder_level').n,
      ),
    };
  }
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function displayName(v) {
  return v && String(v).trim() ? String(v) : '(Unknown customer)';
}
