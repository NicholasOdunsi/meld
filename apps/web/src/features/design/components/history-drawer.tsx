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
import type { RoomMessage } from "@/features/rooms/repository";
import { listRoomDesignEvents } from "../design-events-reader";
import {
  filterDesignHistory,
  mergeDesignHistory,
  type DesignHistoryEntry,
} from "../design-history";

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
}: {
  roomId: string;
  selectedScreenId: string | null;
  open: boolean;
  onClose: () => void;
  loadMessages?: (roomId: string) => Promise<RoomMessage[]>;
  loadEvents?: (roomId: string) => Promise<DesignScreenEvent[]>;
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
