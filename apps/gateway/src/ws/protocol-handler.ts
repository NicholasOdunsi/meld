import {
  AIContextPackageSchema,
  DeviceToServerMessageSchema,
  TaskOperationRejectionSchema,
  type DeviceToServerMessage,
  type TaskClaimRejection,
  type TaskOperation,
  type TaskOperationRejection,
} from "@meld/contracts";
import type { RawData } from "ws";
import {
  GatewayRepositoryError,
  type TaskRepository,
} from "../tasks/task-repository";
import type { DeviceSession } from "./device-session";

const INVALID_FRAME_REASON = "Invalid device protocol frame";
const INVALID_OPERATION_REASON = "Invalid device protocol operation";
const REVOKED_DEVICE_REASON = "device_revoked";

const CLOSE_AFTER_REJECTION = new Set<TaskOperationRejection>([
  "out_of_order_ai_task_event",
  "conflicting_ai_task_event",
  "conflicting_ai_task_settlement",
]);

type ProtocolRepository = Pick<
  TaskRepository,
  | "recordDeviceConnection"
  | "renewTaskLeases"
  | "upsertProviderConnections"
  | "claimTask"
  | "hydrateAuthorizedRoomContext"
  | "appendTaskEvent"
  | "settleTask"
  | "acknowledgeTaskCancellation"
>;

interface ProtocolHandlerOptions {
  repository: ProtocolRepository;
}

interface OperationIdentity {
  taskId: string;
  attemptId: string;
  operation: TaskOperation;
}

function parseTextFrame(rawFrame: RawData): unknown {
  if (!Buffer.isBuffer(rawFrame)) {
    throw new Error(INVALID_FRAME_REASON);
  }

  return JSON.parse(rawFrame.toString("utf8")) as unknown;
}

function mapClaimError(error: unknown): TaskClaimRejection | null {
  if (!(error instanceof GatewayRepositoryError)) {
    return null;
  }

  switch (error.databaseMessage) {
    case "ai_task_claim_rejected":
      return "claim_lost";
    case "permission_changed":
      return "permission_changed";
    default:
      return null;
  }
}

function mapOperationError(
  error: unknown,
): TaskOperationRejection | null {
  if (!(error instanceof GatewayRepositoryError)) {
    return null;
  }

  const parsed = TaskOperationRejectionSchema.safeParse(
    error.databaseMessage,
  );
  return parsed.success ? parsed.data : null;
}

function rejectClaim(
  session: DeviceSession,
  taskId: string,
  reason: TaskClaimRejection,
): void {
  session.send({ type: "task.claim_rejected", taskId, reason });
}

function rejectOperation(
  session: DeviceSession,
  error: unknown,
  identity: OperationIdentity,
): boolean {
  const reason = mapOperationError(error);
  if (!reason) {
    return false;
  }

  session.send({
    type: "task.operation_rejected",
    ...identity,
    reason,
  });
  if (CLOSE_AFTER_REJECTION.has(reason)) {
    session.close(1008, INVALID_OPERATION_REASON);
  }
  return true;
}

function assertNever(message: never): never {
  throw new Error(`Unhandled device protocol message: ${String(message)}`);
}

