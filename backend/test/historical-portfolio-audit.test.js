import { test } from 'node:test'; import assert from 'node:assert/strict';
import { suspiciousPortfolioPoints, historicalHoldings, auditHistoricalPortfolio } from '../historical-portfolio-audit.js';
const DAY=86400000, base=Date.parse('2026-01-01T00:00:00Z');
const points=[3400,3390,4700,3410,3420].map((value,i)=>({time:base+i*2*DAY,value}));
const ledger=[{walletId:'wallet',unitId:'asset',symbol:'TEST',name:'Test',date:'2025-12-01T00:00:00Z',order:1,balanceAfter:10,delta:10,wallet:'shared-default',balanceCheck:'matched'}];
test('isolated daily spikes trigger review; cashflows and sustained moves do not',()=>{
 assert.equal(suspiciousPortfolioPoints(points).length,1);
 assert.equal(suspiciousPortfolioPoints(points,[{time:points[2].time,signedAmount:1300}]).length,0);
 assert.equal(suspiciousPortfolioPoints([3400,4700,4700,4710].map((value,i)=>({time:base+i*DAY,value}))).length,0);
 assert.equal(suspiciousPortfolioPoints(points.map(p=>({...p,time:base+(p.time-base)/24}))).length,0);
});
test('wallet balances are not double-counted and incomplete histories remain unknown',()=>{
 const moves=[...ledger,{...ledger[0],id:'transfer',date:'2026-01-02T00:00:00Z',balanceAfter:0,delta:-10},{...ledger[0],walletId:'staking',date:'2026-01-02T00:00:00Z',balanceAfter:10,delta:10}];
 assert.equal(historicalHoldings(moves,base+2*DAY).holdings[0].quantity,10);
 assert.equal(historicalHoldings([{...ledger[0],delta:2}],base).available,false);
 assert.equal(historicalHoldings([{...ledger[0],isDebt:true}],base).available,false);
});
test('full independent valuation contradicts a spike without changing the raw series',async()=>{
 const snapshots=points.map(p=>({createdAt:new Date(p.time).toISOString(),totalValue:p.value}));
 const r=await auditHistoricalPortfolio({snapshots,ledger,loadedAt:'2026-02-01T00:00:00Z',loadPrices:async()=>({currency:'EUR',source:'test',history:[{date:'2026-01-06T00:00:00Z',close:340}]})});
 assert.equal(r.checks[0].status,'contradicted');assert.equal(r.checks[0].reconstructedValue,3400);assert.equal(snapshots[2].totalValue,4700);
});
test('missing, stale or future prices never certify a correction',async()=>{
 for(const date of ['2025-12-01T00:00:00Z','2026-01-08T00:00:00Z']){
  const r=await auditHistoricalPortfolio({snapshots:points.map(p=>({createdAt:new Date(p.time).toISOString(),totalValue:p.value})),ledger,loadedAt:'2026-02-01T00:00:00Z',loadPrices:async()=>({currency:'EUR',history:[{date,close:340}]})});
  assert.equal(r.checks[0].status,'unverified');assert.equal(r.checks[0].reconstructedValue,null);
 }
});
