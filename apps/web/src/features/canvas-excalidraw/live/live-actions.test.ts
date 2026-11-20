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
});
