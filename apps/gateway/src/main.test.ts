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
  const createServer = vi.fn().mockResolvedValue(server);

  return {
    config,
    order,
    repository,
    registry,
    sweeper,
    server,
    handlers,
    signals,
    createSweeper,
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
    expect(harness.registry.closeAll).toHaveBeenCalledOnce();
    expect(harness.server.close).toHaveBeenCalledOnce();
    expect(harness.order.slice(-3)).toEqual([
      "sweeper.stop",
      "registry.closeAll",
      "server.close",
    ]);
    expect(harness.signals.off).toHaveBeenCalledTimes(2);
  });
});
