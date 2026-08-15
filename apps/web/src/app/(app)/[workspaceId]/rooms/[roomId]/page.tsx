import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
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
import { getRoomSurfaces, resolveRoomSurface } from "@/features/rooms/surfaces";
import { RoomSurfaceSync } from "@/features/rooms/use-room-surface-realtime";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";
import { isCanvasTrialEnabled } from "@/features/canvas/canvas-session";
import { UserFlowTrialTab } from "@/features/canvas/user-flow-trial-tab-loader";
import type { FlowExpandTarget } from "@/features/prd/components/flow-preview";
import { UserFlowTrialUnavailable } from "@/features/canvas/user-flow-trial-unavailable";
import { DecisionsSurface } from "@/features/rooms/components/decisions-surface";
import { RoomOverview } from "@/features/rooms/components/room-overview";
import { StageCoachingPanel } from "@/features/rooms/components/stage-coaching-panel";
import { PrototypeViewer } from "@/features/design/components/prototype-viewer";
import { getRoomPrototype } from "@/features/design/prototype-reader";
import { listRoomDesignScreens } from "@/features/design/design-screen-generation";
import { readRoomCanvasScreens } from "@/features/design/canvas-screen-reader";
import { readRoomActionLinkRows } from "@/features/design/action-links-reader";

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
    prototype,
    designScreens,
    canvasScreenRead,
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
      ? getRoomPrototype(workspaceId, roomId)
      : Promise.resolve(null),
    activeSurface === "prototype" || activeSurface === "user-flows"
      ? listRoomDesignScreens(roomId)
      : Promise.resolve([]),
    activeSurface === "user-flows"
      ? readRoomCanvasScreens(roomId)
      : Promise.resolve({ ok: true as const, screens: [] }),
  ]);
  // Manual C2a link rows for the canvas, scoped to the room's live screens.
  // Fetched after the canvas screens read (which supplies the live screen ids)
  // and only on the User Flows surface, where the canvas reconciles them into
  // link arrows. `ok` distinguishes a genuine empty read from a failed one, so
  // a blip never wipes the shared document's link arrows.
  const canvasScreenLinks =
    activeSurface === "user-flows"
      ? await readRoomActionLinkRows(
          roomId,
          canvasScreenRead.screens.map((screen) => screen.id),
        )
      : { ok: true as const, rows: [] };
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
  // How the User-journeys "Expand" behaves: open the canvas if it already
  // exists, start one (then seed it from the journey) when the viewer can, or
  // fall back to the in-place dialog for view-only / trial-off viewers.
  const userFlowsHref = `${basePath}?tab=user-flows`;
  const flowExpand: FlowExpandTarget = surfaces.includes("user-flows")
    ? { mode: "open", href: userFlowsHref }
    : canvasTrialEnabled && canvasAccess === "edit"
      ? { mode: "start", href: userFlowsHref, roomId }
      : { mode: "dialog" };
  // The journey flow that seeds an empty canvas when the User Flows tab opens.
  const journeys = prd?.document?.userJourneys ?? null;
  const userJourneyFlow =
    journeys && typeof journeys === "object" ? journeys : null;
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
      }
    >
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
                  seedFlow={userJourneyFlow}
                  canvasScreens={canvasScreenRead.screens}
                  canvasScreensAuthoritative={canvasScreenRead.ok}
                  initialGenerationTaskId={
                    canvasAccess === "edit"
                      ? data.activeUserFlowTaskIds[0] ?? null
                      : null
                  }
                  screens={designScreens}
                  screenLinks={canvasScreenLinks.rows}
                  screenLinksAuthoritative={canvasScreenLinks.ok}
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
            ) : activeSurface === "overview" && overview ? (
              <RoomOverview overview={overview} />
            ) : null}
          </VStack>
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
