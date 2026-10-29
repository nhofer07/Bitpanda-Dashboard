import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDashboardEvents } from '../dashboard-events.js';

test('saved-data notifications stream without client polling and end when authorization changes', async t => {
 const events=createDashboardEvents();let authorized=true;
 const server=http.createServer((req,res)=>events.attach(req,res,()=>authorized));
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{events.clear();server.close();server.closeAllConnections();});
 const response=await fetch(`http://127.0.0.1:${server.address().port}/`);
 assert.equal(response.headers.get('content-type'),'text/event-stream');
 assert.equal(response.headers.get('x-accel-buffering'),'no');
 const reader=response.body.getReader();
 const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/event: ready/);
 events.publish('2026-10-29T09:37:00Z');
 const update=new TextDecoder().decode((await reader.read()).value);
 assert.match(update,/event: dashboard/);
 assert.match(update,/"loadedAt":"2026-10-29T09:37:00Z"/);
 assert.equal(update.includes('portfolio'),false);
 authorized=false;events.publish('2026-10-29T09:38:00Z');
 assert.equal((await reader.read()).done,true);
});

test('account changes close every stream instead of sending another account timestamp', async t => {
 const events=createDashboardEvents();
 const server=http.createServer((req,res)=>events.attach(req,res,()=>true));
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(()=>{events.clear();server.close();server.closeAllConnections();});
 const reader=(await fetch(`http://127.0.0.1:${server.address().port}/`)).body.getReader();await reader.read();
 events.clear();assert.equal((await reader.read()).done,true);
});
