// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscoveryRoomPageData: vi.fn(),
  getRoomPrdHistory: vi.fn(),
  prdDocument: vi.fn((_props: Record<string, unknown>) => null),
  redirect: vi.fn(),
}));

vi.mock("@/features/discovery/queries", () => ({
  getDiscoveryRoomPageData: mocks.getDiscoveryRoomPageData,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/features/prd/queries", () => ({
  getRoomPrdHistory: mocks.getRoomPrdHistory,
}));

vi.mock("@/features/prd/components/prd-document", () => ({
  PrdDocument: mocks.prdDocument,
}));

vi.mock("@/features/prd/components/prd-generating", () => ({
  PrdTabContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock(
  "@/features/discovery/components/discovery-room-header",
  () => ({
    DiscoveryRoomHeader: ({
      roomName,
    }: {
      roomName: string;
    }) => (
      <section data-testid="discovery-room-header">
        {roomName}
      </section>
    ),
  }),
);

vi.mock("@/features/discovery/components/conversation", () => ({
  Conversation: () => <p>Conversation</p>,
}));

vi.mock("@/features/prd/components/room-task-status-provider", () => ({
  RoomTaskStatusProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useRoomTaskStatus: () => null,
}));

vi.mock("@/features/discovery/e2e-gate", () => ({
  isDiscoveryFakeEnabled: () => false,
}));

import DiscoveryRoomPage from "./page";

it("renders a full-width room with a distinct main surface", async () => {
  mocks.getDiscoveryRoomPageData.mockResolvedValue({
    room: {
      id: "40000000-0000-4000-8000-000000000004",
      organizationId: "30000000-0000-4000-8000-000000000003",
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
    await DiscoveryRoomPage({
      params: Promise.resolve({
        organizationId: "30000000-0000-4000-8000-000000000003",
        roomId: "40000000-0000-4000-8000-000000000004",
      }),
      searchParams: Promise.resolve({}),
    }),
  );

  expect(screen.queryByLabelText("Room details")).not.toBeInTheDocument();
  expect(screen.getByTestId("discovery-room-header")).toHaveTextContent(
    "Customer interviews",
  );
  expect(screen.getByTestId("discovery-room-surface")).toHaveStyle({
    backgroundColor: "var(--color-background-body)",
  });
});

it("redirects to the organization home instead of a 404 when the room is missing or deleted", async () => {
  mocks.getDiscoveryRoomPageData.mockResolvedValue(null);
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });

  await expect(
    DiscoveryRoomPage({
      params: Promise.resolve({
        organizationId: "30000000-0000-4000-8000-000000000003",
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
  mocks.getDiscoveryRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      organizationId: "30000000-0000-4000-8000-000000000003",
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
    isCurrentUserOrgAdmin: false,
    realtimeMode: "production",
  });
  mocks.getRoomPrdHistory.mockResolvedValue(history);

  render(
    await DiscoveryRoomPage({
      params: Promise.resolve({
        organizationId: "30000000-0000-4000-8000-000000000003",
        roomId,
      }),
      searchParams: Promise.resolve({ tab: "prd" }),
    }),
  );

  expect(mocks.getRoomPrdHistory).toHaveBeenCalledWith({ roomId });
  expect(mocks.prdDocument.mock.calls[0]?.[0]).toMatchObject({
    prd: history[0],
    history,
    canEdit: true,
    canAccept: true,
  });
});

it("allows organization admins to accept a PRD without granting edit access", async () => {
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
  mocks.getDiscoveryRoomPageData.mockResolvedValue({
    room: {
      id: roomId,
      organizationId: "30000000-0000-4000-8000-000000000003",
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
    isCurrentUserOrgAdmin: true,
    realtimeMode: "production",
  });
  mocks.getRoomPrdHistory.mockResolvedValue(history);

  render(
    await DiscoveryRoomPage({
      params: Promise.resolve({
        organizationId: "30000000-0000-4000-8000-000000000003",
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
