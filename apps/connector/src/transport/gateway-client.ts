import {
  DeviceToServerMessageSchema,
  ProviderSetupStageSchema,
  ServerToDeviceMessageSchema,
  type ActiveTaskLease,
  type DeviceToServerMessage,
  type Provider,
  type ProviderSetupErrorCode,
  type ProviderSetupRejection,
  type ProviderSetupStage,
  type ProviderStatus,
  type ServerToDeviceMessage,
  type TaskErrorCode,
  type TaskEvent,
} from "@meld/contracts";
import WebSocket, { type RawData } from "ws";
import type { CredentialStore } from "../pairing/credential-store";
import { nextBackoffDelay } from "./backoff";
import {
  createHeartbeatCoordinator,
  type HeartbeatCoordinator,
} from "./heartbeat";

const CONNECTOR_VERSION = "meld-connector/0.0.0";
const REPAIR_REQUIRED = "re-pair required";

/** The forward-only order the gateway records setup stages in. */
const SETUP_STAGE_ORDER: readonly ProviderSetupStage[] =
  ProviderSetupStageSchema.options;

/** Provider-agnostic, secret-free progress lines for each setup stage. */
const SETUP_STAGE_MESSAGE: Record<ProviderSetupStage, string> = {
  installing: "Installing the managed provider.",
  authenticating: "Waiting for the provider sign-in to complete.",
  verifying: "Verifying the managed provider.",
};

interface GatewaySocketOptions {
  headers: Record<string, string>;
}

interface GatewayResponse {
  statusCode?: number;
  resume?(): void;
}

export interface GatewaySocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: RawData) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  on(
    event: "unexpected-response",
    listener: (request: unknown, response: GatewayResponse) => void,
  ): this;
  removeAllListeners?(event?: string | symbol): this;
}

export type GatewaySocketFactory = (
  url: string,
  options: GatewaySocketOptions,
) => GatewaySocket;

/**
 * The cooperative progress callback the setup run drives. Mirrors the real
 * `ProviderSetupProgress` so a real `ProviderSetup` satisfies
 * {@link ProviderSetupLike} without this module depending on the setup module.
 */
export type ProviderSetupProgress = (
  stage: ProviderSetupStage,
) => void | Promise<void>;

/** The slice of the real `ProviderSetup` the gateway client drives. */
export interface ProviderSetupLike {
  connect(
    provider: Provider,
    onProgress: ProviderSetupProgress,
    signal?: AbortSignal,
  ): Promise<ProviderStatus>;
}

/** The room-reply envelope the executor settles a completed task with. */
export interface RoomReplyEnvelope {
  kind: "room_reply";
  payload: unknown;
  partial: false;
}

export interface TaskPayload {
  taskId: string;
  attemptId: string;
  provider: Provider;
  context: unknown;
}

export type TaskEmit = (event: TaskEvent) => void;

/** The slice of the real `TaskExecutor` the gateway client drives. */
export interface TaskExecutorLike {
  execute(
    payload: TaskPayload,
    signal: AbortSignal | undefined,
    emit: TaskEmit,
  ): Promise<RoomReplyEnvelope>;
  cleanup(taskId: string, attemptId: string): Promise<void>;
}

export interface GatewayClientOptions {
  gatewayUrl: string;
  credentialStore: CredentialStore;
  requestedProvider?: Provider;
  createSocket?: GatewaySocketFactory;
  createProviderSetup(): ProviderSetupLike;
  createTaskExecutor(): TaskExecutorLike;
  detectProviders(): Promise<ProviderStatus[]>;
  onFenced?(lease: ActiveTaskLease): void;
  onTerminal?(reason: string): void;
}

/** One in-flight task attempt. */
type ActiveTaskRun = {
  taskId: string;
  attemptId: string;
  abortController: AbortController;
  nextSequence: number;
  terminalSent: boolean;
  cleanup(): Promise<void>;
};

/** One in-flight provider-setup request. */
type ActiveSetupRun = {
  requestId: string;
  provider: Provider;
  promise: Promise<void>;
};

/** The mutable bookkeeping kept alongside an {@link ActiveSetupRun}. */
interface SetupRecord {
  run: ActiveSetupRun;
  controller: AbortController;
  /** Highest stage index already forwarded, so stages never rewind or repeat. */
  lastStageIndex: number;
  /** Set once the run reaches a definitive local terminal. */
  settled: boolean;
  /** Set once a `provider.setup.failed` frame has been sent for this request. */
  failureSent: boolean;
}

