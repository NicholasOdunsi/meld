import type { ActiveTaskLease } from "@meld/contracts";

interface HeartbeatCoordinatorOptions {
  intervalMs: number;
  getActiveTasks(): ActiveTaskLease[];
  sendHeartbeat(activeTasks: ActiveTaskLease[]): void;
  onLeaseOmitted(lease: ActiveTaskLease): void;
}

export interface HeartbeatCoordinator {
  start(): void;
  acknowledge(renewedTasks: ActiveTaskLease[]): void;
  stop(): void;
}

function leaseKey({ taskId, attemptId }: ActiveTaskLease): string {
  return `${taskId}:${attemptId}`;
}

export function createHeartbeatCoordinator({
  intervalMs,
  getActiveTasks,
  sendHeartbeat,
  onLeaseOmitted,
}: HeartbeatCoordinatorOptions): HeartbeatCoordinator {
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlightSnapshot: ActiveTaskLease[] | undefined;

  function sendNext(): void {
    if (!running || inFlightSnapshot) {
      return;
    }

    inFlightSnapshot = getActiveTasks().map(
      ({ taskId, attemptId }) => ({ taskId, attemptId }),
    );
    sendHeartbeat(inFlightSnapshot);
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      sendNext();
    },

    acknowledge(renewedTasks) {
      const sentTasks = inFlightSnapshot;
      if (!running || !sentTasks) {
        return;
      }
      inFlightSnapshot = undefined;

      const renewed = new Set(renewedTasks.map(leaseKey));
      for (const sentTask of sentTasks) {
        if (!renewed.has(leaseKey(sentTask))) {
          onLeaseOmitted(sentTask);
        }
      }

      if (running) {
        timer = setTimeout(sendNext, intervalMs);
      }
    },

    stop() {
      running = false;
      inFlightSnapshot = undefined;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
