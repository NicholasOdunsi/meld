"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { PixelClipboard, PixelCode, PixelPaintBrush } from "@/ui/pixel-icons";
import { MeldDock } from "@/ui/meld/dock";
import { MeldDropZone } from "@/ui/meld/drop-zone";
import { MeldPane } from "@/ui/meld/pane";
import { MeldPlane } from "@/ui/meld/plane";
import { MeldTab, MeldTabStrip } from "@/ui/meld/tab-strip";
import { MeldToolbar, MeldToolbarItem } from "@/ui/meld/toolbar";
import { MeldTextInput } from "@/ui/meld/text-input";
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
  movePane,
  paneRefusalReason,
  regionsFor,
  removePane,
  type PaneTool,
} from "../pane-layout";
import type { RoomTab } from "../room-tabs-repository";
import { useRoomTabsRealtime } from "../use-room-tabs-realtime";
import { PANE_TITLES, PaneContent, type RoomPaneData } from "./pane-content";

const TOOLS: readonly PaneTool[] = ["canvas", "prototype", "prd"];

const TOOL_ICONS = {
  canvas: <PixelPaintBrush pack="basic" size="sm" aria-hidden="true" />,
  prototype: <PixelCode pack="basic" size="sm" aria-hidden="true" />,
  prd: <PixelClipboard pack="basic" size="sm" aria-hidden="true" />,
} as const;

const TOOLBAR_STORAGE_KEY = "meld.room.toolbar-collapsed";
const DOCK_STORAGE_KEY = "meld.room.dock-expanded";
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

function firstLegalIndex(panes: PaneTool[], tool: PaneTool): number | null {
  if (!canPlace(panes, tool)) return null;
  for (let index = 0; index <= panes.length; index += 1) {
    if (paneRefusalReason(panes, tool, index) === null) return index;
  }
  return null;
}

