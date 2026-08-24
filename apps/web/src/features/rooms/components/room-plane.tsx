"use client";

import {
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import {
  generateDesignScreen as generateDesignScreenAction,
  type GenerateDesignScreenResult,
} from "@/features/design/design-screen-generation";
import { DESIGN_SCREEN_GENERATION_TIMEOUT_MS } from "@/features/design/use-design-screen-generation";
import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import { useRoomTaskStatus } from "@/features/prd/components/room-task-status-provider";
import { PixelClipboard, PixelCode, PixelPaintBrush } from "@/ui/pixel-icons";
import { MeldDock } from "@/ui/meld/dock";
import { RoomDockProvider } from "./room-dock-context";
import {
  RoomComposerProvider,
  type RoomComposerPrdSelection,
} from "./room-composer-context";
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";
import { MeldDropZone } from "@/ui/meld/drop-zone";
import { MeldPane } from "@/ui/meld/pane";
import { MeldPlane } from "@/ui/meld/plane";
import { MeldPlaneHints } from "@/ui/meld/plane-hints";
import { MeldTab, MeldTabStrip } from "@/ui/meld/tab-strip";
import { MeldToolbar, MeldToolbarItem } from "@/ui/meld/toolbar";
import { MeldNote } from "@/ui/meld/stack";
import {
  closeRoomTab,
  createRoomTab,
  renameRoomTab,
  setRoomTabPanes,
} from "../actions";
import {
  MAX_PANES,
  canPlace,
  insertPaneAt,
  layoutIsValid,
  movePane,
  paneRefusalReason,
  regionsFor,
  removePane,
  type PaneTool,
} from "../pane-layout";
import type { RoomTab } from "../room-tabs-repository";
import { MAX_ROOM_WORK_TABS } from "../room-tab-limit";
import { useRoomTabsRealtime } from "../use-room-tabs-realtime";
import { PANE_TITLES, PaneContent, type RoomPaneData } from "./pane-content";
import { tabDisplayName } from "../tab-naming";

const TOOLS: readonly PaneTool[] = ["canvas", "prototype", "prd"];

const TOOL_ICONS = {
  canvas: <PixelPaintBrush pack="filled" size="sm" aria-hidden="true" />,
  prototype: <PixelCode pack="filled" size="sm" aria-hidden="true" />,
  prd: <PixelClipboard pack="filled" size="sm" aria-hidden="true" />,
} as const;

const TOOLBAR_STORAGE_KEY = "meld.room.toolbar-collapsed";
const DOCK_STORAGE_KEY = "meld.room.dock-expanded";
const DOCK_COLLAPSED_STORAGE_KEY = "meld.room.dock-collapsed";
const CONVERSATION_TAB_ID = "conversation";
const PREFERENCE_EVENT_PREFIX = "meld.preference:";

type DragSource =
  | { kind: "tool"; tool: PaneTool }
  | { kind: "pane"; tool: PaneTool; fromIndex: number };

function readStorageBoolean(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeStorageBoolean(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Preferences are best effort. Room layout lives in the database.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(`${PREFERENCE_EVENT_PREFIX}${key}`));
  }
}

function subscribeToPreference(key: string, onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const eventName = `${PREFERENCE_EVENT_PREFIX}${key}`;
  const handleChange = () => onChange();
  window.addEventListener("storage", handleChange);
  window.addEventListener(eventName, handleChange);
  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(eventName, handleChange);
  };
}

function useStoredBoolean(key: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeToPreference(key, onChange),
    () => readStorageBoolean(key),
    () => false,
  );
}

function writeLastTab(roomId: string, tabId: string) {
  try {
    window.localStorage.setItem(`meld.room.${roomId}.last-tab`, tabId);
  } catch {
    // A blocked storage area must not stop a participant switching tabs.
  }
}

function writeTabLocation(
  basePath: string | undefined,
  tabId: string,
): string | null {
  if (typeof window === "undefined" || !basePath) return null;
  const params = new URLSearchParams(window.location.search);
  params.set("tab", tabId);
  const location = `${basePath}?${params.toString()}`;
  window.history.replaceState(
    window.history.state,
    "",
    location,
  );
  return location;
}

function firstLegalIndex(panes: PaneTool[], tool: PaneTool): number | null {
  if (!canPlace(panes, tool)) return null;
  for (let index = 0; index <= panes.length; index += 1) {
    if (paneRefusalReason(panes, tool, index) === null) return index;
  }
  return null;
}

/**
 * The layout that fits `tool` alongside the current panes, or `null` only at
 * true capacity.
 *
 * Preferred: append. If a minimum-region rule refuses every insertion point
 * (a canvas defending its half of the plane), the existing panes are
 * REORDERED rather than the new tool refused -- with three panes only index 0
 * is a half, so which tool sits first decides whether a third tool fits at
 * all. The toolbar used to surface that as a greyed-out row, which the
 * product owner explicitly did not want: nobody dragging a Prototype out
 * cares that the fix is "put the canvas first"; the plane should just do it.
 */
function arrangeWith(panes: PaneTool[], tool: PaneTool): PaneTool[] | null {
  if (panes.length >= MAX_PANES) return null;
  const index = firstLegalIndex(panes, tool);
  if (index !== null) return insertPaneAt(panes, tool, index);

  // Small search space (at most 4! = 24 orders), so brute force is honest.
  const all = [...panes, tool];
  const orders: PaneTool[][] = [];
  const permute = (rest: PaneTool[], acc: PaneTool[]) => {
    if (rest.length === 0) {
      orders.push(acc);
      return;
    }
    rest.forEach((item, i) =>
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, item]),
    );
  };
  permute(all, []);
  for (const order of orders) {
    if (layoutIsValid(order)) return order;
  }
  return null;
}


