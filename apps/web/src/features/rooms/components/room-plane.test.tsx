// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { MeldNote } from "@/ui/meld/stack";
import { RoomPlane } from "./room-plane";
import { useRoomDock } from "./room-dock-context";
import { useRoomComposerContext } from "./room-composer-context";
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { DESIGN_SCREEN_GENERATION_TIMEOUT_MS } from "@/features/design/use-design-screen-generation";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  closeRoomTab: vi.fn(),
  createRoomTab: vi.fn(),
  renameRoomTab: vi.fn(),
  setRoomTabPanes: vi.fn(),
  toast: vi.fn(),
}));

// Same seam `prd-document.test.tsx` uses for the identical
// `useToast`/error-result convention.
vi.mock("@astryxdesign/core/Toast", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useToast: () => mocks.toast,
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
vi.mock("next/navigation", () => {
  // A stable object, constructed once here, not a fresh literal returned
  // from the hook on every call: the real `useRouter()` (Next's App Router)
  // returns the same router identity across re-renders, and
  // `RoomTaskStatusProvider`'s poller-restart effect depends on it. A fresh
  // object per call would make that effect think the router "changed" on
  // every render and keep restarting the poller regardless of whether
  // anything ever woke it -- silently papering over a missing
  // `notifyQueued()` call instead of requiring one, the way a real room
  // never would.
  const router = { refresh: mocks.refresh, replace: mocks.replace };
  return { useRouter: () => router };
});

// Every tool but `prototype` stays a plain stub -- their wiring is not what
// this suite exercises. `prototype` renders the real `PaneContent` so the
// starting-point buttons it hands to `PrototypeViewer`/`PrototypeEmptyState`
// actually exist to click: a stub here would let `RoomPlane` forget to merge
// `onStart`/`onFocusComposer` into `paneData.prototype` and nothing would
// notice.
vi.mock("./pane-content", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./pane-content")>();
  return {
    PANE_TITLES: { canvas: "Canvas", prototype: "Prototype", prd: "PRD" },
    PaneContent: (props: Parameters<typeof actual.PaneContent>[0]) =>
      props.tool === "prototype" ? (
        <actual.PaneContent {...props} />
      ) : (
        <MeldNote>{`${props.tool} body`}</MeldNote>
      ),
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  mocks.closeRoomTab.mockReset();
  mocks.replace.mockReset();
  mocks.createRoomTab.mockReset();
  mocks.renameRoomTab.mockReset();
  mocks.setRoomTabPanes.mockReset();
  mocks.refresh.mockReset();
  mocks.toast.mockReset();
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

// Stands in for `Conversation`, which is the actual (context-only) channel
// that reports unsent work upward -- see `room-dock-context.tsx`. Reports
// once on mount, the same shape `Conversation`'s own effect uses.
function UnsentWorkComposerStub({ hasUnsentWork }: { hasUnsentWork: boolean }) {
  // `RoomDockProvider`'s `value` is a fresh object every time `RoomPlane`
  // renders (it always has been), so depending on `dock` itself here would
  // re-fire this effect, and re-call the setter, on every single render of
  // the whole plane -- not infinitely (the setter is stable and the value
  // it's called with doesn't change), but there is no reason to invite the
  // extra churn. Reading `onUnsentWorkChange` off it once and depending on
  // that instead reports exactly once per `hasUnsentWork` value.
  const onUnsentWorkChange = useRoomDock()?.onUnsentWorkChange;
  useEffect(() => {
    onUnsentWorkChange?.(hasUnsentWork);
  }, [onUnsentWorkChange, hasUnsentWork]);
  return <div data-testid="room-chat-composer">stub composer</div>;
}

function fakeCanvasSelection(count: number): CanvasScreenSelection[] {
  return Array.from({ length: count }, (_, index) => ({
    targetScreenId: `screen-${index}`,
    frame: { x: 0, y: 0, w: 1, h: 1 },
    sketchShapes: [],
  }));
}

// Stands in for whatever Canvas pane publishes a selection -- the same
// context `collapsedLabel`'s screen count reads from. `setCanvasSelection`
// is read off the (unstable, freshly-built-every-render) composer context
// object once and depended on by itself, the same reasoning as
// `UnsentWorkComposerStub` above -- see its comment. Depending on the
// context object directly here is worse than merely redundant: each call
// hands `RoomPlane` a brand-new array, which is never `Object.is`-equal to
// the last one, so the state setter can never bail out, and the resulting
// re-render rebuilds this same unstable object, re-firing the effect again
// -- a genuine infinite loop, not just churn.
function CanvasSelectionStub({ count }: { count: number }) {
  const setCanvasSelection = useRoomComposerContext()?.setCanvasSelection;
  useEffect(() => {
    setCanvasSelection?.(fakeCanvasSelection(count));
  }, [setCanvasSelection, count]);
  return <div data-testid="room-chat-composer">stub composer</div>;
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

it("collapses the dock to a pill and expands it again from the pill", async () => {
  const user = userEvent.setup();
  renderPlane();

  // Expanded by default (see the dock-collapsed persistence test below) --
  // its own control is how you get back to the pill.
  await user.click(
    screen.getByRole("button", { name: "Collapse conversation" }),
  );
  const pill = screen.getByRole("button", { name: /Ask, design, or brainstorm/ });
  expect(pill).toBeInTheDocument();

  await user.click(pill);
  expect(
    screen.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Collapse conversation" }),
  ).toBeInTheDocument();
});

it("persists the collapsed pill across a reload, defaulting to expanded", () => {
  // No prior preference: a first-ever visit is not a pill hiding
  // `EmptyRoomStart`'s starter prompts behind it.
  const firstVisit = renderPlane();
  expect(
    firstVisit.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();
  firstVisit.unmount();

  window.localStorage.setItem("meld.room.dock-collapsed", "true");
  const reload = renderPlane();
  expect(
    reload.getByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).toBeInTheDocument();
});

it("refuses to collapse the dock while the composer has unsent draft text or a staged attachment", async () => {
  const user = userEvent.setup();
  renderPlane({
    conversation: <UnsentWorkComposerStub hasUnsentWork />,
  });

  const collapseControl = screen.getByRole("button", {
    name: "Collapse conversation",
  });
  // Hiding half-written work behind a pill reads as having lost it -- the
  // control refuses and says so (`aria-disabled` plus a `title`) rather than
  // silently doing nothing, which reads as broken instead of protective.
  expect(collapseControl).toHaveAttribute("aria-disabled", "true");
  expect(collapseControl).toHaveAttribute("title");

  await user.click(collapseControl);

  expect(
    screen.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Collapse conversation" }),
  ).toBeInTheDocument();
});

it("collapses once the composer reports no unsent work", async () => {
  const user = userEvent.setup();
  renderPlane({
    conversation: <UnsentWorkComposerStub hasUnsentWork={false} />,
  });

  await user.click(
    screen.getByRole("button", { name: "Collapse conversation" }),
  );

  expect(
    screen.getByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).toBeInTheDocument();
});

// The composer is showing with no transcript open by default (nothing here
// expands it), so this is exactly the composer-only state Escape is meant to
// collapse -- see `dock.tsx`'s Escape handler.
it("collapses the dock on Escape when the composer is the only thing showing", async () => {
  const user = userEvent.setup();
  renderPlane();

  expect(
    screen.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();

  await user.keyboard("{Escape}");

  expect(
    screen.getByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).toBeInTheDocument();
});

// Escape funnels through the same `collapseDock` the "Collapse conversation"
// control uses, so the unsent-work guard applies to it too -- Escape must
// not collapse over a draft any more than a click does.
it("does not collapse on Escape while the composer has unsent draft text or a staged attachment", async () => {
  const user = userEvent.setup();
  renderPlane({
    conversation: <UnsentWorkComposerStub hasUnsentWork />,
  });

  await user.keyboard("{Escape}");

  expect(
    screen.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();
});

// A concrete, real (not stand-in) dismissible surface, in its *closed*
// state: the prototype screen pill mounts a real Astryx `DropdownMenu`
// unconditionally, whether or not it is open (`DropdownMenu.tsx` never gates
// its `role="menu"` node on `isOpen` -- it hides a closed menu by putting
// `display: none` on an ancestor two levels up instead). A check that only
// looked at the `role="menu"` element's own computed style would misread
// this closed menu as open and refuse to collapse the dock forever, even
// with nothing on screen to protect. `dock.tsx`'s `hasOpenDismissibleSurface`
// has to walk ancestors to tell the two apart -- this is the discriminating
// case for that, not the (real-`DropdownMenu`-opened) case: `showPopover`'s
// visual effect on the ancestor relies on the native `:popover-open`
// pseudo-class, which jsdom does not implement, so an *opened* real
// `DropdownMenu` cannot be told apart from a closed one under jsdom at all --
// `prototype-screen-pill.test.tsx`'s own Escape-closes-the-menu test covers
// that side against a stub in isolation instead.
it("still collapses the dock on Escape when the prototype screen pill's menu is mounted but closed", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: "<html></html>",
        screenCount: 2,
        screens: [
          { id: "s1", name: "Register", formFactor: "desktop" },
          { id: "s2", name: "Sign In", formFactor: "desktop" },
        ],
      },
    },
  });

  // Never opened -- `DropdownMenu`'s `role="menu"` node is in the document
  // regardless.
  expect(screen.getByRole("menu", { hidden: true })).toBeInTheDocument();

  await user.keyboard("{Escape}");

  expect(
    screen.getByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).toBeInTheDocument();
});

it("labels the pill with a singular selection count", async () => {
  const user = userEvent.setup();
  renderPlane({ conversation: <CanvasSelectionStub count={1} /> });

  await user.click(
    screen.getByRole("button", { name: "Collapse conversation" }),
  );

  expect(
    screen.getByRole("button", { name: "1 screen selected · Ask, design, or brainstorm" }),
  ).toBeInTheDocument();
});

it("labels the pill with a plural selection count", async () => {
  const user = userEvent.setup();
  renderPlane({ conversation: <CanvasSelectionStub count={2} /> });

  await user.click(
    screen.getByRole("button", { name: "Collapse conversation" }),
  );

  expect(
    screen.getByRole("button", { name: "2 screens selected · Ask, design, or brainstorm" }),
  ).toBeInTheDocument();
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

// The empty prototype's whole purpose is to start work. A button that
// renders but does nothing is worse than the "No screens built yet" text it
// replaced -- see `PrototypeEmptyState`. This is also the regression test
// for the booleans/callbacks split: `hasUserFlow` comes from the server
// (`paneData.prototype`) while `onStart` is created here in `RoomPlane`. If
// a future edit passes the booleans through without merging the callback,
// the button still renders (nothing here checks for `onStart`) but clicking
// it calls nothing, and this assertion is what would catch that.
it("generates from the user flow when the empty prototype offers it", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  fireEvent.click(screen.getByRole("button", { name: /user flow/i }));

  await waitFor(() =>
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        instruction: "generate the first screen based on the userflow",
      }),
    ),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
});

it("generates from the PRD when the empty prototype offers it", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t2", screenId: "s2" });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: false,
        hasPrd: true,
      },
    },
    generateDesignScreen: generate,
  });

  fireEvent.click(
    screen.getByRole("button", { name: "Build a screen from your PRD" }),
  );

  await waitFor(() =>
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        instruction: "generate the first screen based on the PRD",
      }),
    ),
  );
});

