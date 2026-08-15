// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { CanvasScreenReadResult } from "@/features/design/canvas-screen-reader";

const mocks = vi.hoisted(() => ({
  getRoomPageData: vi.fn(),
  listRoomDecisions: vi.fn(),
  getRoomOverview: vi.fn(),
  getCurrentAgentReadiness: vi.fn(),
  getRoomPrd: vi.fn(),
  getRoomPrdHistory: vi.fn(),
  getRoomPrototype: vi.fn(),
  listRoomDesignScreens: vi.fn(),
  readRoomCanvasScreens: vi.fn<
    (roomId: string) => Promise<CanvasScreenReadResult>
  >(async () => ({ ok: true, screens: [] })),
  prdDocument: vi.fn((props: Record<string, unknown>) => {
    void props;
    return null;
  }),
  providerPrdStatus: undefined as string | null | undefined,
  providerInitialActivePrdTaskIds: undefined as string[] | undefined,
  redirect: vi.fn(),
  conversation: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>Conversation</p>,
  ),
  decisionsSurface: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>Decision list</p>,
  ),
  roomOverview: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>Room overview</p>,
  ),
  userFlowTrialTab: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>User Flow canvas</p>,
  ),
  prototypeViewer: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>Prototype viewer</p>,
  ),
  screenComposer: vi.fn<(props: Record<string, unknown>) => ReactNode>(
    () => <p>Screen composer</p>,
  ),
  surfaceSync: vi.fn((props: Record<string, unknown>) => {
    void props;
    return null;
  }),
}));

vi.mock("@/features/rooms/queries", () => ({
  getRoomPageData: async (input: Record<string, unknown>) => {
    const data = await mocks.getRoomPageData(input);
    if (!data) return null;
    return {
      ...data,
      activePrdTaskIds: data.activePrdTaskIds ?? [],
      activeUserFlowTaskIds: data.activeUserFlowTaskIds ?? [],
      surfaceState: {
        hasPrd: data.hasPrd ?? false,
        hasPrdTask: data.hasPrdTask ?? false,
        hasUserFlow: data.hasUserFlow ?? false,
        hasBuiltDesignScreen: data.hasBuiltDesignScreen ?? false,
        decisionCount: data.decisionCount ?? data.decisions?.length ?? 0,
        stage:
          (data.room as { stage?: string } | undefined)?.stage ??
          "discovery",
      },
    };
  },
  listRoomDecisions: mocks.listRoomDecisions,
  getRoomOverview: mocks.getRoomOverview,
}));

vi.mock("@/features/ai/current-agent-readiness", () => ({
  getCurrentAgentReadiness: mocks.getCurrentAgentReadiness,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/features/prd/queries", () => ({
  getRoomPrd: mocks.getRoomPrd,
  getRoomPrdHistory: mocks.getRoomPrdHistory,
}));

vi.mock("@/features/design/prototype-reader", () => ({
  getRoomPrototype: mocks.getRoomPrototype,
}));

vi.mock("@/features/design/design-screen-generation", () => ({
  listRoomDesignScreens: mocks.listRoomDesignScreens,
}));

vi.mock("@/features/design/canvas-screen-reader", () => ({
  readRoomCanvasScreens: mocks.readRoomCanvasScreens,
}));

vi.mock("@/features/design/components/prototype-viewer", () => ({
  PrototypeViewer: mocks.prototypeViewer,
}));

vi.mock("@/features/design/components/screen-composer", () => ({
  ScreenComposer: mocks.screenComposer,
}));

vi.mock("@/features/prd/components/prd-document", () => ({
  PrdDocument: mocks.prdDocument,
}));

vi.mock("@/features/canvas/user-flow-trial-tab", () => ({
  UserFlowTrialTab: () => <p>User Flow canvas</p>,
}));

vi.mock("@/features/canvas/user-flow-trial-unavailable", () => ({
  UserFlowTrialUnavailable: () => <p>User Flow unavailable</p>,
}));

vi.mock("@/features/canvas/user-flow-trial-tab-loader", () => ({
  UserFlowTrialTab: mocks.userFlowTrialTab,
}));

