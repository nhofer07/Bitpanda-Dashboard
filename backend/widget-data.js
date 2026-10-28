import { portfolioChartPoints } from './portfolio-chart-points.js';
import { buildChartCashflows, cashflowAdjustedPoints, portfolioPeriodResult } from './chart-cashflows.js';
import { portfolioHistoryCashflows } from './portfolio-history-cashflows.js';
import { reconcilePortfolioHistory } from './reconcile-portfolio-history.js';
import { apiHistoryIsCurrent } from './portfolio-api-history.js';

function widgetChart(data, overrides, now) {
  const local = portfolioChartPoints({ snapshots: data.snapshots, currentValue: data.portfolioHistoryWarning ? undefined : data.portfolio.totalValue, loadedAt: data.loadedAt, historyStartedAt: data.portfolioHistoryStartedAt });
  const flows = buildChartCashflows(data.transactions, overrides);
  if (apiHistoryIsCurrent(data.portfolioApiHistory, now)) {
    const history = data.portfolioApiHistory;
    const result = reconcilePortfolioHistory(history.snapshots.map(p => ({ time: Date.parse(p.createdAt), value: p.totalValue })), local, flows, history.loadedAt);
    const mapped = portfolioHistoryCashflows(result.points, flows, history.loadedAt);
    const performance = portfolioPeriodResult(result.points, mapped.calculation);
    return { version: 1, periodLabel: '24 Stunden', source: 'Bitpanda', completeDay: false,
      points: cashflowAdjustedPoints(result.points, mapped.calculation).map(p => ({ time: p.time / 1000, value: p.adjustedValue })),
      change: performance.profit, percent: result.corrections.length ? performance.percent : history.reportedReturnPercent ?? performance.percent,
      corrections: result.corrections, lastPointAt: history.lastPointAt };
  }
  // Keep local-day behaviour for offline/older servers, using guarded readings.
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = time => parts.format(new Date(time));
  const today = local.filter(p => day(p.time) === day(now) && p.time <= now);
  const previous = local.filter(p => day(p.time) !== day(now) && p.time < now).at(-1);
  if (today.length && previous) {
    // Find Vienna midnight without assuming a fixed UTC offset (DST).
    let start = today[0].time;
    while (day(start - 60_000) === day(now)) start -= 60_000;
    start = Math.floor(start / 60_000) * 60_000;
    if (today[0].time > start) today.unshift({ time: start, value: previous.value });
  }
  const result = portfolioPeriodResult(today, flows);
  return { version: 1, periodLabel: previous ? 'Heute' : null, source: 'Gespeichert', completeDay: Boolean(previous),
    points: cashflowAdjustedPoints(today, flows).map(p => ({ time: p.time / 1000, value: p.adjustedValue })), change: today.length > 1 ? result.profit : null, percent: result.percent, corrections: [] };
}

export function compactWidgetData(data, cashflowOverrides, now = Date.now()) {
  const cutoff = now - 48 * 60 * 60 * 1000;
  const apiHistory = data.portfolioApiHistory?.available && !data.portfolioApiHistory.stale && data.portfolioApiHistory.snapshots?.length > 1 ? data.portfolioApiHistory : null;
  const historyStartedAt = apiHistory?.firstPointAt || data.portfolioHistoryStartedAt;
  const all = (apiHistory?.snapshots || data.snapshots || []).filter(p => Date.parse(p.createdAt) >= Date.parse(historyStartedAt || 0)).sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt));
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
