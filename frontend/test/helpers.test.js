import test from "node:test";
import assert from "node:assert/strict";
import { buildCashflowTotals } from "../src/components/helpers.js";

const transaction = (id, type, direction, value) => ({
  id,
  attributes: { type, in_or_out: direction, amount: String(value) }
});

test("incoming refunds increase net cashflow without being counted as deposits", () => {
  const item = transaction("refund", "deposit", "incoming", 25);
  const totals = buildCashflowTotals([item], { refund: "refund" });
  assert.equal(totals.deposits, 0);
  assert.equal(totals.refunds, 25);
  assert.equal(totals.net, 25);
});

test("refunded outgoing charges remain cash outflows without becoming expenses", () => {
  const item = transaction("charge", "withdrawal", "outgoing", 25);
  const totals = buildCashflowTotals([item], { charge: "refund" });
  assert.equal(totals.expenses, 0);
  assert.equal(totals.refunds, 25);
  assert.equal(totals.net, -25);
});

test("matching outgoing and incoming refunds cancel each other in net fiat", () => {
  const charge = transaction("charge", "withdrawal", "outgoing", 50);
  const credit = transaction("credit", "deposit", "incoming", 50);
  const totals = buildCashflowTotals(
    [charge, credit],
    { charge: "refund", credit: "refund" }
  );

  assert.equal(totals.deposits, 0);
  assert.equal(totals.expenses, 0);
  assert.equal(totals.refunds, 50);
  assert.equal(totals.net, 0);
});

test("transfers to another account reduce net fiat without becoming expenses", () => {
  const item = transaction("transfer", "withdrawal", "outgoing", 250);
  const totals = buildCashflowTotals([item], { transfer: "transfer" });
  assert.equal(totals.transfers, 250);
  assert.equal(totals.withdrawals, 0);
  assert.equal(totals.expenses, 0);
  assert.equal(totals.net, -250);
});

test("fiat netto equals deposits minus withdrawals minus transfers with booking overrides", () => {
  const items = [
    transaction("deposit", "deposit", "incoming", 1000),
    transaction("withdrawal", "withdrawal", "outgoing", -100),
    transaction("card", "transfer", "outgoing", 50),
    transaction("transfer", "withdrawal", "outgoing", 200),
    transaction("refund-credit", "deposit", "incoming", 30),
    transaction("refund-charge", "withdrawal", "outgoing", 20),
    transaction("ignored", "deposit", "incoming", 500),
    transaction("trade", "buy", "outgoing", 300)
  ];
  const totals = buildCashflowTotals(items, {
    withdrawal: "withdrawal",
    transfer: "transfer",
    "refund-credit": "refund",
    "refund-charge": "refund",
    ignored: "ignore"
  });

  assert.equal(totals.deposits, 1000);
  assert.equal(totals.withdrawals, 150);
  assert.equal(totals.transfers, 200);
  assert.equal(totals.fiatNet, 650);
  assert.equal(totals.net, 660);
});

test("fiat netto handles empty history and net outflows", () => {
  assert.equal(buildCashflowTotals([]).fiatNet, 0);
  assert.equal(buildCashflowTotals([
    transaction("withdrawal", "withdrawal", "outgoing", 100)
  ]).fiatNet, -100);
});
