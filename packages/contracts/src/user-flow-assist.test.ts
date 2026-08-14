import { describe, expect, it } from "vitest";
import { UserFlowAssistEnvelopeSchema } from "./user-flow-assist";

const VALID_FLOW = {
  title: "Signup",
  summary: "New user signs up",
  nodes: [
    { id: "start", kind: "start", label: "Start", detail: null },
    { id: "finish", kind: "end", label: "Done", detail: null },
  ],
  edges: [{ id: "e1", from: "start", to: "finish", label: null }],
  openQuestions: [],
};

describe("UserFlowAssistEnvelopeSchema", () => {
  it("accepts a flow-only outcome", () => {
    const parsed = UserFlowAssistEnvelopeSchema.safeParse({
      flow: VALID_FLOW,
      clarifyingQuestion: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a clarifying-question-only outcome", () => {
    const parsed = UserFlowAssistEnvelopeSchema.safeParse({
      flow: null,
      clarifyingQuestion: "Which payment path should I add?",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an all-null outcome", () => {
    const parsed = UserFlowAssistEnvelopeSchema.safeParse({
      flow: null,
      clarifyingQuestion: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects both present at once", () => {
    const parsed = UserFlowAssistEnvelopeSchema.safeParse({
      flow: VALID_FLOW,
      clarifyingQuestion: "ambiguous",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a flow that breaks graph invariants", () => {
    const parsed = UserFlowAssistEnvelopeSchema.safeParse({
      flow: { ...VALID_FLOW, nodes: [VALID_FLOW.nodes[0]] }, // no end node
      clarifyingQuestion: null,
    });
    expect(parsed.success).toBe(false);
  });
});
