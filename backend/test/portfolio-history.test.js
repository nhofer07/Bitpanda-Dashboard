import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioSnapshotIssue, excludeCorrectedSnapshots, snapshotFingerprint } from '../portfolio-history.js';
const valid = { loadedAt:'2026-10-06T18:07:09.248Z', portfolio:{totalValue:3406}, priceSummary:{unpricedPositions:0} };
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
