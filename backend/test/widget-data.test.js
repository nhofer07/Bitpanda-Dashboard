import test from 'node:test';
import assert from 'node:assert/strict';
import { compactWidgetData } from '../widget-data.js';
test('widget response keeps chart baseline and cashflows but excludes full portfolio details', () => {
 const now=Date.parse('2026-10-06T12:00:00Z');
 const data={loadedAt:'2026-10-06T12:00:00Z',portfolioHistoryStartedAt:'2026-10-01T00:00:00Z',portfolio:{totalValue:1000,secret:'omit'},snapshots:[{createdAt:'2026-10-01T12:00:00Z',totalValue:900,private:'omit'},{createdAt:'2026-10-05T12:00:00Z',totalValue:950}],transactions:[{id:'old',attributes:{created_at:'2026-10-01T12:00:00Z'}},{id:'today',attributes:{created_at:'2026-10-06T10:00:00Z',type:'deposit',in_or_out:'incoming',amount:'100',private:'omit'}}],private:'omit'};
 const value=compactWidgetData(data,{overrides:{today:'ignore'}},now);
 assert.deepEqual(value.portfolio,{totalValue:1000});
 assert.equal(value.snapshots.length,2);
 assert.equal(value.snapshots[0].private,undefined);
 assert.equal(value.transactions.length,1);
 assert.equal(value.transactions[0].attributes.private,undefined);
 assert.deepEqual(value.cashflowOverrides,{today:'ignore'});
 assert.equal(value.private,undefined);
});

test('widget follows the official history while minute recording is paused and falls back on stale data', () => {
 const now=Date.parse('2026-10-28T12:20:00Z');
 const api={available:true,firstPointAt:'2026-10-27T12:10:00Z',snapshots:[{createdAt:'2026-10-27T12:10:00Z',totalValue:100},{createdAt:'2026-10-28T12:10:00Z',totalValue:110}]};
 const data={loadedAt:'2026-10-28T12:20:00Z',portfolioHistoryStartedAt:'2026-10-01T00:00:00Z',portfolio:{totalValue:111},snapshots:[{createdAt:'2026-10-28T12:20:00Z',totalValue:111}],portfolioApiHistory:api};
 assert.deepEqual(compactWidgetData(data,{},now).snapshots,api.snapshots);
 api.stale=true;
 assert.equal(compactWidgetData(data,{},now).snapshots.at(-1).totalValue,111);
});

test('prepared widget chart matches dashboard API cashflow buckets without appending the live balance', () => {
 const now=Date.parse('2026-10-28T12:20:00Z');
 const snapshots=[1000,1100,1110,1120].map((totalValue,i)=>({createdAt:`2026-10-28T${String(9+i).padStart(2,'0')}:00:00Z`,totalValue}));
 const data={loadedAt:new Date(now).toISOString(),portfolio:{totalValue:9999},snapshots:[],transactions:[{id:'in',attributes:{type:'deposit',in_or_out:'incoming',amount:'100',created_at:'2026-10-28T10:30:00Z'}}],portfolioApiHistory:{available:true,timeframe:'DAY',currency:'EUR',loadedAt:new Date(now).toISOString(),firstPointAt:snapshots[0].createdAt,lastPointAt:snapshots.at(-1).createdAt,snapshots,reportedReturnPercent:7.5}};
 const value=compactWidgetData(data,{},now);
 assert.equal(value.portfolio.totalValue,9999);
 assert.deepEqual(value.chart.points.map(p=>p.value),[1100,1100,1110,1120]);
 assert.equal(value.chart.change,20);
 assert.equal(value.chart.percent,7.5);
 assert.equal(value.chart.periodLabel,'24 Stunden');
 assert.equal(value.chart.lastPointAt,snapshots.at(-1).createdAt);
 assert.equal(value.chart.points.length,4);
});

test('widget and dashboard use the same independently confirmed correction', () => {
 const now=Date.parse('2026-10-28T12:20:00Z');
 const snapshots=[3309,3521,3319,3304].map((totalValue,i)=>({createdAt:`2026-10-28T${String(9+i).padStart(2,'0')}:00:00Z`,totalValue}));
 const data={loadedAt:new Date(now).toISOString(),portfolio:{totalValue:3304},snapshots:[{createdAt:'2026-10-28T10:59:00Z',totalValue:3315},{createdAt:'2026-10-28T11:01:00Z',totalValue:3316}],portfolioApiHistory:{available:true,timeframe:'DAY',loadedAt:new Date(now).toISOString(),firstPointAt:snapshots[0].createdAt,lastPointAt:snapshots.at(-1).createdAt,snapshots,reportedReturnPercent:99}};
 const value=compactWidgetData(data,{},now);
 assert.equal(value.chart.points[1].value,3315);
 assert.equal(value.chart.corrections[0].originalValue,3521);
 assert.notEqual(value.chart.percent,99);
 assert.equal(data.portfolioApiHistory.snapshots[1].totalValue,3521);
});
