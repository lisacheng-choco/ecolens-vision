import { checkRateLimit, clientKey, rateLimitHeaders } from "@/lib/rateLimit";

const messages = [
  "回饋已接收",
  "分類規則將納入後續審核",
  "謝謝你的協助",
];

export async function GET(request: Request) {
  const now = Date.now();
  const limit = 30;
  const rateLimit = checkRateLimit({
    scope: "feedback-stream",
    key: clientKey(request),
    limit,
    windowMs: 60_000,
    now,
  });
  const headers = rateLimitHeaders(rateLimit, limit, now);
  if (!rateLimit.allowed) {
    return Response.json({ error: "Too many stream requests" }, { status: 429, headers });
  }

  const requestId = new URL(request.url).searchParams.get("requestId");
  if (!requestId || requestId.length > 100) {
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
