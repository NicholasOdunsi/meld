// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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

it("shows the count of projects", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[project(), project({ id: "project-2", name: "Growth" })]}
      printedOn={NOW}
    />,
  );

  expect(screen.getByText("PROJECTS")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

it("always offers a way to make a new project", () => {
  render(<ProjectColumn workspaceId="w1" projects={[]} printedOn={NOW} />);

  expect(
    screen.getByRole("button", { name: "+ new project" }),
  ).toBeInTheDocument();
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

it("gives every project a room-creation control, including one with no rooms yet", () => {
  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[
        project(),
        project({
          id: "project-2",
          name: "Growth",
          roomCount: 0,
          latestRoomId: null,
          updatedAt: null,
        }),
      ]}
      printedOn={NOW}
    />,
  );

  expect(screen.getAllByRole("button", { name: "+ room" })).toHaveLength(2);
});

it("does not nest the room-creation control inside the tile's link", () => {
  render(
    <ProjectColumn workspaceId="w1" projects={[project()]} printedOn={NOW} />,
  );

  const link = screen.getByRole("link", { name: /Checkout redesign/ });
  expect(
    within(link).queryByRole("button", { name: "+ room" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ room" })).toBeInTheDocument();
});

it("opens the create-room dialog for the project whose control was clicked", async () => {
  const user = userEvent.setup();
  mocks.createRoomWithParticipants.mockResolvedValueOnce({
    roomId: "room-77",
    destination: "/w1/rooms/room-77",
    failedUserIds: [],
  });

  render(
    <ProjectColumn
      workspaceId="w1"
      projects={[project(), project({ id: "project-2", name: "Growth" })]}
      printedOn={NOW}
    />,
  );

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  const [, secondProjectRoomButton] = screen.getAllByRole("button", {
    name: "+ room",
  });
  await user.click(secondProjectRoomButton);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Create Room")).toBeInTheDocument();

  await user.type(
    within(dialog).getByRole("textbox", { name: "Name" }),
    "New growth room",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Create room" }),
  );

  expect(mocks.createRoomWithParticipants).toHaveBeenCalledWith({
    workspaceId: "w1",
    projectId: "project-2",
    name: "New growth room",
    participants: [],
  });
});
