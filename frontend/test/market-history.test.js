import test from "node:test";
import assert from "node:assert/strict";
import { loadMarketHistorySnapshot, marketDateLabel } from "../src/components/marketHistory.js";

test("yesterday's last quote never receives today's label", () => {
  const now = new Date(2026, 9, 7, 12);
  assert.equal(marketDateLabel(new Date(2026, 9, 6, 23, 55).toISOString(), now), "6. Oktober");
  assert.equal(marketDateLabel(new Date(2026, 9, 7, 0, 5).toISOString(), now), "Heute · 7. Oktober");
  assert.equal(marketDateLabel(undefined, now), "Letzter Handelstag");
  assert.equal(marketDateLabel("invalid", now), "Letzter Handelstag");
  assert.equal(marketDateLabel(new Date(2025, 9, 7).toISOString(), now), "7. Oktober 2025");
});

test("labels advance at midnight without changing the actual quote date", () => {
  const quote = new Date(2026, 9, 6, 23, 50).toISOString();
  assert.equal(marketDateLabel(quote, new Date(2026, 9, 6, 23, 59)), "Heute · 6. Oktober");
  assert.equal(marketDateLabel(quote, new Date(2026, 9, 7, 0, 1)), "6. Oktober");
});

test("cockpit and details share pending and completed chart snapshots until refresh", async t => {
  let calls = 0;
  const snapshot = { history: [{ date: "2026-10-06T20:00:00Z", close: 100 }] };
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return { ok: true, json: async () => snapshot };
  });
  const card = { assetKey: "MCD", displayName: "McDonald's", category: "stock" };
  const detail = { symbol: "MCD", name: "McDonald's", category: "stock" };
  const pending = loadMarketHistorySnapshot(card, "1d", "test-cycle");
  assert.equal(loadMarketHistorySnapshot(detail, "1d", "test-cycle"), pending);
  assert.equal(await pending, snapshot);
  assert.equal(await loadMarketHistorySnapshot(detail, "1d", "test-cycle"), snapshot);
  assert.equal(calls, 1);
  await loadMarketHistorySnapshot(detail, "1d", "next-cycle");
  assert.equal(calls, 2);
  await loadMarketHistorySnapshot(detail, "1w", "next-cycle");
  assert.equal(calls, 3);
});

test("failed snapshots can be retried rather than being cached", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return calls === 1
      ? { ok: false, json: async () => ({ error: "Unavailable" }) }
      : { ok: true, json: async () => ({ history: [] }) };
  });
  const asset = { symbol: "RETRY" };
  await assert.rejects(loadMarketHistorySnapshot(asset, "1d", "retry-cycle"), /Unavailable/);
  assert.deepEqual(await loadMarketHistorySnapshot(asset, "1d", "retry-cycle"), { history: [] });
  assert.equal(calls, 2);
});
