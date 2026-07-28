import { createClient } from "@supabase/supabase-js";
import type {
  AIResultEnvelope,
  DeviceToServerMessage,
  ServerToDeviceMessage,
} from "@meld/contracts";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { GatewayConfig } from "./config";
import {
  closeGatewayFixtureDatabase,
  createEscapeHeavyReadyTask,
  createReadyTask,
  expireAttempt,
  readTask,
  requestTaskCancellation,
  resetGatewayFixture,
  setTaskWaiting,
  type GatewayFixture,
} from "./integration-fixtures";
import {
  startGateway,
  type GatewayRuntime,
  type StartGatewayDependencies,
} from "./main";
import {
  createTaskRepository,
  type SettleTaskInput,
  type TaskRepository,
} from "./tasks/task-repository";
import { DeviceSessionRegistry } from "./ws/device-session";

const MESSAGE_TIMEOUT_MS = 5_000;
const RESULT: AIResultEnvelope = {
  kind: "room_reply",
  payload: { text: "Durable result" },
  partial: false,
};

interface CloseInfo {
  code: number;
  reason: string;
}

interface MessageWaiter {
  predicate(message: ServerToDeviceMessage): boolean;
  resolve(message: ServerToDeviceMessage): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class TestDevice {
  readonly history: ServerToDeviceMessage[] = [];
  private readonly queue: ServerToDeviceMessage[] = [];
  private readonly waiters = new Set<MessageWaiter>();
  private closeInfo: CloseInfo | undefined;
  private readonly closeWaiters = new Set<
    (closeInfo: CloseInfo) => void
  >();

  private constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(
        Buffer.isBuffer(data)
          ? data.toString("utf8")
          : Buffer.from(data as ArrayBuffer).toString("utf8"),
      ) as ServerToDeviceMessage;
      this.history.push(message);

      const waiter = [...this.waiters].find(({ predicate }) =>
        predicate(message),
      );
      if (waiter) {
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        waiter.resolve(message);
      } else {
        this.queue.push(message);
      }
    });
    socket.once("close", (code, reason) => {
      this.closeInfo = { code, reason: reason.toString("utf8") };
      for (const resolve of this.closeWaiters) {
        resolve(this.closeInfo);
      }
      this.closeWaiters.clear();
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(
          new Error(
            `Socket closed before message (${code}: ${reason.toString("utf8")})`,
          ),
        );
      }
      this.waiters.clear();
    });
  }

  static async connect(
    url: string,
    credential: string,
  ): Promise<TestDevice> {
    const socket = new WebSocket(url, {
      headers: { authorization: `Device ${credential}` },
    });
    const device = new TestDevice(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timed out opening gateway socket"));
      }, MESSAGE_TIMEOUT_MS);
      socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return device;
  }

  send(message: DeviceToServerMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  next(
    predicate: (message: ServerToDeviceMessage) => boolean,
  ): Promise<ServerToDeviceMessage> {
    const queuedIndex = this.queue.findIndex(predicate);
    if (queuedIndex >= 0) {
      return Promise.resolve(this.queue.splice(queuedIndex, 1)[0]!);
    }

    return new Promise((resolve, reject) => {
      const waiter: MessageWaiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(
            new Error(
              `Timed out waiting for gateway message; history=${JSON.stringify(this.history)}`,
            ),
          );
        }, MESSAGE_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  async expectNoMessage(
    predicate: (message: ServerToDeviceMessage) => boolean,
    durationMs = 250,
  ): Promise<void> {
    expect(this.queue.some(predicate)).toBe(false);
    await new Promise<void>((resolve, reject) => {
      const waiter: MessageWaiter = {
        predicate,
        resolve: (message) => {
          reject(
            new Error(`Unexpected gateway message: ${JSON.stringify(message)}`),
          );
        },
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          resolve();
        }, durationMs),
      };
      this.waiters.add(waiter);
    });
  }

  waitForClose(): Promise<CloseInfo> {
    if (this.closeInfo) {
      return Promise.resolve(this.closeInfo);
    }
    return new Promise((resolve) => {
      this.closeWaiters.add(resolve);
    });
  }

  terminate(): void {
    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.terminate();
    }
  }
}

