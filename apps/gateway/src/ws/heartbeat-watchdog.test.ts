import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceSessionRegistry } from "./device-session";
import { createHeartbeatWatchdog } from "./heartbeat-watchdog";

afterEach(() => {
  vi.useRealTimers();
});

describe("heartbeat watchdog", () => {
  it("owns a repeating deadline check and can be stopped", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const registry = {
      closeStaleSessions: vi.fn().mockReturnValue(0),
    } as unknown as DeviceSessionRegistry;
    const watchdog = createHeartbeatWatchdog({
      registry,
      heartbeatSeconds: 2,
    });

    watchdog.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(registry.closeStaleSessions).toHaveBeenCalledWith(
      12_000,
      4_000,
    );

    watchdog.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(registry.closeStaleSessions).toHaveBeenCalledOnce();
  });
});