function defaultSocketFactory(
  url: string,
  options: GatewaySocketOptions,
): GatewaySocket {
  return new WebSocket(url, options);
}

function runKey({ taskId, attemptId }: ActiveTaskLease): string {
  return `${taskId}:${attemptId}`;
}

function parseServerMessage(data: RawData): ServerToDeviceMessage {
  if (!Buffer.isBuffer(data)) {
    throw new Error("Gateway sent an invalid frame");
  }

  const value = JSON.parse(data.toString("utf8")) as unknown;
  return ServerToDeviceMessageSchema.parse(value);
}

function hasStringCode(error: unknown): error is { code: string } {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

function taskFailure(error: unknown): { code: TaskErrorCode; message: string } {
  if (hasStringCode(error)) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "The managed provider could not complete this reply.";
    return {
      code: error.code as TaskErrorCode,
      message: message.slice(0, 2_000),
    };
  }
  return {
    code: "unknown",
    message: "The managed provider failed for an unknown reason.",
  };
}

function setupFailure(error: unknown): {
  code: ProviderSetupErrorCode;
  message: string;
} {
  const fallbackMessage = "The managed provider setup could not be completed.";
  if (hasStringCode(error)) {
    const message =
      error instanceof Error && error.message ? error.message : fallbackMessage;
    return {
      code: error.code as ProviderSetupErrorCode,
      message: message.slice(0, 500),
    };
  }
  return { code: "unknown", message: fallbackMessage };
}

export class GatewayClient {
  readonly gatewayUrl: string;
  stoppedReason: string | undefined;

  private readonly credentialStore: CredentialStore;
  private readonly createSocket: GatewaySocketFactory;
  private readonly setup: ProviderSetupLike;
  private readonly executor: TaskExecutorLike;
  private readonly detectProviders: () => Promise<ProviderStatus[]>;
  private readonly onFenced: (lease: ActiveTaskLease) => void;
  private readonly onTerminal: (reason: string) => void;
  private readonly claiming = new Set<string>();
  private readonly runs = new Map<string, ActiveTaskRun>();
  private readonly setups = new Map<string, SetupRecord>();
  /** Attempts that have emitted at least one event; never restarted. */
  private readonly emittedAttempts = new Set<string>();
  private socket: GatewaySocket | undefined;
  private heartbeat: HeartbeatCoordinator | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private retryAttempt = 0;
  private running = false;
  private lifecycleGeneration = 0;
  private connectionGeneration = 0;

  constructor({
    gatewayUrl,
    credentialStore,
    createSocket = defaultSocketFactory,
    createProviderSetup,
    createTaskExecutor,
    detectProviders,
    onFenced = () => undefined,
    onTerminal = () => undefined,
  }: GatewayClientOptions) {
    this.gatewayUrl = gatewayUrl;
    this.credentialStore = credentialStore;
    this.createSocket = createSocket;
    this.setup = createProviderSetup();
    this.executor = createTaskExecutor();
    this.detectProviders = detectProviders;
    this.onFenced = onFenced;
    this.onTerminal = onTerminal;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    const lifecycle = ++this.lifecycleGeneration;
    this.stoppedReason = undefined;
    this.retryAttempt = 0;
    await this.connect(lifecycle);
  }

