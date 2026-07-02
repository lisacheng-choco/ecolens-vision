import assert from "node:assert/strict";
import test from "node:test";
import { destinationLabel } from "./destinations.ts";

test("localizes structured disposal destinations", () => {
  assert.equal(destinationLabel("recycle", "zh-TW"), "資源回收");
  assert.equal(destinationLabel("burnable", "ja-JP"), "可燃ごみ");
  assert.equal(destinationLabel("special_collection", "zh-TW"), "指定回收");
});
