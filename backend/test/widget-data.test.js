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

test('widget uses saved calendar-day readings even when API offers a rolling 24-hour return', () => {
 const now=Date.parse('2026-10-28T12:20:00Z');
 const snapshots=[{createdAt:'2026-10-27T22:59:00Z',totalValue:1000},{createdAt:'2026-10-28T10:00:00Z',totalValue:1100}];
 const data={loadedAt:new Date(now).toISOString(),portfolio:{totalValue:1120},snapshots,transactions:[{id:'in',attributes:{type:'deposit',in_or_out:'incoming',amount:'100',created_at:'2026-10-28T09:00:00Z'}}],portfolioApiHistory:{available:true,timeframe:'DAY',reportedReturnPercent:99,snapshots:[{createdAt:'2026-10-27T12:20:00Z',totalValue:500},{createdAt:'2026-10-28T12:10:00Z',totalValue:1110}]}};
 const value=compactWidgetData(data,{},now);
 assert.deepEqual(value.snapshots,snapshots);
 assert.equal(value.chart.periodLabel,'Heute');
 assert.equal(value.chart.points[0].time,Date.parse('2026-10-27T23:00:00Z')/1000);
 assert.equal(value.chart.points.at(-1).value,1120);
 assert.equal(value.chart.change,20);
 assert.equal(value.chart.percent,2);
 assert.notEqual(value.chart.percent,99);
});

test('widget daily gain and percentage match the calendar, including refund overrides', async () => {
 const {buildPortfolioDays,calendarDate}=await import('../performance-calendar.js');
 const now=Date.parse('2026-10-28T12:20:00Z');
 const data={loadedAt:new Date(now).toISOString(),portfolio:{totalValue:1120},snapshots:[{createdAt:'2026-10-27T22:59:00Z',totalValue:1000},{createdAt:'2026-10-28T10:00:00Z',totalValue:1100}],transactions:[{id:'refund',attributes:{type:'withdrawal',in_or_out:'outgoing',amount:'100',created_at:'2026-10-28T09:00:00Z'}}]};
 const overrides={refund:'refund'};
 const calendar=buildPortfolioDays({snapshots:data.snapshots,currentValue:data.portfolio.totalValue,loadedAt:data.loadedAt,transactions:data.transactions,cashflowOverrides:overrides,now}).get(calendarDate(now));
 const chart=compactWidgetData(data,overrides,now).chart;
 assert.equal(chart.change,calendar.gain);
 assert.equal(chart.percent,calendar.percent);
 assert.equal(chart.points.at(-1).value-chart.points[0].value,calendar.gain);
});

test('today follows Vienna midnight across 23-hour and 25-hour DST days', () => {
 for(const [start,end] of [['2026-03-28T23:00:00Z','2026-03-29T21:59:00Z'],['2026-10-24T22:00:00Z','2026-10-25T22:59:00Z']]) {
  const now=Date.parse(end);
  const data={loadedAt:end,portfolio:{totalValue:1100},snapshots:[{createdAt:new Date(Date.parse(start)-60000).toISOString(),totalValue:1000},{createdAt:new Date(Date.parse(start)+3600000).toISOString(),totalValue:1050}]};
  const chart=compactWidgetData(data,{},now).chart;
  assert.equal(chart.points[0].time,Date.parse(start)/1000);
  assert.equal(chart.change,100);
  assert.equal(chart.periodLabel,'Heute');
 }
});

test('a missing prior day is labelled as a partial recording, not a full day', () => {
 const now=Date.parse('2026-10-28T12:20:00Z');
 const data={loadedAt:new Date(now).toISOString(),portfolio:{totalValue:1100},snapshots:[{createdAt:'2026-10-26T22:00:00Z',totalValue:900},{createdAt:'2026-10-28T10:00:00Z',totalValue:1050}]};
 const chart=compactWidgetData(data,{},now).chart;
 assert.equal(chart.periodLabel,null);
 assert.equal(chart.completeDay,false);
 assert.equal(chart.change,50);
 assert.equal(chart.points[0].time,Date.parse('2026-10-28T10:00:00Z')/1000);
});
