"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SURFACE_REFRESH_DEBOUNCE_MS = 50;

export function useRoomSurfaceRealtime(
  roomId: string,
  workspaceId: string,
  enabled = true,
) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let active = true;
    let isSubscribed = false;
    // The server snapshot precedes this subscription. Refresh once after the
    // first handshake, and again after reconnect, to recover invalidations
    // that may have landed while no channel was listening.
    let requiresRefresh = true;
    let refreshTimer: number | undefined;

    const refresh = () => {
      if (!active || !isSubscribed || refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (active && isSubscribed) router.refresh();
      }, SURFACE_REFRESH_DEBOUNCE_MS);
    };

    // Deletion rides the same private Room topic as surface changes, sent by
    // the delete RPC while participants still exist. This subscription is the
    // sole owner of that channel, so it also carries room-deleted -- leaving
    // for the workspace works from any surface tab, not just Conversation, and
    // keeps the message subscription off this shared broadcast channel.
    const leaveDeletedRoom = () => {
      if (!active) return;
      router.push(`/${workspaceId}`);
      router.refresh();
    };

    const channel = supabase
      .channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "room-surfaces-changed" }, refresh)
      .on("broadcast", { event: "room-deleted" }, leaveDeletedRoom);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isSubscribed = true;
        if (requiresRefresh) {
          requiresRefresh = false;
          refresh();
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
  }, [enabled, roomId, router, workspaceId]);
}

export function RoomSurfaceSync({
  roomId,
  workspaceId,
  replacementHref,
  realtimeEnabled = true,
}: {
  roomId: string;
  workspaceId: string;
  replacementHref?: string;
  realtimeEnabled?: boolean;
}) {
  const router = useRouter();
  useRoomSurfaceRealtime(
    roomId,
    workspaceId,
    realtimeEnabled && replacementHref === undefined,
  );

  useEffect(() => {
    if (replacementHref) router.replace(replacementHref);
  }, [replacementHref, router]);

  return null;
}
