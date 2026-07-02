import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const regions = ["tw", "jp"];
const newRuleKeys = [
  "plastic_bottle",
  "metal_can",
  "glass_bottle",
  "paper_carton",
  "cardboard",
  "plastic_container",
  "battery",
  "small_electronics",
];
const destinations = new Set([
  "recycle",
  "general",
  "food",
  "drain",
  "burnable",
  "special_collection",
  "local_rule",
]);
const research = readFileSync("docs/waste-rules-research.md", "utf8");
const taiwanCategories = {
  plastic_bottle: "廢塑膠容器",
  metal_can: "廢金屬容器",
  glass_bottle: "廢玻璃容器",
  paper_carton: "廢紙容器",
  cardboard: "廢紙",
};

for (const region of regions) {
  test(`${region} rules cover researched items and trace their sources`, () => {
    const rules = JSON.parse(readFileSync(`lib/rules/${region}.json`, "utf8"));
    const rulesByKey = new Map(rules.map((rule) => [rule.key, rule]));

    for (const key of newRuleKeys) {
      const rule = rulesByKey.get(key);
      assert.ok(rule, `missing ${region} rule: ${key}`);
      assert.ok(rule.sourceIds.length > 0, `missing sourceIds for ${region}:${key}`);

      for (const sourceId of rule.sourceIds) {
        assert.match(sourceId, region === "tw" ? /^TW-\d{2}$/ : /^JP-\d{2}$/);
        assert.ok(research.includes(`**${sourceId}**`), `unknown sourceId: ${sourceId}`);
      }

      for (const component of rule.components) {
        assert.ok(destinations.has(component.destination), `invalid destination: ${component.destination}`);
        if (component.fallbackDestination) {
          assert.ok(
            destinations.has(component.fallbackDestination),
            `invalid fallback destination: ${component.fallbackDestination}`,
          );
        }
      }
    }
  });
}

test("taiwan recyclable items expose a specific collection category", () => {
  const rules = JSON.parse(readFileSync("lib/rules/tw.json", "utf8"));
  const rulesByKey = new Map(rules.map((rule) => [rule.key, rule]));

  for (const [key, category] of Object.entries(taiwanCategories)) {
    assert.equal(rulesByKey.get(key).components[0].category, category);
  }
});
