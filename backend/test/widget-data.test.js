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
