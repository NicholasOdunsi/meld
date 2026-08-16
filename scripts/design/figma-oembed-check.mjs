// Verifies the one third-party assumption in the Design Room design: that
// Figma's public oEmbed endpoint returns a usable thumbnail with no OAuth.
// Self-test mode runs against a local fake; --live hits figma.com.

const ALLOWED_HOSTS = new Set(["figma.com", "www.figma.com"]);
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const FIGMA_ORIGIN = "https://www.figma.com";
const TOO_LARGE = Symbol("too-large");

// Bound what we read by BYTES, aborting as soon as the cap is exceeded — a
// post-hoc string-length check neither bounds memory nor measures real size.
async function readCapped(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const buffered = new TextEncoder().encode(await response.text());
    return buffered.length > maxBytes ? TOO_LARGE : new TextDecoder().decode(buffered);
  }
  const chunks = [];
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

export function normalizeFigmaUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  url.hostname = url.hostname.toLowerCase();
  url.username = "";
  url.password = "";
  url.hash = "";
  const nodeId = url.searchParams.get("node-id");
  url.search = "";
  if (nodeId) url.searchParams.set("node-id", nodeId);
  return url.toString();
}

export async function fetchOembed(figmaUrl, options = {}) {
  const origin = options.origin ?? FIGMA_ORIGIN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${origin}/api/oembed?url=${encodeURIComponent(figmaUrl)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
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
    const parsed = JSON.parse(body);
    return {
      ok: typeof parsed.thumbnail_url === "string",
      thumbnailUrl: typeof parsed.thumbnail_url === "string" ? parsed.thumbnail_url : null,
      title: typeof parsed.title === "string" ? parsed.title : null,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      thumbnailUrl: null,
      title: null,
      status: error.name === "AbortError" ? "timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log("Self-test only. Pass --live <figma-url> to probe figma.com.");
    return;
  }
  const target = process.argv[process.argv.indexOf("--live") + 1];
  const normalized = normalizeFigmaUrl(target ?? "");
  if (!normalized) {
    console.error(`Not an allowed Figma URL: ${target}`);
    process.exitCode = 1;
    return;
  }
  const result = await fetchOembed(normalized);
  console.log(JSON.stringify({ normalized, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
