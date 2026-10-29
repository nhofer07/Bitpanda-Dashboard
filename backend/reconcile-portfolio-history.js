// API timestamps label bucket starts; their values are bucket closes. Compare
// against independent observations at the END, never against the start label.
// This is display-only: preserve the API payload and the saved observations.
export function reconcilePortfolioHistory(points = [], localPoints = [], cashflows = [], coverageEndAt) {
  const intervals = points.slice(1).map((point, i) => point.time - points[i].time).filter(value => value > 0).sort((a, b) => a - b);
  if (!intervals.length) return { points, corrections: [] };
  const interval = intervals[Math.floor(intervals.length / 2)];
  const window = Math.min(15 * 60_000, interval / 4);
  const coverageEnd = Date.parse(coverageEndAt);
  const observations = [...new Map(localPoints.filter(point => !point.reconstructed && !point.synthetic && !point.correction && Number.isFinite(point.time) && Number.isFinite(point.value) && point.value >= 0).map(point => [point.time, point])).values()].sort((a, b) => a.time - b.time);
  const corrections = [];
  const corrected = points.map((point, index) => {
    const previous = points[index - 1], next = points[index + 1];
    // Only isolated, completed, regularly spaced buckets can be corrected.
    if (!previous || !next || point.time - previous.time !== interval || next.time - point.time !== interval) return point;
    const end = point.time + interval;
    if (!Number.isFinite(coverageEnd) || end + window > coverageEnd) return point;
    if (cashflows.some(flow => flow.time >= point.time - window && flow.time <= end + window)) return point;
    const before = observations.filter(local => local.time <= end && local.time >= end - window).at(-1);
    const after = observations.find(local => local.time >= end && local.time <= end + window);
    if (!before || !after || after.time - before.time < 30_000) return point;
    const tolerance = Math.max(5, Math.min(before.value, after.value) * 0.003);
    if (Math.abs(before.value - after.value) > tolerance) return point;
    const reference = end - before.time <= after.time - end ? before : after;
    const threshold = Math.max(25, reference.value * 0.01);
    if (Math.abs(point.value - reference.value) <= threshold
        || Math.abs(previous.value - reference.value) > threshold
        || Math.abs(next.value - reference.value) > threshold) return point;
    const correction = { originalValue: point.value, referenceValue: reference.value, referenceTime: reference.time, comparedAt: end, beforeTime: before.time, afterTime: after.time };
    corrections.push({ time: point.time, ...correction });
    return { ...point, value: reference.value, correction };
  });
  return { points: corrected, corrections };
}

// Different resolutions can only disagree at the same bucket CLOSE. A daily
// close says nothing about a six-hour peak earlier that day.
export function comparePortfolioHistory(points = [], comparisonPoints = []) {
  function closes(series) {
    const intervals = series.slice(1).map((p, i) => p.time - series[i].time).filter(n => n > 0).sort((a, b) => a - b);
    const interval = intervals[Math.floor(intervals.length / 2)];
    if (!interval) return new Map();
    return new Map(series.slice(0, -1).filter((p, i) => series[i + 1].time - p.time === interval).map(p => [p.time + interval, p]));
  }
  const primary = closes(points), comparison = closes(comparisonPoints);
  let compared = 0;
  const discrepancies = [];
  for (const [closeTime, point] of primary) {
    const other = comparison.get(closeTime);
    if (!other || !Number.isFinite(point.value) || !Number.isFinite(other.value)) continue;
    compared++;
    if (Math.abs(point.value - other.value) > Math.max(5, Math.min(point.value, other.value) * 0.003)) discrepancies.push({ time: point.time, closeTime, value: point.value, comparisonValue: other.value });
  }
  return { compared, discrepancies };
}

// Prefer a finer, completed source observation at the exact same bucket close.
// Preserve coarse timestamps/cadence so cashflows retain their original buckets.
export function preferFinerPortfolioHistory(points = [], finerPoints = [], coverageEndAt) {
  const intervalOf = series => { const gaps = series.slice(1).map((p,i) => p.time-series[i].time).filter(n=>n>0).sort((a,b)=>a-b); return gaps[Math.floor(gaps.length/2)]; };
  const coarseInterval = intervalOf(points), fineInterval = intervalOf(finerPoints), coverage = Date.parse(coverageEndAt);
  if (!(fineInterval > 0 && coarseInterval > fineInterval) || !Number.isFinite(coverage)) return { points, references: [] };
  const byClose = new Map(finerPoints.slice(0,-1).filter((p,i) => finerPoints[i+1].time-p.time === fineInterval && p.time+fineInterval <= coverage && Number.isFinite(p.value) && p.value>=0).map(p => [p.time+fineInterval,p]));
  const references = [];
  const result = points.map((point,index) => {
    if (!points[index+1] || points[index+1].time-point.time !== coarseInterval) return point;
    const closeTime = point.time+coarseInterval, other=byClose.get(closeTime); if (!other) return point;
    const reference={ originalValue:point.value, referenceValue:other.value, referenceTime:other.time, closeTime };
    references.push({time:point.time,...reference}); return {...point,value:other.value,resolutionReference:reference};
  });
  return {points:result,references};
}
