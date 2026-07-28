import { once } from "node:events";
import { MAX_WS_FRAME_BYTES } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawData } from "ws";
import type { GatewayConfig } from "./config";
import { hashDeviceSecret } from "./auth/device-token";
import type { TaskRepository } from "./tasks/task-repository";
import {
  DeviceSession,
  DeviceSessionRegistry,
} from "./ws/device-session";
import { buildServer } from "./server";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "77777777-7777-4777-8777-777777777777";
const SECRET = "device-secret";
const CONFIG: GatewayConfig = {
  host: "127.0.0.1",
  port: 8787,
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseServiceRoleKey: "service-role-key",
  pollIntervalMs: 3000,
  heartbeatSeconds: 30,
};

const servers: Awaited<ReturnType<typeof buildServer>>[] = [];

function createRepository() {
  return {
    getExecutionDeviceForAuth: vi.fn().mockResolvedValue({
      id: DEVICE_ID,
      userId: USER_ID,
      tokenHash: hashDeviceSecret(SECRET),
      status: "active",
    }),
    recordDeviceConnection: vi.fn().mockResolvedValue(undefined),
  } as unknown as TaskRepository;
}

async function createServer(overrides: {
  repository?: TaskRepository;
  registry?: DeviceSessionRegistry;
  onMessage?: (
    session: DeviceSession,
    data: RawData,
  ) => void | Promise<void>;
  onConnect?: (deviceId: string) => void | Promise<void>;
} = {}) {
  const server = await buildServer({
    config: CONFIG,
    repository: overrides.repository ?? createRepository(),
    registry: overrides.registry ?? new DeviceSessionRegistry(),
    onMessage:
      overrides.onMessage ??
      vi.fn<(session: DeviceSession, data: RawData) => void>(),
    onConnect:
      overrides.onConnect ?? vi.fn<(deviceId: string) => void>(),
  });
  servers.push(server);
  await server.ready();
  return server;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("gateway server", () => {
  it("reports gateway health", async () => {
    const server = await createServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("keeps the WebSocket payload ceiling aligned with contracts", () => {
    expect(MAX_WS_FRAME_BYTES).toBe(1024 * 1024);
  });

  it("closes a socket that sends a frame above the payload ceiling", async () => {
    const onMessage = vi.fn();
    const server = await createServer({ onMessage });
    const socket = await server.injectWS("/ws", {
      headers: {
        authorization: `Device ${DEVICE_ID}.${SECRET}`,
      },
    });

    socket.send(Buffer.alloc(MAX_WS_FRAME_BYTES + 1));
    const [code] = (await once(socket, "close")) as [number, Buffer];

    expect(code).toBe(1009);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("rejects unauthorized upgrades before opening a session", async () => {
    const registry = new DeviceSessionRegistry();
    const onConnect = vi.fn();
    const server = await createServer({ registry, onConnect });

    await expect(server.injectWS("/ws")).rejects.toThrow(
      "Unexpected server response: 401",
    );
    expect(onConnect).not.toHaveBeenCalled();
    expect(registry.connectedDeviceIds()).toEqual([]);
  });

  it("accepts authenticated sessions and routes socket callbacks", async () => {
    const registry = new DeviceSessionRegistry();
    const onConnect = vi.fn();
    const onMessage = vi.fn();
    const server = await createServer({
      registry,
      onConnect,
      onMessage,
    });
    let accepted:
      | { type: "session.accepted"; heartbeatSeconds: number }
      | undefined;

    const socket = await server.injectWS(
      "/ws",
      {
        headers: {
          authorization: `Device ${DEVICE_ID}.${SECRET}`,
        },
      },
      {
        onInit(client) {
          client.once("message", (data) => {
            accepted = JSON.parse(data.toString()) as typeof accepted;
          });
        },
      },
    );
    await vi.waitFor(() => {
      expect(accepted).toEqual({
        type: "session.accepted",
        heartbeatSeconds: 30,
      });
    });
    expect(registry.connectedDeviceIds()).toEqual([DEVICE_ID]);
    expect(onConnect).toHaveBeenCalledWith(DEVICE_ID);

    socket.send("hello");
    await vi.waitFor(() => {
      expect(onMessage).toHaveBeenCalledOnce();
    });
    expect(onMessage.mock.calls[0]?.[0].deviceId).toBe(DEVICE_ID);
    expect(Buffer.from(onMessage.mock.calls[0]?.[1]).toString()).toBe(
      "hello",
    );

    const serverSocket = [...server.websocketServer.clients][0];
    expect(serverSocket).toBeDefined();
    serverSocket!.emit("close", 1000, Buffer.alloc(0));
    serverSocket!.close();
    await once(socket, "close");
    await vi.waitFor(() => {
      expect(registry.connectedDeviceIds()).toEqual([]);
    });
  });

  it("processes back-to-back task events in socket order", async () => {
    const taskId = "11111111-1111-4111-8111-111111111111";
    const attemptId = "22222222-2222-4222-8222-222222222222";
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started: number[] = [];
    const accepted: number[] = [];
    const onMessage = vi.fn(
      async (session: DeviceSession, data: RawData) => {
        const frame = JSON.parse(
          Buffer.isBuffer(data)
            ? data.toString("utf8")
            : Buffer.from(data as ArrayBuffer).toString("utf8"),
        ) as { sequence: number };
        started.push(frame.sequence);
        if (frame.sequence === 1) {
          await firstReleased;
        }
        accepted.push(frame.sequence);
        session.send({
          type: "task.event_ack",
          taskId,
          attemptId,
          sequence: frame.sequence,
        });
      },
    );
    const server = await createServer({ onMessage });
    const socket = await server.injectWS("/ws", {
      headers: {
        authorization: `Device ${DEVICE_ID}.${SECRET}`,
      },
    });
    const acknowledgements: number[] = [];
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as {
        type: string;
        sequence?: number;
      };
      if (message.type === "task.event_ack") {
        acknowledgements.push(message.sequence!);
      }
    });

    socket.send(
      JSON.stringify({
        type: "task.event",
        taskId,
        attemptId,
        sequence: 1,
        event: { type: "text.delta", text: "First" },
      }),
    );
    socket.send(
      JSON.stringify({
        type: "task.event",
        taskId,
        attemptId,
        sequence: 2,
        event: { type: "text.delta", text: "Second" },
      }),
    );

    await vi.waitFor(() => {
      expect(started).toEqual([1]);
    });
    releaseFirst();
    await vi.waitFor(() => {
      expect(acknowledgements).toEqual([1, 2]);
    });

    expect(started).toEqual([1, 2]);
    expect(accepted).toEqual([1, 2]);
    expect(onMessage).toHaveBeenCalledTimes(2);
    socket.close();
    await once(socket, "close");
  });
});