vi.mock("@/features/prd/components/prd-generating", () => ({
  PrdTabContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock(
  "@/features/rooms/components/room-header",
  () => ({
    RoomHeader: ({
      roomName,
    }: {
      roomName: string;
    }) => (
      <section data-testid="room-header">
        {roomName}
      </section>
    ),
  }),
);

vi.mock("@/features/rooms/components/conversation", () => ({
  Conversation: mocks.conversation,
}));

vi.mock("@/features/rooms/components/stage-coaching-panel", () => ({
  StageCoachingPanel: () => null,
}));

vi.mock("@/features/rooms/components/decisions-surface", () => ({
  DecisionsSurface: mocks.decisionsSurface,
}));

vi.mock("@/features/rooms/components/room-overview", () => ({
  RoomOverview: mocks.roomOverview,
}));

vi.mock("@/features/rooms/use-room-surface-realtime", () => ({
  RoomSurfaceSync: mocks.surfaceSync,
}));

vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  RoomTaskStatusProvider: ({
    children,
    initialActivePrdTaskIds,
    prdStatus,
  }: {
    children: ReactNode;
    initialActivePrdTaskIds?: string[];
    prdStatus?: string | null;
  }) => {
    mocks.providerPrdStatus = prdStatus;
    mocks.providerInitialActivePrdTaskIds = initialActivePrdTaskIds;
    return <>{children}</>;
  },
  useRoomTaskStatus: () => null,
}));

vi.mock("@/features/rooms/e2e-gate", () => ({
  isRoomFakeEnabled: () => false,
}));

import RoomPage from "./page";

const READY_AGENT = {
  ready: true as const,
  defaultProvider: "claude" as const,
  defaultDeviceId: "800b69f5-4d4d-4ab3-8b1f-1ad5a7ac77db",
  providers: [
    {
      provider: "claude" as const,
      deviceId: "800b69f5-4d4d-4ab3-8b1f-1ad5a7ac77db",
      deviceName: "MacBook",
      models: ["claude-sonnet-4-5"],
      defaultModel: "claude-sonnet-4-5",
    },
  ],
};

mocks.getCurrentAgentReadiness.mockResolvedValue(READY_AGENT);

it("renders a full-width room with a distinct main surface", async () => {
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: "40000000-0000-4000-8000-000000000004",
      workspaceId: "30000000-0000-4000-8000-000000000003",
      name: "Customer interviews",
      ownerId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: "10000000-0000-4000-8000-000000000001",
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId: "40000000-0000-4000-8000-000000000004",
        userId: "10000000-0000-4000-8000-000000000001",
        email: "owner@example.com",
        access: "edit",
      },
    ],
    members: [],
    messages: [],
    evidence: [],
    decisions: [],
    attachments: [],
    hasPrd: false,
  });

  render(
    await RoomPage({
      params: Promise.resolve({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        roomId: "40000000-0000-4000-8000-000000000004",
      }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(screen.queryByLabelText("Room details")).not.toBeInTheDocument();
  expect(screen.getByTestId("room-header")).toHaveTextContent(
    "Customer interviews",
  );
  expect(screen.getByTestId("room-surface")).toHaveStyle({
    backgroundColor: "var(--color-background-body)",
  });
  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId: "30000000-0000-4000-8000-000000000003",
    roomId: "40000000-0000-4000-8000-000000000004",
    requestedSurface: undefined,
  });
});

it("still offers the room starters when the canvas trial is disabled", async () => {
  const previousFlag = process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId,
        userId: ownerId,
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });

  try {
    render(
      await RoomPage({
        params: Promise.resolve({ workspaceId, roomId }),
        searchParams: Promise.resolve({}),
      }),
    );
  } finally {
    if (previousFlag === undefined) delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
    else process.env.MELD_USER_FLOW_TRIAL_ENABLED = previousFlag;
  }

  expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
    showRoomStarters: true,
  });
});

it("keeps a durable User Flow surface when the canvas trial is disabled", async () => {
  const previousFlag = process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId,
        userId: ownerId,
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: false,
    hasUserFlow: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });

  try {
    render(
      await RoomPage({
        params: Promise.resolve({ workspaceId, roomId }),
        searchParams: Promise.resolve({ tab: "user-flows" }),
      }),
    );
  } finally {
    if (previousFlag === undefined) delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
    else process.env.MELD_USER_FLOW_TRIAL_ENABLED = previousFlag;
  }

  expect(screen.getByText("User Flow unavailable")).toBeInTheDocument();
  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId,
    roomId,
    requestedSurface: "user-flows",
  });
});

