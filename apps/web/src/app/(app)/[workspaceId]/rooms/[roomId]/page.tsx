import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { redirect } from "next/navigation";
import {
  getRoomOverview,
  getRoomPageData,
  listRoomDecisions,
} from "@/features/rooms/queries";
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
import { DecisionsSurface } from "@/features/rooms/components/decisions-surface";
import { RoomOverview } from "@/features/rooms/components/room-overview";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; roomId: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    message?: string | string[];
  }>;
}) {
  const { workspaceId, roomId } = await params;
  const { tab, message } = await searchParams;
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
  // Exactly what the database enforces. `start_user_flow` gates on
  // `can_edit_room`, which is participant-with-edit and nothing else -- no Room
  // owner and no Workspace administrator bypass (202607240004_discovery.sql).
  // Granting an edit canvas on either would hand a `view` participant who
  // happens to administer the Workspace an editor the database rejects on the
  // first write. Room visibility is participant-scoped, so a non-participant
  // never reaches this page at all, and the owner is inserted as an `edit`
  // participant by `add_room_owner_participant`.
  const canvasAccess = currentParticipant?.access ?? null;
  const [
    currentPrd,
    history,
    initialPrdAgentReadiness,
    decisions,
    overview,
  ] = await Promise.all([
    surfaceState.hasPrd && activeSurface !== "user-flows"
      ? getRoomPrd({ roomId })
      : Promise.resolve(null),
    activeSurface === "prd"
      ? getRoomPrdHistory({ roomId })
      : Promise.resolve([]),
    activeSurface === "prd"
      ? getCurrentAgentReadiness().catch(() => undefined)
      : Promise.resolve(undefined),
    activeSurface === "decisions"
      ? listRoomDecisions(roomId)
      : Promise.resolve([]),
    activeSurface === "overview"
      ? getRoomOverview(roomId)
      : Promise.resolve(null),
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
                focusedMessageId={
                  typeof message === "string" ? message : undefined
                }
              />
            ) : activeSurface === "decisions" ? (
              <DecisionsSurface decisions={decisions} basePath={basePath} />
            ) : activeSurface === "overview" && overview ? (
              <RoomOverview overview={overview} />
            ) : null}
          </VStack>
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
