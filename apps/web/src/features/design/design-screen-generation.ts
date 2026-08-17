"use server";
import { ProviderSchema } from "@meld/contracts";
import {
  SketchLayoutSchema,
  combineInstructionWithBlocks,
  formatScreenGenerationContext,
  formatSketchLayoutForPrompt,
} from "@meld/prototype";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const ScreenGenerationContextSchema = z.object({
  existingScreens: z.array(z.object({ key: z.string(), name: z.string() }).strict()),
  danglingTargets: z.array(z.string()),
  existingLayouts: z.array(z.object({ key: z.string(), name: z.string() }).strict()).default([]),
}).strict();

const GenerateInput = z.object({
  roomId: z.string().uuid(),
  screenId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  instruction: z.string().trim().min(1).max(4000),
  provider: ProviderSchema.optional(),
  model: z.string().trim().min(1).max(100).optional(),
  layout: SketchLayoutSchema.optional(),
  context: ScreenGenerationContextSchema.optional(),
}).strict();

export type GenerateDesignScreenResult =
  | { status: "queued"; taskId: string; screenId: string }
  | { status: "error"; message: string };

const GENERATION_ERROR = "We could not start screen generation.";
const ScreenRow = z.object({ id: z.string().uuid() }).passthrough();
const TaskRow = z.object({ id: z.string().uuid() }).passthrough();

export async function generateDesignScreen(
  input: z.input<typeof GenerateInput>,
): Promise<GenerateDesignScreenResult> {
  const parsed = GenerateInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: GENERATION_ERROR };
  const layoutBlock = parsed.data.layout ? formatSketchLayoutForPrompt(parsed.data.layout) : "";
  const contextBlock = parsed.data.context
    ? formatScreenGenerationContext(parsed.data.context)
    : "";
  // combineInstructionWithBlocks reserves space for the layout and EXISTING
  // SCREENS blocks up front (as one unit) before trimming, so each survives
  // intact whenever the whole thing can fit -- only the instruction is ever
  // trimmed, and only from its own tail. A naive chain of separate
  // combineInstructionWithLayout calls would instead treat each call's
  // output as the "instruction" for the next, truncating into an
  // already-embedded block instead of preserving it -- this avoids that.
  const instruction = combineInstructionWithBlocks(parsed.data.instruction, [
    layoutBlock,
    contextBlock,
  ]);
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGenerateDesignScreen } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGenerateDesignScreen({ ...parsed.data, instruction });
    }
    const supabase = await createClient(new Headers());
    let screenId = parsed.data.screenId;
    if (!screenId) {
      const { data, error } = await supabase.rpc("create_design_screen", {
        target_room_id: parsed.data.roomId,
        screen_name: parsed.data.name ?? "Screen",
      });
      const screen = ScreenRow.safeParse(Array.isArray(data) ? data[0] : data);
      if (error || !screen.success) return { status: "error", message: GENERATION_ERROR };
      screenId = screen.data.id;
    }
    // target_model is only included when chosen -- an omitted key (rather
    // than an explicit null) resolves PostgREST to the existing
    // three-argument overload unchanged, so a caller that never picks a
    // model keeps behaving exactly as it did before model selection existed.
    const rpcParams: {
      target_screen_id: string;
      target_provider: string | null;
      target_instruction: string;
      target_model?: string;
    } = {
      target_screen_id: screenId,
      target_provider: parsed.data.provider ?? null,
      target_instruction: instruction,
    };
    if (parsed.data.model) rpcParams.target_model = parsed.data.model;
    const { data, error } = await supabase.rpc(
      "create_design_screen_generate_task",
      rpcParams,
    );
    const task = TaskRow.safeParse(data); // jsonb object, not a row array
    if (error || !task.success) return { status: "error", message: GENERATION_ERROR };
    // Persist the user's RAW words (pre layout/context blocks) so the Agents
    // transcript can show a clean "You: <prompt>" bubble -- ai_tasks.instruction
    // is the block-combined connector prompt, not the user's message. Best
    // effort: a failed prompt write must not fail the (already-queued)
    // generation, only lose that one turn's prompt text.
    await supabase
      .rpc("set_design_generation_user_prompt", {
        target_task_id: task.data.id,
        target_prompt: parsed.data.instruction,
      })
      .then(undefined, () => undefined);
    return { status: "queued", taskId: task.data.id, screenId };
  } catch {
    return { status: "error", message: GENERATION_ERROR };
  }
}

