import "server-only";

import { InspirationLabelsSchema } from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { inferTarget } from "./infer-target";
import { pickInspiration, type InspirationCandidate, type PickedInspiration } from "./pick-inspiration";

const LIBRARY_SCAN_LIMIT = 500;

const RoomSchema = z.object({ workspace_id: z.string().uuid() });
const ScreensSchema = z.array(z.object({ form_factor: z.enum(["mobile", "tablet", "desktop"]) }));
const LinksSchema = z.array(z.object({ item_id: z.string().uuid(), created_at: z.string() }));
const LabelRowsSchema = z.array(
  z.object({
    item_id: z.string().uuid(),
    device: z.string(),
    screen_type: z.string(),
    patterns: z.array(z.string()),
    theme: z.string(),
    colors: z.array(z.string()),
    style_words: z.array(z.string()),
    description: z.string(),
    updated_at: z.string(),
  }),
);

function toCandidates(rows: z.infer<typeof LabelRowsSchema>): InspirationCandidate[] {
  return rows.flatMap((row) => {
    const labels = InspirationLabelsSchema.safeParse({
      device: row.device,
      screenType: row.screen_type,
      patterns: row.patterns,
      theme: row.theme,
      colors: row.colors,
      styleWords: row.style_words,
      description: row.description,
    });
    return labels.success ? [{ itemId: row.item_id, labels: labels.data, addedAt: row.updated_at }] : [];
  });
}

// Best-effort: screen generation must never fail because of inspiration.
export async function loadInspirationPicks(
  supabase: SupabaseClient,
  { roomId, instruction, screenName }: { roomId: string; instruction: string; screenName: string | null },
): Promise<PickedInspiration[]> {
  try {
    const room = await supabase.from("rooms").select("workspace_id").eq("id", roomId).maybeSingle();
    const parsedRoom = RoomSchema.safeParse(room.data);
    if (room.error || !parsedRoom.success) return [];

    const [screens, links, labels] = await Promise.all([
      supabase.from("design_screens").select("form_factor").eq("room_id", roomId),
      supabase.from("room_inspiration").select("item_id,created_at").eq("room_id", roomId),
      supabase
        .from("inspiration_labels")
        .select("item_id,device,screen_type,patterns,theme,colors,style_words,description,updated_at")
        .eq("workspace_id", parsedRoom.data.workspace_id)
        .eq("status", "sorted")
        .order("updated_at", { ascending: false })
        .limit(LIBRARY_SCAN_LIMIT),
    ]);
    const parsedScreens = ScreensSchema.safeParse(screens.data ?? []);
    const parsedLinks = LinksSchema.safeParse(links.data ?? []);
    const parsedLabels = LabelRowsSchema.safeParse(labels.data ?? []);
    if (screens.error || links.error || labels.error || !parsedScreens.success || !parsedLinks.success || !parsedLabels.success) {
      return [];
    }

    const library = toCandidates(parsedLabels.data);
    const linkedAt = new Map(parsedLinks.data.map((link) => [link.item_id, link.created_at]));
    const roomItems = library
      .filter((candidate) => linkedAt.has(candidate.itemId))
      .map((candidate) => ({ ...candidate, addedAt: linkedAt.get(candidate.itemId) ?? candidate.addedAt }));

    const target = inferTarget({
      instruction,
      screenName,
      roomFormFactors: parsedScreens.data.map((screen) => screen.form_factor),
    });
    return pickInspiration({ target, roomItems, libraryItems: library });
  } catch {
    return [];
  }
}
