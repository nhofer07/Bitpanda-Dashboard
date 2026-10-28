import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReportedPortfolio } from '../reported-portfolio.js';

test('ETH quantity and entry price use Bitpanda account fields instead of stale reconstruction', () => {
  const old = { assetKey: 'ETH', currentQuantity: 0.14700228, costBasis: 351.01, averageRemainingCost: 2387.76, manualPosition: true };
  const reported = { assetKey: 'ETH', balance: 0.19268607, availableBalance: 0.19, averageBuyPrice: 2341.92963545, investedAmount: 451.26 };
  const [position] = applyReportedPortfolio([old], [reported]);
  assert.equal(position.currentQuantity, 0.19268607);
  assert.equal(position.averageRemainingCost, 2341.92963545);
  assert.equal(position.costBasis, 451.26);
  assert.equal(position.manualPosition, false);
  assert.equal(position.averageEntrySource, 'Bitpanda Portfolio API');
});

test('reported holdings missing from trade history are included once and zero balances remove old positions', () => {
  const rows = [
    { assetKey: 'BTC', name: 'Bitcoin', balance: 0.01, averageBuyPrice: 70000, investedAmount: 700 },
    { assetKey: 'ETH', balance: 0 }
  ];
  const result = applyReportedPortfolio([{ assetKey: 'ETH', currentQuantity: 1 }], rows);
  assert.deepEqual(result.map(p => p.assetKey), ['BTC']);
  assert.equal(result[0].currentQuantity, 0.01);
  assert.equal(applyReportedPortfolio(result, rows)[0].currentQuantity, 0.01);
});

test('missing EUR entry price remains a labelled historical fallback instead of zero', () => {
  const [position] = applyReportedPortfolio([{ assetKey: 'ETH', averageRemainingCost: 2000 }], [{ assetKey: 'ETH', balance: 0.2, averageBuyPrice: null, investedAmount: null }]);
  assert.equal(position.averageRemainingCost, 2000);
  assert.equal(position.costBasis, 400);
  assert.equal(position.averageEntrySource, 'Trade-Historie');
  const [unknown] = applyReportedPortfolio([], [{ assetKey: 'NEW', balance: 1, averageBuyPrice: null, investedAmount: null }]);
  assert.equal(unknown.averageRemainingCost, null);
  assert.equal(unknown.costBasis, null);
});

test('invalid balances do not erase a valid position and reserved balances are not added twice', () => {
  const old = { assetKey: 'ETH', currentQuantity: 0.2, averageRemainingCost: 2000 };
  assert.equal(applyReportedPortfolio([old], [{ assetKey: 'ETH', balance: null }])[0].currentQuantity, 0.2);
  assert.equal(applyReportedPortfolio([old], [{ assetKey: 'ETH', balance: 0.2, availableBalance: 0.1, averageBuyPrice: 2000, investedAmount: 400 }])[0].currentQuantity, 0.2);
});

test('Micron retains the exact reported position value and account asset price',async()=>{
 const {valueOpenPosition,accountAssetTicker}=await import('../reported-portfolio.js');
 const [position]=applyReportedPortfolio([{assetKey:'MU',currentQuantity:.25,costBasis:195.35,remainingFeeCostBasis:1}], [{assetId:'mu-security',assetKey:'MU',balance:.25,investedAmount:195.35,averageBuyPrice:781.4,currentValue:195.48}]);
 const ticker=accountAssetTicker({data:{asset_id:'mu-security',currency_id:'eur',price:'781.90000000'}},'mu-security','eur');
 const result=valueOpenPosition(position,ticker);
 assert.equal(result.currentValue,195.48);
 assert.equal(result.currentPrice,781.9);
 assert.equal(position.costBasis,195.35);
 assert.equal(position.historicalAcquisitionCost,196.35);
 assert.equal(result.priceSource,'Bitpanda Portfolio API');
 assert.ok(Math.abs(result.unrealizedProfit-.13)<1e-9);
});

test('a conflicting legacy ticker cannot overwrite account valuation or masquerade as the account unit price',async()=>{
 const {valueOpenPosition}=await import('../reported-portfolio.js');
 const [position]=applyReportedPortfolio([], [{assetId:'mu-security',assetKey:'MU',balance:.25,investedAmount:195.35,currentValue:195.48}]);
 const result=valueOpenPosition(position,{price:768.9,currency:'EUR'});
 assert.equal(result.currentValue,195.48);
 assert.equal(result.currentPrice,null);
 assert.equal(result.unitPriceUnavailable,true);
 const noTicker=valueOpenPosition(position,null);
 assert.equal(noTicker.currentValue,195.48);
});

test('asset identity and EUR currency are checked before accepting an account ticker',async()=>{
 const {accountAssetTicker}=await import('../reported-portfolio.js');
 assert.equal(accountAssetTicker({data:{asset_id:'other',currency_id:'eur',price:'781.90'}},'mu','eur'),null);
 assert.equal(accountAssetTicker({data:{asset_id:'mu',currency_id:'usd',price:'781.90'}},'mu','eur'),null);
 assert.equal(accountAssetTicker({data:{asset_id:'mu',currency_id:'eur',price:'invalid'}},'mu','eur'),null);
});

test('missing reported values use explicitly identified EUR fallback, without converting foreign prices to EUR by assertion',async()=>{
 const {valueOpenPosition}=await import('../reported-portfolio.js');
 const position={assetKey:'NEW',currentQuantity:2,costBasis:null};
 assert.equal(valueOpenPosition(position,{price:100,currency:'USD'}).currentValue,null);
 const result=valueOpenPosition(position,{price:100,currency:'EUR'});
 assert.equal(result.currentValue,200);
 assert.equal(result.unrealizedProfit,null);
 assert.equal(result.valuationFallback,true);
});

test('reported zero values are preserved and mismatched histories do not invent fee-inclusive acquisition costs',async()=>{
 const {valueOpenPosition}=await import('../reported-portfolio.js');
 const [position]=applyReportedPortfolio([{assetKey:'NEW',currentQuantity:3,costBasis:300,remainingFeeCostBasis:1}], [{assetId:'new',assetKey:'NEW',balance:2,investedAmount:200,currentValue:0}]);
 assert.equal(position.historicalAcquisitionCost,null);
 assert.equal(valueOpenPosition(position,{price:100,currency:'EUR'}).currentValue,0);
});

test('small positions retain precise reported returns despite rounded EUR balance and invested amount', async () => {
  const { valueOpenPosition } = await import('../reported-portfolio.js');
  const [position] = applyReportedPortfolio([], [{ assetKey: 'VSN', balance: .65, investedAmount: .02, currentValue: .02, totalReturn: .01, totalReturnPercent: 43.65 }]);
  const result = valueOpenPosition(position, null);
  assert.equal(result.unrealizedProfit, .01);
  assert.equal(result.unrealizedProfitPercent, 43.65);
  assert.equal(result.currentValue, .02);
  position.reportedTotalReturn = 0; position.reportedTotalReturnPercent = 0;
  assert.equal(valueOpenPosition(position, null).unrealizedProfitPercent, 0);
});
