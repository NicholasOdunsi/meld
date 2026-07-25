import { z } from "zod";
import {
  AIContextPackageSchema,
  AITaskKindSchema,
  ProviderSchema,
  ProviderStatusSchema,
} from "./ai";

export const TaskErrorCodeSchema = z.enum([
  "authentication_required",
  "usage_limit_reached",
  "provider_unavailable",
  "provider_install_failed",
  "connector_outdated",
  "permission_changed",
  "security_boundary_violated",
  "malformed_output",
  "cancelled",
  "unknown",
]);
export type TaskErrorCode = z.infer<typeof TaskErrorCodeSchema>;

export const AIResultEnvelopeSchema = z.object({
  kind: AITaskKindSchema,
  payload: z.unknown(),
  partial: z.boolean().default(false),
});
export type AIResultEnvelope = z.infer<typeof AIResultEnvelopeSchema>;

export const ServerToDeviceMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.accepted"),
    heartbeatSeconds: z.number().int().positive(),
  }),
  z.object({ type: z.literal("task.available"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.payload"),
    taskId: z.string().uuid(),
    provider: ProviderSchema,
    context: AIContextPackageSchema,
  }),
  z.object({ type: z.literal("task.cancel"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.event_ack"),
    taskId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
  }),
]);
export type ServerToDeviceMessage = z.infer<
  typeof ServerToDeviceMessageSchema
>;

export const DeviceToServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heartbeat"), connectorVersion: z.string() }),
  z.object({
    type: z.literal("provider.status"),
    providers: z.array(ProviderStatusSchema),
  }),
  z.object({ type: z.literal("task.claim"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.event"),
    taskId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    event: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal("task.complete"),
    taskId: z.string().uuid(),
    result: AIResultEnvelopeSchema,
  }),
  z.object({ type: z.literal("task.cancelled"), taskId: z.string().uuid() }),
  z.object({
    type: z.literal("task.fail"),
    taskId: z.string().uuid(),
    code: TaskErrorCodeSchema,
    message: z.string().max(2_000),
  }),
]);
export type DeviceToServerMessage = z.infer<
  typeof DeviceToServerMessageSchema
>;
