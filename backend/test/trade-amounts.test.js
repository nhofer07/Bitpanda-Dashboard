import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedTradeFee, tradeValueBeforeFee, allocateSalePurchaseFees } from '../trade-amounts.js';
const trade = (type, fee, price) => ({ attributes: { type, price, fee } });
test('selling rewards as well as purchased holdings cannot allocate purchase fees twice', () => {
  assert.deepEqual(allocateSalePurchaseFees(12, 10, 2), { allocatedBuyFee: 2, unmatchedQuantity: 2 });
  assert.deepEqual(allocateSalePurchaseFees(5, 10, 2), { allocatedBuyFee: 1, unmatchedQuantity: 0 });
  assert.deepEqual(allocateSalePurchaseFees(2, 0, 0), { allocatedBuyFee: 0, unmatchedQuantity: 2 });
});
test('reads the exact nested Bitpanda fee, including zero', () => {
  assert.equal(reportedTradeFee(trade('sell', { attributes: { fee_amount_in_fiat: '2.69000000' } })), 2.69);
  assert.equal(reportedTradeFee(trade('buy', { attributes: { fee_amount_in_fiat: '0' } })), 0);
  assert.equal(reportedTradeFee(trade('sell', '1')), 1);
  assert.equal(reportedTradeFee(trade('sell', { attributes: {} })), null);
});
test('restores pre-fee values without deducting an inclusive execution fee twice', () => {
  const sale = trade('sell', { attributes: { fee_amount_in_fiat: '2.69' } }, '1760.28');
  assert.equal(tradeValueBeforeFee(sale, 0.6107, 1075, 2.69), 1077.69);
  assert.equal(tradeValueBeforeFee(trade('buy', '1', '100'), 1, 101, 1), 100);
});

test('new operation fees fill missing legacy values, including explicit zero', async () => {
  const { enrichTradesWithBookedFees } = await import('../trade-amounts.js');
  const trades = [{ id: 'silver', attributes: { type: 'sell', amount_fiat: '906.86' } }, { id: 'cash', attributes: { type: 'buy' } }];
  const operations = [{ transactions: [
    { currency_id: 'eur', trade: { trade_id: 'silver', fee: { currency_id: 'eur', value: '18.14' } } },
    { currency_id: 'eur', trade: { trade_id: 'cash', fee: { currency_id: 'eur', value: '0' } } },
    { asset_id: 'silver', trade: { trade_id: 'silver', fee: { asset_id: 'silver', value: '100' } } }
  ] }];
  const result = enrichTradesWithBookedFees(trades, operations, 'eur');
  assert.equal(reportedTradeFee(result[0]), 18.14);
  assert.equal(reportedTradeFee(result[1]), 0);
  assert.equal(tradeValueBeforeFee(result[0], 1, 906.86, 18.14), 925);
  assert.equal(reportedTradeFee(trades[0]), null);
});

test('internal funding credits cannot overwrite the actual buy fee regardless of row order', async () => {
  const { enrichTradesWithBookedFees } = await import('../trade-amounts.js');
  const trades = [{ id: 'silver', attributes: { type: 'buy' } }];
  const debit = { currency_id: 'eur', flow: 'OUTGOING', trade: { trade_id: 'silver', fee: { currency_id: 'eur', value: '2.55' } } };
  const funding = { ...debit, flow: 'INCOMING', trade: { trade_id: 'silver', fee: { currency_id: 'eur', value: '0' } } };
  for (const transactions of [[debit, funding], [funding, debit]]) {
    const [result] = enrichTradesWithBookedFees(trades, [{ transactions }], 'eur');
    assert.equal(reportedTradeFee(result), 2.55);
    assert.equal(result.attributes.dashboardFeeSource, 'operations');
  }
});
