import { PRDDocumentSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { PRD_SECTIONS } from "./prd-sections";

describe("PRD_SECTIONS", () => {
  it("covers every PRDDocument content field exactly once", () => {
    const fields = PRD_SECTIONS.map((s) => s.field);
    expect(new Set(fields).size).toBe(fields.length);
    // title is the page heading, not a body section.
    expect(fields).not.toContain("title");
    // Exact-set comparison against the contract's own field list, so adding
    // a field to PRDDocumentSchema without adding it to PRD_SECTIONS (or
    // vice versa) fails this test instead of silently drifting.
    const expected = Object.keys(PRDDocumentSchema.shape).filter(
      (field) => field !== "title",
    );
    expect([...fields].sort()).toEqual([...expected].sort());
  });
});
