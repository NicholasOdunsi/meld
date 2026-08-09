import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { redirect } from "next/navigation";
import { getDiscoveryRoomPageData } from "@/features/discovery/queries";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";
import { Conversation } from "@/features/discovery/components/conversation";
import { DiscoveryRoomHeader } from "@/features/discovery/components/discovery-room-header";
import { PrdDocument } from "@/features/prd/components/prd-document";
import { PrdTabContent } from "@/features/prd/components/prd-generating";
import { RoomTabStrip } from "@/features/prd/components/room-tab-strip";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import { parseRoomTab } from "@/features/prd/components/room-tabs";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";

export default async function DiscoveryRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; roomId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { organizationId, roomId } = await params;
  const { tab } = await searchParams;
  const requestedTab = parseRoomTab(tab, false);
  const data = await getDiscoveryRoomPageData({
    organizationId,
    roomId,
    includeMessages: requestedTab === "conversation",
  });
  if (!data) redirect(`/${organizationId}`);

  const basePath = `/${organizationId}/discovery/${roomId}`;
  const activeTab = parseRoomTab(tab, data.hasPrd);
  const [currentPrd, history, initialPrdAgentReadiness] = await Promise.all([
    data.hasPrd ? getRoomPrd({ roomId }) : Promise.resolve(null),
    activeTab === "prd" ? getRoomPrdHistory({ roomId }) : Promise.resolve([]),
    activeTab === "prd"
      ? getCurrentAgentReadiness().catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  const prd = currentPrd ?? history[0] ?? null;
  const canEdit = data.participants.some(
    (participant) =>
      participant.userId === data.currentUser.id && participant.access === "edit",
  );
  const canAccept =
    data.currentUser.id === data.room.ownerId || data.isCurrentUserOrgAdmin;
  const ownerName =
    data.participants.find((p) => p.userId === data.room.ownerId)?.email ??
    "Unknown";
  const prdDocumentProps = prd
    ? {
        prd,
        ownerName,
        basePath,
        history,
        canEdit,
        canAccept,
        agentReadiness: initialPrdAgentReadiness,
      }
    : null;
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
            organizationId={organizationId}
            roomId={roomId}
            ownerId={data.room.ownerId}
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
        <RoomTaskStatusProvider
          roomId={roomId}
          hasPrd={data.hasPrd}
          prdStatus={prd?.status ?? null}
        >
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
                {prdDocumentProps ? (
                  <PrdDocument {...prdDocumentProps} />
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
