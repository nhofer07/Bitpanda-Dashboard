import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfitValue, realizedTradingFees } from '../src/components/profitResults.js';

test('a manual fee reducing realized profit to zero stays zero in totals and rankings', () => {
  const asset = { realizedProfit: 10, netRealizedProfit: 0, unrealizedProfit: 5 };
  assert.equal(getProfitValue(asset, 'realized'), 0);
  assert.equal(getProfitValue(asset, 'combined'), 5);
  assert.equal(getProfitValue(asset, 'unrealized'), 5);
  assert.equal(getProfitValue({ realizedProfit: 10 }, 'realized'), 10);
});

test('realized fee breakdown excludes the purchase fees of unsold holdings', () => {
  const asset = { grossRealizedProfit: 20, estimatedTax: 2, realizedProfit: 15, tradingFees: 6,
    trades: [{ type: 'buy', tradingFee: 4 }, { type: 'sell', tradingFee: 2, allocatedBuyFee: 1 }] };
  assert.equal(realizedTradingFees(asset), 3);
  assert.equal(asset.grossRealizedProfit - realizedTradingFees(asset) - asset.estimatedTax, asset.realizedProfit);
});
