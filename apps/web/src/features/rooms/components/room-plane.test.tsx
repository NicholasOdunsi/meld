// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VStack } from "@astryxdesign/core/VStack";
import { MeldNote } from "@/ui/meld/stack";
import { RoomPlane } from "./room-plane";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
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

// `RoomPlane` calls `router.refresh()` after placing a tool whose surface
// props the server render did not include. There is no App Router mounted in
// jsdom, so `useRouter` throws without this.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
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
  mocks.replace.mockReset();
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

/* Dragging is pointer events, not native DnD (see room-plane.tsx). jsdom has
 * no layout, so every zone (and the "+") gets a synthetic rect: zone i spans
 * x [i*100, i*100+90], the "+" lives at x [900, 940]. `pointerAt(index)`
 * returns coordinates inside zone `index`. */
function mockRects() {
  screen.queryAllByTestId("drop-zone").forEach((zone, index) => {
    zone.getBoundingClientRect = () =>
      ({ left: index * 100, right: index * 100 + 90, top: 0, bottom: 90,
         x: index * 100, y: 0, width: 90, height: 90, toJSON: () => ({}) }) as DOMRect;
  });
  const add = screen.queryByRole("button", { name: "New tab" });
  if (add) {
    add.getBoundingClientRect = () =>
      ({ left: 900, right: 940, top: 0, bottom: 40,
         x: 900, y: 0, width: 40, height: 40, toJSON: () => ({}) }) as DOMRect;
  }
}

function pointerAt(zoneIndex: number) {
  return { clientX: zoneIndex * 100 + 45, clientY: 45 };
}

