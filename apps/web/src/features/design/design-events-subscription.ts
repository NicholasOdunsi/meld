import { listRoomDesignEvents } from "./design-events-reader";
import { createClient } from "@/lib/supabase/client";
import { DesignScreenEventSchema, type DesignScreenEvent } from "@meld/contracts";

type DesignScreenEventRow = {
  id: string;
  room_id: string;
  screen_id: string | null;
  kind: string;
  message_id: string | null;
  task_id: string | null;
  version_id: string | null;
  actor: string | null;
  created_at: string;
};

// The raw INSERT row is shaped differently from a query row (snake_case,
// unvalidated), so it goes through the same contract schema the initial
// `listRoomDesignEvents` read validates against. A row that fails to parse is
// dropped rather than surfaced -- the next re-list on a reconnect handshake
// is the recovery path for anything malformed or from a future schema.
function mapDesignScreenEventRow(
  row: DesignScreenEventRow,
): DesignScreenEvent | null {
  const parsed = DesignScreenEventSchema.safeParse({
    id: row.id,
    roomId: row.room_id,
    screenId: row.screen_id,
    kind: row.kind,
    messageId: row.message_id,
    taskId: row.task_id,
    versionId: row.version_id,
    actor: row.actor,
    createdAt: row.created_at,
  });
  return parsed.success ? parsed.data : null;
}

// Design events ride their own channel on a dedicated topic -- NOT the shared
// `room:${roomId}` topic. That shared topic is a private broadcast bus
// (room-surfaces-changed, room-deleted) owned by the surface subscription, and
// `supabase.channel(topic)` hands back the *same* channel instance per topic.
// Adding a `postgres_changes` listener to that already-subscribed shared
// channel throws "cannot add postgres_changes callbacks ... after
// subscribe()". A distinct topic gives us an independent channel; design-event
// visibility is gated by RLS on `public.design_screen_events`, so this channel
// does not need to be private (the private topic's regex authorization is
// only for the broadcast bus). Mirrors `subscribeToProductionRoom` in
// room-message-subscription.ts.
export function subscribeToDesignEvents(
  roomId: string,
  onEvent: (event: DesignScreenEvent) => void,
) {
  const supabase = createClient();
  let active = true;
  let channel: ReturnType<typeof supabase.channel> | undefined;

  // Re-list the room's design events and reconcile every one on each
  // handshake. Events ride `postgres_changes`, which has no backlog replay, so
  // an event that lands before this channel is authenticated -- or during a
  // reconnect gap -- would otherwise wait for a manual refresh. The caller
  // dedupes by id, so replaying the whole list is idempotent. This is the same
  // refresh-on-connect self-healing `subscribeToProductionRoom` relies on.
  const recover = async () => {
    try {
      const events = await listRoomDesignEvents(roomId);
      if (active) events.forEach(onEvent);
    } catch {
      // A failed re-list leaves realtime as the delivery path; the next INSERT
      // or the next reconnect handshake retries the recovery.
    }
  };

  const start = async () => {
    // Await the session token before subscribing. The realtime client adopts it
    // through a fire-and-forget promise kicked off at construction; a
    // postgres_changes subscription that races ahead of it authorizes as `anon`,
    // which RLS on public.design_screen_events denies -- so the channel would
    // silently deliver nothing. Mirrors the same await in
    // subscribeToProductionRoom.
    await supabase.realtime.setAuth();
    if (!active) return;
    channel = supabase
      .channel(`design-events:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "design_screen_events",
          filter: `room_id=eq.${roomId}`,
        },
        (event) => {
          const mapped = mapDesignScreenEventRow(
            event.new as DesignScreenEventRow,
          );
          if (mapped) onEvent(mapped);
        },
      )
      .subscribe((status) => {
        // A fresh handshake (first connect and every reconnect) is the moment to
        // recover anything the stream could not have delivered while it was down.
        if (status === "SUBSCRIBED") void recover();
      });
  };

  void start();

  return () => {
    active = false;
    if (channel) void supabase.removeChannel(channel);
  };
}
