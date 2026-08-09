import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  AgentKindSchema,
  AIContextManifestSchema,
  AIInstructionSchema,
  AITaskKindSchema,
  AITaskSchema,
  ProviderSchema,
  ModelNameSchema,
  ResearchScopeSchema,
} from "@meld/contracts";
import { isMissingModelAwareRpc } from "./model-rpc-compat";

export const CreateAITaskInputSchema = z.object({
  roomId: z.string().uuid(),
  deviceId: z.string().uuid(),
  provider: ProviderSchema,
  kind: AITaskKindSchema,
  instruction: AIInstructionSchema,
});

export type CreateAITaskInput = z.infer<
  typeof CreateAITaskInputSchema
>;

export const CreateRoomReplyTaskInputSchema = z.object({
  sourceMessageId: z.string().uuid(),
  provider: ProviderSchema.optional(),
  model: ModelNameSchema.optional(),
  agentKind: AgentKindSchema.default("product"),
  researchScope: ResearchScopeSchema.default("room"),
});

export type CreateRoomReplyTaskInput = z.input<
  typeof CreateRoomReplyTaskInputSchema
>;

const MANIFEST_ERROR =
  "We could not build the authorized room context.";
const CREATE_ERROR = "We could not create the AI task.";
const ROOM_REPLY_ERROR = "We could not ask the agent to reply.";
const CANCEL_ERROR = "We could not cancel the AI task.";

type IdentifierRow = { id: string };
type QueryResult = {
  data: IdentifierRow[] | null;
  error: unknown;
};

function normalizeDatabaseTimestamp(value: unknown) {
  if (typeof value !== "string") return value;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime())
    ? value
    : timestamp.toISOString();
}

function orderedRoomIdentifiers(
  supabase: SupabaseClient,
  table: "messages" | "evidence" | "decisions",
  roomId: string,
) {
  return supabase
    .from(table)
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
}

export async function buildAuthorizedRoomContextManifest(
  supabase: SupabaseClient,
  roomId: string,
) {
  try {
    const [messages, attachments, evidence, decisions] =
      (await Promise.all([
        orderedRoomIdentifiers(supabase, "messages", roomId),
        supabase
          .from("attachments")
          .select("id")
          .eq("room_id", roomId)
          .not("message_id", "is", null)
          .eq("discard_pending", false)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true }),
        orderedRoomIdentifiers(supabase, "evidence", roomId),
        orderedRoomIdentifiers(supabase, "decisions", roomId),
      ])) as QueryResult[];

    if (
      messages.error ||
      attachments.error ||
      evidence.error ||
      decisions.error ||
      !messages.data ||
      !attachments.data ||
      !evidence.data ||
      !decisions.data
    ) {
      throw new Error(MANIFEST_ERROR);
    }

    return AIContextManifestSchema.parse({
      messageIds: messages.data.map(({ id }) => id),
      attachmentIds: attachments.data.map(({ id }) => id),
      evidenceIds: evidence.data.map(({ id }) => id),
      decisionIds: decisions.data.map(({ id }) => id),
    });
  } catch {
    throw new Error(MANIFEST_ERROR);
  }
}

function taskFields(data: unknown) {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};

  return {
    id: record.id,
    initiatingUserId:
      record.initiatingUserId ?? record.initiating_user_id,
    organizationId: record.organizationId ?? record.organization_id,
    roomId: record.roomId ?? record.room_id,
    deviceId: record.deviceId ?? record.device_id,
    provider: record.provider,
    agentKind: record.agentKind ?? record.agent_kind,
    researchScope: record.researchScope ?? record.research_scope,
    kind: record.kind,
    status: record.status,
    contextRevision:
      record.contextRevision ?? record.context_revision,
    createdAt: normalizeDatabaseTimestamp(
      record.createdAt ?? record.created_at,
    ),
    updatedAt: normalizeDatabaseTimestamp(
      record.updatedAt ?? record.updated_at,
    ),
  };
}

export async function createAITask(
  supabase: SupabaseClient,
  input: CreateAITaskInput,
) {
  const manifest = await buildAuthorizedRoomContextManifest(
    supabase,
    input.roomId,
  );

  try {
    const { data, error } = await supabase.rpc("create_ai_task", {
      target_room_id: input.roomId,
      target_device_id: input.deviceId,
      target_provider: input.provider,
      target_kind: input.kind,
      target_instruction: input.instruction,
      target_manifest: manifest,
    });

    if (error || !data) {
      throw new Error(CREATE_ERROR);
    }

    return AITaskSchema.parse(taskFields(data));
  } catch {
    throw new Error(CREATE_ERROR);
  }
}

export async function createRoomReplyTask(
  supabase: SupabaseClient,
  input: CreateRoomReplyTaskInput,
) {
  const { sourceMessageId, provider, model, agentKind, researchScope } =
    CreateRoomReplyTaskInputSchema.parse(input);

  try {
    let result = await supabase.rpc(
      "create_room_reply_task",
      {
        target_source_message_id: sourceMessageId,
        target_provider: provider ?? null,
        target_model: model ?? null,
        target_agent_kind: agentKind,
        target_research_scope: researchScope,
      },
    );

    if (isMissingModelAwareRpc(result.error)) {
      result = await supabase.rpc("create_room_reply_task", {
        target_source_message_id: sourceMessageId,
        target_provider: provider ?? null,
        target_agent_kind: agentKind,
        target_research_scope: researchScope,
      });
    }

    const { data, error } = result;

    if (error || !data) {
      throw new Error(ROOM_REPLY_ERROR);
    }

    return AITaskSchema.parse(taskFields(data));
  } catch {
    throw new Error(ROOM_REPLY_ERROR);
  }
}

export async function cancelAITask(
  supabase: SupabaseClient,
  taskId: string,
) {
  try {
    const { data, error } = await supabase.rpc("cancel_ai_task", {
      target_task_id: taskId,
    });

    if (error || !data) {
      throw new Error(CANCEL_ERROR);
    }

    return AITaskSchema.parse(taskFields(data));
  } catch {
    throw new Error(CANCEL_ERROR);
  }
}
