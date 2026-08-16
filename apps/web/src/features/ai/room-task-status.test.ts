import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  RoomTaskStatusPoller,
  isTerminalTaskStatus,
  listRoomAiTaskStatuses,
  type RoomTaskStatus,
} from "./room-task-status";

const ROOM_ID = "20000000-0000-4000-8000-000000000001";

function status(
  overrides: Partial<RoomTaskStatus> = {},
): RoomTaskStatus {
  return {
    taskId: "70000000-0000-4000-8000-000000000007",
    sourceMessageId: "40000000-0000-4000-8000-000000000010",
    initiatingUserId: "10000000-0000-4000-8000-000000000002",
    provider: "codex",
    kind: "room_reply",
    agentKind: "product",
    status: "queued",
    createdAt: "2026-07-25T12:00:00.000Z",
    updatedAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("isTerminalTaskStatus", () => {
  it("treats in-flight statuses as nonterminal", () => {
    for (const value of [
      "queued",
      "waiting_for_device",
      "ready_to_run",
      "running",
    ] as const) {
      expect(isTerminalTaskStatus(value)).toBe(false);
    }
  });

  it("treats settled and awaiting-user statuses as terminal", () => {
    for (const value of [
      "completed",
      "cancelled",
      "failed",
      "needs_reauthentication",
      "usage_limit_reached",
      "needs_review",
    ] as const) {
      expect(isTerminalTaskStatus(value)).toBe(true);
    }
  });
});

describe("listRoomAiTaskStatuses", () => {
  it("reads only the safe status RPC and never queries ai_tasks", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          task_id: "70000000-0000-4000-8000-000000000007",
          source_message_id: "40000000-0000-4000-8000-000000000010",
          initiating_user_id: "10000000-0000-4000-8000-000000000002",
          provider: "claude",
          kind: "prd_generate",
          agent_kind: "product",
          status: "running",
          created_at: "2026-07-25T12:00:00.000Z",
          updated_at: "2026-07-25T12:00:30.000Z",
        },
      ],
      error: null,
    });
    const from = vi.fn();
    const supabase = { rpc, from } as unknown as SupabaseClient;

    const statuses = await listRoomAiTaskStatuses(supabase, ROOM_ID);

    expect(rpc).toHaveBeenCalledWith("list_room_ai_task_statuses", {
      target_room_id: ROOM_ID,
    });
    expect(from).not.toHaveBeenCalled();
    expect(statuses).toEqual([
      {
        taskId: "70000000-0000-4000-8000-000000000007",
        sourceMessageId: "40000000-0000-4000-8000-000000000010",
        initiatingUserId: "10000000-0000-4000-8000-000000000002",
        provider: "claude",
        kind: "prd_generate",
        agentKind: "product",
        status: "running",
        createdAt: "2026-07-25T12:00:00.000Z",
        updatedAt: "2026-07-25T12:00:30.000Z",
      },
    ]);
  });

  it("surfaces a friendly error when the RPC fails", async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "denied" },
      }),
    } as unknown as SupabaseClient;

    await expect(
      listRoomAiTaskStatuses(supabase, ROOM_ID),
    ).rejects.toThrow("We could not load the room's task status.");
  });
});

describe("RoomTaskStatusPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls immediately and then every two seconds while a task is active", async () => {
    const fetchStatuses = vi
      .fn()
      .mockResolvedValue([status({ status: "running" })]);
    const onStatuses = vi.fn();
    const poller = new RoomTaskStatusPoller({ fetchStatuses, onStatuses });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatuses).toHaveBeenCalledTimes(1);
    expect(onStatuses).toHaveBeenLastCalledWith([
      status({ status: "running" }),
    ]);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchStatuses).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchStatuses).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("stops polling once every task is terminal", async () => {
    const fetchStatuses = vi
      .fn()
      .mockResolvedValueOnce([status({ status: "running" })])
      .mockResolvedValueOnce([status({ status: "completed" })]);
    const onStatuses = vi.fn();
    const poller = new RoomTaskStatusPoller({ fetchStatuses, onStatuses });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchStatuses).toHaveBeenCalledTimes(2);

    // The completed status ends the loop: no further polls occur.
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchStatuses).toHaveBeenCalledTimes(2);
    // The completed status was still delivered so the UI can remove pending UI.
    expect(onStatuses).toHaveBeenLastCalledWith([
      status({ status: "completed" }),
    ]);

    poller.stop();
  });

  it("resumes polling after a mention queues even when previously idle", async () => {
    const fetchStatuses = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([status({ status: "queued" })]);
    const onStatuses = vi.fn();
    const poller = new RoomTaskStatusPoller({ fetchStatuses, onStatuses });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    // Empty result means no active task: the loop went idle.
    expect(fetchStatuses).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchStatuses).toHaveBeenCalledTimes(1);

    poller.notifyQueued();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatuses).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchStatuses).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("does not lose a queue notification while a status read is in flight", async () => {
    let resolveFirst: ((statuses: RoomTaskStatus[]) => void) | undefined;
    const fetchStatuses = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<RoomTaskStatus[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue([status({ status: "queued" })]);
    const poller = new RoomTaskStatusPoller({
      fetchStatuses,
      onStatuses: vi.fn(),
    });

    poller.start();
    poller.notifyQueued();
    resolveFirst?.([]);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchStatuses).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("polls immediately when a task queues during the scheduled interval", async () => {
    const fetchStatuses = vi
      .fn()
      .mockResolvedValue([status({ status: "running" })]);
    const poller = new RoomTaskStatusPoller({
      fetchStatuses,
      onStatuses: vi.fn(),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatuses).toHaveBeenCalledOnce();

    poller.notifyQueued();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchStatuses).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("stops permanently after stop() is called", async () => {
    const fetchStatuses = vi
      .fn()
      .mockResolvedValue([status({ status: "running" })]);
    const poller = new RoomTaskStatusPoller({
      fetchStatuses,
      onStatuses: vi.fn(),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    await vi.advanceTimersByTimeAsync(10000);
    poller.notifyQueued();
    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchStatuses).toHaveBeenCalledTimes(1);
  });

  it("stops when the status read fails, e.g. access is revoked", async () => {
    const fetchStatuses = vi
      .fn()
      .mockRejectedValue(new Error("We could not load the room's task status."));
    const onError = vi.fn();
    const poller = new RoomTaskStatusPoller({
      fetchStatuses,
      onStatuses: vi.fn(),
      onError,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10000);
    expect(fetchStatuses).toHaveBeenCalledTimes(1);
  });
});
