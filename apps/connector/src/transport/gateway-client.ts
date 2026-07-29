import {
  DeviceToServerMessageSchema,
  ServerToDeviceMessageSchema,
  type ActiveTaskLease,
  type DeviceToServerMessage,
  type ServerToDeviceMessage,
} from "@meld/contracts";
import WebSocket, { type RawData } from "ws";
import type { CredentialStore } from "../pairing/credential-store";
import { createStubRun, type StubRun } from "../run/stub-run";
import { nextBackoffDelay } from "./backoff";
import {
  createHeartbeatCoordinator,
  type HeartbeatCoordinator,
} from "./heartbeat";

const CONNECTOR_VERSION = "meld-connector/0.0.0";
const REPAIR_REQUIRED = "re-pair required";

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
    listener: (
      request: unknown,
      response: GatewayResponse,
    ) => void,
  ): this;
  removeAllListeners?(event?: string | symbol): this;
}

export type GatewaySocketFactory = (
  url: string,
  options: GatewaySocketOptions,
) => GatewaySocket;

interface GatewayClientOptions {
  gatewayUrl: string;
  credentialStore: CredentialStore;
  createSocket?: GatewaySocketFactory;
  onFenced?(lease: ActiveTaskLease): void;
}

interface ActiveStubRun {
  run: StubRun;
  kind:
    | "room_reply"
    | "prd_generate"
    | "prd_revise"
    | "stage_readiness";
  terminalSent: boolean;
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

export class GatewayClient {
  readonly gatewayUrl: string;
  stoppedReason: string | undefined;

  private readonly credentialStore: CredentialStore;
  private readonly createSocket: GatewaySocketFactory;
  private readonly onFenced: (lease: ActiveTaskLease) => void;
  private readonly claiming = new Set<string>();
  private readonly runs = new Map<string, ActiveStubRun>();
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
    onFenced = () => undefined,
  }: GatewayClientOptions) {
    this.gatewayUrl = gatewayUrl;
    this.credentialStore = credentialStore;
    this.createSocket = createSocket;
    this.onFenced = onFenced;
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
    this.abortAllRuns("Gateway client stopped");
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
      if (
        failed ||
        !this.isCurrentSocket(socket, lifecycle, connection)
      ) {
        return;
      }
      failed = true;

      this.stopHeartbeat();
      this.abortAllRuns("Gateway connection lost");
      this.claiming.clear();
      this.retireCurrentSocket(
        socket,
        lifecycle,
        connection,
        closeSocket,
      );
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
    this.abortAllRuns(reason);
    this.claiming.clear();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      this.retireSocket(socket, 1008, reason);
    }
  }

  private isCurrentLifecycle(lifecycle: number): boolean {
    return this.running && this.lifecycleGeneration === lifecycle;
  }

  private isCurrentConnection(
    lifecycle: number,
    connection: number,
  ): boolean {
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
      this.isCurrentConnection(lifecycle, connection) &&
      this.socket === socket
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

  private abortAllRuns(reason: string): void {
    for (const { run } of this.runs.values()) {
      run.abort(reason);
    }
    this.runs.clear();
  }

  private send(message: DeviceToServerMessage): void {
    const parsed = DeviceToServerMessageSchema.parse(message);
    if (!this.socket) {
      throw new Error("Gateway is not connected");
    }
    this.socket.send(JSON.stringify(parsed));
  }

  private activeTasks(): ActiveTaskLease[] {
    return [...this.runs.values()].map(({ run }) => ({
      taskId: run.taskId,
      attemptId: run.attemptId,
    }));
  }

  private handleMessage(message: ServerToDeviceMessage): void {
    switch (message.type) {
      case "session.accepted":
        this.retryAttempt = 0;
        this.startHeartbeat(message.heartbeatSeconds);
        this.sendProviderStatus();
        return;

      case "heartbeat.ack":
        this.heartbeat?.acknowledge(message.renewedTasks);
        return;

      case "task.available":
        if (
          this.claiming.has(message.taskId) ||
          [...this.runs.values()].some(
            ({ run }) => run.taskId === message.taskId,
          )
        ) {
          return;
        }
        this.claiming.add(message.taskId);
        this.send({ type: "task.claim", taskId: message.taskId });
        return;

      case "task.payload":
        this.claiming.delete(message.taskId);
        this.startStubRun(message);
        return;

      case "task.cancel": {
        const key = runKey(message);
        this.runs.get(key)?.run.abort("Task cancelled by gateway");
        this.runs.delete(key);
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
        this.runs.get(runKey(message))?.run.abort(
          "Task terminal acknowledgement received",
        );
        this.runs.delete(runKey(message));
        return;

      case "task.claim_rejected":
        this.claiming.delete(message.taskId);
        return;

      case "task.operation_rejected":
        this.runs.get(runKey(message))?.run.abort(
          `Task ${message.operation} rejected: ${message.reason}`,
        );
        this.runs.delete(runKey(message));
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
        const activeRun = this.runs.get(key);
        if (!activeRun) {
          return;
        }

        activeRun.run.abort(
          `Lease renewal omitted task ${lease.taskId} attempt ${lease.attemptId}`,
        );
        this.runs.delete(key);
        this.onFenced(lease);
      },
    });
    this.heartbeat.start();
  }

  private sendProviderStatus(): void {
    this.send({
      type: "provider.status",
      providers: (["codex", "claude"] as const).map((provider) => ({
        provider,
        installation: "installed",
        version: CONNECTOR_VERSION,
        authentication: "authenticated",
        compatibility: "supported",
      })),
    });
  }

  private startStubRun(
    message: Extract<
      ServerToDeviceMessage,
      { type: "task.payload" }
    >,
  ): void {
    const lease = {
      taskId: message.taskId,
      attemptId: message.attemptId,
    };
    const key = runKey(lease);
    this.runs.get(key)?.run.abort("Task payload replaced");

    let sequence = 0;
    const activeRun: ActiveStubRun = {
      kind: message.context.kind,
      terminalSent: false,
      run: createStubRun({
        ...lease,
        send: (event) => {
          sequence += 1;
          this.send({
            type: "task.event",
            ...lease,
            sequence,
            event,
          });
        },
        onComplete: () => {
          const current = this.runs.get(key);
          if (current !== activeRun || current.terminalSent) {
            return;
          }
          current.terminalSent = true;
          this.send({
            type: "task.complete",
            ...lease,
            result: {
              kind: current.kind,
              payload: { text: "Stub connector output." },
              partial: false,
            },
          });
        },
      }),
    };
    this.runs.set(key, activeRun);
  }
}
