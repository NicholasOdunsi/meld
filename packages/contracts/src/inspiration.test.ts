import { describe, expect, it } from "vitest";
import {
  INSPIRATION_LIMITS,
  InspirationItemViewSchema,
  SHELF_ERROR_MESSAGES,
  ShelfConnectRequestSchema,
  ShelfErrorCodeSchema,
  ShelfErrorSchema,
  ShelfUploadFieldsSchema,
  normalizeNote,
  normalizeSourceUrl,
} from "./inspiration";

const ID = "11111111-1111-4111-8111-111111111111";

describe("INSPIRATION_LIMITS", () => {
  it("pins the values the spec and the Swift mirror rely on", () => {
    expect(INSPIRATION_LIMITS).toEqual({
      maxBytes: 10_485_760,
      maxEdge: 4096,
      fallbackEdge: 2048,
      noteMax: 500,
      sourceUrlMax: 2048,
      pageSize: 60,
      bulkMax: 100,
      deviceNameMax: 100,
    });
  });
});

describe("normalizeSourceUrl", () => {
  it("keeps http and https URLs", () => {
    expect(normalizeSourceUrl("https://pinterest.com/pin/1")).toBe("https://pinterest.com/pin/1");
    expect(normalizeSourceUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("drops other schemes, junk, blanks, and over-long URLs", () => {
    expect(normalizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSourceUrl("file:///Users/me/a.png")).toBeNull();
    expect(normalizeSourceUrl("not a url")).toBeNull();
    expect(normalizeSourceUrl("   ")).toBeNull();
    expect(normalizeSourceUrl(null)).toBeNull();
    expect(normalizeSourceUrl(`https://x.com/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("normalizeNote", () => {
  it("trims and turns empty into null", () => {
    expect(normalizeNote("  love this nav  ")).toBe("love this nav");
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it("cuts notes to the limit instead of rejecting them", () => {
    expect(normalizeNote("a".repeat(600))).toHaveLength(500);
  });
});

describe("ShelfUploadFieldsSchema", () => {
  // Routes always pass every key (FormData.get returns null for a missing
  // field), so the contract is tested with explicit nulls.
  it("accepts all-null fields", () => {
    expect(ShelfUploadFieldsSchema.parse({ note: null, sourceUrl: null, roomId: null })).toEqual({
      note: null,
      sourceUrl: null,
      roomId: null,
    });
  });

  it("normalizes note and sourceUrl and validates roomId", () => {
    expect(
      ShelfUploadFieldsSchema.parse({ note: " hi ", sourceUrl: "ftp://x", roomId: ID }),
    ).toEqual({ note: "hi", sourceUrl: null, roomId: ID });
    expect(ShelfUploadFieldsSchema.safeParse({ roomId: "nope" }).success).toBe(false);
  });
});

describe("ShelfConnectRequestSchema", () => {
  it("requires a code and a device name", () => {
    expect(ShelfConnectRequestSchema.safeParse({ code: "ABCD1234", deviceName: "Studio Mac" }).success).toBe(true);
    expect(ShelfConnectRequestSchema.safeParse({ code: "", deviceName: "x" }).success).toBe(false);
    expect(ShelfConnectRequestSchema.safeParse({ code: "A", deviceName: "" }).success).toBe(false);
  });
});

describe("InspirationItemViewSchema", () => {
  it("accepts a complete view", () => {
    const view = {
      id: ID,
      workspaceId: ID,
      imageUrl: "https://signed.example/a.png",
      width: 800,
      height: 600,
      mimeType: "image/png",
      sourceUrl: null,
      note: null,
      captureChannel: "shelf",
      createdAt: "2026-11-06T10:00:00.000Z",
      roomIds: [ID],
    };
    expect(InspirationItemViewSchema.parse(view)).toEqual(view);
  });
});

describe("shelf errors", () => {
  it("has a message for every code", () => {
    for (const code of ShelfErrorCodeSchema.options) {
      expect(SHELF_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it("validates the error envelope", () => {
    expect(
      ShelfErrorSchema.safeParse({ error: { code: "too_large", message: "Too large to save." } }).success,
    ).toBe(true);
    expect(ShelfErrorSchema.safeParse({ error: { code: "nope", message: "x" } }).success).toBe(false);
  });
});
