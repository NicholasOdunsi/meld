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
    return parsed.data.map((row) => ({
      id: row.id, name: row.name, state: row.state, updating: row.updating,
      currentVersionId: row.current_version_id, formFactor: row.form_factor,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
