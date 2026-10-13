import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioSnapshotIssue, excludeCorrectedSnapshots, snapshotFingerprint, excludeIsolatedPortfolioDips } from '../portfolio-history.js';
const valid = { loadedAt:'2026-10-06T18:07:09.248Z', portfolio:{totalValue:3406}, priceSummary:{unpricedPositions:0} };
const series = values => values.map((totalValue, i) => ({createdAt:new Date(Date.UTC(2026,9,13,17,i)).toISOString(),totalValue,openCostBasis:3350,openPositionCount:8}));
test('automatically removes an isolated valuation dip after two recovery readings', () => {
  const points = series([3337,3338,3274,3337,3336]);
  assert.deepEqual(excludeIsolatedPortfolioDips(points),points.filter((_,i)=>i!==2));
  assert.deepEqual(excludeCorrectedSnapshots(points),points.filter((_,i)=>i!==2));
});
test('preserves sustained falls, small fluctuations, trades and unconfirmed readings', () => {
  for (const values of [[3337,3338,3274,3275,3276],[3337,3338,3320,3337,3336],[3337,3338,3337,3336,3274]]) {
    const points=series(values);assert.deepEqual(excludeIsolatedPortfolioDips(points),points);
  }
  const traded=series([3337,3338,3274,3337,3336]);traded[2].openCostBasis-=60;
  assert.deepEqual(excludeIsolatedPortfolioDips(traded),traded);
  const distant=series([3337,3338,3274,3337,3336]);distant[4].createdAt='2026-10-13T18:00:00Z';
  assert.deepEqual(excludeIsolatedPortfolioDips(distant),distant);
});
test('does not record totals from failed balance, price or cash requests',()=>{
  for(const field of ['balanceError','priceError','liquidBalanceError']) assert.ok(portfolioSnapshotIssue({...valid,[field]:'fetch failed'}));
  assert.ok(portfolioSnapshotIssue({...valid,priceSummary:{unpricedPositions:1}}));
});
test('keeps valid zero balances and legitimate large price changes',()=>{
  assert.equal(portfolioSnapshotIssue({...valid,portfolio:{totalValue:0}}),null);
  assert.equal(portfolioSnapshotIssue({...valid,portfolio:{totalValue:100000}}),null);
  assert.ok(portfolioSnapshotIssue({...valid,portfolio:{totalValue:NaN}}));
});
test('excludes only the exact corrected point, including after reimport',()=>{
  const before={createdAt:'2026-10-06T18:06:09.735Z',totalValue:3406};
  const error={createdAt:valid.loadedAt,totalValue:5108};
  const after={createdAt:'2026-10-06T18:08:11.765Z',totalValue:3405};
  assert.deepEqual(excludeCorrectedSnapshots([before,error,after],[{createdAt:'2026-10-06T20:07:09.248+02:00'}]),[before,after]);
  assert.deepEqual(excludeCorrectedSnapshots([before,error,after],[]),[before,error,after]);
});

test('confirmed repair matches the full record and preserves other accounts at that time',()=>{
  const bad={createdAt:valid.loadedAt,totalValue:5108,openCostBasis:5117,unrealizedProfit:-9,openPositionCount:9};
  const other={...bad,totalValue:5110};
  assert.deepEqual(excludeCorrectedSnapshots([bad,other],[],new Set([snapshotFingerprint(bad)])),[other]);
});

// Actual cash debit preceding the Caterpillar holding on 13 October.
test('repairs a confirmed cash-to-holding settlement gap', () => {
  const points = [{"createdAt": "2026-10-13T17:32:29.989Z", "totalValue": 3338.9872145075933, "openCostBasis": 3288.0424498834, "unrealizedProfit": -14.465235375806515, "openPositionCount": 7}, {"createdAt": "2026-10-13T17:33:29.581Z", "totalValue": 3337.385789412733, "openCostBasis": 3288.0424498834, "unrealizedProfit": -16.066660470666648, "openPositionCount": 7}, {"createdAt": "2026-10-13T17:34:29.522Z", "totalValue": 3274.337110812501, "openCostBasis": 3288.0424498834, "unrealizedProfit": -16.53533907089877, "openPositionCount": 7}, {"createdAt": "2026-10-13T17:36:30.671Z", "totalValue": 3336.4123004903763, "openCostBasis": 3349.6224498834, "unrealizedProfit": -16.040149393023512, "openPositionCount": 8}, {"createdAt": "2026-10-13T17:37:32.070Z", "totalValue": 3336.3576974600933, "openCostBasis": 3349.6224498834, "unrealizedProfit": -16.094752423306545, "openPositionCount": 8}];
  assert.deepEqual(excludeIsolatedPortfolioDips(points),points.filter((_,i)=>i!==2));
  const withdrawal=points.map(p=>({...p}));
  withdrawal[3].openCostBasis+=10;withdrawal[4].openCostBasis+=10;
  assert.deepEqual(excludeIsolatedPortfolioDips(withdrawal),withdrawal);
});
