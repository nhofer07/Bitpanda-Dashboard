import test from "node:test";
import assert from "node:assert/strict";
import { fetchPublicPages } from "../public-pagination.js";
import { calculatePaidTax } from "../paid-tax.js";

const cursor = date => Buffer.from(date).toString("base64");
const operation = (id, amount, date) => ({ operation_id: id, operation_type: "sell", transactions: [{ transaction_id: `tax-${id}`, transaction_type: "tax", flow: "OUTGOING", wallet_owner: "shared-default", currency_id: "eur", credited_at: date, asset_amount: { value: String(amount) } }] });
const first = operation("first", 10, "2026-01-02T12:00:00.100Z");
const boundary = operation("boundary", 5, "2025-11-27T22:00:12Z");
const oldest = operation("oldest", 2, "2025-11-13T14:05:16Z");
const firstCursor = cursor(first.transactions[0].credited_at);
const boundaryCursor = cursor(boundary.transactions[0].credited_at);

test("recovers timestamp cursor restarting the first page, preserves boundary and counts tax once", async () => {
  const requests = [];
  const pages = [
    { data: [first], has_next_page: true, next_cursor: firstCursor },
    { data: [boundary], has_next_page: true, next_cursor: boundaryCursor },
    { data: [first], has_next_page: true, next_cursor: firstCursor },
    { data: [boundary, oldest], has_next_page: false }
  ];
  const result = await fetchPublicPages(async (endpoint, options) => {
    requests.push(options.params);
    return pages.shift();
  }, "/operations", { asset_id: "test-asset" }, Infinity);
  assert.deepEqual(result.map(o => o.operation_id), ["first", "boundary", "oldest"]);
  assert.equal(requests.length, 4);
  assert.equal(requests[2].cursor, boundaryCursor);
  assert.equal(requests[3].cursor, "");
  assert.equal(requests[3].to, "2025-11-27T22:00:12.001Z");
  assert.equal(requests[3].asset_id, "test-asset");
  assert.equal(calculatePaidTax(result, { eurCurrencyId: "eur" }).salesPaid, 17);
});

test("normal pagination preserves opaque cursors and stops at the item limit", async () => {
  let calls = 0;
  const result = await fetchPublicPages(async (endpoint, { params }) => {
    calls++;
    assert.equal(params.page_size, 2);
    return { data: [{ id: "a" }, { id: "b" }], has_next_page: true, next_cursor: "opaque-next" };
  }, "/assets", {}, 2);
  assert.equal(result.length, 2);
  assert.equal(calls, 1);
});

test("an opaque repeated cursor still fails instead of returning partial totals", async () => {
  await assert.rejects(fetchPublicPages(async () => ({ data: [first], has_next_page: true, next_cursor: "opaque" }), "/operations", {}, Infinity), /wiederholten/);
});

test("date recovery is limited to operations and cannot expand a caller's date range", async () => {
  const request = async () => ({ data: [first], has_next_page: true, next_cursor: firstCursor });
  await assert.rejects(fetchPublicPages(request, "/assets", {}, Infinity), /wiederholten/);
  await assert.rejects(fetchPublicPages(request, "/operations", { to: "2025-01-01T00:00:00Z" }, Infinity), /wiederholten/);
});

test("malformed or incomplete pages fail without reporting a complete history", async () => {
  await assert.rejects(fetchPublicPages(async () => ({}), "/operations", {}, Infinity), /gültige Buchungsseite/);
  await assert.rejects(fetchPublicPages(async () => ({ data: [first], has_next_page: true }), "/operations", {}, Infinity), /keinen nächsten/);
  await assert.rejects(fetchPublicPages(async () => ({ data: [{}], has_next_page: false }), "/operations", {}, Infinity), /ohne Kennung/);
});

test("a broken date-filter recovery is bounded and cannot loop or silently drop history", async () => {
  let calls = 0;
  await assert.rejects(fetchPublicPages(async () => {
    calls++;
    return { data: [first], has_next_page: true, next_cursor: firstCursor };
  }, "/operations", {}, Infinity), /keine weiteren|wiederholten/);
  assert.equal(calls, 3);
});

test("HTTP failures remain failures and are not converted to an empty tax history", async () => {
  await assert.rejects(fetchPublicPages(async () => { throw new Error("HTTP 403"); }, "/operations", {}, Infinity), /HTTP 403/);
});

test('a prechecked newest page is retained without downloading it twice',async()=>{
 const calls=[];
 const rows=await fetchPublicPages(async(endpoint,options)=>{calls.push(options.params.cursor);return{data:[oldest],has_next_page:false};},'/operations',{},Infinity,{firstPage:{data:[first],has_next_page:true,next_cursor:firstCursor}});
 assert.deepEqual(calls,[firstCursor]);assert.deepEqual(rows.map(row=>row.operation_id),[first.operation_id,oldest.operation_id]);
});
