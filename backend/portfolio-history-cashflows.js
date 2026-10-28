// Official history contains closing values labelled by the beginning of each
// time bucket. Keep those labels intact, but subtract a cashflow in the bucket
// that already contains it. Tooltips retain the original booking timestamp.
export function portfolioHistoryCashflows(points, cashflows, coverageEndAt) {
  if (points.length < 2) return { calculation: [], markers: [] };
  const intervals = points.slice(1).map((p, i) => p.time - points[i].time).filter(value => value > 0).sort((a, b) => a - b);
  if (!intervals.length) return { calculation: [], markers: [] };
  const interval = intervals[Math.floor(intervals.length / 2)];
  const requestedEnd = Date.parse(coverageEndAt);
  const end = Math.min(points.at(-1).time + interval, Number.isFinite(requestedEnd) ? requestedEnd : points.at(-1).time);
  const calculation = [], markers = [];
  for (const flow of cashflows) {
    if (flow.time < points[0].time || flow.time > end || flow.time >= points.at(-1).time + interval) continue;
    let index = points.findIndex(point => point.time > flow.time);
    index = index < 0 ? points.length - 1 : Math.max(0, index - 1);
    let chartTime = points[index].time;
    const next = points[index + 1];
    // Across a missing interval the earlier point cannot contain a later
    // booking. Apply it to the next available valuation instead.
    if (next && next.time - chartTime > interval * 1.5 && flow.time >= chartTime + interval) chartTime = next.time;
    calculation.push({ ...flow, time: chartTime });
    markers.push({ ...flow, chartTime });
  }
  return { calculation, markers };
}
