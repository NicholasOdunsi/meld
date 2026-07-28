import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { RoomList } from "@/features/discovery/components/room-list";
import { listDiscoveryRooms } from "@/features/discovery/queries";

export default async function DiscoveryPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider padding={6}>
          <VStack gap={1}>
            <Heading level={1}>Discovery Rooms</Heading>
            <Text type="supporting">
              Invite explicit participants to share research, evidence, and decisions.
            </Text>
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <RoomList organizationId={organizationId} rooms={rooms} />
      </LayoutContent>
    </Layout>
  );
}