function placementReason(panes: PaneTool[], tool: PaneTool): string | null {
  if (panes.includes(tool)) return null;
  if (firstLegalIndex(panes, tool) !== null) return null;
  if (panes.length >= MAX_PANES) {
    return "Four is the most a tab holds. Close one, or drop this on + for a new tab.";
  }
  return (
    paneRefusalReason(panes, tool, panes.length) ??
    "This tool cannot fit in the available regions."
  );
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

export type RoomPlaneProps = {
  roomId: string;
  tabs: RoomTab[];
  activeTabId: string;
  hasOverview: boolean;
  canEdit: boolean;
  paneData: RoomPaneData;
  conversation: ReactNode;
  overview?: ReactNode;
  realtimeEnabled?: boolean;
};

/**
 * Client shell for the freeform Room. It owns only personal chrome state and
 * optimistic tab/pane selection. The tab repository and existing Conversation
 * remain the durable boundaries; this component never rewrites their content.
 */
export function RoomPlane({
  roomId,
  tabs,
  activeTabId,
  hasOverview,
  canEdit,
  paneData,
  conversation,
  overview,
  realtimeEnabled = true,
}: RoomPlaneProps) {
  const realtimeTabs = useRoomTabsRealtime({
    roomId,
    initialTabs: tabs,
    enabled: realtimeEnabled,
  });
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
  const [selectedTabId, setSelectedTabId] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(
          `meld.room.${roomId}.last-tab`,
        );
        if (
          stored &&
          (stored === "overview" ||
            realtimeTabs.some((tab) => tab.id === stored)) &&
          (stored !== "overview" || hasOverview)
        ) {
          return stored;
        }
      } catch {
        // Fall back to the server-selected tab.
      }
    }
    return hasOverview ? "overview" : activeTabId;
  });
  const [focusedTool, setFocusedTool] = useState<PaneTool | null>(null);
  const isToolbarCollapsed = useStoredBoolean(TOOLBAR_STORAGE_KEY);
  const isDockExpanded = useStoredBoolean(DOCK_STORAGE_KEY);
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<DragSource | null>(null);
  const [activeZone, setActiveZone] = useState<number | null>(null);

  const resolvedTabId =
    selectedTabId === "overview" && hasOverview
      ? "overview"
      : localTabs.some((tab) => tab.id === selectedTabId)
        ? selectedTabId
        : localTabs[0]?.id ?? "";
  const activeTab = localTabs.find((tab) => tab.id === resolvedTabId);
  const isOverview = resolvedTabId === "overview";

  const incomingPanes = isOverview ? [] : activeTab?.panes ?? [];
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

  const activateTab = useCallback(
    (tabId: string) => {
      setSelectedTabId(tabId);
      writeLastTab(roomId, tabId);
    },
    [roomId],
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
      void setRoomTabPanes({ tabId: activeTab.id, panes: next }).catch(() => {
        // The realtime/server snapshot remains authoritative after a failed
        // write; the optimistic state keeps the interaction responsive.
      });
    },
    [activeTab, commitLocalPanes, updateLocalTabs],
  );

  const place = useCallback(
    (tool: PaneTool) => {
      if (panes.includes(tool)) {
        setFocusedTool(tool);
        return;
      }
      const index = firstLegalIndex(panes, tool);
      if (index === null) return;
      const next = insertPaneAt(panes, tool, index);
      if (next.length === panes.length) return;
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
    if (!canEdit) return;
    try {
      const created = await createRoomTab({ roomId });
      updateLocalTabs((current) => [...current, created]);
      activateTab(created.id);
    } catch {
      // The existing tab remains usable if persistence is unavailable.
    }
  }, [activateTab, canEdit, roomId, updateLocalTabs]);

  const popOut = useCallback(
    async (tool: PaneTool) => {
      if (!canEdit) return;
      try {
        const created = await createRoomTab({ roomId, panes: [tool] });
        updateLocalTabs((current) => [...current, created]);
        activateTab(created.id);
      } catch {
        // A failed pop-out leaves the current pane in place.
      }
    },
    [activateTab, canEdit, roomId, updateLocalTabs],
  );

  const clearDrag = useCallback(() => {
    setDragging(null);
    setActiveZone(null);
  }, []);

  const startDrag = useCallback(
    (
      source: DragSource,
      event: ReactDragEvent<HTMLElement | HTMLButtonElement>,
    ) => {
      event.dataTransfer?.setData("text/plain", source.tool);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      setDragging(source);
      setActiveZone(null);
    },
    [],
  );

  const startToolDrag = useCallback(
    (tool: PaneTool, event: ReactDragEvent<HTMLButtonElement>) => {
      const fromIndex = panes.indexOf(tool);
      startDrag(
        fromIndex >= 0
          ? { kind: "pane", tool, fromIndex }
          : { kind: "tool", tool },
        event,
      );
    },
    [panes, startDrag],
  );

  const startPaneDrag = useCallback(
    (tool: PaneTool, fromIndex: number, event: ReactDragEvent<HTMLElement>) => {
      startDrag({ kind: "pane", tool, fromIndex }, event);
    },
    [startDrag],
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

  const dropAt = useCallback(
    (index: number) => {
      if (!dragging) return;
      const next =
        dragging.kind === "tool"
          ? insertPaneAt(panes, dragging.tool, index)
          : movePane(panes, dragging.fromIndex, index);
      if (layoutChanged(panes, next)) {
        commitPanes(next);
        setFocusedTool(dragging.tool);
      }
      clearDrag();
    },
    [clearDrag, commitPanes, dragging, panes],
  );

  const dropOnAdd = useCallback(
    (event: ReactDragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!dragging) return;
      void popOut(dragging.tool);
      clearDrag();
    },
    [clearDrag, dragging, popOut],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      if (!canEdit || workstreamCount <= 1) return;
      const index = localTabs.findIndex((tab) => tab.id === tabId);
      if (index < 0) return;
      const nextTabs = localTabs.filter((tab) => tab.id !== tabId);
      updateLocalTabs(() => nextTabs);
      if (resolvedTabId === tabId) {
        const neighbour = localTabs[index - 1] ?? localTabs[index + 1] ?? nextTabs[0];
        if (neighbour) activateTab(neighbour.id);
      }
      void closeRoomTab({ tabId }).catch(() => {
        // The next realtime/server snapshot can restore a tab if the delete
        // was rejected by the backend.
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
    document.getElementById(`room-dock-composer-${roomId}`)?.focus();
  }, [roomId]);

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
        focusDockComposer();
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
  }, [clearDrag, closeFocusedPane, dragging, focusDockComposer, openNewTab, panes]);

  const composer = (
    <MeldTextInput
      id={`room-dock-composer-${roomId}`}
      label="Message or ask"
      hideLabel
      placeholder="Message or ask…"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );

  return (
    <VStack gap={0} width="100%" height="100%">
      <MeldTabStrip
        activeTabId={resolvedTabId}
        onActivate={activateTab}
        onAdd={canEdit ? openNewTab : undefined}
        showAddButton={canEdit}
        onDropOnAdd={canEdit ? dropOnAdd : undefined}
      >
        {hasOverview ? (
          <MeldTab
            tabId="overview"
            label="Overview"
            variant="generated"
          />
        ) : null}
        {localTabs.map((tab) => (
          <MeldTab
            key={tab.id}
            tabId={tab.id}
            label={tab.name ?? "Untitled"}
            variant="workstream"
            isClosable={canEdit && workstreamCount > 1}
            onRename={canEdit ? (name) => renameTab(tab.id, name) : undefined}
            onClose={canEdit ? () => closeTab(tab.id) : undefined}
          />
        ))}
      </MeldTabStrip>
      <MeldPlane
        liveRegion={
          dragging && activeZone !== null
            ? `${dragging.kind === "pane" ? "Drop to move" : "Drop to open"} ${PANE_TITLES[dragging.tool]} on ${zoneLabel(zoneCount, activeZone)}`
            : undefined
        }
        toolbar={
          canEdit && !isOverview ? (
            <MeldToolbar
              isCollapsed={isToolbarCollapsed}
              onCollapsedChange={(collapsed) => {
                writeStorageBoolean(TOOLBAR_STORAGE_KEY, collapsed);
              }}
            >
              {TOOLS.map((tool) => {
                const isOpen = panes.includes(tool);
                const reason = placementReason(panes, tool);
                return (
                  <MeldToolbarItem
                    key={tool}
                    label={PANE_TITLES[tool]}
                    icon={TOOL_ICONS[tool]}
                    state={focusedTool === tool ? "active" : isOpen ? "open" : "idle"}
                    isDisabled={Boolean(reason)}
                    disabledReason={reason ?? undefined}
                    onSelect={() => place(tool)}
                    onDragStart={(event) => startToolDrag(tool, event)}
                  />
                );
              })}
            </MeldToolbar>
          ) : null
        }
        dock={
          <MeldDock
            isExpanded={isDockExpanded}
            onExpandedChange={(expanded) => {
              writeStorageBoolean(DOCK_STORAGE_KEY, expanded);
            }}
            composer={composer}
          >
            {conversation}
          </MeldDock>
        }
      >
        {isOverview ? (
          overview ?? <MeldNote>Overview</MeldNote>
        ) : (
          [
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
            ...panes.map((tool, index) => (
              <MeldPane
                key={tool}
                title={PANE_TITLES[tool]}
                region={regions[index]!}
                isFocused={focusedTool === tool}
                isClosable={canEdit}
                isPopOutable={canEdit}
                onClose={() => closePane(tool)}
                onPopOut={() => void popOut(tool)}
                onDragStart={
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
                <PaneContent tool={tool} data={paneData} />
              </MeldPane>
            )),
          ]
        )}
      </MeldPlane>
    </VStack>
  );
}
