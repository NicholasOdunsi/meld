import type { DeviceSessionRegistry } from "./device-session";

export interface HeartbeatWatchdog {
  start(): void;
  stop(): void;
}

export function createHeartbeatWatchdog({
  registry,
  heartbeatSeconds,
}: {
  registry: Pick<DeviceSessionRegistry, "closeStaleSessions">;
  heartbeatSeconds: number;
}): HeartbeatWatchdog {
  const heartbeatMs = heartbeatSeconds * 1_000;
  const deadlineMs = heartbeatMs * 2;
  let timer: NodeJS.Timeout | undefined;

  function tick(): void {
    registry.closeStaleSessions(Date.now(), deadlineMs);
    timer = setTimeout(tick, heartbeatMs);
    timer.unref?.();
  }

  return {
    start() {
      if (timer) {
        return;
      }
      timer = setTimeout(tick, heartbeatMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) {
        return;
      }
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
