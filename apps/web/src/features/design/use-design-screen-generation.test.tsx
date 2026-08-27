// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateDesignScreen: vi.fn(),
  getDesignScreenGeneration: vi.fn(),
  notifyQueued: vi.fn(),
  statuses: [] as Array<{ taskId: string; status: string; kind?: string }>,
  activeDesignScreenGenerationTaskIds: [] as string[],
}));

vi.mock("./design-screen-generation", () => ({
  generateDesignScreen: mocks.generateDesignScreen,
  getDesignScreenGeneration: mocks.getDesignScreenGeneration,
}));
vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({
    statuses: mocks.statuses,
    activeDesignScreenGenerationTaskIds: mocks.activeDesignScreenGenerationTaskIds,
    notifyQueued: mocks.notifyQueued,
  }),
}));

import { useDesignScreenGeneration } from "./use-design-screen-generation";

const roomId = "40000000-0000-4000-8000-000000000004";
const screenId = "50000000-0000-4000-8000-000000000005";
const taskId = "70000000-0000-4000-8000-000000000007";
const versionId = "80000000-0000-4000-8000-000000000008";
const inFlightGeneration = { taskId, screenId, versionId: null, promoted: null };
const materializedGeneration = { taskId, screenId, versionId, promoted: null };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.statuses = [];
  mocks.activeDesignScreenGenerationTaskIds = [];
  mocks.getDesignScreenGeneration.mockResolvedValue(null);
  mocks.generateDesignScreen.mockResolvedValue({ status: "queued", taskId, screenId });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDesignScreenGeneration", () => {
  it("flips idle -> running when start queues a task", async () => {
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "edit" }));
    let startPromise!: Promise<unknown>;
    act(() => {
      startPromise = hook.result.current.start({ instruction: "Build a login screen" });
    });
    expect(hook.result.current.status).toBe("idle");
    await act(async () => {
      await startPromise;
    });
    expect(mocks.generateDesignScreen).toHaveBeenCalledWith({
      roomId,
      instruction: "Build a login screen",
    });
    expect(hook.result.current.status).toBe("running");
    expect(mocks.notifyQueued).toHaveBeenCalledWith({ kind: "design_screen_generate", taskId });
  });

  it.each(["failed", "cancelled", "needs_reauthentication", "usage_limit_reached", "needs_review"])(
    "stops polling for terminal status %s",
    async (terminalStatus) => {
      mocks.statuses = [{ taskId, status: terminalStatus }];
      const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "edit" }));
      await act(async () => { await hook.result.current.start({ instruction: "x" }); });
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(hook.result.current.status).toBe("failed");
      expect(mocks.getDesignScreenGeneration).not.toHaveBeenCalled();
    },
  );

  it("tells the page to re-read itself when a generation dies", async () => {
    // The turn's "Designing your screen…" comes from the server-rendered task
    // status, so a failure that refreshes nothing leaves it spinning for ever
    // over a task that already stopped -- with a Cancel button for something
    // that cannot be cancelled. Observed live: a generation settled
    // `needs_review` after 8 minutes and was still spinning ten minutes on.
    const onFailed = vi.fn();
    mocks.statuses = [{ taskId, status: "needs_review" }];
    const hook = renderHook(() =>
      useDesignScreenGeneration({ roomId, access: "edit", onFailed }),
    );
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(hook.result.current.status).toBe("failed");
    expect(onFailed).toHaveBeenCalled();
  });

  it("keeps polling after a read fails rather than dying silently", async () => {
    // One rejected read used to throw out of the poll before it could schedule
    // the next tick: the loop stopped for good, nothing settled the task, and
    // the turn spun for ever.
    mocks.getDesignScreenGeneration
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue(materializedGeneration);
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "edit" }));
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(mocks.getDesignScreenGeneration.mock.calls.length).toBeGreaterThan(1);
  });

  it("polls getDesignScreenGeneration and keeps polling while versionId is null", async () => {
    mocks.getDesignScreenGeneration.mockResolvedValue(inFlightGeneration);
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "edit" }));
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(mocks.getDesignScreenGeneration).toHaveBeenCalledWith(taskId);
    expect(hook.result.current.status).toBe("running");
  });

  it("flips to completed after onScreenReady resolves once versionId materializes", async () => {
    const onScreenReady = vi.fn().mockResolvedValue(undefined);
    mocks.getDesignScreenGeneration.mockResolvedValue(materializedGeneration);
    const hook = renderHook(() =>
      useDesignScreenGeneration({ roomId, access: "edit", onScreenReady }),
    );
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(onScreenReady).toHaveBeenCalledTimes(1);
    expect(onScreenReady).toHaveBeenCalledWith();
    expect(hook.result.current.status).toBe("completed");
  });

  it("delivers a materialized generation only once even if polled again", async () => {
    const onScreenReady = vi.fn().mockResolvedValue(undefined);
    mocks.getDesignScreenGeneration.mockResolvedValue(materializedGeneration);
    const hook = renderHook(() =>
      useDesignScreenGeneration({ roomId, access: "edit", onScreenReady }),
    );
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(onScreenReady).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe("completed");
  });

  it("adopts a task queued outside this hook and polls it to completion", async () => {
    const onScreenReady = vi.fn().mockResolvedValue(undefined);
    mocks.statuses = [{ taskId, status: "running", kind: "design_screen_generate" }];
    // Mirrors how the real room-task-status-provider derives this list from
    // `statuses` (see activeDesignScreenGenerationTaskIds in
    // room-task-status-provider.tsx) -- the mock provider here sets each
    // independently, so it must be kept in sync by hand.
    mocks.activeDesignScreenGenerationTaskIds = [taskId];
    mocks.getDesignScreenGeneration.mockResolvedValue(materializedGeneration);
    renderHook(() => useDesignScreenGeneration({ roomId, access: "edit", onScreenReady }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(mocks.getDesignScreenGeneration).toHaveBeenCalledWith(taskId);
    expect(onScreenReady).toHaveBeenCalledTimes(1);
  });

  it("adopts an optimistic proposal task before the room status projection catches up", async () => {
    const onScreenReady = vi.fn().mockResolvedValue(undefined);
    mocks.activeDesignScreenGenerationTaskIds = [taskId];
    mocks.getDesignScreenGeneration.mockResolvedValue(materializedGeneration);
    renderHook(() => useDesignScreenGeneration({ roomId, access: "edit", onScreenReady }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(mocks.notifyQueued).toHaveBeenCalledWith();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(mocks.getDesignScreenGeneration).toHaveBeenCalledWith(taskId);
    expect(onScreenReady).toHaveBeenCalledTimes(1);
  });

  it("does not adopt a room task for a viewer", async () => {
    mocks.statuses = [{ taskId, status: "running", kind: "design_screen_generate" }];
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "view" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    expect(hook.result.current.status).toBe("idle");
    expect(mocks.getDesignScreenGeneration).not.toHaveBeenCalled();
  });

  it("does not start for a viewer", async () => {
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "view" }));
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    expect(mocks.generateDesignScreen).not.toHaveBeenCalled();
  });

  it("surfaces a failure when generateDesignScreen returns an error", async () => {
    mocks.generateDesignScreen.mockResolvedValue({ status: "error", message: "nope" });
    const hook = renderHook(() => useDesignScreenGeneration({ roomId, access: "edit" }));
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    expect(hook.result.current.status).toBe("failed");
    expect(hook.result.current.message).toBe("nope");
  });

  it("waits for onScreenReady to resolve before flipping to completed", async () => {
    let resolveReady!: () => void;
    const onScreenReady = vi.fn(
      () => new Promise<void>((resolve) => { resolveReady = resolve; }),
    );
    mocks.getDesignScreenGeneration.mockResolvedValue(materializedGeneration);
    const hook = renderHook(() =>
      useDesignScreenGeneration({ roomId, access: "edit", onScreenReady }),
    );
    await act(async () => { await hook.result.current.start({ instruction: "x" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(onScreenReady).toHaveBeenCalledTimes(1);
    expect(hook.result.current.status).toBe("running");
    await act(async () => {
      resolveReady();
      await Promise.resolve();
    });
    expect(hook.result.current.status).toBe("completed");
  });
});
