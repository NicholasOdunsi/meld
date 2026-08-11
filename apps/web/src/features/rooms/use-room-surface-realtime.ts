"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SURFACE_REFRESH_DEBOUNCE_MS = 50;

export function useRoomSurfaceRealtime(roomId: string, enabled = true) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let active = true;
    let isSubscribed = false;
    let requiresRefresh = false;
    let refreshTimer: number | undefined;

    const refresh = () => {
      if (!active || !isSubscribed || refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (active && isSubscribed) router.refresh();
      }, SURFACE_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "room-surfaces-changed" }, refresh);
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
