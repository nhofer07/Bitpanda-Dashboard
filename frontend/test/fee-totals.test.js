import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeFeeTotal,sumFees} from '../src/components/feeTotals.js';
test('Microsoft funding appears in total fees exactly once, alongside the sale fee',()=>{
 const rows=[{tradingFee:0},{tradingFee:1,financingFee:43.36,allocatedBuyFee:2}];
 assert.equal(sumFees(rows),44.36);
 assert.equal(sumFees(rows,'tradingFee'),1);
 assert.equal(sumFees(rows,'financingFee'),43.36);
 assert.equal(tradeFeeTotal(rows[1]),44.36);
});
test('funding-only trades are visible and missing legacy fields do not break totals',()=>{
 assert.equal(tradeFeeTotal({tradingFee:0,financingFee:7.66}),7.66);
 assert.equal(sumFees([{tradingFee:1},{}]),1);
 assert.equal(sumFees([]),0);
});
