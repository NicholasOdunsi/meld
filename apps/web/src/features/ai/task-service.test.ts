import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AIInstructionSchema,
  MAX_INSTRUCTION_CHARS,
} from "@meld/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizedRoomContextManifest,
  cancelAITask,
  createAITask,
  CreateAITaskInputSchema,
  createRoomReplyTask,
} from "./task-service";

const ROOM_ID = "10000000-0000-4000-8000-000000000001";
const DEVICE_ID = "20000000-0000-4000-8000-000000000002";
const MESSAGE_ID = "30000000-0000-4000-8000-000000000003";
const ATTACHMENT_ID = "40000000-0000-4000-8000-000000000004";
const EVIDENCE_ID = "50000000-0000-4000-8000-000000000005";
const DECISION_ID = "60000000-0000-4000-8000-000000000006";
const TASK_ID = "70000000-0000-4000-8000-000000000007";
const USER_ID = "80000000-0000-4000-8000-000000000008";
const WORKSPACE_ID = "90000000-0000-4000-8000-000000000009";

const TASK = {
  id: TASK_ID,
  initiatingUserId: USER_ID,
  workspaceId: WORKSPACE_ID,
  roomId: ROOM_ID,
  deviceId: DEVICE_ID,
  provider: "codex",
  kind: "room_reply",
  status: "queued",
  contextRevision: 0,
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
} as const;

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
};

function query(result: QueryResult) {
  const chain = {
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  return chain;
}

function manifestSupabase(
  overrides: Partial<Record<string, QueryResult>> = {},
) {
  const results: Record<string, QueryResult> = {
    messages: {
      data: [
        {
          id: MESSAGE_ID,
          body: "Validated interview text",
        },
      ],
      error: null,
    },
    attachments: {
      data: [
        {
          id: ATTACHMENT_ID,
          storage_path: `${ROOM_ID}/private.pdf`,
          signedUrl: "https://storage.example/private",
        },
      ],
      error: null,
    },
    evidence: { data: [{ id: EVIDENCE_ID }], error: null },
    decisions: { data: [{ id: DECISION_ID }], error: null },
    ...overrides,
  };
  const queries = Object.fromEntries(
    Object.entries(results).map(([table, result]) => [
      table,
      query(result),
    ]),
  ) as Record<string, ReturnType<typeof query>>;
  const from = vi.fn((table: string) => queries[table]);

  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    queries,
  };
}

describe("CreateAITaskInputSchema", () => {
  it("uses the canonical trimmed instruction boundary", () => {
    expect(CreateAITaskInputSchema.shape.instruction).toBe(
      AIInstructionSchema,
    );
    expect(
      CreateAITaskInputSchema.parse({
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: "x",
      }).instruction,
    ).toBe("x");
    expect(
      CreateAITaskInputSchema.parse({
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: "  Summarize the discussion.  ",
      }).instruction,
    ).toBe("Summarize the discussion.");

    expect(
      CreateAITaskInputSchema.safeParse({
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: "   ",
      }).success,
    ).toBe(false);

    const maximum = "x".repeat(MAX_INSTRUCTION_CHARS);
    expect(
      CreateAITaskInputSchema.parse({
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: `  ${maximum}  `,
      }).instruction,
    ).toBe(maximum);
    expect(
      CreateAITaskInputSchema.safeParse({
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: "x".repeat(MAX_INSTRUCTION_CHARS + 1),
      }).success,
    ).toBe(false);
  });
});

describe("buildAuthorizedRoomContextManifest", () => {
  it("builds an identifier-only manifest from RLS-scoped room queries", async () => {
    const { supabase, from, queries } = manifestSupabase();

    const manifest = await buildAuthorizedRoomContextManifest(
      supabase,
      ROOM_ID,
    );

    expect(manifest).toEqual({
      messageIds: [MESSAGE_ID],
      attachmentIds: [ATTACHMENT_ID],
      evidenceIds: [EVIDENCE_ID],
      decisionIds: [DECISION_ID],
    });
    expect(JSON.stringify(manifest)).not.toContain("storage_path");
    expect(JSON.stringify(manifest)).not.toContain("signedUrl");
    expect(JSON.stringify(manifest)).not.toContain(
      "Validated interview text",
    );
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "messages",
      "attachments",
      "evidence",
      "decisions",
    ]);

    for (const table of [
      "messages",
      "attachments",
      "evidence",
      "decisions",
    ]) {
      expect(queries[table].select).toHaveBeenCalledWith("id");
      expect(queries[table].eq).toHaveBeenCalledWith(
        "room_id",
        ROOM_ID,
      );
      expect(queries[table].order).toHaveBeenNthCalledWith(
        1,
        "created_at",
        { ascending: true },
      );
      expect(queries[table].order).toHaveBeenNthCalledWith(
        2,
        "id",
        { ascending: true },
      );
    }
    expect(queries.attachments.not).toHaveBeenCalledWith(
      "message_id",
      "is",
      null,
    );
    expect(queries.attachments.eq).toHaveBeenCalledWith(
      "discard_pending",
      false,
    );
  });

  it("rejects the entire manifest when any query fails", async () => {
    const { supabase } = manifestSupabase({
      evidence: {
        data: null,
        error: { message: "permission denied for evidence" },
      },
    });

    await expect(
      buildAuthorizedRoomContextManifest(supabase, ROOM_ID),
    ).rejects.toThrow(
      "We could not build the authorized room context.",
    );
  });
});

