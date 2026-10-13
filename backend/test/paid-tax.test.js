import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePaidTax } from '../paid-tax.js';
const tx = (id, type, flow, amount, extra = {}) => ({ transaction_id: id, transaction_type: type, flow, asset_amount: { value: String(amount) }, currency_id: 'eur', wallet_owner: 'shared-default', credited_at: '2026-02-09T21:32:47Z', ...extra });
const op = (type, ...transactions) => ({ operation_type: type, transactions });
const options = { eurCurrencyId: 'eur', trades: [{ id: 'eth-sale', attributes: { cryptocoin_symbol: 'ETH' } }] };
const sale = op('advanced_trading_sell', tx('sale', 'sell', 'INCOMING', 1075, { trade: { trade_id: 'eth-sale' } }), tx('tax', 'tax', 'OUTGOING', 295.63));
const refund = op('refund', tx('refund', undefined, 'INCOMING', 295.63, { compensates: 'tax', compensates_info: { operation_type: 'advanced_trading_sell', transaction_type: 'tax' } }));

test('fully refunded crypto withholding is zero, even if the refund arrives before the sale in the payload', () => {
  const result = calculatePaidTax([refund, sale], options);
  assert.equal(result.salesPaid, 0);
  assert.equal(result.withheld, 295.63);
  assert.equal(result.refunded, 295.63);
  assert.equal(result.tradeTaxes['eth-sale'], 0);
  assert.equal(result.events.find(e => e.kind === 'refund').asset, 'ETH');
});
test('partial refunds reduce actual trade tax and unrelated credits do not', () => {
  const partial = structuredClone(refund); partial.transactions[0].asset_amount.value = '290.40';
  const result = calculatePaidTax([sale, partial, op('refund', tx('unrelated', undefined, 'INCOMING', 10))], options);
  assert.equal(result.salesPaid, 5.23);
  assert.equal(result.tradeTaxes['eth-sale'], 5.23);
});
test('cash tax settlements count once, while debt records and credit-wallet counterpart entries do not', () => {
  const result = calculatePaidTax([
    op('securities_tax_debt_record', tx('record', undefined, 'OUTGOING', 16.88, { wallet_owner: 'securities-tax-credit' })),
    op('securities_tax_debt_settlement', tx('paid', undefined, 'OUTGOING', 16.88), tx('counterpart', undefined, 'INCOMING', 16.88, { wallet_owner: 'securities-tax-credit' })),
    op('securities_tax_refund', tx('general-refund', undefined, 'INCOMING', 10))
  ], options);
  assert.equal(result.salesPaid, 6.88);
  assert.equal(result.events.length, 2);
});
test('dividend KESt remains separate from sale tax and foreign withholding/fees', () => {
  const result = calculatePaidTax([op('ca_dividend', tx('div-tax', 'tax', 'OUTGOING', 1.82), tx('foreign-tax', 'levy', 'OUTGOING', 3.88), tx('fee', 'fee', 'OUTGOING', 1))], options);
  assert.equal(result.salesPaid, 0);
  assert.equal(result.dividendsPaid, 1.82);
  assert.equal(result.totalPaid, 1.82);
});
test('refunds belong to the year of payment, including negative annual tax balances', () => {
  const nextYear = structuredClone(refund); nextYear.transactions[0].credited_at = '2026-12-31T23:30:00Z';
  const result = calculatePaidTax([sale, nextYear], options);
  assert.equal(result.yearly.find(y => y.period === '2026').salesPaid, 295.63);
  assert.equal(result.yearly.find(y => y.period === '2027').salesPaid, -295.63);
  assert.equal(result.salesPaid, 0);
});
test('duplicate transactions are not charged twice; non-EUR entries are not treated as EUR', () => {
  const result = calculatePaidTax([sale, sale, op('sell', tx('usd-tax', 'tax', 'OUTGOING', 100, { currency_id: 'usd' }))], options);
  assert.equal(result.salesPaid, 295.63);
  assert.equal(result.events.length, 1);
});
test('invalid amounts do not silently produce a paid-tax value', () => {
  const invalid = structuredClone(sale); invalid.transactions[1].asset_amount.value = 'invalid';
  assert.throws(() => calculatePaidTax([invalid], options));
});
test('a completed sale with no withholding is a known zero, rather than an estimate', () => {
  const result = calculatePaidTax([op('advanced_trading_sell', sale.transactions[0])], options);
  assert.equal(result.tradeTaxes['eth-sale'], 0);
  assert.equal(result.salesPaid, 0);
});

test('cash history years without tax bookings are shown explicitly as zero', () => {
  const oldSale = op('sell', tx('old-sale', 'sell', 'INCOMING', 100, { credited_at: '2025-05-01T10:00:00Z', trade: { trade_id: 'old-trade' } }));
  const result = calculatePaidTax([oldSale, sale], options);
  const year = result.yearly.find(y => y.period === '2025');
  assert.equal(year.salesPaid, 0);
  assert.equal(year.totalPaid, 0);
  assert.equal(year.withheld, 0);
  assert.equal(result.events.some(e => e.year === '2025'), false);
  assert.equal(result.salesPaid, 295.63);
});
