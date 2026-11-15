import { z } from "zod";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export type GenerateErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_screen";

export class GenerateError extends Error {
  constructor(readonly code: GenerateErrorCode) {
    super(`Screen generation failed: ${code}`);
    this.name = "GenerateError";
  }
}

const ScreenReply = z.object({
  screenKey: z.string().regex(/^[a-z][a-z0-9_-]{0,40}$/),
  html: z.string().min(1).max(200_000).regex(/</),
});

export async function generateScreen(input: {
  prompt: { system: string; user: string };
  imageDataUrl?: string;
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): Promise<{ screenId: string; html: string }> {
  const doFetch = input.fetch ?? globalThis.fetch;
  const userContent = input.imageDataUrl
    ? [{ type: "text", text: input.prompt.user }, { type: "image_url", image_url: { url: input.imageDataUrl } }]
    : input.prompt.user;
  let response: Response;
  try {
    response = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: input.prompt.system }, { role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new GenerateError(timedOut ? "timeout" : "network");
  }
  if (!response.ok) throw new GenerateError("http");
  let raw: unknown;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    raw = JSON.parse(typeof content === "string" ? content : "");
  } catch {
    throw new GenerateError("bad_json");
  }
  const parsed = ScreenReply.safeParse(raw);
  if (!parsed.success) throw new GenerateError("invalid_screen");
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return { screenId: `${parsed.data.screenKey}-${suffix}`, html: parsed.data.html };
}
