import type { TaskRepository } from "../tasks/task-repository";
import type { DeviceSessionRegistry } from "../ws/device-session";

type DispatchRepository = Pick<
  TaskRepository,
  "listDispatchableTasks" | "reapExpiredTaskLeases"
>;

type DispatchRegistry = Pick<
  DeviceSessionRegistry,
  "connectedDeviceIds" | "sendToDevice"
>;

export interface DispatchSweeperOptions {
  repository: DispatchRepository;
  registry: DispatchRegistry;
  intervalMs: number;
  onError?: (error: unknown) => void;
}

export interface DispatchSweeper {
  start(): void;
  stop(): void;
  sweep(): Promise<void>;
  sweepDevice(deviceId: string): Promise<void>;
}

export function createDispatchSweeper({
  repository,
  registry,
  intervalMs,
  onError = (error) => {
    console.error("Gateway dispatch sweep failed", error);
  },
}: DispatchSweeperOptions): DispatchSweeper {
  let running = false;
  let timer: NodeJS.Timeout | undefined;
  let sweepQueue = Promise.resolve();

  async function announce(deviceIds: string[]): Promise<void> {
    const rows = await repository.listDispatchableTasks(deviceIds);

    for (const row of rows) {
      if (row.kind === "available") {
        registry.sendToDevice(row.deviceId, {
          type: "task.available",
          taskId: row.taskId,
        });
      } else {
        registry.sendToDevice(row.deviceId, {
          type: "task.cancel",
          taskId: row.taskId,
          attemptId: row.attemptId,
        });
      }
    }

    await repository.reapExpiredTaskLeases();
  }

  function enqueue(
    getDeviceIds: () => string[],
  ): Promise<void> {
    const result = sweepQueue.then(() => announce(getDeviceIds()));
    sweepQueue = result.catch(() => undefined);
    return result;
  }

  function sweep(): Promise<void> {
    return enqueue(() => registry.connectedDeviceIds());
  }

  function sweepDevice(deviceId: string): Promise<void> {
    return enqueue(() => [deviceId]);
  }

  async function tick(): Promise<void> {
    try {
      await sweep();
    } catch (error) {
      onError(error);
    } finally {
      if (running) {
        timer = setTimeout(() => {
          void tick();
        }, intervalMs);
      }
    }
  }

  return {
    start() {
      if (running) {
        return;
      }
      running = true;
      void tick();
    },

    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },

    sweep,
    sweepDevice,
  };
}
