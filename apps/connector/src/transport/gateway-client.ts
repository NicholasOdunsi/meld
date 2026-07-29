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
    this.stoppedReason = undefined;
    this.retryAttempt = 0;
    await this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearRetry();
    this.stopHeartbeat();
    this.abortAllRuns("Gateway client stopped");
    this.claiming.clear();

    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "Gateway client stopped");
  }

  private async connect(): Promise<void> {
    if (!this.running) {
      return;
    }

    const credential = await this.credentialStore.read();
    if (!this.running) {
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
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    let failed = false;
    const failConnection = (): void => {
      if (failed) {
        return;
      }
      failed = true;
      if (this.socket !== socket || !this.running) {
        return;
      }

      this.socket = undefined;
      this.stopHeartbeat();
      this.abortAllRuns("Gateway connection lost");
      this.claiming.clear();
      socket.close();
      this.scheduleReconnect();
    };

    socket.on("unexpected-response", (_request, response) => {
      response.resume?.();
      if (response.statusCode === 401) {
        failed = true;
        this.stopTerminal(REPAIR_REQUIRED, socket);
        return;
      }
      failConnection();
    });
    socket.on("error", failConnection);
    socket.on("close", failConnection);
    socket.on("message", (data) => {
      try {
        this.handleMessage(parseServerMessage(data));
      } catch {
        socket.close(1008, "Invalid gateway protocol frame");
        failConnection();
      }
    });
  }

  private scheduleReconnect(): void {
    if (!this.running || this.retryTimer) {
      return;
    }

    const delay = nextBackoffDelay(this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, delay);
  }

  private stopTerminal(
    reason: string,
    rejectedSocket = this.socket,
  ): void {
    this.running = false;
    this.stoppedReason = reason;
    this.clearRetry();
    this.stopHeartbeat();
    this.abortAllRuns(reason);
    this.claiming.clear();
    if (this.socket === rejectedSocket) {
      this.socket = undefined;
    }
    rejectedSocket?.close(1008, reason);
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
