"use server";
import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const GenerateInput = z.object({
  roomId: z.string().uuid(),
  screenId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  instruction: z.string().trim().min(1).max(4000),
  provider: ProviderSchema.optional(),
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
  try {
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
    const { data, error } = await supabase.rpc("create_design_screen_generate_task", {
      target_screen_id: screenId,
      target_provider: parsed.data.provider ?? null,
      target_instruction: parsed.data.instruction,
    });
    const task = TaskRow.safeParse(data); // jsonb object, not a row array
    if (error || !task.success) return { status: "error", message: GENERATION_ERROR };
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
