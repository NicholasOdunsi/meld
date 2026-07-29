import {
  DeviceToServerMessageSchema,
  ServerToDeviceMessageSchema,
  type ActiveTaskLease,
  type DeviceToServerMessage,
  type ServerToDeviceMessage,
  type TaskEvent,
} from "@meld/contracts";
import WebSocket, { type RawData } from "ws";
import {
  createHeartbeatCoordinator,
  type HeartbeatCoordinator,
} from "../apps/connector/src/transport/heartbeat";

const CONNECTOR_VERSION = "fake-connector/1.0.0";
const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:8787/ws";
const MAX_SIMULATED_SEQUENCE = 100;

interface Arguments {
  gatewayUrl: string;
  credential: string;
  dropAfterClaim: boolean;
  gapAt?: number;
  replay?: number;
  holdHeartbeats: boolean;
  dropBeforeTerminalAck: boolean;
}

interface SimulatedRun extends ActiveTaskLease {
  kind:
    | "room_reply"
    | "prd_generate"
    | "prd_revise"
    | "stage_readiness";
  instruction: string;
  aborted: boolean;
}

interface Waiter {
  resolve(): void;
  reject(error: Error): void;
}

function valueOption(
  names: string[],
  fallback?: string,
): string | undefined {
  for (const name of names) {
    const index = process.argv.indexOf(name);
    if (index === -1) {
      continue;
    }
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value`);
    }
    return value;
  }
  return fallback;
}

function integerOption(name: string): number | undefined {
  const value = valueOption([name]);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_SIMULATED_SEQUENCE
  ) {
    throw new Error(
      `${name} must be an integer from 1 to ${MAX_SIMULATED_SEQUENCE}`,
    );
  }
  return parsed;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArguments(): Arguments {
  const credential = valueOption(
    ["--credential"],
    process.env.DEVICE_CREDENTIAL,
  );
  if (!credential) {
    throw new Error(
      "--credential <deviceId.secret> or DEVICE_CREDENTIAL is required",
    );
  }

  return {
    gatewayUrl:
      valueOption(
        ["--gateway-url", "--gateway"],
        process.env.GATEWAY_URL,
      ) ?? DEFAULT_GATEWAY_URL,
    credential,
    dropAfterClaim: hasFlag("--drop-after-claim"),
    gapAt: integerOption("--gap-at"),
    replay: integerOption("--replay"),
    holdHeartbeats: hasFlag("--hold-heartbeats"),
    dropBeforeTerminalAck: hasFlag(
      "--drop-before-terminal-ack",
    ),
  };
}

function runKey(taskId: string, attemptId: string): string {
  return `${taskId}:${attemptId}`;
}

function eventKey(
  taskId: string,
  attemptId: string,
  sequence: number,
): string {
  return `${runKey(taskId, attemptId)}:${sequence}`;
}

function parseServerFrame(data: RawData): ServerToDeviceMessage {
  if (!Buffer.isBuffer(data)) {
    throw new Error("Gateway sent a non-text-compatible frame");
  }
  const value = JSON.parse(data.toString("utf8")) as unknown;
  return ServerToDeviceMessageSchema.parse(value);
}

function simulatedEvent(sequence: number): TaskEvent {
  if (sequence % 2 === 0) {
    return {
      type: "text.delta",
      text: `Fake output segment ${sequence / 2}. `,
    };
  }
  return {
    type: "progress",
    label: `Fake connector step ${sequence}`,
    percent: Math.min(sequence * 20, 100),
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runConnector(args: Arguments): Promise<void> {
  const socket = new WebSocket(args.gatewayUrl, {
    headers: {
      authorization: `Device ${args.credential}`,
    },
  });
  const claiming = new Set<string>();
  const runs = new Map<string, SimulatedRun>();
  const eventWaiters = new Map<string, Waiter>();
  const terminalWaiters = new Map<string, Waiter>();
  let heartbeatCoordinator: HeartbeatCoordinator | undefined;
  let fatalError: Error | undefined;

  function writeStatus(message: string): void {
    process.stderr.write(`${message}\n`);
  }

  function send(message: DeviceToServerMessage): void {
    const parsed = DeviceToServerMessageSchema.parse(message);
    socket.send(JSON.stringify(parsed));
  }

  function rejectRunWaiters(run: ActiveTaskLease, error: Error): void {
    const prefix = `${runKey(run.taskId, run.attemptId)}:`;
    for (const [key, waiter] of eventWaiters) {
      if (key.startsWith(prefix)) {
        waiter.reject(error);
        eventWaiters.delete(key);
      }
    }
    const terminal = terminalWaiters.get(
      runKey(run.taskId, run.attemptId),
    );
    if (terminal) {
      terminal.reject(error);
      terminalWaiters.delete(runKey(run.taskId, run.attemptId));
    }
  }

  function abortRun(run: SimulatedRun, reason: string): void {
    if (run.aborted) {
      return;
    }
    run.aborted = true;
    runs.delete(runKey(run.taskId, run.attemptId));
    const error = new Error(reason);
    rejectRunWaiters(run, error);
    writeStatus(reason);
  }

  function waitForEventAck(
    run: SimulatedRun,
    sequence: number,
    event: TaskEvent,
  ): Promise<void> {
    const key = eventKey(run.taskId, run.attemptId, sequence);
    return new Promise<void>((resolve, reject) => {
      eventWaiters.set(key, { resolve, reject });
      send({
        type: "task.event",
        taskId: run.taskId,
        attemptId: run.attemptId,
        sequence,
        event,
      });
    });
  }

  function waitForTerminalAck(
    run: SimulatedRun,
    message: Extract<
      DeviceToServerMessage,
      { type: "task.complete" | "task.cancelled" }
    >,
  ): Promise<void> {
    const key = runKey(run.taskId, run.attemptId);
    return new Promise<void>((resolve, reject) => {
      terminalWaiters.set(key, { resolve, reject });
      send(message);
    });
  }

  function activeTasks(): ActiveTaskLease[] {
    return [...runs.values()].map(({ taskId, attemptId }) => ({
      taskId,
      attemptId,
    }));
  }

  async function simulate(run: SimulatedRun): Promise<void> {
    const finalSequence = Math.max(
      3,
      (args.gapAt ?? 0) + 1,
      args.replay ?? 0,
    );

    for (let sequence = 1; sequence <= finalSequence; sequence += 1) {
      if (run.aborted) {
        return;
      }
      if (sequence === args.gapAt) {
        writeStatus(`Skipping event sequence ${sequence}`);
        continue;
      }

      const event = simulatedEvent(sequence);
      await waitForEventAck(run, sequence, event);
      if (sequence === args.replay) {
        writeStatus(`Replaying event sequence ${sequence}`);
        await waitForEventAck(run, sequence, event);
      }
      await sleep(100);
    }

    if (run.aborted) {
      return;
    }

    const completion = {
      type: "task.complete",
      taskId: run.taskId,
      attemptId: run.attemptId,
      result: {
        kind: run.kind,
        payload: {
          text: `Fake connector completed: ${run.instruction.slice(0, 120)}`,
        },
        partial: false,
      },
    } satisfies DeviceToServerMessage;

    if (args.dropBeforeTerminalAck) {
      send(completion);
      socket.close(1000, "Dropping before terminal acknowledgement");
      return;
    }

    await waitForTerminalAck(run, completion);
    runs.delete(runKey(run.taskId, run.attemptId));
    writeStatus(`Completed task ${run.taskId}`);
  }

  async function handle(message: ServerToDeviceMessage): Promise<void> {
    switch (message.type) {
      case "session.accepted":
        send({
          type: "provider.status",
          providers: [
            {
              provider: "codex",
              installation: "installed",
              version: CONNECTOR_VERSION,
              authentication: "authenticated",
              compatibility: "supported",
            },
          ],
        });
        if (!args.holdHeartbeats) {
          heartbeatCoordinator?.stop();
          heartbeatCoordinator = createHeartbeatCoordinator({
            intervalMs: message.heartbeatSeconds * 1_000,
            getActiveTasks: activeTasks,
            sendHeartbeat(tasks) {
              send({
                type: "heartbeat",
                connectorVersion: CONNECTOR_VERSION,
                activeTasks: tasks,
              });
            },
            onLeaseOmitted(lease) {
              const run = runs.get(
                runKey(lease.taskId, lease.attemptId),
              );
              if (run) {
                abortRun(
                  run,
                  `Lease renewal fenced task ${run.taskId} attempt ${run.attemptId}`,
                );
              }
            },
          });
          heartbeatCoordinator.start();
        }
        writeStatus("Gateway session accepted");
        return;

      case "heartbeat.ack":
        heartbeatCoordinator?.acknowledge(message.renewedTasks);
        return;

      case "task.available":
        if (
          claiming.has(message.taskId) ||
          [...runs.values()].some(
            (run) => run.taskId === message.taskId,
          )
        ) {
          return;
        }
        claiming.add(message.taskId);
        send({ type: "task.claim", taskId: message.taskId });
        if (args.dropAfterClaim) {
          socket.close(1000, "Dropping after claim");
        }
        return;

      case "task.payload": {
        claiming.delete(message.taskId);
        const run: SimulatedRun = {
          taskId: message.taskId,
          attemptId: message.attemptId,
          kind: message.context.kind,
          instruction: message.context.instruction,
          aborted: false,
        };
        runs.set(runKey(run.taskId, run.attemptId), run);
        void simulate(run).catch((error: unknown) => {
          if (!run.aborted) {
            abortRun(
              run,
              error instanceof Error
                ? error.message
                : "Simulated run failed",
            );
          }
        });
        return;
      }

      case "task.cancel": {
        const key = runKey(message.taskId, message.attemptId);
        const run = runs.get(key);
        if (run) {
          abortRun(run, `Task ${message.taskId} was cancelled`);
        }
        await waitForTerminalAck(
          run ?? {
            taskId: message.taskId,
            attemptId: message.attemptId,
            kind: "room_reply",
            instruction: "",
            aborted: true,
          },
          {
            type: "task.cancelled",
            taskId: message.taskId,
            attemptId: message.attemptId,
          },
        );
        return;
      }

      case "task.event_ack": {
        const key = eventKey(
          message.taskId,
          message.attemptId,
          message.sequence,
        );
        const waiter = eventWaiters.get(key);
        eventWaiters.delete(key);
        waiter?.resolve();
        return;
      }

      case "task.terminal_ack": {
        const key = runKey(message.taskId, message.attemptId);
        const waiter = terminalWaiters.get(key);
        terminalWaiters.delete(key);
        waiter?.resolve();
        runs.delete(key);
        return;
      }

      case "task.claim_rejected":
        claiming.delete(message.taskId);
        writeStatus(
          `Claim rejected for ${message.taskId}: ${message.reason}`,
        );
        return;

      case "task.operation_rejected": {
        const key = runKey(message.taskId, message.attemptId);
        const run = runs.get(key);
        if (run) {
          abortRun(
            run,
            `${message.operation} rejected for ${message.taskId}: ${message.reason}`,
          );
        }
        return;
      }
    }
  }

  function rejectAllWaiters(error: Error): void {
    for (const waiter of eventWaiters.values()) {
      waiter.reject(error);
    }
    eventWaiters.clear();
    for (const waiter of terminalWaiters.values()) {
      waiter.reject(error);
    }
    terminalWaiters.clear();
  }

  await new Promise<void>((resolve) => {
    socket.on("message", (data) => {
      void Promise.resolve()
        .then(() => handle(parseServerFrame(data)))
        .catch((error: unknown) => {
          fatalError =
            error instanceof Error ? error : new Error(String(error));
          socket.close(1011, "Fake connector protocol error");
        });
    });
    socket.once("error", (error) => {
      fatalError = error;
    });
    socket.once("close", () => {
      heartbeatCoordinator?.stop();
      rejectAllWaiters(
        fatalError ?? new Error("Gateway connection closed"),
      );
      resolve();
    });
  });

  if (fatalError) {
    throw fatalError;
  }
}

async function main(): Promise<void> {
  await runConnector(readArguments());
}

void main().catch((error: unknown) => {
  console.error("Fake connector stopped", error);
  process.exitCode = 1;
});
