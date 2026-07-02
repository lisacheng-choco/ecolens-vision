import fs from "node:fs";
import { pathToFileURL } from "node:url";

const topLevelFields = new Set(["itemName", "overall", "summary"]);
const componentFields = new Set([
  "name",
  "category",
  "destination",
  "fallbackDestination",
  "fallbackCondition",
  "action",
  "warning",
]);
const locales = new Set(["zh-TW", "ja-JP", "en"]);
const destinations = new Set(["recycle", "general", "food", "drain", "burnable", "local_rule"]);

export function applyOverride(rules, ruleKey, target, locale, value) {
  const rule = rules.find((item) => item.key === ruleKey);
  if (!rule) throw new Error(`Unknown rule key: ${ruleKey}`);

  if (topLevelFields.has(target)) {
    setValue(rule, target, locale, value);
    return rules;
  }

  const [componentId, field, extra] = target.split(".");
  if (extra || !componentFields.has(field)) throw new Error(`Invalid target: ${target}`);
  const component = rule.components.find((item) => item.id === componentId);
  if (!component) throw new Error(`Unknown component: ${componentId}`);
  if ((field === "destination" || field === "fallbackDestination") && !destinations.has(value)) {
    throw new Error(`Invalid destination: ${value}`);
  }
  setValue(component, field, locale, value);
  return rules;
}

function setValue(owner, field, locale, value) {
  const current = owner[field];
  if (current && typeof current === "object") {
    if (!locales.has(locale)) throw new Error("A valid locale is required for localized text");
    owner[field] = { ...current, [locale]: value };
  } else if (current === undefined && locales.has(locale)) {
    owner[field] = { [locale]: value };
  } else {
    owner[field] = value;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [region, ruleKey, target, locale, ...valueParts] = process.argv.slice(2);
  if (region !== "tw" && region !== "jp") throw new Error("Region must be tw or jp");
  if (!ruleKey || !target || !locale || valueParts.length === 0) {
    throw new Error("Use: <tw|jp> <rule-key> <field|component.field> <-|locale> <value>");
  }

  const rulesUrl = new URL(`../lib/rules/${region}.json`, import.meta.url);
  const rules = JSON.parse(fs.readFileSync(rulesUrl, "utf8"));
  applyOverride(rules, ruleKey, target, locale, valueParts.join(" "));
  fs.writeFileSync(rulesUrl, `${JSON.stringify(rules, null, 2)}\n`);
  console.log(`Updated ${region}/${ruleKey}/${target}`);
}