it("loads and renders the Prototype only on its active surface", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Checkout prototype",
      ownerId,
      stage: "design",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId,
        userId: ownerId,
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    hasBuiltDesignScreen: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  const prototype = { html: "<!doctype html><p>Checkout</p>", screenCount: 1 };
  const screens = [
    {
      id: "50000000-0000-4000-8000-000000000005",
      name: "Checkout",
      state: "built" as const,
      updating: false,
      current_version_id: "60000000-0000-4000-8000-000000000006",
    },
  ];
  mocks.getRoomPrototype.mockClear();
  mocks.prototypeViewer.mockClear();
  mocks.listRoomDesignScreens.mockClear();
  mocks.screenComposer.mockClear();
  mocks.getRoomPrototype.mockResolvedValue(prototype);
  mocks.listRoomDesignScreens.mockResolvedValue(screens);

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "prototype" }),
    }),
  );

  expect(mocks.getRoomPrototype).toHaveBeenCalledOnce();
  expect(mocks.getRoomPrototype).toHaveBeenCalledWith(workspaceId, roomId);
  expect(mocks.listRoomDesignScreens).toHaveBeenCalledExactlyOnceWith(roomId);
  expect(mocks.prototypeViewer.mock.calls.at(-1)?.[0]).toEqual({
    html: prototype.html,
    screenCount: 1,
  });
  // The composer no longer renders on the Prototype surface -- it is the
  // clickable preview only.
  expect(mocks.screenComposer).not.toHaveBeenCalled();
});

it("does not read the Prototype while another surface is active", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Checkout prototype",
      ownerId,
      stage: "design",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    hasBuiltDesignScreen: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrototype.mockClear();
  mocks.listRoomDesignScreens.mockClear();

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "conversation" }),
    }),
  );

  expect(mocks.getRoomPrototype).not.toHaveBeenCalled();
  expect(mocks.listRoomDesignScreens).not.toHaveBeenCalled();
});

it("makes the Prototype surface reachable before any screen is built once the Room reaches Design", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Fresh design room",
      ownerId,
      stage: "design",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId,
        userId: ownerId,
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    hasBuiltDesignScreen: false,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrototype.mockClear();
  mocks.listRoomDesignScreens.mockClear();
  mocks.screenComposer.mockClear();
  mocks.getRoomPrototype.mockResolvedValue(null);
  mocks.listRoomDesignScreens.mockResolvedValue([]);

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "prototype" }),
    }),
  );

  expect(mocks.getRoomPrototype).toHaveBeenCalledOnce();
  expect(mocks.listRoomDesignScreens).toHaveBeenCalledExactlyOnceWith(roomId);
  // The composer no longer renders on the Prototype surface.
  expect(mocks.screenComposer).not.toHaveBeenCalled();
  // Not rewritten back to conversation -- the requested "prototype" tab
  // resolved and stayed active even with zero built screens.
  expect(mocks.surfaceSync.mock.calls.at(-1)?.[0]).toMatchObject({
    replacementHref: undefined,
  });
});

it("keeps the PRD surface while its initial generation task is materializing", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Customer interviews",
      ownerId,
      stage: "discovery",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasPrdTask: true,
    activePrdTaskIds: ["70000000-0000-4000-8000-000000000001"],
    hasUserFlow: false,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrdHistory.mockResolvedValue([]);

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "prd" }),
    }),
  );

  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId,
    roomId,
    requestedSurface: "prd",
  });
  expect(mocks.surfaceSync.mock.calls.at(-1)?.[0]).toMatchObject({
    roomId,
    replacementHref: undefined,
  });
  expect(mocks.providerInitialActivePrdTaskIds).toEqual([
    "70000000-0000-4000-8000-000000000001",
  ]);
});

it("redirects to the workspace home instead of a 404 when the room is missing or deleted", async () => {
  mocks.getRoomPageData.mockResolvedValue(null);
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });

  await expect(
    RoomPage({
      params: Promise.resolve({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        roomId: "40000000-0000-4000-8000-000000000004",
      }),
      searchParams: Promise.resolve({}),
    }),
  ).rejects.toThrow("NEXT_REDIRECT");

  expect(mocks.redirect).toHaveBeenCalledWith(
    "/30000000-0000-4000-8000-000000000003",
  );
});

