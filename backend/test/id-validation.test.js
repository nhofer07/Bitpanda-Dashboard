import test from "node:test";
import assert from "node:assert/strict";
import { cleanUuid } from "../id-validation.js";

test("accepts current and newer UUID versions returned by Bitpanda", () => {
  assert.equal(cleanUuid("550e8400-e29b-41d4-a716-446655440000", "Asset"), "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(cleanUuid("01941f29-7c00-7c12-8e4f-123456789abc", "Asset"), "01941f29-7c00-7c12-8e4f-123456789abc");
});

test("still rejects malformed and non-RFC-variant identifiers", () => {
  assert.throws(() => cleanUuid("not-an-id", "Asset"), /Asset ist ungültig/);
  assert.throws(() => cleanUuid("01941f29-7c00-7c12-1e4f-123456789abc", "Asset"), /Asset ist ungültig/);
});
