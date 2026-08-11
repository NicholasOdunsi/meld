"use server";

import {
  FlowDocumentSchema,
  ProviderSchema,
  type FlowDocument,
} from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isCanvasTrialEnabled } from "./canvas-session";
import {
  hasStructuredConversationContext,
  USER_FLOW_CONTEXT_QUESTION,
} from "./user-flow-generation-context";

const InputSchema = z.object({
  roomId: z.string().uuid(),
  provider: ProviderSchema.optional(),
  clarification: z.string().trim().max(2000).optional(),
}).strict();

const TaskRowSchema = z.object({ id: z.string().uuid() }).passthrough();
const GenerationRowSchema = z.object({
  task_id: z.string().uuid(),
  room_id: z.string().uuid(),
  document: FlowDocumentSchema,
  created_at: z.string().datetime(),
}).strict();

export type GenerateUserFlowInput = z.input<typeof InputSchema>;
export type GenerateUserFlowResult =
  | { status: "queued"; taskId: string }
  | { status: "needs_context"; question: string }
  | { status: "error"; message: string };

export type UserFlowGeneration = {
  taskId: string;
  roomId: string;
  document: FlowDocument;
  createdAt: string;
};

const GENERATION_ERROR = "We could not start user flow generation.";

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

function parseGenerationRows(data: unknown): UserFlowGeneration[] | null {
  const parsed = z.array(GenerationRowSchema).safeParse(asRows(data));
  if (!parsed.success) return null;
  return parsed.data.map((row) => ({
    taskId: row.task_id,
    roomId: row.room_id,
    document: row.document,
    createdAt: row.created_at,
  }));
}

export async function generateUserFlow(
  input: GenerateUserFlowInput,
): Promise<GenerateUserFlowResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success || !isCanvasTrialEnabled()) {
    return { status: "error", message: GENERATION_ERROR };
  }

  try {
    const supabase = await createClient(new Headers());
    const [prdResult, messageResult] = await Promise.all([
      supabase.from("prds").select("id").eq("room_id", parsed.data.roomId).limit(1),
      supabase.from("messages").select("body").eq("room_id", parsed.data.roomId)
        .order("created_at", { ascending: false }).limit(20),
    ]);
    if (prdResult.error || messageResult.error) {
      return { status: "error", message: GENERATION_ERROR };
    }

    const hasPrd = (prdResult.data ?? []).length > 0;
    const hasContext = hasStructuredConversationContext(messageResult.data ?? []);
    if (!hasPrd && !hasContext && !parsed.data.clarification) {
      return { status: "needs_context", question: USER_FLOW_CONTEXT_QUESTION };
    }

    const { data, error } = await supabase.rpc("create_user_flow_generate_task", {
      target_room_id: parsed.data.roomId,
      target_provider: parsed.data.provider ?? null,
      target_clarification: parsed.data.clarification || null,
    });
    if (error) return { status: "error", message: GENERATION_ERROR };
    const task = TaskRowSchema.safeParse(Array.isArray(data) ? data[0] : data);
    if (!task.success) return { status: "error", message: GENERATION_ERROR };
    return { status: "queued", taskId: task.data.id };
  } catch {
    return { status: "error", message: GENERATION_ERROR };
  }
}

export async function getUserFlowGeneration(
  taskId: string,
): Promise<UserFlowGeneration | null> {
  const parsedId = z.string().uuid().safeParse(taskId);
  if (!parsedId.success || !isCanvasTrialEnabled()) return null;
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("get_user_flow_generation", {
      target_task_id: parsedId.data,
    });
    if (error) return null;
    return parseGenerationRows(data)?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function listUnappliedUserFlowGenerations(
  roomId: string,
): Promise<UserFlowGeneration[]> {
  const parsedId = z.string().uuid().safeParse(roomId);
  if (!parsedId.success || !isCanvasTrialEnabled()) return [];
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc(
      "list_unapplied_user_flow_generations",
      { target_room_id: parsedId.data },
    );
    if (error) return [];
    return parseGenerationRows(data) ?? [];
  } catch {
    return [];
  }
}

export async function markUserFlowGenerationApplied(taskId: string): Promise<boolean> {
  const parsedId = z.string().uuid().safeParse(taskId);
  if (!parsedId.success || !isCanvasTrialEnabled()) return false;
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("mark_user_flow_generation_applied", {
      target_task_id: parsedId.data,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
