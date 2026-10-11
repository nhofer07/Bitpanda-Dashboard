import test from "node:test";
import assert from "node:assert/strict";
import { buildPortfolioDays, buildSalesDays, calendarDate, monthCells } from "../src/components/performanceCalendar.js";

test("calendar uses Vienna dates, Monday first, and leap years", () => {
  assert.equal(calendarDate("2026-10-07T22:30:00Z"), "2026-10-08");
  assert.equal(calendarDate("invalid"), null);
  const october = monthCells("2026-10");
  assert.deepEqual(october.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.equal(october.length % 7, 0);
  assert.ok(monthCells("2024-02").includes("2024-02-29"));
});
test("portfolio excludes deposits and withdrawals while retaining market gains", () => {
  const snapshots = [
    { createdAt: "2026-10-06T21:59:00Z", totalValue: 1000 },
    { createdAt: "2026-10-07T10:00:00Z", totalValue: 1250 },
    { createdAt: "2026-10-07T21:59:00Z", totalValue: 1160 }
  ];
  const transactions = [
    { id: "deposit", attributes: { type: "deposit", in_or_out: "incoming", amount: "200", created_at: "2026-10-07T09:00:00Z" } },
    { id: "withdrawal", attributes: { type: "withdrawal", in_or_out: "outgoing", amount: "100", created_at: "2026-10-07T19:00:00Z" } }
  ];
  const result = buildPortfolioDays({ snapshots, transactions, now: Date.parse("2026-10-08T12:00:00Z") }).get("2026-10-07");
  assert.equal(result.gain, 60);
  assert.equal(result.percent, 6);
  assert.equal(result.cashflow, 100);
  assert.equal(result.partial, false);
  assert.equal(buildPortfolioDays({ snapshots, transactions, cashflowOverrides: { deposit: "ignore" }, now: Date.parse("2026-10-08T12:00:00Z") }).get("2026-10-07").gain, 260);
});
test("cash movements alone do not create green or red portfolio days", () => {
  const result = buildPortfolioDays({ snapshots: [{ createdAt: "2026-10-06T21:59:00Z", totalValue: 1000 }, { createdAt: "2026-10-07T12:00:00Z", totalValue: 1200 }], transactions: [{ id: "cash", attributes: { type: "deposit", in_or_out: "incoming", amount: "200", created_at: "2026-10-07T10:00:00Z" } }], now: Date.parse("2026-10-08T12:00:00Z") });
  assert.equal(result.get("2026-10-07").gain, 0);
});
test("missing days are not invented or attributed to the next day", () => {
  const days = buildPortfolioDays({ snapshots: [{ createdAt: "2026-10-05T20:00:00Z", totalValue: 1000 }, { createdAt: "2026-10-07T08:00:00Z", totalValue: 1100 }, { createdAt: "2026-10-07T18:00:00Z", totalValue: 1120 }], now: Date.parse("2026-10-08T12:00:00Z") });
  assert.equal(days.has("2026-10-06"), false);
  assert.equal(days.get("2026-10-07").gain, 20);
  assert.equal(days.get("2026-10-07").partial, true);
  assert.equal(days.get("2026-10-05").gain, null);
});
test("sales calendar sums net results, ignores buys and leaves non-selling days absent", () => {
  const assets = [{ assetKey: "TEST", trades: [
    { id: "buy", type: "buy", realizedProfit: null, time: { date_iso8601: "2026-10-06T10:00:00Z" } },
    { id: "sell1", type: "sell", realizedProfit: 30, time: { date_iso8601: "2026-10-07T10:00:00Z" } },
    { id: "sell2", type: "sell", realizedProfit: -10, time: { date_iso8601: "2026-10-07T11:00:00Z" } },
    { id: "invalid", type: "sell", realizedProfit: 100, time: {} }
  ] }];
  const days = buildSalesDays(assets, Date.parse("2026-10-08T12:00:00Z"));
  assert.equal(days.has("2026-10-06"), false);
  assert.equal(days.get("2026-10-07").gain, 20);
  assert.equal(days.get("2026-10-07").count, 2);
});
test("sales with missing results remain neutral instead of displaying a false gain", () => {
  const days = buildSalesDays([{ assetKey: "TEST", trades: [{ type: "sell", realizedProfit: null, time: { date_iso8601: "2026-10-07T10:00:00Z" } }] }], Date.parse("2026-10-08T12:00:00Z"));
  assert.equal(days.get("2026-10-07").gain, null);
  assert.equal(days.get("2026-10-07").count, 1);
});
