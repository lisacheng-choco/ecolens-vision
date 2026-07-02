import { NextResponse } from "next/server";
import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rateLimit";
import { parseClassifyRequest } from "@/lib/schemas/classification";
import { classifyWithGemini } from "@/lib/vision/geminiProvider";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let locale: "zh-TW" | "ja-JP" | "en" = "zh-TW";
  const limit = 20;
  const rateLimit = checkRateLimit({
    scope: "classify",
    key: clientKey(request),
    limit,
    windowMs: 60_000,
    now: startedAt,
  });
  const headers = rateLimitHeaders(rateLimit, limit, startedAt);

  if (!rateLimit.allowed) {
    console.warn(JSON.stringify({ event: "classification.rate_limited" }));
    return NextResponse.json({ error: "Too many classification requests" }, { status: 429, headers });
  }

  try {
    const body = await request.json();
    const classifyRequest = parseClassifyRequest(body);
    locale = classifyRequest.locale ?? "zh-TW";
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(JSON.stringify({
        event: "classification.failed",
        reason: "gemini_not_configured",
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json(
        { error: classifyErrorMessage(locale, "GEMINI_NOT_CONFIGURED") },
        { status: 503, headers },
      );
    }

    const result = await classifyWithGemini(classifyRequest, apiKey);
    console.info(JSON.stringify({
      event: "classification.completed",
      requestId: result.requestId,
      provider: result.model.provider,
      region: result.region.country,
      mode: classifyRequest.capture.mode,
      itemCount: result.items.length,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to classify image";
    if (message === "GEMINI_QUOTA_EXCEEDED") {
      console.warn(JSON.stringify({
        event: "classification.failed",
        reason: "gemini_quota_exceeded",
        durationMs: Date.now() - startedAt,
      }));
      return NextResponse.json(
        { error: classifyErrorMessage(locale, message) },
        { status: 429, headers },
      );
    }
    console.warn(JSON.stringify({
      event: "classification.failed",
      reason: message.slice(0, 120),
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json(
      { error: classifyErrorMessage(locale, message) },
      { status: 502, headers },
    );
  }
}

function classifyErrorMessage(locale: string | undefined, code: string) {
  const isJapanese = locale === "ja-JP";
  if (code === "GEMINI_NOT_CONFIGURED") {
    return isJapanese
      ? "AIサービスが未設定のため、現在は判定できません。"
      : "AI 服務尚未設定，暫時無法辨識。";
  }
  if (code === "GEMINI_QUOTA_EXCEEDED") {
    return isJapanese
      ? "AIの利用上限に達しました。しばらくしてからもう一度お試しください。"
      : "AI 配額已用完，請稍後再試。";
  }
  return isJapanese
    ? "AI 判定に失敗しました。しばらくしてからもう一度お試しください。"
    : "AI 辨識失敗，請稍後再試。";
}
