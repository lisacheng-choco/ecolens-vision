import { NextResponse } from "next/server";
import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rateLimit";
import { parseFeedbackRequest, type FeedbackRequest } from "@/lib/schemas/feedback";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const limit = 10;
  const rateLimit = checkRateLimit({
    scope: "feedback",
    key: clientKey(request),
    limit,
    windowMs: 60_000,
    now: startedAt,
  });
  const headers = rateLimitHeaders(rateLimit, limit, startedAt);
  if (!rateLimit.allowed) {
    console.warn(JSON.stringify({ event: "feedback.rate_limited" }));
    return NextResponse.json({ error: "Too many feedback requests" }, { status: 429, headers });
  }

  let feedback: FeedbackRequest;

  try {
    feedback = parseFeedbackRequest(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit feedback" },
      { status: 400, headers },
    );
  }

  try {
    const stored = await storeFeedback(feedback);
    console.info(JSON.stringify({
      event: "feedback.completed",
      classificationRequestId: feedback.classificationRequestId,
      stored: Boolean(stored),
      duplicate: stored?.duplicate ?? false,
      region: feedback.region,
      ruleKey: feedback.ruleKey,
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json({
      feedbackId: stored?.id ?? `fb_${Date.now().toString(36)}`,
      stored: Boolean(stored),
      duplicate: stored?.duplicate ?? false,
      message: stored?.duplicate
        ? "相同回饋已存在，不重複保存。"
        : stored
          ? "回饋已保存。"
          : "已收到回饋；尚未設定 Supabase，因此未持久化。",
    }, { headers });
  } catch (error) {
    console.warn(JSON.stringify({
      event: "feedback.failed",
      classificationRequestId: feedback.classificationRequestId,
      reason: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      durationMs: Date.now() - startedAt,
    }));
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to store feedback" },
      { status: 502, headers },
    );
  }
}

async function storeFeedback(
  feedback: FeedbackRequest,
): Promise<{ id: string; duplicate: boolean } | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/feedback`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      classification_request_id: feedback.classificationRequestId,
      reason: feedback.reason,
      user_correct_label: feedback.userCorrectLabel || null,
      user_note: feedback.userNote || null,
      region: feedback.region,
      rule_key: feedback.ruleKey,
      detected_item_name: feedback.detectedItemName,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    if (error?.code === "PGRST205") {
      throw new Error("Supabase 找不到 public.feedback，請先執行 supabase/schema.sql");
    }
    if (error?.code === "PGRST204") {
      throw new Error("Supabase feedback schema 過期，請重新執行 supabase/schema.sql");
    }
    if (error?.code === "23505") {
      return {
        id: `duplicate_${feedback.classificationRequestId}`,
        duplicate: true,
      };
    }
    throw new Error(`Supabase feedback insert failed (${response.status})`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || typeof rows[0]?.id !== "string") {
    throw new Error("Supabase returned an invalid feedback record");
  }
  return { id: rows[0].id, duplicate: false };
}
