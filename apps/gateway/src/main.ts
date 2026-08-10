import { pathToFileURL } from "node:url";
import postgres from "postgres";
// Installs a WebSocket global for @supabase/realtime-js under Node 20. Must run
// before any Supabase client is constructed, so keep it above that import.
import "./supabase-websocket";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  assertHeartbeatWithinLease,
  readGatewayConfig,
  type GatewayConfig,
} from "./config";
import {
  createDispatchSweeper,
  type DispatchSweeper,
  type DispatchSweeperOptions,
} from "./dispatch/sweeper";
import { buildServer } from "./server";
import {
  createCanvasAuthorityLeaseFactory,
} from "./canvas/canvas-authority";
import { CanvasRoomManager } from "./canvas/canvas-room-manager";
import {
  createTaskRepository,
  type TaskRepository,
} from "./tasks/task-repository";
import { DeviceSessionRegistry } from "./ws/device-session";
import { createProtocolHandler } from "./ws/protocol-handler";
import {
  createHeartbeatWatchdog,
  type HeartbeatWatchdog,
} from "./ws/heartbeat-watchdog";

export type GatewaySignal = "SIGINT" | "SIGTERM";

interface GatewaySignals {
  on(
    signal: GatewaySignal,
    handler: () => void | Promise<void>,
  ): void;
  off(
    signal: GatewaySignal,
    handler: () => void | Promise<void>,
  ): void;
}

interface GatewayServer {
  listen(options: { host: string; port: number }): Promise<string>;
  close(): Promise<void>;
}

type GatewayServerFactory = (
  options: Parameters<typeof buildServer>[0],
) => Promise<GatewayServer>;

type GatewayCanvasSqlFactory = (url: string) => postgres.Sql;

type GatewaySupabaseClientFactory = (
  url: string,
  key: string,
  options: {
    auth: {
      persistSession: false;
      autoRefreshToken: false;
      detectSessionInUrl: false;
    };
  },
) => Pick<SupabaseClient, "rpc">;

export interface StartGatewayDependencies {
  config?: GatewayConfig;
  env?: Record<string, string | undefined>;
  repository?: TaskRepository;
  registry?: DeviceSessionRegistry;
  createSupabaseClient?: GatewaySupabaseClientFactory;
  createRepository?: typeof createTaskRepository;
  createSweeper?: (
    options: DispatchSweeperOptions,
  ) => DispatchSweeper;
  createServer?: GatewayServerFactory;
  createWatchdog?: typeof createHeartbeatWatchdog;
  canvasRoomManager?: CanvasRoomManager;
  createCanvasSql?: GatewayCanvasSqlFactory;
  createCanvasRoomManager?: (
    options: ConstructorParameters<typeof CanvasRoomManager>[0],
  ) => CanvasRoomManager;
  signals?: GatewaySignals;
}

export interface GatewayRuntime {
  config: GatewayConfig;
  repository: TaskRepository;
  registry: DeviceSessionRegistry;
  shutdown(): Promise<void>;
}

const processSignals: GatewaySignals = {
  on(signal, handler) {
    process.on(signal, handler);
  },
  off(signal, handler) {
    process.off(signal, handler);
  },
};

export async function startGateway(
  dependencies: StartGatewayDependencies = {},
): Promise<GatewayRuntime> {
  const config =
    dependencies.config ??
    readGatewayConfig(dependencies.env ?? process.env);
  const createSupabaseClient =
    dependencies.createSupabaseClient ?? createClient;
  const createRepository =
    dependencies.createRepository ?? createTaskRepository;
  const repository =
    dependencies.repository ??
    createRepository(
      createSupabaseClient(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        },
      ),
    );

  const leaseSeconds = await repository.getAiTaskLeaseSeconds();
  assertHeartbeatWithinLease({
    heartbeatSeconds: config.heartbeatSeconds,
    leaseSeconds,
  });

  const registry =
    dependencies.registry ?? new DeviceSessionRegistry();
  const sweeperFactory =
    dependencies.createSweeper ?? createDispatchSweeper;
  const sweeper = sweeperFactory({
    repository,
    registry,
    intervalMs: config.pollIntervalMs,
  });
  const protocol = createProtocolHandler({ repository });
  const watchdogFactory =
    dependencies.createWatchdog ?? createHeartbeatWatchdog;
  const watchdog: HeartbeatWatchdog = watchdogFactory({
    registry,
    heartbeatSeconds: config.heartbeatSeconds,
  });
  let canvasSql: postgres.Sql | undefined;
  let canvasRoomManager = dependencies.canvasRoomManager;
  let server: GatewayServer | undefined;
  try {
    if (config.canvasTrialEnabled && !canvasRoomManager) {
      const createCanvasSql =
        dependencies.createCanvasSql ??
        ((url: string) => postgres(url, { max: 20 }));
      canvasSql = createCanvasSql(config.databaseUrl!);
      const createCanvasRoomManager =
        dependencies.createCanvasRoomManager ??
        ((options: ConstructorParameters<typeof CanvasRoomManager>[0]) =>
          new CanvasRoomManager(options));
      canvasRoomManager = createCanvasRoomManager({
        dataDir: config.canvasDataDir!,
        idleEvictionMs: config.canvasIdleEvictionMs,
        authority: createCanvasAuthorityLeaseFactory(canvasSql),
      });
    }
    const serverFactory = dependencies.createServer ?? buildServer;
    server = await serverFactory({
      config,
      repository,
      registry,
      onMessage: protocol.handle,
      onConnect: sweeper.sweepDevice,
      canvasRoomManager,
    });

    await server.listen({ host: config.host, port: config.port });
  } catch (error) {
    canvasRoomManager?.beginShutdown();
    try {
      await canvasRoomManager?.closeAll();
    } catch {
      // Preserve the startup error while still attempting every cleanup step.
    }
    try {
      await server?.close();
    } catch {
      // Preserve the startup error.
    }
    try {
      await canvasSql?.end();
    } catch {
      // Preserve the startup error.
    }
    throw error;
  }

  if (!server) {
    throw new Error("Gateway server was not created");
  }
  const runningServer = server;

  watchdog.start();
  sweeper.start();

  const signals = dependencies.signals ?? processSignals;
  let shutdownPromise: Promise<void> | undefined;

  function handleSignal(): void {
    void shutdown().catch((error: unknown) => {
      console.error("Gateway shutdown failed", error);
      process.exitCode = 1;
    });
  }

  function shutdown(): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      signals.off("SIGINT", handleSignal);
      signals.off("SIGTERM", handleSignal);
      watchdog.stop();
      sweeper.stop();
      registry.closeAll();
      canvasRoomManager?.beginShutdown();
      await canvasRoomManager?.closeAll();
      await runningServer.close();
      await canvasSql?.end();
    })();
    return shutdownPromise;
  }

  signals.on("SIGINT", handleSignal);
  signals.on("SIGTERM", handleSignal);

  return { config, repository, registry, shutdown };
}

function isEntryModule(): boolean {
  const entryPath = process.argv[1];
  return (
    entryPath !== undefined &&
    import.meta.url === pathToFileURL(entryPath).href
  );
}

if (isEntryModule()) {
  void startGateway().catch((error: unknown) => {
    console.error("Gateway failed to start", error);
    process.exitCode = 1;
  });
}
