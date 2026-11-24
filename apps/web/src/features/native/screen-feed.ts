"use server";

import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

export type ScreenFeedRow = {
  id: string;
  name: string;
  state: "empty" | "built";
  updating: boolean;
  currentVersionId: string | null;
  formFactor: "mobile" | "tablet" | "desktop";
  createdAt: string;
  generationTaskId?: string | null;
  /** The Orion reply that proposed this screen; links it to a Star. */
  sourceMessageId?: string | null;
};

const Row = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: z.enum(["empty", "built"]),
  updating: z.boolean(),
  current_version_id: z.string().uuid().nullable(),
  form_factor: z.enum(["mobile", "tablet", "desktop"]),
  created_at: z.string(),
});

export async function listRoomScreenFeed(roomId: string): Promise<ScreenFeedRow[]> {
  if (!z.string().uuid().safeParse(roomId).success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignScreens } = await import("@/features/rooms/e2e-fake");
      const rows = await fakeListRoomDesignScreens(roomId);
      return rows.map((row) => ({
        id: row.id, name: row.name, state: row.state, updating: row.updating,
        currentVersionId: row.current_version_id, formFactor: "mobile" as const,
        createdAt: new Date(0).toISOString(),
      }));
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screens")
      .select("id,name,state,updating,current_version_id,form_factor,created_at")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return [];
    const parsed = z.array(Row).safeParse(data ?? []);
    if (!parsed.success) return [];
    // The generation table is participant-scoped. This association lets the
    // stream distinguish a build in progress from an empty flow placeholder.
    const { data: generations, error: generationError } = await supabase
      .from("design_screen_generations")
      .select("screen_id,task_id,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    const generationByScreen = new Map<string, string>();
    if (!generationError) {
      const generationRows = z.array(z.object({ screen_id: z.string().uuid(), task_id: z.string().uuid(), created_at: z.string() })).safeParse(generations ?? []);
      if (generationRows.success) {
        for (const generation of generationRows.data) generationByScreen.set(generation.screen_id, generation.task_id);
      }
    }
    // Which Orion reply asked for each screen. A failure only means no Star link.
    const sourceByScreen = new Map<string, string>();
    const { data: sources, error: sourceError } = await supabase
      .rpc("list_design_screen_sources", { target_room_id: roomId });
    if (!sourceError) {
      const sourceRows = z.array(z.object({ screen_id: z.string().uuid(), message_id: z.string().uuid() })).safeParse(sources ?? []);
      if (sourceRows.success) for (const source of sourceRows.data) sourceByScreen.set(source.screen_id, source.message_id);
    }
    return parsed.data.map((row) => ({
      id: row.id, name: row.name, state: row.state, updating: row.updating,
      currentVersionId: row.current_version_id, formFactor: row.form_factor,
      createdAt: row.created_at,
      generationTaskId: generationByScreen.get(row.id) ?? null,
      sourceMessageId: sourceByScreen.get(row.id) ?? null,
    }));
  } catch {
    return [];
  }
}
