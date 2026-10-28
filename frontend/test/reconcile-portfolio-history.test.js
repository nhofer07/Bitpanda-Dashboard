import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePortfolioHistory, comparePortfolioHistory } from '../src/components/reconcilePortfolioHistory.js';
const start = Date.parse('2026-10-21T00:00:00Z'), hour = 3600_000;
const points = [3309.36, 3521.21, 3319.81, 3304.28].map((value, i) => ({time: start + i * 6 * hour, value}));
const local = [{time: start + 12 * hour - 60_000, value: 3315}, {time: start + 12 * hour + 60_000, value: 3316}];
const end = new Date(start + 24 * hour).toISOString();
test('corrects an isolated API spike against independent bucket-close readings, preserving originals', () => {
  const original = structuredClone(points);
  const result = reconcilePortfolioHistory(points, local, [], end);
  assert.equal(result.corrections.length, 1);
  assert.equal(result.points[1].value, 3315);
  assert.equal(result.points[1].correction.originalValue, 3521.21);
  assert.deepEqual(points, original);
});
test('supports downward anomalies and never replaces genuine movements confirmed locally', () => {
  const dip = points.map((p,i)=>({...p,value:i===1?2900:p.value}));
  assert.equal(reconcilePortfolioHistory(dip,local,[],end).corrections.length,1);
  assert.equal(reconcilePortfolioHistory(points,local.map(p=>({...p,value:3521})),[],end).corrections.length,0);
});
test('missing, stale, reconstructed, duplicate, unstable or start-labelled evidence cannot correct', () => {
  for (const evidence of [[], local.slice(0,1), [local[0],local[0]], local.map(p=>({...p,reconstructed:true})), local.map(p=>({...p,synthetic:true})), local.map(p=>({...p,time:p.time-6*hour})), local.map((p,i)=>({...p,value:p.value+i*100})), local.map(p=>({...p,time:p.time-hour}))]) {
    assert.equal(reconcilePortfolioHistory(points,evidence,[],end).corrections.length,0);
  }
});
test('cashflows, sparse buckets, sustained changes and incomplete coverage prevent correction', () => {
  assert.equal(reconcilePortfolioHistory(points,local,[{time:start+7*hour}],end).corrections.length,0);
  assert.equal(reconcilePortfolioHistory(points.filter((_,i)=>i!==2),local,[],end).corrections.length,0);
  assert.equal(reconcilePortfolioHistory(points.map((p,i)=>({...p,value:i>1?3520:p.value})),local,[],end).corrections.length,0);
  assert.equal(reconcilePortfolioHistory(points,local,[],new Date(start+12*hour).toISOString()).corrections.length,0);
});
test('cross-range comparison aligns closes rather than start labels and cannot reject intraday peaks', () => {
  const fine = Array.from({length:9},(_,i)=>({time:start+i*6*hour,value:i===1?3521:3300}));
  const coarse = [{time:start,value:3300},{time:start+24*hour,value:3300},{time:start+48*hour,value:3300}];
  assert.deepEqual(comparePortfolioHistory(fine,coarse),{compared:2,discrepancies:[]});
  fine[3].value=3500;
  const comparison = comparePortfolioHistory(fine,coarse);
  assert.equal(comparison.discrepancies.length,1);
  assert.equal(comparison.discrepancies[0].time,start+18*hour);
  assert.equal(comparison.discrepancies[0].closeTime,start+24*hour);
});
test('unavailable or missing comparison intervals never produce false disagreements', () => {
  assert.deepEqual(comparePortfolioHistory(points,[]),{compared:0,discrepancies:[]});
});
