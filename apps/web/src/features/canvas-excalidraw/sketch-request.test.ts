import { describe, expect, it } from "vitest";
import { SketchRequestSchema } from "./sketch-request";

const base = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 10, y: 10, width: 100, height: 40 }] };

describe("SketchRequestSchema", () => {
  it("accepts a normal request", () => {
    expect(SketchRequestSchema.safeParse(base).success).toBe(true);
  });
  it("rejects absurd sizes, too many shapes and extra keys", () => {
    expect(SketchRequestSchema.safeParse({ ...base, width: 0 }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, width: 100000 }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, geometry: Array(501).fill(base.geometry[0]) }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
  it("only accepts a png data URL for the image and caps its size", () => {
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: "data:image/png;base64,AAAA" }).success).toBe(true);
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: "https://example.com/x.png" }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: `data:image/png;base64,${"A".repeat(4_000_001)}` }).success).toBe(false);
  });
});
