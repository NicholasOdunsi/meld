import type { PRDDocument } from "@meld/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createPrdRepository,
  InvalidPrdDocumentError,
  PrdAcceptForbiddenError,
  PrdAlreadyAcceptedError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";
import { prdAssistOutcome } from "./prd-assist-outcome";
import { RoomPrdSchema } from "./schemas";

const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000001";

const dbRow = {
  id: "00000000-0000-4000-8000-000000000001",
  room_id: ROOM_ID,
  version: 2,
  status: "draft",
  document: {
    title: "Checkout redesign", executiveSummary: "", problemAndEvidence: "",
    targetUsersAndUseCases: "", goalsNonGoalsAndMetrics: "", proposedSolution: "",
    userJourneys: null, functionalRequirements: [], nonFunctionalRequirements: [],
    uxStatesAndEdgeCases: [], dependenciesAndConstraints: [], risksAndMitigations: [],
    mvpScope: { included: [], excluded: [] }, acceptanceCriteria: [], openQuestions: [],
    decisionHistory: [] },
  owner_id: USER_ID,
  created_by: USER_ID,
  accepted_at: null,
  accepted_by: null,
  created_at: "2026-08-02T10:35:00.000Z",
  updated_at: "2026-08-02T10:35:00.000Z",
};

function fakeSupabase(options: {
  current?: unknown;
  history?: unknown[];
  count?: number | null;
  countError?: unknown;
  rpcResult?: { data: unknown; error: unknown };
}) {
  const rpc = vi.fn().mockResolvedValue(
    options.rpcResult ?? { data: null, error: null },
  );
  const queryResult = {
    data: options.history ?? [],
    error: null,
  };
  const countResult = {
    count: options.count ?? 0,
    error: options.countError ?? null,
  };
  // Every filter the repository applied, so a test can prove a read was
  // scoped rather than trusting the row it was handed back.
  const filters: Array<[string, unknown]> = [];
  const queryBuilder = {
    select: (_columns: string, selectOptions?: unknown) =>
      selectOptions ? countBuilder : queryBuilder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return queryBuilder;
    },
    in: (column: string, values: unknown) => {
      filters.push([column, values]);
      return queryBuilder;
    },
    order: () => queryBuilder,
    limit: () => queryBuilder,
    maybeSingle: async () => ({ data: options.current ?? null, error: null }),
    then: <TResult1 = typeof queryResult, TResult2 = never>(
      onfulfilled?: ((value: typeof queryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(queryResult).then(onfulfilled, onrejected),
  };
  const countBuilder = {
    eq: async () => countResult,
  };
  return {
    supabase: { from: () => queryBuilder, rpc } as never,
    rpc,
    filters,
  };
}

describe("createPrdRepository.getRoomPrd", () => {
  it("returns the latest PRD parsed through the contract", async () => {
    const fake = fakeSupabase({ current: dbRow });
    const prd = await createPrdRepository(fake.supabase).getRoomPrd(ROOM_ID);
    expect(prd?.version).toBe(2);
    expect(prd?.document.title).toBe("Checkout redesign");
    expect(prd?.createdBy).toBe(USER_ID);
    expect(prd?.acceptedAt).toBeNull();
    expect(prd?.acceptedBy).toBeNull();
  });

  it("returns null when the room has no PRD", async () => {
    const fake = fakeSupabase({});
    await expect(
      createPrdRepository(fake.supabase).getRoomPrd(ROOM_ID),
    ).resolves.toBeNull();
  });
});

describe("createPrdRepository.getRoomPrdHistory", () => {
  it("parses accepted audit metadata from history rows", async () => {
    const acceptedDbRow = {
      ...dbRow,
      status: "accepted",
      accepted_at: "2026-08-03T10:35:00.000Z",
      accepted_by: "20000000-0000-4000-8000-000000000001",
    };
    const fake = fakeSupabase({ history: [acceptedDbRow] });

    const history = await createPrdRepository(
      fake.supabase,
    ).getRoomPrdHistory(ROOM_ID);

    expect(history[0]).toMatchObject({
      status: "accepted",
      createdBy: USER_ID,
      acceptedBy: acceptedDbRow.accepted_by,
      acceptedAt: acceptedDbRow.accepted_at,
    });
  });
});

describe("RoomPrdSchema audit metadata", () => {
  it("requires creator metadata and explicit nullable acceptance fields", () => {
    const base = {
      id: dbRow.id,
      roomId: dbRow.room_id,
      version: dbRow.version,
      status: dbRow.status,
      document: dbRow.document,
      ownerId: dbRow.owner_id,
      createdAt: dbRow.created_at,
      updatedAt: dbRow.updated_at,
    };
    expect(
      RoomPrdSchema.safeParse({
        ...base,
        createdBy: dbRow.created_by,
        acceptedAt: null,
        acceptedBy: null,
      }).success,
    ).toBe(true);
    expect(RoomPrdSchema.safeParse(base).success).toBe(false);
  });
});

describe("createPrdRepository PRD assist requests", () => {
  const REQUEST_ID = "80000000-0000-4000-8000-000000000001";
  const TASK_ID = "70000000-0000-4000-8000-000000000001";
  const PROPOSAL_ID = "60000000-0000-4000-8000-000000000001";

  // A settled request with every nullable column at null and every array
  // empty -- the shape the database actually returns for an unsettled row.
  const assistRow = {
    id: REQUEST_ID,
    room_id: ROOM_ID,
    task_id: TASK_ID,
    client_request_id: "90000000-0000-4000-8000-000000000001",
    base_prd_id: dbRow.id,
    base_version: 2,
    selected_sections: [
      {
        field: "executiveSummary",
        label: "Executive summary",
        quotedText: "Reduce checkout friction.",
      },
      {
        field: "mvpScope",
        label: "MVP scope",
        quotedText: "Mobile checkout summary",
      },
    ],
    instruction: "Why did we choose this?",
    can_propose_edit: true,
    status: "pending",
    answer: null,
    clarifying_question: null,
    cited_message_ids: [],
    cited_evidence_ids: [],
    assumptions: [],
    suggested_next_questions: [],
    proposal_id: null,
    proposal_error_code: null,
    error_code: null,
    question_message_id: null,
    answer_message_id: null,
    created_by: USER_ID,
    created_at: "2026-08-08T10:00:00.000Z",
    updated_at: "2026-08-08T10:00:00.000Z",
    settled_at: null,
    task: { provider: "codex", status: "running" },
  };

  it("maps a pending request, keeping every nullable column null", async () => {
    const fake = fakeSupabase({ current: assistRow });

    const request = await createPrdRepository(fake.supabase).getPrdAssistRequest({
      roomId: ROOM_ID,
      requestId: REQUEST_ID,
    });

    expect(request).toEqual({
      id: REQUEST_ID,
      roomId: ROOM_ID,
      taskId: TASK_ID,
      clientRequestId: assistRow.client_request_id,
      basePrdId: dbRow.id,
      baseVersion: 2,
      selectedSections: assistRow.selected_sections,
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
      taskStatus: "running",
      createdBy: USER_ID,
      createdAt: assistRow.created_at,
      updatedAt: assistRow.updated_at,
      settledAt: null,
    });
    expect(prdAssistOutcome(request!)).toBe("pending");
  });

  it.each([
    [
      "answer",
      {
        status: "ready",
        answer: "We chose it for the smaller blast radius.",
        question_message_id: "20000000-0000-4000-8000-000000000001",
        answer_message_id: "20000000-0000-4000-8000-000000000002",
        cited_message_ids: ["20000000-0000-4000-8000-000000000003"],
        cited_evidence_ids: ["30000000-0000-4000-8000-000000000001"],
        assumptions: ["The payments provider does not change."],
        suggested_next_questions: ["Should we test this on mobile first?"],
      },
    ],
    ["edit", { status: "ready", proposal_id: PROPOSAL_ID }],
    [
      "answer_and_edit",
      {
        status: "ready",
        answer: "Here is the rationale, and a tighter wording.",
        proposal_id: PROPOSAL_ID,
      },
    ],
    [
      "clarification",
      {
        status: "ready",
        clarifying_question: "Which section should I change first?",
      },
    ],
    [
      "failed",
      {
        status: "failed",
        error_code: "provider_unavailable",
        task: { provider: "claude", status: "failed" },
      },
    ],
    [
      "failed",
      {
        status: "ready",
        proposal_error_code: "section_has_active_proposal",
      },
    ],
  ])("maps a settled row to the %s outcome", async (outcome, overrides) => {
    const row = {
      ...assistRow,
      task: { provider: "codex", status: "completed" },
      settled_at: "2026-08-08T10:01:00.000Z",
      ...overrides,
    };
    const fake = fakeSupabase({ current: row });

    const request = await createPrdRepository(fake.supabase).getPrdAssistRequest({
      roomId: ROOM_ID,
      requestId: REQUEST_ID,
    });

    expect(request).toMatchObject({
      status: row.status,
      answer: row.answer,
      clarifyingQuestion: row.clarifying_question,
      proposalId: row.proposal_id,
      proposalErrorCode: row.proposal_error_code,
      errorCode: row.error_code,
      citedMessageIds: row.cited_message_ids,
      citedEvidenceIds: row.cited_evidence_ids,
      assumptions: row.assumptions,
      suggestedNextQuestions: row.suggested_next_questions,
      questionMessageId: row.question_message_id,
      answerMessageId: row.answer_message_id,
      settledAt: "2026-08-08T10:01:00.000Z",
    });
    expect(prdAssistOutcome(request!)).toBe(outcome);
  });

  it("scopes the read to the room and rejects a request from another room", async () => {
    const fake = fakeSupabase({ current: assistRow });
    await createPrdRepository(fake.supabase).getPrdAssistRequest({
      roomId: ROOM_ID,
      requestId: REQUEST_ID,
    });
    expect(fake.filters).toEqual(
      expect.arrayContaining([
        ["id", REQUEST_ID],
        ["room_id", ROOM_ID],
      ]),
    );

    const foreign = fakeSupabase({
      current: {
        ...assistRow,
        room_id: "40000000-0000-4000-8000-000000000002",
      },
    });
    await expect(
      createPrdRepository(foreign.supabase).getPrdAssistRequest({
        roomId: ROOM_ID,
        requestId: REQUEST_ID,
      }),
    ).resolves.toBeNull();
  });

  it("returns null when the request does not exist", async () => {
    await expect(
      createPrdRepository(fakeSupabase({}).supabase).getPrdAssistRequest({
        roomId: ROOM_ID,
        requestId: REQUEST_ID,
      }),
    ).resolves.toBeNull();
  });

  it("lists only the caller's own recoverable requests for the room", async () => {
    const fake = fakeSupabase({ history: [assistRow] });

    const requests = await createPrdRepository(
      fake.supabase,
    ).listRoomPrdAssistRequests({ roomId: ROOM_ID, createdBy: USER_ID });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ id: REQUEST_ID, taskStatus: "running" });
    expect(fake.filters).toEqual([
      ["room_id", ROOM_ID],
      ["created_by", USER_ID],
      ["status", ["pending", "ready", "failed"]],
    ]);
  });
});

