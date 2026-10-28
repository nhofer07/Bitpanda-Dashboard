import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioChartPoints } from '../src/components/portfolioChartPoints.js';

const snapshots = [{ createdAt: '2026-10-01T12:00:00Z', totalValue: 100 }, { createdAt: '2026-10-02T12:00:00Z', totalValue: 105 }];
test('legacy history survives a missing or invalid start date and unavailable current valuation', () => {
  for (const historyStartedAt of [undefined, 'invalid']) {
    const points = portfolioChartPoints({ snapshots, historyStartedAt, loadedAt: '2026-10-14T12:00:00Z' });
    assert.deepEqual(points.map(p => p.value), [100, 105]);
  }
});
test('an explicit recording start is respected and missing values never become zero', () => {
  const points = portfolioChartPoints({ snapshots: [...snapshots, { createdAt: '2026-10-03T12:00:00Z', totalValue: null }], historyStartedAt: '2026-10-02T00:00:00Z', loadedAt: '2026-10-04T12:00:00Z', currentValue: null });
  assert.deepEqual(points.map(p => p.value), [105]);
});
