import { describe, expect, it } from "vitest";
import { downloadCappedImage, fetchFigmaOEmbed } from "./figma-oembed";

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
    const r = await downloadCappedImage("https://f/t.png", { fetchImpl });
    expect(r).not.toBeNull();
    expect(r?.contentType).toBe("image/png");
    expect(Array.from(r?.bytes ?? [])).toEqual([1, 2, 3, 4]);
  });

  it("returns null when the response exceeds the byte cap", async () => {
    const bytes = new Uint8Array(64 * 1024 + 1);
    const fetchImpl = (async () => imageResponse(bytes)) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://f/t.png", { fetchImpl });
    expect(r).toBeNull();
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://f/t.png", { fetchImpl });
    expect(r).toBeNull();
  });

  it("returns null on a thrown/abort error", async () => {
    const fetchImpl = (async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const r = await downloadCappedImage("https://f/t.png", { fetchImpl });
    expect(r).toBeNull();
  });
});
