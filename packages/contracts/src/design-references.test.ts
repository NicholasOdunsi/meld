import { describe, expect, it } from "vitest";
import { DesignReferenceSchema, OEmbedStatusSchema } from "./design-references";

describe("OEmbedStatusSchema", () => {
  it("lists exactly the three statuses", () => {
    expect(OEmbedStatusSchema.options).toEqual(["pending", "ok", "failed"]);
  });

  it("rejects an unknown status", () => {
    expect(() => OEmbedStatusSchema.parse("exploded")).toThrow();
  });
});

describe("DesignReferenceSchema", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    normalizedUrl: "https://www.figma.com/file/abc123/Sample",
    title: null,
    oembedStatus: "pending",
    fetchedAt: null,
    createdAt: "2026-08-14T10:00:00.000Z",
  };

  it("parses a well-formed reference", () => {
    expect(DesignReferenceSchema.parse(base).oembedStatus).toBe("pending");
  });

  it("accepts a fetched, titled reference", () => {
    const fetched = {
      ...base,
      title: "Sample File",
      oembedStatus: "ok",
      fetchedAt: "2026-08-14T10:05:00.000Z",
    };
    expect(DesignReferenceSchema.parse(fetched).title).toBe("Sample File");
  });

  it("rejects an unknown oembedStatus", () => {
    expect(
      DesignReferenceSchema.safeParse({ ...base, oembedStatus: "nope" })
        .success,
    ).toBe(false);
  });

  it("rejects extra keys", () => {
    expect(
      DesignReferenceSchema.safeParse({ ...base, extra: 1 }).success,
    ).toBe(false);
  });
});
