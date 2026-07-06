import jpRules from "@/lib/rules/jp.json";
import osakaRules from "@/lib/rules/osaka.json";
import twRules from "@/lib/rules/tw.json";
import { destinationLabel, type DestinationType } from "@/lib/rules/destinations";
import { municipalityLabel } from "@/lib/schemas/classification";
import { uniqueRuleItems } from "@/lib/vision/uniqueRuleItems";
import type {
  ClassifyRequest,
  ClassificationItemResult,
  ClassificationResult,
  Locale,
  MunicipalityId,
  RegionHint,
  RuleKey,
} from "@/lib/schemas/classification";

type LocalizedText = string | Partial<Record<Locale, string>>;
type Rule = {
  key: string;
  sourceIds?: string[];
  municipality?: MunicipalityId;
  reviewedAt?: string;
  sources?: Array<{
    title: string;
    url: string;
  }>;
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

  return {
    requestId: `cls_${Date.now().toString(36)}`,
    region: {
      country: request.regionHint === "jp" ? "JP" : "TW",
      municipality: municipalityLabel(request.regionHint, request.municipality, locale),
      confidence: 1,
    },
    locale,
    items: uniqueRuleItems(detectedItems).map((detected) => buildItemResult(request, detected)),
    model,
  };
}

function buildItemResult(
  request: ClassifyRequest,
  detected: Parameters<typeof buildClassificationResult>[1][number],
): ClassificationItemResult {
  const locale = request.locale ?? "zh-TW";
  const rules = request.regionHint === "jp" && request.municipality === "osaka"
    ? osakaRules as Rule[]
    : rulesByRegion[request.regionHint];
  const rule = rules.find((item) => item.key === detected.ruleKey);

  if (rule) {
    const scopeLabel = rule.municipality
      ? municipalityLabel(request.regionHint, rule.municipality, locale) ?? rule.municipality
      : request.regionHint === "jp"
        ? locale === "ja-JP" ? "日本の原則" : "日本國家原則"
        : locale === "ja-JP" ? "台湾の原則" : "台灣國家原則";

    return {
      ruleKey: detected.ruleKey,
      strategy: "rule",
      rule: {
        scope: rule.municipality ? "municipality" : "country",
        scopeLabel,
        reviewedAt: rule.reviewedAt,
      },
      evidence: (rule.sources ?? []).map((source, index) => ({
        chunkId: `${rule.municipality ?? request.regionHint}-${rule.key}-${index + 1}`,
        title: source.title,
        url: source.url,
      })),
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
    strategy: "unresolved",
    evidence: [],
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
