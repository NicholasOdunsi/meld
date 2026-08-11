// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRoomPageData: vi.fn(),
  getCurrentAgentReadiness: vi.fn(),
  getRoomPrd: vi.fn(),
  getRoomPrdHistory: vi.fn(),
  prdDocument: vi.fn((_props: Record<string, unknown>) => null),
  providerPrdStatus: undefined as string | null | undefined,
  redirect: vi.fn(),
}));

vi.mock("@/features/rooms/queries", () => ({
  getRoomPageData: mocks.getRoomPageData,
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
  UserFlowTrialTab: () => <p>User Flow canvas</p>,
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
  Conversation: () => <p>Conversation</p>,
}));

vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  RoomTaskStatusProvider: ({
    children,
    prdStatus,
  }: {
    children: ReactNode;
    prdStatus?: string | null;
  }) => {
    mocks.providerPrdStatus = prdStatus;
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
    includeMessages: true,
  });
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
    userJourneys: "",
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
    includeMessages: false,
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
    userJourneys: "",
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

it("does not load PRD or conversation data for the enabled User Flows tab", async () => {
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
    participants: [],
    messages: [],
    hasPrd: true,
    isCurrentUserWorkspaceAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrd.mockClear();
  mocks.getRoomPrdHistory.mockClear();
  mocks.getCurrentAgentReadiness.mockClear();

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
    includeMessages: false,
  });
  expect(mocks.getRoomPrd).not.toHaveBeenCalled();
  expect(mocks.getRoomPrdHistory).not.toHaveBeenCalled();
  expect(mocks.getCurrentAgentReadiness).not.toHaveBeenCalled();
});
