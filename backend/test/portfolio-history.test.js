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

test('screenshot reconstruction fills only the confirmed outage and is idempotent', () => {
  const before = {createdAt:'2026-10-13T17:44:29Z',totalValue:3334.34,openCostBasis:3349.6224498834,openPositionCount:8};
  const after = {createdAt:'2026-10-14T09:57:29Z',totalValue:3349.5};
  const input = [before,after];
  const filled = excludeCorrectedSnapshots(input);
  assert.ok(filled.length > 50);
  assert.equal(Math.max(...filled.map(p=>p.totalValue)),3357.12);
  assert.equal(filled[0],before);
  assert.equal(filled.at(-1),after);
  assert.ok(filled.slice(1,-1).every(p=>p.reconstructed && Date.parse(p.createdAt)>Date.parse(before.createdAt) && Date.parse(p.createdAt)<Date.parse(after.createdAt)));
  assert.deepEqual(excludeCorrectedSnapshots(filled),filled);
  assert.deepEqual(excludeCorrectedSnapshots([{...before,openCostBasis:5000},after]),[{...before,openCostBasis:5000},after]);
  assert.deepEqual(excludeCorrectedSnapshots([before,{...after,createdAt:'2026-10-14T10:57:29Z'}]),[before,{...after,createdAt:'2026-10-14T10:57:29Z'}]);
  const actual={createdAt:'2026-10-14T03:00:00Z',totalValue:3344};
  assert.ok(excludeCorrectedSnapshots([before,actual,after]).includes(actual));
});

const confirmedEthDip = [
  {
    "createdAt": "2026-10-14T15:49:11.573Z",
    "totalValue": 3234.577875097398,
    "openCostBasis": 2903.3924498834,
    "unrealizedProfit": -23.35457478600165,
    "openPositionCount": 6
  },
  {
    "createdAt": "2026-10-14T15:50:32.269Z",
    "totalValue": 3234.1129543982875,
    "openCostBasis": 3023.2624498833998,
    "unrealizedProfit": -23.519495485112202,
    "openPositionCount": 6
  },
  {
    "createdAt": "2026-10-14T15:51:27.507Z",
    "totalValue": 3234.1129543982875,
    "openCostBasis": 3023.2624498833998,
    "unrealizedProfit": -23.519495485112202,
    "openPositionCount": 6
  },
  {
    "createdAt": "2026-10-14T15:52:26.242Z",
    "totalValue": 3233.0463470037057,
    "openCostBasis": 3023.2624498833998,
    "unrealizedProfit": -24.586102879693954,
    "openPositionCount": 6
  },
  {
    "createdAt": "2026-10-14T15:53:31.280Z",
    "totalValue": 3231.63779768889,
    "openCostBasis": 3023.2624498833998,
    "unrealizedProfit": -25.994652194509854,
    "openPositionCount": 6
  },
  {
    "createdAt": "2026-10-14T15:55:32.835Z",
    "totalValue": 3232.5117842999166,
    "openCostBasis": 3023.2624498833998,
    "unrealizedProfit": -25.12066558348306,
    "openPositionCount": 6
  }
];
test('removes exactly the confirmed ETH override dip without removing another account or changing valid neighbors', () => {
 const neighbor = { createdAt: '2026-10-14T15:57:31.980Z', totalValue: 3330.8633047708986, openCostBasis: 3115.8466345522124, unrealizedProfit: -19.353329781313732, openPositionCount: 6 };
 const different = { ...confirmedEthDip[0], totalValue: confirmedEthDip[0].totalValue + 1 };
 assert.deepEqual(excludeCorrectedSnapshots([...confirmedEthDip, neighbor, different]), [different, neighbor]);
});
