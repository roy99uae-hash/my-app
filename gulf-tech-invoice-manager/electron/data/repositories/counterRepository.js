/**
 * Atomic named counters used for invoice sequence numbers.
 */
export class CounterRepository {
  /** @param {import('../database.js').AppDatabase} db */
  constructor(db) {
    this.db = db;
  }

  /**
   * Increment a counter and return the new value. Runs inside the caller's
   * transaction so numbers are never duplicated.
   * @param {string} key
   * @returns {number}
   */
  next(key) {
    this.db.run(
      'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1',
      [key],
    );
    return this.db.get('SELECT value FROM counters WHERE key = ?', [key]).value;
  }

  /** Peek at the next number without consuming it. */
  peek(key) {
    const row = this.db.get('SELECT value FROM counters WHERE key = ?', [key]);
    return (row ? row.value : 0) + 1;
  }

  /** Ensure the counter is at least `value` (used when importing invoices). */
  ensureAtLeast(key, value) {
    this.db.run(
      'INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = MAX(value, excluded.value)',
      [key, value],
    );
  }
}
