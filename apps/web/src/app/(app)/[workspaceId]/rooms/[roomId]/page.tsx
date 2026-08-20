import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { redirect } from "next/navigation";
import {
  createRoomTab,
  getRoomOverview,
  getRoomPageData,
  listRoomDecisions,
  listRoomTabs,
} from "@/features/rooms/queries";
import { getCurrentAgentReadiness } from "@/features/ai/current-agent-readiness";
import { Conversation } from "@/features/rooms/components/conversation";
import { RoomHeader } from "@/features/rooms/components/room-header";
import { RoomOverviewTab } from "@/features/rooms/components/room-overview-tab";
import { RoomPlane } from "@/features/rooms/components/room-plane";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import { getRoomPrd, getRoomPrdHistory } from "@/features/prd/queries";
import { isCanvasTrialEnabled } from "@/features/canvas/canvas-session";
import type { UserFlowTrialTabProps } from "@/features/canvas/user-flow-trial-tab";
import type { FlowExpandTarget } from "@/features/prd/components/flow-preview";
import type {
  PrdDocumentProps,
} from "@/features/prd/components/prd-document";
import type { PrototypeViewerProps } from "@/features/design/components/prototype-viewer";
import { getRoomPrototype } from "@/features/design/prototype-reader";
import { readRoomCanvasScreens } from "@/features/design/canvas-screen-reader";
import { hasOverviewTab } from "@/features/rooms/overview-eligibility";
import { resolveTabParam } from "@/features/rooms/tab-resolution";
import type { PaneTool } from "@/features/rooms/pane-layout";
import type { RoomTab } from "@/features/rooms/room-tabs-repository";
import type { RoomPaneData } from "@/features/rooms/components/pane-content";

function artifactTools(
  state: {
    hasUserFlow: boolean;
    hasPrd: boolean;
    hasBuiltDesignScreen: boolean;
    stage: string;
  },
): PaneTool[] {
  const tools: PaneTool[] = [];
  if (state.hasUserFlow) tools.push("canvas");
  if (state.hasPrd) tools.push("prd");
  if (state.hasBuiltDesignScreen || state.stage === "design" || state.stage === "development") {
    tools.push("prototype");
  }
  return tools;
}

