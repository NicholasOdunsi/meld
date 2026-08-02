import { EventEmitter } from "node:events";
import type {
  ActiveTaskLease,
  AIContextPackage,
  DeviceToServerMessage,
  Provider,
  ProviderStatus,
  RoomReplyResult,
  ServerToDeviceMessage,
  TaskEvent,
} from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MemoryCredentialStore,
  type CredentialStore,
  type DeviceCredential,
} from "../pairing/credential-store";
import {
  GatewayClient,
  type GatewayClientOptions,
  type GatewaySocket,
  type GatewaySocketFactory,
  type ProviderSetupLike,
  type ProviderSetupProgress,
  type RoomReplyEnvelope,
  type TaskEmit,
  type TaskExecutorLike,
  type TaskPayload,
} from "./gateway-client";

const DEVICE_ID = "40000000-0000-0000-0000-000000000001";
const TASK_ID = "11111111-1111-4111-8111-111111111111";
const ATTEMPT_ID = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";

const CODEX_STATUS: ProviderStatus = {
  provider: "codex",
  installation: "installed",
  version: "1.0.0",
  authentication: "authenticated",
  compatibility: "supported",
};

const CLAUDE_NOT_INSTALLED: ProviderStatus = {
  provider: "claude",
  installation: "not_installed",
  version: null,
  authentication: "unknown",
  compatibility: "unavailable",
};

function roomReply(response: string): RoomReplyResult {
  return {
    response,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
  };
}

function contextPackage(): AIContextPackage {
  return {
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
  };
}

function taskPayloadMessage(
  provider: Provider = "codex",
): Extract<ServerToDeviceMessage, { type: "task.payload" }> {
  return {
    type: "task.payload",
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    provider,
    context: contextPackage(),
  };
}

class RecordingSocket extends EventEmitter implements GatewaySocket {
  readonly sent: DeviceToServerMessage[] = [];
  readonly closeCalls: Array<{
    code: number | undefined;
    reason: string | undefined;
  }> = [];
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

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
  }

  emitMessage(message: ServerToDeviceMessage): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  emitUnexpectedResponse(statusCode: number): void {
    this.emit("unexpected-response", {}, { statusCode });
  }

  sentOfType<T extends DeviceToServerMessage["type"]>(
    type: T,
  ): Extract<DeviceToServerMessage, { type: T }>[] {
    return this.sent.filter(
      (message): message is Extract<DeviceToServerMessage, { type: T }> =>
        message.type === type,
    );
  }
}

