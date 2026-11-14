import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NativeStreamBridge } from "@/features/native/native-stream-bridge";
import {
  isOrionFrameUserAgent,
  isOrionFrameV2UserAgent,
} from "@/features/native/user-agent";
import {
  getRoomOverview,
  getRoomPageData,
  listRoomDecisions,
  listRooms,
} from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { orderProjectTabs } from "@/features/projects/project-tabs";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";
import { Conversation } from "@/features/rooms/components/conversation";
import { RoomHeader } from "@/features/rooms/components/room-header";
import { PrdDocument } from "@/features/prd/components/prd-document";
import { PrdTabContent } from "@/features/prd/components/prd-generating";
import { RoomTabStrip } from "@/features/rooms/components/room-tab-strip";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import { getRoomSurfaces, resolveRoomSurface } from "@/features/rooms/surfaces";
import { RoomSurfaceSync } from "@/features/rooms/use-room-surface-realtime";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";
import { BoardLoader } from "@/features/canvas-excalidraw/board-loader";
import type { FlowExpandTarget } from "@/features/prd/components/flow-preview";
import { DecisionsSurface } from "@/features/rooms/components/decisions-surface";
import { RoomOverview } from "@/features/rooms/components/room-overview";
import { StageCoachingPanel } from "@/features/rooms/components/stage-coaching-panel";
import { PrototypeViewer } from "@/features/design/components/prototype-viewer";
import { getRoomPrototype } from "@/features/design/prototype-reader";
import { listRoomInspiration } from "@/features/inspiration/inspiration-reader";
import { RoomInspirationSurface } from "@/features/inspiration/components/room-inspiration-surface";
import { MarkRoomViewed } from "@/features/activity/components/mark-room-viewed";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; roomId: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    message?: string | string[];
    screen?: string | string[];
  }>;
}) {
  const { workspaceId, roomId } = await params;
  const { tab, message, screen } = await searchParams;
  // The clicked-frame preview (Task 8): a `?screen=<id>` param names the
  // screen the Prototype surface should open on. Only a plain string is
  // honored -- an array (repeated `?screen=`) or an absent param falls back
  // to `getRoomPrototype`'s default (the first built screen).
  const startScreenId = typeof screen === "string" ? screen : undefined;
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
  const [workspaceRooms, workspaceProjects, requestHeaders] = await Promise.all([
    listRooms(workspaceId),
    listWorkspaceProjects(workspaceId),
    headers(),
  ]);
  const userAgent = requestHeaders.get("user-agent") ?? "";
  // Orion Mac 1.2+ (OrionFrame/2) draws the project chat natively: the page
  // feeds it over the bridge instead of drawing the web chat.
  const feedMode = isOrionFrameV2UserAgent(userAgent);
  // The Orion Mac app draws the project tabs natively.
  const showProjectTabs = !isOrionFrameUserAgent(userAgent);
  const feedReadiness = feedMode
    ? await getCurrentAgentReadiness().catch(() => ({
        ready: false as const,
        reason: "offline" as const,
      }))
    : null;
  const project = workspaceProjects.find(
    (candidate) => candidate.id === data.room.projectId,
  );
  const projectTabs = orderProjectTabs(workspaceRooms, data.room.projectId).map(
    (room) => ({ id: room.id, name: room.name }),
  );
  const [
    currentPrd,
    history,
    initialPrdAgentReadiness,
    decisions,
    overview,
    prototype,
    roomInspiration,
  ] = await Promise.all([
    // Load the PRD whenever the room has one: the PRD tab renders it, the
    // task provider reads its status on every tab, and the User Flows tab
    // seeds the canvas from its journey flow.
    surfaceState.hasPrd ? getRoomPrd({ roomId }) : Promise.resolve(null),
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
    activeSurface === "prototype"
      ? startScreenId
        ? getRoomPrototype(workspaceId, roomId, startScreenId)
        : getRoomPrototype(workspaceId, roomId)
      : Promise.resolve(null),
    activeSurface === "inspiration"
      ? listRoomInspiration(roomId)
      : Promise.resolve([]),
  ]);
  const prd = currentPrd ?? history[0] ?? null;
  const canEdit = data.participants.some(
    (participant) =>
      participant.userId === data.currentUser.id &&
      participant.access === "edit",
  );
  const canAccept =
    data.currentUser.id === data.room.ownerId ||
    data.isCurrentUserWorkspaceAdmin;
  const ownerName =
    data.participants.find((p) => p.userId === data.room.ownerId)?.email ??
    "Unknown";
  const userFlowsHref = `${basePath}?tab=user-flows`;
  const flowExpand: FlowExpandTarget = { mode: "open", href: userFlowsHref };
  const prdDocumentProps = prd
    ? {
        prd,
        ownerName,
        basePath,
        history,
        canEdit,
        canAccept,
        flowExpand,
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
        feedMode ? undefined : (
          <VStack gap={0} width="100%">
            {project && showProjectTabs ? (
              <ProjectTabs
                workspaceId={workspaceId}
                project={project}
                tabs={projectTabs}
                selectedRoomId={roomId}
              />
            ) : null}
          <LayoutHeader
            padding={3}
            style={{ backgroundColor: "var(--color-background-surface)" }}
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
              realtimeMode={data.realtimeMode}
            />
          </LayoutHeader>
          </VStack>
        )
      }
    >
      <MarkRoomViewed roomId={roomId} />
      {feedMode && feedReadiness ? (
        <NativeStreamBridge
          key={roomId}
          roomId={roomId}
          projectId={data.room.projectId}
          currentUser={{ id: data.currentUser.id, name: data.currentUser.name }}
          participants={data.participants.map((p) => ({
            userId: p.userId,
            email: p.email,
          }))}
          initialMessages={data.messages}
          realtimeMode={data.realtimeMode}
          readiness={feedReadiness}
        />
      ) : null}
      <LayoutContent
        padding={0}
        data-testid="room-surface"
        style={{ backgroundColor: "var(--color-background-body)" }}
      >
        <RoomSurfaceSync
          roomId={roomId}
          workspaceId={workspaceId}
          replacementHref={
            shouldReplaceUrl ? `${basePath}?tab=conversation` : undefined
          }
          realtimeEnabled={data.realtimeMode === "production"}
        />
        <RoomTaskStatusProvider
          roomId={roomId}
          roomName={data.room.name}
          hasPrd={surfaceState.hasPrd}
          initialActivePrdTaskIds={data.activePrdTaskIds}
          prdStatus={prd?.status ?? null}
        >
          <VStack gap={0} width="100%" height="100%">
            {feedMode ? null : (
              <RoomTabStrip
                activeSurface={activeSurface}
                surfaceState={surfaceState}
                basePath={basePath}
              />
            )}
            {activeSurface === "user-flows" ? (
              canvasAccess ? (
                <BoardLoader boardId={roomId} roomId={roomId} access={canvasAccess} />
              ) : null
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
              // The native app draws the chat in feed mode.
              feedMode ? null : (
              <>
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
                  showRoomStarters={
                    !surfaceState.hasPrd && !surfaceState.hasUserFlow
                  }
                  focusedMessageId={
                    typeof message === "string" ? message : undefined
                  }
                />
                <StageCoachingPanel
                  roomId={roomId}
                  workspaceId={workspaceId}
                  projectId={data.room.projectId}
                  roomName={data.room.name}
                  ownerId={data.room.ownerId}
                  stage={data.room.stage}
                  updatedAt={data.room.updatedAt}
                  stageReadiness={data.stageReadiness}
                  canEditChecklist={canEdit}
                  canChangeStage={canAccept}
                  realtimeMode={data.realtimeMode}
                  designHandoff={data.designHandoff}
                />
              </>
              )
            ) : activeSurface === "decisions" ? (
              <DecisionsSurface decisions={decisions} basePath={basePath} />
            ) : activeSurface === "prototype" ? (
              // The prototype ("Try") surface is the rendered prototype only --
              // no composer or build/status text on top of it, so the whole
              // viewport is the clickable preview.
              <PrototypeViewer
                html={prototype?.html ?? null}
                screenCount={prototype?.screenCount ?? 0}
              />
            ) : activeSurface === "inspiration" ? (
              <RoomInspirationSurface
                workspaceId={workspaceId}
                roomId={roomId}
                items={roomInspiration}
                canEdit={canEdit}
              />
            ) : activeSurface === "overview" && overview ? (
              <RoomOverview overview={overview} />
            ) : null}
          </VStack>
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
