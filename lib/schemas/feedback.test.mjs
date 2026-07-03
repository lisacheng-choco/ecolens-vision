import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedbackRequest } from "./feedback.ts";

test("accepts feedback for every classification rule", () => {
  const feedback = parseFeedbackRequest({
    classificationRequestId: "cls_test",
    reason: "wrong_category",
    region: "TW",
    ruleKey: "plastic_bottle",
    detectedItemName: "塑膠瓶",
    municipality: "臺北市",
    strategy: "knowledge",
    evidenceChunkIds: ["tw-taipei-1"],
  });

  assert.equal(feedback.ruleKey, "plastic_bottle");
  assert.equal(feedback.strategy, "knowledge");
  assert.deepEqual(feedback.evidenceChunkIds, ["tw-taipei-1"]);
});
