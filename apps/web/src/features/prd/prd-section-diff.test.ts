import { describe, expect, it } from "vitest";
import { diffPrdSection, sectionDiffLines } from "./prd-section-diff";

describe("diffPrdSection", () => {
  it("returns no proposal when the field is unchanged", () => {
    expect(diffPrdSection("prose", "same", "same")).toBeNull();
  });

  it("keeps a one-field before/after pair", () => {
    const diff = diffPrdSection("list", ["old"], ["new"]);
    expect(diff).toEqual({ kind: "list", before: ["old"], after: ["new"] });
    expect(diff ? sectionDiffLines(diff) : []).toEqual([
      { status: "removed", value: '[\n  "old"\n]' },
      { status: "added", value: '[\n  "new"\n]' },
    ]);
  });
});