function startDragging(element: HTMLElement) {
  fireEvent.pointerDown(element, { button: 0, clientX: 0, clientY: 500 });
  // Past the 6px threshold, away from every mocked rect.
  fireEvent.pointerMove(document, { clientX: 40, clientY: 500 });
  mockRects();
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

// The dock owns no composer any more -- `Conversation` renders the single
// real one and the dock only frames it -- so what this asserts now is that
// the conversation is mounted and reachable from the first paint, not that
// the plane supplies a field of its own.
it("starts an empty Room with the conversation already mounted", () => {
  renderPlane();

  expect(screen.queryByTestId("empty-room-plane")).toBeNull();
  expect(screen.getByTestId("dock")).toHaveAttribute("data-expanded", "false");
  expect(screen.getByText("the conversation")).toBeInTheDocument();
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

it("honours an explicit tab id over the Overview landing preference", () => {
  renderPlane({
    hasOverview: true,
    preferActiveTab: true,
    activeTabId: "tab-1",
  });

  expect(screen.getByRole("tab", { name: "Checkout" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
});

it("restores the full conversation from its explicit tab id", () => {
  renderPlane({
    activeTabId: "conversation",
    preferActiveTab: true,
  });

  expect(screen.getByRole("tab", { name: "Conversation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByTestId("dock")).toBeNull();
  expect(screen.getByText("the conversation")).toBeInTheDocument();
});

it("keeps a promoted conversation tab across a reload", async () => {
  const user = userEvent.setup();
  const basePath = "/workspace-1/rooms/room-1";
  window.localStorage.setItem("meld.room.dock-expanded", "true");
  window.history.replaceState({}, "", `${basePath}?tab=tab-1`);

  const firstRender = renderPlane({ basePath });
  // The dock starts life as a collapsed pill regardless of the persisted
  // transcript state -- expand it before its controls are reachable.
  await user.click(screen.getByRole("button", { name: /Ask anything/ }));
  await user.click(
    screen.getByRole("button", { name: "Open conversation in a tab" }),
  );

  expect(window.location.search).toBe("?tab=conversation");
  expect(mocks.replace).toHaveBeenCalledWith(
    `${basePath}?tab=conversation`,
    { scroll: false },
  );
  expect(screen.getByRole("tab", { name: "Conversation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  firstRender.unmount();
  renderPlane({ basePath, activeTabId: "conversation", preferActiveTab: true });

  expect(screen.getByRole("tab", { name: "Conversation" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByTestId("dock")).toBeNull();
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

// An unnamed, empty tab is named after a son of Ragnar by position rather
// than being a fifth thing called "Untitled" -- see `tab-naming.ts`. The
// created tab here is position 1, so it is the second name in birth order.
it("creates and activates a freshly named workstream from the plus button", async () => {
  const user = userEvent.setup();
  renderPlane();

  await user.click(screen.getByRole("button", { name: "New tab" }));

  expect(mocks.createRoomTab).toHaveBeenCalledWith({ roomId: "room-1" });
  expect(screen.getByRole("tab", { name: "Ubbe" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

it("upserts a create response when realtime already supplied the same tab", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-new", name: null, position: 1, panes: [] },
    ],
  });

  await user.click(screen.getByRole("button", { name: "New tab" }));

  expect(screen.getAllByRole("tab", { name: "Ubbe" })).toHaveLength(1);
});

it("restores an optimistically closed tab when persistence fails", async () => {
  const user = userEvent.setup();
  mocks.closeRoomTab.mockRejectedValueOnce(new Error("delete failed"));
  renderPlane({
    tabs: [
      { id: "tab-1", name: "Checkout", position: 0, panes: [] },
      { id: "tab-2", name: "Empty states", position: 1, panes: [] },
    ],
  });

  await user.click(screen.getByRole("button", { name: "Close Checkout" }));

  await waitFor(() => {
    expect(screen.getByRole("tab", { name: "Checkout" })).toBeInTheDocument();
  });
});

it("caps the Room at five work tabs plus the pinned Overview", () => {
  renderPlane({
    hasOverview: true,
    tabs: Array.from({ length: 5 }, (_, index) => ({
      id: `tab-${index + 1}`,
      name: `Work ${index + 1}`,
      position: index,
      panes: index === 0 ? (["prd"] as ["prd"]) : [],
    })),
  });

  expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
  expect(screen.getAllByRole("tab")).toHaveLength(6);
  expect(screen.queryByRole("button", { name: "New tab" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Open PRD in a new tab" }),
  ).toBeNull();
  expect(mocks.createRoomTab).not.toHaveBeenCalled();
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

  expect(screen.getByText("the conversation")).toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "Empty states" }));

  expect(screen.getByText("the conversation")).toBeInTheDocument();
});

// Ctrl+K reaches for the real composer inside `Conversation` by the test id
// that component sets. This suite stubs `Conversation` out, so it stands in
// with the same hook rather than asserting against a field the plane no
// longer owns.
it("focuses the room composer on Ctrl+K", async () => {
  const user = userEvent.setup();
  renderPlane({
    conversation: (
      <VStack data-testid="room-chat-composer">
        <input aria-label="Message or ask" />
      </VStack>
    ),
  });

  await user.keyboard("{Control>}k{/Control}");

  expect(screen.getByRole("textbox", { name: /message or ask/i })).toHaveFocus();
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

  startDragging(screen.getByRole("button", { name: "Prototype" }));

  expect(screen.getAllByTestId("drop-zone")).toHaveLength(3);
});

it("inserts a dragged tool at the highlighted zone", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging(screen.getByRole("button", { name: "PRD" }));
  fireEvent.pointerMove(document, pointerAt(0));
  fireEvent.pointerUp(document, pointerAt(0));

  expect(mocks.setRoomTabPanes).toHaveBeenCalledWith({
    tabId: "tab-1",
    panes: ["prd", "canvas"],
  });
});

it("highlights and announces the zone under the cursor", () => {
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["canvas"] }],
  });

  startDragging(screen.getByRole("button", { name: "PRD" }));
  fireEvent.pointerMove(document, pointerAt(1));
  const zones = screen.getAllByTestId("drop-zone");

  expect(zones[0]).toHaveAttribute("data-active", "false");
  expect(zones[1]).toHaveAttribute("data-active", "true");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Drop to open PRD on the right half",
  );
});

it("opens a new tab when a tool is dropped on the plus button", () => {
  renderPlane();

  startDragging(screen.getByRole("button", { name: "PRD" }));
  fireEvent.pointerMove(document, { clientX: 920, clientY: 20 });
  fireEvent.pointerUp(document, { clientX: 920, clientY: 20 });

  expect(mocks.createRoomTab).toHaveBeenCalledWith({
    roomId: "room-1",
    panes: ["prd"],
  });
});

it("cancels a drag on Escape without persisting a layout", async () => {
  const user = userEvent.setup();
  renderPlane();

  startDragging(screen.getByRole("button", { name: "PRD" }));
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

  // A pane drags from its HEADER (the body may hold a pointer-hungry app).
  const pane = screen.getByRole("region", { name: "PRD" });
  const header = pane.querySelector("header")!;
  startDragging(header as HTMLElement);
  fireEvent.pointerMove(document, pointerAt(0));
  fireEvent.pointerUp(document, pointerAt(0));

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
