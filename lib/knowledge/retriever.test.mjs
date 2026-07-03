import assert from "node:assert/strict";
import test from "node:test";
import { resolveEvidence, retrieveKnowledge } from "./retriever.ts";

test("retrieves country and selected municipality knowledge with official evidence", () => {
  const chunks = retrieveKnowledge({ regionHint: "tw", municipality: "yilan" });

  assert.ok(chunks.some((chunk) => chunk.title === "宜蘭縣"));
  assert.ok(chunks.every((chunk) => chunk.id.startsWith("tw-yilan-")));
  assert.ok(chunks.every((chunk) => chunk.url.startsWith("https://")));
  assert.ok(chunks.every((chunk) => !chunk.text.includes("cite")));
});

test("rejects missing and forged evidence IDs", () => {
  const chunks = retrieveKnowledge({ regionHint: "jp", municipality: "fukuoka" });

  assert.equal(resolveEvidence([], chunks), null);
  assert.equal(resolveEvidence(["jp-fukuoka-forged"], chunks), null);
  assert.deepEqual(resolveEvidence([chunks[0].id], chunks), [chunks[0]]);
});

test("does not include a city-specific Taiwan section without a municipality", () => {
  const chunks = retrieveKnowledge({ regionHint: "tw" });

  assert.ok(!chunks.some((chunk) => chunk.title === "宜蘭縣"));
});
