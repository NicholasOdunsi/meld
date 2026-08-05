import { describe, expect, it } from "vitest";
import { AIContextPackageSchema, RoomReplyResultSchema } from "./ai";

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
