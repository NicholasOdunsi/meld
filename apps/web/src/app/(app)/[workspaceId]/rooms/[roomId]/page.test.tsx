// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { RoomTab } from "@/features/rooms/room-tabs-repository";

const mocks = vi.hoisted(() => ({
  createRoomTab: vi.fn(),
  getCurrentAgentReadiness: vi.fn(),
  getRoomOverview: vi.fn(),
  getRoomPageData: vi.fn(),
  getRoomPrd: vi.fn(),
  getRoomPrdHistory: vi.fn(),
  getRoomPrototype: vi.fn(),
  listRoomDecisions: vi.fn(),
  listRoomTabs: vi.fn(),
  readRoomCanvasScreens: vi.fn(),
  redirect: vi.fn(),
  roomHeader: vi.fn((_props: Record<string, unknown>) => (
    <section data-testid="room-header" />
  )),
  roomOverviewTab: vi.fn((_props: Record<string, unknown>) => (
    <section data-testid="room-overview" />
  )),
  roomPlane: vi.fn((_props: Record<string, unknown>) => (
    <section data-testid="room-plane" />
  )),
  conversation: vi.fn((_props: Record<string, unknown>) => (
    <p>Conversation</p>
  )),
}));

vi.mock("@/features/rooms/queries", () => ({
  createRoomTab: mocks.createRoomTab,
  getRoomOverview: mocks.getRoomOverview,
  getRoomPageData: mocks.getRoomPageData,
  listRoomDecisions: mocks.listRoomDecisions,
  listRoomTabs: mocks.listRoomTabs,
}));

vi.mock("@/features/ai/current-agent-readiness", () => ({
  getCurrentAgentReadiness: mocks.getCurrentAgentReadiness,
}));

vi.mock("@/features/rooms/components/conversation", () => ({
  Conversation: mocks.conversation,
}));

vi.mock("@/features/rooms/components/room-header", () => ({
  RoomHeader: mocks.roomHeader,
}));

vi.mock("@/features/rooms/components/room-overview-tab", () => ({
  RoomOverviewTab: mocks.roomOverviewTab,
}));

vi.mock("@/features/rooms/components/room-plane", () => ({
  RoomPlane: mocks.roomPlane,
}));

vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  RoomTaskStatusProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/features/prd/queries", () => ({
  getRoomPrd: mocks.getRoomPrd,
  getRoomPrdHistory: mocks.getRoomPrdHistory,
}));

vi.mock("@/features/canvas/canvas-session", () => ({
  isCanvasTrialEnabled: () => true,
}));

vi.mock("@/features/design/prototype-reader", () => ({
  getRoomPrototype: mocks.getRoomPrototype,
}));

