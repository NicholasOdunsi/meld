import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { notFound } from "next/navigation";
import { getDiscoveryRoomPageData } from "@/features/discovery/actions";
import { Conversation } from "@/features/discovery/components/conversation";
import { RoomInspector } from "@/features/discovery/components/room-inspector";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";

export default async function DiscoveryRoomPage({
  params,
}: {
  params: Promise<{ organizationId: string; roomId: string }>;
}) {
  const { organizationId, roomId } = await params;
  const data = await getDiscoveryRoomPageData({
    organizationId,
    roomId,
  });
  if (!data) notFound();
  const isFake = isDiscoveryFakeEnabled();

  // Responsive contract:
  //   > 1024px  dashboard navigation | conversation | inspector 380
  //   <= 1024px inspector overlays the conversation
  //   <= 768px  dashboard navigation uses AppShell mobile navigation
  return (
    <Layout
      height="fill"
      end={
        <LayoutPanel
          width={380}
          hasDivider
          padding={0}
          label="Room details"
        >
          <RoomInspector
            roomId={roomId}
            currentUserId={data.currentUser.id}
            participants={data.participants}
            members={data.members}
            evidence={data.evidence}
            decisions={data.decisions}
            attachments={data.attachments}
            isAttachmentPersistenceAvailable={!isFake}
          />
        </LayoutPanel>
      }
      header={
        <LayoutHeader hasDivider padding={4}>
          <VStack gap={1}>
            <Heading level={1}>{data.room.name}</Heading>
            <Text type="supporting">
              Private to explicit room participants
            </Text>
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <Conversation
          roomId={roomId}
          currentUserId={data.currentUser.id}
          currentUserName={data.currentUser.name}
          initialMessages={data.messages}
          realtimeMode={isFake ? "development-poll" : "production"}
        />
      </LayoutContent>
    </Layout>
  );
}
