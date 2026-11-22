import { describe, expect, it, vi } from "vitest";
import { liveScreenActions } from "./live-actions";

const bounds = { x: 0, y: 0, width: 10, height: 10 };
const screenSelection = { kind: "screen" as const, ids: ["e"], bounds, screenId: "ds-a" };

describe("liveScreenActions", () => {
  it("offers Open live and Code for a sleeping screen", () => {
    const onOpenLive = vi.fn();
    const onCode = vi.fn();
    const actions = liveScreenActions(screenSelection, false, { onOpenLive, onCode });
    expect(actions.map((action) => action.label)).toEqual(["Open live", "Code"]);
    actions[0].onPress();
    actions[1].onPress();
    expect(onOpenLive).toHaveBeenCalledWith("ds-a");
    expect(onCode).toHaveBeenCalledWith("ds-a");
  });
  it("drops Open live while the screen is awake, and offers nothing for shapes", () => {
    expect(liveScreenActions(screenSelection, true, { onOpenLive: vi.fn(), onCode: vi.fn() }).map((action) => action.label)).toEqual(["Code"]);
    expect(liveScreenActions({ kind: "shape", ids: ["r"], bounds, screenId: null }, false, { onOpenLive: vi.fn(), onCode: vi.fn() })).toEqual([]);
  });
  it("puts an Edit toggle before Code for an awake, editable screen", () => {
    const onToggle = vi.fn();
    const actions = liveScreenActions(screenSelection, true, { onOpenLive: vi.fn(), onCode: vi.fn() }, { pressed: true, onToggle });
    expect(actions.map((action) => action.label)).toEqual(["Edit", "Code"]);
    expect(actions[0].pressed).toBe(true);
    actions[0].onPress();
    expect(onToggle).toHaveBeenCalledOnce();
  });
  it("offers no Edit on a sleeping screen, or when none is given", () => {
    const handlers = { onOpenLive: vi.fn(), onCode: vi.fn() };
    expect(liveScreenActions(screenSelection, false, handlers, { pressed: false, onToggle: vi.fn() }).map((action) => action.label)).toEqual(["Open live", "Code"]);
    expect(liveScreenActions(screenSelection, true, handlers).map((action) => action.label)).toEqual(["Code"]);
  });
});
