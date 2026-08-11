import { describe, expect, it } from "vitest";
import { parsePrdSectionRevision } from "./prd-section-revision";

describe("prd section revision results", () => {
  it("accepts the matching field value", () => {
    expect(
      parsePrdSectionRevision("executiveSummary", { value: "tighter" }),
    ).toEqual({ ok: true, value: "tighter" });
  });

  it("rejects another field or a wrong shape", () => {
    expect(
      parsePrdSectionRevision("functionalRequirements", {
        value: "not a list",
      }),
    ).toEqual({ ok: false });
    expect(
      parsePrdSectionRevision("executiveSummary", {
        value: "tighter",
        mvpScope: { included: ["sneaky"], excluded: [] },
      }),
    ).toEqual({ ok: false });
  });
});
