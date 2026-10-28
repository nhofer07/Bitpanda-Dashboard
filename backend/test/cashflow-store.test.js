import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashflowStore } from '../cashflow-store.js';
function fixture(initial = {}) {
  let disk = { overrides: initial };
  const store = createCashflowStore({ read: async () => structuredClone(disk), write: async value => { disk = structuredClone(value); } });
  return store;
}
test('parallel edits to different bookings merge while same-booking conflicts never overwrite', async () => {
  const store = fixture({ a: 'deposit' });
  await Promise.all([store.update({ changes: { a: { previous: 'deposit', value: 'refund' } } }), store.update({ changes: { b: { previous: null, value: 'transfer' } } })]);
  await assert.rejects(store.update({ changes: { a: { previous: 'deposit', value: 'ignore' } } }), error => error.status === 409 && error.state.overrides.a === 'refund');
  assert.deepEqual({ ...(await store.read()).overrides }, { a: 'refund', b: 'transfer' });
});
test('lost-response retry is idempotent and legacy bulk replacements are refused', async () => {
  const store = fixture({ a: 'deposit' });
  const change = { changes: { a: { previous: 'deposit', value: 'refund' } } };
  await store.update(change); await store.update(change);
  await assert.rejects(store.update({ overrides: { a: 'ignore' } }));
  assert.equal((await store.read()).overrides.a, 'refund');
});
test('a rejected write does not poison the queue and a conflict rejects the entire batch', async () => {
  const store = fixture({ a: 'refund' });
  await assert.rejects(store.update({ changes: { b: { previous: null, value: 'deposit' }, a: { previous: 'deposit', value: 'ignore' } } }));
  assert.equal((await store.read()).overrides.b, undefined);
  await store.update({ changes: { b: { previous: null, value: 'deposit' } } });
  assert.equal((await store.read()).overrides.b, 'deposit');
});
