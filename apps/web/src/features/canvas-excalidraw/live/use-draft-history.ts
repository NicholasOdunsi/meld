"use client";

import { useCallback, useSyncExternalStore } from "react";
import { runHistory } from "./draft-history";
import type { createHandEditing } from "./hand-editing";

type HandEditing = ReturnType<typeof createHandEditing>;

// Undo and redo for the awake screen's draft, with no panel mounted: the pill and
// the keyboard use this. null when no editable, drafted screen is awake.
export function useDraftHistory(editing: HandEditing): { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void } | null {
  const live = editing.live;
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  useSyncExternalStore(editing.subscribe, editing.getSnapshot, editing.getSnapshot);
  const draft = liveState.phase === "asleep" ? undefined : editing.drafts.get(liveState.screenId);
  const subscribe = useCallback((listener: () => void) => (draft ? draft.subscribe(listener) : () => {}), [draft]);
  const getState = useCallback(() => draft?.getState() ?? null, [draft]);
  const state = useSyncExternalStore(subscribe, getState, getState);
  const run = (kind: "undo" | "redo") => {
    const current = live.getState();
    if (current.phase === "asleep" || !draft || !editing.canEdit(draft)) return;
    runHistory(kind, { draft, live, boardId: current.screenId, picked: editing.getValidPick(), reselect: editing.getReselect(), onReselect: editing.setReselect });
  };
  if (!draft || !state || !editing.canEdit(draft)) return null;
  return { canUndo: state.canUndo, canRedo: state.canRedo, undo: () => run("undo"), redo: () => run("redo") };
}
