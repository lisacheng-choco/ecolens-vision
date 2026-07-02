import jpRules from "@/lib/rules/jp.json";
import twRules from "@/lib/rules/tw.json";
import { destinationLabel, type DestinationType } from "@/lib/rules/destinations";
import type {
  ClassifyRequest,
  ClassificationItemResult,
  ClassificationResult,
  Locale,
  RegionHint,
  RuleKey,
} from "@/lib/schemas/classification";

type LocalizedText = string | Partial<Record<Locale, string>>;
type Rule = {
  key: string;
  sourceIds?: string[];
  itemName: LocalizedText;
  overall: LocalizedText;
  summary: LocalizedText;
  components: Array<{
    id: string;
    name: LocalizedText;
    material: string;
    category: LocalizedText;
    destination: DestinationType;
    fallbackDestination?: DestinationType;
    fallbackCondition?: LocalizedText;
    action: LocalizedText;
    warning?: LocalizedText;
  }>;
};

const rulesByRegion: Record<RegionHint, Rule[]> = {
  tw: twRules as Rule[],
  jp: jpRules as Rule[],
};

export function buildClassificationResult(
  request: ClassifyRequest,
  detectedItems: Array<{
    ruleKey: RuleKey;
    itemName?: string;
    confidence: number;
  }>,
  model: ClassificationResult["model"],
): ClassificationResult {
  const locale = request.locale ?? "zh-TW";
  const seen = new Set<RuleKey>();
  const uniqueItems = detectedItems.filter(({ ruleKey }) => (
    ruleKey === "unknown" || (!seen.has(ruleKey) && Boolean(seen.add(ruleKey)))
  ));

  return {
    requestId: `cls_${Date.now().toString(36)}`,
    region: {
      country: request.regionHint === "jp" ? "JP" : "TW",
      municipality: request.regionHint === "jp" ? "Demo municipality" : "示範地區",
      confidence: 1,
    },
    locale,
    items: uniqueItems.map((detected) => buildItemResult(request, detected)),
    model,
  };
}

function buildItemResult(
  request: ClassifyRequest,
  detected: Parameters<typeof buildClassificationResult>[1][number],
): ClassificationItemResult {
  const locale = request.locale ?? "zh-TW";
  const rule = rulesByRegion[request.regionHint].find((item) => item.key === detected.ruleKey);

  if (rule) {
    return {
      ruleKey: detected.ruleKey,
      item: {
        name: detected.itemName ?? text(rule.itemName, locale),
        confidence: detected.confidence,
      },
      overall: {
        label: text(rule.overall, locale),
        severity: "warning",
        summary: text(rule.summary, locale),
      },
      components: rule.components.map((component, index) => ({
        id: component.id,
        name: text(component.name, locale),
        material: component.material,
        category: text(component.category, locale),
        destination: {
          type: component.destination,
          label: destinationLabel(component.destination, locale),
          fallback: component.fallbackDestination && component.fallbackCondition ? {
            type: component.fallbackDestination,
            label: destinationLabel(component.fallbackDestination, locale),
            condition: text(component.fallbackCondition, locale),
          } : undefined,
        },
        action: text(component.action, locale),
        warning: component.warning ? text(component.warning, locale) : undefined,
        confidence: 0.86 - index * 0.03,
      })),
    };
  }

  const isJapanese = locale === "ja-JP";
  const isJapan = request.regionHint === "jp";

  return {
    ruleKey: "unknown",
    item: {
      name: detected.itemName ?? (isJapanese ? "識別できない品目" : "無法確認的物品"),
      confidence: detected.confidence,
    },
    overall: {
      label: isJapanese ? "地域のルールを確認" : "請查詢當地規則",
      severity: "warning",
      summary: isJapanese
        ? "画像だけでは安全に分類できません。所在地の自治体ルールを確認してください。"
        : `目前規則庫無法安全判定，請查詢${isJapan ? "所在地自治體" : "當地清運單位"}規則。`,
    },
    components: [],
  };
}

function text(value: LocalizedText, locale: Locale) {
  if (typeof value === "string") return value;
  return value[locale] ?? value["zh-TW"] ?? value["ja-JP"] ?? value.en ?? "";
}
