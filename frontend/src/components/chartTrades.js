export function chartTrades(trades, points) {
  if (points.length < 2) return [];
  const start = Date.parse(points[0].date), end = Date.parse(points.at(-1).date);
  return trades.flatMap((trade, index) => {
    const stamp = Date.parse(trade.time?.date_iso8601 || trade.time);
    const quantity = Number(trade.quantity);
    const price = Number(trade.price) || (quantity > 0 ? Number(trade.tradeValueBeforeFee ?? trade.fiat) / quantity : 0);
    if (!['buy', 'sell'].includes(trade.type) || !Number.isFinite(stamp) || stamp < start || stamp > end || !Number.isFinite(price) || price <= 0) return [];
    return [{ ...trade, key: `${trade.id || index}:${index}`, date: new Date(stamp).toISOString(), close: price }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}
