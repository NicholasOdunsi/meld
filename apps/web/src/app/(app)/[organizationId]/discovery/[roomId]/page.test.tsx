// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscoveryRoomPageData: vi.fn(),
}));

vi.mock("@/features/discovery/queries", () => ({
  getDiscoveryRoomPageData: mocks.getDiscoveryRoomPageData,
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
  });

  render(
    await DiscoveryRoomPage({
      params: Promise.resolve({
        organizationId: "30000000-0000-4000-8000-000000000003",
        roomId: "40000000-0000-4000-8000-000000000004",
      }),
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
