import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCatalog, searchCatalog, loadAssetCatalog } from '../asset-search.js';
const rows=[{symbol:'AAPL',name:'Apple',isin:'US0378331005',group:'stock',type:'security',buy_active:false},{symbol:'AAPL',name:'Apple Inc',isin:'US0378331005',group:'equity_stock',type:'equity_security',buy_active:true},{symbol:'BTC',name:'Bitcoin',group:'coin',type:'cryptocoin',buy_active:true},{symbol:'SPYY',name:'MSCI ACWI',group:'equity_etf',type:'equity_security',buy_active:true}];
test('catalog includes non-owned assets, classifies groups and deduplicates legacy listings',()=>{
 const catalog=normalizeCatalog(rows);assert.equal(catalog.length,3);assert.equal(catalog.find(a=>a.symbol==='AAPL').name,'Apple Inc');assert.equal(catalog.find(a=>a.symbol==='SPYY').category,'etf');assert.equal(catalog.find(a=>a.symbol==='BTC').category,'crypto');
});
test('name, symbol and ISIN search plus category filters',()=>{
 const catalog=normalizeCatalog(rows);assert.equal(searchCatalog(catalog,'apple')[0].symbol,'AAPL');assert.equal(searchCatalog(catalog,'aapl')[0].name,'Apple Inc');assert.equal(searchCatalog(catalog,'US0378331005')[0].symbol,'AAPL');assert.equal(searchCatalog(catalog,'Apple','crypto').length,0);assert.equal(searchCatalog(catalog,'A').length,0);
});
test('catalog follows pagination and rejects repeated cursors',async()=>{
 let calls=0;const items=await loadAssetCatalog('test',async(url,options)=>{
  assert.equal(url.hostname,'developer.bitpanda.com');assert.equal(url.pathname,'/v1/ticker');assert.equal(url.searchParams.get('page_size'),'500');assert.equal(options.headers['X-Api-Key'],'test');
  calls++;assert.equal(url.searchParams.get('cursor'),calls===1?null:'page2');
  return {ok:true,json:async()=>calls===1?{data:rows.slice(0,2),has_next_page:true,next_cursor:'page2'}:{data:rows.slice(2),has_next_page:false}};
 });assert.equal(items.length,3);assert.equal(calls,2);
 await assert.rejects(loadAssetCatalog('test',async()=>({ok:true,json:async()=>({data:[],has_next_page:true,next_cursor:'same'})})),/vollständig/);
});
test('rate limits produce a useful error and never leak keys',async()=>{
 await assert.rejects(loadAssetCatalog('secret',async()=>({ok:false,status:429})),/Abfragelimit/);
});
test('ticker records without trade availability do not imply buying is disabled',()=>{
 const item=normalizeCatalog([{symbol:'MSFT',name:'Microsoft',type:'equity_security'}])[0];
 assert.equal(item.category,'stock');assert.equal(item.buyActive,null);
});
