// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { escapeAction, isInsidePopup, isValidPick, shouldEnableSelectMode, shouldShowLivePanel, syncSelectMode } from "./selection-rules";

describe("shouldEnableSelectMode", () => {
  const base = { phase: "running" as const, hasDraft: true, canEdit: true, interact: false };
  it("is on for an awake, editable draft outside Interact", () => {
    for (const phase of ["compiling", "loading", "running"] as const) expect(shouldEnableSelectMode({ ...base, phase })).toBe(true);
  });
  it("is off while asleep, without a draft, read-only, or in Interact", () => {
    expect(shouldEnableSelectMode({ ...base, phase: "asleep" })).toBe(false);
    expect(shouldEnableSelectMode({ ...base, hasDraft: false })).toBe(false);
    expect(shouldEnableSelectMode({ ...base, canEdit: false })).toBe(false);
    expect(shouldEnableSelectMode({ ...base, interact: true })).toBe(false);
  });
});

describe("shouldShowLivePanel", () => {
  it("shows for a valid pick or an explicitly opened Code, never while asleep", () => {
    expect(shouldShowLivePanel({ panelOpen: false, validPicked: true, phase: "running" })).toBe(true);
    expect(shouldShowLivePanel({ panelOpen: true, validPicked: false, phase: "running" })).toBe(true);
    expect(shouldShowLivePanel({ panelOpen: true, validPicked: true, phase: "asleep" })).toBe(false);
  });
  it("stays away after a wake with nothing picked and Code closed", () => {
    for (const phase of ["compiling", "loading", "running", "stopped"] as const) expect(shouldShowLivePanel({ panelOpen: false, validPicked: false, phase })).toBe(false);
  });
  it("holds on while an edited element is being selected again", () => {
    expect(shouldShowLivePanel({ panelOpen: false, validPicked: false, phase: "loading", reselecting: true })).toBe(true);
    expect(shouldShowLivePanel({ panelOpen: false, validPicked: false, phase: "asleep", reselecting: true })).toBe(false);
  });
});

describe("escapeAction", () => {
  it("ignores Escape inside a popup, clears a selection, otherwise sleeps", () => {
    expect(escapeAction({ hasPick: true, targetInsidePopup: true })).toBe("ignore");
    expect(escapeAction({ hasPick: false, targetInsidePopup: true })).toBe("ignore");
    expect(escapeAction({ hasPick: true, targetInsidePopup: false })).toBe("clear-selection");
    expect(escapeAction({ hasPick: false, targetInsidePopup: false })).toBe("sleep");
  });
  it("recognises the targets inside a dialog, popover or listbox", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("button");
    dialog.appendChild(inner);
    const listbox = document.createElement("ul");
    listbox.setAttribute("role", "listbox");
    const option = document.createElement("li");
    listbox.appendChild(option);
    const popover = document.createElement("div");
    popover.setAttribute("popover", "");
    const colour = document.createElement("input");
    popover.appendChild(colour);
    expect([inner, option, colour].map(isInsidePopup)).toEqual([true, true, true]);
    expect(isInsidePopup(document.createElement("button"))).toBe(false);
    expect(isInsidePopup(null)).toBe(false);
  });
});

describe("isValidPick", () => {
  it("needs the awake screen and the draft revision on screen", () => {
    const pick = { boardId: "a", revision: 3 };
    expect(isValidPick(pick, "a", 3)).toBe(true);
    expect(isValidPick(pick, "b", 3)).toBe(false);
    expect(isValidPick(pick, "a", 4)).toBe(false);
    expect(isValidPick(pick, null, null)).toBe(false);
    expect(isValidPick(null, "a", 3)).toBe(false);
  });
});

describe("syncSelectMode", () => {
  // A stand-in for the controller: it can only pick once the frame is ready, and
  // `reset` is what a preview, reload or wake does to it.
  function fakeLive(canPick: boolean) {
    const state = { picking: false, canPick };
    const live = {
      isPicking: () => state.picking,
      canPick: () => state.canPick,
      setPickEnabled: vi.fn((enabled: boolean) => { state.picking = enabled && state.canPick; }),
      selectElement: vi.fn(),
    };
    return { live, state };
  }
  it("turns picking on once the frame can pick, and back on after the controller reset it", () => {
    const { live, state } = fakeLive(false);
    syncSelectMode(live, true, () => null);
    expect(live.setPickEnabled).not.toHaveBeenCalled();
    state.canPick = true;
    syncSelectMode(live, true, () => null);
    expect(live.setPickEnabled).toHaveBeenLastCalledWith(true);
    syncSelectMode(live, true, () => null);
    expect(live.setPickEnabled).toHaveBeenCalledTimes(1);
    state.picking = false; // previewDraft turned it off
    syncSelectMode(live, true, () => null);
    expect(live.setPickEnabled).toHaveBeenCalledTimes(2);
  });
  it("turns picking off only when it is on", () => {
    const { live, state } = fakeLive(true);
    syncSelectMode(live, false, () => null);
    expect(live.setPickEnabled).not.toHaveBeenCalled();
    state.picking = true;
    syncSelectMode(live, false, () => null);
    expect(live.setPickEnabled).toHaveBeenCalledWith(false);
  });
  it("selects the edited element again after picking is back on, and only when the frame can pick", () => {
    const { live, state } = fakeLive(false);
    const take = vi.fn<() => string | null>(() => "a.tsx:1:9");
    syncSelectMode(live, true, take);
    expect(take).not.toHaveBeenCalled();
    state.canPick = true;
    syncSelectMode(live, true, take);
    expect(live.selectElement).toHaveBeenCalledWith("a.tsx:1:9");
    expect(live.setPickEnabled.mock.invocationCallOrder[0]).toBeLessThan(live.selectElement.mock.invocationCallOrder[0]);
  });
  it("does not select again in Interact", () => {
    const { live } = fakeLive(true);
    const take = vi.fn<() => string | null>(() => "a.tsx:1:9");
    syncSelectMode(live, false, take);
    expect(take).not.toHaveBeenCalled();
    expect(live.selectElement).not.toHaveBeenCalled();
  });
});
