import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = JSON.parse(readFileSync("lib/rules/osaka.json", "utf8"));
const rulesByKey = new Map(rules.map((rule) => [rule.key, rule]));
const expectedKeys = [
  "cup_noodle",
  "drink_cup",
  "bento_box",
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

test("Osaka rules keep the supported keys and official evidence", () => {
  assert.deepEqual(rules.map((rule) => rule.key), expectedKeys);

  for (const rule of rules) {
    assert.equal(rule.municipality, "osaka");
    assert.match(rule.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Date.parse(rule.reviewedAt) <= Date.now());
    assert.ok(rule.sources.length > 0);
    assert.ok(rule.examples.length > 0);

    for (const source of rule.sources) {
      assert.ok(source.title.startsWith("大阪市："));
      assert.equal(new URL(source.url).hostname, "www.city.osaka.lg.jp");
    }

    for (const component of rule.components) {
      assert.ok(destinations.has(component.destination));
      if (component.fallbackDestination) assert.ok(destinations.has(component.fallbackDestination));
    }
  }
});

test("Osaka examples provide a compact POC recognition vocabulary", () => {
  const examples = rules.flatMap((rule) => rule.examples);
  assert.ok(examples.length >= 30 && examples.length <= 50, `expected 30-50 examples, got ${examples.length}`);
  assert.equal(new Set(examples).size, examples.length);
});

test("Osaka critical cases fail conservatively", () => {
  const cupNoodle = rulesByKey.get("cup_noodle");
  assert.ok(cupNoodle.examples.includes("保麗龍泡麵碗"));
  assert.equal(cupNoodle.components.find(({ id }) => id === "cup_film").destination, "recycle");
  assert.equal(cupNoodle.components.find(({ id }) => id === "cup_film").fallbackDestination, "general");
  assert.equal(cupNoodle.components.find(({ id }) => id === "paper_lid").destination, "general");

  const plastic = rulesByKey.get("plastic_container").components[0];
  assert.equal(plastic.destination, "recycle");
  assert.equal(plastic.fallbackDestination, "general");
  assert.match(plastic.warning["zh-TW"], /電池.*噴霧罐.*瓦斯罐/);

  const [dryBattery, rechargeableBattery] = rulesByKey.get("battery").components;
  assert.equal(dryBattery.destination, "special_collection");
  assert.equal(dryBattery.fallbackDestination, "general");
  assert.equal(rechargeableBattery.destination, "special_collection");
  assert.equal(rechargeableBattery.fallbackDestination, undefined);
  assert.match(rechargeableBattery.warning["zh-TW"], /不可混入普通垃圾/);
  assert.match(rechargeableBattery.warning["zh-TW"], /膨脹|變形/);

  const canWarning = rulesByKey.get("metal_can").components[0].warning["zh-TW"];
  assert.match(canWarning, /噴霧罐.*瓦斯罐/);
  assert.match(canWarning, /不可打孔/);
  assert.match(canWarning, /分袋/);
  assert.match(canWarning, /LP 瓦斯鋼瓶.*不適用/);
});
