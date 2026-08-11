import { describe, expect, it } from "vitest";
import { PRDDocumentSchema } from "./prd";
import {
  PRD_FIELD_NAMES,
  PRD_SECTION_ORDER,
  isPrdFieldName,
  parsePrdFieldValue,
} from "./prd-fields";

describe("prd field schemas", () => {
  it("names every field in the document schema", () => {
    expect([...PRD_FIELD_NAMES].sort()).toEqual(
      Object.keys(PRDDocumentSchema.shape).sort(),
    );
  });

  it("accepts known fields and rejects unknown names", () => {
    expect(isPrdFieldName("risksAndMitigations")).toBe(true);
    expect(isPrdFieldName("notASection")).toBe(false);
  });

  it("orders exactly the sections a reader sees, once each", () => {
    // A field added to PRDDocumentSchema but not to PRD_SECTION_ORDER would be
    // invisible to anything that walks the document in order -- including the
    // assist scope, which can then never carry it. Compare as sets: order is
    // the point of PRD_SECTION_ORDER and is asserted where it is rendered.
    expect(new Set(PRD_SECTION_ORDER).size).toBe(PRD_SECTION_ORDER.length);
    expect(PRD_SECTION_ORDER).not.toContain("title");
    expect([...PRD_SECTION_ORDER].sort()).toEqual(
      PRD_FIELD_NAMES.filter((field) => field !== "title").sort(),
    );
  });

  it("validates the shape of one field", () => {
    expect(parsePrdFieldValue("executiveSummary", "hello")).toEqual({
      ok: true,
      value: "hello",
    });
    expect(
      parsePrdFieldValue("functionalRequirements", "not a list"),
    ).toEqual({ ok: false });
  });
});
