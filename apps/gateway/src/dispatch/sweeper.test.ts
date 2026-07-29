import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskRepository } from "../tasks/task-repository";
import type { DeviceSessionRegistry } from "../ws/device-session";
import { createDispatchSweeper } from "./sweeper";

const FIRST_DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_DEVICE_ID = "44444444-4444-4444-8444-444444444444";
const AVAILABLE_TASK_ID = "11111111-1111-4111-8111-111111111111";
const CANCELLED_TASK_ID = "22222222-2222-4222-8222-222222222222";
const ATTEMPT_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness() {
  const repository = {
    listDispatchableProviderSetups: vi.fn().mockResolvedValue([
      {
        requestId: REQUEST_ID,
        deviceId: FIRST_DEVICE_ID,
        provider: "claude",
      },
    ]),
    listDispatchableTasks: vi.fn().mockResolvedValue([
      {
        kind: "available",
        taskId: AVAILABLE_TASK_ID,
        deviceId: FIRST_DEVICE_ID,
        status: "ready_to_run",
        attemptId: null,
      },
      {
        kind: "cancel",
        taskId: CANCELLED_TASK_ID,
        deviceId: SECOND_DEVICE_ID,
        status: "cancelled",
        attemptId: ATTEMPT_ID,
      },
    ]),
    reapExpiredTaskLeases: vi.fn().mockResolvedValue([]),
  } as unknown as TaskRepository;
  const registry = {
    connectedDeviceIds: vi
      .fn()
      .mockReturnValue([FIRST_DEVICE_ID, SECOND_DEVICE_ID]),
    sendToDevice: vi.fn().mockReturnValue(1),
  } as unknown as DeviceSessionRegistry;
  const onError = vi.fn();
  const sweeper = createDispatchSweeper({
    repository,
    registry,
    intervalMs: 100,
    onError,
  });

  return { repository, registry, onError, sweeper };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createDispatchSweeper", () => {
  it("announces every dispatchable row and reaps on each full sweep", async () => {
    const { repository, registry, sweeper } = createHarness();

    await sweeper.sweep();

    expect(repository.listDispatchableProviderSetups).toHaveBeenCalledWith([
      FIRST_DEVICE_ID,
      SECOND_DEVICE_ID,
    ]);
    expect(repository.listDispatchableTasks).toHaveBeenCalledWith([
      FIRST_DEVICE_ID,
      SECOND_DEVICE_ID,
    ]);
    expect(registry.sendToDevice).toHaveBeenNthCalledWith(
      1,
      FIRST_DEVICE_ID,
      { type: "provider.setup", requestId: REQUEST_ID, provider: "claude" },
    );
    expect(registry.sendToDevice).toHaveBeenNthCalledWith(
      2,
      FIRST_DEVICE_ID,
      { type: "task.available", taskId: AVAILABLE_TASK_ID },
    );
    expect(registry.sendToDevice).toHaveBeenNthCalledWith(
      3,
      SECOND_DEVICE_ID,
      {
        type: "task.cancel",
        taskId: CANCELLED_TASK_ID,
        attemptId: ATTEMPT_ID,
      },
    );
    expect(repository.reapExpiredTaskLeases).toHaveBeenCalledOnce();
  });

  it("sends provider setup frames before AI task frames for the same device", async () => {
    const { registry, sweeper } = createHarness();

    await sweeper.sweep();

    expect(registry.sendToDevice).toHaveBeenCalledWith(FIRST_DEVICE_ID, {
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "claude",
    });
    const calls = vi.mocked(registry.sendToDevice).mock.calls;
    const setupCallIndex = calls.findIndex(
      ([, message]) => message.type === "provider.setup",
    );
    const taskCallIndex = calls.findIndex(
      ([, message]) => message.type === "task.available",
    );
    expect(setupCallIndex).toBeGreaterThanOrEqual(0);
    expect(taskCallIndex).toBeGreaterThan(setupCallIndex);
  });

  it("re-announces rows that remain ready in database state", async () => {
    const { registry, sweeper } = createHarness();

    await sweeper.sweep();
    await sweeper.sweep();

    expect(registry.sendToDevice).toHaveBeenCalledTimes(6);
    expect(registry.sendToDevice).toHaveBeenNthCalledWith(
      4,
      FIRST_DEVICE_ID,
      { type: "provider.setup", requestId: REQUEST_ID, provider: "claude" },
    );
    expect(registry.sendToDevice).toHaveBeenNthCalledWith(
      5,
      FIRST_DEVICE_ID,
      { type: "task.available", taskId: AVAILABLE_TASK_ID },
    );
  });

  it("scopes a connection sweep to one device through the same path", async () => {
    const { repository, sweeper } = createHarness();

    await sweeper.sweepDevice(SECOND_DEVICE_ID);

    expect(repository.listDispatchableProviderSetups).toHaveBeenCalledWith([
      SECOND_DEVICE_ID,
    ]);
    expect(repository.listDispatchableTasks).toHaveBeenCalledWith([
      SECOND_DEVICE_ID,
    ]);
    expect(repository.reapExpiredTaskLeases).toHaveBeenCalledOnce();
  });

  it("does not overlap sweeps and schedules again after a failure", async () => {
    vi.useFakeTimers();
    const { repository, onError, sweeper } = createHarness();
    const first = deferred<never>();
    vi.mocked(repository.listDispatchableTasks)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue([]);

    sweeper.start();
    await vi.waitFor(() => {
      expect(repository.listDispatchableTasks).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.listDispatchableTasks).toHaveBeenCalledOnce();

    first.reject(new Error("temporary database failure"));
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => {
      expect(repository.listDispatchableTasks).toHaveBeenCalledTimes(2);
    });
    sweeper.stop();
  });
});
