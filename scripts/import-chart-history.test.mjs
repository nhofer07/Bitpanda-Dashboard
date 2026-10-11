import test from 'node:test';
import assert from 'node:assert/strict';
import { importChartHistory } from './import-chart-history.mjs';

test('uses the source chart history and preserves local account data', () => {
  const portfolio = { totalValue: 123 };
  const result = importChartHistory({ portfolio, transactions: ['existing'], snapshots: [{ totalValue: 0 }] }, {
    portfolioHistoryStartedAt: '2026-10-01T00:00:00Z',
    snapshots: [{ createdAt: '2026-10-06T10:00:00Z', totalValue: 101 }, { createdAt: '2026-10-05T10:00:00Z', totalValue: 100 }]
  });
  assert.equal(result.portfolio, portfolio);
  assert.deepEqual(result.transactions, ['existing']);
  assert.deepEqual(result.snapshots.map(p => p.totalValue), [100, 101]);
  assert.equal(result.portfolioHistoryStartedAt, '2026-10-01T00:00:00.000Z');
});
test('keeps genuine zero balances and rejects invalid source records', () => {
  const point = { createdAt: '2026-10-01T10:00:00Z', totalValue: 0 };
  assert.equal(importChartHistory({}, { snapshots: [point] }).snapshots[0].totalValue, 0);
  assert.throws(() => importChartHistory({}, { snapshots: [{ ...point, totalValue: null }] }));
  assert.throws(() => importChartHistory({}, { snapshots: [{ ...point, createdAt: 'bad' }] }));
  assert.throws(() => importChartHistory({}, { snapshots: [] }));
});