vi.mock("@/features/design/canvas-screen-reader", () => ({
  readRoomCanvasScreens: mocks.readRoomCanvasScreens,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import RoomPage from "./page";

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

const TABS: RoomTab[] = [
  { id: "tab-checkout", name: "Checkout", position: 0, panes: [] },
  { id: "tab-empty", name: "Empty states", position: 1, panes: [] },
];

function roomData(overrides: Record<string, unknown> = {}) {
  return {
    room: {
      id: ROOM_ID,
      workspaceId: WORKSPACE_ID,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Customer interviews",
      ownerId: "10000000-0000-4000-8000-000000000001",
      stage: "discovery",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId: ROOM_ID,
        userId: "10000000-0000-4000-8000-000000000001",
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: false,
    hasUserFlow: true,
    activePrdTaskIds: [],
    activeUserFlowTaskIds: [],
    surfaceState: {
      hasPrd: false,
      hasPrdTask: false,
      hasUserFlow: true,
      hasBuiltDesignScreen: false,
      decisionCount: 1,
      stage: "discovery",
    },
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "development-poll",
    ...overrides,
  };
}

async function renderResolvedPage(
  searchParams: { tab?: string | string[] } = {},
) {
  const result = await RoomPage({
    params: Promise.resolve({ workspaceId: WORKSPACE_ID, roomId: ROOM_ID }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(result);
}

beforeEach(() => {
  mocks.createRoomTab.mockReset();
  mocks.getCurrentAgentReadiness.mockReset();
  mocks.getRoomOverview.mockReset();
  mocks.getRoomPageData.mockReset();
  mocks.getRoomPrd.mockReset();
  mocks.getRoomPrdHistory.mockReset();
  mocks.getRoomPrototype.mockReset();
  mocks.listRoomDecisions.mockReset();
  mocks.listRoomTabs.mockReset();
  mocks.readRoomCanvasScreens.mockReset();
  mocks.redirect.mockReset();
  mocks.roomHeader.mockClear();
  mocks.roomOverviewTab.mockClear();
  mocks.roomPlane.mockClear();
  mocks.conversation.mockClear();

  mocks.getRoomPageData.mockResolvedValue(roomData());
  mocks.listRoomTabs.mockResolvedValue(TABS);
  mocks.createRoomTab.mockResolvedValue({
    id: "tab-created",
    name: null,
    position: 2,
    panes: [],
  });
  mocks.getRoomOverview.mockResolvedValue({
    stage: "discovery",
    latestActivityAt: "2026-07-25T00:00:00.000Z",
    participantCount: 1,
    participants: [],
    counts: { userFlows: 1, prds: 0, decisions: 1 },
    recentDecisions: [],
  });
  mocks.listRoomDecisions.mockResolvedValue([]);
  mocks.getRoomPrd.mockResolvedValue(null);
  mocks.getRoomPrdHistory.mockResolvedValue([]);
  mocks.getCurrentAgentReadiness.mockResolvedValue(undefined);
  mocks.getRoomPrototype.mockResolvedValue({ html: null, screenCount: 0 });
  mocks.readRoomCanvasScreens.mockResolvedValue({ ok: true, screens: [] });
});

it("renders a room plane with one shared conversation and generated overview data", async () => {
  await renderResolvedPage();

  expect(screen.getByTestId("room-header")).toBeInTheDocument();
  expect(screen.getByTestId("room-plane")).toBeInTheDocument();
  expect(mocks.getRoomPageData).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    roomId: ROOM_ID,
    includeMessages: true,
  });
  expect(mocks.roomPlane.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      roomId: ROOM_ID,
      tabs: TABS,
      hasOverview: true,
      canEdit: true,
    }),
  );
  const planeProps = mocks.roomPlane.mock.calls[0]?.[0] as {
    overview?: { props?: Record<string, unknown> };
  };
  expect(planeProps.overview?.props).toEqual(
    expect.objectContaining({
      decisions: [],
      basePath: `/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
    }),
  );
});

it("restores a full conversation tab without rewriting it on reload", async () => {
  await renderResolvedPage({ tab: "conversation" });

  expect(mocks.redirect).not.toHaveBeenCalled();
  expect(mocks.roomPlane.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      activeTabId: "conversation",
      preferActiveTab: true,
    }),
  );
});

it("reuses a tab that already contains the legacy-linked tool", async () => {
  mocks.listRoomTabs.mockResolvedValue([
    ...TABS,
    { id: "tab-prd", name: "Requirements", position: 2, panes: ["prd"] },
  ]);

  await renderResolvedPage({ tab: "prd" });

  expect(mocks.createRoomTab).not.toHaveBeenCalled();
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=tab-prd`,
  );
});

it("opens a legacy PRD link in a fresh tab when no tab contains it", async () => {
  await renderResolvedPage({ tab: "prd" });

  expect(mocks.createRoomTab).toHaveBeenCalledWith({
    roomId: ROOM_ID,
    panes: ["prd"],
  });
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=tab-created`,
  );
  expect(mocks.roomPlane).not.toHaveBeenCalled();
});

it("lets a view-only reader follow a legacy artifact link to a shared tab", async () => {
  mocks.getRoomPageData.mockResolvedValue(
    roomData({
      participants: [
        {
          roomId: ROOM_ID,
          userId: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
          access: "view",
        },
      ],
    }),
  );
  mocks.listRoomTabs.mockResolvedValue([
    { id: "tab-prd", name: "Brief", position: 0, panes: ["prd"] },
  ]);

  await renderResolvedPage({ tab: "prd" });

  expect(mocks.createRoomTab).not.toHaveBeenCalled();
  expect(mocks.redirect).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=tab-prd`,
  );
});

it("falls back to the first workstream for an unknown tab parameter", async () => {
  await renderResolvedPage({ tab: "not-a-tab" });

  expect(mocks.redirect).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=tab-checkout`,
  );
});

it("creates the initial untitled tab when the repository is empty", async () => {
  mocks.listRoomTabs.mockResolvedValue([]);
  mocks.createRoomTab.mockResolvedValue({
    id: "tab-initial",
    name: null,
    position: 0,
    panes: [],
  });

  await renderResolvedPage();

  expect(mocks.createRoomTab).toHaveBeenCalledWith({ roomId: ROOM_ID });
  expect(mocks.roomPlane.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({
      tabs: [{ id: "tab-initial", name: null, position: 0, panes: [] }],
    }),
  );
});

it("loads only the active tab's prototype data", async () => {
  mocks.listRoomTabs.mockResolvedValue([
    { id: "tab-prototype", name: "Prototype", position: 0, panes: ["prototype"] },
  ]);
  mocks.getRoomPageData.mockResolvedValue(
    roomData({
      hasUserFlow: false,
      surfaceState: {
        hasPrd: false,
        hasPrdTask: false,
        hasUserFlow: false,
        hasBuiltDesignScreen: true,
        decisionCount: 0,
        stage: "design",
      },
    }),
  );

  await renderResolvedPage({ tab: "tab-prototype" });

  expect(mocks.getRoomPrototype).toHaveBeenCalledWith(WORKSPACE_ID, ROOM_ID);
  expect(mocks.getRoomPrdHistory).not.toHaveBeenCalled();
});

// The Room is one ground: the dot field is painted once on the page root and
// runs edge to edge, so the header and the surface are transparent layers over
// it rather than chrome bars beside it. White is reserved for the things that
// float on the field -- the panes, the toolbar, the composer, the active tab.
it("keeps the header and the surface transparent over the page's dot field", async () => {
  // Scoped to this render's own container rather than `screen`: this file
  // registers no `afterEach(cleanup)`, so every earlier test's markup is
  // still mounted by the time this one runs and a page-level `getByTestId`
  // matches all of them.
  const { container } = await renderResolvedPage();

  const chrome = container.querySelector<HTMLElement>(
    '[data-testid="room-chrome"]',
  );
  const surface = container.querySelector<HTMLElement>(
    '[data-testid="room-surface"]',
  );

  expect(chrome).not.toBeNull();
  expect(surface).not.toBeNull();
  // Read off the declaration rather than through `toHaveStyle`: jsdom
  // normalises `transparent` to `rgba(0, 0, 0, 0)` and the matcher then fails
  // against the literal we actually wrote.
  expect(chrome?.getAttribute("style")).toContain(
    "background-color: transparent",
  );
  expect(surface?.getAttribute("style")).toContain(
    "background-color: transparent",
  );
});
