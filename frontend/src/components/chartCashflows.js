import { amount, cashflowClass, getDirection } from "./helpers.js";

export function buildChartCashflows(transactions = [], overrides = {}) {
  return transactions.map(transaction => {
    const attributes = transaction.attributes || {};
    const date = attributes.time?.date_iso8601 || attributes.created_at || transaction.created_at;
    const time = date ? Date.parse(date) : Number(attributes.time?.unix) * 1000;
    const value = amount(transaction);
    const classification = cashflowClass(transaction, overrides);
    let signedAmount = 0;
    if (classification === "deposit") signedAmount = value;
    else if (["withdrawal", "expense", "transfer"].includes(classification)) signedAmount = -value;
    else if (classification === "refund") signedAmount = getDirection(transaction) === "incoming" ? value : -value;
    return { id: transaction.id, time, value, signedAmount, classification };
  }).filter(item => Number.isFinite(item.time) && Number.isFinite(item.value) && item.value > 0 && item.signedAmount !== 0)
    .sort((a, b) => a.time - b.time);
}

export function cashflowsInRange(cashflows, start, end) {
  return cashflows.filter(item => item.time >= start && item.time <= end);
}

// Remove cashflows from the curve while retaining each recorded portfolio value.
export function cashflowAdjustedPoints(points, cashflows) {
  if (!points.length) return [];
  const inPeriod = cashflows.filter(item => item.time > points[0].time && item.time <= points.at(-1).time)
    .sort((a, b) => a.time - b.time);
  let index = 0;
  let total = 0;
  const series = points.map(point => {
    while (index < inPeriod.length && inPeriod[index].time <= point.time) {
      total += inPeriod[index++].signedAmount;
    }
    return { ...point, adjustedValue: point.value - total };
  });
  return series.map(point => ({ ...point, adjustedValue: point.adjustedValue + total }));
}

export function portfolioValueScale(points) {
  const minimumPoint = points.reduce((lowest, point) => point.adjustedValue < lowest.adjustedValue ? point : lowest, points[0]);
  const maximumPoint = points.reduce((highest, point) => point.adjustedValue > highest.adjustedValue ? point : highest, points[0]);
  const min = minimumPoint.adjustedValue;
  const max = maximumPoint.adjustedValue;
  const padding = Math.max(Math.abs(max) * 0.001, 0.5);
  return { minimumPoint, maximumPoint, scaleMin: min === max ? min - padding : min, scaleMax: min === max ? max + padding : max };
}
