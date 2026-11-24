import type { LiveState } from "./live-state";
import type { LiveController } from "./live-controller";
import type { PickedElement } from "./hand-editing";

// A pick belongs to the awake screen and to the draft revision on screen.
export function isValidPick(picked: Pick<PickedElement, "boardId" | "revision"> | null, screenId: string | null, revision: number | null): boolean {
  return !!picked && screenId !== null && revision !== null && picked.boardId === screenId && picked.revision === revision;
}

// Screens are interactive by default: clicks reach the screen. Edit turns picking on for an awake,
// editable draft, so a click selects an element instead.
export function shouldEnableSelectMode(input: { phase: LiveState["phase"]; hasDraft: boolean; canEdit: boolean; edit: boolean }): boolean {
  return input.phase !== "asleep" && input.hasDraft && input.canEdit && input.edit;
}

// The panel shows for a valid pick (or one about to come back after an edit),
// or while Code was explicitly opened. A sleeping screen never has one.
export function shouldShowLivePanel(input: { panelOpen: boolean; validPicked: boolean; phase: LiveState["phase"]; reselecting?: boolean }): boolean {
  return input.phase !== "asleep" && (input.panelOpen || input.validPicked || !!input.reselecting);
}

export type EscapeAction = "ignore" | "clear-selection" | "exit-edit" | "sleep";
// Escape inside a popup only closes the popup; with a selection, or one about to come back after
// an edit, it clears it (staying in Edit); in Edit with nothing selected it leaves Edit (the screen
// stays awake and interactive); otherwise it puts the screen to sleep.
export function escapeAction(input: { hasPick: boolean; targetInsidePopup: boolean; edit: boolean }): EscapeAction {
  if (input.targetInsidePopup) return "ignore";
  if (input.hasPick) return "clear-selection";
  return input.edit ? "exit-edit" : "sleep";
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

// The pill under an awake screen: shown for every screen the user may edit, whether or not its
// frame is selected on the board.
export function showScreenPill(input: { phase: LiveState["phase"]; access: "edit" | "view"; hasDraft: boolean; editable: boolean }): boolean {
  return input.phase !== "asleep" && input.access === "edit" && input.hasDraft && input.editable;
}
