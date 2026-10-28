import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashflowSync } from '../src/components/cashflowSync.js';
import { createCashflowStore } from '../../backend/cashflow-store.js';
function storage(initial = {}) { const map = new Map(Object.entries(initial)); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }; }
function fixture() {
  let disk = { overrides: { a: 'refund' } };
  const store = createCashflowStore({ read: async () => structuredClone(disk), write: async value => { disk = structuredClone(value); } });
  return { store, request: (method, body) => method === 'GET' ? store.read() : store.update(body) };
}
test('old browser values are replaced by the server without writing them back', async () => {
  const { request, store } = fixture(); let shown;
  const sync = createCashflowSync({ storage: storage({ 'bitpanda-dashboard-cashflow-overrides': '{"a":"ignore"}' }), request, onChange: value => { shown = value; } });
  await sync.load();
  assert.equal(shown.a, 'refund');
  assert.equal((await store.read()).revision, 0);
});
test('offline changes survive reload, retain original base and synchronize once', async () => {
  const { request, store } = fixture(); const disk = storage(); let online = true;
  const network = (...args) => online ? request(...args) : Promise.reject(new Error('offline'));
  const sync = createCashflowSync({ storage: disk, request: network, onChange: () => {} });
  await sync.load(); online = false;
  await assert.rejects(sync.update('b', 'deposit'));
  await assert.rejects(sync.update('b', 'transfer'));
  online = true;
  const reloaded = createCashflowSync({ storage: disk, request: network, onChange: () => {} });
  await reloaded.load();
  assert.equal((await store.read()).overrides.b, 'transfer');
});
test('conflicting offline edits restore server state and require an explicit new choice', async () => {
  const { request, store } = fixture(); const disk = storage(); let shown; let online = true;
  const sync = createCashflowSync({ storage: disk, request: (...args) => online ? request(...args) : Promise.reject(new Error('offline')), onChange: value => { shown = value; } });
  await sync.load(); online = false;
  await assert.rejects(sync.update('a', 'ignore'));
  await store.update({ changes: { a: { previous: 'refund', value: 'expense' } } });
  online = true;
  await assert.rejects(sync.load(), error => error.status === 409);
  assert.equal(shown.a, 'expense');
  await sync.load();
  assert.equal((await store.read()).overrides.a, 'expense');
});

test('one conflicting booking does not discard unrelated offline changes', async () => {
  const { request, store } = fixture(); const disk = storage(); let online = true;
  const sync = createCashflowSync({ storage: disk, request: (...args) => online ? request(...args) : Promise.reject(new Error('offline')), onChange: () => {} });
  await sync.load(); online = false;
  await assert.rejects(sync.update('a', 'ignore'));
  await assert.rejects(sync.update('b', 'transfer'));
  await store.update({ changes: { a: { previous: 'refund', value: 'expense' } } });
  online = true;
  await assert.rejects(sync.load(), error => error.status === 409);
  assert.equal((await store.read()).overrides.a, 'expense');
  assert.equal((await store.read()).overrides.b, 'transfer');
});
