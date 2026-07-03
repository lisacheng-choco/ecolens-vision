export async function generateGeminiJson(
  apiKey: string,
  model: string,
  parts: unknown[],
  responseJsonSchema: unknown,
  maxOutputTokens: number,
) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema,
            temperature: 0,
            thinkingConfig: { thinkingLevel: "MINIMAL" },
            maxOutputTokens,
          },
        }),
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message = body?.error?.message ?? body?.message ?? `Gemini request failed (${response.status})`;
      if (response.status === 429 || /quota|rate limit|resource exhausted/i.test(message)) {
        throw new Error(`GEMINI_RATE_LIMITED: ${message}`);
      }
      throw new Error(`GEMINI_ERROR: ${message}`);
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: unknown) => (part as { text?: unknown })?.text)
      .filter((part: unknown): part is string => typeof part === "string")
      .join("");
    const jsonStart = text?.indexOf("{") ?? -1;
    const jsonEnd = text?.lastIndexOf("}") ?? -1;
    if (jsonStart < 0 || jsonEnd <= jsonStart) throw new Error("Gemini returned invalid JSON");
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as unknown;
  } catch (error) {
    if (error instanceof Error && /aborted|timeout/i.test(error.message)) {
      throw new Error("GEMINI_TIMEOUT");
    }
    throw error;
  }
}
