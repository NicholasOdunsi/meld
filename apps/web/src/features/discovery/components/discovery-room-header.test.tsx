// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscoveryRoomHeader } from "./discovery-room-header";

const mocks = vi.hoisted(() => ({
  addRoomParticipant: vi.fn(),
  listRoomInviteCandidates: vi.fn(),
  removeRoomParticipant: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../actions", () => ({
  addRoomParticipant: mocks.addRoomParticipant,
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
  removeRoomParticipant: mocks.removeRoomParticipant,
}));

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";

beforeEach(() => {
  mocks.addRoomParticipant.mockReset();
  mocks.listRoomInviteCandidates.mockReset();
  mocks.removeRoomParticipant.mockReset();
  mocks.refresh.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([]);
  mocks.addRoomParticipant.mockResolvedValue(undefined);
  mocks.removeRoomParticipant.mockResolvedValue(undefined);
});

afterEach(cleanup);

function renderHeader() {
  return render(
    <DiscoveryRoomHeader
      roomName="Customer interviews"
      organizationId={ORGANIZATION_ID}
      roomId={ROOM_ID}
      ownerId="user-1"
      currentUserId="user-1"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
        {
          userId: "user-2",
          email: "maya@example.com",
          access: "view",
        },
        {
          userId: "user-3",
          email: "sam@example.com",
          access: "view",
        },
      ]}
    />,
  );
}

it("shows the people roster and opens the members modal", async () => {
  const user = userEvent.setup();

  renderHeader();

  expect(
    screen.getByRole("heading", { name: "Customer interviews" }),
  ).toBeVisible();
  expect(screen.getByTestId("discovery-room-icon")).toBeVisible();

  const trigger = screen.getByRole("button", {
    name: "5 room participants",
  });
  const visibleParticipants = within(
    screen.getByTestId("visible-room-participants"),
  );
  const visibleAvatars = visibleParticipants.getAllByRole("img");

  expect(visibleAvatars).toHaveLength(3);
  expect(visibleAvatars[0]).toHaveAccessibleName("owner@example.com");
  expect(visibleAvatars[1]).toHaveAccessibleName("Product Agent");
  expect(visibleAvatars[2]).toHaveAccessibleName("Research Agent");

  await user.click(trigger);

  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: "Members · 5" }),
  ).toBeVisible();
  expect(
    within(dialog).getByText(
      "People and agents in #customer-interviews",
    ),
  ).toBeVisible();
  expect(within(dialog).getByText("PEOPLE · 3")).toBeVisible();
  expect(within(dialog).getByText("AGENTS · 2")).toBeVisible();
  expect(
    within(dialog).getByRole("button", { name: "Invite" }),
  ).toBeEnabled();
  expect(within(dialog).getByText("Product Agent")).toBeInTheDocument();
  expect(within(dialog).getByText("Research Agent")).toBeInTheDocument();
  expect(within(dialog).getByText("owner@example.com")).toBeInTheDocument();
  expect(within(dialog).getByText("maya@example.com")).toBeInTheDocument();
  expect(within(dialog).getByText("sam@example.com")).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("button", {
      name: "Remove owner@example.com from room",
    }),
  ).not.toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", {
      name: "Remove maya@example.com from room",
    }),
  ).toBeEnabled();

  await user.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(dialog).not.toHaveAttribute("open");
});

it("removes a non-owner participant after confirmation", async () => {
  const user = userEvent.setup();

  renderHeader();
  await user.click(
    screen.getByRole("button", { name: "5 room participants" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Remove maya@example.com from room",
    }),
  );

  const alert = screen.getByRole("alertdialog");
  expect(alert).toHaveTextContent(
    "maya@example.com will lose access to this room and its contents.",
  );
  await user.click(
    within(alert).getByRole("button", { name: "Remove user" }),
  );

  expect(mocks.removeRoomParticipant).toHaveBeenCalledExactlyOnceWith({
    roomId: ROOM_ID,
    userId: "user-2",
  });
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

it("does not show removal controls to view-only participants", async () => {
  const user = userEvent.setup();

  render(
    <DiscoveryRoomHeader
      roomName="Customer interviews"
      organizationId={ORGANIZATION_ID}
      roomId={ROOM_ID}
      ownerId="user-1"
      currentUserId="user-2"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
        {
          userId: "user-2",
          email: "maya@example.com",
          access: "view",
        },
      ]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "4 room participants" }),
  );
  expect(
    screen.queryByRole("button", { name: /Remove .* from room/ }),
  ).not.toBeInTheDocument();
});

it("searches workspace members and invites selected people", async () => {
  const user = userEvent.setup();
  mocks.listRoomInviteCandidates.mockResolvedValue([
    { userId: "user-2", email: "maya@example.com" },
    { userId: "user-4", email: "ada@example.com" },
    { userId: "user-5", email: "rex@example.com" },
  ]);

  renderHeader();
  await user.click(
    screen.getByRole("button", { name: "5 room participants" }),
  );
  const dialog = screen.getByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Invite" }));

  expect(
    await within(dialog).findByRole("checkbox", { name: "ada@example.com" }),
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("checkbox", { name: "maya@example.com" }),
  ).not.toBeInTheDocument();
  expect(
    within(dialog).getByRole("checkbox", { name: "rex@example.com" }),
  ).toBeInTheDocument();

  await user.type(
    within(dialog).getByRole("textbox", { name: "Search people" }),
    "ada",
  );
  await user.click(
    within(dialog).getByRole("checkbox", { name: "ada@example.com" }),
  );
  expect(
    within(dialog).getByRole("combobox", {
      name: "Access for ada@example.com",
    }),
  ).toHaveTextContent("View only");
  await user.click(within(dialog).getByRole("button", { name: "Invite" }));

  expect(mocks.addRoomParticipant).toHaveBeenCalledExactlyOnceWith({
    roomId: ROOM_ID,
    userId: "user-4",
    access: "view",
  });
  expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith();
  expect(
    within(dialog).getByText("PEOPLE · 3"),
  ).toBeInTheDocument();
});

it("truncates a long room label in the members modal", async () => {
  const user = userEvent.setup();

  render(
    <DiscoveryRoomHeader
      roomName="Odunsi Nicholas Najsnajsjqsaajdqjdabjabdjajansja"
      organizationId={ORGANIZATION_ID}
      roomId={ROOM_ID}
      ownerId="user-1"
      currentUserId="user-1"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
      ]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "3 room participants" }),
  );

  expect(
    within(screen.getByRole("dialog")).getByText(
      "People and agents in #odunsi-nicholas-najsnaj…",
    ),
  ).toBeVisible();
});