describe("createAITask", () => {
  it("creates a task with an authorized identifier manifest", async () => {
    const { supabase: queryClient } = manifestSupabase();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...TASK,
        createdAt: "2026-07-28T12:00:00+00:00",
        updatedAt: "2026-07-28T12:00:00+00:00",
        instruction: "must be discarded by the public schema",
      },
      error: null,
    });
    const supabase = {
      ...queryClient,
      rpc,
    } as unknown as SupabaseClient;

    const task = await createAITask(supabase, {
      roomId: ROOM_ID,
      deviceId: DEVICE_ID,
      provider: "codex",
      kind: "room_reply",
      instruction: "Summarize the discussion.",
    });

    expect(rpc).toHaveBeenCalledWith("create_ai_task", {
      target_room_id: ROOM_ID,
      target_device_id: DEVICE_ID,
      target_provider: "codex",
      target_kind: "room_reply",
      target_instruction: "Summarize the discussion.",
      target_manifest: {
        messageIds: [MESSAGE_ID],
        attachmentIds: [ATTACHMENT_ID],
        evidenceIds: [EVIDENCE_ID],
        decisionIds: [DECISION_ID],
      },
    });
    expect(task).toEqual(TASK);
    expect(task).not.toHaveProperty("instruction");
  });

  it("returns only a stable application error for an RPC failure", async () => {
    const { supabase: queryClient } = manifestSupabase();
    const supabase = {
      ...queryClient,
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "invalid_ai_task_request" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      createAITask(supabase, {
        roomId: ROOM_ID,
        deviceId: DEVICE_ID,
        provider: "codex",
        kind: "room_reply",
        instruction: "Summarize the discussion.",
      }),
    ).rejects.toThrow("We could not create the AI task.");
  });
});

describe("createRoomReplyTask", () => {
  it("binds the source message and resolves the saved default provider", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...TASK,
        createdAt: "2026-07-28T12:00:00+00:00",
        updatedAt: "2026-07-28T12:00:00+00:00",
        instruction: "must be discarded by the public schema",
        sourceMessageId: MESSAGE_ID,
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const task = await createRoomReplyTask(supabase, {
      sourceMessageId: MESSAGE_ID,
    });

    expect(rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: MESSAGE_ID,
      target_provider: null,
      target_model: null,
      target_agent_kind: "product",
      target_research_scope: "room",
    });
    expect(task).toEqual(TASK);
    expect(task).not.toHaveProperty("instruction");
  });

  it("passes an explicit provider override through to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...TASK,
        provider: "claude",
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    await createRoomReplyTask(supabase, {
      sourceMessageId: MESSAGE_ID,
      provider: "claude",
    });

    expect(rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: MESSAGE_ID,
      target_provider: "claude",
      target_model: null,
      target_agent_kind: "product",
      target_research_scope: "room",
    });
  });

  it("passes Research Agent web scope through to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: TASK, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await createRoomReplyTask(supabase, {
      sourceMessageId: MESSAGE_ID,
      agentKind: "research",
      researchScope: "web",
    });

    expect(rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: MESSAGE_ID,
      target_provider: null,
      target_model: null,
      target_agent_kind: "research",
      target_research_scope: "web",
    });
  });

  it("passes an exact selected model through to the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: TASK, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await createRoomReplyTask(supabase, {
      sourceMessageId: MESSAGE_ID,
      provider: "claude",
      model: "claude-sonnet-4-5",
    });

    expect(rpc).toHaveBeenCalledWith("create_room_reply_task", {
      target_source_message_id: MESSAGE_ID,
      target_provider: "claude",
      target_model: "claude-sonnet-4-5",
      target_agent_kind: "product",
      target_research_scope: "room",
    });
  });

  it("falls back to the legacy RPC while the model migration is rolling out", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function with parameter target_model",
        },
      })
      .mockResolvedValueOnce({ data: TASK, error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    await createRoomReplyTask(supabase, {
      sourceMessageId: MESSAGE_ID,
      provider: "claude",
      model: "claude-sonnet-4-5",
    });

    expect(rpc).toHaveBeenNthCalledWith(2, "create_room_reply_task", {
      target_source_message_id: MESSAGE_ID,
      target_provider: "claude",
      target_agent_kind: "product",
      target_research_scope: "room",
    });
  });

  it("returns only a stable application error for an RPC failure", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "invalid_room_reply_request" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      createRoomReplyTask(supabase, { sourceMessageId: MESSAGE_ID }),
    ).rejects.toThrow(
      "We could not ask the agent to reply.",
    );
  });
});

describe("cancelAITask", () => {
  it("cancels by task ID only and parses the returned database row", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: TASK.id,
        initiating_user_id: TASK.initiatingUserId,
        workspace_id: TASK.workspaceId,
        room_id: TASK.roomId,
        device_id: TASK.deviceId,
        provider: TASK.provider,
        kind: TASK.kind,
        status: "cancelled",
        context_revision: TASK.contextRevision,
        created_at: "2026-07-28T12:00:00+00:00",
        updated_at: "2026-07-28T12:01:00+00:00",
        instruction: "must be discarded",
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const task = await cancelAITask(supabase, TASK_ID);

    expect(rpc).toHaveBeenCalledWith("cancel_ai_task", {
      target_task_id: TASK_ID,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("workspace_id");
    expect(task).toEqual({
      ...TASK,
      status: "cancelled",
      updatedAt: "2026-07-28T12:01:00.000Z",
    });
    expect(task).not.toHaveProperty("instruction");
  });

  it("returns only a stable application error for missing RPC data", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as SupabaseClient;

    await expect(cancelAITask(supabase, TASK_ID)).rejects.toThrow(
      "We could not cancel the AI task.",
    );
  });
});
