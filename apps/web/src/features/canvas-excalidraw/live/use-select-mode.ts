"use client";

import { useEffect } from "react";
import type { Draft } from "./edit-draft";
import type { LiveController } from "./live-controller";
import { shouldEnableSelectMode, syncSelectMode } from "./selection-rules";

export type SelectModeEditing = {
  drafts: { get(boardId: string): Draft | undefined };
  canEdit(draft: Draft): boolean;
  takeReselect(): string | null;
};

// Picking is on only in Edit, for an awake, editable draft. The
// controller switches it off on every wake, sleep, reload and draft preview,
// so it is re-checked after each live change, and an edit's element is
// selected again once its recompiled frame can pick.
export function useSelectMode(live: LiveController, editing: SelectModeEditing, edit: boolean): void {
  useEffect(() => {
    const sync = () => {
      const state = live.getState();
      const draft = state.phase === "asleep" ? undefined : editing.drafts.get(state.screenId);
      syncSelectMode(live, shouldEnableSelectMode({ phase: state.phase, hasDraft: !!draft, canEdit: !!draft && editing.canEdit(draft), edit }), editing.takeReselect);
    };
    sync();
    return live.subscribe(sync);
  }, [editing, edit, live]);
}
