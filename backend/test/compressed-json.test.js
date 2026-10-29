import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sendCompressedJson } from '../compressed-json.js';
test('large dashboard responses compress without altering values and retain encoding negotiation',async t=>{
 const app=express(),data={value:1234.56789,rows:Array.from({length:1000},(_,i)=>({id:i,label:'Portfoliohistorie'}))};
 app.get('/',(req,res)=>sendCompressedJson(req,res,data));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{server.close();server.closeAllConnections();});
 const base=`http://127.0.0.1:${server.address().port}/`;
 const zipped=await fetch(base,{headers:{'Accept-Encoding':'gzip'}});
 assert.equal(zipped.headers.get('content-encoding'),'gzip');assert.match(zipped.headers.get('vary'),/Accept-Encoding/);
 assert.ok(Number(zipped.headers.get('content-length'))<JSON.stringify(data).length/4);assert.deepEqual(await zipped.json(),data);
 const plain=await fetch(base,{headers:{'Accept-Encoding':'gzip;q=0, identity'}});
 assert.equal(plain.headers.get('content-encoding'),null);assert.deepEqual(await plain.json(),data);
});
