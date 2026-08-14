import "server-only";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const RoomIdSchema = z.string().uuid();

const ActionLinkRowSchema = z
  .object({
    screen_id: z.string().uuid(),
    action_id: z.string(),
    target_screen_id: z.string().uuid(),
  })
  .strict();

// Manual C2a overrides (drawn canvas arrows), keyed screen id -> action id ->
// target screen id. `design_screen_action_links`'s RLS scopes rows to room
// participants but does not exclude a row whose target screen has since been
// soft-deleted, so callers pass every *live* screen id currently in scope for
// the room (the same set they build `nodeToScreenId` from); any override row
// pointing outside that set is dropped here rather than resolving to a dead
// screen.
export async function readRoomActionLinks(
  roomId: string,
  liveScreenIds: readonly string[],
): Promise<Map<string, Map<string, string>>> {
  const overridesByScreen = new Map<string, Map<string, string>>();
  const id = RoomIdSchema.safeParse(roomId);
  if (!id.success || liveScreenIds.length === 0) return overridesByScreen;

  try {
    if (isRoomFakeEnabled()) return overridesByScreen;

    const supabase = await createClient(new Headers());
    const linksResult = await supabase
      .from("design_screen_action_links")
      .select("screen_id,action_id,target_screen_id")
      .in("screen_id", liveScreenIds);

    if (linksResult.error) {
      console.error("room action links read failed", linksResult.error);
      return overridesByScreen;
    }

    const links = z.array(ActionLinkRowSchema).safeParse(linksResult.data);
    if (!links.success) {
      console.error("room action links response invalid", links.error);
      return overridesByScreen;
    }

    const liveIds = new Set(liveScreenIds);
    for (const link of links.data) {
      if (!liveIds.has(link.target_screen_id)) continue;
      let overrides = overridesByScreen.get(link.screen_id);
      if (!overrides) {
        overrides = new Map();
        overridesByScreen.set(link.screen_id, overrides);
      }
      overrides.set(link.action_id, link.target_screen_id);
    }
    return overridesByScreen;
  } catch (thrown) {
    console.error("readRoomActionLinks failed", thrown);
    return overridesByScreen;
  }
}

// A single manual override row, projected to canvas terms. The canvas reconcile
// (Task 5) needs the flat rows -- source screen, action, target screen -- rather
// than the per-screen map `readRoomActionLinks` builds for target resolution.
export type ActionLinkRow = {
  sourceScreenId: string;
  actionId: string;
  targetScreenId: string;
};

// Same query and live-screen scoping as `readRoomActionLinks`, but returns the
// raw rows the canvas turns into `meldLink` arrows. Any override pointing at a
// screen outside the live set is dropped rather than drawing an arrow to a dead
// frame.
export async function readRoomActionLinkRows(
  roomId: string,
  liveScreenIds: readonly string[],
): Promise<ActionLinkRow[]> {
  const id = RoomIdSchema.safeParse(roomId);
  if (!id.success || liveScreenIds.length === 0) return [];

  try {
    if (isRoomFakeEnabled()) return [];

    const supabase = await createClient(new Headers());
    const linksResult = await supabase
      .from("design_screen_action_links")
      .select("screen_id,action_id,target_screen_id")
      .in("screen_id", liveScreenIds);

    if (linksResult.error) {
      console.error("room action link rows read failed", linksResult.error);
      return [];
    }

    const links = z.array(ActionLinkRowSchema).safeParse(linksResult.data);
    if (!links.success) {
      console.error("room action link rows response invalid", links.error);
      return [];
    }

    const liveIds = new Set(liveScreenIds);
    return links.data
      .filter((link) => liveIds.has(link.target_screen_id))
      .map((link) => ({
        sourceScreenId: link.screen_id,
        actionId: link.action_id,
        targetScreenId: link.target_screen_id,
      }));
  } catch (thrown) {
    console.error("readRoomActionLinkRows failed", thrown);
    return [];
  }
}
