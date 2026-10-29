import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../server.js',import.meta.url),'utf8');
function loadingContext(){
 const cached={calculationVersion:1,loadedAt:new Date(Date.now()-600000).toISOString(),snapshots:[]};
 let finish,fail,builds=0,notifications=0,failures=0;
 const context=vm.createContext({Date,console:{error(){}},DASHBOARD_CACHE_FILE:'test',DASHBOARD_CALCULATION_VERSION:1,DASHBOARD_CACHE_MS:300000,BACKGROUND_REFRESH_MS:60000,settingsRevision:0,dashboardRefreshPromise:null,
  readDashboardCache:async()=>cached,ensurePortfolioReturnFields:x=>x,readJsonFile:async()=>[],accountDir:()=>'',path:{join:()=>''},excludeCorrectedSnapshots:x=>x,portfolioSnapshotIssue:()=>null,
  buildDashboardData:()=>{builds++;return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});},writeDashboardCache:async()=>{},dashboardEvents:{publish:()=>notifications++,failed:()=>failures++}});
 vm.runInContext(source.slice(source.indexOf('async function getDashboardData('),source.indexOf('function getWalletSymbol(')),context);
 return{context,cached,finish:data=>finish(data),fail:()=>fail(Error('offline')),counts:()=>({builds,notifications,failures})};
}
test('opening shows last verified data without waiting, while explicit refresh waits for fresh data',async()=>{
 const c=loadingContext();
 const first=await c.context.getDashboardData({allowStale:true});
 assert.equal(first.loadedAt,c.cached.loadedAt);assert.equal(first.cache.updating,true);assert.equal(first.cache.status,'stale');
 let completed=false;
 const manual=c.context.getDashboardData({forceRefresh:true,allowStale:true}).then(data=>{completed=true;return data;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false);assert.equal(c.counts().builds,1);
 const fresh={...c.cached,loadedAt:new Date().toISOString()};c.finish(fresh);
 assert.equal((await manual).loadedAt,fresh.loadedAt);assert.equal(c.counts().notifications,1);
});
test('failed background reads retain the original document and notify failure instead of claiming fresh data',async()=>{
 const c=loadingContext();const first=await c.context.getDashboardData({allowStale:true});
 c.fail();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(first.loadedAt,c.cached.loadedAt);assert.equal(c.counts().failures,1);assert.equal(c.context.dashboardRefreshPromise,null);
});
test('fiat types start concurrently and preserve deduplication and filtering',async()=>{
 const started=[],pending=[];
 const context=vm.createContext({fetchPaginated:(_,params)=>{started.push(params.type);return new Promise(resolve=>pending.push(resolve));},uniqueById:rows=>[...new Map(rows.map(r=>[r.id,r])).values()],isOnlyWantedFiatMovement:r=>r.id!=='skip'});
 vm.runInContext(source.slice(source.indexOf('async function fetchWantedFiatMovements('),source.indexOf('async function fetchDividendMovements(')),context);
 const result=context.fetchWantedFiatMovements();assert.deepEqual(started,['deposit','withdrawal','transfer']);
 pending.forEach(resolve=>resolve([{id:'same',attributes:{}},{id:'skip',attributes:{}}]));
 assert.deepEqual(Array.from(await result,r=>r.id),['same']);
});
