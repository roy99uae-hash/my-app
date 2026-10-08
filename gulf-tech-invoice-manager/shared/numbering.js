/**
 * Invoice numbering. Patterns support the tokens:
 *   {PREFIX}  - configured invoice prefix (e.g. INV)
 *   {YYYY}    - four digit year
 *   {YY}      - two digit year
 *   {MM}      - two digit month
 *   {SEQ}     - sequence number, zero padded to 6 digits
 *   {SEQ:n}   - sequence number, zero padded to n digits
 * The default pattern {PREFIX}-{YYYY}-{SEQ:6} yields INV-2026-000001.
 */

/** Validate that a pattern is usable. Returns an error string or null. */
export function validateNumberFormat(pattern) {
  if (typeof pattern !== 'string' || !pattern.trim()) return 'Number format is required.';
  if (!/\{SEQ(:\d+)?\}/.test(pattern)) return 'Number format must contain {SEQ}.';
  const unknown = pattern.match(/\{[A-Z]+(:\d+)?\}/g) || [];
  const allowed = /^\{(PREFIX|YYYY|YY|MM|SEQ(:\d+)?)\}$/;
  const bad = unknown.find((t) => !allowed.test(t));
  if (bad) return `Unknown token ${bad}.`;
  return null;
}

/**
 * Key used to store the sequence counter. Counters reset whenever the pattern
 * contains a date token that changes (year and/or month).
 */
export function counterKeyFor({ pattern, prefix, date }) {
  const d = toDate(date);
  let key = `inv|${prefix}`;
  if (/\{YYYY\}|\{YY\}/.test(pattern)) key += `|${d.getFullYear()}`;
  if (/\{MM\}/.test(pattern)) key += `|${pad(d.getMonth() + 1, 2)}`;
  return key;
}

/**
 * Build the human-readable invoice number.
 * @param {{pattern: string, prefix: string, date: Date|string, seq: number}} opts
 */
export function formatInvoiceNumber({ pattern, prefix, date, seq }) {
  const d = toDate(date);
  return pattern
    .replace(/\{PREFIX\}/g, prefix || '')
    .replace(/\{YYYY\}/g, String(d.getFullYear()))
    .replace(/\{YY\}/g, String(d.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, pad(d.getMonth() + 1, 2))
    .replace(/\{SEQ(?::(\d+))?\}/g, (_m, width) => pad(seq, width ? Number(width) : 6));
}

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}
