import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedRepository: vi.fn(),
  createPrdRepository: vi.fn(),
  listRoomAiTaskStatuses: vi.fn(),
  roomHasPrd: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({
  getAuthenticatedRepository: mocks.getAuthenticatedRepository,
}));
vi.mock("@/features/prd/repository", () => ({
  createPrdRepository: mocks.createPrdRepository,
}));
vi.mock("@/features/ai/room-task-status", () => ({
  listRoomAiTaskStatuses: mocks.listRoomAiTaskStatuses,
}));

import { createSupabaseRoomBackend } from "./supabase-backend";

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const AUTHOR_A = "10000000-0000-4000-8000-000000000001";
const AUTHOR_B = "10000000-0000-4000-8000-000000000002";

type StubResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

function result(data: unknown, count?: number | null): StubResult {
  return { data, error: null, ...(count === undefined ? {} : { count }) };
}

function createSupabaseStub(input: {
  tableResults: Record<string, StubResult[]>;
  people: Array<{ user_id: string; email: string }>;
  members?: Array<{
    user_id: string;
    email: string;
    role?: "admin" | "member";
  }>;
}) {
  const calls: Array<{
    table: string;
    select?: { columns: string; options?: Record<string, unknown> };
    eq: Array<[string, unknown]>;
    order: Array<[string, Record<string, unknown> | undefined]>;
    limit?: number;
    range?: [number, number];
  }> = [];
  const rpc = vi.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name === "list_workspace_members") {
        return result(input.members ?? []);
      }
      if (name !== "list_room_people") {
        return { data: null, error: { message: `Unexpected RPC ${name}` } };
      }
      const requested = new Set(args.target_user_ids as string[]);
      return result(
        input.people.filter((person) => requested.has(person.user_id)),
      );
    },
  );
  const from = vi.fn((table: string) => {
    const next = input.tableResults[table]?.shift();
    if (!next) throw new Error(`Missing result for ${table}`);
    const call = { table, eq: [], order: [] } as (typeof calls)[number];
    calls.push(call);
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(
      (columns: string, options?: Record<string, unknown>) => {
        call.select = { columns, options };
        return builder;
      },
    );
    builder.eq = vi.fn((column: string, value: unknown) => {
      call.eq.push([column, value]);
      return builder;
    });
    builder.order = vi.fn(
      (column: string, options?: Record<string, unknown>) => {
        call.order.push([column, options]);
        return builder;
      },
    );
    builder.limit = vi.fn((limit: number) => {
      call.limit = limit;
      return builder;
    });
    builder.range = vi.fn((fromIndex: number, toIndex: number) => {
      call.range = [fromIndex, toIndex];
      return builder;
    });
    builder.maybeSingle = vi.fn(async () => next);
    builder.then = (
      onFulfilled: (value: StubResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(next).then(onFulfilled, onRejected);
    return builder;
  });
  const supabase = {
    from,
    rpc,
    storage: { from: vi.fn() },
  };
  return { supabase, calls, from, rpc };
}

function decisionRow(index: number, authorId = AUTHOR_A) {
  return {
    id: `40000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    source_message_id: null,
    summary: `Decision ${index}`,
    created_by: authorId,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createPrdRepository.mockReturnValue({
    roomHasPrd: mocks.roomHasPrd,
  });
});

describe("createSupabaseRoomBackend decision reads", () => {
  it("paginates beyond the PostgREST cap and scopes every page to the room", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) =>
      decisionRow(index + 1, index % 2 === 0 ? AUTHOR_A : AUTHOR_B),
    );
    const fake = createSupabaseStub({
      tableResults: {
        rooms: [
          result({ workspace_id: WORKSPACE_ID }),
        ],
        decisions: [result(rows.slice(0, 1000)), result(rows.slice(1000))],
      },
      people: [
        { user_id: AUTHOR_A, email: "ada@example.com" },
        { user_id: AUTHOR_B, email: "maya@example.com" },
      ],
    });
    mocks.getAuthenticatedRepository.mockResolvedValue({
      supabase: fake.supabase,
      user: { id: AUTHOR_A },
      repository: {},
    });
    const backend = await createSupabaseRoomBackend();

    const decisions = await backend.listRoomDecisions(ROOM_ID);

    expect(decisions).toHaveLength(1001);
    expect(decisions[0]?.summary).toBe("Decision 1");
    expect(decisions.at(-1)?.summary).toBe("Decision 1001");
    const decisionCalls = fake.calls.filter(
      (call) => call.table === "decisions",
    );
    expect(decisionCalls.map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(
      decisionCalls.every((call) =>
        call.eq.some(
          ([column, value]) => column === "room_id" && value === ROOM_ID,
        ),
      ),
    ).toBe(true);
    expect(fake.rpc).toHaveBeenCalledWith("list_room_people", {
      target_room_id: ROOM_ID,
      target_user_ids: [AUTHOR_A, AUTHOR_B],
    });
  });
});

describe("createSupabaseRoomBackend overview reads", () => {
  function overviewBackend(prdCount: number) {
    const recentDecisions = [
      {
        ...decisionRow(3, AUTHOR_B),
        created_at: "2026-08-10T12:00:00.000Z",
      },
      {
        ...decisionRow(2, AUTHOR_A),
        created_at: "2026-08-09T12:00:00.000Z",
      },
      {
        ...decisionRow(1, AUTHOR_A),
        created_at: "2026-08-08T12:00:00.000Z",
      },
    ];
    const fake = createSupabaseStub({
      tableResults: {
        rooms: [
          result({
            workspace_id: WORKSPACE_ID,
            stage: "design",
            created_at: "2026-08-01T09:00:00.000Z",
            updated_at: "2026-08-03T09:00:00.000Z",
          }),
        ],
        room_participants: [
          result([
            { user_id: AUTHOR_B, access: "view", created_at: "2026-08-02" },
            { user_id: AUTHOR_A, access: "edit", created_at: "2026-08-01" },
          ]),
          result(null, 2),
        ],
        messages: [result([{ created_at: "2026-08-05T09:00:00.000Z" }])],
        room_stage_events: [
          result([{ created_at: "2026-08-06T09:00:00.000Z" }]),
        ],
        user_flows: [
          result(null, 1),
          result([{ created_at: "2026-08-07T09:00:00.000Z" }]),
        ],
        prds: [
          result(null, prdCount),
          result(
            prdCount > 0
              ? [
                  {
                    created_at: "2026-08-08T09:00:00.000Z",
                    updated_at: "2026-08-12T09:00:00.000Z",
                  },
                ]
              : [],
          ),
        ],
        decisions: [result(null, 1005), result(recentDecisions)],
      },
      people: [
        { user_id: AUTHOR_A, email: "ada@example.com" },
        { user_id: AUTHOR_B, email: "maya@example.com" },
      ],
    });
    mocks.getAuthenticatedRepository.mockResolvedValue({
      supabase: fake.supabase,
      user: { id: AUTHOR_A },
      repository: {},
    });
    return { fake, recentDecisions };
  }

  it("uses exact counts, logical PRD presence, and a separate newest-three query", async () => {
    const { fake } = overviewBackend(7);
    const backend = await createSupabaseRoomBackend();

    const overview = await backend.getRoomOverview(ROOM_ID);

    expect(overview).toMatchObject({
      stage: "design",
      latestActivityAt: "2026-08-12T09:00:00.000Z",
      participantCount: 2,
      participants: [
        { userId: AUTHOR_A, email: "ada@example.com", access: "edit" },
        { userId: AUTHOR_B, email: "maya@example.com", access: "view" },
      ],
      counts: { userFlows: 1, prds: 1, decisions: 1005 },
    });
    expect(overview.recentDecisions.map(({ summary }) => summary)).toEqual([
      "Decision 3",
      "Decision 2",
      "Decision 1",
    ]);
    const decisionCalls = fake.calls.filter(
      (call) => call.table === "decisions",
    );
    expect(decisionCalls).toHaveLength(2);
    expect(decisionCalls[0]?.select?.options).toMatchObject({
      count: "exact",
      head: true,
    });
    expect(decisionCalls[1]?.limit).toBe(3);
    expect(decisionCalls[1]?.order).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(
      fake.calls
        .filter((call) => call.table !== "rooms")
        .every((call) =>
          call.eq.some(
            ([column, value]) => column === "room_id" && value === ROOM_ID,
          ),
        ),
    ).toBe(true);
    expect(mocks.listRoomAiTaskStatuses).not.toHaveBeenCalled();
    expect(mocks.roomHasPrd).not.toHaveBeenCalled();
  });

  it("reports zero PRDs when no version exists", async () => {
    overviewBackend(0);
    const backend = await createSupabaseRoomBackend();

    await expect(backend.getRoomOverview(ROOM_ID)).resolves.toMatchObject({
      counts: { prds: 0 },
    });
  });
});

// getRoomPageData produces the surfaceState every tab in the product depends
// on, and it was reachable only through the fake backend. Three mappings on the
// real path had nothing pinning them.
describe("createSupabaseRoomBackend page data", () => {
  function pageBackend(input: {
    userFlowRow?: unknown;
    decisionCount: number | null;
    taskStatuses?: Array<{
      taskId: string;
      kind: string;
      status: string;
    }>;
  }) {
    const listMessages = vi.fn(async () => []);
    const fake = createSupabaseStub({
      tableResults: {
        rooms: [
          result({
            id: ROOM_ID,
            workspace_id: WORKSPACE_ID,
            project_id: "70000000-0000-4000-8000-000000000007",
            name: "Customer interviews",
            owner_id: AUTHOR_A,
            stage: "design",
            created_at: "2026-08-01T09:00:00.000Z",
            updated_at: "2026-08-03T09:00:00.000Z",
          }),
        ],
        user_flows: [result(input.userFlowRow ?? null)],
        decisions: [result(null, input.decisionCount)],
        room_participants: [
          result([
            { room_id: ROOM_ID, user_id: AUTHOR_A, access: "edit" },
          ]),
        ],
      },
      people: [],
      members: [
        { user_id: AUTHOR_A, email: "ada@example.com", role: "admin" },
      ],
    });
    mocks.getAuthenticatedRepository.mockResolvedValue({
      supabase: fake.supabase,
      user: { id: AUTHOR_A, email: "ada@example.com", user_metadata: {} },
      repository: { listMessages },
    });
    mocks.roomHasPrd.mockResolvedValue(false);
    mocks.listRoomAiTaskStatuses.mockResolvedValue(input.taskStatuses ?? []);
    return { fake, listMessages };
  }

  it("maps user flow presence, decision count, and active PRD tasks", async () => {
    const { listMessages } = pageBackend({
      userFlowRow: { room_id: ROOM_ID },
      decisionCount: 4,
      taskStatuses: [
        // Only a live prd_generate opens the PRD surface; a settled one does
        // not, and no other kind ever does.
        { taskId: "task-running", kind: "prd_generate", status: "running" },
        { taskId: "task-done", kind: "prd_generate", status: "completed" },
        { taskId: "task-gone", kind: "prd_generate", status: "cancelled" },
        {
          taskId: "task-flow",
          kind: "user_flow_generate",
          status: "running",
        },
      ],
    });
    const backend = await createSupabaseRoomBackend();

    const page = await backend.getRoomPageData({
      roomId: ROOM_ID,
      workspaceId: WORKSPACE_ID,
      requestedSurface: "decisions",
    });

    expect(page?.surfaceState).toEqual({
      hasUserFlow: true,
      hasPrd: false,
      hasPrdTask: true,
      decisionCount: 4,
    });
    expect(page?.activePrdTaskIds).toEqual(["task-running"]);
    expect(page?.hasUserFlow).toBe(true);
    // The resolved surface is not the conversation, so the message read is
    // skipped rather than paid for a panel that will not render it.
    expect(listMessages).not.toHaveBeenCalled();
    expect(page?.messages).toEqual([]);
  });

  // A null count from the `head: true` query silently means "no decisions",
  // which removes the Decisions tab and rewrites the reader's URL to
  // `?tab=conversation` if that was the tab they asked for.
  it("treats an absent decision count as no decisions", async () => {
    const { listMessages } = pageBackend({ decisionCount: null });
    const backend = await createSupabaseRoomBackend();

    const page = await backend.getRoomPageData({
      roomId: ROOM_ID,
      workspaceId: WORKSPACE_ID,
      requestedSurface: "decisions",
    });

    expect(page?.surfaceState).toEqual({
      hasUserFlow: false,
      hasPrd: false,
      hasPrdTask: false,
      decisionCount: 0,
    });
    // Nothing else exists, so the Room falls back to its conversation and the
    // messages are read after all.
    expect(listMessages).toHaveBeenCalledExactlyOnceWith(ROOM_ID);
  });
});
