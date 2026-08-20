// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeldNote } from "@/ui/meld/stack";
import { RoomPlane } from "./room-plane";

const mocks = vi.hoisted(() => ({
  closeRoomTab: vi.fn(),
  createRoomTab: vi.fn(),
  renameRoomTab: vi.fn(),
  setRoomTabPanes: vi.fn(),
}));

vi.mock("../actions", () => ({
  closeRoomTab: mocks.closeRoomTab,
  createRoomTab: mocks.createRoomTab,
  renameRoomTab: mocks.renameRoomTab,
  setRoomTabPanes: mocks.setRoomTabPanes,
}));

vi.mock("./pane-content", () => ({
  PANE_TITLES: { canvas: "Canvas", prototype: "Prototype", prd: "PRD" },
  PaneContent: ({ tool }: { tool: string }) => (
    <MeldNote>{`${tool} body`}</MeldNote>
  ),
}));

afterEach(cleanup);

beforeEach(() => {
  mocks.closeRoomTab.mockReset();
  mocks.createRoomTab.mockReset();
  mocks.renameRoomTab.mockReset();
  mocks.setRoomTabPanes.mockReset();
  mocks.closeRoomTab.mockResolvedValue(undefined);
  mocks.createRoomTab.mockResolvedValue({
    id: "tab-new",
    name: null,
    position: 1,
    panes: [],
  });
  mocks.renameRoomTab.mockResolvedValue(undefined);
  mocks.setRoomTabPanes.mockResolvedValue(undefined);
  window.localStorage.clear();
});

const EMPTY_PANE_DATA = { prd: null, prototype: null, canvas: null };

function renderPlane(
  overrides: Partial<Parameters<typeof RoomPlane>[0]> = {},
) {
  return render(
    <RoomPlane
      roomId="room-1"
      tabs={[{ id: "tab-1", name: "Checkout", position: 0, panes: [] }]}
      activeTabId="tab-1"
      hasOverview={false}
      canEdit
      paneData={EMPTY_PANE_DATA}
      conversation={<MeldNote>the conversation</MeldNote>}
      {...overrides}
    />,
  );
}

it("places a tool in the first free region when its row is pressed", async () => {
  const user = userEvent.setup();
  renderPlane();

  await user.click(screen.getByRole("button", { name: "PRD" }));

  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd"],
  });
});

it("focuses an already-open tool instead of opening it twice", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prd"] }],
  });

  await user.click(screen.getByRole("button", { name: "PRD" }));

  expect(screen.getAllByRole("region", { name: "PRD" })).toHaveLength(1);
  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
  expect(mocks.setRoomTabPanes).not.toHaveBeenCalled();
});

it("closes a pane and persists the reflowed layout", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await user.click(screen.getByRole("button", { name: "Close Canvas" }));

  expect(screen.queryByRole("region", { name: "Canvas" })).toBeNull();
  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd"],
  });
});

it("pops a pane out into a new tab holding only that tool", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await user.click(
    screen.getByRole("button", { name: "Open PRD in a new tab" }),
  );

  expect(mocks.createRoomTab).toHaveBeenCalledWith({
    roomId: "room-1",
    panes: ["prd"],
  });
});

it("gives a view-only participant no toolbar, creation, or pane controls", () => {
  renderPlane({
    canEdit: false,
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prd"] }],
  });

  expect(screen.queryByRole("button", { name: "PRD" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close PRD" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open PRD in a new tab" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "New tab" })).toBeNull();
  expect(screen.getByRole("region", { name: "PRD" })).toBeInTheDocument();
});

it("hides the close control on the last workstream tab", () => {
  renderPlane({ hasOverview: true });

  expect(screen.queryByRole("button", { name: "Close Checkout" })).toBeNull();
});

it("offers a close control once a second workstream tab exists", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-2", name: "Empty states", position: 1, panes: [] },
    ],
  });

  expect(
    screen.getByRole("button", { name: "Close Checkout" }),
  ).toBeInTheDocument();
});

it("creates and activates an untitled workstream from the plus button", async () => {
  const user = userEvent.setup();
  renderPlane();

  await user.click(screen.getByRole("button", { name: "New tab" }));

  expect(mocks.createRoomTab).toHaveBeenCalledWith({ roomId: "room-1" });
  expect(screen.getByRole("tab", { name: "Untitled" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("renames a workstream on double-click and persists the label", async () => {
  const user = userEvent.setup();
  renderPlane();

  await user.dblClick(screen.getByText("Checkout"));
  const input = screen.getByRole("textbox", { name: "Rename Checkout" });
  await user.clear(input);
  await user.type(input, "Cart flow");
  await user.keyboard("{Enter}");

  expect(mocks.renameRoomTab).toHaveBeenCalledWith({
    tabId: "tab-1",
    name: "Cart flow",
  });
  expect(screen.getByRole("tab", { name: "Cart flow" })).toBeInTheDocument();
});

it("keeps the same conversation when the tab changes", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-2", name: "Empty states", position: 1, panes: [] },
    ],
  });

  await user.click(screen.getByRole("button", { name: "Show conversation" }));
  expect(screen.getByText("the conversation")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Empty states" }));

  expect(screen.getByText("the conversation")).toBeInTheDocument();
});

it("focuses the dock composer on Ctrl+K", async () => {
  const user = userEvent.setup();
  renderPlane();

  await user.keyboard("{Control>}k{/Control}");

  expect(
    screen.getByRole("textbox", { name: /message or ask/i }),
  ).toHaveFocus();
});

it("focuses a pane by its region number", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await user.keyboard("{Control>}2{/Control}");

  expect(screen.getByRole("region", { name: "PRD" })).toHaveAttribute(
    "data-focused",
    "true",
  );
});

it("remembers the collapsed toolbar across mounts", async () => {
  const user = userEvent.setup();
  const { unmount } = renderPlane();

  await user.click(screen.getByRole("button", { name: "Collapse toolbar" }));
  unmount();
  renderPlane();

  expect(
    screen.getByRole("button", { name: "Expand toolbar" }),
  ).toBeInTheDocument();
});
