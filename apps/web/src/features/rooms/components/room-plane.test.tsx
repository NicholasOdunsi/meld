// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("../use-room-tabs-realtime", () => ({
  useRoomTabsRealtime: ({ initialTabs }: { initialTabs: unknown[] }) =>
    initialTabs,
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

function startDragging(toolLabel: string) {
  fireEvent.dragStart(screen.getByRole("button", { name: toolLabel }), {
    dataTransfer: {
      setData: vi.fn(),
      effectAllowed: "move",
    },
  });
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

it("shows no drop zones until a drag starts", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
});

it("offers one more candidate zone than the current pane count", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  startDragging("Prototype");

  expect(screen.getAllByTestId("drop-zone")).toHaveLength(3);
});

it("inserts a dragged tool at the highlighted zone", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging("PRD");
  const [firstZone] = screen.getAllByTestId("drop-zone");
  fireEvent.dragEnter(firstZone!);
  fireEvent.drop(firstZone!);

  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});

it("highlights and announces the zone under the cursor", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging("PRD");
  const zones = screen.getAllByTestId("drop-zone");
  fireEvent.dragEnter(zones[1]!);

  expect(zones[0]).toHaveAttribute("data-active", "false");
  expect(zones[1]).toHaveAttribute("data-active", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Drop to open PRD on the right half",
  );
});

it("opens a new tab when a tool is dropped on the plus button", () => {
  renderPlane();

  startDragging("PRD");
  fireEvent.drop(screen.getByRole("button", { name: "New tab" }));

  expect(mocks.createRoomTab).toHaveBeenCalledWith({
    roomId: "room-1",
    panes: ["prd"],
  });
});

it("cancels a drag on Escape without persisting a layout", async () => {
  const user = userEvent.setup();
  renderPlane();

  startDragging("PRD");
  await user.keyboard("{Escape}");

  expect(screen.queryAllByTestId("drop-zone")).toHaveLength(0);
  expect(mocks.setRoomTabPanes).not.toHaveBeenCalled();
});

it("moves a placed pane to another region by drag", () => {
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  fireEvent.dragStart(screen.getByRole("region", { name: "PRD" }), {
    dataTransfer: { setData: vi.fn(), effectAllowed: "move" },
  });
  const [firstZone] = screen.getAllByTestId("drop-zone");
  fireEvent.drop(firstZone!);

  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});

it("moves a placed pane from the keyboard menu", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: ["canvas", "prd"] },
    ],
  });

  await user.click(screen.getByRole("button", { name: "Move PRD" }));
  await user.click(
    screen.getByRole("menuitem", { name: "Move to the left half" }),
  );

  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});
