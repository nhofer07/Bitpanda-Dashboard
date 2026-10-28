import { portfolioChartPoints } from './portfolio-chart-points.js';
import { cashflowAdjustedPoints } from './chart-cashflows.js';
import { buildPortfolioDays, calendarDate, calendarCashflows } from './performance-calendar.js';

function widgetChart(data, overrides, now) {
  const local = portfolioChartPoints({ snapshots: data.snapshots, currentValue: data.portfolioHistoryWarning ? undefined : data.portfolio.totalValue, loadedAt: data.loadedAt, historyStartedAt: data.portfolioHistoryStartedAt }).filter(p => p.time <= now);
  const days = buildPortfolioDays({ snapshots: local.map(p => ({ createdAt: new Date(p.time).toISOString(), totalValue: p.value })), transactions: data.transactions, cashflowOverrides: overrides, now });
  const day = days.get(calendarDate(now));
  if (!day) return { version: 1, periodLabel: 'Heute', source: 'Gespeichert', completeDay: false, points: [], change: null, percent: null, corrections: [] };
  const today = local.filter(p => calendarDate(p.time) === day.key);
  // Use exactly the calendar's prior-day baseline and cashflow calculation.
  const calculation = day.first.time < today[0].time ? [day.first, ...today] : today;
  const adjusted = cashflowAdjustedPoints(calculation, calendarCashflows(data.transactions, overrides).map(flow => ({ time: flow.time, signedAmount: flow.signed })));
  if (!day.partial && adjusted.length) {
    let midnight = today[0].time;
    while (calendarDate(midnight - 60_000) === day.key) midnight -= 60_000;
    adjusted[0] = { ...adjusted[0], time: Math.floor(midnight / 60_000) * 60_000 };
  }
  return { version: 1, periodLabel: day.partial ? null : 'Heute', source: 'Gespeichert', completeDay: !day.partial,
    points: adjusted.map(p => ({ time: p.time / 1000, value: p.adjustedValue })), change: day.gain, percent: day.percent, corrections: [], lastPointAt: new Date(day.last.time).toISOString() };
}

export function compactWidgetData(data, cashflowOverrides, now = Date.now()) {
  const cutoff = now - 48 * 60 * 60 * 1000;
  const historyStartedAt = data.portfolioHistoryStartedAt;
  const all = (data.snapshots || []).filter(p => Date.parse(p.createdAt) >= Date.parse(historyStartedAt || 0)).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const previous = all.filter(p => Date.parse(p.createdAt) < cutoff).at(-1);
  const snapshots = all.filter(p => Date.parse(p.createdAt) >= cutoff);
  if (previous) snapshots.unshift(previous);
  return {
    chart: widgetChart(data, cashflowOverrides?.overrides || cashflowOverrides || {}, now),
    loadedAt: data.loadedAt, portfolioHistoryStartedAt: historyStartedAt,
    portfolio: { totalValue: data.portfolio.totalValue },
    snapshots: snapshots.map(({createdAt,totalValue}) => ({createdAt,totalValue})),
    transactions: (data.transactions || []).filter(t => Date.parse(t.attributes?.time?.date_iso8601 || t.attributes?.created_at || t.created_at) >= cutoff).map(t => ({
      id: t.id, created_at: t.created_at,
      attributes: { type:t.attributes?.type, in_or_out:t.attributes?.in_or_out, amount:t.attributes?.amount, created_at:t.attributes?.created_at, time:t.attributes?.time }
    })),
    cashflowOverrides: cashflowOverrides?.overrides || cashflowOverrides || {},
    cache: data.cache
  };
}