it("passes the latest PRD history and owner edit capabilities to the document", async () => {
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  const document = {
    title: "Checkout redesign",
    executiveSummary: "",
    problemAndEvidence: "",
    targetUsersAndUseCases: "",
    goalsNonGoalsAndMetrics: "",
    proposedSolution: "",
    userJourneys: null,
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    uxStatesAndEdgeCases: [],
    dependenciesAndConstraints: [],
    risksAndMitigations: [],
    mvpScope: { included: [], excluded: [] },
    acceptanceCriteria: [],
    openQuestions: [],
    decisionHistory: [],
  };
  const history = [
    {
      id: "50000000-0000-4000-8000-000000000002",
      roomId,
      version: 2,
      status: "draft" as const,
      document,
      ownerId,
      createdBy: ownerId,
      acceptedAt: null,
      acceptedBy: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    },
    {
      id: "50000000-0000-4000-8000-000000000001",
      roomId,
      version: 1,
      status: "draft" as const,
      document,
      ownerId,
      createdBy: ownerId,
      acceptedAt: null,
      acceptedBy: null,
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
    },
  ];
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId: "30000000-0000-4000-8000-000000000003",
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [
      {
        roomId,
        userId: ownerId,
        email: "owner@example.com",
        access: "edit",
      },
    ],
    messages: [],
    hasPrd: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrdHistory.mockResolvedValue(history);

  render(
    await RoomPage({
      params: Promise.resolve({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        roomId,
      }),
      searchParams: Promise.resolve({ tab: "prd" }),
    }),
  );

  expect(mocks.getRoomPrdHistory).toHaveBeenCalledWith({ roomId });
  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId: "30000000-0000-4000-8000-000000000003",
    roomId,
    requestedSurface: "prd",
  });
  expect(mocks.prdDocument.mock.calls[0]?.[0]).toMatchObject({
    prd: history[0],
    history,
    canEdit: true,
    canAccept: true,
    agentReadiness: READY_AGENT,
  });
});

it("uses the current PRD status on the Conversation tab", async () => {
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId: "30000000-0000-4000-8000-000000000003",
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrd.mockResolvedValue({ status: "accepted" });
  const historyCallCount = mocks.getRoomPrdHistory.mock.calls.length;

  render(
    await RoomPage({
      params: Promise.resolve({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        roomId,
      }),
      searchParams: Promise.resolve({ tab: "conversation" }),
    }),
  );

  expect(mocks.getRoomPrd).toHaveBeenCalledWith({ roomId });
  expect(mocks.getRoomPrdHistory.mock.calls).toHaveLength(historyCallCount);
  expect(mocks.providerPrdStatus).toBe("accepted");
});

it("allows workspace admins to accept a PRD without granting edit access", async () => {
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  const adminId = "20000000-0000-4000-8000-000000000002";
  const document = {
    title: "Checkout redesign",
    executiveSummary: "",
    problemAndEvidence: "",
    targetUsersAndUseCases: "",
    goalsNonGoalsAndMetrics: "",
    proposedSolution: "",
    userJourneys: null,
    functionalRequirements: [],
    nonFunctionalRequirements: [],
    uxStatesAndEdgeCases: [],
    dependenciesAndConstraints: [],
    risksAndMitigations: [],
    mvpScope: { included: [], excluded: [] },
    acceptanceCriteria: [],
    openQuestions: [],
    decisionHistory: [],
  };
  const history = [
    {
      id: "50000000-0000-4000-8000-000000000002",
      roomId,
      version: 2,
      status: "draft" as const,
      document,
      ownerId,
      createdBy: ownerId,
      acceptedAt: null,
      acceptedBy: null,
      createdAt: "2026-08-03T10:00:00.000Z",
      updatedAt: "2026-08-03T10:00:00.000Z",
    },
  ];
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId: "30000000-0000-4000-8000-000000000003",
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: adminId,
      email: "admin@example.com",
      name: "Admin Example",
    },
    participants: [
      {
        roomId,
        userId: adminId,
        email: "admin@example.com",
        access: "view",
      },
    ],
    messages: [],
    hasPrd: true,
    isCurrentUserWorkspaceAdmin: true,
    realtimeMode: "production",
  });
  mocks.getRoomPrdHistory.mockResolvedValue(history);

  render(
    await RoomPage({
      params: Promise.resolve({
        workspaceId: "30000000-0000-4000-8000-000000000003",
        roomId,
      }),
      searchParams: Promise.resolve({ tab: "prd" }),
    }),
  );

  expect(mocks.prdDocument.mock.calls.at(-1)?.[0]).toMatchObject({
    canEdit: false,
    canAccept: true,
  });
});

