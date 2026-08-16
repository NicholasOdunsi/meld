import { describe, expect, it } from "vitest";
import { FlowDocumentSchema } from "@meld/contracts";
import {
  USER_FLOW_GENERATE_PROMPT_VERSION,
  USER_FLOW_GENERATE_RESPONSE_SCHEMA,
  USER_FLOW_GENERATE_SYSTEM_PROMPT,
} from "./user-flow-generate-prompt";

describe("user flow generation prompt", () => {
  it("pins grounding and safety instructions", () => {
    expect(USER_FLOW_GENERATE_PROMPT_VERSION).toBe("user-flow-generate-v1");
    expect(USER_FLOW_GENERATE_SYSTEM_PROMPT).toContain("PRD as authoritative");
    expect(USER_FLOW_GENERATE_SYSTEM_PROMPT).toContain("Do not invent product facts");
    expect(USER_FLOW_GENERATE_SYSTEM_PROMPT).toContain("Return only JSON");
  });

  it("is closed and requires every property at every object level", () => {
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (value === null || typeof value !== "object") return;
      const node = value as Record<string, unknown>;
      if (node.type === "object") {
        const properties = Object.keys((node.properties ?? {}) as object).sort();
        expect(node.additionalProperties).toBe(false);
        expect([...(node.required as string[])].sort()).toEqual(properties);
      }
      Object.values(node).forEach(visit);
    };
    visit(USER_FLOW_GENERATE_RESPONSE_SCHEMA);
  });

  it("uses the shared graph contract as its final authority", () => {
    expect(() => FlowDocumentSchema.parse({
      title: "Invalid",
      summary: "Invalid",
      nodes: [{ id: "start", kind: "start", label: "Start", detail: null }],
      edges: [],
      openQuestions: [],
    })).toThrow("at least one end");
  });
});