interface LiveGateway {
  runtime: GatewayRuntime;
  url: string;
}

const runtimes: GatewayRuntime[] = [];
const devices: TestDevice[] = [];
let fixture: GatewayFixture;

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate gateway integration port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  return address.port;
}

function serviceRoleKey(): string {
  const key = process.env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "GATEWAY_SUPABASE_SERVICE_ROLE_KEY is required for gateway integration tests",
    );
  }
  return key;
}

function supabaseUrl(): string {
  const url = process.env.GATEWAY_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "GATEWAY_SUPABASE_URL is required for gateway integration tests",
    );
  }
  return url;
}

async function startLiveGateway(
  dependencies: Omit<
    StartGatewayDependencies,
    "config" | "signals"
  > = {},
): Promise<LiveGateway> {
  const port = await availablePort();
  const config: GatewayConfig = {
    host: "127.0.0.1",
    port,
    supabaseUrl: supabaseUrl(),
    supabaseServiceRoleKey: serviceRoleKey(),
    pollIntervalMs: 60_000,
    heartbeatSeconds: 30,
  };
  const runtime = await startGateway({
    ...dependencies,
    config,
    signals: {
      on() {},
      off() {},
    },
  });
  runtimes.push(runtime);
  return { runtime, url: `ws://127.0.0.1:${port}/ws` };
}

async function connectDevice(gateway: LiveGateway): Promise<TestDevice> {
  const device = await TestDevice.connect(
    gateway.url,
    fixture.deviceCredential,
  );
  devices.push(device);
  await device.next((message) => message.type === "session.accepted");
  return device;
}

async function claimTask(
  device: TestDevice,
  taskId: string,
): Promise<
  Extract<ServerToDeviceMessage, { type: "task.payload" }>
> {
  device.send({ type: "task.claim", taskId });
  return (await device.next(
    (message) =>
      message.type === "task.payload" && message.taskId === taskId,
  )) as Extract<ServerToDeviceMessage, { type: "task.payload" }>;
}

async function claimAnnouncedTask(
  device: TestDevice,
  taskId: string,
): ReturnType<typeof claimTask> {
  await device.next(
    (message) =>
      message.type === "task.available" && message.taskId === taskId,
  );
  return claimTask(device, taskId);
}

async function stopGateway(gateway: LiveGateway): Promise<void> {
  await gateway.runtime.shutdown();
}

