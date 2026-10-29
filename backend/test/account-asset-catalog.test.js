import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountAssetCatalog } from '../account-asset-catalog.js';
const id = i => `00000000-0000-0000-0000-${String(i).padStart(12,'0')}`;
test('fetches only account instruments once across portfolio, historical operations and trades',async()=>{
 const calls=[];const catalog=createAccountAssetCatalog(async assetId=>{calls.push(assetId);return{id:assetId,symbol:assetId===id(1)?'PI':'BC8'};});
 const operations=[{transactions:[{asset_id:id(1)},{asset_amount:{asset_id:id(2)}},{currency_id:id(99)}]}];
 const result=await catalog.load(operations,[{asset_id:id(1)}],[{attributes:{asset_id:id(2)}}]);
 assert.deepEqual(calls,[id(1),id(2)]);assert.equal(result.length,2);
 await catalog.load(operations,[{asset_id:id(1)}]);assert.equal(calls.length,2);
 catalog.clear();await catalog.load([], [{asset_id:id(1)}]);assert.equal(calls.length,3);
});
test('bounds concurrency and rejects a wrong asset identity instead of guessing by symbol',async()=>{
 let active=0,max=0;
 const catalog=createAccountAssetCatalog(async assetId=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return{id:assetId};},{concurrency:2});
 const result=await catalog.load([],Array.from({length:7},(_,i)=>({asset_id:id(i+1)})));
 assert.equal(max,2);assert.equal(result.length,7);
 const bad=createAccountAssetCatalog(async()=>({id:id(99)}));await assert.rejects(bad.load([],[{asset_id:id(1)}]),/unpassende/);
});
test('expired metadata refreshes and temporarily missing historical instruments are not invented',async()=>{
 let time=0,calls=0;const catalog=createAccountAssetCatalog(async()=>{calls++;return null;},{now:()=>time});
 assert.deepEqual(await catalog.load([],[{asset_id:id(1)}]),[]);
 time=3600001;await catalog.load([],[{asset_id:id(1)}]);assert.equal(calls,2);
});
