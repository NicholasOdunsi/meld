import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import { StartingPoints } from "@/features/home/components/starting-points";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);

  return (
    <Layout height="fill">
      <LayoutContent padding={6}>
        <VStack gap={6} width="100%">
          <Heading level={1}>What are you building?</Heading>
          <StartingPoints organizationId={organizationId} />
          <Text type="supporting">
            {rooms.length === 0
              ? "Start your first Discovery Room."
              : `${rooms.length} Discovery Rooms`}
          </Text>
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
