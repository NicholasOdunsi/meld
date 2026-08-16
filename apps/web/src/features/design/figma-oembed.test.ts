import { describe, expect, it, vi } from "vitest";
import { downloadCappedImage, fetchFigmaOEmbed, isFigmaThumbnailHost } from "./figma-oembed";

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json" } });
}

function imageResponse(bytes: Uint8Array, contentType = "image/png") {
  return new Response(bytes as BodyInit, { status: 200, headers: { "content-type": contentType } });
}

describe("fetchFigmaOEmbed", () => {
  it("returns ok with title + thumbnail on a good response", async () => {
    const fetchImpl = (async () => jsonResponse({ title: "T", thumbnail_url: "https://f/t.png" })) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r).toMatchObject({ ok: true, title: "T", thumbnailUrl: "https://f/t.png" });
  });
  it("reports non-2xx as failed", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r.ok).toBe(false);
  });
  it("reports a thrown/abort as error/timeout", async () => {
    const fetchImpl = (async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r.status).toBe("timeout");
  });
});

describe("downloadCappedImage", () => {
  it("returns bytes + content type on a good response", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = (async () => imageResponse(bytes)) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://api-cdn.figma.com/t.png", { fetchImpl });
    expect(r).not.toBeNull();
    expect(r?.contentType).toBe("image/png");
    expect(Array.from(r?.bytes ?? [])).toEqual([1, 2, 3, 4]);
  });

  it("returns null when the response exceeds the byte cap", async () => {
    const bytes = new Uint8Array(64 * 1024 + 1);
    const fetchImpl = (async () => imageResponse(bytes)) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://api-cdn.figma.com/t.png", { fetchImpl });
    expect(r).toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://api-cdn.figma.com/t.png", { fetchImpl });
    expect(r).toBeNull();
  });

  it("returns null on a thrown/abort error", async () => {
    const fetchImpl = (async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://api-cdn.figma.com/t.png", { fetchImpl });
    expect(r).toBeNull();
  });

  it("attempts the fetch for an allowlisted Figma CDN host", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () => imageResponse(bytes));
    const r = await downloadCappedImage("https://api-cdn.figma.com/t.png", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).not.toBeNull();
  });

  it("returns null without fetching for a non-Figma host (SSRF guard)", async () => {
    const fetchImpl = vi.fn(async () => imageResponse(new Uint8Array([1])));
    const r = await downloadCappedImage("https://evil.example.com/x.png", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toBeNull();
  });

  it("returns null without fetching for a non-https Figma URL", async () => {
    const fetchImpl = vi.fn(async () => imageResponse(new Uint8Array([1])));
    const r = await downloadCappedImage("http://figma.com/x.png", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r).toBeNull();
  });
});

describe("isFigmaThumbnailHost", () => {
  it("allows the apex figma.com host over https", () => {
    expect(isFigmaThumbnailHost("https://figma.com/x.png")).toBe(true);
  });

  it("allows any https subdomain of figma.com", () => {
    expect(isFigmaThumbnailHost("https://api-cdn.figma.com/x.png")).toBe(true);
  });

  it("rejects a host that is not figma.com or a subdomain of it", () => {
    expect(isFigmaThumbnailHost("https://evil.example.com/x.png")).toBe(false);
  });

  it("rejects a lookalike host that merely ends in the literal string figma.com", () => {
    expect(isFigmaThumbnailHost("https://notfigma.com/x.png")).toBe(false);
  });

  it("rejects a non-https figma.com URL", () => {
    expect(isFigmaThumbnailHost("http://figma.com/x.png")).toBe(false);
  });

  it("rejects an unparsable URL", () => {
    expect(isFigmaThumbnailHost("not a url")).toBe(false);
  });
});
