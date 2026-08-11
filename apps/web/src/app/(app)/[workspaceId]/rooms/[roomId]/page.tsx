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
import { RoomTabStrip } from "@/features/rooms/components/room-tab-strip";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import {
  getRoomSurfaces,
  resolveRoomSurface,
} from "@/features/rooms/surfaces";
import { RoomSurfaceSync } from "@/features/rooms/use-room-surface-realtime";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";
import { isCanvasTrialEnabled } from "@/features/canvas/canvas-session";
import { UserFlowTrialTab } from "@/features/canvas/user-flow-trial-tab-loader";
import { UserFlowTrialUnavailable } from "@/features/canvas/user-flow-trial-unavailable";
import { EmptyRoomStart } from "@/features/rooms/components/empty-room-start";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; roomId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { workspaceId, roomId } = await params;
  const { tab } = await searchParams;
  const canvasTrialEnabled = isCanvasTrialEnabled();
  const data = await getRoomPageData({
    workspaceId,
    roomId,
    requestedSurface: tab,
  });
  if (!data) redirect(`/${workspaceId}`);

  const surfaceState = data.surfaceState;
  const surfaces = getRoomSurfaces(surfaceState);
  const { activeSurface, shouldReplaceUrl } = resolveRoomSurface(tab, surfaces);
  const basePath = `/${workspaceId}/rooms/${roomId}`;
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
    surfaceState.hasPrd && activeSurface !== "user-flows"
      ? getRoomPrd({ roomId })
      : Promise.resolve(null),
    activeSurface === "prd"
      ? getRoomPrdHistory({ roomId })
      : Promise.resolve([]),
    activeSurface === "prd"
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
            updatedAt={data.room.updatedAt}
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
        <RoomSurfaceSync
          roomId={roomId}
          replacementHref={
            shouldReplaceUrl ? `${basePath}?tab=conversation` : undefined
          }
          realtimeEnabled={data.realtimeMode === "production"}
        />
        <RoomTaskStatusProvider
          roomId={roomId}
          hasPrd={surfaceState.hasPrd}
          initialActivePrdTaskIds={data.activePrdTaskIds}
          prdStatus={prd?.status ?? null}
        >
          <VStack gap={0} width="100%" height="100%">
            <RoomTabStrip
              activeSurface={activeSurface}
              surfaceState={surfaceState}
              basePath={basePath}
            />
            {activeSurface === "user-flows" ? (
              canvasAccess && canvasTrialEnabled ? (
                <UserFlowTrialTab
                  workspaceId={workspaceId}
                  roomId={roomId}
                  currentUser={data.currentUser}
                  trialEnabled={canvasTrialEnabled}
                />
              ) : (
                <UserFlowTrialUnavailable />
              )
            ) : activeSurface === "prd" ? (
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
            ) : activeSurface === "conversation" ? (
              <Conversation
                roomId={roomId}
                roomName={data.room.name}
                workspaceId={workspaceId}
                currentUserId={data.currentUser.id}
                currentUserName={data.currentUser.name}
                participants={data.participants}
                initialMessages={data.messages}
                realtimeMode={data.realtimeMode}
                hasPrd={surfaceState.hasPrd}
                basePath={basePath}
                emptyStateActions={
                  !surfaceState.hasPrd && !surfaceState.hasUserFlow ? (
                    <EmptyRoomStart
                      roomId={roomId}
                      basePath={basePath}
                      canEdit={canEdit}
                      canvasAvailable={canvasTrialEnabled}
                    />
                  ) : null
                }
              />
            ) : null}
          </VStack>
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
