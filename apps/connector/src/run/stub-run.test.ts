import type { TaskEvent } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStubRun } from "./stub-run";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  vi.useRealTimers();
});

describe("createStubRun", () => {
  it("emits progress and text delta events on a timer", async () => {
    vi.useFakeTimers();
    const events: TaskEvent[] = [];
    createStubRun({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      intervalMs: 100,
      send: (event) => events.push(event),
    });

    await vi.advanceTimersByTimeAsync(200);

    expect(events).toEqual([
      {
        type: "progress",
        label: "Starting task",
        percent: 25,
      },
      {
        type: "text.delta",
        text: "Stub connector output.",
      },
    ]);
  });

  it("stops emitting as soon as it is aborted", async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const run = createStubRun({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      intervalMs: 100,
      send,
    });

    await vi.advanceTimersByTimeAsync(100);
    run.abort("lease omitted");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(send).toHaveBeenCalledOnce();
    expect(run.abortedReason).toBe("lease omitted");
  });
});
