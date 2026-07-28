import { z } from "zod";
import {
  AIContextPackageSchema,
  AITaskKindSchema,
  AITaskStatusSchema,
  MAX_RESULT_BYTES,
  ProviderSchema,
  ProviderStatusSchema,
} from "./ai";

export const MAX_ACTIVE_TASKS = 32;
export const MAX_WS_FRAME_BYTES = 1024 * 1024;

export const TaskErrorCodeSchema = z.enum([
  "authentication_required",
  "usage_limit_reached",
  "provider_unavailable",
  "provider_install_failed",
  "connector_outdated",
  "permission_changed",
  "security_boundary_violated",
  "malformed_output",
  "execution_abandoned",
  "cancelled",
  "unknown",
]);
export type TaskErrorCode = z.infer<typeof TaskErrorCodeSchema>;

export const TaskOperationSchema = z.enum([
  "event",
  "complete",
  "fail",
  "cancelled",
]);
export type TaskOperation = z.infer<typeof TaskOperationSchema>;

export const TaskOperationRejectionSchema = z.enum([
  "stale_ai_task_attempt",
  "out_of_order_ai_task_event",
  "conflicting_ai_task_event",
  "conflicting_ai_task_settlement",
]);
export type TaskOperationRejection = z.infer<
  typeof TaskOperationRejectionSchema
>;

export const TaskClaimRejectionSchema = z.enum([
  "claim_lost",
  "permission_changed",
  "context_too_large",
]);
export type TaskClaimRejection = z.infer<typeof TaskClaimRejectionSchema>;

export const ActiveTaskLeaseSchema = z.object({
  taskId: z.string().uuid(),
  attemptId: z.string().uuid(),
});
export type ActiveTaskLease = z.infer<typeof ActiveTaskLeaseSchema>;

export const TaskEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    label: z.string().min(1).max(200),
    percent: z.number().min(0).max(100).optional(),
  }),
  z.object({ type: z.literal("text.delta"), text: z.string().max(10_000) }),
  z.object({
    type: z.literal("notice"),
    code: TaskErrorCodeSchema,
    message: z.string().max(2_000),
  }),
]);
export type TaskEvent = z.infer<typeof TaskEventSchema>;

const jsonBytes = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? Number.POSITIVE_INFINITY
    : new TextEncoder().encode(serialized).byteLength;
};

const FrameSizeSchema = z.unknown().refine(
  (value) => jsonBytes(value) <= MAX_WS_FRAME_BYTES,
  {
    message: "WebSocket frame exceeds the maximum serialized size",
  },
);

export const AIResultEnvelopeSchema = z
  .object({
    kind: AITaskKindSchema,
    payload: z.unknown(),
    partial: z.boolean().default(false),
  })
  .refine((value) => jsonBytes(value) <= MAX_RESULT_BYTES, {
    message: "AI result exceeds the maximum serialized size",
  });
export type AIResultEnvelope = z.infer<typeof AIResultEnvelopeSchema>;

export const ServerToDeviceMessageSchema = FrameSizeSchema.pipe(
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("session.accepted"),
      heartbeatSeconds: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("heartbeat.ack"),
      renewedTasks: z.array(ActiveTaskLeaseSchema).max(MAX_ACTIVE_TASKS),
    }),
    z.object({ type: z.literal("task.available"), taskId: z.string().uuid() }),
    z.object({
      type: z.literal("task.payload"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      provider: ProviderSchema,
      context: AIContextPackageSchema,
    }),
    z.object({
      type: z.literal("task.cancel"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
    }),
    z.object({
      type: z.literal("task.event_ack"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("task.claim_rejected"),
      taskId: z.string().uuid(),
      reason: TaskClaimRejectionSchema,
    }),
    z.object({
      type: z.literal("task.operation_rejected"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      operation: TaskOperationSchema,
      reason: TaskOperationRejectionSchema,
    }),
    z.object({
      type: z.literal("task.terminal_ack"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      status: AITaskStatusSchema,
    }),
  ]),
);
export type ServerToDeviceMessage = z.infer<
  typeof ServerToDeviceMessageSchema
>;

export const DeviceToServerMessageSchema = FrameSizeSchema.pipe(
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("heartbeat"),
      connectorVersion: z.string().max(100),
      activeTasks: z.array(ActiveTaskLeaseSchema).max(MAX_ACTIVE_TASKS),
    }),
    z.object({
      type: z.literal("provider.status"),
      providers: z
        .array(ProviderStatusSchema)
        .max(ProviderSchema.options.length),
    }),
    z.object({ type: z.literal("task.claim"), taskId: z.string().uuid() }),
    z.object({
      type: z.literal("task.event"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      sequence: z.number().int().nonnegative(),
      event: TaskEventSchema,
    }),
    z.object({
      type: z.literal("task.complete"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      result: AIResultEnvelopeSchema,
    }),
    z.object({
      type: z.literal("task.fail"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
      code: TaskErrorCodeSchema,
      message: z.string().max(2_000),
    }),
    z.object({
      type: z.literal("task.cancelled"),
      taskId: z.string().uuid(),
      attemptId: z.string().uuid(),
    }),
  ]),
);
export type DeviceToServerMessage = z.infer<
  typeof DeviceToServerMessageSchema
>;
