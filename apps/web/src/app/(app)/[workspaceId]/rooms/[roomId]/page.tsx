import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { redirect } from "next/navigation";
import { getRoomPageData } from "@/features/rooms/queries";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";
import { Conversation } from "@/features/rooms/components/conversation";
import { RoomHeader } from "@/features/rooms/components/room-header";
import { PrdDocument } from "@/features/prd/components/prd-document";
import { PrdTabContent } from "@/features/prd/components/prd-generating";
import { RoomTabStrip } from "@/features/prd/components/room-tab-strip";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import { parseRoomTab } from "@/features/prd/components/room-tabs";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";
import { isCanvasTrialEnabled } from "@/features/canvas/canvas-session";
import { UserFlowTrialTab } from "@/features/canvas/user-flow-trial-tab-loader";
import { UserFlowTrialUnavailable } from "@/features/canvas/user-flow-trial-unavailable";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; roomId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { workspaceId, roomId } = await params;
  const { tab } = await searchParams;
  const hasUserFlows = isCanvasTrialEnabled();
  const requestedTab = parseRoomTab(tab, false, hasUserFlows);
  const data = await getRoomPageData({
    workspaceId,
    roomId,
    includeMessages: requestedTab === "conversation",
  });
  if (!data) redirect(`/${workspaceId}`);

  const basePath = `/${workspaceId}/rooms/${roomId}`;
  const activeTab = parseRoomTab(tab, data.hasPrd, hasUserFlows);
  const currentParticipant = data.participants.find(
    (participant) => participant.userId === data.currentUser.id,
  );
  const canvasAccess =
    data.room.ownerId === data.currentUser.id ||
    data.isCurrentUserWorkspaceAdmin ||
    currentParticipant?.access === "edit"
      ? "edit"
      : currentParticipant?.access === "view"
        ? "view"
        : null;
  const [currentPrd, history, initialPrdAgentReadiness] = await Promise.all([
    data.hasPrd && activeTab !== "user-flows"
      ? getRoomPrd({ roomId })
      : Promise.resolve(null),
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
    data.currentUser.id === data.room.ownerId || data.isCurrentUserWorkspaceAdmin;
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
          <RoomHeader
            roomName={data.room.name}
            projectId={data.room.projectId}
            stage={data.room.stage}
            workspaceId={workspaceId}
            roomId={roomId}
            ownerId={data.room.ownerId}
            currentUserId={data.currentUser.id}
            participants={data.participants}
            isCurrentUserWorkspaceAdmin={data.isCurrentUserWorkspaceAdmin}
            realtimeMode={data.realtimeMode}
          />
        </LayoutHeader>
      }
    >
      <LayoutContent
        padding={0}
        data-testid="room-surface"
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
              hasUserFlows={hasUserFlows}
              basePath={basePath}
            />
            {activeTab === "user-flows" ? (
              canvasAccess ? (
                <UserFlowTrialTab
                  workspaceId={workspaceId}
                  roomId={roomId}
                  currentUser={data.currentUser}
                  trialEnabled={hasUserFlows}
                />
              ) : (
                <UserFlowTrialUnavailable />
              )
            ) : activeTab === "prd" ? (
              <PrdTabContent
                hasPrd={prd !== null}
                roomId={roomId}
                workspaceId={workspaceId}
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
                workspaceId={workspaceId}
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
