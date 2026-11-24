// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { boardHistoryKey, createFrameHistoryGate, FRAME_HISTORY_MIN_INTERVAL_MS, historyChord, userIsActive } from "./history-keys";

const chord = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; isComposing: boolean; keyCode: number }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, keyCode: 0, ...mods });

afterEach(() => { document.body.innerHTML = ""; });

describe("historyChord", () => {
  it("reads Cmd+Z (Mac) and Ctrl+Z (elsewhere) as undo, with Shift as redo", () => {
    expect(historyChord(chord("z", { metaKey: true }))).toBe("undo");
    expect(historyChord(chord("z", { ctrlKey: true }))).toBe("undo");
    expect(historyChord(chord("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(historyChord(chord("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
  });

  it("reads Ctrl+Y as redo, but not Cmd+Y or Ctrl+Shift+Y", () => {
    expect(historyChord(chord("y", { ctrlKey: true }))).toBe("redo");
    expect(historyChord(chord("y", { metaKey: true }))).toBeNull();
    expect(historyChord(chord("Y", { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("ignores plain keys, Alt chords and IME composition", () => {
    expect(historyChord(chord("z"))).toBeNull();
    expect(historyChord(chord("z", { shiftKey: true }))).toBeNull();
    expect(historyChord(chord("x", { metaKey: true }))).toBeNull();
    expect(historyChord(chord("z", { metaKey: true, altKey: true }))).toBeNull();
    expect(historyChord(chord("z", { metaKey: true, isComposing: true }))).toBeNull();
    expect(historyChord(chord("z", { metaKey: true, keyCode: 229 }))).toBeNull();
  });
});

describe("boardHistoryKey", () => {
  const both = { canUndo: true, canRedo: true };
  const board = () => {
    document.body.innerHTML = `<div class="orion-board"><button id="pill">Undo</button><input id="field"><textarea id="area"></textarea><div contenteditable="true"><span id="rich">x</span></div><div class="cm-editor"><div id="code" tabindex="0"></div></div></div><aside id="panel"><button id="panel-button">Close</button></aside>`;
    return (id: string) => document.getElementById(id)!;
  };
  const press = (target: EventTarget, mods: Parameters<typeof chord>[1], history: { canUndo: boolean; canRedo: boolean } | null = both, key = "z") =>
    boardHistoryKey({ ...chord(key, mods), target }, { history, scope: ".orion-board" });

  it("undoes and redoes with focus on the board, the pill or the page", () => {
    const el = board();
    expect(press(el("pill"), { metaKey: true })).toBe("undo");
    expect(press(document.body, { metaKey: true, shiftKey: true })).toBe("redo");
    expect(press(el("pill"), { ctrlKey: true }, both, "y")).toBe("redo");
  });

  it("leaves text fields, contenteditable and the code editor their own undo", () => {
    const el = board();
    for (const id of ["field", "area", "rich", "code"]) expect(press(el(id), { metaKey: true })).toBeNull();
  });

  it("leaves focus outside the board (the panel handles its own keys)", () => {
    const el = board();
    expect(press(el("panel-button"), { metaKey: true })).toBeNull();
  });

  it("falls through when there is nothing to do, or no editable screen is awake (read-only included)", () => {
    const el = board();
    expect(press(el("pill"), { metaKey: true }, { canUndo: false, canRedo: true })).toBeNull();
    expect(press(el("pill"), { metaKey: true, shiftKey: true }, { canUndo: true, canRedo: false })).toBeNull();
    expect(press(el("pill"), { metaKey: true }, null)).toBeNull();
  });

  it("ignores IME composition and Alt", () => {
    const el = board();
    expect(press(el("pill"), { metaKey: true, isComposing: true })).toBeNull();
    expect(press(el("pill"), { metaKey: true, altKey: true })).toBeNull();
  });
});

describe("createFrameHistoryGate", () => {
  const real = { screenId: "ds-a", pointerOver: true, frameFocused: true, userActive: true };
  it("accepts a screen's history key only with the pointer over it, focus in it and recent real input", () => {
    let now = 1000;
    const gate = createFrameHistoryGate(() => now);
    // The pointer elsewhere: a real press is possible (focus stayed inside), so it is only dropped.
    expect(gate({ ...real, pointerOver: false })).toBe(false);
    expect(gate(real)).toBe(true);
    now += FRAME_HISTORY_MIN_INTERVAL_MS;
    expect(gate(real)).toBe(true);
  });

  it("stops listening to a screen for good once it reports a key that cannot be real", () => {
    let now = 0;
    for (const fake of [{ frameFocused: false }, { userActive: false }]) {
      const gate = createFrameHistoryGate(() => now);
      // Keys only reach a focused frame, and a key press always counts as user activation.
      expect(gate({ ...real, ...fake })).toBe(false);
      now += 1000;
      expect(gate(real)).toBe(false);
      // Other screens are not affected.
      expect(gate({ ...real, screenId: "ds-b" })).toBe(true);
    }
  });

  it("takes at most one step per interval, so a held key or a burst cannot run away", () => {
    let now = 0;
    const gate = createFrameHistoryGate(() => now);
    const accepted = Array.from({ length: 100 }, () => { now += 10; return gate(real); }).filter(Boolean).length;
    expect(FRAME_HISTORY_MIN_INTERVAL_MS).toBe(100);
    expect(accepted).toBe(10);
  });
});

describe("userIsActive", () => {
  it("reads the browser's transient user activation, and is false when it cannot tell", () => {
    expect(userIsActive({ userActivation: { isActive: true } })).toBe(true);
    expect(userIsActive({ userActivation: { isActive: false } })).toBe(false);
    expect(userIsActive({})).toBe(false);
  });
});
