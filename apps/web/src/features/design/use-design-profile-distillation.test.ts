// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, getMock, notifyQueuedMock, roomTaskStatusMocks } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getMock: vi.fn(),
  notifyQueuedMock: vi.fn(),
  roomTaskStatusMocks: {
    statuses: [] as Array<{ taskId: string; status: string }>,
  },
}));
vi.mock("./design-profile-distillation", () => ({
  uploadDesignSystemDocument: uploadMock,
  getDesignProfileDistillation: getMock,
}));
vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  useRoomTaskStatus: () => ({
    statuses: roomTaskStatusMocks.statuses,
    notifyQueued: notifyQueuedMock,
  }),
}));

import { useDesignProfileDistillation } from "./use-design-profile-distillation";

// The hook polls via real setTimeout on a 2s interval, so exercising two
// poll cycles with real timers would take 4s+ per test and blow past
// testing-library's default 1s waitFor timeout. Fake timers + explicit
// advances keep this deterministic and fast, mirroring
// use-design-screen-generation.test.tsx's approach to the same shape.
beforeEach(() => {
  vi.useFakeTimers();
  uploadMock.mockReset();
  getMock.mockReset();
  notifyQueuedMock.mockReset();
  roomTaskStatusMocks.statuses = [];
});

afterEach(() => {
  vi.useRealTimers();
});

const file = { fileName: "brand.md", mimeType: "text/markdown", bytes: new Uint8Array() };

describe("useDesignProfileDistillation", () => {
  it("moves idle -> uploading -> distilling -> resolved and calls onResolved once", async () => {
    uploadMock.mockResolvedValue({ status: "queued", taskId: "task-1" });
    getMock
      .mockResolvedValueOnce({ taskId: "task-1", versionId: null, isActive: null })
      .mockResolvedValueOnce({ taskId: "task-1", versionId: "v1", isActive: true });
    const onResolved = vi.fn();

    const { result } = renderHook(() =>
      useDesignProfileDistillation({ roomId: "room-1", onResolved }),
    );
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.status).toBe("distilling");
    expect(notifyQueuedMock).toHaveBeenCalledWith({
      kind: "design_profile_distill",
      taskId: "task-1",
    });

    // First poll fires; versionId is still null, so it stays distilling.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("distilling");

    // Second poll fires; versionId materializes, so it resolves.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.status).toBe("resolved");
    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it("moves to failed when the upload action returns an error", async () => {
    uploadMock.mockResolvedValue({ status: "error", message: "nope" });
    const { result } = renderHook(() => useDesignProfileDistillation({ roomId: "room-1" }));
    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.message).toBe("nope");
  });

  it("moves to failed after exhausting poll attempts without a versionId", async () => {
    uploadMock.mockResolvedValue({ status: "queued", taskId: "task-1" });
    getMock.mockResolvedValue({ taskId: "task-1", versionId: null, isActive: null });
    const { result } = renderHook(() => useDesignProfileDistillation({ roomId: "room-1" }));

    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.status).toBe("distilling");

    // MAX_POLL_ATTEMPTS (300) * POLL_INTERVAL_MS (2s) = 600s to exhaust.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.message).toBe("Distillation did not finish in time. Try again.");
  });

  // get_design_profile_distillation returns versionId: null identically
  // whether a task is still running or has actually failed, so polling alone
  // can never distinguish them -- without this, the only way out of
  // "distilling" on a real failure is exhausting all 300 poll attempts (10
  // minutes). The room's task-status projection carries the real terminal
  // status, so a failed task is caught on the very next poll instead.
  it("fails promptly when the room task-status projection marks the task terminal and non-completed", async () => {
    uploadMock.mockResolvedValue({ status: "queued", taskId: "task-1" });
    getMock.mockResolvedValue({ taskId: "task-1", versionId: null, isActive: null });
    roomTaskStatusMocks.statuses = [{ taskId: "task-1", status: "failed" }];
    const { result } = renderHook(() => useDesignProfileDistillation({ roomId: "room-1" }));

    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.status).toBe("distilling");

    // Only a single poll interval, nowhere near MAX_POLL_ATTEMPTS.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.message).toBe("Distillation did not complete. Try again.");
    // The terminal-status short circuit resolves before ever calling the
    // distillation reader for that poll.
    expect(getMock).not.toHaveBeenCalled();
  });

  it("does not call onResolved after unmount, even once a poll resolves", async () => {
    uploadMock.mockResolvedValue({ status: "queued", taskId: "task-1" });

    // Deferred so we can unmount while the poll request is in flight (after
    // getDesignProfileDistillation is called, before its promise settles).
    // This exercises the guard that runs *after* the await -- the harder,
    // more realistic race -- rather than the guard that short-circuits
    // before the fetch is even made.
    let resolveGet!: (value: { taskId: string; versionId: string | null; isActive: boolean | null }) => void;
    getMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveGet = resolve; }),
    );
    const onResolved = vi.fn();

    const { result, unmount } = renderHook(() =>
      useDesignProfileDistillation({ roomId: "room-1", onResolved }),
    );
    await act(async () => {
      await result.current.upload(file);
    });
    expect(result.current.status).toBe("distilling");

    // Advance past POLL_INTERVAL_MS so pollDistillation has called
    // getDesignProfileDistillation and is now awaiting its (still-pending)
    // result.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("distilling");

    unmount();

    // Now let the in-flight request resolve with a materialized version --
    // if the post-await guard didn't work, this would flip status to
    // "resolved" and fire onResolved on the unmounted hook.
    await act(async () => {
      resolveGet({ taskId: "task-1", versionId: "v1", isActive: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onResolved).not.toHaveBeenCalled();
    expect(result.current.status).toBe("distilling");
  });

  // React StrictMode's dev-mode double-invoke simulates
  // mount -> unmount -> remount before settling on the final instance.
  // disposedRef is a useRef, which survives that remount untouched --
  // without resetting it back to false on mount, the simulated unmount would
  // leave it permanently true, silently killing every poll for the rest of
  // the component's real lifetime.
  it("still polls to resolution after a StrictMode-style unmount/remount", async () => {
    uploadMock.mockResolvedValue({ status: "queued", taskId: "task-1" });
    getMock
      .mockResolvedValueOnce({ taskId: "task-1", versionId: null, isActive: null })
      .mockResolvedValueOnce({ taskId: "task-1", versionId: "v1", isActive: true });
    const onResolved = vi.fn();

    const first = renderHook(() =>
      useDesignProfileDistillation({ roomId: "room-1", onResolved }),
    );
    first.unmount();

    const second = renderHook(() =>
      useDesignProfileDistillation({ roomId: "room-1", onResolved }),
    );

    await act(async () => {
      await second.result.current.upload(file);
    });
    expect(second.result.current.status).toBe("distilling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(second.result.current.status).toBe("distilling");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(second.result.current.status).toBe("resolved");
    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
