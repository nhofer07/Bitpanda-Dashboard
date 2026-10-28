import { guardedPortfolioSnapshots } from './portfolio-chart-guard.js';
export function portfolioChartPoints({ snapshots = [], currentValue, loadedAt, historyStartedAt }) {
  const byTime = new Map();
  const declaredStart = Date.parse(historyStartedAt);
  const startTime = Number.isFinite(declaredStart) ? declaredStart : -Infinity;
  for (const item of guardedPortfolioSnapshots([...(Array.isArray(snapshots) ? snapshots : []), { createdAt: loadedAt, totalValue: currentValue }])) {
    const time = Date.parse(item?.createdAt);
    const value = item?.totalValue;
    if (Number.isFinite(time) && time >= startTime && typeof value === "number" && Number.isFinite(value) && value >= 0) {
      byTime.set(time, { time, value, ...(item.reconstructed ? { reconstructed: true } : {}) });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
