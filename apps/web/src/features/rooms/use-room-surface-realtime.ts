"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SURFACE_REFRESH_DEBOUNCE_MS = 50;
const CHANGE_EVENTS = ["INSERT", "DELETE"] as const;
const SURFACE_TABLES = ["user_flows", "decisions"] as const;

export function useRoomSurfaceRealtime(roomId: string, enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let active = true;
    let isSubscribed = false;
    // Close the gap between the server snapshot and the browser subscription.
    // Reconnects set this latch again after any interval where events may have
    // been missed.
    let requiresRefresh = true;
    let refreshTimer: number | undefined;

    const refresh = () => {
      if (!active || !isSubscribed || refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (active && isSubscribed) router.refresh();
      }, SURFACE_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase.channel(`room-surfaces:${roomId}`);
    for (const table of SURFACE_TABLES) {
      for (const event of CHANGE_EVENTS) {
        channel.on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table,
            filter: `room_id=eq.${roomId}`,
          },
          refresh,
        );
      }
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isSubscribed = true;
        if (requiresRefresh) {
          requiresRefresh = false;
          router.refresh();
        }
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        isSubscribed = false;
        requiresRefresh = true;
        if (refreshTimer !== undefined) {
          window.clearTimeout(refreshTimer);
          refreshTimer = undefined;
        }
      }
    });

    return () => {
      active = false;
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, roomId, router]);
}

export function RoomSurfaceSync({
  roomId,
  replacementHref,
  realtimeEnabled = true,
}: {
  roomId: string;
  replacementHref?: string;
  realtimeEnabled?: boolean;
}) {
  const router = useRouter();
  useRoomSurfaceRealtime(
    roomId,
    realtimeEnabled && replacementHref === undefined,
  );

  useEffect(() => {
    if (replacementHref) router.replace(replacementHref);
  }, [replacementHref, router]);

  return null;
}
