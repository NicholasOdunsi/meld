// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_A = "70000000-0000-4000-8000-000000000007";
const PROJECT_B = "80000000-0000-4000-8000-000000000008";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  moveRoom: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock("@/features/rooms/actions", () => ({
  moveRoom: mocks.moveRoom,
}));

import { MoveRoomDialog } from "./move-room-dialog";

const projects = [
  {
    id: PROJECT_A,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: OWNER_ID,
  },
  {
    id: PROJECT_B,
    workspaceId: WORKSPACE_ID,
    name: "Retention",
    createdBy: OWNER_ID,
  },
];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("moves the Room, opens the returned Project, closes, and refreshes", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const onMoved = vi.fn();
  mocks.moveRoom.mockResolvedValue(PROJECT_B);

  render(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{ id: ROOM_ID, name: "Interviews", projectId: PROJECT_A }}
      projects={projects}
      isOpen
      onOpenChange={onOpenChange}
      onMoved={onMoved}
    />,
  );

  await user.click(screen.getByRole("combobox", { name: "Project" }));
  expect(screen.queryByRole("option", { name: "Activation" })).toBeNull();
  await user.click(screen.getByRole("option", { name: "Retention" }));
  await user.click(screen.getByRole("button", { name: "Move room" }));

  expect(mocks.moveRoom).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    roomId: ROOM_ID,
    projectId: PROJECT_B,
  });
  expect(onMoved).toHaveBeenCalledWith(PROJECT_B);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("resets to the first destination when the target Room changes", () => {
  const { rerender } = render(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{ id: ROOM_ID, name: "Interviews", projectId: PROJECT_A }}
      projects={projects}
      isOpen
      onOpenChange={vi.fn()}
      onMoved={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent(
    "Retention",
  );

  rerender(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{
        id: "50000000-0000-4000-8000-000000000005",
        name: "Cohort review",
        projectId: PROJECT_B,
      }}
      projects={projects}
      isOpen
      onOpenChange={vi.fn()}
      onMoved={vi.fn()}
    />,
  );
  expect(screen.getByRole("combobox", { name: "Project" })).toHaveTextContent(
    "Activation",
  );

  rerender(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{
        id: "50000000-0000-4000-8000-000000000005",
        name: "Cohort review",
        projectId: PROJECT_B,
      }}
      projects={[projects[1]]}
      isOpen
      onOpenChange={vi.fn()}
      onMoved={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: "Move room" })).toBeDisabled();
});

it("disables movement when no destination Project exists", () => {
  render(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{ id: ROOM_ID, name: "Interviews", projectId: PROJECT_A }}
      projects={[projects[0]]}
      isOpen
      onOpenChange={vi.fn()}
      onMoved={vi.fn()}
    />,
  );

  expect(screen.getByRole("combobox", { name: "Project" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(screen.getByRole("button", { name: "Move room" })).toBeDisabled();
});

it("keeps failures actionable", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.moveRoom.mockRejectedValue(new Error("We could not move the room."));

  render(
    <MoveRoomDialog
      workspaceId={WORKSPACE_ID}
      room={{ id: ROOM_ID, name: "Interviews", projectId: PROJECT_A }}
      projects={projects}
      isOpen
      onOpenChange={onOpenChange}
      onMoved={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Move room" }));

  expect(await screen.findByText("We could not move the room.")).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
