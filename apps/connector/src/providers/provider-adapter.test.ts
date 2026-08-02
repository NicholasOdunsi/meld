import { describe, expect, it } from "vitest";
import type { ContextManifest } from "../tasks/product-agent-prompt";
import { validateTaskResult } from "./provider-adapter";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const OUTSIDE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const MANIFEST: ContextManifest = {
  messageIds: new Set([MESSAGE_ID]),
  evidenceIds: new Set(),
};

const PRD_RESULT = {
  title: "Guided onboarding",
  executiveSummary: "Reduce setup friction.",
  problemAndEvidence: "Workspace owners report unclear setup ownership.",
  targetUsersAndUseCases: "New workspace owners completing setup.",
  goalsNonGoalsAndMetrics: "Improve activation without changing billing.",
  proposedSolution: "A guided setup flow.",
  userJourneys: "An owner completes the guided flow.",
  functionalRequirements: ["Show setup steps."],
  nonFunctionalRequirements: ["Support keyboard navigation."],
  uxStatesAndEdgeCases: ["Resume interrupted setup."],
  dependenciesAndConstraints: ["Role metadata is required."],
  risksAndMitigations: [
    { risk: "Too many steps", mitigation: "Measure abandonment." },
  ],
  mvpScope: { included: ["Setup checklist"], excluded: ["Billing"] },
  acceptanceCriteria: ["Owners can complete setup."],
  openQuestions: ["Who owns completion?"],
  decisionHistory: [
    {
      decision: "Start with owners.",
      rationale: "They are the blocked cohort.",
      sourceMessageIds: [MESSAGE_ID],
    },
  ],
};

describe("provider task result validation", () => {
  it("validates PRD output for prd_generate", () => {
    expect(validateTaskResult(PRD_RESULT, MANIFEST, "prd_generate")).toEqual({
      ok: true,
      result: PRD_RESULT,
    });
  });

  it("rejects malformed PRD output", () => {
    expect(
      validateTaskResult({ title: "Incomplete" }, MANIFEST, "prd_generate"),
    ).toEqual({ ok: false, code: "malformed_output" });
  });

  it("rejects PRD decision sources outside the frozen context", () => {
    expect(
      validateTaskResult(
        {
          ...PRD_RESULT,
          decisionHistory: [
            { ...PRD_RESULT.decisionHistory[0], sourceMessageIds: [OUTSIDE_ID] },
          ],
        },
        MANIFEST,
        "prd_generate",
      ),
    ).toEqual({ ok: false, code: "security_boundary_violated" });
  });

  it("keeps room_reply as the default validation behavior", () => {
    const roomReply = {
      response: "Start with the narrow onboarding test.",
      citedMessageIds: [MESSAGE_ID],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
    };

    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: true,
      result: roomReply,
    });
  });
});
