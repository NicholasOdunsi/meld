import type { Draft } from "./edit-draft";
import { remapTag } from "./element-tag";
import type { Selected } from "./element-session";
import type { LiveController } from "./live-controller";

export type HistoryKind = "undo" | "redo";

// Undo or redo the awake screen's draft and preview the result in the frame. Used by the panel's
// Cmd+Z and by the pill, so it needs no panel: the element that was selected (or is about to be
// selected again after a tweak) is found again in the new source and handed to `onReselect`;
// null when it is gone or nothing was selected. Returns whether anything changed.
export function runHistory(kind: HistoryKind, ctx: {
  draft: Draft;
  live: Pick<LiveController, "previewDraft">;
  boardId: string;
  picked: Pick<Selected, "src"> | null;
  reselect: string | null;
  onReselect: (src: string | null) => void;
  // Runs right before the preview, with the element to carry over (the panel uses it to keep showing its values).
  onPreview?: (again: string | null) => void;
}): boolean {
  const { draft, live, boardId, picked, reselect, onReselect, onPreview } = ctx;
  const before = draft.getState();
  // Right after a tweak the element is not selected yet, only about to be: remap that one.
  const capture = picked?.src ?? reselect;
  if (kind === "undo") draft.undo();
  else draft.redo();
  const after = draft.getState();
  if (after.revision === before.revision) return false;
  // Undo and redo can change anything in the file: find the element again in the new text.
  const again = capture ? remapTag(before.source.files, after.source.files, capture) : null;
  onReselect(again);
  onPreview?.(again);
  live.previewDraft(boardId, after.source, after.revision, "history");
  return true;
}
