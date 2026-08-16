import { describe, expect, it } from "vitest";
import { prdAssistOutcome } from "./prd-assist-outcome";
import type { PrdAssistRequest } from "./schemas";

const REQUEST_ID = "80000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const TASK_ID = "70000000-0000-4000-8000-000000000001";
const PRD_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const PROPOSAL_ID = "60000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "20000000-0000-4000-8000-000000000001";

// A pending request, every result slot still empty. Each case below changes
// only the fields that outcome actually reads, so a test that passes for an
// unrelated reason is hard to write by accident.
const pending: PrdAssistRequest = {
  id: REQUEST_ID,
  roomId: ROOM_ID,
  taskId: TASK_ID,
  clientRequestId: "90000000-0000-4000-8000-000000000001",
  basePrdId: PRD_ID,
  baseVersion: 3,
  selectedSections: [
    {
      field: "executiveSummary",
      label: "Executive summary",
      quotedText: "Reduce checkout friction.",
    },
  ],
  instruction: "Why did we choose this?",
  canProposeEdit: true,
  status: "pending",
  answer: null,
  clarifyingQuestion: null,
  citedMessageIds: [],
  citedEvidenceIds: [],
  assumptions: [],
  suggestedNextQuestions: [],
  proposalId: null,
  proposalErrorCode: null,
  errorCode: null,
  questionMessageId: null,
  answerMessageId: null,
  provider: "codex",
  taskStatus: "queued",
  createdBy: USER_ID,
  createdAt: "2026-08-08T10:00:00.000Z",
  updatedAt: "2026-08-08T10:00:00.000Z",
  settledAt: null,
};

describe("prdAssistOutcome", () => {
  it("reads a request the model has not settled yet as pending", () => {
    expect(prdAssistOutcome(pending)).toBe("pending");
    expect(prdAssistOutcome({ ...pending, taskStatus: "running" })).toBe(
      "pending",
    );
  });

  it("names each settled outcome from the persisted result fields", () => {
    const settled = {
      ...pending,
      status: "ready" as const,
      taskStatus: "completed" as const,
      settledAt: "2026-08-08T10:01:00.000Z",
    };

    expect(
      prdAssistOutcome({
        ...settled,
        answer: "We chose it for the smaller blast radius.",
        questionMessageId: MESSAGE_ID,
        answerMessageId: "20000000-0000-4000-8000-000000000002",
      }),
    ).toBe("answer");
    expect(prdAssistOutcome({ ...settled, proposalId: PROPOSAL_ID })).toBe(
      "edit",
    );
    expect(
      prdAssistOutcome({
        ...settled,
        answer: "Here is the rationale.",
        proposalId: PROPOSAL_ID,
      }),
    ).toBe("answer_and_edit");
    expect(
      prdAssistOutcome({
        ...settled,
        clarifyingQuestion: "Which section should I change first?",
      }),
    ).toBe("clarification");
  });

  it("reads a failed task as failed and carries its public-safe code", () => {
    const failed = {
      ...pending,
      status: "failed" as const,
      taskStatus: "failed" as const,
      errorCode: "provider_unavailable" as const,
      settledAt: "2026-08-08T10:01:00.000Z",
    };

    expect(prdAssistOutcome(failed)).toBe("failed");
    expect(failed.errorCode).toBe("provider_unavailable");
  });

  // The retry window: resolve_ai_task('retry') sends the task back to
  // ready_to_run, but the request row keeps status = 'failed' and the previous
  // run's error_code until the new run settles. Reading the request alone would
  // show a permanent failure under a request that is genuinely in flight.
  it("reads a failed request whose task is running again as pending", () => {
    const retried = {
      ...pending,
      status: "failed" as const,
      errorCode: "usage_limit_reached" as const,
      settledAt: "2026-08-08T10:01:00.000Z",
    };

    expect(prdAssistOutcome({ ...retried, taskStatus: "ready_to_run" })).toBe(
      "pending",
    );
    expect(prdAssistOutcome({ ...retried, taskStatus: "running" })).toBe(
      "pending",
    );
    expect(prdAssistOutcome({ ...retried, taskStatus: "queued" })).toBe(
      "pending",
    );
    expect(
      prdAssistOutcome({ ...retried, taskStatus: "usage_limit_reached" }),
    ).toBe("failed");
  });

  it("reads a settled request that materialized nothing as failed", () => {
    // The one reachable case: an edit-only result whose target section already
    // had another active proposal. The edit half is refused with a public-safe
    // reason and there was no answer half to keep.
    expect(
      prdAssistOutcome({
        ...pending,
        status: "ready",
        taskStatus: "completed",
        proposalErrorCode: "section_has_active_proposal",
        settledAt: "2026-08-08T10:01:00.000Z",
      }),
    ).toBe("failed");
  });

  it("still names the outcome of a dismissed request", () => {
    expect(
      prdAssistOutcome({
        ...pending,
        status: "dismissed",
        taskStatus: "completed",
        answer: "We chose it for the smaller blast radius.",
        settledAt: "2026-08-08T10:01:00.000Z",
      }),
    ).toBe("answer");
  });
});