function firstTabId(tabs: readonly RoomTab[]): string {
  return tabs[0]?.id ?? "";
}

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
  const basePath = `/${workspaceId}/rooms/${roomId}`;
  const [data, listedTabs] = await Promise.all([
    getRoomPageData({ workspaceId, roomId, includeMessages: true }),
    listRoomTabs(roomId),
  ]);
  if (!data) {
    redirect(`/${workspaceId}`);
    return null;
  }

  let tabs = listedTabs;
  if (tabs.length === 0) {
    tabs = [await createRoomTab({ roomId })];
  }

  const canEdit = data.participants.some(
    (participant) =>
      participant.userId === data.currentUser.id &&
      participant.access === "edit",
  );
  const overviewAvailable = hasOverviewTab({
    hasUserFlow: data.surfaceState.hasUserFlow,
    hasPrd: data.surfaceState.hasPrd,
    hasPrdTask: data.surfaceState.hasPrdTask,
    hasBuiltDesignScreen: data.surfaceState.hasBuiltDesignScreen,
    decisionCount: data.surfaceState.decisionCount,
    stage: data.surfaceState.stage,
  });
  const resolution = resolveTabParam(tab, {
    tabIds: tabs.map((roomTab) => roomTab.id),
    hasOverview: overviewAvailable,
  });

  let activeTabId = firstTabId(tabs);
  let shouldRewriteTab = tab !== undefined;
  if (resolution.kind === "tab") {
    activeTabId = resolution.tabId;
    shouldRewriteTab = false;
  } else if (resolution.kind === "overview") {
    activeTabId = "overview";
    shouldRewriteTab = false;
  } else if (resolution.kind === "legacy-tool" && canEdit) {
    const legacyTab = await createRoomTab({
      roomId,
      panes: [resolution.tool],
    });
    tabs = [...tabs, legacyTab];
    activeTabId = legacyTab.id;
  }

  // Initial navigation is the only place the server has enough information to
  // turn an old surface URL into a durable tab. Subsequent switching is
  // personal client state and the realtime hook keeps the shared rows current.
  if (shouldRewriteTab) {
    redirect(`${basePath}?tab=${activeTabId}`);
    return null;
  }

  const activeTab = tabs.find((roomTab) => roomTab.id === activeTabId);
  const activeTools = activeTab?.panes ?? [];
  const canvasTrialEnabled = isCanvasTrialEnabled();
  const canvasAccess =
    data.participants.find(
      (participant) => participant.userId === data.currentUser.id,
    )?.access ?? null;
  const prdNeeded =
    data.surfaceState.hasPrd ||
    activeTools.includes("prd") ||
    activeTools.includes("canvas");
  const prototypeNeeded =
    data.surfaceState.hasBuiltDesignScreen ||
    data.surfaceState.stage === "design" ||
    data.surfaceState.stage === "development" ||
    activeTools.includes("prototype");
  const canvasNeeded =
    data.surfaceState.hasUserFlow || activeTools.includes("canvas");
  const startScreenId = typeof screen === "string" ? screen : undefined;

  const [currentPrd, history, initialPrdAgentReadiness, prototype, canvasScreenRead, overview, decisions] =
    await Promise.all([
      prdNeeded ? getRoomPrd({ roomId }) : Promise.resolve(null),
      activeTools.includes("prd") ? getRoomPrdHistory({ roomId }) : Promise.resolve([]),
      activeTools.includes("prd")
        ? getCurrentAgentReadiness().catch(() => undefined)
        : Promise.resolve(undefined),
      prototypeNeeded
        ? startScreenId
          ? getRoomPrototype(workspaceId, roomId, startScreenId)
          : getRoomPrototype(workspaceId, roomId)
        : Promise.resolve(null),
      canvasNeeded
        ? readRoomCanvasScreens(roomId)
        : Promise.resolve({ ok: true as const, screens: [] }),
      overviewAvailable ? getRoomOverview(roomId) : Promise.resolve(null),
      overviewAvailable ? listRoomDecisions(roomId) : Promise.resolve([]),
    ]);

  const prd = currentPrd ?? history[0] ?? null;
  const canAccept =
    data.currentUser.id === data.room.ownerId ||
    data.isCurrentUserWorkspaceAdmin;
  const ownerName =
    data.participants.find((participant) => participant.userId === data.room.ownerId)
      ?.email ?? "Unknown";
  const flowExpand: FlowExpandTarget = { mode: "dialog" };
  const journeys = prd?.document?.userJourneys ?? null;
  const userJourneyFlow =
    journeys && typeof journeys === "object" ? journeys : null;
  const prdDocumentProps: PrdDocumentProps | null = prd
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
  const canvasProps: UserFlowTrialTabProps | null =
    canvasNeeded && canvasAccess
      ? {
          workspaceId,
          roomId,
          currentUser: {
            id: data.currentUser.id,
            name: data.currentUser.name,
          },
          trialEnabled: canvasTrialEnabled,
          seedFlow: userJourneyFlow,
          canvasScreens: canvasScreenRead.screens,
          canvasScreensAuthoritative: canvasScreenRead.ok,
          initialGenerationTaskId:
            canvasAccess === "edit"
              ? data.activeUserFlowTaskIds[0] ?? null
              : null,
        }
      : null;
  const prototypeProps: PrototypeViewerProps | null = prototype
    ? {
        html: prototype.html,
        screenCount: prototype.screenCount,
      }
    : null;
  const paneData: RoomPaneData = {
    canvas: data.surfaceState.hasUserFlow ? canvasProps : undefined,
    prototype:
      data.surfaceState.hasBuiltDesignScreen ||
      data.surfaceState.stage === "design" ||
      data.surfaceState.stage === "development"
        ? prototypeProps
        : undefined,
    prd: data.surfaceState.hasPrd ? prdDocumentProps : undefined,
  };
  const artifacts = artifactTools(data.surfaceState).map((tool) => ({
    tool,
    label: tool === "prd" ? "PRD" : tool[0]!.toUpperCase() + tool.slice(1),
  }));

  const conversation = (
    <Conversation
      roomId={roomId}
      roomName={data.room.name}
      workspaceId={workspaceId}
      currentUserId={data.currentUser.id}
      currentUserName={data.currentUser.name}
      participants={data.participants}
      initialMessages={data.messages}
      realtimeMode={data.realtimeMode}
      hasPrd={data.surfaceState.hasPrd}
      basePath={basePath}
      showRoomStarters={!data.surfaceState.hasPrd && !data.surfaceState.hasUserFlow}
      focusedMessageId={typeof message === "string" ? message : undefined}
    />
  );

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
        <RoomTaskStatusProvider
          roomId={roomId}
          hasPrd={data.surfaceState.hasPrd}
          initialActivePrdTaskIds={data.activePrdTaskIds}
          prdStatus={prd?.status ?? null}
        >
          <RoomPlane
            roomId={roomId}
            tabs={tabs}
            activeTabId={activeTabId}
            hasOverview={overviewAvailable}
            canEdit={canEdit}
            paneData={paneData}
            conversation={conversation}
            realtimeEnabled={data.realtimeMode === "production"}
            overview={
              overviewAvailable ? (
                <RoomOverviewTab
                  overview={overview}
                  decisions={decisions}
                  participants={data.participants}
                  artifacts={artifacts}
                  basePath={basePath}
                />
              ) : undefined
            }
          />
        </RoomTaskStatusProvider>
      </LayoutContent>
    </Layout>
  );
}
