import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioHistoryCashflows} from '../src/components/portfolioHistoryCashflows.js';
import {cashflowAdjustedPoints,portfolioPeriodResult} from '../src/components/chartCashflows.js';
const time=date=>Date.parse(date);
const points=[{time:time('2026-10-26T08:00Z'),value:3256.91},{time:time('2026-10-26T09:00Z'),value:3287.90},{time:time('2026-10-26T10:00Z'),value:3282.98}];
const flow={id:'deposit',time:time('2026-10-26T09:08:59Z'),signedAmount:25,value:25,classification:'deposit'};
test('a deposit already included in the 09:00 bucket does not produce a fake performance spike',()=>{
 const result=portfolioHistoryCashflows(points,[flow],'2026-10-26T10:20Z');
 assert.equal(result.calculation[0].time,points[1].time);
 assert.equal(result.markers[0].time,flow.time);
 assert.equal(result.markers[0].chartTime,points[1].time);
 const adjusted=cashflowAdjustedPoints(points,result.calculation);
 assert.ok(Math.abs((adjusted[1].adjustedValue-adjusted[0].adjustedValue)-5.99)<1e-8);
 assert.ok(Math.abs(portfolioPeriodResult(points,result.calculation).profit-1.07)<1e-8);
 assert.equal(points[1].value,3287.90);
});
test('first-bucket flows are already included in the starting value; last-bucket flows remain readable',()=>{
 const first={...flow,time:points[0].time+10000,signedAmount:100};
 const last={...flow,id:'withdraw',time:points.at(-1).time+10000,signedAmount:-10};
 const outside={...flow,time:time('2026-10-26T12:00Z')};
 const result=portfolioHistoryCashflows(points,[first,last,outside],'2026-10-26T10:20Z');
 assert.equal(result.markers.length,2);
 assert.ok(Math.abs(portfolioPeriodResult(points,result.calculation).profit-(3282.98-3256.91+10))<1e-8);
});
test('six-hour and daily buckets retain simultaneous bookings and do not mutate booking dates',()=>{
 const series=[{time:time('2026-10-26T00:00Z'),value:100},{time:time('2026-10-26T06:00Z'),value:125},{time:time('2026-10-26T12:00Z'),value:125}];
 const result=portfolioHistoryCashflows(series,[flow,{...flow,id:'second'}],'2026-10-26T15:00Z');
 assert.deepEqual(result.calculation.map(p=>p.time),[series[1].time,series[1].time]);
 assert.equal(result.markers[0].time,flow.time);
});

test('a booking at the next bucket boundary is not attributed to the previous final value',()=>{
 const boundary={...flow,time:time('2026-10-26T11:00Z')};
 assert.equal(portfolioHistoryCashflows(points,[boundary],'2026-10-26T11:01Z').markers.length,0);
});

test('September deposit and later withdrawal do not create the reported fictitious 3800 euro peak',()=>{
 const series=[['2026-09-02',2950],['2026-09-03',3525],['2026-09-04',3265],['2026-09-05',3280]].map(([date,value])=>({time:time(date+'T00:00Z'),value}));
 const flows=[{time:time('2026-09-03T16:14Z'),signedAmount:550},{time:time('2026-09-04T12:00Z'),signedAmount:-275}];
 const old=cashflowAdjustedPoints(series,flows);
 assert.equal(old[1].adjustedValue,3800);
 const corrected=cashflowAdjustedPoints(series,portfolioHistoryCashflows(series,flows,'2026-09-05T23:59Z').calculation);
 assert.equal(corrected[1].adjustedValue,3250);
 assert.deepEqual(corrected.map(p=>p.adjustedValue),[3225,3250,3265,3280]);
 assert.deepEqual(series.map(p=>p.value),[2950,3525,3265,3280]);
});
test('missing history intervals do not assign a later booking to an older valuation',()=>{
 const series=[['2026-09-01',100],['2026-09-02',100],['2026-09-03',100],['2026-09-10',150]].map(([date,value])=>({time:time(date+'T00:00Z'),value}));
 const flow={time:time('2026-09-08T12:00Z'),signedAmount:50};
 const result=portfolioHistoryCashflows(series,[flow],'2026-09-10T12:00Z');
 assert.equal(result.calculation[0].time,series.at(-1).time);
 assert.equal(result.markers[0].time,flow.time);
});