// A failed generation is a resolved `{ status: "error" }`, not a throw --
// `generateDesignScreen` is a discriminated union, so this must be caught by
// narrowing on `status`, not by try/catch. Without handling it, the person
// clicks a starting-point button and the empty state just sits there: no
// toast, no refresh, no sign anything happened at all.
it("surfaces an error toast and does not refresh when generation fails", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "error", message: "We could not start screen generation." });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  fireEvent.click(screen.getByRole("button", { name: /user flow/i }));

  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith({
      type: "error",
      body: "We could not start screen generation.",
    }),
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});

// Generation is queued, not built -- `router.refresh()` right after queuing
// is a no-op, so the button has to say something happened itself, or the
// click looks like it did nothing for the 30-60s generation actually takes.
it("acknowledges the click and disables the starting points while generation is in flight", async () => {
  let resolveGenerate: (value: { status: "queued"; taskId: string; screenId: string }) => void =
    () => {};
  const generate = vi.fn(
    () =>
      new Promise<{ status: "queued"; taskId: string; screenId: string }>((resolve) => {
        resolveGenerate = resolve;
      }),
  );
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);

  await waitFor(() => expect(button).toBeDisabled());

  resolveGenerate({ status: "queued", taskId: "t1", screenId: "s1" });
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
});

