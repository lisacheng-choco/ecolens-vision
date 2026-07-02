import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit } from "./rateLimit.ts";

test("limits a key until its window resets", () => {
  const options = { scope: "test", key: "client", limit: 2, windowMs: 1_000 };

  assert.equal(checkRateLimit({ ...options, now: 0 }).allowed, true);
  assert.equal(checkRateLimit({ ...options, now: 1 }).remaining, 0);
  assert.equal(checkRateLimit({ ...options, now: 2 }).allowed, false);
  assert.equal(checkRateLimit({ ...options, now: 1_000 }).allowed, true);
});
