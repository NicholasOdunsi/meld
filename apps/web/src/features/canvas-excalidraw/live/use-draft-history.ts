"use client";

import { useCallback, useSyncExternalStore } from "react";
import { runHistory } from "./draft-history";
import type { createHandEditing } from "./hand-editing";

type HandEditing = ReturnType<typeof createHandEditing>;

// Undo and redo for the awake screen's draft, with no panel mounted: the pill and the board's
// Cmd+Z / Shift+Cmd+Z (pressed on the board, the pill or inside the screen; see history-keys.ts) use
// this. The panel keeps its own keys while focus is in it. With nothing to undo or redo here, the keys
// go on to the board's own undo. null when no editable, drafted screen is awake.
export function useDraftHistory(editing: HandEditing): { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void } | null {
  const live = editing.live;
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  useSyncExternalStore(editing.subscribe, editing.getSnapshot, editing.getSnapshot);
  const draft = liveState.phase === "asleep" ? undefined : editing.drafts.get(liveState.screenId);
  const subscribe = useCallback((listener: () => void) => (draft ? draft.subscribe(listener) : () => {}), [draft]);
  const getState = useCallback(() => draft?.getState() ?? null, [draft]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  // The button may have been rendered for another screen: find the awake screen's draft when it is pressed.
  const run = (kind: "undo" | "redo") => {
    const current = live.getState();
    if (current.phase === "asleep") return;
    const target = editing.drafts.get(current.screenId);
    if (!target || !editing.canEdit(target)) return;
    runHistory(kind, {
      draft: target, live, boardId: current.screenId, picked: editing.getValidPick(), reselect: editing.getReselect(), onReselect: editing.setReselect,
      onPreview: editing.getHistoryObserver() ?? undefined,
    });
  };
  if (!draft || !state || !editing.canEdit(draft)) return null;
  return { canUndo: state.canUndo, canRedo: state.canRedo, undo: () => run("undo"), redo: () => run("redo") };
}
