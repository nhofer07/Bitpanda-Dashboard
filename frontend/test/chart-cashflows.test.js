import test from "node:test";
import assert from "node:assert/strict";
import { buildChartCashflows, cashflowsInRange, cashflowAdjustedPoints, portfolioValueScale } from "../src/components/chartCashflows.js";
import { buildCashflowTotals } from "../src/components/helpers.js";

const withdrawal = { id: "withdrawal", attributes: { type: "withdrawal", in_or_out: "outgoing", amount: "60", time: { date_iso8601: "2026-10-08T12:00:00+02:00" } } };

test("a 60 euro withdrawal automatically creates a negative chart marker including range boundaries", () => {
  const [flow] = buildChartCashflows([withdrawal]);
  assert.equal(flow.signedAmount, -60);
  assert.equal(cashflowsInRange([flow], flow.time, flow.time + 1000).length, 1);
  assert.equal(cashflowsInRange([flow], flow.time - 1000, flow.time).length, 1);
  assert.equal(cashflowsInRange([flow], flow.time + 1, flow.time + 1000).length, 0);
});

test("refund markers follow actual money direction and unix timestamps are supported", () => {
  const charge = { ...withdrawal, attributes: { ...withdrawal.attributes, time: { unix: "1791453600" } } };
  assert.equal(buildChartCashflows([charge], { withdrawal: "refund" })[0].signedAmount, -60);
  assert.equal(buildChartCashflows([charge])[0].time, 1791453600000);
  assert.equal(buildChartCashflows([charge], { withdrawal: "ignore" }).length, 0);
});

test("recognizing a withdrawal preserves account return when the balance drops by the same amount", () => {
  const deposit = { id: "deposit", attributes: { type: "deposit", in_or_out: "incoming", amount: "1000" } };
  const before = 1200 - buildCashflowTotals([deposit]).fiatNet;
  const after = 1140 - buildCashflowTotals([deposit, withdrawal]).fiatNet;
  assert.equal(before, 200);
  assert.equal(after, before);
});

test("chart stays cashflow neutral but extrema labels show recorded values", () => {
  const points = [{ time: 1, value: 3357 }, { time: 2, value: 3600 }, { time: 3, value: 3540 }];
  const adjusted = cashflowAdjustedPoints(points, [{ time: 3, signedAmount: -60 }]);
  const scale = portfolioValueScale(adjusted);
  assert.equal(adjusted[0].adjustedValue, 3297);
  assert.equal(scale.minimumPoint.value, 3357);
  assert.equal(scale.minimumPoint.time, 1);
  assert.equal(scale.maximumPoint.value, 3600);
  assert.equal(adjusted[1].adjustedValue, adjusted[2].adjustedValue);
  assert.equal(adjusted.at(-1).adjustedValue - adjusted[0].adjustedValue, 243);
});

test("curve extrema follow performance rather than raw balance", () => {
  const points = [{ time: 1, value: 4000 }, { time: 2, value: 5100 }, { time: 3, value: 4150 }];
  const adjusted = cashflowAdjustedPoints(points, [{ time: 2, signedAmount: 1000 }, { time: 3, signedAmount: -1000 }]);
  const scale = portfolioValueScale(adjusted);
  assert.equal(scale.minimumPoint.value, 4000);
  assert.equal(scale.maximumPoint.value, 4150);
  assert.equal(scale.maximumPoint.time, 3);
});

test("cashflows alone keep the curve flat and single points have a usable scale", () => {
  const adjusted = cashflowAdjustedPoints([{ time: 1, value: 4000 }, { time: 2, value: 4100 }], [{ time: 2, signedAmount: 100 }]);
  assert.equal(adjusted[0].adjustedValue, adjusted[1].adjustedValue);
  const scale = portfolioValueScale(adjusted);
  assert.ok(scale.scaleMin < 4100 && scale.scaleMax > 4100);
  const single = portfolioValueScale(cashflowAdjustedPoints([{ time: 1, value: 4000 }], []));
  assert.equal(single.minimumPoint.value, 4000);
  assert.ok(single.scaleMin < 4000 && single.scaleMax > 4000);
});


test("uniform values move historical highs to today's capital after deposits and withdrawals", () => {
  const points = [{ time: 1, value: 3500 }, { time: 2, value: 3600 }, { time: 3, value: 3950 }];
  const deposited = cashflowAdjustedPoints(points, [{ time: 3, signedAmount: 400 }]);
  assert.equal(portfolioValueScale(deposited).maximumPoint.adjustedValue, 4000);
  assert.equal(deposited.at(-1).adjustedValue, 3950);
  assert.equal(points[1].value, 3600);
  const withdrawn = cashflowAdjustedPoints(points, [{ time: 3, signedAmount: -400 }]);
  assert.equal(withdrawn[1].adjustedValue, 3200);
  assert.equal(withdrawn.at(-1).adjustedValue, 3950);
  assert.equal(cashflowAdjustedPoints(points.slice(1), [{ time: 3, signedAmount: 400 }])[0].adjustedValue, 4000);
});

test('cashflow periods do not report profit divided by an obsolete initial balance as return', async () => {
  const { portfolioPeriodResult } = await import('../src/components/chartCashflows.js');
  const result = portfolioPeriodResult([{ time: 1, value: 100 }, { time: 3, value: 1100 }], [{ time: 2, signedAmount: 900 }]);
  assert.equal(result.profit, 100);
  assert.equal(result.percent, null);
  assert.equal(result.hasCashflows, true);
  assert.equal(portfolioPeriodResult([{ time: 1, value: 1000 }, { time: 3, value: 1100 }], []).percent, 10);
});
test('actual mode uses actual values for both geometry and extrema', async () => {
  const { portfolioDisplayPoints } = await import('../src/components/chartCashflows.js');
  const adjusted = cashflowAdjustedPoints([{ time: 1, value: 4000 }, { time: 2, value: 5100 }, { time: 3, value: 4150 }], [{ time: 2, signedAmount: 1000 }, { time: 3, signedAmount: -1000 }]);
  assert.equal(portfolioValueScale(portfolioDisplayPoints(adjusted, false)).maximumPoint.time, 2);
  assert.equal(portfolioValueScale(portfolioDisplayPoints(adjusted, true)).maximumPoint.time, 3);
});
