import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import { redirect } from "next/navigation";
import { getDiscoveryRoomPageData } from "@/features/discovery/queries";
import { Conversation } from "@/features/discovery/components/conversation";
import { DiscoveryRoomHeader } from "@/features/discovery/components/discovery-room-header";
import {
  RoomTabStrip,
  parseRoomTab,
} from "@/features/prd/components/room-tab-strip";

export default async function DiscoveryRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; roomId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { organizationId, roomId } = await params;
  const { tab } = await searchParams;
  const data = await getDiscoveryRoomPageData({
    organizationId,
    roomId,
  });
  if (!data) redirect(`/${organizationId}`);

  const basePath = `/${organizationId}/discovery/${roomId}`;
  const activeTab = parseRoomTab(tab, data.hasPrd);
  // Responsive contract:
  //   > 768px  dashboard navigation | conversation
  //   <= 768px  dashboard navigation uses AppShell mobile navigation
  return (
    <Layout
      height="fill"
      style={{ backgroundColor: "var(--color-background-body)" }}
      header={
        <LayoutHeader
          hasDivider
          padding={3}
          style={{ backgroundColor: "var(--color-background-body)" }}
        >
          <DiscoveryRoomHeader
            roomName={data.room.name}
            currentUserId={data.currentUser.id}
            participants={data.participants}
          />
        </LayoutHeader>
      }
    >
      <LayoutContent
        padding={0}
        data-testid="discovery-room-surface"
        style={{ backgroundColor: "var(--color-background-body)" }}
      >
        <VStack gap={0} width="100%" height="100%">
          <RoomTabStrip
            activeTab={activeTab}
            hasPrd={data.hasPrd}
            basePath={basePath}
          />
          {activeTab === "prd" ? (
            <EmptyState title="PRD" description="PRD document goes here." />
          ) : (
            <Conversation
              roomId={roomId}
              roomName={data.room.name}
              organizationId={organizationId}
              currentUserId={data.currentUser.id}
              currentUserName={data.currentUser.name}
              participants={data.participants}
              initialMessages={data.messages}
              realtimeMode={data.realtimeMode}
            />
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
