import { PRDDocumentSchema, PRD_SECTION_ORDER } from "@meld/contracts";
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

  it("renders in the contract's canonical section order", () => {
    // PRD_SECTION_ORDER is the ordering authority a selection scope is checked
    // against (see @meld/contracts prd-fields.ts). If this document rendered
    // sections in a different order, a user could drag one selection across two
    // adjacent sections and have the contract reject it as out of order.
    expect(PRD_SECTIONS.map((section) => section.field)).toEqual([
      ...PRD_SECTION_ORDER,
    ]);
  });
});
