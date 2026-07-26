import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import { listAttentionItems } from "@/features/home/actions";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { RoomSummaryList } from "@/features/home/components/room-summary-list";
import { StartingPoints } from "@/features/home/components/starting-points";

const CONTENT_MAX_WIDTH = "calc(var(--spacing-12) * 20)";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);
  // Every attention kind is anchored to a room, so an organization with no
  // rooms cannot have anything needing attention — skip the query rather
  // than fetch a result that is guaranteed empty.
  const attentionItems =
    rooms.length > 0 ? await listAttentionItems(organizationId) : [];

  return (
    <Layout height="fill" contentWidth={CONTENT_MAX_WIDTH}>
      <LayoutContent padding={6}>
        <VStack gap={6} width="100%">
          <Heading level={1}>What are you building?</Heading>
          <StartingPoints organizationId={organizationId} />
          <NeedsAttention items={attentionItems} />
          <RoomSummaryList
            organizationId={organizationId}
            rooms={rooms}
          />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
