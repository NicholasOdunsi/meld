// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { uploadMock, getMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  getMock: vi.fn(),
}));
vi.mock("./design-profile-distillation", () => ({
  uploadDesignSystemDocument: uploadMock,
  getDesignProfileDistillation: getMock,
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
});
