import { describe, expect, it } from "vitest";
import { ScreenSourceSchema } from "./source";

const ok = { kind: "react", files: { "App.tsx": "export default () => null" }, entry: "App.tsx" };

describe("ScreenSourceSchema", () => {
  it("accepts a valid react source", () => {
    expect(ScreenSourceSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects an entry that is not a file", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, entry: "Main.tsx" }).success).toBe(false);
  });
  it("rejects paths that climb out", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, files: { "../x.tsx": "" }, entry: "../x.tsx" }).success).toBe(false);
  });
  it("rejects more than 20 files", () => {
    const files = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`f${index}.ts`, ""]));
    expect(ScreenSourceSchema.safeParse({ kind: "react", files, entry: "f0.ts" }).success).toBe(false);
  });
  it("rejects sources over 256 KB", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, files: { "App.tsx": "x".repeat(262_145) } }).success).toBe(false);
  });
  it("rejects unknown kinds", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, kind: "vue" }).success).toBe(false);
  });
});