it("loads the PRD to seed the canvas but skips history/readiness on the User Flows tab", async () => {
  const previousFlag = process.env.MELD_USER_FLOW_TRIAL_ENABLED;
  process.env.MELD_USER_FLOW_TRIAL_ENABLED = "true";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId: "30000000-0000-4000-8000-000000000003",
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    // `add_room_owner_participant` inserts the owner as an `edit` participant,
    // and the canvas now reads that row rather than special-casing the owner --
    // the same rule `can_edit_room` applies.
    participants: [
      {
        roomId,
        userId: ownerId,
        access: "edit",
        email: "owner@example.com",
      },
    ],
    messages: [],
    hasPrd: true,
    hasUserFlow: true,
    activeUserFlowTaskIds: ["70000000-0000-4000-8000-000000000009"],
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrd.mockClear();
  mocks.getRoomPrdHistory.mockClear();
  mocks.getCurrentAgentReadiness.mockClear();
  mocks.readRoomCanvasScreens.mockClear();
  mocks.readRoomCanvasScreens.mockResolvedValue({
    ok: true,
    screens: [
      {
        id: "50000000-0000-4000-8000-000000000005",
        name: "Checkout",
        canvasX: 120,
        canvasY: 240,
        flowNodeId: null,
        state: "empty",
        screenKey: null,
        preview: null,
      },
    ],
  });

  try {
    render(
      await RoomPage({
        params: Promise.resolve({
          workspaceId: "30000000-0000-4000-8000-000000000003",
          roomId,
        }),
        searchParams: Promise.resolve({ tab: "user-flows" }),
      }),
    );
  } finally {
    if (previousFlag === undefined) delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
    else process.env.MELD_USER_FLOW_TRIAL_ENABLED = previousFlag;
  }

  expect(screen.getByText("User Flow canvas")).toBeInTheDocument();
  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId: "30000000-0000-4000-8000-000000000003",
    roomId,
    requestedSurface: "user-flows",
  });
  expect(mocks.userFlowTrialTab.mock.calls.at(-1)?.[0]).toMatchObject({
    initialGenerationTaskId: "70000000-0000-4000-8000-000000000009",
    canvasScreens: [
      expect.objectContaining({
        id: "50000000-0000-4000-8000-000000000005",
      }),
    ],
    canvasScreensAuthoritative: true,
  });
  // The PRD is loaded here now so the canvas can seed itself from the journey
  // flow; history and agent readiness stay PRD-tab-only.
  expect(mocks.getRoomPrd).toHaveBeenCalledWith({ roomId });
  expect(mocks.getRoomPrdHistory).not.toHaveBeenCalled();
  expect(mocks.getCurrentAgentReadiness).not.toHaveBeenCalled();
  expect(mocks.readRoomCanvasScreens).toHaveBeenCalledExactlyOnceWith(roomId);

  mocks.readRoomCanvasScreens.mockResolvedValue({ ok: false, screens: [] });
  process.env.MELD_USER_FLOW_TRIAL_ENABLED = "true";
  try {
    render(
      await RoomPage({
        params: Promise.resolve({
          workspaceId: "30000000-0000-4000-8000-000000000003",
          roomId,
        }),
        searchParams: Promise.resolve({ tab: "user-flows" }),
      }),
    );
  } finally {
    if (previousFlag === undefined) delete process.env.MELD_USER_FLOW_TRIAL_ENABLED;
    else process.env.MELD_USER_FLOW_TRIAL_ENABLED = previousFlag;
  }
  expect(mocks.userFlowTrialTab.mock.calls.at(-1)?.[0]).toMatchObject({
    canvasScreens: [],
    canvasScreensAuthoritative: false,
  });
});

it("does not read canvas screens while another surface is active", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.readRoomCanvasScreens.mockClear();

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "conversation" }),
    }),
  );

  expect(mocks.readRoomCanvasScreens).not.toHaveBeenCalled();
});

it("uses one unified read for Conversation content at a stale User Flows URL", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      name: "Customer interviews",
      ownerId,
      createdAt: "2026-07-25T00:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });

  mocks.getRoomPageData.mockClear();
  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "user-flows" }),
    }),
  );

  expect(mocks.getRoomPageData).toHaveBeenLastCalledWith({
    workspaceId,
    roomId,
    requestedSurface: "user-flows",
  });
  expect(mocks.getRoomPageData).toHaveBeenCalledTimes(1);
  expect(mocks.surfaceSync.mock.calls.at(-1)?.[0]).toMatchObject({
    roomId,
    replacementHref: `/${workspaceId}/rooms/${roomId}?tab=conversation`,
  });
});

