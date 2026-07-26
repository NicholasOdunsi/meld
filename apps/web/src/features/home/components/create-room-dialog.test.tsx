// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

const mocks = vi.hoisted(() => ({
  listRoomInviteCandidates: vi.fn(),
  createRoomWithParticipants: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/discovery/actions", () => ({
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
  createRoomWithParticipants: mocks.createRoomWithParticipants,
}));

import { CreateRoomDialog } from "./create-room-dialog";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const TEAMMATE = {
  userId: "10000000-0000-4000-8000-000000000002",
  email: "ada@example.com",
};

// jsdom does not implement the native dialog methods Astryx's Dialog calls.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  mocks.listRoomInviteCandidates.mockReset();
  mocks.createRoomWithParticipants.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([TEAMMATE]);
});

afterEach(cleanup);

// Mirrors StartingPoints: the dialog stays mounted and only isOpen toggles,
// so component state survives a close.
function Harness() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        reopen
      </button>
      <CreateRoomDialog
        organizationId={ORGANIZATION_ID}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}

it("creates a room with no one selected", async () => {
  const user = userEvent.setup();
  mocks.createRoomWithParticipants.mockResolvedValueOnce({
    roomId: "40000000-0000-4000-8000-000000000004",
    failedUserIds: [],
  });

  render(<Harness />);

  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Customer interviews",
  );
  await screen.findByRole("checkbox", { name: "ada@example.com" });
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(mocks.createRoomWithParticipants).toHaveBeenCalledWith({
    organizationId: ORGANIZATION_ID,
    name: "Customer interviews",
    participantUserIds: [],
  });
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});

it("includes a selected teammate as a room participant", async () => {
  const user = userEvent.setup();
  mocks.createRoomWithParticipants.mockResolvedValueOnce({
    roomId: "40000000-0000-4000-8000-000000000004",
    failedUserIds: [],
  });

  render(<Harness />);

  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Customer interviews",
  );
  await user.click(
    await screen.findByRole("checkbox", { name: "ada@example.com" }),
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(mocks.createRoomWithParticipants).toHaveBeenCalledWith({
    organizationId: ORGANIZATION_ID,
    name: "Customer interviews",
    participantUserIds: [TEAMMATE.userId],
  });
});

it("filters the people list as the user searches", async () => {
  const user = userEvent.setup();
  mocks.listRoomInviteCandidates.mockResolvedValue([
    TEAMMATE,
    { userId: "10000000-0000-4000-8000-000000000003", email: "rex@example.com" },
  ]);

  render(<Harness />);

  await screen.findByRole("checkbox", { name: "ada@example.com" });
  expect(
    screen.getByRole("checkbox", { name: "rex@example.com" }),
  ).toBeInTheDocument();

  await user.type(
    screen.getByRole("textbox", { name: "Search people and agents" }),
    "ada",
  );

  expect(
    screen.getByRole("checkbox", { name: "ada@example.com" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "rex@example.com" }),
  ).not.toBeInTheDocument();
});

it("shows the Product Agent and Research Agent as plain, unselectable rows", async () => {
  render(<Harness />);

  await screen.findByRole("checkbox", { name: "ada@example.com" });

  // Agents are not participants yet, so they render as plain rows: an
  // icon and a name, no checkbox, no "coming soon" copy cluttering the
  // list. Nothing here should be selectable.
  expect(screen.getByText("Product Agent")).toBeInTheDocument();
  expect(screen.getByText("Research Agent")).toBeInTheDocument();
  expect(
    screen.getByTestId("product-agent-avatar"),
  ).toBeInTheDocument();
  expect(
    screen.getByTestId("research-agent-avatar"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Product Agent" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Research Agent" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Agent participation is planned"),
  ).not.toBeInTheDocument();
});

it("surfaces an error banner and does not navigate when creation fails", async () => {
  const user = userEvent.setup();
  mocks.createRoomWithParticipants.mockRejectedValueOnce(
    new Error("That name is already taken."),
  );

  render(<Harness />);

  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Customer interviews",
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(
    await screen.findByText("That name is already taken."),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("starts fresh after a failed submit is closed and reopened", async () => {
  const user = userEvent.setup();
  mocks.createRoomWithParticipants.mockRejectedValueOnce(
    new Error("That name is already taken."),
  );

  render(<Harness />);

  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Customer interviews",
  );
  await user.click(
    await screen.findByRole("checkbox", { name: "ada@example.com" }),
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(
    await screen.findByText("That name is already taken."),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();

  // Close without succeeding, then reopen.
  await user.click(screen.getByRole("button", { name: /close/i }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  // The reopened dialog must be fresh: no stale error, no stale name,
  // no stale selection, and a fresh search box.
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByText("That name is already taken."),
  ).not.toBeInTheDocument();
  expect(
    within(dialog).getByRole("textbox", { name: "Name" }),
  ).toHaveValue("");
  expect(
    within(dialog).getByRole("textbox", {
      name: "Search people and agents",
    }),
  ).toHaveValue("");

  // A fresh submission must reach the action with the freshly typed name
  // and without the previously selected teammate.
  mocks.createRoomWithParticipants.mockResolvedValueOnce({
    roomId: "40000000-0000-4000-8000-000000000004",
    failedUserIds: [],
  });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Name" }),
    "Pricing research",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Create room" }),
  );

  expect(mocks.createRoomWithParticipants).toHaveBeenLastCalledWith({
    organizationId: ORGANIZATION_ID,
    name: "Pricing research",
    participantUserIds: [],
  });
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});
