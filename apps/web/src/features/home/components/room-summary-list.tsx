import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { MessageBubbleDots } from "@boxicons/react/MessageBubbleDots";
import type { DiscoveryRoom } from "@/features/discovery/repository";

export function RoomSummaryList({
  organizationId,
  rooms,
}: {
  organizationId: string;
  rooms: DiscoveryRoom[];
}) {
  return (
    <VStack gap={3}>
      <Heading level={2}>Your rooms</Heading>
      {rooms.length === 0 ? (
        <EmptyState
          icon={<Icon icon={MessageBubbleDots} size="lg" />}
          title="No rooms yet"
          description="Rooms you start or join will show up here."
          headingLevel={3}
          isCompact
        />
      ) : (
        <List hasDividers>
          {rooms.map((room) => (
            <ListItem
              key={room.id}
              label={room.name}
              href={`/${organizationId}/discovery/${room.id}`}
              endContent={<Timestamp value={room.lastActivityAt} />}
            />
          ))}
        </List>
      )}
    </VStack>
  );
}