  stop(): void {
    this.running = false;
    this.lifecycleGeneration += 1;
    this.connectionGeneration += 1;
    this.clearRetry();
    this.stopHeartbeat();
    this.abortAllRuns();
    this.abortAllSetups();
    this.emittedAttempts.clear();
    this.claiming.clear();

    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      this.retireSocket(socket, 1000, "Gateway client stopped");
    }
  }

  private async connect(lifecycle: number): Promise<void> {
    if (!this.isCurrentLifecycle(lifecycle)) {
      return;
    }

    const connection = ++this.connectionGeneration;
    const credential = await this.credentialStore.read();
    if (!this.isCurrentConnection(lifecycle, connection)) {
      return;
    }
    if (!credential) {
      this.stopTerminal(REPAIR_REQUIRED);
      return;
    }

    let socket: GatewaySocket;
    try {
      socket = this.createSocket(this.gatewayUrl, {
        headers: {
          authorization: `Device ${credential.deviceId}.${credential.deviceToken}`,
        },
      });
    } catch {
      if (this.isCurrentConnection(lifecycle, connection)) {
        this.scheduleReconnect(lifecycle);
      }
      return;
    }

    if (!this.isCurrentConnection(lifecycle, connection)) {
      this.retireSocket(socket);
      return;
    }

    this.socket = socket;
    let failed = false;
    const failConnection = (closeSocket = true): void => {
      if (failed || !this.isCurrentSocket(socket, lifecycle, connection)) {
        return;
      }
      failed = true;

      this.stopHeartbeat();
      this.abortAllRuns();
      this.abortAllSetups();
      this.claiming.clear();
      this.retireCurrentSocket(socket, lifecycle, connection, closeSocket);
      this.scheduleReconnect(lifecycle);
    };

    socket.on("unexpected-response", (_request, response) => {
      if (!this.isCurrentSocket(socket, lifecycle, connection)) {
        return;
      }
      response.resume?.();
      if (response.statusCode === 401) {
        failed = true;
        this.stopTerminal(REPAIR_REQUIRED);
        return;
      }
      failConnection();
    });
    socket.on("error", () => failConnection());
    socket.on("close", () => failConnection(false));
    socket.on("message", (data) => {
      if (!this.isCurrentSocket(socket, lifecycle, connection)) {
        return;
      }
      try {
        const message = parseServerMessage(data);
        if (!this.isCurrentSocket(socket, lifecycle, connection)) {
          return;
        }
        this.handleMessage(message);
      } catch {
        if (this.isCurrentSocket(socket, lifecycle, connection)) {
          socket.close(1008, "Invalid gateway protocol frame");
          failConnection();
        }
      }
    });
  }

  private scheduleReconnect(lifecycle: number): void {
    if (!this.isCurrentLifecycle(lifecycle) || this.retryTimer) {
      return;
    }

    const delay = nextBackoffDelay(this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.isCurrentLifecycle(lifecycle)) {
        void this.connect(lifecycle);
      }
    }, delay);
  }

  private stopTerminal(reason: string): void {
    this.running = false;
    this.lifecycleGeneration += 1;
    this.connectionGeneration += 1;
    this.stoppedReason = reason;
    this.clearRetry();
    this.stopHeartbeat();
    this.abortAllRuns();
    this.abortAllSetups();
    this.emittedAttempts.clear();
    this.claiming.clear();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      this.retireSocket(socket, 1008, reason);
    }
    this.onTerminal(reason);
  }

  private isCurrentLifecycle(lifecycle: number): boolean {
    return this.running && this.lifecycleGeneration === lifecycle;
  }

  private isCurrentConnection(lifecycle: number, connection: number): boolean {
    return (
      this.isCurrentLifecycle(lifecycle) &&
      this.connectionGeneration === connection
    );
  }

  private isCurrentSocket(
    socket: GatewaySocket,
    lifecycle: number,
    connection: number,
  ): boolean {
    return (
      this.isCurrentConnection(lifecycle, connection) && this.socket === socket
    );
  }

  private retireCurrentSocket(
    socket: GatewaySocket,
    lifecycle: number,
    connection: number,
    closeSocket: boolean,
  ): void {
    if (!this.isCurrentSocket(socket, lifecycle, connection)) {
      return;
    }

    this.socket = undefined;
    this.connectionGeneration += 1;
    this.retireSocket(socket, undefined, undefined, closeSocket);
  }

  private retireSocket(
    socket: GatewaySocket,
    code?: number,
    reason?: string,
    closeSocket = true,
  ): void {
    socket.removeAllListeners?.("message");
    socket.removeAllListeners?.("unexpected-response");
    socket.removeAllListeners?.("close");
    if (closeSocket) {
      socket.close(code, reason);
    }
  }

  private clearRetry(): void {
    if (!this.retryTimer) {
      return;
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private stopHeartbeat(): void {
    this.heartbeat?.stop();
    this.heartbeat = undefined;
  }

  /** Aborts every in-flight task and drops it; kills each process group. */
  private abortAllRuns(): void {
    for (const run of this.runs.values()) {
      run.abortController.abort();
      void run.cleanup().catch(() => undefined);
    }
    this.runs.clear();
    // `emittedAttempts` is intentionally preserved across a lost socket so a
    // reconnect does not restart an attempt that already produced events.
  }

  /** Cooperatively aborts every in-flight setup and drops it. */
  private abortAllSetups(): void {
    for (const record of this.setups.values()) {
      // The setup abort is cooperative — it does not kill the install, login,
      // or probe process, it only asks the run to stop at its next checkpoint.
      record.settled = true;
      record.controller.abort();
    }
    this.setups.clear();
  }

  private send(message: DeviceToServerMessage): void {
    const parsed = DeviceToServerMessageSchema.parse(message);
    if (!this.socket) {
      throw new Error("Gateway is not connected");
    }
    this.socket.send(JSON.stringify(parsed));
  }

  /** Sends a frame only while a socket is present; swallows a lost socket. */
  private trySend(message: DeviceToServerMessage): void {
    if (!this.socket) {
      return;
    }
    try {
      this.send(message);
    } catch {
      // The socket was retired between the check and the send; nothing to do.
    }
  }

  private activeTasks(): ActiveTaskLease[] {
    return [...this.runs.values()].map((run) => ({
      taskId: run.taskId,
      attemptId: run.attemptId,
    }));
  }

  private handleMessage(message: ServerToDeviceMessage): void {
    switch (message.type) {
      case "session.accepted":
        this.retryAttempt = 0;
        this.startHeartbeat(message.heartbeatSeconds);
        this.publishProviderStatus();
        return;

      case "heartbeat.ack":
        this.heartbeat?.acknowledge(message.renewedTasks);
        return;

      case "task.available":
        if (
          this.claiming.has(message.taskId) ||
          [...this.runs.values()].some((run) => run.taskId === message.taskId)
        ) {
          return;
        }
        this.claiming.add(message.taskId);
        this.send({ type: "task.claim", taskId: message.taskId });
        return;

      case "task.payload":
        this.claiming.delete(message.taskId);
        this.startTaskRun(message);
        return;

      case "task.cancel": {
        const key = runKey(message);
        this.disposeRun(key);
        this.send({
          type: "task.cancelled",
          taskId: message.taskId,
          attemptId: message.attemptId,
        });
        return;
      }

      case "task.event_ack":
        return;

      case "task.terminal_ack":
        this.disposeRun(runKey(message));
        return;

      case "task.claim_rejected":
        this.claiming.delete(message.taskId);
        return;

      case "task.operation_rejected":
        this.disposeRun(runKey(message));
        return;

      case "provider.setup":
        this.startSetupRun(message.requestId, message.provider);
        return;

      case "provider.setup.rejected":
        this.handleSetupRejection(message.requestId, message.reason);
        return;
    }
  }

  private startHeartbeat(heartbeatSeconds: number): void {
    this.stopHeartbeat();
    this.heartbeat = createHeartbeatCoordinator({
      intervalMs: heartbeatSeconds * 1_000,
      getActiveTasks: () => this.activeTasks(),
      sendHeartbeat: (activeTasks) => {
        this.send({
          type: "heartbeat",
          connectorVersion: CONNECTOR_VERSION,
          activeTasks,
        });
      },
      onLeaseOmitted: (lease) => {
        const key = runKey(lease);
        if (!this.runs.has(key)) {
          return;
        }
        this.disposeRun(key);
        this.onFenced(lease);
      },
    });
    this.heartbeat.start();
  }

  /** Publishes both providers' status; called after acceptance and setup. */
  private publishProviderStatus(): void {
    void this.detectProviders()
      .then((providers) => {
        this.trySend({ type: "provider.status", providers });
      })
      .catch(() => {
        // A failed detection must not tear down the connection; a later setup
        // completion will publish again.
      });
  }

  private startTaskRun(
    message: Extract<ServerToDeviceMessage, { type: "task.payload" }>,
  ): void {
    const lease = { taskId: message.taskId, attemptId: message.attemptId };
    const key = runKey(lease);

    // A repeat payload for a live run, and any attempt that already emitted
    // events, are never restarted — the executor keeps running or has settled.
    if (this.runs.has(key) || this.emittedAttempts.has(key)) {
      return;
    }

    const abortController = new AbortController();
    const run: ActiveTaskRun = {
      taskId: message.taskId,
      attemptId: message.attemptId,
      abortController,
      nextSequence: 1,
      terminalSent: false,
      cleanup: () => this.executor.cleanup(message.taskId, message.attemptId),
    };
    this.runs.set(key, run);

    const emit: TaskEmit = (event) => {
      if (this.runs.get(key) !== run) {
        return;
      }
      const sequence = run.nextSequence;
      run.nextSequence += 1;
      this.emittedAttempts.add(key);
      this.trySend({ type: "task.event", ...lease, sequence, event });
    };

    const payload: TaskPayload = {
      taskId: message.taskId,
      attemptId: message.attemptId,
      provider: message.provider,
      context: message.context,
    };

    void this.executor
      .execute(payload, abortController.signal, emit)
      .then((envelope) => {
        if (this.runs.get(key) !== run || run.terminalSent) {
          return;
        }
        // A cancelled, fenced, or socket-lost run has an aborted signal and
        // must never emit a completion.
        if (abortController.signal.aborted) {
          return;
        }
        run.terminalSent = true;
        this.trySend({ type: "task.complete", ...lease, result: envelope });
      })
      .catch((error: unknown) => {
        if (this.runs.get(key) !== run || run.terminalSent) {
          return;
        }
        if (abortController.signal.aborted) {
          // Deliberate abort (cancel/fence/socket loss) — no terminal frame.
          return;
        }
        run.terminalSent = true;
        const { code, message: failMessage } = taskFailure(error);
        this.trySend({
          type: "task.fail",
          ...lease,
          code,
          message: failMessage,
        });
      });
  }

  /** Aborts a task run, drops it, and disposes its workspace after settlement. */
  private disposeRun(key: string): void {
    const run = this.runs.get(key);
    this.runs.delete(key);
    this.emittedAttempts.delete(key);
    if (!run) {
      return;
    }
    run.abortController.abort();
    void run.cleanup().catch(() => undefined);
  }

  private startSetupRun(requestId: string, provider: Provider): void {
    // The gateway re-announces a nonterminal request about every three seconds,
    // so a repeat frame for a known request id is the same run, never a fresh
    // install. A settled record is kept so a stray re-announcement of a
    // finished request never restarts it either.
    if (this.setups.has(requestId)) {
      return;
    }

    const controller = new AbortController();
    const record: SetupRecord = {
      run: undefined as unknown as ActiveSetupRun,
      controller,
      lastStageIndex: -1,
      settled: false,
      failureSent: false,
    };

    const onProgress: ProviderSetupProgress = (stage) => {
      const index = SETUP_STAGE_ORDER.indexOf(stage);
      // Forward only strictly-advancing stages, so the sequence the gateway
      // sees never rewinds or repeats.
      if (record.settled || index <= record.lastStageIndex) {
        return;
      }
      record.lastStageIndex = index;
      this.trySend({
        type: "provider.setup.progress",
        requestId,
        provider,
        stage,
        message: SETUP_STAGE_MESSAGE[stage],
      });
    };

    const promise = this.setup
      .connect(provider, onProgress, controller.signal)
      .then((status) => this.settleSetupComplete(requestId, status))
      .catch((error: unknown) => this.settleSetupFailed(requestId, error));

    record.run = { requestId, provider, promise };
    this.setups.set(requestId, record);
  }

  private settleSetupComplete(requestId: string, status: ProviderStatus): void {
    const record = this.setups.get(requestId);
    if (!record || record.settled) {
      return;
    }
    record.settled = true;
    this.trySend({
      type: "provider.setup.complete",
      requestId,
      provider: record.run.provider,
      status,
    });
    // Republish provider status after every setup completion so the app sees
    // the newly connected provider immediately.
    this.publishProviderStatus();
  }

  private settleSetupFailed(requestId: string, error: unknown): void {
    const record = this.setups.get(requestId);
    if (!record || record.settled) {
      return;
    }
    record.settled = true;
    record.failureSent = true;
    const { code, message } = setupFailure(error);
    this.trySend({
      type: "provider.setup.failed",
      requestId,
      provider: record.run.provider,
      code,
      message,
    });
  }

  private handleSetupRejection(
    requestId: string,
    reason: ProviderSetupRejection,
  ): void {
    const record = this.setups.get(requestId);

    switch (reason) {
      case "invalid_provider_setup_progress":
        // Our stage sequence rewound or skipped relative to the gateway's.
        // Resynchronise by advancing our pointer to the furthest stage so an
        // already-recorded stage is never resent — do not fail the run.
        if (record) {
          record.lastStageIndex = SETUP_STAGE_ORDER.length - 1;
        }
        return;

      case "invalid_provider_setup_settlement":
        // The status we settled with was not installed/authenticated/supported.
        // Settle as a typed failure so the request reaches a terminal state
        // instead of hanging in `verifying`.
        if (record && !record.failureSent) {
          record.settled = true;
          record.failureSent = true;
          record.controller.abort();
          this.trySend({
            type: "provider.setup.failed",
            requestId,
            provider: record.run.provider,
            code: "verification_failed",
            message: "The managed provider did not verify as ready.",
          });
        }
        return;

      case "conflicting_provider_setup_settlement":
        // The gateway closes the socket on this; do not retry or resend.
        if (record) {
          record.settled = true;
          record.controller.abort();
        }
        return;
    }
  }
}
