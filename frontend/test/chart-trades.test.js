import test from 'node:test';
import assert from 'node:assert/strict';
import { chartTrades } from '../src/components/chartTrades.js';
test('markers use actual executions, retain simultaneous trades and exclude invalid/outside trades', () => {
  const points = [{ date: '2026-01-01', close: 10 }, { date: '2026-02-01', close: 20 }];
  const trades = [
    { id: 'a', type: 'buy', time: { date_iso8601: '2026-01-10' }, price: '12', quantity: 2 },
    { id: 'b', type: 'sell', time: '2026-01-10', tradeValueBeforeFee: 30, fiat: 29, quantity: 2 },
    { type: 'buy', time: '2025-01-01', price: 1 },
    { type: 'buy', time: 'invalid', price: 1 },
    { type: 'buy', time: '2026-01-10', quantity: 0 },
  ];
  assert.deepEqual(chartTrades(trades, points).map(t => t.close), [12, 15]);
  assert.deepEqual(chartTrades(trades, []), []);
});
