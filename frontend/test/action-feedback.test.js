import test from "node:test";
import assert from "node:assert/strict";
import { dismissFeedback, feedbackSnapshot, notify, performAction, tradeFeedback } from "../src/components/actionFeedback.js";

const clear = () => feedbackSnapshot().forEach(item => dismissFeedback(item.id));
test("Fusion acceptance is distinct from execution for both buys and sells", () => {
  for (const side of ["buy", "sell"]) {
    const accepted = tradeFeedback({ id: "order-1", status: "new" }, { fusion: true, side, asset: "BTC-EUR" });
    assert.match(accepted.message, /angenommen/);
    assert.match(accepted.message, /Ausführung ist noch nicht bestätigt/);
    const filled = tradeFeedback({ id: "order-1", status: "filled" }, { fusion: true, side, asset: "BTC-EUR" });
    assert.match(filled.message, /ausgeführt/);
    assert.doesNotMatch(filled.message, /angenommen/);
  }
});
test("rejected and partially filled orders cannot be shown as fully successful", () => {
  assert.equal(tradeFeedback({ id: "o", status: "rejected" }, { fusion: true, side: "buy", asset: "BTC" }).kind, "error");
  assert.equal(tradeFeedback({ id: "o", status: "partially-filled" }, { fusion: true, side: "sell", asset: "BTC" }).kind, "warning");
});
test("normal trades require an actual confirmation and preserve the trade ID", () => {
  assert.match(tradeFeedback({ trade_id: "trade-1", status: "executed" }, { side: "SELL", asset: "ETH" }).message, /Verkauf ausgeführt.*Trade-ID: trade-1/);
  assert.throws(() => tradeFeedback({}, { side: "BUY", asset: "ETH" }), /Keine Bestätigung/);
});
test("progress is replaced by confirmation, even if refreshing balances fails", async () => {
  clear();
  const outcome = await performAction({ pending: "Sending", execute: async () => {
    assert.equal(feedbackSnapshot()[0].kind, "pending"); return { trade_id: "confirmed" };
  }, success: "Kauf bestätigt", refresh: async () => { throw new Error("Refresh offline"); } });
  assert.equal(outcome.ok, true);
  assert.deepEqual(feedbackSnapshot().map(item => item.kind), ["success", "warning"]);
  assert.equal(feedbackSnapshot()[0].message, "Kauf bestätigt");
});
test("lost transaction response is not retried and explicitly asks to check history", async () => {
  clear(); let calls = 0; let refreshes = 0;
  const outcome = await performAction({ pending: "Sending", execute: async () => { calls++; throw new TypeError("Failed to fetch"); }, success: "Success", uncertain: true, refresh: () => { refreshes++; } });
  assert.equal(outcome.ok, false);
  assert.equal(calls, 1); assert.equal(refreshes, 0);
  assert.equal(feedbackSnapshot()[0].kind, "error");
  assert.match(feedbackSnapshot()[0].message, /Transaktionsverlauf/);
});
test("missing trade ID is not a successful purchase even after HTTP success", async () => {
  clear();
  const outcome = await performAction({ pending: "Sending", execute: async () => ({}), success: result => tradeFeedback(result, { fusion: true, side: "buy", asset: "BTC" }), uncertain: true });
  assert.equal(outcome.ok, false); assert.equal(feedbackSnapshot()[0].kind, "error");
});
test("new feedback and dismissals are delivered to the shared store without timers", () => {
  clear(); const id = notify("Saved", "success");
  assert.equal(feedbackSnapshot().length, 1);
  notify("Updated", "warning", id); assert.equal(feedbackSnapshot().length, 1);
  assert.equal(feedbackSnapshot()[0].message, "Updated");
  dismissFeedback(id); assert.equal(feedbackSnapshot().length, 0);
});
test("a rejected order returned with HTTP success stays a rejection", async () => {
  clear(); let refreshed = false;
  const outcome = await performAction({ pending: "Sending", execute: async () => ({ id: "o", status: "rejected" }),
    success: result => tradeFeedback(result, { fusion: true, side: "buy", asset: "BTC" }), refresh: () => { refreshed = true; } });
  assert.equal(outcome.ok, false); assert.equal(refreshed, false);
  assert.equal(feedbackSnapshot()[0].kind, "error");
});
