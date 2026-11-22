import type { SelectionSummary } from "../chrome/selection";
import type { ScreenAction } from "../chrome/selection-pill";

export function liveScreenActions(selection: SelectionSummary, awake: boolean, handlers: {
  onOpenLive: (boardScreenId: string) => void;
  onCode: (boardScreenId: string) => void;
}, edit?: { pressed: boolean; onToggle: () => void }): ScreenAction[] {
  if (selection.kind !== "screen" || !selection.screenId) return [];
  const screenId = selection.screenId;
  return [
    ...(awake ? [] : [{ label: "Open live", onPress: () => handlers.onOpenLive(screenId) }]),
    // Only for an awake screen that can be edited: it turns on picking elements inside the screen.
    ...(awake && edit ? [{ label: "Edit", pressed: edit.pressed, onPress: edit.onToggle }] : []),
    { label: "Code", onPress: () => handlers.onCode(screenId) },
  ];
}
