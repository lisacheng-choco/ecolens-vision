import { NextResponse } from "next/server";
import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rateLimit";
import { parseClassifyRequest } from "@/lib/schemas/classification";
import { classifyWithGemini } from "@/lib/vision/geminiProvider";
import { classifyWithMockProvider } from "@/lib/vision/mockProvider";

export async function POST(request: Request) {
  const startedAt = Date.now();
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
    let result;
    let fallbackReason: string | undefined;

    if (process.env.GEMINI_API_KEY) {
      try {
        result = await classifyWithGemini(classifyRequest, process.env.GEMINI_API_KEY);
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message.slice(0, 120) : "unknown";
        console.warn(JSON.stringify({
          event: "classification.fallback",
          reason: fallbackReason,
          durationMs: Date.now() - startedAt,
        }));
      }
    } else {
      fallbackReason = "gemini_not_configured";
    }

    result ??= classifyWithMockProvider(classifyRequest);
    console.info(JSON.stringify({
      event: "classification.completed",
      requestId: result.requestId,
      provider: result.model.provider,
      fallbackReason,
      region: result.region.country,
      mode: classifyRequest.capture.mode,
      itemCount: result.items.length,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json(result, { headers });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "classification.rejected",
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to classify image" },
      { status: 400, headers },
    );
  }
}
