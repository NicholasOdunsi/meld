import type { ActiveTaskLease } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHeartbeatCoordinator } from "./heartbeat";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const LEASE = { taskId: TASK_ID, attemptId: ATTEMPT_ID };

afterEach(() => {
  vi.useRealTimers();
});

describe("createHeartbeatCoordinator", () => {
  it("judges an acknowledgement against only the heartbeat request snapshot", () => {
    vi.useFakeTimers();
    const activeTasks: ActiveTaskLease[] = [];
    const sendHeartbeat = vi.fn();
    const onLeaseOmitted = vi.fn();
    const coordinator = createHeartbeatCoordinator({
      intervalMs: 30_000,
      getActiveTasks: () => activeTasks,
      sendHeartbeat,
      onLeaseOmitted,
    });

    coordinator.start();
    expect(sendHeartbeat).toHaveBeenCalledWith([]);

    activeTasks.push(LEASE);
    coordinator.acknowledge([]);

    expect(onLeaseOmitted).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(sendHeartbeat).toHaveBeenLastCalledWith([LEASE]);

    coordinator.acknowledge([]);
    expect(onLeaseOmitted).toHaveBeenCalledOnce();
    expect(onLeaseOmitted).toHaveBeenCalledWith(LEASE);
  });

  it("never sends another heartbeat while one is awaiting acknowledgement", () => {
    vi.useFakeTimers();
    const sendHeartbeat = vi.fn();
    const coordinator = createHeartbeatCoordinator({
      intervalMs: 30_000,
      getActiveTasks: () => [LEASE],
      sendHeartbeat,
      onLeaseOmitted: vi.fn(),
    });

    coordinator.start();
    vi.advanceTimersByTime(150_000);

    expect(sendHeartbeat).toHaveBeenCalledOnce();

    coordinator.acknowledge([LEASE]);
    vi.advanceTimersByTime(30_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(150_000);
    expect(sendHeartbeat).toHaveBeenCalledTimes(2);
  });
});
