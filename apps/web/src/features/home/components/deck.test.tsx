// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AttentionItem } from "../attention/types";
import { Deck } from "./deck";
import type { DeckProject } from "./project-column";

// `ProjectColumn` mounts `CreateProjectDialog`, which reads `useRouter()` on
// every render. There is no app router in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

function project(overrides: Partial<DeckProject> = {}): DeckProject {
  return {
    id: "p1",
    name: "Checkout redesign",
    color: "blue",
    roomCount: 3,
    latestRoomId: "room-9",
    updatedAt: "2026-08-20T10:00:00.000Z",
    isLive: true,
    unreadCount: 0,
    peekShape: "doc",
    ...overrides,
  };
}

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "a1",
    kind: "mention",
    title: "Reply to Ada",
    roomId: "room-9",
    roomName: "Guest flow",
    projectName: "Checkout",
    occurredAt: "2026-08-20T09:00:00.000Z",
    href: "/w1/rooms/room-9",
    ...overrides,
  };
}

it("shows the workspace, the ticket, the projects and the prompt", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[project()]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(screen.getAllByText("Nicholas' Studio").length).toBeGreaterThan(0);
  expect(screen.getByTestId("deck-ticket")).toBeInTheDocument();
  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

it("renders on the deck plane, not inside the sidebar shell", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByTestId("deck-frame")).toBeInTheDocument();
  expect(screen.getByTestId("deck-watermark")).toBeInTheDocument();
});

it("offers a way off the deck, since there is no sidebar here", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(
    screen.getByRole("link", { name: "Design system" }),
  ).toHaveAttribute("href", "/w1/design-system");
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
    "href",
    "/w1/settings/members",
  );
  // No "Archive": the design called for one, but no such route exists and a
  // link that 404s is worse than no link.
  expect(screen.queryByRole("link", { name: "Archive" })).toBeNull();
});

it("prints the pending work onto the ticket", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[item()]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("Reply to Ada")).toBeInTheDocument();
  expect(screen.queryByText("NOTHING PENDING")).not.toBeInTheDocument();
});

it("shows the shortcuts the deck actually binds", () => {
  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("⌘K")).toBeInTheDocument();
  expect(screen.getByText("Ask anything")).toBeInTheDocument();
  expect(screen.getByText("New project")).toBeInTheDocument();
});

it("only claims the design agent is drawing when it is", () => {
  const { unmount } = render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("DESIGN · IDLE")).toBeInTheDocument();
  unmount();

  render(
    <Deck
      workspaceId="w1"
      workspaceName="Nicholas' Studio"
      projects={[]}
      items={[]}
      printedOn={NOW}
      isAgentWorking
    />,
  );

  expect(screen.getByText("DESIGN · DRAWING")).toBeInTheDocument();
});
