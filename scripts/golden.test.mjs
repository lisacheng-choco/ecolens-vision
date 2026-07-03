import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("golden seed cases reference valid images and safety expectations", () => {
  const golden = JSON.parse(fs.readFileSync("evals/golden.json", "utf8"));

  assert.equal(golden.status, "seed");
  assert.ok(golden.cases.length > 0);
  for (const goldenCase of golden.cases) {
    assert.ok(fs.existsSync(goldenCase.image), `missing image: ${goldenCase.image}`);
    assert.ok(["dev", "test"].includes(goldenCase.split));
    assert.ok(goldenCase.expectedItems.length > 0);
    for (const item of goldenCase.expectedItems) {
      assert.ok(Array.isArray(item.requiredDestinations));
      assert.ok(Array.isArray(item.forbiddenDestinations));
    }
  }
});
