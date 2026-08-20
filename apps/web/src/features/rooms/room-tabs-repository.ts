import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_PANES, type PaneLayout, type PaneTool } from "./pane-layout";

export type RoomTab = {
  id: string;
  name: string | null;
  position: number;
  panes: PaneLayout;
};

const KNOWN_TOOLS: readonly string[] = ["canvas", "prototype", "prd"];

/**
 * `panes` is jsonb, so the database's shape constraint is the guard for rows
 * this app writes -- but a row written by an older client, or by hand, must
 * never be able to crash a Room. An unreadable layout degrades to a shorter
 * one, or to an empty plane, and the person places what they want again.
 */
export function parseRoomTabRow(row: {
  id: string;
  name: string | null;
  position: number;
  panes: unknown;
}): RoomTab {
  const raw = Array.isArray(row.panes) ? row.panes : [];
  const panes: PaneLayout = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    if (!KNOWN_TOOLS.includes(entry)) continue;
    if (panes.includes(entry as PaneTool)) continue;
    // With only three known tools today, deduping above already keeps
    // `panes` under MAX_PANES, so this break is structurally unreachable
    // from any real row -- it exists for the day a fourth tool is added,
    // and stays in place now so that day needs no change here.
    if (panes.length >= MAX_PANES) break;
    panes.push(entry as PaneTool);
  }
  return { id: row.id, name: row.name, position: row.position, panes };
}

/** After the highest position, not the count -- closing a tab leaves gaps. */
export function nextTabPosition(tabs: readonly { position: number }[]): number {
  if (tabs.length === 0) return 0;
  return Math.max(...tabs.map((tab) => tab.position)) + 1;
}

type RoomTabRow = {
  id: string;
  name: string | null;
  position: number;
  panes: unknown;
};

async function requireRepositoryUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required");
  }
  return user;
}

export function createRoomTabsRepository(supabase: SupabaseClient) {
  return {
    async listRoomTabs(roomId: string): Promise<RoomTab[]> {
      const result = await supabase
        .from("room_tabs")
        .select("id,name,position,panes")
        .eq("room_id", roomId)
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      if (result.error) {
        throw new Error("We could not load this room's tabs.");
      }
      return (result.data ?? []).map((row) =>
        parseRoomTabRow(row as RoomTabRow),
      );
    },

    async createRoomTab(input: {
      roomId: string;
      panes?: PaneLayout;
    }): Promise<RoomTab> {
      const user = await requireRepositoryUser(supabase);
      const existing = await supabase
        .from("room_tabs")
        .select("position")
        .eq("room_id", input.roomId);
      if (existing.error) {
        throw new Error("We could not create a new tab.");
      }
      const position = nextTabPosition(
        (existing.data ?? []) as { position: number }[],
      );
      const result = await supabase
        .from("room_tabs")
        .insert({
          room_id: input.roomId,
          position,
          panes: input.panes ?? [],
          created_by: user.id,
        })
        .select("id,name,position,panes")
        .single();
      if (result.error || !result.data) {
        throw new Error("We could not create a new tab.");
      }
      return parseRoomTabRow(result.data as RoomTabRow);
    },

    async renameRoomTab(input: {
      tabId: string;
      name: string | null;
    }): Promise<void> {
      // The name column rejects an empty string outright, so a blank name
      // normalises to null here rather than reaching the database as ''.
      const trimmed = input.name?.trim() ?? "";
      const name = trimmed.length > 0 ? trimmed : null;
      const result = await supabase
        .from("room_tabs")
        .update({ name })
        .eq("id", input.tabId);
      if (result.error) {
        throw new Error("We could not rename this tab.");
      }
    },

    async setRoomTabPanes(input: {
      tabId: string;
      panes: PaneLayout;
    }): Promise<void> {
      const result = await supabase
        .from("room_tabs")
        .update({ panes: input.panes })
        .eq("id", input.tabId);
      if (result.error) {
        throw new Error("We could not update this tab's layout.");
      }
    },

    async reorderRoomTabs(input: {
      roomId: string;
      orderedTabIds: string[];
    }): Promise<void> {
      for (const [index, tabId] of input.orderedTabIds.entries()) {
        const result = await supabase
          .from("room_tabs")
          .update({ position: index })
          .eq("id", tabId)
          .eq("room_id", input.roomId);
        if (result.error) {
          throw new Error("We could not reorder these tabs.");
        }
      }
    },

    async closeRoomTab(input: { tabId: string }): Promise<void> {
      const result = await supabase
        .from("room_tabs")
        .delete()
        .eq("id", input.tabId);
      if (result.error) {
        throw new Error("We could not close this tab.");
      }
    },
  };
}
