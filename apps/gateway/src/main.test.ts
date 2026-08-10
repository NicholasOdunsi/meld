import { describe, expect, it, vi } from "vitest";
import type { GatewayConfig } from "./config";
import type { TaskRepository } from "./tasks/task-repository";
import type { DeviceSessionRegistry } from "./ws/device-session";
import { startGateway, type GatewaySignal } from "./main";

const CONFIG: GatewayConfig = {
  host: "127.0.0.1",
  port: 8787,
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseServiceRoleKey: "service-role-key",
  pollIntervalMs: 3000,
  heartbeatSeconds: 30,
  canvasTrialEnabled: false,
  canvasIdleEvictionMs: 120_000,
};

function createHarness(config = CONFIG) {
  const order: string[] = [];
  const repository = {
    getAiTaskLeaseSeconds: vi.fn().mockImplementation(async () => {
      order.push("lease");
      return 90;
    }),
  } as unknown as TaskRepository;
  const registry = {
    closeAll: vi.fn().mockImplementation(() => {
      order.push("registry.closeAll");
    }),
  } as unknown as DeviceSessionRegistry;
  const sweeper = {
    start: vi.fn().mockImplementation(() => {
      order.push("sweeper.start");
    }),
    stop: vi.fn().mockImplementation(() => {
      order.push("sweeper.stop");
    }),
    sweep: vi.fn().mockResolvedValue(undefined),
    sweepDevice: vi.fn().mockResolvedValue(undefined),
  };
  const watchdog = {
    start: vi.fn().mockImplementation(() => {
      order.push("watchdog.start");
    }),
    stop: vi.fn().mockImplementation(() => {
      order.push("watchdog.stop");
    }),
  };
  const server = {
    listen: vi.fn().mockImplementation(async () => {
      order.push("server.listen");
      return "http://127.0.0.1:8787";
    }),
    close: vi.fn().mockImplementation(async () => {
      order.push("server.close");
    }),
  };
  const handlers = new Map<GatewaySignal, () => void | Promise<void>>();
  const signals = {
    on: vi.fn(
      (signal: GatewaySignal, handler: () => void | Promise<void>) => {
        handlers.set(signal, handler);
      },
    ),
    off: vi.fn(
      (signal: GatewaySignal, handler: () => void | Promise<void>) => {
        if (handlers.get(signal) === handler) {
          handlers.delete(signal);
        }
      },
    ),
  };
  const createSweeper = vi.fn().mockReturnValue(sweeper);
  const createWatchdog = vi.fn().mockReturnValue(watchdog);
  const createServer = vi.fn().mockResolvedValue(server);

  return {
    config,
    order,
    repository,
    registry,
    sweeper,
    watchdog,
    server,
    handlers,
    signals,
    createSweeper,
    createWatchdog,
    createServer,
  };
}

