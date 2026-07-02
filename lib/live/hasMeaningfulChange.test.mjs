import assert from "node:assert/strict";
import test from "node:test";
import { hasMeaningfulChange } from "./hasMeaningfulChange.ts";

test("detects only meaningful frame changes", () => {
  const dark = new Uint8ClampedArray([0, 0, 0, 255]);
  const light = new Uint8ClampedArray([30, 30, 30, 255]);

  assert.equal(hasMeaningfulChange(null, dark), true);
  assert.equal(hasMeaningfulChange(dark, dark), false);
  assert.equal(hasMeaningfulChange(dark, light), true);
});
