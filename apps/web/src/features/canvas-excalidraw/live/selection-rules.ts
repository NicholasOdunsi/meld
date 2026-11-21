import type { LiveState } from "./live-state";
import type { LiveController } from "./live-controller";
import type { PickedElement } from "./hand-editing";

// A pick belongs to the awake screen and to the draft revision on screen.
export function isValidPick(picked: Pick<PickedElement, "boardId" | "revision"> | null, screenId: string | null, revision: number | null): boolean {
  return !!picked && screenId !== null && revision !== null && picked.boardId === screenId && picked.revision === revision;
}

// Selecting inside a screen is automatic for an awake, editable draft. Interact
// hands the clicks back to the screen itself.
export function shouldEnableSelectMode(input: { phase: LiveState["phase"]; hasDraft: boolean; canEdit: boolean; interact: boolean }): boolean {
  return input.phase !== "asleep" && input.hasDraft && input.canEdit && !input.interact;
}

// The panel shows for a valid pick (or one about to come back after an edit),
// or while Code was explicitly opened. A sleeping screen never has one.
export function shouldShowLivePanel(input: { panelOpen: boolean; validPicked: boolean; phase: LiveState["phase"]; reselecting?: boolean }): boolean {
  return input.phase !== "asleep" && (input.panelOpen || input.validPicked || !!input.reselecting);
}

export type EscapeAction = "ignore" | "clear-selection" | "sleep";
// Escape inside a popup only closes the popup; with a selection it clears the
// selection; otherwise it puts the screen to sleep.
export function escapeAction(input: { hasPick: boolean; targetInsidePopup: boolean }): EscapeAction {
  if (input.targetInsidePopup) return "ignore";
  return input.hasPick ? "clear-selection" : "sleep";
}
export const POPUP_SELECTOR = '[role="dialog"], [popover], [role="listbox"]';
export function isInsidePopup(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(POPUP_SELECTOR) !== null;
}

// The controller turns picking off whenever the draft changes or the frame
// reloads, so this runs after every live change: it turns it back on once the
// frame can pick again, then restores the selection an edit just dropped.
export function syncSelectMode(
  live: Pick<LiveController, "isPicking" | "canPick" | "setPickEnabled" | "selectElement">,
  want: boolean,
  takeReselect: () => string | null,
): void {
  if (!want) {
    if (live.isPicking()) live.setPickEnabled(false);
    return;
  }
  if (!live.canPick()) return;
  if (!live.isPicking()) live.setPickEnabled(true);
  const src = takeReselect();
  if (src) live.selectElement(src);
}
