import test from 'node:test';
import assert from 'node:assert/strict';
import { saleProfit } from '../src/components/saleProfit.js';
const held = { currentQuantity: 10, costBasis: 1000, remainingFeeCostBasis: 10 };
const quote = { quote: { quantity: '5', price: '120', price_with_fee: '119', fee: '5', notional: '600' } };
test('partial security sale includes buy and sell fees and taxes gross gain without deducting security fees', () => {
 const r = saleProfit({quote, held, category:'stock'});
 assert.equal(r.gross,600); assert.equal(r.proceeds,595);
 assert.equal(r.acquisition,505); assert.equal(r.taxBasis,500);
 assert.equal(r.estimatedTax,27.5); assert.equal(r.netProceeds,567.5); assert.equal(r.netProfit,62.5);
});
test('crypto includes acquisition fees in estimated tax basis', () => {
 const r=saleProfit({quote,held,category:'crypto'});
 assert.equal(r.taxBasis,505); assert.equal(r.estimatedTax,26.13); assert.equal(r.netProfit,63.870000000000005);
});
test('a loss does not create an assumed tax refund', () => {
 const r=saleProfit({quote:{quote:{quantity:'5',price:'90',fee:'5'}},held,category:'etf'});
 assert.equal(r.estimatedTax,0); assert.equal(r.netProfit,-60);
});
test('unknown costs do not become zero and reported balance mismatches cannot reuse old buy fees', () => {
 assert.equal(saleProfit({quote,held:{...held,remainingFeeCostBasis:null},category:'stock'}).netProfit,null);
 assert.equal(saleProfit({quote,held:{...held,positionSource:'Bitpanda Portfolio API'},category:'stock'}).acquisition,null);
 assert.equal(saleProfit({quote,held:null,category:'stock'}).estimatedTax,null);
});
test('uses reconciled historical acquisition costs automatically', () => {
 const r=saleProfit({quote,held:{...held,positionSource:'Bitpanda Portfolio API',historicalAcquisitionCost:1020},category:'etf'});
 assert.equal(r.acquisition,510); assert.equal(r.taxBasis,500); assert.equal(r.netProfit,57.5);
});
test('oversized sales and unsupported tax categories remain unavailable', () => {
 assert.equal(saleProfit({quote,held:{...held,currentQuantity:1},category:'stock'}).netProfit,null);
 assert.equal(saleProfit({quote,held,category:'metal'}).estimatedTax,null);
});
test('ex ante cost information is never charged a second time', () => {
 const r=saleProfit({quote:{...quote,ex_ante:{costs_and_charges:{total_costs:{amount:'25'}}}},held,category:'stock'});
 assert.equal(r.netProfit,62.5);
});
