import { supportedRuleKeys, type RuleKey } from "./classification.ts";

export type FeedbackReason =
  | "wrong_category"
  | "wrong_region_rule"
  | "missing_breakdown"
  | "unclear_instruction";

export type FeedbackRequest = {
  classificationRequestId: string;
  reason: FeedbackReason;
  userCorrectLabel?: string;
  userNote?: string;
  region: "TW" | "JP";
  ruleKey: RuleKey;
  detectedItemName: string;
};

const reasons = new Set([
  "wrong_category",
  "wrong_region_rule",
  "missing_breakdown",
  "unclear_instruction",
]);
const ruleKeys = new Set<string>(supportedRuleKeys);

export function parseFeedbackRequest(input: unknown): FeedbackRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body");
  }

  const body = input as Record<string, unknown>;
  if (typeof body.classificationRequestId !== "string" || body.classificationRequestId.length === 0) {
    throw new Error("Missing classification id");
  }
  if (!reasons.has(String(body.reason))) throw new Error("Invalid reason");
  if (body.region !== "TW" && body.region !== "JP") throw new Error("Invalid region");
  if (!ruleKeys.has(String(body.ruleKey))) throw new Error("Invalid rule key");
  if (typeof body.detectedItemName !== "string" || body.detectedItemName.length === 0) {
    throw new Error("Missing detected item");
  }

  return {
    classificationRequestId: body.classificationRequestId,
    reason: body.reason as FeedbackReason,
    userCorrectLabel: typeof body.userCorrectLabel === "string" ? body.userCorrectLabel.slice(0, 80) : undefined,
    userNote: typeof body.userNote === "string" ? body.userNote.slice(0, 500) : undefined,
    region: body.region,
    ruleKey: body.ruleKey as RuleKey,
    detectedItemName: body.detectedItemName.slice(0, 80),
  };
}