function zoneLabel(count: number, index: number): string {
  if (count === 1) return "the whole plane";
  if (count === 2) return index === 0 ? "the left half" : "the right half";
  if (count === 3) {
    if (index === 0) return "the left half";
    return index === 1 ? "the top-right half" : "the bottom-right half";
  }
  if (count === 4) {
    return (
      [
        "the top-left quarter",
        "the top-right quarter",
        "the bottom-left quarter",
        "the bottom-right quarter",
      ][index] ?? "the plane"
    );
  }
  return "the plane";
}

function layoutChanged(left: PaneTool[], right: PaneTool[]): boolean {
  return (
    left.length !== right.length ||
    left.some((pane, index) => pane !== right[index])
  );
}

function compareRoomTabs(left: RoomTab, right: RoomTab): number {
  if (left.position !== right.position) return left.position - right.position;
  return left.id.localeCompare(right.id);
}

function upsertRoomTab(tabs: RoomTab[], incoming: RoomTab): RoomTab[] {
  return [...tabs.filter((tab) => tab.id !== incoming.id), incoming].sort(
    compareRoomTabs,
  );
}

export type RoomPlaneProps = {
  roomId: string;
  basePath?: string;
  tabs: RoomTab[];
  activeTabId: string;
  hasOverview: boolean;
  canEdit: boolean;
  preferActiveTab?: boolean;
  paneData: RoomPaneData;
  conversation: ReactNode;
  overview?: ReactNode;
  realtimeEnabled?: boolean;
  // Defaults to the real server action. Overridable so tests can assert on
  // what the empty prototype's starting points are asked to generate
  // without hitting Supabase -- the same seam `conversation.tsx` uses for
  // `startUserFlow`.
  generateDesignScreen?: (input: {
    roomId: string;
    instruction: string;
  }) => Promise<GenerateDesignScreenResult>;
};

/**
 * Client shell for the freeform Room. It owns only personal chrome state and
 * optimistic tab/pane selection. The tab repository and existing Conversation
 * remain the durable boundaries; this component never rewrites their content.
 */