function recordingSocketFactory() {
  const created: RecordingSocket[] = [];
  const create: GatewaySocketFactory = (url, options) => {
    const socket = new RecordingSocket(url, options.headers);
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

interface SetupInvocation {
  provider: Provider;
  onProgress: ProviderSetupProgress;
  signal: AbortSignal | undefined;
  resolve(status: ProviderStatus): void;
  reject(error: unknown): void;
}

function fakeProviderSetup() {
  const invocations: SetupInvocation[] = [];
  const connect = vi.fn(
    (
      provider: Provider,
      onProgress: ProviderSetupProgress,
      signal?: AbortSignal,
    ) =>
      new Promise<ProviderStatus>((resolve, reject) => {
        invocations.push({ provider, onProgress, signal, resolve, reject });
      }),
  );
  const setup: ProviderSetupLike = { connect };
  return { setup, connect, invocations };
}

interface ExecuteInvocation {
  payload: TaskPayload;
  signal: AbortSignal | undefined;
  emit: TaskEmit;
  resolve(envelope: RoomReplyEnvelope): void;
  reject(error: unknown): void;
}

function fakeTaskExecutor() {
  const invocations: ExecuteInvocation[] = [];
  const execute = vi.fn(
    (payload: TaskPayload, signal: AbortSignal | undefined, emit: TaskEmit) =>
      new Promise<RoomReplyEnvelope>((resolve, reject) => {
        invocations.push({ payload, signal, emit, resolve, reject });
      }),
  );
  const cleanup = vi.fn(async () => {});
  const executor: TaskExecutorLike = { execute, cleanup };
  return { executor, execute, cleanup, invocations };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function deferredCredentialStore(
  ...reads: Array<Promise<DeviceCredential | null>>
): CredentialStore {
  return {
    save: () => Promise.resolve(),
    read: () => {
      const next = reads.shift();
      if (!next) {
        throw new Error("Unexpected credential read");
      }
      return next;
    },
    delete: () => Promise.resolve(),
    probe: () => Promise.resolve(true),
  };
}

async function credentialStore(): Promise<MemoryCredentialStore> {
  const store = new MemoryCredentialStore();
  await store.save({ deviceId: DEVICE_ID, deviceToken: "dt_secret" });
  return store;
}

interface Harness {
  client: GatewayClient;
  sockets: ReturnType<typeof recordingSocketFactory>;
  setup: ReturnType<typeof fakeProviderSetup>;
  executor: ReturnType<typeof fakeTaskExecutor>;
  detectProviders: ReturnType<typeof vi.fn>;
}

async function makeClient(
  overrides: Partial<GatewayClientOptions> = {},
  statuses: ProviderStatus[] = [CODEX_STATUS, CLAUDE_NOT_INSTALLED],
): Promise<Harness> {
  const sockets = recordingSocketFactory();
  const setup = fakeProviderSetup();
  const executor = fakeTaskExecutor();
  const detectProviders = vi.fn(async () => statuses);
  const client = new GatewayClient({
    gatewayUrl: "ws://127.0.0.1:8787/ws",
    credentialStore: await credentialStore(),
    createSocket: sockets.create,
    requestedProvider: "codex",
    createProviderSetup: () => setup.setup,
    createTaskExecutor: () => executor.executor,
    detectProviders,
    ...overrides,
  });
  return { client, sockets, setup, executor, detectProviders };
}

/** Lets queued microtasks (settled fake promises) run before assertions. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("GatewayClient lifecycle", () => {
  it("reads its credential from the store and presents it as a device header", async () => {
    const { client, sockets } = await makeClient();

    await client.start();

    expect(sockets.last().headers.authorization).toBe(
      `Device ${DEVICE_ID}.dt_secret`,
    );
  });

  it("stops permanently when the gateway rejects the credential", async () => {
    vi.useFakeTimers();
    const onTerminal = vi.fn();
    const { client, sockets } = await makeClient({ onTerminal });

    await client.start();
    sockets.last().emitUnexpectedResponse(401);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets.created).toHaveLength(1);
    expect(client.stoppedReason).toBe("re-pair required");
    expect(sockets.last().closeCalls).toContainEqual({
      code: 1008,
      reason: "re-pair required",
    });
    expect(onTerminal).toHaveBeenCalledWith("re-pair required");
  });

  it("exits terminally and reports re-pair when no credential exists", async () => {
    const onTerminal = vi.fn();
    const { client, sockets } = await makeClient({
      credentialStore: new MemoryCredentialStore(),
      onTerminal,
    });

    await client.start();

    expect(sockets.created).toHaveLength(0);
    expect(client.stoppedReason).toBe("re-pair required");
    expect(onTerminal).toHaveBeenCalledWith("re-pair required");
  });

  it("does not let a pending read from a stopped lifecycle overwrite a restarted connection", async () => {
    const firstRead = deferred<DeviceCredential | null>();
    const secondRead = deferred<DeviceCredential | null>();
    const { client, sockets } = await makeClient({
      credentialStore: deferredCredentialStore(
        firstRead.promise,
        secondRead.promise,
      ),
    });

    const firstStart = client.start();
    client.stop();
    const restarted = client.start();

    secondRead.resolve({ deviceId: DEVICE_ID, deviceToken: "current_secret" });
    await restarted;
    firstRead.resolve({ deviceId: DEVICE_ID, deviceToken: "stale_secret" });
    await firstStart;

    expect(sockets.created).toHaveLength(1);
    expect(sockets.last().headers.authorization).toBe(
      `Device ${DEVICE_ID}.current_secret`,
    );
  });

  it("keeps retrying when the gateway is merely unreachable", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets } = await makeClient();

    await client.start();
    sockets.last().emit("error", new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(500);

    expect(sockets.created).toHaveLength(2);
    expect(client.stoppedReason).toBeUndefined();
  });

  it("does not schedule duplicate retries for error and close from one socket", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets } = await makeClient();

    await client.start();
    const socket = sockets.last();
    socket.emit("error", new Error("ECONNREFUSED"));
    socket.emit("close");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sockets.created).toHaveLength(2);
  });

  it("ignores a 401 emitted by a retired socket", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets } = await makeClient();

    await client.start();
    const retired = sockets.last();
    retired.emit("error", new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(500);
    const current = sockets.last();

    retired.emitUnexpectedResponse(401);

    expect(client.stoppedReason).toBeUndefined();
    expect(current.closeCalls).toHaveLength(0);
  });

  it("ignores messages emitted by a retired socket", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets } = await makeClient();

    await client.start();
    const retired = sockets.last();
    retired.emit("error", new Error("ECONNREFUSED"));
    await vi.advanceTimersByTimeAsync(500);
    const current = sockets.last();

    retired.emitMessage({ type: "session.accepted", heartbeatSeconds: 30 });
    await flush();

    expect(current.sentOfType("provider.status")).toHaveLength(0);
  });
});

describe("GatewayClient provider status", () => {
  it("publishes both providers, including a not-installed one, after acceptance", async () => {
    const { client, sockets, detectProviders } = await makeClient();

    await client.start();
    sockets.last().emitMessage({
      type: "session.accepted",
      heartbeatSeconds: 30,
    });
    await flush();

    expect(detectProviders).toHaveBeenCalled();
    expect(sockets.last().sentOfType("provider.status")).toContainEqual({
      type: "provider.status",
      providers: [CODEX_STATUS, CLAUDE_NOT_INSTALLED],
    });
  });
});

describe("GatewayClient provider setup", () => {
  it("treats repeated setup announcements for one request id as a single run", async () => {
    const { client, sockets, setup } = await makeClient();
    await client.start();
    const socket = sockets.last();

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });

    expect(setup.connect).toHaveBeenCalledTimes(1);
    expect(setup.invocations).toHaveLength(1);
  });

  it("forwards progress then a completion, and republishes provider status", async () => {
    const { client, sockets, setup, detectProviders } = await makeClient();
    await client.start();
    const socket = sockets.last();
    socket.emitMessage({ type: "session.accepted", heartbeatSeconds: 30 });
    await flush();
    const before = detectProviders.mock.calls.length;

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    const invocation = setup.invocations[0]!;
    await invocation.onProgress("installing");
    await invocation.onProgress("authenticating");
    await invocation.onProgress("verifying");
    invocation.resolve(CODEX_STATUS);
    await flush();

    expect(
      socket.sentOfType("provider.setup.progress").map((frame) => frame.stage),
    ).toEqual(["installing", "authenticating", "verifying"]);
    expect(socket.sentOfType("provider.setup.complete")).toContainEqual(
      expect.objectContaining({
        type: "provider.setup.complete",
        requestId: REQUEST_ID,
        provider: "codex",
        status: CODEX_STATUS,
      }),
    );
    expect(detectProviders.mock.calls.length).toBeGreaterThan(before);
  });

  it("settles a failed setup with a typed failure frame", async () => {
    const { client, sockets, setup } = await makeClient();
    await client.start();
    const socket = sockets.last();

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    setup.invocations[0]!.reject(
      Object.assign(new Error("nope"), { code: "authentication_failed" }),
    );
    await flush();

    expect(socket.sentOfType("provider.setup.failed")).toContainEqual(
      expect.objectContaining({
        type: "provider.setup.failed",
        requestId: REQUEST_ID,
        provider: "codex",
        code: "authentication_failed",
      }),
    );
  });

  it("resynchronises rather than resending a rejected stage", async () => {
    const { client, sockets, setup } = await makeClient();
    await client.start();
    const socket = sockets.last();

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    const invocation = setup.invocations[0]!;
    await invocation.onProgress("installing");

    socket.emitMessage({
      type: "provider.setup.rejected",
      requestId: REQUEST_ID,
      reason: "invalid_provider_setup_progress",
    });
    await invocation.onProgress("installing");
    await invocation.onProgress("authenticating");

    const stages = socket
      .sentOfType("provider.setup.progress")
      .map((frame) => frame.stage);
    expect(stages.filter((stage) => stage === "installing")).toHaveLength(1);
    expect(socket.sentOfType("provider.setup.failed")).toHaveLength(0);
  });

  it("settles as a typed failure when a settlement is rejected", async () => {
    const { client, sockets, setup } = await makeClient();
    await client.start();
    const socket = sockets.last();

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    setup.invocations[0]!.resolve(CODEX_STATUS);
    await flush();

    socket.emitMessage({
      type: "provider.setup.rejected",
      requestId: REQUEST_ID,
      reason: "invalid_provider_setup_settlement",
    });
    await flush();

    expect(socket.sentOfType("provider.setup.failed")).toContainEqual(
      expect.objectContaining({
        type: "provider.setup.failed",
        requestId: REQUEST_ID,
        provider: "codex",
        code: "verification_failed",
      }),
    );
  });

  it("does not retry after a conflicting settlement rejection", async () => {
    const { client, sockets, setup } = await makeClient();
    await client.start();
    const socket = sockets.last();

    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    setup.invocations[0]!.resolve(CODEX_STATUS);
    await flush();

    socket.emitMessage({
      type: "provider.setup.rejected",
      requestId: REQUEST_ID,
      reason: "conflicting_provider_setup_settlement",
    });
    socket.emitMessage({
      type: "provider.setup",
      requestId: REQUEST_ID,
      provider: "codex",
    });
    await flush();

    expect(setup.connect).toHaveBeenCalledTimes(1);
    expect(socket.sentOfType("provider.setup.failed")).toHaveLength(0);
  });
});

describe("GatewayClient task execution", () => {
  it("starts the executor for the provider named in the payload", async () => {
    const { client, sockets, executor } = await makeClient();
    await client.start();

    sockets.last().emitMessage(taskPayloadMessage("claude"));

    expect(executor.execute).toHaveBeenCalledTimes(1);
    expect(executor.invocations[0]!.payload).toMatchObject({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      provider: "claude",
    });
  });

  it("assigns monotonically increasing sequence numbers to events", async () => {
    const { client, sockets, executor } = await makeClient();
    await client.start();
    const socket = sockets.last();
    socket.emitMessage(taskPayloadMessage());
    const { emit } = executor.invocations[0]!;

    const events: TaskEvent[] = [
      { type: "progress", label: "Starting" },
      { type: "text.delta", text: "Hello" },
      { type: "progress", label: "Finishing", percent: 100 },
    ];
    for (const event of events) {
      emit(event);
    }

    expect(
      socket.sentOfType("task.event").map((frame) => frame.sequence),
    ).toEqual([1, 2, 3]);
  });

  it("waits for the terminal acknowledgement before cleaning up", async () => {
    const { client, sockets, executor } = await makeClient();
    await client.start();
    const socket = sockets.last();
    socket.emitMessage(taskPayloadMessage());

    executor.invocations[0]!.resolve({
      kind: "room_reply",
      payload: roomReply("Answer."),
      partial: false,
    });
    await flush();

    expect(socket.sentOfType("task.complete")).toHaveLength(1);
    expect(executor.cleanup).not.toHaveBeenCalled();

    socket.emitMessage({
      type: "task.terminal_ack",
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      status: "completed",
    });
    await flush();

    expect(executor.cleanup).toHaveBeenCalledWith(TASK_ID, ATTEMPT_ID);
  });

  it("aborts the run and reports cancellation on task.cancel", async () => {
    const { client, sockets, executor } = await makeClient();
    await client.start();
    const socket = sockets.last();
    socket.emitMessage(taskPayloadMessage());
    const invocation = executor.invocations[0]!;

    socket.emitMessage({
      type: "task.cancel",
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
    });

    expect(invocation.signal?.aborted).toBe(true);
    expect(socket.sentOfType("task.cancelled")).toHaveLength(1);
    expect(executor.cleanup).toHaveBeenCalledWith(TASK_ID, ATTEMPT_ID);
  });

  it("aborts the run when its heartbeat lease is omitted", async () => {
    vi.useFakeTimers();
    const onFenced = vi.fn<(lease: ActiveTaskLease) => void>();
    const { client, sockets, executor } = await makeClient({ onFenced });

    await client.start();
    const socket = sockets.last();
    socket.emitMessage({ type: "session.accepted", heartbeatSeconds: 1 });
    socket.emitMessage({ type: "heartbeat.ack", renewedTasks: [] });
    socket.emitMessage(taskPayloadMessage());
    const invocation = executor.invocations[0]!;
    invocation.emit({ type: "progress", label: "Working", percent: 10 });
    invocation.emit({ type: "text.delta", text: "partial" });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent).toContainEqual(
      expect.objectContaining({
        type: "heartbeat",
        activeTasks: [{ taskId: TASK_ID, attemptId: ATTEMPT_ID }],
      }),
    );

    socket.emitMessage({ type: "heartbeat.ack", renewedTasks: [] });
    const eventCount = socket.sentOfType("task.event").length;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(eventCount).toBe(2);
    expect(invocation.signal?.aborted).toBe(true);
    expect(onFenced).toHaveBeenCalledWith({
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
    });
    expect(socket.sentOfType("task.event")).toHaveLength(eventCount);
  });

  it("aborts active provider work when the socket is lost", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets, executor } = await makeClient();
    await client.start();
    const socket = sockets.last();
    socket.emitMessage(taskPayloadMessage());
    const invocation = executor.invocations[0]!;

    socket.emit("error", new Error("ECONNRESET"));
    await vi.advanceTimersByTimeAsync(500);

    expect(invocation.signal?.aborted).toBe(true);
  });

  it("does not restart an attempt that already emitted events after reconnect", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { client, sockets, executor } = await makeClient();
    await client.start();
    const first = sockets.last();
    first.emitMessage(taskPayloadMessage());
    executor.invocations[0]!.emit({ type: "text.delta", text: "started" });

    first.emit("error", new Error("ECONNRESET"));
    await vi.advanceTimersByTimeAsync(500);
    const second = sockets.last();
    second.emitMessage({ type: "session.accepted", heartbeatSeconds: 30 });
    second.emitMessage(taskPayloadMessage());
    await flush();

    expect(executor.execute).toHaveBeenCalledTimes(1);
  });
});
