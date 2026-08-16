"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useMemo, useState } from "react";
import type { DesignScreenEvent, DesignScreenEventKind } from "@meld/contracts";
import { listRoomMessages } from "@/features/rooms/actions";
import { subscribeToProductionRoom } from "@/features/rooms/room-message-subscription";
import type { RoomMessage } from "@/features/rooms/repository";
import { listRoomDesignEvents } from "../design-events-reader";
import { subscribeToDesignEvents } from "../design-events-subscription";
import {
  filterDesignHistory,
  mergeDesignHistory,
  type DesignHistoryEntry,
} from "../design-history";

// Reconcile-style upsert: replace an existing item with the same id, or append
// the incoming one. Both the initial load and the live subscription funnel
// through this, so a subscribed INSERT that echoes something already loaded
// (e.g. a message the room-conversation subscription and this drawer both
// hear about) never duplicates a row.
function upsertById<T extends { id: string }>(items: T[], incoming: T): T[] {
  const withoutDuplicate = items.filter((item) => item.id !== incoming.id);
  return [...withoutDuplicate, incoming];
}

// Fixed right-column width for the History drawer. A computed number (not a
// literal CSS px string) passed straight to Card's `width` prop -- keeps the
// panel's footprint stable across viewports and stays astryx-clean.
const DRAWER_WIDTH = 340;

const DESIGN_EVENT_LABEL: Record<DesignScreenEventKind, string> = {
  message: "Message",
  generation_started: "Generating…",
  version_created: "New version",
  version_promoted: "Promoted",
  generation_failed: "Generation failed",
  restored: "Restored a version",
  stale_candidate: "Kept as a stale candidate",
};

function authorLabel(message: RoomMessage): string {
  if (message.authorType === "product_agent") return "Product Agent";
  if (message.authorType === "research_agent") return "Research Agent";
  return "You";
}

// The right-side History panel: the room's conversation unified with its
// design-event timeline, one chronological feed. Filters to the selected
// screen's events when a screen is selected on the Canvas.
export function HistoryDrawer({
  roomId,
  selectedScreenId,
  open,
  onClose,
  loadMessages = listRoomMessages,
  loadEvents = listRoomDesignEvents,
  subscribeMessages = subscribeToProductionRoom,
  subscribeEvents = subscribeToDesignEvents,
}: {
  roomId: string;
  selectedScreenId: string | null;
  open: boolean;
  onClose: () => void;
  loadMessages?: (roomId: string) => Promise<RoomMessage[]>;
  loadEvents?: (roomId: string) => Promise<DesignScreenEvent[]>;
  subscribeMessages?: (
    roomId: string,
    onMessage: (message: RoomMessage) => void,
  ) => () => void;
  subscribeEvents?: (
    roomId: string,
    onEvent: (event: DesignScreenEvent) => void,
  ) => () => void;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [events, setEvents] = useState<DesignScreenEvent[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [loadedMessages, loadedEvents] = await Promise.all([
        loadMessages(roomId),
        loadEvents(roomId),
      ]);
      if (cancelled) return;
      setMessages(loadedMessages);
      setEvents(loadedEvents);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, roomId, loadMessages, loadEvents]);

  // Live updates while the drawer is open: reconcile each subscribed message
  // or design event into state, deduped by id (mirrors how `conversation.tsx`
  // reconciles messages). Kept as a separate effect from the initial load so a
  // parent re-render that only changes `selectedScreenId` -- which does not
  // appear in this dependency list -- never tears down and reopens the
  // subscriptions; the defaults above are stable module-level function
  // references for the same reason.
  useEffect(() => {
    if (!open) return;
    const unsubscribeMessages = subscribeMessages(roomId, (message) => {
      setMessages((current) => upsertById(current, message));
    });
    const unsubscribeEvents = subscribeEvents(roomId, (event) => {
      setEvents((current) => upsertById(current, event));
    });
    return () => {
      unsubscribeMessages();
      unsubscribeEvents();
    };
  }, [open, roomId, subscribeMessages, subscribeEvents]);

  const entries = useMemo(
    () =>
      filterDesignHistory(
        mergeDesignHistory(messages, events),
        selectedScreenId,
      ),
    [messages, events, selectedScreenId],
  );

  if (!open) return null;

  return (
    <Card width={DRAWER_WIDTH} variant="default" data-testid="history-drawer">
      <VStack gap={4}>
        <HStack vAlign="center" justify="between">
          <Heading level={3}>History</Heading>
          <Button
            label="Close history"
            variant="ghost"
            size="sm"
            clickAction={onClose}
          >
            Close
          </Button>
        </HStack>
        {selectedScreenId ? (
          <Text type="supporting" color="secondary">
            Showing one screen
          </Text>
        ) : null}
        <Divider />
        <VStack gap={3}>
          {entries.map((entry) => (
            <HistoryEntryRow key={entry.id} entry={entry} />
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

function HistoryEntryRow({ entry }: { entry: DesignHistoryEntry }) {
  if (entry.type === "message") {
    return (
      <VStack gap={1} data-testid={`history-entry-${entry.id}`}>
        <HStack gap={2} vAlign="center" justify="between">
          <Text type="label" weight="medium">
            {authorLabel(entry.message)}
          </Text>
          <Timestamp value={entry.createdAt} format="auto" />
        </HStack>
        <Text type="body">{entry.message.body}</Text>
      </VStack>
    );
  }

  return (
    <HStack
      gap={2}
      vAlign="center"
      justify="between"
      data-testid={`history-entry-${entry.id}`}
    >
      <Text type="body">{DESIGN_EVENT_LABEL[entry.event.kind]}</Text>
      <Timestamp value={entry.createdAt} format="auto" />
    </HStack>
  );
}
