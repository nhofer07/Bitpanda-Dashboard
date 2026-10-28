import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichTradesWithLeverageFees } from '../leverage-fees.js';
const sale = {id:'msft-sale',attributes:{type:'sell',fee:0}};
const operation = {operation_id:'close',operation_type:'securities_margin_trading_close_long',transactions:[
 {transaction_id:'asset-sale',asset_id:'msft',wallet_owner:'securities-margin-trading',trade:{trade_id:'msft-sale'}},
 {transaction_id:'charge',transaction_type:'charge',flow:'OUTGOING',asset_id:'eurcv',wallet_owner:'securities-margin-trading-credit',asset_amount:{value:'43.35639835'}},
 {transaction_id:'repay-token',asset_id:'eurcv',flow:'INCOMING',wallet_owner:'securities-margin-trading-credit',asset_amount:{value:'1360.15639835'},trade:{trade_id:'repay'}},
 {transaction_id:'repay-eur',currency_id:'eur',flow:'OUTGOING',asset_amount:{value:'1360.16'},trade:{trade_id:'repay'}},
 {transaction_id:'sale-eur',currency_id:'eur',flow:'INCOMING',asset_amount:{value:'1715.75'},trade:{trade_id:'msft-sale'}},
 {transaction_id:'close-fee',transaction_type:'fee',currency_id:'eur',flow:'OUTGOING',asset_amount:{value:'1'}}
]};
test('Microsoft funding is converted from the actual repayment and normal closing fees remain separate',()=>{
 const [result]=enrichTradesWithLeverageFees([sale],[operation,operation],'eur');
 assert.equal(result.attributes.financingFee,43.36);
 assert.equal(result.attributes.financingFeeBookings.length,1);
 assert.equal(result.attributes.fee.attributes.fee_amount_in_fiat,'1');
 assert.equal(sale.attributes.financingFee,undefined);
 assert.equal(result.attributes.dashboardGrossTradeValue,1715.75);
});
test('missing repayment never assumes EURCV parity or deducts principal as a fee',()=>{
 const missing=structuredClone(operation);missing.transactions=missing.transactions.filter(t=>t.transaction_id!=='repay-eur');
 assert.equal(enrichTradesWithLeverageFees([sale],[missing],'eur')[0].attributes.financingFee,undefined);
});
test('ambiguous asset sales cannot receive the same financing charge',()=>{
 const ambiguous=structuredClone(operation);ambiguous.transactions.push({asset_id:'other',trade:{trade_id:'other-sale'}});
 const result=enrichTradesWithLeverageFees([sale,{id:'other-sale',attributes:{type:'sell'}}],[ambiguous],'eur');
 assert.ok(result.every(t=>t.attributes.financingFee==null));
});
test('crypto funding uses the historical value of the exact charge',()=>{
 const crypto=structuredClone(operation);crypto.operation_type='margin_trading_close_long';crypto.transactions=crypto.transactions.slice(0,2);crypto.transactions[1].asset_id='eth';crypto.transactions[1].asset_amount.value='0.004';
 const [result]=enrichTradesWithLeverageFees([sale],[crypto],'eur',[{id:'charge',attributes:{amount:'0.004',amount_eur:'7.66'}}]);
 assert.equal(result.attributes.financingFee,7.66);
});

test('separate sale fees do not inflate the gross receipt or hide the fee deduction',async()=>{
 const {tradeValueBeforeFee}=await import('../trade-amounts.js');
 const [result]=enrichTradesWithLeverageFees([sale],[operation],'eur');
 assert.equal(tradeValueBeforeFee(result,5,1715.75,1),1715.75);
});