// Two clicks landing before the button's own re-render disables it must not
// queue two generations -- disabling the button alone is not enough to close
// that window; the re-entrancy guard is what does.
it("does not queue a second generation from a rapid double click", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);
  fireEvent.click(button);

  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(generate).toHaveBeenCalledTimes(1);
});

// A failed generation has to hand the starting points back -- otherwise a
// person who hits an error can never retry.
it("re-enables the starting points after a failed generation", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "error", message: "We could not start screen generation." });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);

  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(button).not.toBeDisabled();
});

function designScreenTaskStatus(
  taskId: string,
  status: RoomTaskStatus["status"],
): RoomTaskStatus {
  return {
    taskId,
    sourceMessageId: null,
    initiatingUserId: "10000000-0000-4000-8000-000000000001",
    provider: "codex",
    kind: "design_screen_generate",
    agentKind: "design",
    status,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:01.000Z",
  };
}

// The immediate-enqueue-failure test above only covers `generateDesignScreen`
// itself rejecting synchronously. The queued task can still fail afterwards
// -- `useDesignScreenGeneration` (in `Conversation`, watching the same task
// through the room's shared task-status projection) gives up on it in three
// separate ways, and `router.refresh()` right after queuing cannot see any
// of them. This is the first: the task's own row reaching a terminal,
// non-"completed" status.
it("hands the starting points back once the queued task later settles as a failure", async () => {
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  // An empty-prototype room has no active task before the click -- this is
  // exactly the state `RoomTaskStatusPoller` goes idle in (see
  // `room-task-status.ts`'s `tick()`: `!hasActiveTask` clears `running` and
  // it stops rescheduling itself). Only `notifyQueued()` restarts it. The
  // first call below stands in for that idle initial poll; without
  // `notifyQueued()` in `startFromEmptyPrototype`, nothing would ever call
  // `fetchTaskStatuses` a second time and this test would time out on the
  // final `waitFor` below -- that is what makes this test actually exercise
  // the missing call, rather than passing regardless of it.
  let pollCount = 0;
  let hasFailed = false;
  const fetchTaskStatuses = vi.fn(async (): Promise<RoomTaskStatus[]> => {
    pollCount += 1;
    if (pollCount === 1) return [];
    return [designScreenTaskStatus("t1", hasFailed ? "failed" : "running")];
  });

  render(
    <RoomTaskStatusProvider
      roomId="room-1"
      fetchTaskStatuses={fetchTaskStatuses}
      taskPollIntervalMs={1}
    >
      <RoomPlane
        roomId="room-1"
        tabs={[{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }]}
        activeTabId="tab-1"
        hasOverview={false}
        canEdit
        paneData={{
          ...EMPTY_PANE_DATA,
          prototype: {
            html: null,
            screenCount: 0,
            screens: [],
            hasUserFlow: true,
            hasPrd: false,
          },
        }}
        conversation={<MeldNote>the conversation</MeldNote>}
        generateDesignScreen={generate}
      />
    </RoomTaskStatusProvider>,
  );

  // Lets the idle initial poll land before the click, matching the order a
  // real mount-then-click always happens in.
  await waitFor(() => expect(fetchTaskStatuses).toHaveBeenCalledTimes(1));

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);

  await waitFor(() => expect(button).toBeDisabled());
  // `notifyQueued()` having woken the poller: it is polling the task as
  // "running" now, not still idle from before the click.
  await waitFor(() =>
    expect(fetchTaskStatuses.mock.calls.length).toBeGreaterThanOrEqual(2),
  );

  hasFailed = true;
  await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
  expect(button).not.toBeDisabled();
});

