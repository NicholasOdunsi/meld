import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { StackItem } from "@astryxdesign/core/Stack";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import { listAttentionItems } from "@/features/home/actions";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { RoomSummaryList } from "@/features/home/components/room-summary-list";
import { StartingPoints } from "@/features/home/components/starting-points";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);
  const isFresh = rooms.length === 0;

  if (isFresh) {
    return (
      <Layout height="fill">
        <LayoutContent padding={6}>
          <VStack gap={6} width="100%">
            <Heading level={1}>What are you building?</Heading>
            <StartingPoints organizationId={organizationId} />
          </VStack>
        </LayoutContent>
      </Layout>
    );
  }

  const attentionItems = await listAttentionItems(organizationId);

  return (
    <Layout height="fill">
      <LayoutContent padding={6}>
        <VStack gap={6} width="100%">
          <HStack gap={4} vAlign="center" width="100%">
            <StackItem size="fill">
              <Heading level={2}>What are you building?</Heading>
            </StackItem>
            <StartingPoints
              organizationId={organizationId}
              isCompact
            />
          </HStack>
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
