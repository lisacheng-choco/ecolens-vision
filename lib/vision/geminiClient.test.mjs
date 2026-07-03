import assert from "node:assert/strict";
import test from "node:test";
import { generateGeminiJson } from "./geminiClient.ts";

test("parses Gemini JSON and preserves rate-limit errors", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => Response.json({
      candidates: [{ content: { parts: [{ text: "prefix {\"ok\":true} suffix" }] } }],
    });
    assert.deepEqual(await generateGeminiJson("key", "model", [], {}, 10), { ok: true });

    globalThis.fetch = async () => Response.json(
      { error: { message: "quota exhausted" } },
      { status: 429 },
    );
    await assert.rejects(
      generateGeminiJson("key", "model", [], {}, 10),
      /GEMINI_RATE_LIMITED: quota exhausted/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
