import { describe, expect, it } from "vitest";
import { PRD_SECTIONS } from "./prd-sections";

describe("PRD_SECTIONS", () => {
  it("covers every PRDDocument content field exactly once", () => {
    const fields = PRD_SECTIONS.map((s) => s.field);
    expect(new Set(fields).size).toBe(fields.length);
    // title is the page heading, not a body section.
    expect(fields).not.toContain("title");
    expect(fields).toEqual(
      expect.arrayContaining([
        "executiveSummary",
        "problemAndEvidence",
        "functionalRequirements",
        "mvpScope",
        "risksAndMitigations",
        "decisionHistory",
      ]),
    );
  });
});
