import { EventEmitter } from "node:events";
import type {
  ActiveTaskLease,
  DeviceToServerMessage,
  ServerToDeviceMessage,
} from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../pairing/credential-store";
import {
  GatewayClient,
  type GatewaySocket,
  type GatewaySocketFactory,
} from "./gateway-client";

const DEVICE_ID = "40000000-0000-0000-0000-000000000001";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";

class RecordingSocket extends EventEmitter implements GatewaySocket {
  readonly sent: DeviceToServerMessage[] = [];
  readyState = 1;

  constructor(
    readonly url: string,
    readonly headers: Record<string, string>,
  ) {
    super();
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as DeviceToServerMessage);
  }

  close(): void {
    this.readyState = 3;
  }

  emitMessage(message: ServerToDeviceMessage): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  emitUnexpectedResponse(statusCode: number): void {
    this.emit("unexpected-response", {}, { statusCode });
  }
}

function recordingSocketFactory() {
  const created: RecordingSocket[] = [];
  const create: GatewaySocketFactory = (url, options) => {
    const socket = new RecordingSocket(
      url,
      options.headers,
    );
    created.push(socket);
    return socket;
  };

  return {
    create,
    created,
    last() {
      const socket = created.at(-1);
      if (!socket) {
        throw new Error("No socket was created");
      }
      return socket;
    },
  };
}

async function credentialStore(): Promise<MemoryCredentialStore> {
  const store = new MemoryCredentialStore();
  await store.save({
    deviceId: DEVICE_ID,
    deviceToken: "dt_secret",
  });
  return store;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GatewayClient", () => {
  it("reads its credential from the store and presents it as a device header", async () => {
    const store = await credentialStore();
    const sockets = recordingSocketFactory();
    const client = new GatewayClient({
      gatewayUrl: "ws://127.0.0.1:8787/ws",
      credentialStore: store,
      createSocket: sockets.create,
    });

    await client.start();

    expect(sockets.last().headers.authorization).toBe(
      `Device ${DEVICE_ID}.dt_secret`,
    );
  });

  it("stops permanently when the gateway rejects the credential", async () => {
    vi.useFakeTimers();
    const sockets = recordingSocketFactory();
    const client = new GatewayClient({
      gatewayUrl: "ws://127.0.0.1:8787/ws",
      credentialStore: await credentialStore(),
      createSocket: sockets.create,
    });

    await client.start();
    sockets.last().emitUnexpectedResponse(401);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets.created).toHaveLength(1);
    expect(client.stoppedReason).toBe("re-pair required");
  });

  it("keeps retrying when the gateway is merely unreachable", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const sockets = recordingSocketFactory();
    const client = new GatewayClient({
      gatewayUrl: "ws://127.0.0.1:8787/ws",
      credentialStore: await credentialStore(),
      createSocket: sockets.create,
    });

    await client.start();
    sockets.last().emit("error", new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(500);

    expect(sockets.created).toHaveLength(2);
    expect(client.stoppedReason).toBeUndefined();
  });

  it("does not schedule duplicate retries for error and close from one socket", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const sockets = recordingSocketFactory();
    const client = new GatewayClient({
      gatewayUrl: "ws://127.0.0.1:8787/ws",
      credentialStore: await credentialStore(),
      createSocket: sockets.create,
    });

    await client.start();
    const socket = sockets.last();
    socket.emit("error", new Error("ECONNREFUSED"));
    socket.emit("close");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sockets.created).toHaveLength(2);
  });

  it("aborts a stub run when its heartbeat lease is omitted", async () => {
    vi.useFakeTimers();
    const sockets = recordingSocketFactory();
    const onFenced = vi.fn<(lease: ActiveTaskLease) => void>();
    const client = new GatewayClient({
      gatewayUrl: "ws://127.0.0.1:8787/ws",
      credentialStore: await credentialStore(),
      createSocket: sockets.create,
      onFenced,
    });

    await client.start();
    const socket = sockets.last();
    socket.emitMessage({
      type: "session.accepted",
      heartbeatSeconds: 1,
    });
    socket.emitMessage({
      type: "heartbeat.ack",
      renewedTasks: [],
    });
    socket.emitMessage({
      type: "task.payload",
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      provider: "codex",
      context: {
        taskId: TASK_ID,
        initiatingUserId: "33333333-3333-4333-8333-333333333333",
        organizationId: "44444444-4444-4444-8444-444444444444",
        roomId: "55555555-5555-4555-8555-555555555555",
        kind: "room_reply",
        instruction: "Write a concise answer.",
        messages: [],
        attachments: [],
        evidence: [],
        decisions: [],
      },
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent).toContainEqual(
      expect.objectContaining({
        type: "heartbeat",
        activeTasks: [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
      }),
    );

    socket.emitMessage({
      type: "heartbeat.ack",
      renewedTasks: [],
    });
    const eventCount = socket.sent.filter(
      ({ type }) => type === "task.event",
    ).length;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(eventCount).toBe(2);
    expect(onFenced).toHaveBeenCalledWith({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(
      socket.sent.filter(({ type }) => type === "task.event"),
    ).toHaveLength(eventCount);
  });
});
