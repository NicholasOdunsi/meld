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

export type EscapeAction = "ignore" | "exit-interact" | "clear-selection" | "sleep";
// Escape inside a popup only closes the popup; in Interact it leaves Interact
// (selecting comes back, the screen stays awake); with a selection, or one about
// to come back after an edit, it clears it; otherwise it puts the screen to sleep.
export function escapeAction(input: { hasPick: boolean; targetInsidePopup: boolean; interact?: boolean }): EscapeAction {
  if (input.targetInsidePopup) return "ignore";
  if (input.interact) return "exit-interact";
  return input.hasPick ? "clear-selection" : "sleep";
}

// What waking a screen shows. Nothing, normally: the panel appears when something is
// selected. Code when it was asked for or the screen cannot compile, and also when
// the screen cannot be edited (read-only access, or an older screen with no editable
// source), because selecting is off there and Code is the only way to see the source.
export function opensCodeOnWake(input: { phase: LiveState["phase"]; tab: "code" | "tweak"; editable: boolean }): boolean {
  if (input.phase === "asleep") return false;
  return input.phase === "compile-failed" || input.tab === "code" || !input.editable;
}

export const TWEAK_NEEDS_SELECTION = "Click something in the screen to tweak it";
export const TWEAK_NEEDS_EDIT_ACCESS = "This screen can't be edited here. Read its source in Code.";
// Why the Tweak tab can't be chosen right now, or undefined when it can.
export function tweakDisabledReason(input: { editable: boolean; hasPick: boolean; reselecting: boolean }): string | undefined {
  if (!input.editable) return TWEAK_NEEDS_EDIT_ACCESS;
  return input.hasPick || input.reselecting ? undefined : TWEAK_NEEDS_SELECTION;
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

// The Interact chip under an awake screen: only while Interact is on for an editable screen, and not
// when that screen's frame is selected (its selection pill already carries the Interact toggle).
export function showInteractChip(input: { phase: LiveState["phase"]; editable: boolean; interact: boolean; frameSelected: boolean }): boolean {
  return input.phase !== "asleep" && input.editable && input.interact && !input.frameSelected;
}
