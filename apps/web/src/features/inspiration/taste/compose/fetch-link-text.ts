/**
 * SSRF-guarded fetch of link text for the Taste composer.
 *
 * Known limit: the address is validated by a lookup before the request, so a
 * DNS-rebinding host could still resolve differently at connect time. The risk
 * is accepted for v1 because the body is only ever fed to a text model and
 * never returned to the caller; revisit with a pinned-IP dispatcher if links
 * become a public surface.
 */
import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const LINK_TEXT_MAX_CHARS = 20_000;
const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

export type LinkText =
  | { ok: true; name: string; text: string }
  | { ok: false; name: string; reason: "blocked" | "unreachable" | "not_text" | "too_large" | "empty" };

function ipv4Blocked(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isBlockedAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const value = mapped ? mapped[1] : address.toLowerCase();
  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number);
    return ipv4Blocked(a, b);
  }
  if (isIP(value) === 6) {
    return value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd");
  }
  return true; // not an address we understand
}

async function defaultLookup(host: string): Promise<string[]> {
  return (await dnsLookup(host, { all: true })).map((entry) => entry.address);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function allowed(url: URL, lookup: (host: string) => Promise<string[]>): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await lookup(host).catch(() => []);
  return addresses.length > 0 && addresses.every((address) => !isBlockedAddress(address));
}

export async function fetchLinkText(
  rawUrl: string,
  deps: { fetch?: typeof globalThis.fetch; lookup?: (host: string) => Promise<string[]> } = {},
): Promise<LinkText> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const lookup = deps.lookup ?? defaultLookup;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, name: rawUrl.slice(0, 60), reason: "blocked" };
  }
  const name = url.hostname;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!(await allowed(url, lookup))) return { ok: false, name, reason: "blocked" };
    let response: Response;
    try {
      response = await doFetch(url, {
        redirect: "manual",
        headers: { accept: "text/html,text/plain", "user-agent": "OrionTaste/1.0" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, name, reason: "unreachable" };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, name, reason: "unreachable" };
      try {
        url = new URL(location, url);
      } catch {
        return { ok: false, name, reason: "blocked" };
      }
      continue;
    }
    if (!response.ok) return { ok: false, name, reason: "unreachable" };
    const type = response.headers.get("content-type") ?? "";
    if (!/^text\/(html|plain)/i.test(type)) return { ok: false, name, reason: "not_text" };
    const body = await response.text();
    if (body.length > MAX_BYTES) return { ok: false, name, reason: "too_large" };
    const text = (/html/i.test(type) ? htmlToText(body) : body.replace(/\s+/g, " ").trim()).slice(0, LINK_TEXT_MAX_CHARS);
    return text ? { ok: true, name, text } : { ok: false, name, reason: "empty" };
  }
  return { ok: false, name, reason: "unreachable" };
}
