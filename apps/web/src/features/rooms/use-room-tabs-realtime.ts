"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseRoomTabRow, type RoomTab } from "./room-tabs-repository";

type RoomTabsRealtimeInput = {
  roomId: string;
  initialTabs: RoomTab[];
};

type RoomTabsState = {
  initialTabsKey: string;
  tabs: RoomTab[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parsePayloadTab(value: unknown): RoomTab | null {
  const row = asRecord(value);
  if (!row) return null;

  const id = row.id;
  const name = row.name;
  const position = row.position;
  if (
    typeof id !== "string" ||
    id.length === 0 ||
    (name !== null && typeof name !== "string") ||
    typeof position !== "number" ||
    !Number.isInteger(position)
  ) {
    return null;
  }

  try {
    return parseRoomTabRow({ id, name, position, panes: row.panes });
  } catch {
    return null;
  }
}

function readTabId(value: unknown): string | null {
  const row = asRecord(value);
  const id = row?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function compareTabs(left: RoomTab, right: RoomTab): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function sortTabs(tabs: RoomTab[]): RoomTab[] {
  return [...tabs].sort(compareTabs);
}

function readPayloadValue(payload: unknown, key: "new" | "old"): unknown {
  return asRecord(payload)?.[key];
}

export function useRoomTabsRealtime({
  roomId,
  initialTabs,
}: RoomTabsRealtimeInput): RoomTab[] {
  const initialTabsKey = JSON.stringify(initialTabs) ?? "";
  const [state, setState] = useState<RoomTabsState>({
    initialTabsKey,
    tabs: sortTabs(initialTabs),
  });

  if (state.initialTabsKey !== initialTabsKey) {
    setState({ initialTabsKey, tabs: sortTabs(initialTabs) });
  }

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const insert = (payload: unknown) => {
      if (!active) return;
      const incoming = parsePayloadTab(readPayloadValue(payload, "new"));
      if (!incoming) return;

      setState((current) => {
        const next = current.tabs.filter((tab) => tab.id !== incoming.id);
        next.push(incoming);
        return { ...current, tabs: sortTabs(next) };
      });
    };

    const update = (payload: unknown) => {
      if (!active) return;
      const incoming = parsePayloadTab(readPayloadValue(payload, "new"));
      if (!incoming) return;

      setState((current) => {
        const index = current.tabs.findIndex((tab) => tab.id === incoming.id);
        if (index < 0) return current;
        const next = [...current.tabs];
        next[index] = incoming;
        return { ...current, tabs: next };
      });
    };

    const remove = (payload: unknown) => {
      if (!active) return;
      const id = readTabId(readPayloadValue(payload, "old"));
      if (!id) return;

      setState((current) => {
        const next = current.tabs.filter((tab) => tab.id !== id);
        return next.length === current.tabs.length
          ? current
          : { ...current, tabs: next };
      });
    };

    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_tabs",
          filter: `room_id=eq.${roomId}`,
        },
        insert,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_tabs",
          filter: `room_id=eq.${roomId}`,
        },
        update,
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "room_tabs",
          filter: `room_id=eq.${roomId}`,
        },
        remove,
      );
    channel.subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [initialTabsKey, roomId]);

  return state.tabs;
}
