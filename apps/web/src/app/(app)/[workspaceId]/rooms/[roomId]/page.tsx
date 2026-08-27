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
import { extractUserJourneyFlow } from "@/features/prd/freeform-document";
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
import {
  PANE_TITLES,
  type RoomPaneData,
} from "@/features/rooms/components/pane-content";

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
  } else if (resolution.kind === "conversation") {
    activeTabId = "conversation";
    shouldRewriteTab = false;
  } else if (resolution.kind === "legacy-tool") {
    const existingTab = tabs.find((roomTab) =>
      roomTab.panes.includes(resolution.tool),
    );
    if (existingTab) {
      activeTabId = existingTab.id;
    } else if (canEdit) {
      const legacyTab = await createRoomTab({
        roomId,
        panes: [resolution.tool],
      });
      tabs = [...tabs, legacyTab];
      activeTabId = legacyTab.id;
    } else {
      // View-only participants cannot create a compatibility tab, but they
      // can still follow an Overview artifact link to a shared tab that
      // already contains that tool.
      activeTabId = firstTabId(tabs);
    }
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
  const userJourneyFlow = prd
    ? extractUserJourneyFlow(prd.document)
    : null;
  const prdDocumentProps: PrdDocumentProps = {
    prd,
    roomId,
    ownerName,
    basePath,
    history,
    canEdit,
    canAccept,
    flowExpand,
    agentReadiness: initialPrdAgentReadiness,
  };
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
  // `prototype` is `null` when nothing has been built yet -- that is
  // exactly the state `PrototypeEmptyState` exists to show, so this always
  // produces a full `PrototypeViewerProps`, never `null`. A `null` here
  // would flow through `PaneContent`'s `surfaceProps` (which widens `null`
  // to `{}` for shell fixtures) and hand `PrototypeViewer` no props at all,
  // crashing on `screens[0]`.
  const prototypeProps: PrototypeViewerProps = {
    ...(prototype
      ? {
          html: prototype.html,
          screenCount: prototype.screenCount,
          screens: prototype.screens,
          conformanceCorrections: prototype.conformanceCorrections,
        }
      : { html: null, screenCount: 0, screens: [] }),
    // What decides which starting points `PrototypeEmptyState` offers -- the
    // same booleans that decide which tools the Room offers (see
    // `artifactTools` above). `RoomPlane` (a client component) supplies the
    // matching `onStart`/`onFocusComposer` callbacks; this server component
    // can only ever hand down serializable booleans.
    hasUserFlow: data.surfaceState.hasUserFlow,
    hasPrd: data.surfaceState.hasPrd,
  };
  const paneData: RoomPaneData = {
    // `canvasProps` is already non-null exactly when the Room needs a canvas
    // -- `canvasNeeded` counts a placed `canvas` pane, not just an existing
    // user flow. Re-testing `hasUserFlow` here threw those props away and
    // showed "Ask meld to create a Canvas" on a pane the person had just
    // dragged out, which is the one case where they have plainly said they
    // want a canvas. Unlike a PRD or a prototype, a canvas is a surface you
    // can start using empty -- there is nothing to wait for.
    canvas: canvasProps ?? undefined,
    // `prototypeNeeded` (above) is also what decided whether `prototype` was
    // even fetched -- reusing it here (rather than re-testing the
    // surfaceState booleans alone, which is what this used to do) is what
    // makes a placed `prototype` pane get real props before the surface
    // state alone would justify fetching one. Re-testing only the booleans
    // is the exact bug `canvasNeeded`/`canvasProps` above was already fixed
    // for and this was left out of: a planning-stage room with a PRD or user
    // flow that drags out a Prototype pane got the generic "Ask meld to
    // build a Prototype" placeholder instead of `PrototypeEmptyState`'s
    // starting points.
    prototype: prototypeNeeded ? prototypeProps : undefined,
    // A Document pane is a writable surface even before its first save, so it
    // never uses PaneContent's generic "ask meld" artifact placeholder. Keep
    // its props ready for every client-side tab switch; otherwise a tab that
    // was not active during this server render shows the placeholder until a
    // manual reload rebuilds paneData for that tab.
    prd: prdDocumentProps,
  };
  const artifacts = artifactTools(data.surfaceState).map((tool) => ({
    tool,
    // Same labels the toolbar and the pane headers use, so an artifact is
    // called the same thing everywhere in the Room.
    label: PANE_TITLES[tool],
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
    // The dot field is the Room's ground and it runs edge to edge -- under the
    // header and the tab strip, not just under the plane. Everything else is a
    // layer floating on top of it, which is why none of them carry a hard
    // frame: the field is the constant, the panels are the things resting on
    // it. Painted once here so there is exactly one grid on the page and the
    // dots stay aligned across the header/plane boundary.
    <Layout
      height="fill"
      style={{
        backgroundColor: "var(--meld-surface-wash)",
        backgroundImage:
          "radial-gradient(var(--meld-dot) var(--meld-hairline), transparent var(--meld-hairline))",
        backgroundSize: "var(--meld-dot-grid) var(--meld-dot-grid)",
      }}
      header={
        <LayoutHeader
          padding={3}
          data-testid="room-chrome"
          style={{ backgroundColor: "transparent" }}
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
        style={{ backgroundColor: "transparent" }}
      >
        <RoomTaskStatusProvider
          roomId={roomId}
          hasPrd={data.surfaceState.hasPrd}
          initialActivePrdTaskIds={data.activePrdTaskIds}
          prdStatus={prd?.status ?? null}
        >
          <RoomPlane
            roomId={roomId}
            basePath={basePath}
            tabs={tabs}
            activeTabId={activeTabId}
            hasOverview={overviewAvailable}
            canEdit={canEdit}
            preferActiveTab={tab !== undefined}
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
