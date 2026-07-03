import assert from "node:assert/strict";
import test from "node:test";
import { uniqueRuleItems } from "./uniqueRuleItems.ts";

test("deduplicates rules without collapsing distinct unknown items", () => {
  const items = uniqueRuleItems([
    { ruleKey: "drink_cup", name: "first" },
    { ruleKey: "drink_cup", name: "duplicate" },
    { ruleKey: "unknown", name: "battery-shaped object" },
    { ruleKey: "unknown", name: "ceramic cup" },
  ]);

  assert.deepEqual(items.map(({ name }) => name), [
    "first",
    "battery-shaped object",
    "ceramic cup",
  ]);
});
