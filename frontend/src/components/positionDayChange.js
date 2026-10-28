// Only accept the original feed or an ETF exchange feed already quoted in EUR.
export function usablePositionDayHistory(result, category) {
  return result?.currency === 'EUR' && (
    result.source === 'Bitpanda · Original-Kursdaten' ||
    (category === 'etf' && result.source === 'Yahoo Finance' && result.sourceCurrency === 'EUR' && result.interval === '15m')
  );
}

// Compare against a rolling 24-hour timestamp, never the first point of a day chart.
export function positionDayChange(position, history, now = Date.now()) {
  if (position.positionType === 'leverage') return null;
  const current = Number(position.currentPrice);
  const quantity = Number(position.currentQuantity);
  if (!(current > 0) || !(quantity > 0)) return null;
  const target = now - 86_400_000;
  const points = (history || []).map(point => ({ time: Date.parse(point.date), price: Number(point.close) }))
    .filter(point => Number.isFinite(point.time) && point.price > 0).sort((a, b) => a.time - b.time);
  const before = points.findLast(point => point.time <= target);
  const after = points.find(point => point.time >= target);
  if (!before) return null;
  let previous = before.price;
  if (before.time !== target) {
    // Never interpolate across a market closure. The last available quote is
    // the price at the target time while the market is closed.
    if (after && after.time - before.time <= 2 * 3_600_000) {
      previous += (after.price - before.price) * (target - before.time) / (after.time - before.time);
    } else if (position.category === 'crypto' || target - before.time > 4 * 86_400_000) return null;
  }
  return { amount: (current - previous) * quantity, percent: (current / previous - 1) * 100, comparedAt: target };
}