describe("startGateway", () => {
  it("creates a non-persistent service-role client", async () => {
    const harness = createHarness();
    const supabase = { rpc: vi.fn() };
    const createSupabaseClient = vi.fn().mockReturnValue(supabase);
    const createRepository = vi
      .fn()
      .mockReturnValue(harness.repository);

    const runtime = await startGateway({
      config: harness.config,
      registry: harness.registry,
      createSupabaseClient,
      createRepository,
      createSweeper: harness.createSweeper,
      createWatchdog: harness.createWatchdog,
      createServer: harness.createServer,
      signals: harness.signals,
    });

    expect(createSupabaseClient).toHaveBeenCalledWith(
      CONFIG.supabaseUrl,
      CONFIG.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    expect(createRepository).toHaveBeenCalledWith(supabase);

    await runtime.shutdown();
  });

  it("checks the database lease before listening and starts sweeps afterward", async () => {
    const harness = createHarness();

    const runtime = await startGateway(harness);

    expect(harness.order).toEqual([
      "lease",
      "server.listen",
      "watchdog.start",
      "sweeper.start",
    ]);
    expect(harness.server.listen).toHaveBeenCalledWith({
      host: CONFIG.host,
      port: CONFIG.port,
    });
    expect(harness.createSweeper).toHaveBeenCalledWith(
      expect.objectContaining({
        repository: harness.repository,
        registry: harness.registry,
        intervalMs: CONFIG.pollIntervalMs,
      }),
    );
    expect(harness.createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        config: CONFIG,
        repository: harness.repository,
        registry: harness.registry,
        onConnect: expect.any(Function),
        onMessage: expect.any(Function),
      }),
    );

    const serverOptions = harness.createServer.mock.calls[0]?.[0] as {
      onConnect(deviceId: string): Promise<void>;
    };
    await serverOptions.onConnect(
      "33333333-3333-4333-8333-333333333333",
    );
    expect(harness.sweeper.sweepDevice).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
    );

    await runtime.shutdown();
  });

  it("rejects an unsafe heartbeat before building or listening", async () => {
    const harness = createHarness({
      ...CONFIG,
      heartbeatSeconds: 31,
    });

    await expect(startGateway(harness)).rejects.toThrow(
      "GATEWAY_HEARTBEAT_SECONDS must be at most 30",
    );

    expect(harness.repository.getAiTaskLeaseSeconds).toHaveBeenCalledOnce();
    expect(harness.createServer).not.toHaveBeenCalled();
    expect(harness.server.listen).not.toHaveBeenCalled();
    expect(harness.sweeper.start).not.toHaveBeenCalled();
  });

  it("handles both shutdown signals once in timer/socket/server order", async () => {
    const harness = createHarness();
    const runtime = await startGateway(harness);
    const sigterm = harness.handlers.get("SIGTERM");
    const sigint = harness.handlers.get("SIGINT");

    expect(sigterm).toBeDefined();
    expect(sigint).toBeDefined();
    await Promise.all([sigterm!(), sigint!(), runtime.shutdown()]);

    expect(harness.sweeper.stop).toHaveBeenCalledOnce();
    expect(harness.watchdog.stop).toHaveBeenCalledOnce();
    expect(harness.registry.closeAll).toHaveBeenCalledOnce();
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.order.slice(-4)).toEqual([
      "watchdog.stop",
      "sweeper.stop",
      "registry.closeAll",
      "server.close",
    ]);
    expect(harness.signals.off).toHaveBeenCalledTimes(2);
  });

  it("constructs and closes the optional canvas gateway after room shutdown", async () => {
    const harness = createHarness({
      ...CONFIG,
      canvasTrialEnabled: true,
      canvasSessionSecret: "a-32-byte-minimum-canvas-ticket-secret",
      canvasDataDir: "/tmp/meld-canvas-test",
      databaseUrl: "postgresql://localhost/meld",
    });
    const canvasSql = {
      end: vi.fn().mockImplementation(async () => {
        harness.order.push("canvas.sql.end");
      }),
    };
    const canvasManager = {
      beginShutdown: vi.fn().mockImplementation(() => {
        harness.order.push("canvas.beginShutdown");
      }),
      closeAll: vi.fn().mockImplementation(async () => {
        harness.order.push("canvas.closeAll");
      }),
    };
    const createCanvasSql = vi.fn().mockReturnValue(canvasSql);
    const createCanvasRoomManager = vi
      .fn()
      .mockReturnValue(canvasManager);

    const runtime = await startGateway({
      ...harness,
      createCanvasSql: createCanvasSql as never,
      createCanvasRoomManager: createCanvasRoomManager as never,
    });

    expect(createCanvasSql).toHaveBeenCalledWith(
      "postgresql://localhost/meld",
    );
    expect(createCanvasRoomManager).toHaveBeenCalledWith(
      expect.objectContaining({
        dataDir: "/tmp/meld-canvas-test",
        idleEvictionMs: 120_000,
      }),
    );
    expect(harness.createServer).toHaveBeenCalledWith(
      expect.objectContaining({ canvasRoomManager: canvasManager }),
    );

    await runtime.shutdown();
    expect(canvasManager.beginShutdown).toHaveBeenCalledOnce();
    expect(canvasManager.closeAll).toHaveBeenCalledOnce();
    expect(canvasSql.end).toHaveBeenCalledOnce();
    expect(harness.order.slice(-3)).toEqual([
      "canvas.closeAll",
      "server.close",
      "canvas.sql.end",
    ]);
  });

  it.each(["buildServer", "listen"])(
    "cleans up canvas resources when %s fails during startup",
    async (failurePoint) => {
      const harness = createHarness({
        ...CONFIG,
        canvasTrialEnabled: true,
        canvasSessionSecret: "a-32-byte-minimum-canvas-ticket-secret",
        canvasDataDir: "/tmp/meld-canvas-startup-failure",
        databaseUrl: "postgresql://localhost/meld",
      });
      const startupError = new Error(`${failurePoint} failed`);
      const canvasSql = { end: vi.fn().mockResolvedValue(undefined) };
      const canvasManager = {
        beginShutdown: vi.fn(),
        closeAll: vi.fn().mockResolvedValue(undefined),
      };
      const createCanvasSql = vi.fn().mockReturnValue(canvasSql);
      const createCanvasRoomManager = vi
        .fn()
        .mockReturnValue(canvasManager);
      const createServer =
        failurePoint === "buildServer"
          ? vi.fn().mockRejectedValue(startupError)
          : harness.createServer;
      if (failurePoint === "listen") {
        harness.server.listen.mockRejectedValue(startupError);
      }

      await expect(
        startGateway({
          ...harness,
          createServer,
          createCanvasSql: createCanvasSql as never,
          createCanvasRoomManager: createCanvasRoomManager as never,
        }),
      ).rejects.toBe(startupError);
      expect(canvasManager.beginShutdown).toHaveBeenCalledOnce();
      expect(canvasManager.closeAll).toHaveBeenCalledOnce();
      expect(canvasSql.end).toHaveBeenCalledOnce();
      if (failurePoint === "listen") {
        expect(harness.server.close).toHaveBeenCalledOnce();
      }
    },
  );
});