test('realized results, trade details and month/year totals include funding exactly once',async()=>{
 const fs=await import('node:fs/promises');
 const vm=await import('node:vm');
 const {reportedTradeFee,tradeValueBeforeFee,allocateSalePurchaseFees}=await import('../trade-amounts.js');
 const source=await fs.readFile(new URL('../server.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function addPeriod('),source.indexOf('function summarizeProfitLossByCategory('));
 const context=vm.createContext({
  CASH_PLUS_SYMBOLS:new Set(),ASSET_DISPLAY_NAMES:{},ASSET_CATEGORY_LABELS:{stock:'Aktien'},
  getAssetKey:t=>t.attributes.cryptocoin_symbol,getAssetName:t=>t.attributes.cryptocoin_symbol,getAssetCategory:()=> 'stock',
  getTradeAmountAsset:t=>Number(t.attributes.amount_cryptocoin),getTradeAmountFiat:t=>Number(t.attributes.amount_fiat),
  getTradeFee:t=>reportedTradeFee(t)||0,getTradeValueBeforeFee:tradeValueBeforeFee,reportedTradeFee,allocateSalePurchaseFees,
  createSavingsExecutionMatcher:()=>()=>false,monthKeyFromItem:()=> '2026-07',yearKeyFromItem:()=> '2026',summarizeProfitLossByCategory:()=>[]
 });
 vm.runInContext(code,context);
 const buy={id:'buy',attributes:{type:'buy',status:'finished',cryptocoin_symbol:'MSFT',amount_cryptocoin:5,amount_fiat:1646,fee:0,time:{unix:1}}};
 const sell={...sale,attributes:{...sale.attributes,status:'finished',cryptocoin_symbol:'MSFT',amount_cryptocoin:5,amount_fiat:1715.75,time:{unix:2}}};
 const trades=enrichTradesWithLeverageFees([buy,sell],[operation],'eur');
 const result=context.calculateRealizedProfit(trades,[],{available:true,tradeTaxes:{'msft-sale':19.18},events:[{category:'sales',date:'2026-07-27T13:43:57Z',year:'2026',amount:19.18}],salesPaid:19.18});
 assert.ok(Math.abs(result.assets[0].realizedProfit-6.21)<1e-9);
 assert.equal(result.assets[0].financingFees,43.36);
 assert.equal(result.assets[0].trades[0].financingFee,43.36);
 assert.ok(Math.abs(result.monthly[0].realizedProfit-6.21)<1e-9);
 assert.ok(Math.abs(result.yearly[0].realizedProfit-6.21)<1e-9);
});

test('account cost breakdown attributes the funding without adding it again to additional costs',async()=>{
 const {buildAccountInsights}=await import('../account-insights.js');
 const trades=enrichTradesWithLeverageFees([{...sale,attributes:{...sale.attributes,cryptocoin_symbol:'MSFT'}}],[operation],'eur');
 const result=buildAccountInsights([operation],{eurCurrencyId:'eur',trades});
 const funding=result.costs.find(cost=>cost.transactionId==='charge');
 assert.equal(funding.eurAmount,43.36);
 assert.equal(funding.includedTradeId,'msft-sale');
 assert.equal(funding.category,'leverage');
 assert.equal(result.additionalCostsEur,0);
});

test('historical and future closures for different assets are recognized independently',()=>{
 const symbols=['MSFT','AAPL','BTC','ETH','SPYY'];
 const trades=symbols.map(symbol=>({id:`sale-${symbol}`,attributes:{type:'sell',cryptocoin_symbol:symbol,fee:0}}));
 const operations=symbols.map((symbol,index)=>{
  const item=structuredClone(operation);
  item.operation_id=`close-${symbol}`;
  item.operation_type=['BTC','ETH'].includes(symbol)?'margin_trading_close_long':'securities_margin_trading_close_long';
  for(const row of item.transactions){
   row.transaction_id=`${symbol}-${row.transaction_id}`;
   row.credited_at=index%2?'2027-01-01T10:00:00Z':'2025-01-01T10:00:00Z';
   if(row.asset_id==='msft')row.asset_id=symbol.toLowerCase();
   if(row.trade?.trade_id==='msft-sale')row.trade.trade_id=`sale-${symbol}`;
  }
  return item;
 });
 const result=enrichTradesWithLeverageFees(trades,[...operations,...operations],'eur');
 assert.equal(result.length,symbols.length);
 for(const trade of result){
  assert.equal(trade.attributes.financingFee,43.36);
  assert.equal(trade.attributes.financingFeeBookings.length,1);
  assert.equal(trade.attributes.fee.attributes.fee_amount_in_fiat,'1');
 }
});
