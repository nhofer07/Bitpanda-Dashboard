// Pure module shared by API and chart. Keep raw observations so a real change
// can be confirmed on the next refresh rather than lost permanently.
export function guardedPortfolioSnapshots(snapshots = [], { pending = true } = {}) {
  const unique = new Map(snapshots.map(point => [Date.parse(point.createdAt), point]));
  const points = [...unique.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const result = [];
  const time = p => Date.parse(p.createdAt);
  const valid = p => Number.isFinite(p?.totalValue) && p.totalValue >= 0 && Number.isFinite(time(p));
  const near = (a, b) => Math.abs(a.totalValue - b.totalValue) <= Math.max(5, Math.min(a.totalValue, b.totalValue) * 0.003);
  const jump = (a, b) => Math.abs(a.totalValue - b.totalValue) > Math.max(25, a.totalValue * 0.01);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!valid(point)) continue;
    const previous = result.at(-1);
    // No inference across outages or sparse historical samples.
    if (!previous || time(point) - time(previous) > 10 * 60_000 || !jump(previous, point)) {
      result.push(point);
      continue;
    }
    let recovery = -1;
    for (let j = i + 1; j < points.length; j++) {
      if (time(points[j]) - time(previous) > 10 * 60_000) break;
      if (valid(points[j]) && near(previous, points[j]) && valid(points[j + 1])
          && time(points[j + 1]) - time(previous) <= 10 * 60_000 && near(previous, points[j + 1])) {
        recovery = j;
        break;
      }
    }
    if (recovery >= 0) {
      i = recovery - 1;
      continue;
    }
    const next = points[i + 1];
    if (pending && !next) continue;
    // A sustained move is real chart data. A single latest observation waits
    // for confirmation; inconsistent observations wait for a settled reading.
    if (pending && valid(next) && time(next) - time(point) <= 10 * 60_000 && !near(point, next)) continue;
    result.push(point);
  }
  return result;
}
