import { describe, expect, it } from "vitest";
import { normalizeFigmaUrl, extractFigmaReferences, parseFigmaOEmbed } from "./figma-url";

describe("normalizeFigmaUrl", () => {
  it("keeps only node-id, lowercases host, drops fragment", () => {
    expect(normalizeFigmaUrl("https://WWW.figma.com/design/abc/Name?node-id=1-2&x=9#frag"))
      .toBe("https://www.figma.com/design/abc/Name?node-id=1-2");
  });
  it("rejects non-figma hosts", () => {
    expect(normalizeFigmaUrl("https://evil.com/design/abc")).toBeNull();
  });
  it("rejects non-https", () => {
    expect(normalizeFigmaUrl("http://figma.com/design/abc")).toBeNull();
  });
});

describe("extractFigmaReferences", () => {
  it("extracts, normalizes, and dedupes figma urls in a body", () => {
    const out = extractFigmaReferences(
      "see https://figma.com/design/a?node-id=1-2 and https://figma.com/design/a?node-id=1-2 and https://x.com/y",
    );
    expect(out).toEqual(["https://figma.com/design/a?node-id=1-2"]);
  });
  it("returns [] when there are no figma urls", () => {
    expect(extractFigmaReferences("plain text https://example.com")).toEqual([]);
  });
});

describe("parseFigmaOEmbed", () => {
  it("extracts title + thumbnail_url", () => {
    expect(parseFigmaOEmbed({ title: "My Design", thumbnail_url: "https://f/thumb.png" }))
      .toEqual({ title: "My Design", thumbnailUrl: "https://f/thumb.png" });
  });
  it("nulls missing/invalid fields", () => {
    expect(parseFigmaOEmbed({})).toEqual({ title: null, thumbnailUrl: null });
    expect(parseFigmaOEmbed("nope")).toEqual({ title: null, thumbnailUrl: null });
  });
});
