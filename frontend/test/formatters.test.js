import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatPercent, formatNumber, formatDateTime } from '../src/components/formatters.js';
test('missing values stay distinct from confirmed zero and all amounts share one format', () => {
  for (const value of [null, undefined, '', NaN, Infinity, true]) assert.equal(formatCurrency(value), '–');
  assert.equal(formatCurrency(0), '0,00 €');
  assert.equal(formatCurrency(-1234.5), '-1.234,50 €');
  assert.equal(formatCurrency('1234.5'), '1.234,50 €');
  assert.equal(formatPercent(0), '0,00 %');
  assert.equal(formatNumber(.00012345), '0,00012345');
  assert.equal(formatDateTime('invalid'), '–');
});
