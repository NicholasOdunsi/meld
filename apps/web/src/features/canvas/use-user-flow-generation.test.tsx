// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateUserFlow: vi.fn(),
  getUserFlowGeneration: vi.fn(),
  listUnappliedUserFlowGenerations: vi.fn(),
  notifyQueued: vi.fn(),
  statuses: [] as Array<{ taskId: string; status: string; kind?: string }>,
}));

vi.mock("./user-flow-generation", () => ({
  generateUserFlow: mocks.generateUserFlow,
  getUserFlowGeneration: mocks.getUserFlowGeneration,
  listUnappliedUserFlowGenerations: mocks.listUnappliedUserFlowGenerations,
}));
vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({
    statuses: mocks.statuses,
    notifyQueued: mocks.notifyQueued,
  }),
}));

import { useUserFlowGeneration } from "./use-user-flow-generation";

const roomId = "40000000-0000-4000-8000-000000000004";
const taskId = "70000000-0000-4000-8000-000000000007";
const generation = {
  taskId,
  roomId,
  document: {
    title: "Recovery",
    summary: "Recovery flow",
    nodes: [
      { id: "start", kind: "start" as const, label: "Start", detail: null },
      { id: "end", kind: "end" as const, label: "End", detail: null },
    ],
    edges: [{ id: "e1", from: "start", to: "end", label: null }],
    openQuestions: [],
  },
  createdAt: "2026-08-10T12:00:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.statuses = [];
  mocks.listUnappliedUserFlowGenerations.mockResolvedValue([]);
  mocks.getUserFlowGeneration.mockResolvedValue(null);
  mocks.generateUserFlow.mockResolvedValue({ status: "queued", taskId });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useUserFlowGeneration", () => {
  it("recovers an unapplied materialized generation exactly once on mount", async () => {
    vi.useRealTimers();
    const onGenerationReady = vi.fn();
    mocks.listUnappliedUserFlowGenerations.mockResolvedValue([generation, generation]);
    renderHook(() => useUserFlowGeneration({ roomId, access: "edit", onGenerationReady }));

    await waitFor(() => expect(onGenerationReady).toHaveBeenCalledTimes(1));
  });

  it.each(["failed", "cancelled", "needs_reauthentication", "usage_limit_reached", "needs_review"])(
    "stops polling for terminal status %s",
    async (terminalStatus) => {
      mocks.statuses = [{ taskId, status: terminalStatus }];
      const hook = renderHook(() => useUserFlowGeneration({ roomId, access: "edit" }));
      await act(async () => { await hook.result.current.start(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(hook.result.current.status).toBe("failed");
      expect(mocks.getUserFlowGeneration).not.toHaveBeenCalled();
    },
  );

  it("applies a polled artifact once and stops", async () => {
    const onGenerationReady = vi.fn();
    mocks.getUserFlowGeneration.mockResolvedValue(generation);
    const hook = renderHook(() => useUserFlowGeneration({ roomId, access: "edit", onGenerationReady }));
    await act(async () => { await hook.result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(onGenerationReady).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe("completed");
  });

  it("adopts a task queued outside this hook (e.g. a proposal acceptance) and polls it to completion", async () => {
    const onGenerationReady = vi.fn();
    // Nothing here ever called start(): the task shows up only via the room's
    // shared task-status projection, the way accepting a "Create user flow"
    // proposal queues one without going through this hook at all.
    mocks.statuses = [{ taskId, status: "running", kind: "user_flow_generate" }];
    mocks.getUserFlowGeneration.mockResolvedValue(generation);
    renderHook(() => useUserFlowGeneration({ roomId, access: "edit", onGenerationReady }));

    // The adoption itself is deferred a tick (see the hook's comment), so it
    // needs its own advance before the poll effect it triggers schedules its
    // own 2s timer.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(mocks.getUserFlowGeneration).toHaveBeenCalledWith(taskId);
    expect(onGenerationReady).toHaveBeenCalledTimes(1);
  });

  it("does not adopt a room task for a viewer", async () => {
    mocks.statuses = [{ taskId, status: "running", kind: "user_flow_generate" }];
    const hook = renderHook(() => useUserFlowGeneration({ roomId, access: "view" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(hook.result.current.taskId).toBeNull();
    expect(mocks.getUserFlowGeneration).not.toHaveBeenCalled();
  });

  it("does not recover or queue for a viewer", async () => {
    const hook = renderHook(() => useUserFlowGeneration({ roomId, access: "view" }));
    await act(async () => { await hook.result.current.start(); });
    expect(mocks.listUnappliedUserFlowGenerations).not.toHaveBeenCalled();
    expect(mocks.generateUserFlow).not.toHaveBeenCalled();
  });
});