describe("createPrdRepository.roomHasPrd", () => {
  it("returns true when the room has at least one PRD", async () => {
    const fake = fakeSupabase({ count: 3 });
    await expect(
      createPrdRepository(fake.supabase).roomHasPrd(ROOM_ID),
    ).resolves.toBe(true);
  });

  it("returns false when the count is zero or null", async () => {
    await expect(
      createPrdRepository(fakeSupabase({ count: 0 }).supabase).roomHasPrd(
        ROOM_ID,
      ),
    ).resolves.toBe(false);
    await expect(
      createPrdRepository(fakeSupabase({ count: null }).supabase).roomHasPrd(
        ROOM_ID,
      ),
    ).resolves.toBe(false);
  });

  it("throws when the query errors", async () => {
    await expect(
      createPrdRepository(
        fakeSupabase({ countError: { message: "boom" } }).supabase,
      ).roomHasPrd(ROOM_ID),
    ).rejects.toThrow("Could not check for a PRD.");
  });
});

describe("createPrdRepository version persistence", () => {
  it("saves through the version RPC and parses its complete row", async () => {
    const savedRow = { ...dbRow, id: "00000000-0000-4000-8000-000000000002", version: 3 };
    const fake = fakeSupabase({ rpcResult: { data: savedRow, error: null } });

    const prd = await createPrdRepository(fake.supabase).saveRoomPrdVersion({
      roomId: ROOM_ID,
      baseVersion: 2,
      document: dbRow.document as PRDDocument,
    });

    expect(prd).toMatchObject({ id: savedRow.id, version: 3, createdBy: USER_ID });
    expect(fake.rpc).toHaveBeenCalledWith("save_prd_version", {
      target_room_id: ROOM_ID,
      base_version: 2,
      next_document: dbRow.document,
    });
  });

  it("preserves task metadata when the discard RPC returns a proposal row", async () => {
    const proposalRow = {
      id: "60000000-0000-4000-8000-000000000001",
      room_id: ROOM_ID,
      task_id: "70000000-0000-4000-8000-000000000001",
      base_prd_id: dbRow.id,
      base_version: 2,
      section_field: "executiveSummary",
      section_label: "Executive summary",
      instruction: "Make this clearer.",
      quoted_text: null,
      previous_value: dbRow.document.executiveSummary,
      proposed_value: null,
      status: "discarded",
      error_message: null,
      created_by: USER_ID,
      created_at: dbRow.created_at,
      updated_at: dbRow.updated_at,
      applied_at: null,
      discarded_at: dbRow.updated_at,
    };
    const fake = fakeSupabase({
      current: { ...proposalRow, task: { provider: "codex", error_message: null } },
      rpcResult: { data: proposalRow, error: null },
    });

    const proposal = await createPrdRepository(fake.supabase).discardPrdProposal({
      roomId: ROOM_ID,
      proposalId: proposalRow.id,
    });

    expect(proposal).toMatchObject({
      id: proposalRow.id,
      status: "discarded",
      provider: "codex",
    });
    expect(fake.rpc).toHaveBeenCalledWith("discard_prd_proposal", {
      target_proposal_id: proposalRow.id,
    });
  });

  it("reloads the latest version before exposing a typed conflict", async () => {
    const fake = fakeSupabase({
      current: { ...dbRow, version: 4 },
      rpcResult: {
        data: null,
        error: { code: "P0001", message: "prd_version_conflict" },
      },
    });

    await expect(
      createPrdRepository(fake.supabase).saveRoomPrdVersion({
        roomId: ROOM_ID,
        baseVersion: 2,
        document: dbRow.document as PRDDocument,
      }),
    ).rejects.toMatchObject({
      name: "PrdVersionConflictError",
      currentVersion: 4,
    });
  });

  it.each([
    ["prd_edit_forbidden", PrdEditForbiddenError],
    ["invalid_prd_document", InvalidPrdDocumentError],
  ])("maps save RPC P0001 %s to its typed error", async (message, ErrorType) => {
    const fake = fakeSupabase({
      rpcResult: { data: null, error: { code: "P0001", message } },
    });

    await expect(
      createPrdRepository(fake.supabase).saveRoomPrdVersion({
        roomId: ROOM_ID,
        baseVersion: 2,
        document: dbRow.document as PRDDocument,
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it("accepts through the acceptance RPC and parses its complete row", async () => {
    const acceptedRow = {
      ...dbRow,
      status: "accepted",
      accepted_at: "2026-08-03T10:35:00.000Z",
      accepted_by: "20000000-0000-4000-8000-000000000001",
    };
    const fake = fakeSupabase({
      current: acceptedRow,
      rpcResult: { data: acceptedRow, error: null },
    });

    const prd = await createPrdRepository(fake.supabase).acceptRoomPrdVersion({
      roomId: ROOM_ID,
      prdId: acceptedRow.id,
    });

    expect(prd).toMatchObject({ status: "accepted", acceptedBy: acceptedRow.accepted_by });
    expect(fake.rpc).toHaveBeenCalledWith("accept_prd_version", {
      target_prd_id: acceptedRow.id,
    });
  });

  it("rejects an acceptance request scoped to a different room before its RPC", async () => {
    const fake = fakeSupabase({
      current: {
        ...dbRow,
        room_id: "40000000-0000-4000-8000-000000000002",
      },
      rpcResult: { data: dbRow, error: null },
    });

    await expect(
      createPrdRepository(fake.supabase).acceptRoomPrdVersion({
        roomId: ROOM_ID,
        prdId: dbRow.id,
      }),
    ).rejects.toBeInstanceOf(PrdAlreadyAcceptedError);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["prd_accept_forbidden", PrdAcceptForbiddenError],
    ["prd_already_accepted", PrdAlreadyAcceptedError],
  ])("maps acceptance RPC P0001 %s to its typed error", async (message, ErrorType) => {
    const fake = fakeSupabase({
      current: dbRow,
      rpcResult: { data: null, error: { code: "P0001", message } },
    });

    await expect(
      createPrdRepository(fake.supabase).acceptRoomPrdVersion({
        roomId: ROOM_ID,
        prdId: dbRow.id,
      }),
    ).rejects.toBeInstanceOf(ErrorType);
  });
});
