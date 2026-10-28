import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortfolioHistory, createPortfolioHistoryLoader, apiHistoryIsCurrent, archiveDailyPortfolioPoint } from '../portfolio-api-history.js';
const now = Date.parse('2026-10-28T12:20:00Z');
const row = (time, value = '100') => ({ time, value: { value, currency_id: 'eur' } });
const payload = (rows = [row('2026-10-27T12:10:00Z', '0'), row('2026-10-28T12:10:00Z', '110')]) => ({ data: { datapoints: rows, return_percentage: '0.79' } });
const normalize = data => normalizePortfolioHistory(data, { timeframe: 'DAY', eurCurrencyId: 'eur', now });

test('official data retains exact values, zero, timestamps and the reported percentage', () => {
  const history = normalize(payload());
  assert.equal(history.snapshots[0].totalValue, 0);
  assert.equal(history.snapshots.at(-1).totalValue, 110);
  assert.equal(history.reportedReturnPercent, .79);
  assert.equal(history.currency, 'EUR');
  assert.equal(history.stale, false);
  assert.equal(apiHistoryIsCurrent(history, now), true);
  assert.equal(normalize({ data: { ...payload().data, return_percentage: '0' } }).reportedReturnPercent, 0);
  assert.equal(normalize({ data: { ...payload().data, return_percentage: null } }).reportedReturnPercent, null);
});
test('foreign or missing currencies, invalid amounts, future points and partial series fail closed', () => {
  for (const change of [r => { r.value.currency_id = 'usd'; }, r => { delete r.value.currency_id; }, r => { r.value.value = ''; }, r => { r.value.value = '-1'; }, r => { r.value.value = 'NaN'; }, r => { r.time = 'broken'; }, r => { r.time = '2030-01-01'; }, r => { r.value.asset_id = 'token'; }]) {
    const data = payload(); change(data.data.datapoints[1]); assert.throws(() => normalize(data));
  }
  assert.throws(() => normalize(payload([])));
  assert.throws(() => normalize(payload([row('2026-10-28T12:10:00Z')])));
  assert.throws(() => normalizePortfolioHistory(payload(), { timeframe: 'ALL', eurCurrencyId: 'eur', now }));
});
test('official price movements are preserved without applying local snapshot spike repairs', () => {
  const points = [row('2026-10-28T12:10:00Z', '100'), row('2026-10-28T12:00:00Z', '40'), row('2026-10-28T11:50:00Z', '100')];
  assert.deepEqual(normalize(payload(points)).snapshots.map(p => p.totalValue), [100, 40, 100]);
  assert.equal(normalize(payload([...points, points[0]])).snapshots.length, 3);
  assert.throws(() => normalize(payload([...points, row(points[0].time, '999')])));
});
test('old DAY history cannot disable fallback minute recording', () => {
  const history = normalize(payload([row('2026-10-27T11:00:00Z'), row('2026-10-28T10:00:00Z')]));
  assert.equal(history.stale, true);
  assert.equal(apiHistoryIsCurrent(history, now), false);
  assert.equal(apiHistoryIsCurrent({ ...normalize(payload()), stale: true }, now), false);
  assert.equal(apiHistoryIsCurrent({ ...normalize(payload()), timeframe: 'YEAR' }, now), false);
  assert.equal(apiHistoryIsCurrent(normalize(payload()), now + 3600_000), false);
});
test('healthy API mode keeps old history and a single rolling Vienna-day archive point', () => {
  const old = { createdAt: '2026-10-26T12:00:00Z', totalValue: 100 };
  let points = [old];
  for (let minute = 0; minute < 60; minute++) points = archiveDailyPortfolioPoint(points, { createdAt: new Date(now + minute * 60_000).toISOString(), totalValue: 110 + minute });
  assert.equal(points.length, 2); assert.deepEqual(points[0], old); assert.equal(points[1].totalValue, 169);
  points = archiveDailyPortfolioPoint(points, { createdAt: '2026-10-28T23:01:00Z', totalValue: 180 });
  assert.equal(points.length, 3);
});
test('history reads deduplicate, cache by timeframe and retry synchronous failures', async () => {
  let calls = 0, time = 0, fail = true;
  const loader = createPortfolioHistoryLoader(() => { calls++; if (fail) throw new Error('offline'); return { timeframe: 'DAY', snapshots: [] }; }, { now: () => time });
  await assert.rejects(loader.load('DAY'));
  fail = false;
  const results = await Promise.all([loader.load('DAY'), loader.load('DAY')]);
  assert.equal(calls, 2); assert.equal(results[0], results[1]);
  await loader.load('DAY'); assert.equal(calls, 2);
  await loader.load('WEEK'); assert.equal(calls, 3);
  time = 60_001; fail = true;
  assert.equal((await loader.load('DAY')).stale, true);
  fail = false;
  assert.equal((await loader.load('DAY')).stale, undefined); assert.equal(calls, 5);
});
test('account change invalidates completed and in-flight history rather than leaking old data', async () => {
  let finish;
  const loader = createPortfolioHistoryLoader(() => new Promise(resolve => { finish = resolve; }));
  const previous = loader.load('DAY');
  await Promise.resolve(); loader.clear(); finish({ account: 'old' });
  await assert.rejects(previous, /Konto/);
  const next = loader.load('DAY'); await Promise.resolve(); finish({ account: 'new' });
  assert.equal((await next).account, 'new');
});

test('server keeps independent minute readings with healthy and unavailable API history', async () => {
  const { readFile } = await import('node:fs/promises'); const vm = await import('node:vm');
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  let clockNow = now;
  const context = vm.createContext({ Date: class extends Date { static now() { return clockNow; } }, SNAPSHOT_MIN_INTERVAL_MS:55000, portfolioSnapshotIssue:()=>null, apiHistoryIsCurrent:history=>apiHistoryIsCurrent(history,now), archiveDailyPortfolioPoint, compactPortfolioSnapshots:points=>points, excludeCorrectedSnapshots:points=>points });
  vm.runInContext(source.slice(source.indexOf('function appendPortfolioSnapshot('),source.indexOf('function compactPortfolioSnapshots(')),context);
  const cache={snapshots:[{createdAt:'2026-10-27T12:00:00Z',totalValue:100}]};
  const data={loadedAt:new Date(now).toISOString(),portfolioHistoryStartedAt:'2026-10-01T00:00:00Z',portfolio:{totalValue:110},portfolioApiHistory:normalize(payload())};
  let points=context.appendPortfolioSnapshot(cache,data);
  assert.equal(points.length,2);assert.equal(points.at(-1).recordingFrequency,undefined);
  assert.equal(context.appendPortfolioSnapshot({snapshots:points},data).length,2);
  clockNow += 60000;
  data.loadedAt=new Date(now+60000).toISOString();
  points=context.appendPortfolioSnapshot({snapshots:points},data);
  assert.equal(points.length,3);
  clockNow += 60000;
  data.portfolioApiHistory={available:false};
  data.loadedAt=new Date(now+120000).toISOString();
  points=context.appendPortfolioSnapshot({snapshots:points},data);
  assert.equal(points.length,4);
  assert.equal(points.at(-1).recordingFrequency,undefined);
});
