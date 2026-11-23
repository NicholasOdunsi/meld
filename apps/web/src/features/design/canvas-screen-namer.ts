import "server-only";

import type { ScreenSource } from "@meld/screen-runtime/source";

export const SCREEN_NAME_MODEL = "deepseek-flash";
const ENDPOINT = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 12_000;
const EXCERPT_CHARS = 4_000;
const MAX_NAME_CHARS = 40;

const SYSTEM_PROMPT = [
  "You name screens in a design tool. You get the code of one screen.",
  'Reply with JSON only: {"name": "<name>"}.',
  "The name is 2 to 4 words in Title Case that say what the screen is for,",
  "for example: Bike Shop Home, Login, Checkout, Pricing Plans, Order Tracking.",
  "Use the brand or product name when the page shows one. No quotes, no emoji, no trailing 'Screen' or 'Page'.",
].join(" ");

/** The readable part of a screen: markup and text without styles, scripts, images or inline data. */
export function screenExcerpt(source: ScreenSource): string {
  const code = source.files[source.entry] ?? "";
  return code
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ")
    .replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, "data:")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_CHARS);
}

/** A clean one-line name from the model's reply, or null when it gave nothing usable. */
export function parseScreenName(content: string): string | null {
  let value: unknown;
  try {
    value = (JSON.parse(content) as { name?: unknown }).name;
  } catch {
    return null;
  }
  if (typeof value !== "string") return null;
  const name = value.replace(/[\r\n"“”]+/g, " ").replace(/\s+/g, " ").trim().replace(/[.:;,\s]+$/, "");
  if (!name) return null;
  return name.length > MAX_NAME_CHARS ? name.slice(0, MAX_NAME_CHARS).trim() : name;
}

export type ScreenNamer = { name(source: ScreenSource): Promise<string | null> };

export function createDeepSeekScreenNamer({ apiKey, model = SCREEN_NAME_MODEL, fetch = globalThis.fetch, timeoutMs = TIMEOUT_MS }: {
  apiKey: string; model?: string; fetch?: typeof globalThis.fetch; timeoutMs?: number;
}): ScreenNamer {
  return {
    async name(source) {
      const excerpt = screenExcerpt(source);
      if (!excerpt) return null;
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `Screen code (${source.kind}):\n${excerpt}` },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return null;
        const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
        const content = body.choices?.[0]?.message?.content;
        return typeof content === "string" ? parseScreenName(content) : null;
      } catch {
        // Naming is a nicety: any failure leaves the placeholder name in place.
        return null;
      }
    },
  };
}