function settlementGatedRepository() {
  const committed = deferred<string>();
  const release = deferred<void>();
  let shouldGate = true;
  const supabase = createClient(supabaseUrl(), serviceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const base = createTaskRepository(supabase);
  const repository = {
    ...base,
    async settleTask(input: SettleTaskInput) {
      const status = await base.settleTask(input);
      if (shouldGate) {
        shouldGate = false;
        committed.resolve(status);
        await release.promise;
      }
      return status;
    },
  } satisfies TaskRepository;
  return { repository, committed, release };
}

class FailOnceRegistry extends DeviceSessionRegistry {
  failed = false;

  override sendToDevice(
    ...args: Parameters<DeviceSessionRegistry["sendToDevice"]>
  ): number {
    if (!this.failed) {
      this.failed = true;
      throw new Error("Injected registry send failure");
    }
    return super.sendToDevice(...args);
  }
}

beforeEach(async () => {
  fixture = await resetGatewayFixture();
});

afterEach(async () => {
  for (const device of devices.splice(0)) {
    device.terminate();
  }
  for (const runtime of runtimes.splice(0).reverse()) {
    await runtime.shutdown();
  }
});

afterAll(async () => {
  await closeGatewayFixtureDatabase();
});

describe("gateway live durability and concurrency", () => {
  it("durably rejects escape-heavy hydrated context above 512 KiB", async () => {
    const taskId = await createEscapeHeavyReadyTask(fixture);
    const gateway = await startLiveGateway();
    const device = await connectDevice(gateway);

    await device.next(
      (message) =>
        message.type === "task.available" && message.taskId === taskId,
    );
    device.send({ type: "task.claim", taskId });

    await expect(
      device.next(
        (message) =>
          message.type === "task.claim_rejected" &&
          message.taskId === taskId,
      ),
    ).resolves.toEqual({
      type: "task.claim_rejected",
      taskId,
      reason: "context_too_large",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "failed",
      errorCode: "unknown",
      currentAttemptId: null,
      attempts: [
        {
          settledAt: expect.any(Date),
          outcome: "failed",
        },
      ],
    });
  });

  it("allows exactly one same-device socket to win a claim race", async () => {
    const taskId = await createReadyTask(fixture);
    const gateway = await startLiveGateway();
    const first = await connectDevice(gateway);
    await first.next(
      (message) =>
        message.type === "task.available" && message.taskId === taskId,
    );
    const second = await connectDevice(gateway);
    const repeatedAnnouncements = await Promise.all([
      first.next(
        (message) =>
          message.type === "task.available" && message.taskId === taskId,
      ),
      second.next(
        (message) =>
          message.type === "task.available" && message.taskId === taskId,
      ),
    ]);
    expect(repeatedAnnouncements).toHaveLength(2);

    first.send({ type: "task.claim", taskId });
    second.send({ type: "task.claim", taskId });
    const responses = await Promise.all([
      first.next(
        (message) =>
          message.type === "task.payload" ||
          message.type === "task.claim_rejected",
      ),
      second.next(
        (message) =>
          message.type === "task.payload" ||
          message.type === "task.claim_rejected",
      ),
    ]);

    const payloads = responses.filter(
      (message) => message.type === "task.payload",
    );
    const rejections = responses.filter(
      (message) => message.type === "task.claim_rejected",
    );
    expect(payloads).toHaveLength(1);
    expect(rejections).toEqual([
      {
        type: "task.claim_rejected",
        taskId,
        reason: "claim_lost",
      },
    ]);
    expect(payloads[0]).toMatchObject({
      taskId,
      provider: "codex",
      context: {
        taskId,
        initiatingUserId: fixture.userId,
        organizationId: fixture.organizationId,
        roomId: fixture.roomId,
        messages: [{ id: fixture.messageId }],
        attachments: [{ id: fixture.attachmentId }],
        evidence: [{ id: fixture.evidenceId }],
        decisions: [{ id: fixture.decisionId }],
      },
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "running",
      eventCount: 0,
      attempts: [{ attemptNo: 1, settledAt: null }],
    });
  });

  it("renews and completes the same attempt after a gateway restart", async () => {
    const taskId = await createReadyTask(fixture);
    const firstGateway = await startLiveGateway();
    const firstDevice = await connectDevice(firstGateway);
    const payload = await claimAnnouncedTask(firstDevice, taskId);
    const leaseBeforeRestart = (await readTask(taskId)).attempts[0]!
      .leaseExpiresAt;

    await stopGateway(firstGateway);
    await firstDevice.waitForClose();

    const secondGateway = await startLiveGateway();
    const secondDevice = await connectDevice(secondGateway);
    secondDevice.send({
      type: "heartbeat",
      connectorVersion: "1.0.0",
      activeTasks: [{ taskId, attemptId: payload.attemptId }],
    });
    expect(
      await secondDevice.next(
        (message) => message.type === "heartbeat.ack",
      ),
    ).toEqual({
      type: "heartbeat.ack",
      renewedTasks: [{ taskId, attemptId: payload.attemptId }],
    });
    expect(
      (await readTask(taskId)).attempts[0]!.leaseExpiresAt.getTime(),
    ).toBeGreaterThan(leaseBeforeRestart.getTime());

    secondDevice.send({
      type: "task.complete",
      taskId,
      attemptId: payload.attemptId,
      result: RESULT,
    });
    expect(
      await secondDevice.next(
        (message) => message.type === "task.terminal_ack",
      ),
    ).toEqual({
      type: "task.terminal_ack",
      taskId,
      attemptId: payload.attemptId,
      status: "completed",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "completed",
      result: RESULT,
      currentAttemptId: null,
    });
  });

  it("re-announces ready state after a committed sweep send failure", async () => {
    const taskId = await createReadyTask(fixture);
    await setTaskWaiting(taskId);
    const registry = new FailOnceRegistry();
    const failedGateway = await startLiveGateway({ registry });
    const failedDevice = await connectDevice(failedGateway);

    expect(await failedDevice.waitForClose()).toMatchObject({ code: 1011 });
    expect(registry.failed).toBe(true);
    expect(await readTask(taskId)).toMatchObject({
      status: "ready_to_run",
      attempts: [],
    });
    await stopGateway(failedGateway);

    const restartedGateway = await startLiveGateway();
    const restartedDevice = await connectDevice(restartedGateway);
    expect(
      await restartedDevice.next(
        (message) =>
          message.type === "task.available" && message.taskId === taskId,
      ),
    ).toEqual({ type: "task.available", taskId });
  });

  it("fences an expired old attempt after a new attempt starts", async () => {
    const taskId = await createReadyTask(fixture);
    const gateway = await startLiveGateway();
    const oldDevice = await connectDevice(gateway);
    const oldPayload = await claimAnnouncedTask(oldDevice, taskId);
    await expireAttempt(oldPayload.attemptId);
    await gateway.runtime.repository.reapExpiredTaskLeases();
    expect(await readTask(taskId)).toMatchObject({
      status: "waiting_for_device",
      currentAttemptId: null,
    });

    const newDevice = await connectDevice(gateway);
    await newDevice.next(
      (message) =>
        message.type === "task.available" && message.taskId === taskId,
    );
    const newPayload = await claimTask(newDevice, taskId);

    oldDevice.send({
      type: "task.complete",
      taskId,
      attemptId: oldPayload.attemptId,
      result: RESULT,
    });
    expect(
      await oldDevice.next(
        (message) => message.type === "task.operation_rejected",
      ),
    ).toMatchObject({
      taskId,
      attemptId: oldPayload.attemptId,
      operation: "complete",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "running",
      result: null,
      currentAttemptId: newPayload.attemptId,
      attempts: [
        { id: oldPayload.attemptId, settledAt: expect.any(Date) },
        { id: newPayload.attemptId, settledAt: null },
      ],
    });
  });

  it("does not renew an owner-expired lease before the reaper settles it", async () => {
    const taskId = await createReadyTask(fixture);
    const gateway = await startLiveGateway();
    const device = await connectDevice(gateway);
    const payload = await claimAnnouncedTask(device, taskId);
    await expireAttempt(payload.attemptId);

    device.send({
      type: "heartbeat",
      connectorVersion: "1.0.0",
      activeTasks: [{ taskId, attemptId: payload.attemptId }],
    });
    expect(
      await device.next((message) => message.type === "heartbeat.ack"),
    ).toEqual({ type: "heartbeat.ack", renewedTasks: [] });

    expect(await gateway.runtime.repository.reapExpiredTaskLeases()).toEqual([
      {
        taskId,
        attemptId: payload.attemptId,
        outcome: "waiting_for_device",
      },
    ]);
    expect(await readTask(taskId)).toMatchObject({
      status: "waiting_for_device",
      currentAttemptId: null,
    });
  });

  it("requeues zero-event expiry and reviews eventful expiry", async () => {
    const gateway = await startLiveGateway();
    const device = await connectDevice(gateway);
    const zeroEventTaskId = await createReadyTask(fixture);
    const zeroEventPayload = await claimTask(device, zeroEventTaskId);
    await expireAttempt(zeroEventPayload.attemptId);
    await gateway.runtime.repository.reapExpiredTaskLeases();

    const eventfulTaskId = await createReadyTask(fixture);
    const eventfulPayload = await claimTask(device, eventfulTaskId);
    device.send({
      type: "task.event",
      taskId: eventfulTaskId,
      attemptId: eventfulPayload.attemptId,
      sequence: 1,
      event: { type: "progress", label: "Started", percent: 10 },
    });
    await device.next(
      (message) =>
        message.type === "task.event_ack" &&
        message.taskId === eventfulTaskId,
    );
    await expireAttempt(eventfulPayload.attemptId);
    await gateway.runtime.repository.reapExpiredTaskLeases();

    expect(await readTask(zeroEventTaskId)).toMatchObject({
      status: "waiting_for_device",
      errorCode: null,
      eventCount: 0,
      currentAttemptId: null,
    });
    expect(await readTask(eventfulTaskId)).toMatchObject({
      status: "needs_review",
      errorCode: "execution_abandoned",
      eventCount: 1,
      currentAttemptId: null,
    });
  });

  it("replays a completion committed before the socket drops", async () => {
    const taskId = await createReadyTask(fixture);
    const gate = settlementGatedRepository();
    const gateway = await startLiveGateway({
      repository: gate.repository,
    });
    const firstDevice = await connectDevice(gateway);
    const payload = await claimAnnouncedTask(firstDevice, taskId);
    const completion: DeviceToServerMessage = {
      type: "task.complete",
      taskId,
      attemptId: payload.attemptId,
      result: RESULT,
    };
    firstDevice.send(completion);
    await gate.committed.promise;
    firstDevice.terminate();
    gate.release.resolve();

    const replayDevice = await connectDevice(gateway);
    replayDevice.send(completion);
    expect(
      await replayDevice.next(
        (message) => message.type === "task.terminal_ack",
      ),
    ).toEqual({
      type: "task.terminal_ack",
      taskId,
      attemptId: payload.attemptId,
      status: "completed",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "completed",
      result: RESULT,
      currentAttemptId: null,
      attempts: [
        {
          id: payload.attemptId,
          settledAt: expect.any(Date),
          outcome: "completed",
        },
      ],
    });
  });

  it("replays a needs-review settlement committed before drop", async () => {
    const taskId = await createReadyTask(fixture);
    const gate = settlementGatedRepository();
    const gateway = await startLiveGateway({
      repository: gate.repository,
    });
    const firstDevice = await connectDevice(gateway);
    const payload = await claimAnnouncedTask(firstDevice, taskId);
    const failure: DeviceToServerMessage = {
      type: "task.fail",
      taskId,
      attemptId: payload.attemptId,
      code: "execution_abandoned",
      message: "Connector stopped after partial execution.",
    };
    firstDevice.send(failure);
    await gate.committed.promise;
    firstDevice.terminate();
    gate.release.resolve();

    const replayDevice = await connectDevice(gateway);
    replayDevice.send(failure);
    expect(
      await replayDevice.next(
        (message) => message.type === "task.terminal_ack",
      ),
    ).toEqual({
      type: "task.terminal_ack",
      taskId,
      attemptId: payload.attemptId,
      status: "needs_review",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "needs_review",
      errorCode: "execution_abandoned",
    });
  });

  it("rejects a conflicting completion without changing the first result", async () => {
    const taskId = await createReadyTask(fixture);
    const gateway = await startLiveGateway();
    const device = await connectDevice(gateway);
    const payload = await claimAnnouncedTask(device, taskId);
    device.send({
      type: "task.complete",
      taskId,
      attemptId: payload.attemptId,
      result: RESULT,
    });
    await device.next(
      (message) => message.type === "task.terminal_ack",
    );

    device.send({
      type: "task.complete",
      taskId,
      attemptId: payload.attemptId,
      result: {
        kind: "room_reply",
        payload: { text: "Conflicting result" },
        partial: false,
      },
    });
    expect(
      await device.next(
        (message) => message.type === "task.operation_rejected",
      ),
    ).toEqual({
      type: "task.operation_rejected",
      taskId,
      attemptId: payload.attemptId,
      operation: "complete",
      reason: "conflicting_ai_task_settlement",
    });
    expect(await device.waitForClose()).toMatchObject({ code: 1008 });
    expect(await readTask(taskId)).toMatchObject({
      status: "completed",
      result: RESULT,
    });
  });

  it("redelivers an offline cancellation until acknowledgement", async () => {
    const taskId = await createReadyTask(fixture);
    const firstGateway = await startLiveGateway();
    const firstDevice = await connectDevice(firstGateway);
    const payload = await claimAnnouncedTask(firstDevice, taskId);
    await stopGateway(firstGateway);

    await requestTaskCancellation(fixture, taskId);
    const restartedGateway = await startLiveGateway();
    const restartedDevice = await connectDevice(restartedGateway);
    expect(
      await restartedDevice.next(
        (message) => message.type === "task.cancel",
      ),
    ).toEqual({
      type: "task.cancel",
      taskId,
      attemptId: payload.attemptId,
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "cancelled",
      attempts: [
        {
          id: payload.attemptId,
          cancelRequestedAt: expect.any(Date),
          cancelAcknowledgedAt: null,
        },
      ],
    });
    restartedDevice.terminate();
    await restartedDevice.waitForClose();

    const redeliveryDevice = await connectDevice(restartedGateway);
    expect(
      await redeliveryDevice.next(
        (message) => message.type === "task.cancel",
      ),
    ).toEqual({
      type: "task.cancel",
      taskId,
      attemptId: payload.attemptId,
    });
    redeliveryDevice.send({
      type: "task.cancelled",
      taskId,
      attemptId: payload.attemptId,
    });
    expect(
      await redeliveryDevice.next(
        (message) => message.type === "task.terminal_ack",
      ),
    ).toEqual({
      type: "task.terminal_ack",
      taskId,
      attemptId: payload.attemptId,
      status: "cancelled",
    });
    expect(await readTask(taskId)).toMatchObject({
      status: "cancelled",
      attempts: [
        {
          id: payload.attemptId,
          cancelRequestedAt: expect.any(Date),
          cancelAcknowledgedAt: expect.any(Date),
        },
      ],
    });
    await stopGateway(restartedGateway);

    const laterGateway = await startLiveGateway();
    const laterDevice = await connectDevice(laterGateway);
    const sweepDevice = await connectDevice(laterGateway);
    await Promise.all([
      laterDevice.expectNoMessage(
        (message) =>
          message.type === "task.cancel" && message.taskId === taskId,
      ),
      sweepDevice.expectNoMessage(
        (message) =>
          message.type === "task.cancel" && message.taskId === taskId,
      ),
    ]);
  });

  it("rejects sequence gaps and preserves replay identity across reconnects", async () => {
    const taskId = await createReadyTask(fixture);
    const gateway = await startLiveGateway();
    const firstDevice = await connectDevice(gateway);
    const payload = await claimAnnouncedTask(firstDevice, taskId);
    const firstEvent: DeviceToServerMessage = {
      type: "task.event",
      taskId,
      attemptId: payload.attemptId,
      sequence: 1,
      event: { type: "progress", label: "First event", percent: 10 },
    };
    firstDevice.send(firstEvent);
    expect(
      await firstDevice.next(
        (message) => message.type === "task.event_ack",
      ),
    ).toMatchObject({ sequence: 1 });

    firstDevice.send({
      type: "task.event",
      taskId,
      attemptId: payload.attemptId,
      sequence: 3,
      event: { type: "progress", label: "Gap", percent: 30 },
    });
    expect(
      await firstDevice.next(
        (message) => message.type === "task.operation_rejected",
      ),
    ).toMatchObject({
      operation: "event",
      reason: "out_of_order_ai_task_event",
    });
    expect(await firstDevice.waitForClose()).toMatchObject({ code: 1008 });

    const replayDevice = await connectDevice(gateway);
    replayDevice.send(firstEvent);
    expect(
      await replayDevice.next(
        (message) => message.type === "task.event_ack",
      ),
    ).toMatchObject({ sequence: 1 });
    replayDevice.send({
      ...firstEvent,
      event: {
        type: "progress",
        label: "Conflicting first event",
        percent: 10,
      },
    });
    expect(
      await replayDevice.next(
        (message) => message.type === "task.operation_rejected",
      ),
    ).toMatchObject({
      operation: "event",
      reason: "conflicting_ai_task_event",
    });
    expect(await replayDevice.waitForClose()).toMatchObject({ code: 1008 });
    expect(await readTask(taskId)).toMatchObject({
      status: "running",
      eventCount: 1,
      currentAttemptId: payload.attemptId,
    });
  });
});
