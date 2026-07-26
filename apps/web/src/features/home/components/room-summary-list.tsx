import { Heading } from "@astryxdesign/core/Heading";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { DiscoveryRoom } from "@/features/discovery/repository";

export function RoomSummaryList({
  organizationId,
  rooms,
}: {
  organizationId: string;
  rooms: DiscoveryRoom[];
}) {
  return (
    <List
      hasDividers
      header={<Heading level={2}>Your rooms</Heading>}
    >
      {rooms.map((room) => (
        <ListItem
          key={room.id}
          label={room.name}
          href={`/${organizationId}/discovery/${room.id}`}
          endContent={<Timestamp value={room.lastActivityAt} />}
        />
      ))}
    </List>
  );
}
