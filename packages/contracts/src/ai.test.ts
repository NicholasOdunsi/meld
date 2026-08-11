import { describe, expect, it } from "vitest";
import {
  AIContextPackageSchema,
  AITaskKindSchema,
  RoomReplyResultSchema,
} from "./ai";
import { AIResultEnvelopeSchema } from "./ws";

const base = {
  response: "Sure.",
  citedMessageIds: [],
  citedEvidenceIds: [],
  assumptions: [],
  suggestedNextQuestions: [],
};

const VALID_PRD = {
  title: "Guided onboarding",
  executiveSummary: "Reduce setup friction.",
  problemAndEvidence: "Owners report unclear setup ownership.",
  targetUsersAndUseCases: "New workspace owners.",
  goalsNonGoalsAndMetrics: "Improve activation.",
  proposedSolution: "A guided setup flow.",
  userJourneys: "An owner completes the flow.",
  functionalRequirements: ["Show setup steps."],
  nonFunctionalRequirements: ["Keyboard navigation."],
  uxStatesAndEdgeCases: ["Resume interrupted setup."],
  dependenciesAndConstraints: ["Role metadata required."],
  risksAndMitigations: [{ risk: "Too many steps", mitigation: "Measure." }],
  mvpScope: { included: ["Checklist"], excluded: ["Billing"] },
  acceptanceCriteria: ["Owners can complete setup."],
  openQuestions: ["Who owns completion?"],
  decisionHistory: [
    {
      decision: "Start with owners.",
      rationale: "They are blocked.",
      sourceMessageIds: [],
    },
  ],
};

const MINIMAL_CONTEXT = {
  taskId: "41000000-0000-4000-8000-000000000001",
  initiatingUserId: "41000000-0000-4000-8000-000000000002",
  organizationId: "41000000-0000-4000-8000-000000000003",
  roomId: "41000000-0000-4000-8000-000000000004",
  kind: "prd_revise" as const,
  instruction: "Allow reassignment from PAMS-onboarded users.",
  messages: [],
  attachments: [],
  evidence: [],
  decisions: [],
};

describe("RoomReplyResultSchema list defaults", () => {
  // Observed against the managed Claude client: told a list may be "empty when
  // it doesn't apply", the model omits the key entirely. It did this on all ten
  // StructuredOutput attempts of one run, exhausted the retry budget, and the
  // whole reply was lost. An omitted list must mean [], never a failed parse.
  it("defaults every omitted list to empty", () => {
    const parsed = RoomReplyResultSchema.parse({ response: "Sure." });

    expect(parsed.citedMessageIds).toEqual([]);
    expect(parsed.citedEvidenceIds).toEqual([]);
    expect(parsed.assumptions).toEqual([]);
    expect(parsed.suggestedNextQuestions).toEqual([]);
    expect(parsed.webSources).toEqual([]);
  });

  it("still rejects a reply with no response at all", () => {
    expect(() => RoomReplyResultSchema.parse({})).toThrow();
  });

  it("still enforces the bounds on a list that is supplied", () => {
    expect(() =>
      RoomReplyResultSchema.parse({
        ...base,
        citedMessageIds: ["not-a-uuid"],
      }),
    ).toThrow();
    expect(() =>
      RoomReplyResultSchema.parse({
        ...base,
        suggestedNextQuestions: ["a", "b", "c", "d", "e", "f"],
      }),
    ).toThrow();
  });

  it("accepts HTTP(S) web sources and rejects other protocols", () => {
    expect(
      RoomReplyResultSchema.parse({
        response: "The regulator published updated guidance.",
        webSources: [
          {
            title: "Updated guidance",
            url: "https://example.gov/guidance",
            publisher: "Example regulator",
            publishedAt: "2026-08-01",
          },
        ],
      }).webSources,
    ).toHaveLength(1);

    expect(() =>
      RoomReplyResultSchema.parse({
        response: "Unsafe source.",
        webSources: [{ title: "Local file", url: "file:///tmp/source" }],
      }),
    ).toThrow();
  });
});

describe("AIContextPackageSchema research scope", () => {
  it("defaults existing tasks to the Product Agent and room-only scope", () => {
    const parsed = AIContextPackageSchema.parse(MINIMAL_CONTEXT);

    expect(parsed.agentKind).toBe("product");
    expect(parsed.researchScope).toBe("room");
  });

  it("allows web scope only for the Research Agent", () => {
    expect(
      AIContextPackageSchema.parse({
        ...MINIMAL_CONTEXT,
        kind: "room_reply",
        agentKind: "research",
        researchScope: "web",
      }).researchScope,
    ).toBe("web");

    expect(() =>
      AIContextPackageSchema.parse({
        ...MINIMAL_CONTEXT,
        agentKind: "product",
        researchScope: "web",
      }),
    ).toThrow("Only Research Agent tasks may use web research");
  });
});

