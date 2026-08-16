import { PRD_FIELD_NAMES } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { prdSectionReviseResponseSchema } from "./prd-section-revise-prompt";

function valueSchema(field: (typeof PRD_FIELD_NAMES)[number]) {
  const schema = prdSectionReviseResponseSchema(field);
  return (schema.properties as Record<string, unknown>).value as Record<
    string,
    unknown
  >;
}

describe("PRD section revision response schema", () => {
  it("gives every PRD field a concrete Codex-compatible value type", () => {
    for (const field of PRD_FIELD_NAMES) {
      expect(valueSchema(field).type, field).toBeDefined();
    }
  });

  it("preserves each section's actual PRD shape", () => {
    expect(valueSchema("executiveSummary").type).toBe("string");
    expect(valueSchema("functionalRequirements").type).toBe("array");
    expect(valueSchema("mvpScope").type).toBe("object");

    const risks = valueSchema("risksAndMitigations");
    expect((risks.items as Record<string, unknown>).type).toBe("object");

    const decisions = valueSchema("decisionHistory");
    expect((decisions.items as Record<string, unknown>).type).toBe("object");
  });
});
