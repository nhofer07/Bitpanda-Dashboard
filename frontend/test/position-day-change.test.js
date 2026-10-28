import test from 'node:test';
import assert from 'node:assert/strict';
import { positionDayChange, usablePositionDayHistory } from '../src/components/positionDayChange.js';
const now = Date.parse('2026-10-20T14:37:00Z');
const position = { currentPrice: 120, currentQuantity: 3, category: 'crypto', priceChangeDay: 99 };
const point = (date, close) => ({ date, close });
test('compares the exact rolling timestamp by interpolating surrounding quotes, ignoring ticker percentage', () => {
  const result = positionDayChange(position, [point('2026-10-19T14:30:00Z', 100), point('2026-10-19T14:40:00Z', 110)], now);
  assert.equal(result.comparedAt, now - 86400000);
  assert.equal(result.amount, 39);
  assert.ok(Math.abs(result.percent - (120 / 107 - 1) * 100) < 1e-10);
});
test('requires history covering 24 hours rather than using today’s opening price', () => {
  assert.equal(positionDayChange(position, [point('2026-10-20T00:00:00Z', 100)], now), null);
  assert.equal(positionDayChange(position, [], now), null);
});
test('handles an exact timestamp and negative changes', () => {
  const result = positionDayChange(position, [point('2026-10-19T14:37:00Z', 150)], now);
  assert.equal(result.amount, -90);
  assert.ok(Math.abs(result.percent + 20) < 1e-10);
});
test('does not interpolate a crypto data outage or apply underlying returns to leverage', () => {
  const history = [point('2026-10-19T10:00:00Z', 100), point('2026-10-19T18:00:00Z', 150)];
  assert.equal(positionDayChange(position, history, now), null);
  assert.equal(positionDayChange({ ...position, positionType: 'leverage' }, history, now), null);
});
test('uses the last traded price during an exchange closure', () => {
  const result = positionDayChange({ ...position, category: 'stock' }, [point('2026-10-16T20:00:00Z', 100), point('2026-10-19T13:30:00Z', 110)], Date.parse('2026-10-19T14:00:00Z'));
  assert.equal(result.amount, 60);
});

test('accepts SPYY EUR intraday fallback while rejecting currency or source mismatches', () => {
  const result = { source: 'Yahoo Finance', sourceCurrency: 'EUR', currency: 'EUR', interval: '15m', resolvedSymbol: 'SPYY.DE' };
  assert.equal(usablePositionDayHistory(result, 'etf'), true);
  assert.equal(usablePositionDayHistory(result, 'crypto'), false);
  assert.equal(usablePositionDayHistory({ ...result, sourceCurrency: 'USD' }, 'etf'), false);
  assert.equal(usablePositionDayHistory({ ...result, interval: '1d' }, 'etf'), false);
  assert.equal(usablePositionDayHistory({ currency: 'EUR', source: 'Bitpanda · Original-Kursdaten' }, 'crypto'), true);
});
