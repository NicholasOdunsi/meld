// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// `ProjectColumn` always mounts `CreateProjectDialog` and `CreateRoomDialog`,
// both of which read `useRouter()` on every render (open or not) -- there is
// no app router in jsdom, so this needs the same mock `create-project-dialog
// .test.tsx` and `project-room-navigation.test.tsx` use. `CreateRoomDialog`
// also fetches invite candidates through a "use server" action module, which
// this mocks the same way `create-room-dialog.test.tsx` does.
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  listRoomInviteCandidates: vi.fn(),
  createRoomWithParticipants: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/rooms/actions", () => ({
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
  createRoomWithParticipants: mocks.createRoomWithParticipants,
}));

import { ProjectColumn, type DeckProject } from "./project-column";

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.listRoomInviteCandidates.mockReset();
  mocks.createRoomWithParticipants.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([]);
});

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

function project(overrides: Partial<DeckProject> = {}): DeckProject {
  return {
    id: "project-1",
    name: "Checkout redesign",
    color: "blue",
    roomCount: 3,
    latestRoomId: "room-9",
    updatedAt: "2026-08-20T10:00:00.000Z",
    isLive: false,
    unreadCount: 0,
    peekShape: "doc",
    ...overrides,
  };
}

it("links each tile to the project's most recent room", () => {
  render(
    <ProjectColumn workspaceId="w1" projects={[project()]} printedOn={NOW} />,
  );

  expect(
    screen.getByRole("link", { name: /Checkout redesign/ }),
  ).toHaveAttribute("href", "/w1/rooms/room-9");
});

it("does not link a project that has no rooms yet", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[
        project({ roomCount: 0, latestRoomId: null, updatedAt: null }),
      ]}
      printedOn={NOW}
    />,
  );

  expect(screen.queryByRole("link", { name: /Checkout redesign/ })).toBeNull();
  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
});

it("prints no age for a project with no activity to age", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[
        project({ roomCount: 0, latestRoomId: null, updatedAt: null }),
      ]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("0 rooms")).toBeInTheDocument();
  expect(screen.queryByText(/0 rooms · /)).not.toBeInTheDocument();
});

// The column heading and both creation buttons were stripped with the rest of
// the chrome. Asserted absent rather than deleted, so putting any of them back
// is deliberate.
it("carries no column heading or creation buttons", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[project(), project({ id: "project-2", name: "Growth" })]}
      printedOn={NOW}
    />,
  );

  expect(screen.queryByText("PROJECTS")).toBeNull();
  expect(screen.queryByRole("button", { name: "+ new project" })).toBeNull();
  expect(screen.queryByRole("button", { name: "+ room" })).toBeNull();
});

it("opens the create-project dialog on command-N", async () => {
  const user = userEvent.setup();
  render(<ProjectColumn workspaceId="w1" projects={[]} printedOn={NOW} />);

  expect(
    screen.queryByRole("textbox", { name: "Name" }),
  ).not.toBeInTheDocument();

  await user.keyboard("{Meta>}n{/Meta}");

  expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
});

