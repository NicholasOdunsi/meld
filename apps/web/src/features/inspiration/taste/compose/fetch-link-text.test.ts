import { describe, expect, it, vi } from "vitest";
import { fetchLinkText, isBlockedAddress } from "./fetch-link-text";

const PUBLIC = async () => ["93.184.216.34"];
const html = (body: string, type = "text/html; charset=utf-8", status = 200) =>
  new Response(body, { status, headers: { "content-type": type } });

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (address) =>
    expect(isBlockedAddress(address)).toBe(false),
  );
});

describe("fetchLinkText", () => {
  it("returns readable text without scripts, styles or tags", async () => {
    const fetch = vi.fn(async () => html("<html><head><style>x{}</style><script>evil()</script></head><body><h1>Calm brand</h1><p>Lots   of white space.</p></body></html>"));
    const result = await fetchLinkText("https://example.com/brand", { fetch, lookup: PUBLIC });
    expect(result).toEqual({ ok: true, name: "example.com", text: "Calm brand Lots of white space." });
  });

  it("refuses non-http schemes and private hosts without fetching", async () => {
    const fetch = vi.fn();
    expect(await fetchLinkText("file:///etc/passwd", { fetch, lookup: PUBLIC })).toMatchObject({ ok: false, reason: "blocked" });
    expect(await fetchLinkText("http://169.254.169.254/latest", { fetch, lookup: PUBLIC })).toMatchObject({ ok: false, reason: "blocked" });
    expect(await fetchLinkText("https://internal.example/", { fetch, lookup: async () => ["10.0.0.5"] })).toMatchObject({ ok: false, reason: "blocked" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("re-checks every redirect hop", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://10.0.0.1/admin" } }));
    expect(await fetchLinkText("https://example.com/", { fetch, lookup: async (host) => (host === "example.com" ? ["93.184.216.34"] : ["10.0.0.1"]) })).toMatchObject({ ok: false, reason: "blocked" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects non-text, oversized and empty pages", async () => {
    expect(await fetchLinkText("https://example.com/a.png", { fetch: async () => html("x", "image/png"), lookup: PUBLIC })).toMatchObject({ ok: false, reason: "not_text" });
    expect(await fetchLinkText("https://example.com/big", { fetch: async () => html("a".repeat(2_000_001)), lookup: PUBLIC })).toMatchObject({ ok: false, reason: "too_large" });
    expect(await fetchLinkText("https://example.com/empty", { fetch: async () => html("<html><body> </body></html>"), lookup: PUBLIC })).toMatchObject({ ok: false, reason: "empty" });
  });

  it("maps network failures to unreachable", async () => {
    expect(await fetchLinkText("https://example.com/", { fetch: async () => { throw new Error("boom"); }, lookup: PUBLIC })).toMatchObject({ ok: false, reason: "unreachable" });
  });
});
