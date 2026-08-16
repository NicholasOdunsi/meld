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
async function readCappedBytes(response: Response, maxBytes: number): Promise<Uint8Array | typeof TOO_LARGE> {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffered = new Uint8Array(await response.arrayBuffer());
    return buffered.length > maxBytes ? TOO_LARGE : buffered;
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
  return merged;
}

async function readCapped(response: Response, maxBytes: number): Promise<string | typeof TOO_LARGE> {
  const bytes = await readCappedBytes(response, maxBytes);
  return bytes === TOO_LARGE ? TOO_LARGE : new TextDecoder().decode(bytes);
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

export type CappedImage = { bytes: Uint8Array; contentType: string };

// Host allowlist for the thumbnail download (SSRF hardening). The URL comes
// from Figma's own oEmbed response, but that response body is still
// attacker-influenceable in principle, so we refuse to fetch anything that
// isn't served from a Figma-owned host over https before ever dialing out.
export function isFigmaThumbnailHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  return host === "figma.com" || host.endsWith(".figma.com");
}

// Downloads a thumbnail image with the same guardrails as the oEmbed fetch
// itself (5s timeout, ≤64KiB, no off-allowlist redirect) — the thumbnail URL
// comes from Figma's own oEmbed response, but we still cap what we're
// willing to buffer into memory and forward into storage.
export async function downloadCappedImage(
  url: string,
  opts?: { timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<CappedImage | null> {
  if (!isFigmaThumbnailHost(url)) return null;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) return null;
    const bytes = await readCappedBytes(response, MAX_RESPONSE_BYTES);
    if (bytes === TOO_LARGE) return null;
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return { bytes, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
