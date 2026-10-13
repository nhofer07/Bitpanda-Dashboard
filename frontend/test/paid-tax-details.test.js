import test from 'node:test';
import assert from 'node:assert/strict';
import { paidTaxRecords } from '../src/components/paidTaxDetails.js';
const event = (id, amount, extra = {}) => ({ id, groupId: 'tax-1', asset: 'ETH', date: '2026-02-09T21:32:47Z', year: '2026', category: 'sales', amount, ...extra });
test('details group a sale with its full and partial refunds, preserving the underlying bookings', () => {
  const records = paidTaxRecords([event('tax', 295.63), event('refund', -290.40, { date: '2026-02-10T12:00:00Z' })], '2026');
  assert.equal(records[0].paid, 5.23);
  assert.equal(records[0].withheld, 295.63);
  assert.equal(records[0].refunded, 290.40);
  assert.equal(records[0].events.length, 2);
});
test('annual detail totals retain general corrections and exclude other years and dividends', () => {
  const records = paidTaxRecords([event('tax', 10), event('refund', -10), event('correction', -5, { groupId: 'correction' }), event('div', 2, { category: 'dividends' }), event('old', 4, { year: '2025' })], '2026');
  assert.equal(records.length, 2);
  assert.equal(records.reduce((sum, record) => sum + record.paid, 0), -5);
  assert.equal(records.find(r => r.id === 'tax-1').paid, 0);
});