const GenRow = z.object({
  task_id: z.string().uuid(),
  screen_id: z.string().uuid(),
  version_id: z.string().uuid().nullable(),
  promoted: z.boolean().nullable(),
}).strict();
export type DesignScreenGeneration = {
  taskId: string; screenId: string; versionId: string | null; promoted: boolean | null;
};

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getDesignScreenGeneration(
  taskId: string,
): Promise<DesignScreenGeneration | null> {
  const id = z.string().uuid().safeParse(taskId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetDesignScreenGeneration } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGetDesignScreenGeneration(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("get_design_screen_generation", { target_task_id: id.data });
    if (error) { console.error("getDesignScreenGeneration RPC error", { taskId, error }); return null; }
    const rows = z.array(GenRow).safeParse(asRows(data));
    if (!rows.success) { console.error("getDesignScreenGeneration parse failed", { taskId, data }); return null; }
    const row = rows.data[0];
    return row ? { taskId: row.task_id, screenId: row.screen_id, versionId: row.version_id, promoted: row.promoted } : null;
  } catch (thrown) { console.error("getDesignScreenGeneration threw", { taskId, thrown }); return null; }
}

const RestoreInput = z.object({ screenId: z.string().uuid(), versionId: z.string().uuid() }).strict();
export type RestoreResult = { status: "restored"; versionId: string } | { status: "error"; message: string };

export async function restoreDesignScreenVersion(
  input: z.input<typeof RestoreInput>,
): Promise<RestoreResult> {
  const parsed = RestoreInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Could not restore." };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRestoreDesignScreenVersion } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeRestoreDesignScreenVersion(parsed.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("restore_design_screen_version", {
      target_screen_id: parsed.data.screenId, target_version_id: parsed.data.versionId,
    });
    const row = ScreenRow.safeParse(Array.isArray(data) ? data[0] : data);
    if (error || !row.success) return { status: "error", message: "Could not restore." };
    return { status: "restored", versionId: row.data.id };
  } catch { return { status: "error", message: "Could not restore." }; }
}

const ScreenListRow = z.object({
  id: z.string().uuid(), name: z.string(), state: z.enum(["empty", "built"]),
  updating: z.boolean(), current_version_id: z.string().uuid().nullable(),
}).strict();
export type RoomDesignScreen = z.infer<typeof ScreenListRow>;

export async function listRoomDesignScreens(roomId: string): Promise<RoomDesignScreen[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignScreens } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeListRoomDesignScreens(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screens")
      .select("id,name,state,updating,current_version_id")
      .eq("room_id", id.data).is("deleted_at", null).order("canvas_x", { ascending: true });
    if (error) { console.error("listRoomDesignScreens error", { roomId, error }); return []; }
    const rows = z.array(ScreenListRow).safeParse(data ?? []);
    return rows.success ? rows.data : [];
  } catch (thrown) { console.error("listRoomDesignScreens threw", { roomId, thrown }); return []; }
}

const VersionRow = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  promoted: z.boolean(),
}).strict();
export type DesignScreenVersion = { id: string; createdAt: string; promoted: boolean };

export async function listDesignScreenVersions(screenId: string): Promise<DesignScreenVersion[]> {
  const id = z.string().uuid().safeParse(screenId);
  if (!id.success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListDesignScreenVersions } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeListDesignScreenVersions(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screen_versions")
      .select("id,created_at,promoted")
      .eq("screen_id", id.data)
      .order("created_at", { ascending: false });
    if (error) { console.error("listDesignScreenVersions error", { screenId, error }); return []; }
    const rows = z.array(VersionRow).safeParse(data ?? []);
    return rows.success
      ? rows.data.map((row) => ({ id: row.id, createdAt: row.created_at, promoted: row.promoted }))
      : [];
  } catch (thrown) { console.error("listDesignScreenVersions threw", { screenId, thrown }); return []; }
}
