import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, paymentBreakdown, statusBreakdown } from '../electron/services/reportService.js';
import { toCsv } from '../src/lib/csv.js';

test('monthly series has one bucket per day and sums revenue', () => {
  const rows = [
    { invoice_date: '2026-02-01', created_at: '2026-02-01T10:00:00Z', grand_total: 100, status: 'paid' },
    { invoice_date: '2026-02-01', created_at: '2026-02-01T11:00:00Z', grand_total: 50.5, status: 'paid' },
  ];
  const series = buildSeries('monthly', '2026-02-01', rows);
  assert.equal(series.length, 28);
  assert.equal(series[0].revenue, 150.5);
  assert.equal(series[0].count, 2);
});

test('yearly series has twelve month buckets', () => {
  const series = buildSeries('yearly', '2026-01-01', [{ invoice_date: '2026-03-10', grand_total: 10 }]);
  assert.equal(series.length, 12);
  assert.equal(series[2].revenue, 10);
});

test('breakdowns group payments and statuses', () => {
  const rows = [
    { payment_method: 'Cash', amount_paid: 10, status: 'paid' },
    { payment_method: null, amount_paid: 5, status: 'partial' },
    { payment_method: 'Cash', amount_paid: 1, status: 'paid' },
  ];
  assert.deepEqual(paymentBreakdown(rows), [{ method: 'Cash', amount: 11 }, { method: 'Not specified', amount: 5 }]);
  assert.deepEqual(statusBreakdown(rows), [{ status: 'paid', count: 2 }, { status: 'partial', count: 1 }]);
});

test('CSV escapes commas, quotes and newlines', () => {
  assert.equal(toCsv([['a,b', 'say "hi"', 'x\ny']]), '"a,b","say ""hi""","x\ny"');
  assert.equal(toCsv([[null, 1]]), ',1');
});
