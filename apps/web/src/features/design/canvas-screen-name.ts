"use server";

import { z } from "zod";
import { ScreenSourceSchema, type ScreenSource } from "@meld/screen-runtime/source";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { createDeepSeekScreenNamer } from "./canvas-screen-namer";

const Id = z.string().uuid();
const RenameRow = z.object({ status: z.enum(["renamed", "unchanged"]) });

export type NameCanvasScreenResult = { status: "renamed"; name: string } | { status: "skipped" };

/**
 * Gives a screen pasted without a name its real name. Best effort: with no AI
 * key, a failed call, or a name the owner has since changed, the placeholder
 * stays and the result is "skipped".
 */
export async function nameCanvasScreen(input: {
  screenId: string; placeholder: string; source: ScreenSource;
}): Promise<NameCanvasScreenResult> {
  const screenId = Id.safeParse(input.screenId);
  const placeholder = z.string().trim().min(1).max(120).safeParse(input.placeholder);
  const source = ScreenSourceSchema.safeParse(input.source);
  if (!screenId.success || !placeholder.success || !source.success) return { status: "skipped" };
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || isRoomFakeEnabled()) return { status: "skipped" };
  try {
    const name = await createDeepSeekScreenNamer({ apiKey }).name(source.data);
    if (!name) return { status: "skipped" };
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("rename_canvas_screen", {
      target_screen_id: screenId.data, expected_name: placeholder.data, new_name: name,
    });
    if (error) return { status: "skipped" };
    const parsed = RenameRow.safeParse(data);
    return parsed.success && parsed.data.status === "renamed" ? { status: "renamed", name } : { status: "skipped" };
  } catch {
    return { status: "skipped" };
  }
}
