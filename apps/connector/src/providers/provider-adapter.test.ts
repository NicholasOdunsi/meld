import { describe, expect, it } from "vitest";
import type { ContextManifest } from "../tasks/product-agent-prompt";
import {
  classifyProviderFailure,
  extractTrailingProposedAction,
  fallbackRoomReplyFromProse,
  validateTaskResult,
} from "./provider-adapter";

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
  userJourneys: {
    title: "Owner guided setup",
    summary: "An owner completes the guided flow.",
    nodes: [
      { id: "start", kind: "start" as const, label: "Open setup", detail: null },
      { id: "done", kind: "end" as const, label: "Activated", detail: null },
    ],
    edges: [{ id: "e1", from: "start", to: "done", label: null }],
    openQuestions: [],
  },
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

const FLOW_RESULT = {
  title: "Guided onboarding",
  summary: "A workspace owner completes setup.",
  nodes: [
    { id: "start", kind: "start" as const, label: "Setup opened", detail: null },
    { id: "done", kind: "end" as const, label: "Setup completed", detail: null },
  ],
  edges: [{ id: "e1", from: "start", to: "done", label: null }],
  openQuestions: [],
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

  it("validates connected user-flow output and rejects disconnected output", () => {
    expect(validateTaskResult(FLOW_RESULT, MANIFEST, "user_flow_generate")).toEqual({
      ok: true,
      result: FLOW_RESULT,
    });
    expect(validateTaskResult(
      { ...FLOW_RESULT, edges: [] },
      MANIFEST,
      "user_flow_generate",
    )).toEqual({ ok: false, code: "malformed_output" });
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
      webSources: [],
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
      webSources: [],
    };

    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: true,
      result: roomReply,
    });
  });

  // The adapter has no selection scope, so it holds the assist result to what it
  // can see: a well-formed envelope citing only ids the task was actually shown.
  // Whether a proposal is allowed, and which field it may target, is re-decided
  // by the executor against the frozen scope.
  it("validates a section-assist envelope and its citations", () => {
    const assist = {
      answer: "The goals section already commits to activation.",
      proposal: null,
      clarifyingQuestion: null,
      citedMessageIds: [MESSAGE_ID],
      citedEvidenceIds: [ATTACHMENT_ID],
      assumptions: [],
      suggestedNextQuestions: [],
    };

    expect(
      validateTaskResult(assist, MANIFEST, "prd_section_assist"),
    ).toEqual({ ok: true, result: assist });

    expect(
      validateTaskResult(
        { ...assist, citedMessageIds: [OUTSIDE_ID] },
        MANIFEST,
        "prd_section_assist",
      ),
    ).toEqual({ ok: false, code: "security_boundary_violated" });

    // An omitted key is the value the model would have sent, so a result that
    // fills only the slot it used is a good one, not a malformed one.
    expect(
      validateTaskResult(
        { answer: "Missing every other key." },
        MANIFEST,
        "prd_section_assist",
      ),
    ).toEqual({
      ok: true,
      result: {
        answer: "Missing every other key.",
        proposal: null,
        clarifyingQuestion: null,
        citedMessageIds: [],
        citedEvidenceIds: [],
        assumptions: [],
        suggestedNextQuestions: [],
      },
    });

    // A default fills an absent key; it never rescues a present but wrong one.
    expect(
      validateTaskResult(
        { ...assist, citedMessageIds: "not-a-list" },
        MANIFEST,
        "prd_section_assist",
      ),
    ).toEqual({ ok: false, code: "malformed_output" });
  });

  // The connector's acceptance set has to be exactly the database's.
  // `settlement_room_proposed_action` binds a decision_capture source to the
  // task's frozen `context_manifest_json -> 'messageIds'` and returns null
  // otherwise, keeping the reply. A well-formed UUID that is simply not in the
  // manifest -- the model copying an evidence or decision id that sat right
  // beside the message ids in its prompt -- used to sail through the connector
  // untouched, and then vanished at settlement: the reply posted with no
  // button, no error, and nothing reported.
  it("drops a decision proposal whose source is outside the frozen manifest", () => {
    const roomReply = {
      response: "Noting that as a decision.",
      citedMessageIds: [MESSAGE_ID],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      webSources: [],
      proposedAction: {
        kind: "decision_capture",
        summary: "Ship the narrow onboarding test first.",
        sourceMessageId: OUTSIDE_ID,
      },
    };

    // Dropped, not escalated: `security_boundary_violated` would cost the user
    // the whole answer over a citation the database merely ignores.
    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: true,
      result: { ...roomReply, proposedAction: null },
    });
  });

  it("keeps a decision proposal whose source is in the frozen manifest", () => {
    const roomReply = {
      response: "Noting that as a decision.",
      citedMessageIds: [],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      webSources: [],
      proposedAction: {
        kind: "decision_capture",
        summary: "Ship the narrow onboarding test first.",
        sourceMessageId: MESSAGE_ID,
      },
    };

    expect(validateTaskResult(roomReply, MANIFEST)).toEqual({
      ok: true,
      result: roomReply,
    });

    // A null source is a Decision with no message behind it, which the
    // database accepts as-is.
    const unsourced = {
      ...roomReply,
      proposedAction: { ...roomReply.proposedAction, sourceMessageId: null },
    };
    expect(validateTaskResult(unsourced, MANIFEST)).toEqual({
      ok: true,
      result: unsourced,
    });
  });

  // SQL, handed the same payload, posts the reply and nulls only the proposal.
  // Failing the whole parse means `malformed_output`, `needs_review`, and no
  // message at all. The model-facing schema constrains `sourceMessageId` only
  // as `{"type":"string"}` with no format, so a non-UUID id is realistic.
  it("keeps the reply when only the proposed action fails to parse", () => {
    const roomReply = {
      response: "Here is the summary you asked for.",
      citedMessageIds: [MESSAGE_ID],
      citedEvidenceIds: [],
      assumptions: [],
      suggestedNextQuestions: [],
      webSources: [],
    };

    for (const badAction of [
      { kind: "decision_capture", summary: "Ship it.", sourceMessageId: "msg-4" },
      { kind: "decision_capture", sourceMessageId: null },
      { kind: "task_create", summary: "Do the thing." },
      { kind: "prd_generate", extra: "not allowed" },
      "prd_generate",
    ]) {
      expect(
        validateTaskResult({ ...roomReply, proposedAction: badAction }, MANIFEST),
      ).toEqual({ ok: true, result: { ...roomReply, proposedAction: null } });
    }
  });

  // Dropping the proposal is a rescue for one bad field, not a way to launder
  // a reply that is malformed in its own right.
  it("still reports malformed output when the reply itself is invalid", () => {
    expect(
      validateTaskResult(
        {
          response: "",
          proposedAction: { kind: "decision_capture", summary: "x" },
        },
        MANIFEST,
      ),
    ).toEqual({ ok: false, code: "malformed_output" });
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

describe("extractTrailingProposedAction", () => {
  it("recovers a trailing prd_generate marker and strips it from the prose", () => {
    expect(
      extractTrailingProposedAction(
        'Want me to generate it now?\n{"kind": "prd_generate"}',
      ),
    ).toEqual({
      response: "Want me to generate it now?",
      proposedAction: { kind: "prd_generate" },
    });
  });

  it("recovers a trailing prd_revise marker", () => {
    expect(
      extractTrailingProposedAction('Shall I update it?\n\n{"kind":"prd_revise"}'),
    ).toEqual({
      response: "Shall I update it?",
      proposedAction: { kind: "prd_revise" },
    });
  });

  it("recovers user-flow and complete decision markers", () => {
    expect(
      extractTrailingProposedAction(
        'I can map that journey.\n{"kind":"user_flow_generate"}',
      ).proposedAction,
    ).toEqual({ kind: "user_flow_generate" });

    expect(
      extractTrailingProposedAction(
        'That is explicit.\n{"kind":"decision_capture","summary":"Keep recovery codes single-use.","sourceMessageId":"40000000-0000-4000-8000-000000000001"}',
      ).proposedAction,
    ).toEqual({
      kind: "decision_capture",
      summary: "Keep recovery codes single-use.",
      sourceMessageId: "40000000-0000-4000-8000-000000000001",
    });
  });

  it("leaves prose untouched when there is no trailing marker", () => {
    expect(extractTrailingProposedAction("Just a normal reply.")).toEqual({
      response: "Just a normal reply.",
      proposedAction: null,
    });
  });

  it("ignores a marker that is not at the end of the prose", () => {
    const prose = '{"kind": "prd_generate"} and then more discussion follows.';
    expect(extractTrailingProposedAction(prose)).toEqual({
      response: prose,
      proposedAction: null,
    });
  });

  it("ignores a trailing object with an unknown kind or extra keys", () => {
    const unknownKind = 'Reply.\n{"kind": "delete_everything"}';
    expect(extractTrailingProposedAction(unknownKind)).toEqual({
      response: unknownKind,
      proposedAction: null,
    });

    const extraKeys = 'Reply.\n{"kind": "prd_generate", "force": true}';
    expect(extractTrailingProposedAction(extraKeys)).toEqual({
      response: extraKeys,
      proposedAction: null,
    });

    const crossKind =
      'Reply.\n{"kind":"user_flow_generate","summary":"not allowed"}';
    expect(extractTrailingProposedAction(crossKind)).toEqual({
      response: crossKind,
      proposedAction: null,
    });
  });

  it("ignores a trailing brace run that is not valid JSON", () => {
    const prose = "Reply mentioning { not json }";
    expect(extractTrailingProposedAction(prose)).toEqual({
      response: prose,
      proposedAction: null,
    });
  });
});

describe("fallbackRoomReplyFromProse proposed action recovery", () => {
  it("promotes an inline prd_generate marker into the structured action", () => {
    const fallback = fallbackRoomReplyFromProse(
      ['The PRD is ready to draft.\n{"kind": "prd_generate"}'],
      MANIFEST,
    );
    expect(fallback?.response).toBe("The PRD is ready to draft.");
    expect(fallback?.proposedAction).toEqual({ kind: "prd_generate" });
  });

  it("returns no fallback when the prose is only a marker", () => {
    expect(
      fallbackRoomReplyFromProse(['{"kind": "prd_generate"}'], MANIFEST),
    ).toBeUndefined();
  });

  it("leaves proposedAction null when there is no marker", () => {
    const fallback = fallbackRoomReplyFromProse(
      ["A complete answer with no action."],
      MANIFEST,
    );
    expect(fallback?.response).toBe("A complete answer with no action.");
    expect(fallback?.proposedAction ?? null).toBeNull();
  });
});