export function RoomPlane({
  roomId,
  basePath,
  tabs,
  activeTabId,
  hasOverview,
  canEdit,
  preferActiveTab = false,
  paneData,
  conversation,
  overview,
  realtimeEnabled = true,
  generateDesignScreen = generateDesignScreenAction,
}: RoomPlaneProps) {
  const router = useRouter();
  const toast = useToast();
  // The Room's `RoomTaskStatusProvider` always wraps `RoomPlane` in
  // production (see the room page) -- this reads the same shared projection
  // `Conversation`'s own `useDesignScreenGeneration` polls, so a task queued
  // here can be watched for a terminal failure without this component
  // running a second poller of its own.
  const roomTaskStatus = useRoomTaskStatus();
  const realtimeTabsSnapshot = useRoomTabsRealtime({
    roomId,
    initialTabs: tabs,
    enabled: realtimeEnabled,
  });
  const [pendingClosedTabIds, setPendingClosedTabIds] = useState<Set<string>>(
    () => new Set(),
  );
  const realtimeTabs = useMemo(
    () =>
      realtimeTabsSnapshot.filter((tab) => !pendingClosedTabIds.has(tab.id)),
    [pendingClosedTabIds, realtimeTabsSnapshot],
  );

  useEffect(() => {
    setPendingClosedTabIds((current) => {
      if (current.size === 0) return current;
      const serverIds = new Set(realtimeTabsSnapshot.map((tab) => tab.id));
      const next = new Set(
        [...current].filter((tabId) => serverIds.has(tabId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [realtimeTabsSnapshot]);

  const tabsKey = JSON.stringify(realtimeTabs);
  const [localTabsState, setLocalTabsState] = useState<{
    sourceKey: string;
    tabs: RoomTab[];
  }>({ sourceKey: tabsKey, tabs: realtimeTabs });
  const localTabs =
    localTabsState.sourceKey === tabsKey ? localTabsState.tabs : realtimeTabs;
  const updateLocalTabs = useCallback(
    (update: (current: RoomTab[]) => RoomTab[]) => {
      setLocalTabsState((current) => {
        const base =
          current.sourceKey === tabsKey ? current.tabs : realtimeTabs;
        return { sourceKey: tabsKey, tabs: update(base) };
      });
    },
    [realtimeTabs, tabsKey],
  );
  const [selectedTabId, setSelectedTabId] = useState(() =>
    preferActiveTab ? activeTabId : hasOverview ? "overview" : activeTabId,
  );
  const restoredLastTabRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (restoredLastTabRoomIdRef.current === roomId) return;
    restoredLastTabRoomIdRef.current = roomId;
    if (preferActiveTab) return;

    try {
      const stored = window.localStorage.getItem(
        `meld.room.${roomId}.last-tab`,
      );
      if (
        stored &&
        (stored === "overview" ||
          stored === CONVERSATION_TAB_ID ||
          realtimeTabs.some((tab) => tab.id === stored)) &&
        (stored !== "overview" || hasOverview)
      ) {
        setSelectedTabId(stored);
      }
    } catch {
      // The server-selected tab remains active when storage is unavailable.
    }
  }, [hasOverview, preferActiveTab, realtimeTabs, roomId]);
  const activateTab = useCallback(
    (tabId: string) => {
      setSelectedTabId(tabId);
      writeLastTab(roomId, tabId);
      const location = writeTabLocation(basePath, tabId);
      if (location) router.replace(location, { scroll: false });
    },
    [basePath, roomId, router],
  );
  const [focusedTool, setFocusedTool] = useState<PaneTool | null>(null);
  const [composerPrdSelection, setComposerPrdSelection] =
    useState<RoomComposerPrdSelection | null>(null);
  // Which screens a Canvas pane currently has selected. Held here, above both
  // panes, because the surface with the selection and the composer that acts
  // on it are siblings -- exactly the reason the PRD selection above lives
  // here too.
  const [composerCanvasSelection, setComposerCanvasSelection] = useState<
    CanvasScreenSelection[]
  >([]);
  const [composerCanvasScreenNames, setComposerCanvasScreenNames] = useState<
    Map<string, string>
  >(() => new Map());
  const isToolbarCollapsed = useStoredBoolean(TOOLBAR_STORAGE_KEY);
  // Session state, not a stored preference: the transcript opens when you
  // type (the real composer reports that through `RoomDockProvider`) and
  // closes on Escape. `DOCK_STORAGE_KEY` seeds the first render so a reload
  // mid-conversation does not slam it shut.
  const storedDockExpanded = useStoredBoolean(DOCK_STORAGE_KEY);
  const [dockExpandedOverride, setDockExpandedOverride] = useState<
    boolean | null
  >(null);
  const isDockExpanded = dockExpandedOverride ?? storedDockExpanded;
  // The dock's third, lower state: a page-level pill, one no matter how many
  // panes are open. Persisted like `isDockExpanded` -- a reload should not
  // silently swap the composer for a pill either. Defaults to expanded (not
  // collapsed): the pill exists so the composer can stop covering the
  // prototype, not so a new, empty room loads looking like it has nothing in
  // it, with `EmptyRoomStart`'s own starter prompts hidden behind a pill.
  const storedDockCollapsed = useStoredBoolean(DOCK_COLLAPSED_STORAGE_KEY);
  const [dockCollapsedOverride, setDockCollapsedOverride] = useState<
    boolean | null
  >(null);
  const isDockCollapsed = dockCollapsedOverride ?? storedDockCollapsed;
  // Reported by `Conversation` through `RoomDockProvider`: whether the
  // composer holds draft text or a staged attachment it has not sent yet.
  const [hasUnsentWork, setHasUnsentWork] = useState(false);
  const collapsedLabel =
    composerCanvasSelection.length > 0
      ? `${composerCanvasSelection.length} screen${composerCanvasSelection.length === 1 ? "" : "s"} selected · Ask anything`
      : "Ask anything";
  // The conversation can be promoted from the dock onto its own personal tab.
  // It remains outside the shared room_tabs rows because opening it is not a
  // change for collaborators. Persist its presence separately from the active
  // tab: the active URL says what is selected, while this preference says the
  // personal tab should still exist after a reload.
  const conversationTabStorageKey = `meld.room.${roomId}.conversation-tab-open`;
  const storedConversationTabOpen = useStoredBoolean(
    conversationTabStorageKey,
  );
  const [conversationTabOpenOverride, setConversationTabOpenOverride] =
    useState<boolean | null>(null);
  const routeKeepsConversationOpen =
    activeTabId === CONVERSATION_TAB_ID ||
    selectedTabId === CONVERSATION_TAB_ID;
  const isConversationTabOpen =
    conversationTabOpenOverride ??
    (routeKeepsConversationOpen || storedConversationTabOpen);
  useEffect(() => {
    if (
      conversationTabOpenOverride !== false &&
      routeKeepsConversationOpen &&
      !storedConversationTabOpen
    ) {
      writeStorageBoolean(conversationTabStorageKey, true);
    }
  }, [
    conversationTabOpenOverride,
    conversationTabStorageKey,
    routeKeepsConversationOpen,
    storedConversationTabOpen,
  ]);
  const setDockExpanded = useCallback((expanded: boolean) => {
    setDockExpandedOverride(expanded);
    writeStorageBoolean(DOCK_STORAGE_KEY, expanded);
  }, []);
  const setDockCollapsedPersisted = useCallback((collapsed: boolean) => {
    setDockCollapsedOverride(collapsed);
    writeStorageBoolean(DOCK_COLLAPSED_STORAGE_KEY, collapsed);
  }, []);
  const openConversationTab = useCallback(() => {
    writeStorageBoolean(conversationTabStorageKey, true);
    setConversationTabOpenOverride(true);
    activateTab(CONVERSATION_TAB_ID);
  }, [activateTab, conversationTabStorageKey]);

  const closeConversationTab = useCallback(() => {
    writeStorageBoolean(conversationTabStorageKey, false);
    setConversationTabOpenOverride(false);
    // Fall back to whatever tab the room would have shown anyway. Leaving
    // `selectedTabId` pointing at a tab that no longer exists would resolve
    // to the first workstream on the next render, which is the same
    // destination -- but going there explicitly keeps the strip's selected
    // state and the plane in step within this render.
    if (selectedTabId === CONVERSATION_TAB_ID) {
      activateTab(hasOverview ? "overview" : localTabs[0]?.id ?? "");
    }
  }, [
    activateTab,
    conversationTabStorageKey,
    hasOverview,
    localTabs,
    selectedTabId,
  ]);

  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [activeZone, setActiveZone] = useState<number | null>(null);

  const resolvedTabId =
    selectedTabId === "overview" && hasOverview
      ? "overview"
      : selectedTabId === CONVERSATION_TAB_ID && isConversationTabOpen
        ? CONVERSATION_TAB_ID
        : localTabs.some((tab) => tab.id === selectedTabId)
          ? selectedTabId
          : localTabs[0]?.id ?? "";
  const activeTab = localTabs.find((tab) => tab.id === resolvedTabId);
  const isConversationTab = resolvedTabId === CONVERSATION_TAB_ID;
  const isOverview = resolvedTabId === "overview";

  const incomingPanes = isOverview || isConversationTab ? [] : activeTab?.panes ?? [];
  const paneKey = `${tabsKey}:${resolvedTabId}`;
  const [paneState, setPaneState] = useState<{
    sourceKey: string;
    panes: PaneTool[];
  }>({ sourceKey: paneKey, panes: incomingPanes });
  const panes = paneState.sourceKey === paneKey ? paneState.panes : incomingPanes;
  const commitLocalPanes = useCallback(
    (next: PaneTool[]) => {
      setPaneState({ sourceKey: paneKey, panes: next });
    },
    [paneKey],
  );

  const regions = useMemo(() => regionsFor(panes.length), [panes.length]);
  const workstreamCount = localTabs.length;
  const zoneCount = dragging
    ? dragging.kind === "pane"
      ? panes.length
      : panes.length + 1
    : 0;
  const zoneRegions =
    dragging && zoneCount <= MAX_PANES ? regionsFor(zoneCount) : [];

  // A tool's surface props (`paneData`) are built by the server component from
  // the tab's panes AS THEY WERE ON LOAD. Placing a tool the server did not
  // know about therefore leaves `paneData[tool] === undefined`, and the pane
  // shows its "nothing here yet" state permanently -- the data exists, the
  // page just never asked for it. Dragging a Canvas out and being told to ask
  // for a Canvas was exactly this.
  const lacksServerProps = useCallback(
    (tools: PaneTool[]) => tools.some((tool) => paneData[tool] === undefined),
    [paneData],
  );

  const commitPanes = useCallback(
    (next: PaneTool[]) => {
      if (!activeTab) return;
      commitLocalPanes(next);
      updateLocalTabs((current) =>
        current.map((tab) =>
          tab.id === activeTab.id ? { ...tab, panes: [...next] } : tab,
        ),
      );
      void setRoomTabPanes({ tabId: activeTab.id, panes: next })
        .then(() => {
          // Only when something on the plane is actually missing its props --
          // moving or closing a pane needs no new data, and refreshing on
          // every layout change would re-run every query in the page.
          // Cannot loop: this fires on a pane commit, not on a render, so a
          // tool whose artifact genuinely does not exist just stays empty.
          if (lacksServerProps(next)) router.refresh();
        })
        .catch(() => {
          // The realtime/server snapshot remains authoritative after a failed
          // write; the optimistic state keeps the interaction responsive.
        });
    },
    [activeTab, commitLocalPanes, lacksServerProps, router, updateLocalTabs],
  );

  const place = useCallback(
    (tool: PaneTool) => {
      if (panes.includes(tool)) {
        setFocusedTool(tool);
        return;
      }
      const next = arrangeWith(panes, tool);
      if (next === null || next.length === panes.length) return;
      commitPanes(next);
      setFocusedTool(tool);
    },
    [commitPanes, panes],
  );

  const closePane = useCallback(
    (tool: PaneTool) => {
      if (!canEdit) return;
      const next = removePane(panes, tool);
      commitPanes(next);
      setFocusedTool((current) =>
        current === tool ? next[0] ?? null : current,
      );
    },
    [canEdit, commitPanes, panes],
  );

  const openNewTab = useCallback(async () => {
    if (!canEdit || workstreamCount >= MAX_ROOM_WORK_TABS) return;
    try {
      const created = await createRoomTab({ roomId });
      updateLocalTabs((current) => upsertRoomTab(current, created));
      activateTab(created.id);
    } catch {
      // The existing tab remains usable if persistence is unavailable.
    }
  }, [activateTab, canEdit, roomId, updateLocalTabs, workstreamCount]);

  const popOut = useCallback(
    async (tool: PaneTool) => {
      if (!canEdit || workstreamCount >= MAX_ROOM_WORK_TABS) return;
      try {
        const created = await createRoomTab({ roomId, panes: [tool] });
        updateLocalTabs((current) => upsertRoomTab(current, created));
        activateTab(created.id);
      } catch {
        // A failed pop-out leaves the current pane in place.
      }
    },
    [activateTab, canEdit, roomId, updateLocalTabs, workstreamCount],
  );

  const clearDrag = useCallback(() => {
    setDragging(null);
    setActiveZone(null);
  }, []);

  /* Dragging is pointer events, not native HTML5 drag-and-drop.
   *
   * Native DnD was tried and failed unevenly across Chromium-family browsers
   * once a pane held an embedded app: in Arc the same gesture produced a
   * ghost-but-no-drop on one tab and no drag at all on another. Pointer
   * events have none of that variance -- no dataTransfer, no ghost image, no
   * browser-specific rules about which elements may be drag sources.
   *
   * The engine: pointerdown on a source arms a pending drag; crossing a small
   * threshold starts it (so plain clicks stay clicks); while dragging, the
   * active zone comes from hit-testing the pointer against the live zone
   * rects; pointerup over a zone drops, over the "+" pops the tool into a new
   * tab, anywhere else cancels. Document-level listeners, so the drag
   * survives leaving the plane. */
  const pendingDragRef = useRef<{
    source: DragSource;
    startX: number;
    startY: number;
  } | null>(null);
  const draggingRef = useRef<DragSource | null>(null);
  const suppressClickRef = useRef(false);

  const beginPointerDrag = useCallback(
    (source: DragSource, event: ReactPointerEvent<HTMLElement>) => {
      // Left button / primary touch only, and never for view-only rooms.
      if (event.button !== 0 || !canEdit) return;
      pendingDragRef.current = {
        source,
        startX: event.clientX,
        startY: event.clientY,
      };
    },
    [canEdit],
  );

  useEffect(() => {
    const DRAG_THRESHOLD_PX = 6;

    const zoneUnder = (x: number, y: number): number | null => {
      const zones = document.querySelectorAll<HTMLElement>(
        '[data-testid="drop-zone"]',
      );
      for (let index = 0; index < zones.length; index += 1) {
        const rect = zones[index]!.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return index;
        }
      }
      return null;
    };

    const overAdd = (x: number, y: number): boolean => {
      const add = document.querySelector<HTMLElement>('[aria-label="New tab"]');
      if (!add) return false;
      const rect = add.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !draggingRef.current) {
        const moved =
          Math.abs(event.clientX - pending.startX) +
          Math.abs(event.clientY - pending.startY);
        if (moved < DRAG_THRESHOLD_PX) return;
        draggingRef.current = pending.source;
        suppressClickRef.current = true;
        setDragging(pending.source);
        setActiveZone(null);
        // Mid-gesture text selection is the one native behaviour worth
        // suppressing by hand now that no native drag does it for us.
        document.body.style.userSelect = "none";
      }
      if (!draggingRef.current) return;
      setActiveZone(zoneUnder(event.clientX, event.clientY));
    };

    const endDrag = () => {
      pendingDragRef.current = null;
      draggingRef.current = null;
      document.body.style.userSelect = "";
    };

    const onPointerUp = (event: PointerEvent) => {
      const source = draggingRef.current;
      if (!source) {
        pendingDragRef.current = null;
        return;
      }
      const zone = zoneUnder(event.clientX, event.clientY);
      if (zone !== null) {
        dropAtRef.current(zone);
      } else if (overAdd(event.clientX, event.clientY)) {
        popOutRef.current(source.tool);
        clearDrag();
      } else {
        clearDrag();
      }
      endDrag();
    };

    const onPointerCancel = () => {
      if (draggingRef.current) clearDrag();
      endDrag();
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [canEdit, clearDrag]);

  const startToolDrag = useCallback(
    (tool: PaneTool, event: ReactPointerEvent<HTMLElement>) => {
      const fromIndex = panes.indexOf(tool);
      beginPointerDrag(
        fromIndex >= 0
          ? { kind: "pane", tool, fromIndex }
          : { kind: "tool", tool },
        event,
      );
    },
    [beginPointerDrag, panes],
  );

  const startPaneDrag = useCallback(
    (tool: PaneTool, fromIndex: number, event: ReactPointerEvent<HTMLElement>) => {
      beginPointerDrag({ kind: "pane", tool, fromIndex }, event);
    },
    [beginPointerDrag],
  );

  const movePlacedPane = useCallback(
    (fromIndex: number, toIndex: number) => {
      const next = movePane(panes, fromIndex, toIndex);
      if (layoutChanged(panes, next)) {
        commitPanes(next);
        setFocusedTool(panes[fromIndex] ?? null);
      }
    },
    [commitPanes, panes],
  );

  // The document-level pointer listeners subscribe once; these refs hand them
  // the newest callbacks without tearing the listeners down every render.
  const dropAtRef = useRef<(index: number) => void>(() => undefined);
  const popOutRef = useRef<(tool: PaneTool) => Promise<void> | void>(
    () => undefined,
  );

  const dropAt = useCallback(
    (index: number) => {
      const source = dragging ?? draggingRef.current;
      if (!source) return;
      // Same fallback the click path has: if the chosen zone would squeeze a
      // pane below its minimum region (`insertPaneAt` returns the layout
      // unchanged), reorder rather than silently doing nothing -- a drop
      // that no-ops reads as "dragging is broken", not as a refusal.
      const inserted =
        source.kind === "tool" ? insertPaneAt(panes, source.tool, index) : null;
      const next =
        source.kind === "tool"
          ? inserted!.length !== panes.length
            ? inserted!
            : arrangeWith(panes, source.tool) ?? panes
          : movePane(panes, source.fromIndex, index);
      if (layoutChanged(panes, next)) {
        commitPanes(next);
        setFocusedTool(source.tool);
      }
      clearDrag();
    },
    [clearDrag, commitPanes, dragging, panes],
  );

  useEffect(() => {
    dropAtRef.current = dropAt;
  });
  useEffect(() => {
    popOutRef.current = popOut;
  });

  const closeTab = useCallback(
    (tabId: string) => {
      if (!canEdit || workstreamCount <= 1) return;
      const index = localTabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      const closingTab = localTabs[index]!;
      const nextTabs = localTabs.filter((tab) => tab.id !== tabId);
      setPendingClosedTabIds((current) => new Set(current).add(tabId));
      updateLocalTabs(() => nextTabs);
      if (resolvedTabId === tabId) {
        const neighbour = localTabs[index - 1] ?? localTabs[index + 1] ?? nextTabs[0];
        if (neighbour) activateTab(neighbour.id);
      }
      void closeRoomTab({ tabId }).catch(() => {
        setPendingClosedTabIds((current) => {
          const next = new Set(current);
          next.delete(tabId);
          return next;
        });
        updateLocalTabs((current) => upsertRoomTab(current, closingTab));
      });
    },
    [
      activateTab,
      canEdit,
      localTabs,
      resolvedTabId,
      updateLocalTabs,
      workstreamCount,
    ],
  );

  const renameTab = useCallback(
    (tabId: string, name: string) => {
      if (!canEdit) return;
      updateLocalTabs((current) =>
        current.map((tab) => (tab.id === tabId ? { ...tab, name } : tab)),
      );
      void renameRoomTab({ tabId, name }).catch(() => {
        // Realtime remains the source of truth after a failed rename.
      });
    },
    [canEdit, updateLocalTabs],
  );

  const focusDockComposer = useCallback(() => {
    // The real composer is a contenteditable inside Astryx's ChatComposer, so
    // there is no stable id to reach for -- the test id that component sets is
    // the contract. Accepting a plain field as well as a contenteditable keeps
    // this working if Astryx ever swaps the editor implementation underneath.
    const composer = document.querySelector<HTMLElement>(
      '[data-testid="room-chat-composer"]',
    );
    composer
      ?.querySelector<HTMLElement>(
        '[contenteditable="true"], textarea:not(:disabled), input:not(:disabled)',
      )
      ?.focus();
  }, []);
  // Ctrl/Cmd+K reaches for the composer whether or not the dock is currently
  // a pill. Expanding and focusing happen in the same keystroke, but the
  // composer is only actually focusable once the `hidden` wrapper lifts --
  // that DOM change lands in the same commit as `collapseDock(false)`, so a
  // layout effect keyed off this counter (not off `isDockCollapsed`, which
  // may already be `false` and so would not change) reliably runs after it.
  const [composerFocusRequestId, setComposerFocusRequestId] = useState(0);
  // The one function that changes the pill state in either direction: the
  // pill click, the new "Collapse conversation" control, Ctrl/Cmd+K, the PRD
  // "add to chat" action and the empty-state prompt all funnel through this,
  // so the unsent-work guard and the expand-also-focuses behaviour apply
  // everywhere reaching for (or dismissing) the composer is possible.
  const collapseDock = useCallback(
    (collapsed: boolean) => {
      if (collapsed) {
        // Never collapse over work that has not been sent -- hiding
        // half-written work behind a pill reads as having lost it.
        if (hasUnsentWork) return;
        setDockCollapsedPersisted(true);
        return;
      }
      setDockCollapsedPersisted(false);
      setComposerFocusRequestId((id) => id + 1);
    },
    [hasUnsentWork, setDockCollapsedPersisted],
  );
  const requestDockComposerFocus = useCallback(() => {
    collapseDock(false);
  }, [collapseDock]);
  useLayoutEffect(() => {
    if (composerFocusRequestId === 0) return;
    focusDockComposer();
  }, [composerFocusRequestId, focusDockComposer]);

  // Generation is queued, not built -- `getRoomPrototype` only reads
  // `state: "built"` rows, so `router.refresh()` right after queuing is a
  // no-op and the empty state would otherwise sit there for the 30-60s the
  // generation actually takes, looking like the click did nothing. This is
  // the acknowledgement, not the whole completion path: success already
  // works through `useDesignScreenGeneration`'s adoption effect (living in
  // `Conversation`), which picks up the queued task and refreshes once it
  // materialises, unmounting the empty state (and this flag with it) in
  // favour of the real viewer. Failure is this component's own job, below --
  // `startingRef` is the actual re-entrancy guard -- a `useState` value read
  // inside this same callback would still be the pre-click `false` for a
  // second click that lands before React re-renders and disables the
  // buttons; the ref is current immediately.
  const startingPrototypeRef = useRef(false);
  const [isStartingPrototype, setIsStartingPrototype] = useState(false);
  // The queued task's id, so the terminal-status effect below knows which
  // row in `roomTaskStatus.statuses` to watch. Cleared alongside the flag.
  const startingPrototypeTaskIdRef = useRef<string | null>(null);

  const resetStartingPrototype = useCallback(() => {
    startingPrototypeRef.current = false;
    startingPrototypeTaskIdRef.current = null;
    setIsStartingPrototype(false);
  }, []);

  // The empty prototype's starting points hand this their exact words as
  // `instruction` -- see `PrototypeEmptyState`. A queued generation writes
  // its screen rows server-side; refreshing is what makes the new screen
  // appear without a manual reload. `generateDesignScreen` resolves (never
  // throws) on a handled failure, so the error case is a `status` narrow,
  // not a catch -- the same convention `prd-document.tsx`'s
  // `handleSectionAsk`/`handleAssistRetry` and
  // `use-design-screen-generation.ts`'s `enqueue` use for this exact result
  // type. Without the toast, a failure looked identical to nothing having
  // happened: the button click, and then silence.
  const startFromEmptyPrototype = useCallback(
    async (instruction: string) => {
      if (startingPrototypeRef.current) return;
      startingPrototypeRef.current = true;
      setIsStartingPrototype(true);
      const result = await generateDesignScreen({ roomId, instruction });
      if (result.status === "queued") {
        startingPrototypeTaskIdRef.current = result.taskId;
        router.refresh();
        // Left `true`: the empty state (and this flag) disappears once the
        // real screen materialises. The effects below are what hand the
        // starting points back on a failure that only shows up later.
      } else {
        resetStartingPrototype();
        toast({ type: "error", body: result.message });
      }
    },
    [roomId, router, generateDesignScreen, toast, resetStartingPrototype],
  );

  // Enqueuing itself succeeding is not the same as the generation finishing:
  // the task can still fail afterwards, and `router.refresh()` right after
  // queuing cannot see that -- nothing rebuilds `paneData.prototype` again
  // until something tells it to. Two independent signals hand the starting
  // points back, because neither alone covers every way
  // `useDesignScreenGeneration` (living in `Conversation`, watching the same
  // task) itself gives up:
  //
  // 1. The task's own row in the room's task-status projection reaching a
  //    terminal, non-"completed" status -- the fast path for an explicit
  //    failure (rejected, cancelled, needs review, ...).
  // 2. A bounded fallback timeout, `DESIGN_SCREEN_GENERATION_TIMEOUT_MS` --
  //    the same worst case `useDesignScreenGeneration`'s own poll loop gives
  //    up at. That hook's other two failure paths (polling attempts
  //    exhausted; the task reports "completed" but a version never
  //    materializes) never change the task's status row, so (1) alone would
  //    leave the buttons disabled forever in those cases.
  useEffect(() => {
    const taskId = startingPrototypeTaskIdRef.current;
    if (!isStartingPrototype || !taskId) return;
    const task = roomTaskStatus?.statuses.find(
      (status) => status.taskId === taskId,
    );
    if (!task) return;
    if (isTerminalTaskStatus(task.status) && task.status !== "completed") {
      resetStartingPrototype();
      toast({
        type: "error",
        body: "Screen generation did not complete. Try again.",
      });
    }
  }, [isStartingPrototype, roomTaskStatus?.statuses, resetStartingPrototype, toast]);

  useEffect(() => {
    if (!isStartingPrototype) return;
    const timer = setTimeout(() => {
      resetStartingPrototype();
      toast({
        type: "error",
        body: "Screen generation did not finish in time. Try again.",
      });
    }, DESIGN_SCREEN_GENERATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isStartingPrototype, resetStartingPrototype, toast]);

  // `paneData.prototype` is `undefined` (no artifact loaded for this tab) or
  // a full `PrototypeViewerProps` -- either way `onStart`/`onFocusComposer`
  // only make sense to add once there is a prototype surface to hand them
  // to. `onFocusComposer` is `requestDockComposerFocus`, not the bare
  // `focusDockComposer`: the dock can be collapsed to a pill, and focusing a
  // hidden composer does nothing (the bug Task 8 fixed for the PRD "add to
  // chat" flow).
  const paneDataWithPrototypeActions = useMemo(
    () =>
      paneData.prototype
        ? {
            ...paneData,
            prototype: {
              ...paneData.prototype,
              onStart: startFromEmptyPrototype,
              onFocusComposer: requestDockComposerFocus,
              isStarting: isStartingPrototype,
            },
          }
        : paneData,
    [
      paneData,
      startFromEmptyPrototype,
      requestDockComposerFocus,
      isStartingPrototype,
    ],
  );

  const closeFocusedPane = useCallback(() => {
    if (focusedTool) closePane(focusedTool);
  }, [closePane, focusedTool]);

  useEffect(() => {
    if (!dragging) return;
    const onDragEnd = () => clearDrag();
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, [clearDrag, dragging]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dragging) {
          event.preventDefault();
          clearDrag();
        }
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        requestDockComposerFocus();
      } else if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        void openNewTab();
      } else if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        closeFocusedPane();
      } else if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        setFocusedTool(panes[Number(event.key) - 1] ?? null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    clearDrag,
    closeFocusedPane,
    dragging,
    requestDockComposerFocus,
    openNewTab,
    panes,
  ]);

  return (
    <RoomComposerProvider
      value={{
        prdSelection: composerPrdSelection,
        // Published by whichever Canvas pane holds the selection, consumed by
        // the dock composer -- the Room's only composer now.
        canvasSelection: composerCanvasSelection,
        setCanvasSelection: setComposerCanvasSelection,
        canvasScreenNames: composerCanvasScreenNames,
        setCanvasScreenNames: setComposerCanvasScreenNames,
        // Adding a PRD selection puts a quote in the composer -- pointless if
        // the composer is still a hidden pill, so this reaches for it exactly
        // as `onRequestAction` and Ctrl/Cmd+K do.
        addPrdSelection: (selection) => {
          setComposerPrdSelection(selection);
          requestDockComposerFocus();
        },
        clearPrdSelection: () => setComposerPrdSelection(null),
      }}
    >
    <VStack gap={0} width="100%" height="100%">
      <MeldTabStrip
        activeTabId={resolvedTabId}
        onActivate={activateTab}
        onAdd={
          canEdit && workstreamCount < MAX_ROOM_WORK_TABS
            ? openNewTab
            : undefined
        }
        showAddButton={canEdit && workstreamCount < MAX_ROOM_WORK_TABS}
      >
        {hasOverview ? (
          <MeldTab
            tabId="overview"
            label="Overview"
            variant="generated"
          />
        ) : null}
        {isConversationTabOpen ? (
          <MeldTab
            tabId={CONVERSATION_TAB_ID}
            label="Conversation"
            // `workstream`, not `generated`, purely so it can be closed:
            // `MeldTab` enforces "a generated tab renders no close control"
            // regardless of `isClosable`. It is still not renameable -- that
            // needs an `onRename`, which it does not get.
            variant="workstream"
            isClosable
            onClose={closeConversationTab}
          />
        ) : null}
        {localTabs.map((tab) => (
          <MeldTab
            key={tab.id}
            tabId={tab.id}
            label={tabDisplayName(tab)}
            variant="workstream"
            isClosable={canEdit && workstreamCount > 1}
            onRename={canEdit ? (name) => renameTab(tab.id, name) : undefined}
            onClose={canEdit ? () => closeTab(tab.id) : undefined}
          />
        ))}
      </MeldTabStrip>
      <MeldPlane
        // Only on a genuinely blank tab: once a pane is placed the room can
        // speak for itself, and a hint pointing at a toolbar you have already
        // used is noise. The composer hint goes too -- by then you have seen
        // it, and it would sit over real work.
        emptyState={
          !isOverview && !isConversationTab && panes.length === 0 ? (
            <MeldPlaneHints
              toolbar={canEdit ? "Drag a tool out here to work" : undefined}
              composer="Or just ask"
            />
          ) : null
        }
        liveRegion={
          dragging && activeZone !== null
            ? `${dragging.kind === "pane" ? "Drop to move" : "Drop to open"} ${PANE_TITLES[dragging.tool]} on ${zoneLabel(zoneCount, activeZone)}`
            : undefined
        }
        surface={
          isConversationTab ? (
            <RoomDockProvider
              value={{
                isExpanded: true,
                onExpandedChange: () => {},
                variant: "page",
                onUnsentWorkChange: setHasUnsentWork,
              }}
            >
              {conversation}
            </RoomDockProvider>
          ) : undefined
        }
        toolbar={
          canEdit && !isOverview && !isConversationTab ? (
            <MeldToolbar
              isCollapsed={isToolbarCollapsed}
              onCollapsedChange={(collapsed) => {
                writeStorageBoolean(TOOLBAR_STORAGE_KEY, collapsed);
              }}
            >
              {TOOLS.map((tool) => {
                const isOpen = panes.includes(tool);
                return (
                  <MeldToolbarItem
                    key={tool}
                    label={PANE_TITLES[tool]}
                    icon={TOOL_ICONS[tool]}
                    state={focusedTool === tool ? "active" : isOpen ? "open" : "idle"}
                    // Never disabled. Rows used to grey out when a placement
                    // was refused (e.g. Canvas holding its half), which the
                    // product owner explicitly did not want -- and a disabled
                    // row also could not be dragged, which read as the drag
                    // being broken. `place` resolves a refused arrangement by
                    // reordering instead.
                    onSelect={() => place(tool)}
                    onDragPointerDown={(event) => startToolDrag(tool, event)}
                  />
                );
              })}
            </MeldToolbar>
          ) : null
        }
        dock={
          isConversationTab ? undefined : (
          <MeldDock
            isExpanded={isDockExpanded}
            onExpandedChange={setDockExpanded}
            onExpandToTab={openConversationTab}
            isCollapsed={isDockCollapsed}
            onCollapsedChange={collapseDock}
            isCollapseDisabled={hasUnsentWork}
            collapsedLabel={collapsedLabel}
          >
            {/* `Conversation` arrives already built from the server
             * component, so context is the only way to hand it the dock's
             * state -- and it needs it, because it owns the one real
             * composer and therefore decides whether a transcript sits
             * above it. */}
            <RoomDockProvider
              value={{
                isExpanded: isDockExpanded,
                onExpandedChange: setDockExpanded,
                variant: "dock",
                onUnsentWorkChange: setHasUnsentWork,
              }}
            >
              {conversation}
            </RoomDockProvider>
          </MeldDock>
          )
        }
      >
        {isOverview ? (
          overview ?? <MeldNote>Overview</MeldNote>
        ) : (
          [
            ...panes.map((tool, index) => (
              <MeldPane
                key={tool}
                title={PANE_TITLES[tool]}
                region={regions[index]!}
                isFocused={focusedTool === tool}
                isClosable={canEdit}
                isPopOutable={
                  canEdit && workstreamCount < MAX_ROOM_WORK_TABS
                }
                onClose={() => closePane(tool)}
                onPopOut={() => void popOut(tool)}
                onDragPointerDown={
                  canEdit
                    ? (event) => startPaneDrag(tool, index, event)
                    : undefined
                }
                moveOptions={
                  canEdit
                    ? regions.map((_, optionIndex) => ({
                        index: optionIndex,
                        label: `Move to ${zoneLabel(panes.length, optionIndex)}`,
                      }))
                    : undefined
                }
                onMove={
                  canEdit
                    ? (toIndex) => movePlacedPane(index, toIndex)
                    : undefined
                }
              >
                <PaneContent
                  tool={tool}
                  data={paneDataWithPrototypeActions}
                  onRequestAction={requestDockComposerFocus}
                />
              </MeldPane>
            )),,
            // Drop zones render AFTER the panes, and this order is the whole
            // reason drag-and-drop works with something already on the plane.
            // Both are children of the same grid, so with the zones first a
            // placed pane -- which spans the region the zones subdivide --
            // painted straight over them and swallowed every dragenter. The
            // plane took drops only while it was empty. They exist only while
            // a drag is in flight (`zoneRegions` is empty otherwise), so
            // nothing is covering a pane the rest of the time.
            ...zoneRegions.map((region, index) => (
              <MeldDropZone
                key={`drop-${index}`}
                region={region}
                label={`Open ${PANE_TITLES[dragging?.tool ?? "prd"]} on ${zoneLabel(zoneCount, index)}`}
                isActive={activeZone === index}
                onDragEnter={() => setActiveZone(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropAt(index)}
              />
            )),
          ]
        )}
      </MeldPlane>
    </VStack>
    </RoomComposerProvider>
  );
}