// The second and third ways `useDesignScreenGeneration` gives up (polling
// attempts exhausted; the task reports "completed" but a version never
// materializes) never change the task's status row, so the effect above
// would never see either settle -- this bounded fallback is what still hands
// the starting points back in those cases, without a reload.
it("hands the starting points back if the task never settles at all", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);

  await waitFor(() => expect(button).toBeDisabled());

  await act(async () => {
    await vi.advanceTimersByTimeAsync(DESIGN_SCREEN_GENERATION_TIMEOUT_MS);
  });

  expect(mocks.toast).toHaveBeenCalled();
  expect(button).not.toBeDisabled();
  vi.useRealTimers();
});

// `RoomPlane` never unmounts across the `router.refresh()` that lands a
// successful generation -- there is no `key` on it in the room page, and a
// refresh preserves client state on purpose. Without clearing the flag (and
// its fallback timeout) on success, the timeout still fires ten minutes
// later and hands back a "did not finish in time" error for a screen
// already sitting on screen.
it("does not show a false failure toast once a queued generation actually succeeds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const generate = vi
    .fn()
    .mockResolvedValue({ status: "queued", taskId: "t1", screenId: "s1" });
  const view = renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: true,
        hasPrd: false,
      },
    },
    generateDesignScreen: generate,
  });

  const button = screen.getByRole("button", { name: /user flow/i });
  fireEvent.click(button);

  await waitFor(() => expect(button).toBeDisabled());

  // Stands in for the server re-render `router.refresh()` triggers once the
  // screen has actually materialized -- the same `RoomPlane` instance, a new
  // `paneData` prop.
  view.rerender(
    <RoomPlane
      roomId="room-1"
      tabs={[{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }]}
      activeTabId="tab-1"
      hasOverview={false}
      canEdit
      paneData={{
        ...EMPTY_PANE_DATA,
        prototype: {
          html: "<html></html>",
          screenCount: 1,
          screens: [{ id: "s1", name: "Screen 1", formFactor: "desktop" }],
        },
      }}
      conversation={<MeldNote>the conversation</MeldNote>}
      generateDesignScreen={generate}
    />,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(DESIGN_SCREEN_GENERATION_TIMEOUT_MS);
  });

  expect(mocks.toast).not.toHaveBeenCalled();
  vi.useRealTimers();
});

// `onFocusComposer` must expand a collapsed dock and then focus it, not
// merely focus a composer that is already hidden behind the pill -- Task 8
// fixed exactly this bug for the PRD "add to chat" flow. Wiring the empty
// prototype's "Describe a screen" button to the bare `focusDockComposer`
// (rather than `requestDockComposerFocus`) would reintroduce it: the click
// would silently do nothing while the dock stays collapsed.
it("expands the collapsed dock when the empty prototype has no starting point to offer", async () => {
  const user = userEvent.setup();
  renderPlane({
    tabs: [{ id: "tab-1", name: "Checkout", position: 0, panes: ["prototype"] }],
    paneData: {
      ...EMPTY_PANE_DATA,
      prototype: {
        html: null,
        screenCount: 0,
        screens: [],
        hasUserFlow: false,
        hasPrd: false,
      },
    },
  });

  await user.click(
    screen.getByRole("button", { name: "Collapse conversation" }),
  );
  expect(
    screen.getByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Describe a screen" }));

  expect(
    screen.queryByRole("button", { name: /Ask, design, or brainstorm/ }),
  ).not.toBeInTheDocument();
});
