import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBitpandaChart } from '../bitpanda-chart.js';
test('loads the Bitpanda EUR OHLC feed with exact symbol and category matching', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    return { ok: true, json: async () => urls.length === 1 ? {data: [
      {attributes: {symbol: 'BTC2L', group: 'coin', pid: 'wrong'}},
      {attributes: {symbol: 'BTC', group: 'coin', pid: 'bitcoin'}}
    ]} : {data: [
      {attributes: {close: '20', time: {date_iso8601: '2026-01-02'}}},
      {attributes: {close: '10', time: {date_iso8601: '2026-01-01'}}},
      {attributes: {close: 'invalid', time: {date_iso8601: '2026-01-01'}}}
    ]} };
  };
  const result = await loadBitpandaChart({symbol: 'BTC', category: 'crypto', range: '1d', fetchImpl});
  assert.equal(urls[1], 'https://api.bitpanda.com/v3/ohlc/bitcoin/EUR/day');
  assert.deepEqual(result.history.map(p => p.close), [10, 20]);
  assert.equal(result.sourceCurrency, 'EUR');
});
test('unavailable assets fail clearly after checking both providers', async () => {
  await assert.rejects(loadBitpandaChart({symbol: 'MISSING', category: 'stock', range: '1d', fetchImpl: async () => ({ok:true,json:async()=>({data:[]})})}), /keiner Kursquelle/);
  await assert.rejects(loadBitpandaChart({symbol: 'BTC', range: 'invalid'}), /Zeitraum/);
});

test('five years uses the original Bitpanda long history', async () => {
  const urls = [];
  const result = await loadBitpandaChart({ symbol: 'BTC', category: 'crypto', range: '5y', fetchImpl: async url => {
    urls.push(url);
    return { ok: true, json: async () => urls.length === 1 ? { data: [{ attributes: { symbol: 'BTC', group: 'coin', pid: 'bitcoin' } }] } : { data: ['2022-01-01', '2026-01-01'].map(date => ({ attributes: { close: '100', time: { date_iso8601: date } } })) } };
  }});
  assert.ok(urls[1].endsWith('/EUR/5y'));
  assert.equal(result.history.length, 2);
});

test('complete history uses the previous market provider and identifies it', async () => {
  const urls = [];
  const result = await loadBitpandaChart({symbol: 'BTC', category: 'crypto', range: 'max', fetchImpl: async url => {
    urls.push(String(url));
    return {ok: true, json: async () => ({chart: {result: [{meta: {currency: 'EUR'}, timestamp: [1451606400, 1767225600], indicators: {quote: [{close: [100, 200]}]}}]}})};
  }});
  assert.ok(urls[0].includes('yahoo.com'));
  assert.equal(result.history[0].date, '2016-01-01T00:00:00.000Z');
  assert.ok(!result.source.startsWith('Bitpanda'));
  assert.match(result.note, /langen Zeitraum/);
});

test('Bitpanda symbol suffixes resolve and an unavailable original feed falls back with attribution', async () => {
 const urls = [];
 const result = await loadBitpandaChart({symbol:'O-US',category:'stock',range:'1mo',fetchImpl:async url=> {
  urls.push(String(url));
  return {ok:true,json:async()=>String(url).includes('bitpanda.com') ? {data:[]} : {chart:{result:[{meta:{currency:'EUR'},timestamp:[1700000000,1700086400],indicators:{quote:[{close:[100,101]}]}}]}}};
 }});
 assert.match(urls[0],/q=O&/);
 assert.equal(result.source,'Yahoo Finance');
 assert.match(result.note,/Ersatzquelle/);
});

test('unusable long history recovers with Bitpanda and discloses its shorter coverage', async () => {
 const result = await loadBitpandaChart({symbol:'BTC',category:'crypto',range:'max',fetchImpl:async url=> {
  const path = String(url);
  return {ok:true,json:async()=> path.includes('/v3/assets') ? {data:[{attributes:{symbol:'BTC',group:'coin',pid:'bitcoin'}}]} : path.includes('/v3/ohlc') ? {data:['2022-01-01','2026-01-01'].map(date=>({attributes:{close:'100',time:{date_iso8601:date}}}))} : {chart:{result:[{meta:{},timestamp:[1700000000,1700086400],indicators:{quote:[{close:[100,101]}]}}]}}};
 }});
 assert.equal(result.range,'max');
 assert.match(result.source,/Bitpanda/);
 assert.match(result.note,/bis zu fünf Jahren/);
});
