import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatInvoiceNumber, counterKeyFor, validateNumberFormat } from '../shared/numbering.js';

test('default pattern yields INV-2026-000001', () => {
  const n = formatInvoiceNumber({ pattern: '{PREFIX}-{YYYY}-{SEQ:6}', prefix: 'INV', date: '2026-10-08', seq: 1 });
  assert.equal(n, 'INV-2026-000001');
});

test('sequence width and two-digit year tokens', () => {
  assert.equal(formatInvoiceNumber({ pattern: '{PREFIX}/{YY}{MM}/{SEQ:4}', prefix: 'GT', date: '2026-03-01', seq: 42 }), 'GT/2603/0042');
  assert.equal(formatInvoiceNumber({ pattern: '{PREFIX}{SEQ}', prefix: 'X', date: '2026-03-01', seq: 7 }), 'X000007');
});

test('counter key resets per year when the pattern includes the year', () => {
  const a = counterKeyFor({ pattern: '{PREFIX}-{YYYY}-{SEQ:6}', prefix: 'INV', date: '2026-01-02' });
  const b = counterKeyFor({ pattern: '{PREFIX}-{YYYY}-{SEQ:6}', prefix: 'INV', date: '2027-01-02' });
  assert.notEqual(a, b);
});

test('counter key is shared across years when the pattern has no date token', () => {
  const a = counterKeyFor({ pattern: '{PREFIX}-{SEQ:6}', prefix: 'INV', date: '2026-01-02' });
  const b = counterKeyFor({ pattern: '{PREFIX}-{SEQ:6}', prefix: 'INV', date: '2027-01-02' });
  assert.equal(a, b);
});

test('validateNumberFormat rejects missing sequence and unknown tokens', () => {
  assert.equal(validateNumberFormat('{PREFIX}-{YYYY}-{SEQ:6}'), null);
  assert.match(validateNumberFormat('{PREFIX}-{YYYY}'), /SEQ/);
  assert.match(validateNumberFormat('{PREFIX}-{FOO}-{SEQ}'), /Unknown token/);
  assert.ok(validateNumberFormat(''));
});
