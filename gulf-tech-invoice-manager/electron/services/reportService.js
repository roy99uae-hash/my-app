/**
 * Reporting service: dashboard headline figures and period reports
 * (daily, weekly, monthly, yearly) with chart-ready series.
 */
import { addDays, todayIso, toIsoDate } from '../../shared/format.js';
import { REPORT_PERIODS } from '../../shared/constants.js';

export class ReportService {
  /** @param {{reports: *, invoices: *}} deps */
  constructor({ reports, invoices, products }) {
    this.reports = reports;
    this.invoices = invoices;
    this.products = products;
  }

  /** Figures for the dashboard cards and lists. */
  dashboard(now = new Date()) {
    const today = todayIso(now);
    const monthStart = `${today.slice(0, 8)}01`;
    const monthEnd = toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const totals = this.reports.dashboardTotals(today, monthStart, monthEnd);
    const recent = this.invoices.list({ limit: 8 });
    const lowStock = this.products.list({ lowStockOnly: true }).slice(0, 6);
    return { ...totals, recentInvoices: recent, lowStockProducts: lowStock };
  }

  /**
   * Full report for a period anchored on a date.
   * @param {'daily'|'weekly'|'monthly'|'yearly'} period
   * @param {string} anchor ISO date inside the period
   */
  report(period, anchor) {
    if (!REPORT_PERIODS.includes(period)) throw new Error('Unknown report period.');
    const { from, to } = periodRange(period, anchor);
    const rows = this.reports.invoicesInRange(from, to);
    return {
      period,
      from,
      to,
      summary: this.reports.summary(from, to),
      series: buildSeries(period, from, rows),
      paymentMethods: paymentBreakdown(rows),
      statusBreakdown: statusBreakdown(rows),
      bestProducts: this.reports.bestProducts(from, to, 10),
      topCustomers: this.reports.topCustomers(from, to, 10),
    };
  }
}

/**
 * Inclusive ISO date range for a report period.
 * Weeks run Monday to Sunday.
 * @returns {{from: string, to: string}}
 */
export function periodRange(period, anchor) {
  const [y, m, d] = anchor.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (period === 'daily') return { from: anchor, to: anchor };
  if (period === 'weekly') {
    const dow = (date.getDay() + 6) % 7; // Monday = 0
    const from = addDays(anchor, -dow);
    return { from, to: addDays(from, 6) };
  }
  if (period === 'monthly') {
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    return { from, to: toIsoDate(new Date(y, m, 0)) };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/**
 * Bucket invoices for charting. Daily buckets use the local hour of creation;
 * other periods bucket by invoice date.
 * @returns {Array<{label: string, revenue: number, count: number}>}
 */
export function buildSeries(period, from, rows) {
  let buckets;
  if (period === 'daily') {
    buckets = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, '0')}:00`, revenue: 0, count: 0 }));
    for (const r of rows) {
      const hour = new Date(r.created_at).getHours();
      buckets[hour].revenue += Number(r.grand_total) || 0;
      buckets[hour].count += 1;
    }
  } else if (period === 'yearly') {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    buckets = names.map((label) => ({ label, revenue: 0, count: 0 }));
    for (const r of rows) {
      const idx = Number(r.invoice_date.slice(5, 7)) - 1;
      buckets[idx].revenue += Number(r.grand_total) || 0;
      buckets[idx].count += 1;
    }
  } else {
    const days = period === 'weekly' ? 7 : new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0).getDate();
    buckets = [];
    for (let i = 0; i < days; i++) {
      const iso = addDays(from, i);
      const label = period === 'weekly'
        ? new Date(...isoParts(iso)).toLocaleDateString('en-GB', { weekday: 'short' })
        : String(Number(iso.slice(8, 10)));
      buckets.push({ label, date: iso, revenue: 0, count: 0 });
    }
    for (const r of rows) {
      const idx = buckets.findIndex((b) => b.date === r.invoice_date);
      if (idx >= 0) {
        buckets[idx].revenue += Number(r.grand_total) || 0;
        buckets[idx].count += 1;
      }
    }
  }
  return buckets.map((b) => ({ ...b, revenue: Math.round(b.revenue * 100) / 100 }));
}

/** @private */
function isoParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m - 1, d];
}

/** Collected amount per payment method. */
export function paymentBreakdown(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.payment_method || 'Not specified';
    map.set(key, (map.get(key) || 0) + (Number(r.amount_paid) || 0));
  }
  return [...map.entries()].map(([method, amount]) => ({ method, amount: Math.round(amount * 100) / 100 }));
}

/** Invoice count per status. */
export function statusBreakdown(rows) {
  const map = new Map();
  for (const r of rows) map.set(r.status, (map.get(r.status) || 0) + 1);
  return [...map.entries()].map(([status, count]) => ({ status, count }));
}
