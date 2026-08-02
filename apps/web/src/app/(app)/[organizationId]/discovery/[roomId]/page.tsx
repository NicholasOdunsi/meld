import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { redirect } from "next/navigation";
import { getDiscoveryRoomPageData } from "@/features/discovery/queries";
import { Conversation } from "@/features/discovery/components/conversation";
import { DiscoveryRoomHeader } from "@/features/discovery/components/discovery-room-header";
import { PrdDocument } from "@/features/prd/components/prd-document";
import { PrdTabContent } from "@/features/prd/components/prd-generating";
import { RoomTabStrip } from "@/features/prd/components/room-tab-strip";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import { parseRoomTab } from "@/features/prd/components/room-tabs";
import { getRoomPrd } from "@/features/prd/queries";

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
  const prd = activeTab === "prd" ? await getRoomPrd({ roomId }) : null;
  const ownerName =
    data.participants.find((p) => p.userId === data.room.ownerId)?.email ??
    "Unknown";
  // Responsive contract:
  //   > 768px  dashboard navigation | conversation
  //   <= 768px  dashboard navigation uses AppShell mobile navigation
  return (
    <Layout
      height="fill"
      style={{ backgroundColor: "var(--color-background-body)" }}
      header={
        <LayoutHeader
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
        <RoomTaskStatusProvider roomId={roomId} hasPrd={data.hasPrd}>
          <VStack gap={0} width="100%" height="100%">
            <RoomTabStrip
              activeTab={activeTab}
              hasPrd={data.hasPrd}
              basePath={basePath}
            />
            {activeTab === "prd" ? (
              <PrdTabContent
                hasPrd={prd !== null}
                roomId={roomId}
                organizationId={organizationId}
                basePath={basePath}
              >
                {prd ? (
                  <PrdDocument
                    prd={prd}
                    ownerName={ownerName}
                    basePath={basePath}
                  />
                ) : null}
              </PrdTabContent>
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
                hasPrd={data.hasPrd}
                basePath={basePath}
              />
            )}
          </VStack>
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
