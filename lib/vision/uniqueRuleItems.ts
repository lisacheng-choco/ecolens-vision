import type { RuleKey } from "../schemas/classification.ts";

export function uniqueRuleItems<T extends { ruleKey: RuleKey }>(items: T[]) {
  const seen = new Set<RuleKey>();
  return items.filter(({ ruleKey }) => (
    ruleKey === "unknown" || (!seen.has(ruleKey) && Boolean(seen.add(ruleKey)))
  ));
}
