import assert from "node:assert/strict";
import test from "node:test";
import { applyOverride } from "./rule-override.mjs";

test("updates only the requested localized rule field", () => {
  const rules = [{
    key: "drink_cup",
    summary: { "zh-TW": "舊內容", "ja-JP": "古い内容" },
    components: [{ id: "cup", category: "舊分類" }],
  }];

  applyOverride(rules, "drink_cup", "summary", "zh-TW", "新內容");

  assert.deepEqual(rules[0].summary, { "zh-TW": "新內容", "ja-JP": "古い内容" });
  assert.equal(rules[0].components[0].category, "舊分類");
});

test("rejects invalid structured destinations", () => {
  const rules = [{ key: "drink_cup", components: [{ id: "cup" }] }];

  assert.throws(
    () => applyOverride(rules, "drink_cup", "cup.destination", "-", "somewhere"),
    /Invalid destination/,
  );
});
