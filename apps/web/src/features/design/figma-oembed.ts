import "server-only";

import { parseFigmaOEmbed } from "./figma-url";

const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const FIGMA_ORIGIN = "https://www.figma.com";
const TOO_LARGE = Symbol("too-large");

export type FigmaOEmbedResult = {
  ok: boolean;
  thumbnailUrl: string | null;
  title: string | null;
  status: number | "too-large" | "timeout" | "error";
};

// Bound what we read by BYTES, aborting as soon as the cap is exceeded — a
// post-hoc string-length check neither bounds memory nor measures real size.
async function readCapped(response: Response, maxBytes: number): Promise<string | typeof TOO_LARGE> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffered = new TextEncoder().encode(await response.text());
    return buffered.length > maxBytes ? TOO_LARGE : new TextDecoder().decode(buffered);
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > maxBytes) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

export async function fetchFigmaOEmbed(
  normalizedUrl: string,
  opts?: { timeoutMs?: number; origin?: string; fetchImpl?: typeof fetch },
): Promise<FigmaOEmbedResult> {
  const origin = opts?.origin ?? FIGMA_ORIGIN;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const endpoint = `${origin}/api/oembed?url=${encodeURIComponent(normalizedUrl)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      signal: controller.signal,
      redirect: "error",
    });
    const body = await readCapped(response, MAX_RESPONSE_BYTES);
    if (body === TOO_LARGE) {
      return { ok: false, thumbnailUrl: null, title: null, status: "too-large" };
    }
    if (!response.ok) {
      return { ok: false, thumbnailUrl: null, title: null, status: response.status };
    }
    const parsed = parseFigmaOEmbed(JSON.parse(body));
    return {
      ok: typeof parsed.thumbnailUrl === "string",
      thumbnailUrl: parsed.thumbnailUrl,
      title: parsed.title,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      thumbnailUrl: null,
      title: null,
      status: error instanceof Error && error.name === "AbortError" ? "timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}
