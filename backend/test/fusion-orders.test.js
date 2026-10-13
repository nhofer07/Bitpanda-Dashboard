import test from "node:test";
import assert from "node:assert/strict";
import { buildFusionOrder, fusionErrorMessage, requestFusion } from "../fusion-orders.js";

const order = { confirmation: "FUSION HANDELN", pair: "btc-eur", side: "buy", type: "market", amount: "25.50" };

test("market buy sends the documented numeric payload to Fusion without a real purchase", async () => {
  let calls = 0;
  const accepted = { id: "test-order", status: "new", side: "Buy", type: "Market" };
  const response = await requestFusion("/account/orders", {
    apiKey: "fake-test-key", method: "POST", body: buildFusionOrder(order),
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(String(url), "https://api.fusion.bitpanda.com/v1/account/orders");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["X-Api-Key"], "fake-test-key");
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), { pair: "BTC-EUR", side: "Buy", type: "Market", amount: 25.5 });
      return new Response(JSON.stringify(accepted), { status: 202 });
    }
  });
  assert.equal(calls, 1);
  assert.deepEqual(response, accepted);
});

test("limit sell sends quantity and limit price as numbers and omits amount", () => {
  const { amount, ...quantityOrder } = order;
  assert.deepEqual(buildFusionOrder({ ...quantityOrder, side: "sell", type: "limit", quantity: "0.000125", limitPrice: "65000.10" }), {
    pair: "BTC-EUR", side: "Sell", type: "Limit", quantity: 0.000125, limitPrice: 65000.1
  });
  assert.deepEqual(buildFusionOrder({ ...order, type: "limit", limitPrice: "50000" }), {
    pair: "BTC-EUR", side: "Buy", type: "Limit", amount: 25.5, limitPrice: 50000
  });
});

test("rejects missing confirmation, invalid pairs and unsupported order types", () => {
  assert.throws(() => buildFusionOrder({ ...order, confirmation: "" }), /Handelsbestätigung/);
  assert.throws(() => buildFusionOrder({ ...order, pair: "BTC/EUR" }), /Handelspaar/);
  assert.throws(() => buildFusionOrder({ ...order, side: "other" }), /Order-Art/);
  assert.throws(() => buildFusionOrder({ ...order, type: "stop" }), /Order-Art/);
});

test("requires exactly one positive order size and a price for limit orders", () => {
  for (const amount of ["0", "-1", "Infinity", "1e5", "25,50", "abc"]) {
    assert.throws(() => buildFusionOrder({ ...order, amount }), /positive Zahl/);
  }
  assert.throws(() => buildFusionOrder({ ...order, amount: undefined }), /genau einen/);
  assert.throws(() => buildFusionOrder({ ...order, quantity: "0.1" }), /genau einen/);
  assert.throws(() => buildFusionOrder({ ...order, type: "limit" }), /Limitpreis/);
});

test("displays the documented errors array and preserves HTTP status without retrying", async () => {
  let calls = 0;
  await assert.rejects(requestFusion("/account/orders", {
    apiKey: "fake-test-key", method: "POST", body: buildFusionOrder(order),
    fetchImpl: async () => {
      calls++;
      return new Response(JSON.stringify({ errors: [
        { code: "VALIDATION_ERROR", field: "amount", title: "Invalid amount" },
        { code: "VALIDATION_ERROR", field: "side", title: "Invalid side" }
      ] }), { status: 400 });
    }
  }), error => error.status === 400 && error.message === "Bitpanda Fusion: amount: Invalid amount; side: Invalid side");
  assert.equal(calls, 1);
});

test("supports exchange errors and legacy or empty error responses", () => {
  assert.equal(fusionErrorMessage({ errors: [{ field: null, title: "Order was rejected" }] }, 422), "Bitpanda Fusion: Order was rejected");
  assert.equal(fusionErrorMessage({ message: "Forbidden" }, 403), "Bitpanda Fusion: Forbidden");
  assert.equal(fusionErrorMessage({ error: { message: "Unavailable" } }, 503), "Bitpanda Fusion: Unavailable");
  assert.equal(fusionErrorMessage(null, 400), "Bitpanda Fusion: HTTP 400");
});

test("read and cancel requests retain query parameters and empty response handling", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(options.body, undefined);
    if (options.method === "DELETE") return new Response(null, { status: 204 });
    assert.equal(url.searchParams.get("limit"), "100");
    assert.equal(url.searchParams.has("cursor"), false);
    return new Response("[]", { status: 200 });
  };
  assert.deepEqual(await requestFusion("/account/orders", { apiKey: "fake-test-key", params: { limit: 100, cursor: "" }, fetchImpl }), []);
  assert.equal(await requestFusion("/account/orders/test-id", { apiKey: "fake-test-key", method: "DELETE", fetchImpl }), null);
});

test("missing key blocks requests before contacting Fusion", async () => {
  await assert.rejects(requestFusion("/account/orders", { fetchImpl: () => assert.fail("Must not contact Fusion") }), error => error.status === 401);
});
