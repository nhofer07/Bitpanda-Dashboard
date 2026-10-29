import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryReadCache } from '../history-read-cache.js';
test('every newest-page change invalidates the old complete history',()=>{
 let time=1000;const cache=createHistoryReadCache({now:()=>time});
 const first={data:[{id:'a',amount:'1'}],next:'page2'};
 const check=cache.inspect('account1',first);assert.equal(check.hit,false);
 cache.store('account1',check.signature,[1,2,3]);
 assert.equal(cache.inspect('account1',first).hit,true);
 assert.equal(cache.inspect('account1',{...first,data:[{id:'a',amount:'2'}]}).hit,false);
 assert.equal(cache.inspect('account1',{...first,data:[{id:'new'},...first.data]}).hit,false);
 assert.equal(cache.inspect('account2',first).hit,false);
 time+=300000;assert.equal(cache.inspect('account1',first).hit,false);
});
test('a periodic full read is required even when the newest page remains unchanged',()=>{
 let time=0;const cache=createHistoryReadCache({now:()=>time});const page={data:[{id:'recent'}]};
 cache.store('account',cache.inspect('account',page).signature,['recent','old']);
 time=299999;assert.deepEqual(cache.inspect('account',page).value,['recent','old']);
 time=300000;assert.equal(cache.inspect('account',page).hit,false);
 cache.store('account',cache.inspect('account',page).signature,['recent','corrected-old']);
 assert.deepEqual(cache.inspect('account',page).value,['recent','corrected-old']);
 cache.clear();assert.equal(cache.inspect('account',page).hit,false);assert.equal(cache.oldestFullReadAt(),null);
});
