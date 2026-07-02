import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rateLimit";
import { makeRequestId, requestLogBase } from "@/lib/requestLog";

const messages = [
  "回饋已接收",
  "分類規則將納入後續審核",
  "謝謝你的協助",
];

export async function GET(request: Request) {
  const now = Date.now();
  const streamRequestId = makeRequestId("fdbsse");
  const baseLog = requestLogBase(request, streamRequestId);
  const limit = 30;
  const rateLimit = checkRateLimit({
    scope: "feedback-stream",
    key: clientKey(request),
    limit,
    windowMs: 60_000,
    now,
  });
  const headers = {
    ...rateLimitHeaders(rateLimit, limit, now),
    "X-Request-Id": streamRequestId,
  };
  console.info(JSON.stringify({
    event: "feedback.stream.started",
    ...baseLog,
  }));
  if (!rateLimit.allowed) {
    console.warn(JSON.stringify({
      event: "feedback.stream.rate_limited",
      ...baseLog,
      limit,
      windowMs: 60_000,
    }));
    return Response.json({ error: "Too many stream requests" }, { status: 429, headers });
  }

  const classificationRequestId = new URL(request.url).searchParams.get("requestId");
  if (!classificationRequestId || classificationRequestId.length > 100) {
    console.warn(JSON.stringify({
      event: "feedback.stream.rejected",
      ...baseLog,
      reason: "missing_or_invalid_request_id",
    }));
    return Response.json({ error: "Missing classification id" }, { status: 400, headers });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      let index = 0;
      const send = () => {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        if (index >= messages.length) {
          controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
          console.info(JSON.stringify({
            event: "feedback.stream.completed",
            ...baseLog,
            classificationRequestId,
            messageCount: messages.length,
            durationMs: Date.now() - now,
          }));
          controller.close();
          return;
        }

        controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify({ message: messages[index] })}\n\n`));
        index += 1;
        timer = setTimeout(send, 250);
      };
      send();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      console.info(JSON.stringify({
        event: "feedback.stream.cancelled",
        ...baseLog,
        classificationRequestId,
        durationMs: Date.now() - now,
      }));
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...headers,
    },
  });
}