describe("RoomReplyResultSchema.proposedAction", () => {
  it("accepts a reply with no proposedAction (back-compat)", () => {
    expect(RoomReplyResultSchema.parse(base).proposedAction ?? null).toBeNull();
  });

  it("accepts an explicit null proposedAction", () => {
    expect(
      RoomReplyResultSchema.parse({ ...base, proposedAction: null })
        .proposedAction,
    ).toBeNull();
  });

  it("accepts a prd_generate proposal", () => {
    const parsed = RoomReplyResultSchema.parse({
      ...base,
      proposedAction: { kind: "prd_generate" },
    });

    expect(parsed.proposedAction?.kind).toBe("prd_generate");
  });

  it("accepts a prd_revise proposal", () => {
    const parsed = RoomReplyResultSchema.parse({
      ...base,
      proposedAction: { kind: "prd_revise" },
    });

    expect(parsed.proposedAction?.kind).toBe("prd_revise");
  });

  it("rejects an unknown action kind", () => {
    expect(() =>
      RoomReplyResultSchema.parse({
        ...base,
        proposedAction: { kind: "delete_room" },
      }),
    ).toThrow();
  });
});

describe("AIContextPackageSchema.existingPrd", () => {
  it("accepts a context with no existingPrd (back-compat)", () => {
    expect(AIContextPackageSchema.safeParse(MINIMAL_CONTEXT).success).toBe(true);
  });

  it("accepts an existingPrd carrying a version and full document", () => {
    const parsed = AIContextPackageSchema.parse({
      ...MINIMAL_CONTEXT,
      existingPrd: { version: 2, document: VALID_PRD },
    });

    expect(parsed.existingPrd?.version).toBe(2);
    expect(parsed.existingPrd?.document?.title).toBe("Guided onboarding");
  });

  it("rejects a non-positive existingPrd version", () => {
    expect(
      AIContextPackageSchema.safeParse({
        ...MINIMAL_CONTEXT,
        existingPrd: { version: 0, document: VALID_PRD },
      }).success,
    ).toBe(false);
  });

  it("rejects extra keys on a proposed action", () => {
    expect(() =>
      RoomReplyResultSchema.parse({
        ...base,
        proposedAction: {
          kind: "prd_generate",
          roomId: "41000000-0000-4000-8000-000000000001",
        },
      }),
    ).toThrow();
  });
});

describe("prd_section_assist task kind", () => {
  const ASSIST_SCOPE = {
    sections: [
      {
        field: "executiveSummary",
        label: "Executive Summary",
        quotedText: "Reduce setup friction.",
      },
      {
        field: "risksAndMitigations",
        label: "Risks and Mitigations",
        quotedText: "Too many steps.",
      },
    ],
    canProposeEdit: true,
  };

  it("is an accepted task kind and result envelope kind", () => {
    expect(AITaskKindSchema.safeParse("prd_section_assist").success).toBe(true);
    expect(
      AIResultEnvelopeSchema.safeParse({
        kind: "prd_section_assist",
        payload: { answer: "Because owners stall." },
      }).success,
    ).toBe(true);
  });

  it("accepts a context package carrying a prdAssistScope", () => {
    const parsed = AIContextPackageSchema.parse({
      ...MINIMAL_CONTEXT,
      kind: "prd_section_assist",
      existingPrd: { version: 2, document: VALID_PRD },
      prdAssistScope: ASSIST_SCOPE,
    });

    expect(parsed.prdAssistScope?.sections.map((s) => s.field)).toEqual([
      "executiveSummary",
      "risksAndMitigations",
    ]);
    expect(parsed.prdAssistScope?.canProposeEdit).toBe(true);
    expect(parsed.targetSection).toBeUndefined();
  });

  it("rejects a context package whose assist scope breaks its limits", () => {
    expect(
      AIContextPackageSchema.safeParse({
        ...MINIMAL_CONTEXT,
        kind: "prd_section_assist",
        prdAssistScope: { sections: [], canProposeEdit: true },
      }).success,
    ).toBe(false);
  });

  it("keeps prd_section_revise and its targetSection valid", () => {
    const parsed = AIContextPackageSchema.parse({
      ...MINIMAL_CONTEXT,
      kind: "prd_section_revise",
      existingPrd: { version: 2, document: VALID_PRD },
      targetSection: {
        field: "executiveSummary",
        label: "Executive Summary",
        quotedText: "Reduce setup friction.",
      },
    });

    expect(parsed.kind).toBe("prd_section_revise");
    expect(parsed.targetSection?.field).toBe("executiveSummary");
    expect(parsed.prdAssistScope).toBeUndefined();
  });
});

describe("user_flow_generate task kind", () => {
  it("is accepted by task, context, and result schemas", () => {
    expect(AITaskKindSchema.parse("user_flow_generate")).toBe("user_flow_generate");
    expect(
      AIContextPackageSchema.parse({
        ...MINIMAL_CONTEXT,
        kind: "user_flow_generate",
      }).kind,
    ).toBe("user_flow_generate");
    expect(
      AIResultEnvelopeSchema.parse({
        kind: "user_flow_generate",
        payload: { title: "Ownership transfer" },
      }).kind,
    ).toBe("user_flow_generate");
  });
});
