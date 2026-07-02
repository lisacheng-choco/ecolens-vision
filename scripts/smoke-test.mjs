import assert from "node:assert/strict";
import fs from "node:fs";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const image = fs.readFileSync("public/test-images/cup_noodle.jpg", "base64");

const page = await fetch(baseUrl);
assert.equal(page.status, 200);
assert.equal(page.headers.get("x-frame-options"), "DENY");
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.match(await page.text(), /EcoLens/);

const classification = await fetch(`${baseUrl}/api/classify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    image: { mimeType: "image/jpeg", base64: image, fileName: "cup_noodle.jpg" },
    capture: { mode: "upload" },
    regionHint: "tw",
    locale: "zh-TW",
  }),
});
assert.equal(classification.status, 200);
const result = await classification.json();
assert.equal(result.items?.[0]?.ruleKey, "cup_noodle");
assert.ok(result.items[0].components.length > 1);

const stream = await fetch(
  `${baseUrl}/api/feedback/stream?requestId=${encodeURIComponent(result.requestId)}`,
);
assert.equal(stream.status, 200);
assert.match(await stream.text(), /event: done/);

console.log(`Smoke test passed: ${baseUrl}`);
