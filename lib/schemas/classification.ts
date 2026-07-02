import type { DestinationType } from "@/lib/rules/destinations";

export type RegionHint = "tw" | "jp";
export type Locale = "zh-TW" | "ja-JP" | "en";
export type CaptureMode = "upload" | "live";
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

  return {
    image: {
      mimeType: image.mimeType as ClassifyRequest["image"]["mimeType"],
      base64: image.base64,
      fileName: typeof image.fileName === "string" ? image.fileName : undefined,
    },
    capture: { mode: capture.mode },
    regionHint: body.regionHint,
    locale: body.locale === "ja-JP" || body.locale === "en" ? body.locale : "zh-TW",
  };
}
