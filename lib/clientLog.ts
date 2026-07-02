type ClientLogLevel = "info" | "warn" | "error";

export function clientLog(level: ClientLogLevel, event: string, details: Record<string, unknown>) {
  const payload = JSON.stringify({ event, ...details });
  console[level](payload);
}
