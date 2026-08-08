import { describe, expect, it } from "vitest";
import type { ContextManifest } from "../tasks/product-agent-prompt";
import { classifyProviderFailure, validateTaskResult } from "./provider-adapter";

const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const OUTSIDE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const MANIFEST: ContextManifest = {
  messageIds: new Set([MESSAGE_ID]),
  evidenceIds: new Set(),
  attachmentIds: new Set([ATTACHMENT_ID]),
  decisionIds: new Set(),
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
  it("classifies a rejected provider output schema as malformed output", () => {
    expect(
      classifyProviderFailure(
        "invalid_json_schema: response_format schema must have a type key",
      ),
    ).toBe("malformed_output");
  });

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

  it("validates a revised PRD identically to a generated one", () => {
    expect(validateTaskResult(PRD_RESULT, MANIFEST, "prd_revise")).toEqual({
      ok: true,
      result: PRD_RESULT,
    });
  });

  it("rejects revised PRD decision sources outside the frozen context", () => {
    expect(
      validateTaskResult(
        {
          ...PRD_RESULT,
          decisionHistory: [
            { ...PRD_RESULT.decisionHistory[0], sourceMessageIds: [OUTSIDE_ID] },
          ],
        },
        MANIFEST,
        "prd_revise",
      ),
    ).toEqual({ ok: false, code: "security_boundary_violated" });
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

  // Reviewing an attached brief is the canonical case: the reply schema has no
  // attachment-citation array, so the model cites the attachment's id in
  // citedEvidenceIds. That id is authorized content (it was in the frozen
  // context), so the reply must be accepted rather than rejected as a boundary
  // violation.
  it("accepts a citation of a provided attachment id", () => {
    const roomReply = {
      response: "Here is a breakdown of the brief.",
      citedMessageIds: [],
      citedEvidenceIds: [ATTACHMENT_ID],
      assumptions: [],
      suggestedNextQuestions: [],
    };

    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: true,
      result: roomReply,
    });
  });

  it("still rejects a citation of an id the context never contained", () => {
    const roomReply = {
      response: "Referring to something outside the room.",
      citedMessageIds: [],
      citedEvidenceIds: [OUTSIDE_ID],
      assumptions: [],
      suggestedNextQuestions: [],
    };

    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: false,
      code: "security_boundary_violated",
    });
  });
});
