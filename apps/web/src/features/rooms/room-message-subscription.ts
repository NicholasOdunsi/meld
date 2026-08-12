import { listRoomMessages } from "./actions";
import { createClient } from "@/lib/supabase/client";
import {
  mapRoomMessageRow,
  type RoomMessage,
  type RoomMessageRow,
} from "./repository";

export type RoomSubscription = (
  onMessage: (message: RoomMessage) => void,
  onRoomDeleted: () => void,
) => () => void;

// Messages ride their own channel on a dedicated topic -- NOT the shared
// `room:${roomId}` topic. That shared topic is a private broadcast bus
// (room-surfaces-changed, room-deleted) owned by the surface subscription, and
// `supabase.channel(topic)` hands back the *same* channel instance per topic.
// Adding a `postgres_changes` listener to that already-subscribed shared
// channel throws "cannot add postgres_changes callbacks ... after
// subscribe()". A distinct topic gives us an independent channel; message
// visibility is gated by RLS on `public.messages`, so this channel does not
// need to be private (the private topic's regex authorization is only for the
// broadcast bus).
export function subscribeToProductionRoom(
  roomId: string,
  onMessage: (message: RoomMessage) => void,
) {
  const supabase = createClient();
  let active = true;
  let channel: ReturnType<typeof supabase.channel> | undefined;

  // Re-list the room and reconcile every message on each handshake. Messages
  // ride `postgres_changes`, which has no backlog replay, so a reply that lands
  // before this channel is authenticated -- or during a reconnect gap -- would
  // otherwise wait for a manual refresh. Reconcile dedupes by id/clientId, so
  // replaying the whole list is idempotent. This is the same refresh-on-connect
  // self-healing the surface channel already relies on (use-room-surface-realtime).
  const recover = async () => {
    try {
      const messages = await listRoomMessages(roomId);
      if (active) messages.forEach(onMessage);
    } catch {
      // A failed re-list leaves realtime as the delivery path; the next INSERT
      // or the next reconnect handshake retries the recovery.
    }
  };

  const start = async () => {
    // Await the session token before subscribing. The realtime client adopts it
    // through a fire-and-forget promise kicked off at construction; a
    // postgres_changes subscription that races ahead of it authorizes as `anon`,
    // which RLS on public.messages denies -- so the channel would silently
    // deliver nothing and the Product Agent reply (its only realtime path) would
    // never arrive. The room-deleted broadcast awaits setAuth for this same reason.
    await supabase.realtime.setAuth();
    if (!active) return;
    channel = supabase
      .channel(`room-messages:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${roomId}`,
        },
        (event) => {
          // The raw INSERT row is shaped differently from a query row, so it goes
          // through the same shared mapper the initial query uses -- this is what
          // carries the full Product Agent provenance (provider, initiator, and
          // the citation/assumption/suggested-question arrays) over Realtime, and
          // makes the persisted message the authority for the completed reply.
          onMessage(mapRoomMessageRow(event.new as RoomMessageRow));
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

export function subscribeToDevelopmentRoom(
  roomId: string,
  onMessage: (message: RoomMessage) => void,
  onRoomDeleted: () => void,
) {
  let active = true;
  const poll = async () => {
    try {
      const messages = await listRoomMessages(roomId);
      if (active) messages.forEach(onMessage);
    } catch {
      if (active) onRoomDeleted();
      return;
    }
    if (active) window.setTimeout(poll, 200);
  };
  void poll();
  return () => {
    active = false;
  };
}