export function createProtocolHandler({
  repository,
}: ProtocolHandlerOptions) {
  async function handleClaim(
    session: DeviceSession,
    message: Extract<DeviceToServerMessage, { type: "task.claim" }>,
  ): Promise<void> {
    try {
      const claimed = await repository.claimTask(
        message.taskId,
        session.deviceId,
      );
      const hydration =
        await repository.hydrateAuthorizedRoomContext(
          claimed.taskId,
          claimed.attemptId,
        );

      if (hydration.status === "rejected") {
        rejectClaim(session, message.taskId, hydration.reason);
        return;
      }

      const context = AIContextPackageSchema.safeParse(
        hydration.context,
      );
      if (!context.success) {
        throw new Error("Invalid hydrated AI context");
      }

      session.send({
        type: "task.payload",
        taskId: claimed.taskId,
        attemptId: claimed.attemptId,
        provider: claimed.provider,
        context: context.data,
      });
    } catch (error) {
      const reason = mapClaimError(error);
      if (!reason) {
        throw error;
      }
      rejectClaim(session, message.taskId, reason);
    }
  }

  async function handleEvent(
    session: DeviceSession,
    message: Extract<DeviceToServerMessage, { type: "task.event" }>,
  ): Promise<void> {
    try {
      const sequence = await repository.appendTaskEvent({
        taskId: message.taskId,
        deviceId: session.deviceId,
        attemptId: message.attemptId,
        sequence: message.sequence,
        event: message.event,
      });
      session.send({
        type: "task.event_ack",
        taskId: message.taskId,
        attemptId: message.attemptId,
        sequence,
      });
    } catch (error) {
      if (
        !rejectOperation(session, error, {
          taskId: message.taskId,
          attemptId: message.attemptId,
          operation: "event",
        })
      ) {
        throw error;
      }
    }
  }

  async function handleComplete(
    session: DeviceSession,
    message: Extract<
      DeviceToServerMessage,
      { type: "task.complete" }
    >,
  ): Promise<void> {
    try {
      const status = await repository.settleTask({
        taskId: message.taskId,
        deviceId: session.deviceId,
        attemptId: message.attemptId,
        operation: "complete",
        code: null,
        message: null,
        result: message.result,
        partial: message.result.partial,
      });
      session.send({
        type: "task.terminal_ack",
        taskId: message.taskId,
        attemptId: message.attemptId,
        status,
      });
    } catch (error) {
      if (
        !rejectOperation(session, error, {
          taskId: message.taskId,
          attemptId: message.attemptId,
          operation: "complete",
        })
      ) {
        throw error;
      }
    }
  }

  async function handleFail(
    session: DeviceSession,
    message: Extract<DeviceToServerMessage, { type: "task.fail" }>,
  ): Promise<void> {
    try {
      const status = await repository.settleTask({
        taskId: message.taskId,
        deviceId: session.deviceId,
        attemptId: message.attemptId,
        operation: "fail",
        code: message.code,
        message: message.message,
        result: null,
        partial: false,
      });
      session.send({
        type: "task.terminal_ack",
        taskId: message.taskId,
        attemptId: message.attemptId,
        status,
      });
    } catch (error) {
      if (
        !rejectOperation(session, error, {
          taskId: message.taskId,
          attemptId: message.attemptId,
          operation: "fail",
        })
      ) {
        throw error;
      }
    }
  }

  async function handleCancelled(
    session: DeviceSession,
    message: Extract<
      DeviceToServerMessage,
      { type: "task.cancelled" }
    >,
  ): Promise<void> {
    try {
      await repository.acknowledgeTaskCancellation(
        message.taskId,
        message.attemptId,
        session.deviceId,
      );
      session.send({
        type: "task.terminal_ack",
        taskId: message.taskId,
        attemptId: message.attemptId,
        status: "cancelled",
      });
    } catch (error) {
      if (
        !rejectOperation(session, error, {
          taskId: message.taskId,
          attemptId: message.attemptId,
          operation: "cancelled",
        })
      ) {
        throw error;
      }
    }
  }

  return {
    async handle(
      session: DeviceSession,
      rawFrame: RawData,
    ): Promise<void> {
      let value: unknown;
      try {
        value = parseTextFrame(rawFrame);
      } catch {
        session.close(1008, INVALID_FRAME_REASON);
        return;
      }

      const parsed = DeviceToServerMessageSchema.safeParse(value);
      if (!parsed.success) {
        session.close(1008, INVALID_FRAME_REASON);
        return;
      }

      const message = parsed.data;
      switch (message.type) {
        case "heartbeat": {
          session.markHeartbeat();
          const status = await repository.recordDeviceConnection(
            session.deviceId,
            message.connectorVersion,
          );
          // Revocation cannot reach an already-open socket any other way: the
          // device authenticated once, at upgrade (design §10.1).
          if (status !== "active") {
            session.close(1008, REVOKED_DEVICE_REASON);
            return;
          }
          const renewedTasks = await repository.renewTaskLeases(
            session.deviceId,
            message.activeTasks,
          );
          session.send({ type: "heartbeat.ack", renewedTasks });
          return;
        }
        case "provider.status":
          await repository.upsertProviderConnections(
            session.deviceId,
            message.providers,
          );
          return;
        case "task.claim":
          await handleClaim(session, message);
          return;
        case "task.event":
          await handleEvent(session, message);
          return;
        case "task.complete":
          await handleComplete(session, message);
          return;
        case "task.fail":
          await handleFail(session, message);
          return;
        case "task.cancelled":
          await handleCancelled(session, message);
          return;
        default:
          return assertNever(message);
      }
    },
  };
}
