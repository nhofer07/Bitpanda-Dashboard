import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatPercent, formatNumber, formatDateTime } from '../src/components/formatters.js';
test('missing values stay distinct from confirmed zero and all amounts share one format', () => {
  for (const value of [null, undefined, '', NaN, Infinity, true]) assert.equal(formatCurrency(value), '–');
  assert.equal(formatCurrency(0), '0,00 €');
  assert.equal(formatCurrency(-1234.5), '-1.234,50 €');
  assert.equal(formatCurrency('1234.5'), '1.234,50 €');
  assert.equal(formatPercent(0), '0,00 %');
  assert.equal(formatNumber(.00012345), '0,00012345');
  assert.equal(formatDateTime('invalid'), '–');
});

test('low unit prices retain four decimals and tiny prices never round to zero',async()=>{
 const {formatPrice,formatPriceNumber,priceDigits}=await import('../src/components/formatters.js');
 assert.equal(formatPrice(1.17234),'1,1723 €');
 assert.equal(formatPrice(.02317),'0,0232 €');
 assert.equal(formatPrice(1.17),'1,1700 €');
 assert.equal(formatPrice(.00001234),'0,00001234 €');
 assert.equal(formatPrice(30000.12),'30.000,12 €');
 assert.equal(formatPrice(null),'–');
 assert.equal(formatPriceNumber(1.17234,4),'1,1723');
 assert.equal(priceDigits(.02317),4);
 assert.equal(formatCurrency(1.17234),'1,17 €');
});

test('price precision adapts across all assets and trims unnecessary extra zeros',async()=>{
 const {formatPrice}=await import('../src/components/formatters.js');
 assert.equal(formatPrice(.89741234),'0,8974 €');
 assert.equal(formatPrice(.00000438),'0,00000438 €');
 assert.equal(formatPrice(2088.681234),'2.088,68 €');
 assert.equal(formatPrice(673.771234),'673,77 €');
});