it.each([
  ["prd", "a cancelled initial PRD task"],
  ["decisions", "deletion of the last decision"],
])(
  "falls back to Conversation after %s (%s)",
  async (tab) => {
    const workspaceId = "30000000-0000-4000-8000-000000000003";
    const roomId = "40000000-0000-4000-8000-000000000004";
    const ownerId = "10000000-0000-4000-8000-000000000001";
    mocks.getRoomPageData.mockResolvedValue({
      room: {
        id: roomId,
        workspaceId,
        projectId: "70000000-0000-4000-8000-000000000007",
        name: "Customer interviews",
        ownerId,
        stage: "discovery",
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
      currentUser: {
        id: ownerId,
        email: "owner@example.com",
        name: "Owner Example",
      },
      participants: [],
      messages: [],
      hasPrd: false,
      hasPrdTask: false,
      hasUserFlow: false,
      decisionCount: 0,
      isCurrentUserWorkspaceAdmin: false,
      realtimeMode: "production",
    });
    mocks.getRoomPageData.mockClear();
    mocks.conversation.mockClear();

    render(
      await RoomPage({
        params: Promise.resolve({ workspaceId, roomId }),
        searchParams: Promise.resolve({ tab }),
      }),
    );

    expect(mocks.conversation).toHaveBeenCalledOnce();
    expect(mocks.getRoomPageData).toHaveBeenCalledOnce();
    expect(mocks.getRoomPageData).toHaveBeenCalledWith({
      workspaceId,
      roomId,
      requestedSurface: tab,
    });
    expect(mocks.surfaceSync.mock.calls.at(-1)?.[0]).toMatchObject({
      roomId,
      replacementHref: `/${workspaceId}/rooms/${roomId}?tab=conversation`,
    });
  },
);

it("loads and renders the Decisions surface without an overview query", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  const decisions = [
    {
      id: "50000000-0000-4000-8000-000000000005",
      sourceMessageId: null,
      summary: "Use passkeys.",
      createdAt: "2026-08-10T12:00:00.000Z",
      createdByName: "owner@example.com",
    },
  ];
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Customer interviews",
      ownerId,
      stage: "define",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    decisionCount: 1,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.listRoomDecisions.mockResolvedValue(decisions);
  mocks.getRoomOverview.mockClear();

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "decisions" }),
    }),
  );

  expect(mocks.listRoomDecisions).toHaveBeenCalledWith(roomId);
  expect(mocks.decisionsSurface.mock.calls.at(-1)?.[0]).toMatchObject({
    decisions,
    basePath: `/${workspaceId}/rooms/${roomId}`,
  });
  expect(mocks.getRoomOverview).not.toHaveBeenCalled();
});

it("loads the deterministic Overview and forwards a source-message target", async () => {
  const workspaceId = "30000000-0000-4000-8000-000000000003";
  const roomId = "40000000-0000-4000-8000-000000000004";
  const ownerId = "10000000-0000-4000-8000-000000000001";
  const overview = {
    stage: "design" as const,
    latestActivityAt: "2026-08-10T12:00:00.000Z",
    participantCount: 2,
    participants: [],
    counts: { userFlows: 1, prds: 0, decisions: 1 },
    recentDecisions: [],
  };
  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Customer interviews",
      ownerId,
      stage: "design",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: true,
    decisionCount: 1,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomOverview.mockResolvedValue(overview);

  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({ tab: "overview" }),
    }),
  );

  expect(mocks.getRoomOverview).toHaveBeenCalledWith(roomId);
  expect(mocks.roomOverview.mock.calls.at(-1)?.[0]).toMatchObject({ overview });

  mocks.getRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      workspaceId,
      projectId: "70000000-0000-4000-8000-000000000007",
      name: "Customer interviews",
      ownerId,
      stage: "design",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-08-10T12:00:00.000Z",
    },
    currentUser: {
      id: ownerId,
      email: "owner@example.com",
      name: "Owner Example",
    },
    participants: [],
    messages: [],
    hasPrd: false,
    hasUserFlow: false,
    decisionCount: 0,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  const messageId = "50000000-0000-4000-8000-000000000005";
  render(
    await RoomPage({
      params: Promise.resolve({ workspaceId, roomId }),
      searchParams: Promise.resolve({
        tab: "conversation",
        message: messageId,
      }),
    }),
  );

  expect(mocks.conversation.mock.calls.at(-1)?.[0]).toMatchObject({
    focusedMessageId: messageId,
  });
});
