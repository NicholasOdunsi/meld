import { describe, expect, it } from "vitest";
import { PRDDocumentSchema } from "./prd";
import {
  PRD_FIELD_NAMES,
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
