import { amount, cashflowClass, defaultCashflowClass } from "./helpers.js";

const viennaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" });
export function calendarDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(viennaDate.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function buildSalesDays(assets = [], now = Date.now()) {
  const days = new Map();
  for (const asset of assets) {
    if (String(asset.assetKey || asset.name).toUpperCase() === "BCPEUR") continue;
    for (const trade of asset.trades || []) {
      const time = Date.parse(trade.time?.date_iso8601);
      const key = calendarDate(time);
      if (trade.type !== "sell" || !key || time > now) continue;
      const day = days.get(key) || { key, gain: 0, count: 0, missing: 0, trades: [] };
      const gain = trade.realizedProfit == null ? NaN : Number(trade.realizedProfit);
      day.count++;
      if (Number.isFinite(gain)) day.gain += gain;
      else day.missing++;
      day.trades.push({ ...trade, assetKey: asset.assetKey, assetName: asset.displayName || asset.name || asset.assetKey });
      days.set(key, day);
    }
  }
  for (const day of days.values()) {
    if (day.missing) day.gain = null;
    day.trades.sort((a, b) => Date.parse(a.time?.date_iso8601) - Date.parse(b.time?.date_iso8601));
  }
  return days;
}

export function buildPortfolioDays({ snapshots = [], currentValue, loadedAt, historyStartedAt, transactions = [], cashflowOverrides = {}, now = Date.now() }) {
  const byTime = new Map();
  const historyStart = Date.parse(historyStartedAt) || 0;
  for (const point of [...snapshots, { createdAt: loadedAt, totalValue: currentValue }]) {
    const time = Date.parse(point?.createdAt);
    const value = point?.totalValue;
    if (Number.isFinite(time) && time >= historyStart && time <= now && typeof value === "number" && Number.isFinite(value) && value >= 0) byTime.set(time, { time, value, key: calendarDate(time) });
  }
  const points = [...byTime.values()].sort((a, b) => a.time - b.time);
  const groups = new Map();
  for (const point of points) {
    if (!groups.has(point.key)) groups.set(point.key, []);
    groups.get(point.key).push(point);
  }
  const flows = transactions.map(transaction => {
    const attributes = transaction.attributes || {};
    const time = Date.parse(attributes.time?.date_iso8601 || attributes.created_at || transaction.created_at);
    const value = amount(transaction);
    const kind = cashflowClass(transaction, cashflowOverrides);
    const signed = kind === "deposit" ? value : ["withdrawal", "expense", "transfer"].includes(kind) ? -value : kind === "refund" ? (defaultCashflowClass(transaction) === "deposit" ? -value : value) : 0;
    return { time, signed };
  }).filter(flow => Number.isFinite(flow.time) && Number.isFinite(flow.signed) && flow.signed !== 0);
  const days = new Map();
  let previous;
  for (const [key, recorded] of groups) {
    const previousDate = new Date(`${key}T12:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const consecutive = previous?.key === previousDate.toISOString().slice(0, 10);
    const first = consecutive ? previous : recorded[0];
    const last = recorded.at(-1);
    const cashflow = flows.filter(flow => flow.time > first.time && flow.time <= last.time).reduce((sum, flow) => sum + flow.signed, 0);
    const gain = first.time !== last.time ? last.value - first.value - cashflow : null;
    days.set(key, { key, gain, percent: gain != null && first.value > 0 ? gain / first.value * 100 : null, first, last, cashflow, partial: !consecutive, count: recorded.length });
    previous = last;
  }
  return days;
}

export function monthCells(month) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
