/**
 * Display formatting helpers for the renderer and print templates.
 */
import { CURRENCIES } from './constants.js';

/**
 * Format an amount with a currency code, e.g. "AED 1,250.00".
 * @param {number} amount
 * @param {string} currency ISO code
 */
export function formatMoney(amount, currency = 'AED') {
  const n = Number(amount) || 0;
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const meta = CURRENCIES.find((c) => c.code === currency);
  return `${meta ? meta.code : currency} ${formatted}`;
}

/** Plain number with thousands separators and two decimals. */
export function formatNumber(amount) {
  return (Number(amount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format an ISO date string (YYYY-MM-DD) as DD MMM YYYY, e.g. "08 Oct 2026".
 * @param {string} iso
 */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Today's date in the local timezone as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return toIsoDate(now);
}

/** Convert a Date to local YYYY-MM-DD. */
export function toIsoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Add days to an ISO date string and return a new ISO date string. */
export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + Number(days || 0));
  return toIsoDate(date);
}
