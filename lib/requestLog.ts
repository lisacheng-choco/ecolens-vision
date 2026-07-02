export function makeRequestId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function requestLogBase(request: Request, requestId: string) {
  const url = new URL(request.url);
  return {
    requestId,
    method: request.method,
    path: url.pathname,
    clientIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "anonymous",
  };
}
