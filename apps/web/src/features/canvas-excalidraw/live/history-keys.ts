// Cmd+Z / Shift+Cmd+Z (Ctrl off the Mac, and Ctrl+Y) for the awake screen's edits, run the way
// the pill's Undo and Redo run them.

export type HistoryDirection = "undo" | "redo";

type Chord = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; isComposing?: boolean; keyCode?: number };

// Text fields keep their own undo; the panel's code editor too. (The same list the frame bridge uses, plus .cm-editor.)
const TEXT_FIELD = ".cm-editor, input, textarea, [contenteditable]:not([contenteditable=false])";

// The direction a key chord asks for, or null. Cmd and Ctrl both count, as in the panel.
export function historyChord(event: Chord): HistoryDirection | null {
  if (event.altKey || event.isComposing || event.keyCode === 229 || !(event.metaKey || event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return null;
}

// A key pressed in the board's page: acted on only with focus on the page, the board or its pill,
// never in a text field or outside the board (the panel handles its own keys), and only when there
// is something to undo or redo. null lets the key go on to the board's own undo, as before.
export function boardHistoryKey(
  event: Chord & { target: EventTarget | null },
  ctx: { history: { canUndo: boolean; canRedo: boolean } | null; scope: string },
): HistoryDirection | null {
  const direction = historyChord(event);
  if (!direction || !ctx.history) return null;
  const target = event.target instanceof Element ? event.target : null;
  if (!target || (target as HTMLElement).isContentEditable || target.closest(TEXT_FIELD)) return null;
  if (target !== target.ownerDocument.body && !target.closest(ctx.scope)) return null;
  return (direction === "undo" ? ctx.history.canUndo : ctx.history.canRedo) ? direction : null;
}

// A screen reports Cmd+Z pressed inside it, but its code is untrusted and could post the report in a
// loop. A real press inside the screen always comes with keyboard focus in that screen (keys only reach
// a focused frame) and with the browser's transient user activation, which a key press inside a child
// frame also gives the board's page (checked in Chromium and WebKit). A report without either cannot be
// a key press: that screen is not listened to again while the board is open. A report also needs the
// pointer over the screen (only dropped without it: focus may have stayed inside), and at most one step
// is taken per interval, short enough for two deliberate presses. Undone steps are not lost: Redo brings
// them back.
export const FRAME_HISTORY_MIN_INTERVAL_MS = 100;

export function createFrameHistoryGate(now: () => number = () => performance.now()) {
  let last = Number.NEGATIVE_INFINITY;
  const distrusted = new Set<string>();
  return (signals: { screenId: string; pointerOver: boolean; frameFocused: boolean; userActive: boolean }): boolean => {
    if (distrusted.has(signals.screenId)) return false;
    if (!signals.frameFocused || !signals.userActive) {
      distrusted.add(signals.screenId);
      return false;
    }
    if (!signals.pointerOver) return false;
    const time = now();
    if (time - last < FRAME_HISTORY_MIN_INTERVAL_MS) return false;
    last = time;
    return true;
  };
}

// Transient user activation; false where the browser cannot say.
export function userIsActive(nav: { userActivation?: { isActive: boolean } }): boolean {
  return nav.userActivation?.isActive === true;
}
