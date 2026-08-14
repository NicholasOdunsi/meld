import { describe, expect, it } from "vitest";
import { fetchFigmaOEmbed } from "./figma-oembed";

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json" } });
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
