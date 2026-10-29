import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createChartDrawingStore } from '../chart-drawing-store.js';
const shape = { id: 'drawing-1', type: 'line', color: '#29bd94', text: '', points: [{ time: 1770000000, price: 1.17 }, { time: 1770003600, price: 1.2 }] };
async function setup(t) { const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'chart-drawings-test-')); t.after(() => fs.rm(directory, { recursive: true, force: true })); return { directory, store: createChartDrawingStore(directory) }; }
test('drawings survive a store restart and remain separated by pair', async t => {
  const { directory, store } = await setup(t); assert.deepEqual(await store.read('XRP-EUR'), { revision: 0, drawings: [] });
  await store.update('XRP-EUR', { revision: 0, drawings: [shape] });
  assert.deepEqual((await createChartDrawingStore(directory).read('XRP-EUR')).drawings, [shape]);
  assert.deepEqual((await store.read('BTC-EUR')).drawings, []);
  assert.equal((await fs.stat(path.join(directory, 'XRP-EUR.json'))).mode & 0o777, 0o600);
});
test('concurrent writers cannot silently overwrite drawings', async t => {
  const { store } = await setup(t); const results = await Promise.allSettled([store.update('BTC-EUR', { revision: 0, drawings: [shape] }), store.update('BTC-EUR', { revision: 0, drawings: [] })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await store.read('BTC-EUR')).drawings.length, 1);
});
test('invalid shapes and damaged storage never become an empty saved chart', async t => {
  const { directory, store } = await setup(t);
  await assert.rejects(store.update('BTC-EUR', { revision: 0, drawings: [{ ...shape, points: [{ time: 10, price: -1 }] }] }));
  assert.throws(() => store.update('../credentials', { revision: 0, drawings: [] }));
  await fs.writeFile(path.join(directory, 'BTC-EUR.json'), '{bad'); await assert.rejects(store.read('BTC-EUR')); await assert.rejects(store.update('BTC-EUR', { revision: 0, drawings: [] }));
});
