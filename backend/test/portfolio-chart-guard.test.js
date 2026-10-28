import test from 'node:test';
import assert from 'node:assert/strict';
import { guardedPortfolioSnapshots } from '../portfolio-chart-guard.js';
import { portfolioChartPoints } from '../../frontend/src/components/portfolioChartPoints.js';
const series = values => values.map((totalValue, i) => ({ createdAt: new Date(Date.UTC(2026, 9, 22, 10, i)).toISOString(), totalValue, openCostBasis: i < 2 ? 3000 : 2700, openPositionCount: i < 2 ? 8 : 7 }));
test('repairs upward and downward settlement runs even when holdings change', () => {
  for (const values of [[3300,3301,3900,3899,3302,3301], [3300,3301,2900,2899,3302,3301]]) {
    const points = series(values);
    assert.deepEqual(guardedPortfolioSnapshots(points), [points[0],points[1],points[4],points[5]]);
    assert.deepEqual(guardedPortfolioSnapshots(points, {pending:false}), [points[0],points[1],points[4],points[5]]);
  }
});
test('quarantines a live spike and restores a confirmed permanent change', () => {
  const points = series([3300,3301,3900,3901]);
  assert.equal(guardedPortfolioSnapshots(points.slice(0,3)).length, 2);
  assert.deepEqual(guardedPortfolioSnapshots(points), points);
  assert.deepEqual(guardedPortfolioSnapshots(points.slice(0,3), {pending:false}), points.slice(0,3));
});
test('currentValue cannot reintroduce a quarantined observation', () => {
  const points = series([3300,3301,3900]);
  const chart = portfolioChartPoints({snapshots:points,loadedAt:points[2].createdAt,currentValue:3900});
  assert.deepEqual(chart.map(p=>p.value),[3300,3301]);
});
test('preserves ordinary movement and changes across outages', () => {
  const points = series([3300,3301,3290,3310]);
  assert.deepEqual(guardedPortfolioSnapshots(points),points);
  const distant = series([3300,3900]);
  distant[1].createdAt='2026-10-23T10:00:00Z';
  assert.deepEqual(guardedPortfolioSnapshots(distant),distant);
});
