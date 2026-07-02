export type DestinationType =
  | "recycle"
  | "general"
  | "food"
  | "drain"
  | "burnable"
  | "special_collection"
  | "local_rule";

const labels: Record<DestinationType, Record<string, string>> = {
  recycle: { "zh-TW": "資源回收", "ja-JP": "資源ごみ", en: "Recycling" },
  general: { "zh-TW": "一般垃圾", "ja-JP": "一般ごみ", en: "General waste" },
  food: { "zh-TW": "廚餘", "ja-JP": "生ごみ", en: "Food waste" },
  drain: { "zh-TW": "先倒除殘液", "ja-JP": "液体を捨てる", en: "Drain liquid" },
  burnable: { "zh-TW": "可燃垃圾", "ja-JP": "可燃ごみ", en: "Burnable waste" },
  special_collection: { "zh-TW": "指定回收", "ja-JP": "指定回収", en: "Designated collection" },
  local_rule: { "zh-TW": "查詢當地規則", "ja-JP": "自治体ルールを確認", en: "Check local rules" },
};

export function destinationLabel(type: DestinationType, locale: string) {
  return labels[type][locale] ?? labels[type]["zh-TW"];
}
