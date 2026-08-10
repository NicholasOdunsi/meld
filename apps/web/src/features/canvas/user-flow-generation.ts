"use server";

import {
  FlowDocumentSchema,
  ProviderSchema,
  type FlowDocument,
} from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isCanvasTrialEnabled } from "./canvas-session";

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

const USER_FLOW_CONTEXT_QUESTION =
  "What user goal, starting point, and successful outcome should this flow cover?";

const GENERATION_ERROR = "We could not start user flow generation.";

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
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
    const hasContext = (messageResult.data ?? []).some(
      (message) => typeof message.body === "string" && message.body.trim().length >= 10,
    );
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
    const row = GenerationRowSchema.safeParse(asRows(data)[0]);
    if (!row.success) return null;
    return {
      taskId: row.data.task_id,
      roomId: row.data.room_id,
      document: row.data.document,
      createdAt: row.data.created_at,
    };
  } catch {
    return null;
  }
}
