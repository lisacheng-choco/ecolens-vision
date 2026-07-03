import assert from "node:assert/strict";
import test from "node:test";
import { parseClassifyRequest } from "./classification.ts";

const request = {
  image: { mimeType: "image/jpeg", base64: "abc" },
  capture: { mode: "upload" },
  regionHint: "tw",
};

test("accepts a municipality belonging to the selected region", () => {
  assert.equal(parseClassifyRequest({ ...request, municipality: "taipei" }).municipality, "taipei");
});

test("rejects a municipality belonging to another region", () => {
  assert.throws(
    () => parseClassifyRequest({ ...request, municipality: "shinjuku" }),
    /Invalid municipality/,
  );
});
