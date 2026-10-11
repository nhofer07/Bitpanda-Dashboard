import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMarketSymbol, extractHistory, convertHistoryToEur, normalizeMarketUnit, latestIntradaySession, selectYahooSearchMatch, loadMarketHistory } from '../market-history.js';
test('Bitpanda tickers resolve to the correct market listing', () => {
 assert.equal(resolveMarketSymbol('O-US','stock'),'O');
 assert.equal(resolveMarketSymbol('AMD-US','stock'),'AMD');
 assert.equal(resolveMarketSymbol('SPYY','etf'),'SPYY.DE');
 assert.equal(resolveMarketSymbol('BTC','crypto'),'BTC-EUR');
 assert.equal(resolveMarketSymbol('BTC-EUR','crypto'),'BTC-EUR');
 assert.equal(resolveMarketSymbol('RHM','stock'),'RHM.DE');
 assert.equal(resolveMarketSymbol('MCD','stock'),'MDO.DE');
 assert.equal(resolveMarketSymbol('MCDA','other',"McDonald's Corporation"),'MDO.DE');
 assert.equal(resolveMarketSymbol('XAU','metal'),'GC=F');
});

test('closed-market fallback keeps only the latest intraday session', () => {
 const history = [
  { date: '2026-10-01T10:00:00.000Z', close: 1 },
  { date: '2026-10-01T11:00:00.000Z', close: 2 },
  { date: '2026-10-02T10:00:00.000Z', close: 3 },
  { date: '2026-10-02T11:00:00.000Z', close: 4 }
 ];
 assert.deepEqual(latestIntradaySession(history), history.slice(2));
});
test('Yahoo discovery accepts a matching listing and rejects unrelated ticker collisions', () => {
 const quotes = [
  { symbol: 'RHM.DE', quoteType: 'EQUITY', longname: 'Rheinmetall AG', currency: 'EUR' },
  { symbol: 'RHM.L', quoteType: 'EQUITY', longname: 'Random Holdings Management', currency: 'GBP' }
 ];
 assert.equal(selectYahooSearchMatch(quotes, { name: 'Rheinmetall', category: 'stock' }), 'RHM.DE');
 assert.equal(selectYahooSearchMatch(quotes, { name: 'Completely Different', category: 'stock' }), '');
});
test('missing prices do not shift timestamps or become zero', () => {
 const result={timestamp:[1,2,3,4],indicators:{quote:[{close:[10,null,20,0]}]}};
 assert.deepEqual(extractHistory(result).map(point=>[Date.parse(point.date),point.close]),[[1000,10],[3000,20]]);
});
test('EUR history uses historical rates and preceding business day, never future data', () => {
 const history=['2026-09-03','2026-09-04','2026-09-05','2026-09-07'].map(date=>({date:date+'T16:00:00Z',close:100}));
 const converted=convertHistoryToEur(history,'USD',{'2026-09-04':{EUR:.8},'2026-09-07':{EUR:.9}});
 assert.deepEqual(converted.map(point=>point.close),[80,80,90]);
 assert.equal(converted[0].date,history[1].date);
});
test('British pence are converted into pounds before FX conversion', () => {
  assert.equal(convertHistoryToEur([{date:'2026-09-04',close:10000}],'GBp',{'2026-09-04':{EUR:1.2}})[0].close,120);
});
test('Gold history is converted from a troy ounce to a gram', () => {
 const history = normalizeMarketUnit([{date:'2026-09-04',close:3110.34768}], 'XAU');
 assert.equal(history[0].close, 100);
 assert.equal(normalizeMarketUnit([{date:'2026-09-04',close:100}], 'BTC')[0].close, 100);
});
test('Vision requests EUR history and discloses free-provider range limit', async () => {
 let requested;
 const result=await loadMarketHistory({symbol:'VSN',category:'crypto',range:'5y',fetchImpl:async url=>{requested=String(url);return {ok:true,json:async()=>({prices:[[1700000000000,.1],[1700100000000,.2]]})};}});
 assert.match(requested,/vision-3/);assert.match(requested,/vs_currency=eur/);assert.match(requested,/days=365/);
 assert.equal(result.currency,'EUR');assert.match(result.note,/365/);
});
test('Yahoo fallback and EUR output', async () => {
 const calls=[];
 const result=await loadMarketHistory({symbol:'O-US',category:'stock',fetchImpl:async url=>{
  calls.push(String(url));
  if(String(url).includes('query1')) return {ok:false,status:503};
  if(String(url).includes('frankfurter')) return {ok:true,json:async()=>({rates:{'2026-09-01':{EUR:.8},'2026-09-02':{EUR:.9}}})};
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'USD'},timestamp:[Date.parse('2026-09-01')/1000,Date.parse('2026-09-02')/1000],indicators:{quote:[{close:[100,100]}]}}]}})};
 }});
 assert.equal(calls.length,3);assert.match(calls[1],/chart\/O\?/);
 assert.equal(result.currency,'EUR');assert.deepEqual(result.history.map(point=>point.close),[80,90]);
});
test('McDonald\'s uses the EUR listing for quotes and charts', async () => {
 let requested;
 const result = await loadMarketHistory({symbol:'MCD', category:'stock', range:'1mo', fetchImpl:async url=>{
  requested = String(url);
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR', longName:"McDonald's Corporation"},timestamp:[1700000000,1700086400],indicators:{quote:[{close:[217,218]}]}}]}})};
 }});
 assert.match(requested,/chart\/MDO\.DE\?/);
 assert.equal(result.currency,'EUR');
 assert.equal(result.sourceCurrency,'EUR');
 assert.deepEqual(result.history.map(point=>point.close),[217,218]);
});
test('McDonald\'s name overrides an unknown Bitpanda symbol and avoids Yahoo name search', async () => {
 const calls = [];
 const result = await loadMarketHistory({symbol:'MCDA', name:"McDonald's Corporation", category:'other', range:'1mo', fetchImpl:async url=>{
  calls.push(String(url));
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR'},timestamp:[1700000000,1700086400],indicators:{quote:[{close:[217,218]}]}}]}})};
 }});
 assert.match(calls[0],/chart\/MDO\.DE\?/);
 assert.equal(calls.some(url=>url.includes('/finance/search')),false);
 assert.equal(result.currency,'EUR');
});
test('short ranges request intraday Yahoo data', async () => {
 const calls=[];
 const fetchImpl=async url=>{calls.push(String(url));return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR'},timestamp:[1700000000,1700000300],indicators:{quote:[{close:[100,101]}]}}]}})};};
 const day=await loadMarketHistory({symbol:'BTC',category:'crypto',range:'1d',fetchImpl});
 const week=await loadMarketHistory({symbol:'O-US',category:'stock',range:'1w',fetchImpl});
 assert.match(calls[0],/interval=5m/);assert.match(calls[0],/range=1d/);assert.equal(day.interval,'5m');
 assert.match(calls[1],/interval=15m/);assert.match(calls[1],/range=5d/);assert.equal(week.interval,'15m');
});
test('unsupported symbols are not rendered as unrelated assets', async () => {
 await assert.rejects(loadMarketHistory({symbol:'UNKNOWN',fetchImpl:async()=>({ok:false,status:404})}),/keine ausreichende Historie/);
});


test('latest session retains the first quote after market open', () => {
 const history = [
  { date: '2026-10-05T14:00:00.000Z', close: 100 },
  { date: '2026-10-05T14:05:00.000Z', close: 101 },
  { date: '2026-10-06T07:00:00.000Z', close: 102 }
 ];
 assert.deepEqual(latestIntradaySession(history), history.slice(1));
 assert.deepEqual(latestIntradaySession([]), []);
});

test('stale day bars retry the alternate host when the provider has a newer quote', async () => {
 const calls = [];
 const today = Date.parse('2026-10-06T08:00:00Z') / 1000;
 const result = await loadMarketHistory({symbol:'RHM', category:'stock', range:'1d', fetchImpl:async url => {
  calls.push(String(url));
  const stamp = String(url).includes('query1') ? today - 86400 : today;
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR',regularMarketTime:today},timestamp:[stamp-300,stamp],indicators:{quote:[{close:[100,101]}]}}]}})};
 }});
 assert.equal(calls.length, 2);
 assert.match(calls[1], /query2/);
 assert.equal(result.history.at(-1).date, '2026-10-06T08:00:00.000Z');
});

test('closed markets keep the actual last trading date without retrying a current session', async () => {
 let calls = 0;
 const stamp = Date.parse('2026-10-05T20:00:00Z') / 1000;
 const result = await loadMarketHistory({symbol:'AMD', category:'stock', range:'1d', fetchImpl:async () => {
  calls++;
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR',regularMarketTime:stamp},timestamp:[stamp-300,stamp],indicators:{quote:[{close:[100,101]}]}}]}})};
 }});
 assert.equal(calls, 1);
 assert.equal(result.history.at(-1).date, '2026-10-05T20:00:00.000Z');
});

test('day-range fallback includes today even when only its opening bar exists', async () => {
 const stamps = ['2026-10-05T14:00:00Z', '2026-10-05T14:05:00Z', '2026-10-06T07:00:00Z'].map(date => Date.parse(date) / 1000);
 const result = await loadMarketHistory({symbol:'RHM', category:'stock', range:'1d', fetchImpl:async url => {
  const fallback = new URL(url).searchParams.get('range') === '5d';
  return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR'},timestamp:fallback ? stamps : stamps.slice(-1),indicators:{quote:[{close:fallback ? [100,101,102] : [102]}]}}]}})};
 }});
 assert.deepEqual(result.history.map(point => point.close), [101,102]);
 assert.equal(result.history.at(-1).date, '2026-10-06T07:00:00.000Z');
});

test('stock intraday charts include today’s pre-market trades and disclose extended hours', async () => {
 for (const symbol of ['TTWO','O-US']) {
  let requested;
  const result = await loadMarketHistory({symbol,category:'stock',range:'1d',fetchImpl:async url => {
   requested = new URL(url);
   const extended = requested.searchParams.get('includePrePost') === 'true';
   const stamp = Date.parse(extended ? '2026-10-06T11:00:00Z' : '2026-10-05T20:00:00Z') / 1000;
   return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR'},timestamp:[stamp-300,stamp],indicators:{quote:[{close:[100,101]}]}}]}})};
  }});
  assert.equal(requested.searchParams.get('includePrePost'), 'true');
  assert.equal(result.history.at(-1).date, '2026-10-06T11:00:00.000Z');
  assert.equal(result.extendedHours, true);
  assert.match(result.note, /Vor- und Nachbörsenkurse/);
 }
});

test('extended-hours requests also cover weekly stocks but leave crypto and daily history unchanged', async () => {
 for (const [category,range,expected] of [['stock','1w','true'],['crypto','1d',null],['stock','1mo',null]]) {
  let requested;
  await loadMarketHistory({symbol:category==='crypto'?'BTC':'TTWO',category,range,fetchImpl:async url => {
   requested = new URL(url);
   return {ok:true,json:async()=>({chart:{result:[{meta:{currency:'EUR'},timestamp:[1700000000,1700000300],indicators:{quote:[{close:[100,101]}]}}]}})};
  }});
  assert.equal(requested.searchParams.get('includePrePost'), expected);
 }
});
