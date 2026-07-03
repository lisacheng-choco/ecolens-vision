import type { DestinationType } from "@/lib/rules/destinations";

export type RegionHint = "tw" | "jp";
export type Locale = "zh-TW" | "ja-JP" | "en";
export type CaptureMode = "upload" | "live";
export const municipalities = {
  tw: [
    ["taipei", "臺北市", "台北市"],
    ["new_taipei", "新北市", "新北市"],
    ["taoyuan", "桃園市", "桃園市"],
    ["taichung", "臺中市", "台中市"],
    ["tainan", "臺南市", "台南市"],
    ["kaohsiung", "高雄市", "高雄市"],
    ["keelung", "基隆市", "基隆市"],
    ["yilan", "宜蘭縣", "宜蘭縣"],
    ["hualien", "花蓮縣", "花蓮縣"],
    ["pingtung", "屏東縣", "屏東縣"],
  ],
  jp: [
    ["shinjuku", "新宿區", "新宿区"],
    ["osaka", "大阪市", "大阪市"],
    ["kyoto", "京都市", "京都市"],
    ["sapporo", "札幌市", "札幌市"],
    ["fukuoka", "福岡市", "福岡市"],
    ["yokohama", "橫濱市", "横浜市"],
  ],
} as const;
export type MunicipalityId = (typeof municipalities)[RegionHint][number][0];
export const supportedRuleKeys = [
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
  "unknown",
] as const;
export type RuleKey = (typeof supportedRuleKeys)[number];

export type ClassifyRequest = {
  image: {
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    base64: string;
    fileName?: string;
  };
  capture: {
    mode: CaptureMode;
  };
  regionHint: RegionHint;
  municipality?: MunicipalityId;
  locale?: Locale;
};

export type ClassificationComponent = {
  id: string;
  name: string;
  material: string;
  category: string;
  destination: {
    type: DestinationType;
    label: string;
    fallback?: {
      type: DestinationType;
      label: string;
      condition: string;
    };
  };
  action: string;
  warning?: string;
  confidence: number;
};

export type ClassificationItemResult = {
  ruleKey: RuleKey;
  strategy: "rule" | "knowledge" | "unresolved";
  evidence: Array<{
    chunkId: string;
    title: string;
    url: string;
  }>;
  item: {
    name: string;
    confidence: number;
  };
  overall: {
    label: string;
    severity: "info" | "warning";
    summary: string;
  };
  components: ClassificationComponent[];
};

export type ClassificationResult = {
  requestId: string;
  region: {
    country: "TW" | "JP";
    municipality?: string;
    confidence: number;
  };
  locale: Locale;
  items: ClassificationItemResult[];
  model: {
    provider: "gemini";
    version: string;
    calls: number;
  };
};

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBase64Length = 4_500_000;

export function parseClassifyRequest(input: unknown): ClassifyRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body");
  }

  const body = input as Record<string, unknown>;
  const image = body.image as Record<string, unknown> | undefined;
  const capture = body.capture as Record<string, unknown> | undefined;

  if (!image || !capture) throw new Error("Missing image or capture");
  if (!allowedMimeTypes.has(String(image.mimeType))) throw new Error("Unsupported image type");
  if (typeof image.base64 !== "string" || image.base64.length === 0) throw new Error("Missing image data");
  if (image.base64.length > maxBase64Length) throw new Error("Image is too large");
  if (capture.mode !== "upload" && capture.mode !== "live") throw new Error("Invalid capture mode");
  if (body.regionHint !== "tw" && body.regionHint !== "jp") throw new Error("Invalid region");
  const region = body.regionHint;
  const municipality = typeof body.municipality === "string" ? body.municipality : undefined;
  if (municipality && !municipalities[region].some(([id]) => id === municipality)) {
    throw new Error("Invalid municipality");
  }

  return {
    image: {
      mimeType: image.mimeType as ClassifyRequest["image"]["mimeType"],
      base64: image.base64,
      fileName: typeof image.fileName === "string" ? image.fileName : undefined,
    },
    capture: { mode: capture.mode },
    regionHint: region,
    municipality: municipality as MunicipalityId | undefined,
    locale: body.locale === "ja-JP" || body.locale === "en" ? body.locale : "zh-TW",
  };
}

export function municipalityLabel(
  region: RegionHint,
  municipality: MunicipalityId | undefined,
  locale: Locale,
) {
  const match = municipalities[region].find(([id]) => id === municipality);
  if (!match) return undefined;
  return locale === "ja-JP" ? match[2] : match[1];
}
