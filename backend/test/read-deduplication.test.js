import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadDeduplicator } from '../read-deduplication.js';

test('overlapping reads share work, completed reads never become a stale cache',async()=>{
 const read=createReadDeduplicator();let calls=0,finish;
 const load=()=>{calls++;return new Promise(resolve=>{finish=resolve;});};
 const first=read('account:1:fiat',load),second=read('account:1:fiat',load);
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 finish([1,2]);assert.deepEqual(await first,[1,2]);
 const next=read('account:1:fiat',async()=>{calls++;return[3];});
 assert.deepEqual(await next,[3]);assert.equal(calls,2);
});
test('failed reads retry and different accounts never share a response',async()=>{
 const read=createReadDeduplicator();let calls=0;
 await assert.rejects(read('account:1',()=>{calls++;throw Error('offline');}));
 assert.equal(await read('account:1',async()=>{calls++;return 1;}),1);
 assert.equal(calls,2);
 assert.deepEqual(await Promise.all([read('account:1',async()=>1),read('account:2',async()=>2)]),[1,2]);
});
