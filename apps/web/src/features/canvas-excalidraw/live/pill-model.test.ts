import { describe, expect, it, vi } from "vitest";
import { pillSpecs } from "./pill-model";
import type { PillItem } from "../chrome/screen-pill";

const frame = { id: "f1", bounds: { x: 0, y: 0, width: 390, height: 844 } };
const screenSel = (id = "f1", screenId = "ds-a") => ({ kind: "screen" as const, ids: [id], screenId, bounds: id === "f1" ? frame.bounds : { x: 500, y: 0, width: 390, height: 844 } });
const labels = (items: readonly PillItem[]) => items.map((i) => i.kind === "divider" ? "|" : i.label);
const base = {
  phase: "running" as const, access: "edit" as const, hasDraft: true, editable: true, liveFrame: frame, selection: null,
  edit: { pressed: false, onToggle: vi.fn() }, history: { canUndo: false, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn() },
  onOpenLive: vi.fn(), onCode: vi.fn(), awakeScreenId: "ds-a",
};

describe("pillSpecs", () => {
  it("shows the awake, editable screen's pill under its frame when nothing is selected on the board", () => {
    const specs = pillSpecs(base);
    expect(specs).toHaveLength(1);
    expect(specs[0].bounds).toEqual(frame.bounds);
    expect(labels(specs[0].items)).toEqual(["Edit", "|", "Undo", "Redo", "|", "Code"]);
  });
  it("shows it when something else is selected, not the frame", () => {
    const specs = pillSpecs({ ...base, selection: { kind: "shape", ids: ["r"], screenId: null, bounds: { x: 900, y: 0, width: 5, height: 5 } } });
    expect(specs.map((s) => s.key)).toEqual(["live:f1"]);
  });
  it("has one pill, not two, when the awake frame is selected", () => {
    expect(pillSpecs({ ...base, selection: screenSel() })).toHaveLength(1);
  });
  it("an awake read-only screen has a pill only while its frame is selected, with just Code", () => {
    const readOnly = { ...base, editable: false, history: null };
    expect(pillSpecs(readOnly)).toEqual([]);
    const specs = pillSpecs({ ...readOnly, selection: screenSel() });
    expect(specs.map((s) => labels(s.items))).toEqual([["Code"]]);
  });
  it("a selected sleeping screen gets Open live and Code, in addition to the awake pill", () => {
    const specs = pillSpecs({ ...base, selection: screenSel("f2", "ds-b") });
    expect(specs.map((s) => labels(s.items))).toEqual([["Edit", "|", "Undo", "Redo", "|", "Code"], ["Open live", "Code"]]);
    (specs[1].items[0] as { onPress: () => void }).onPress();
    expect(base.onOpenLive).toHaveBeenCalledWith("ds-b", "f2");
  });
  it("asleep: only a selected screen has a pill", () => {
    const asleep = { ...base, phase: "asleep" as const, liveFrame: null, awakeScreenId: null };
    expect(pillSpecs(asleep)).toEqual([]);
    expect(pillSpecs({ ...asleep, selection: screenSel() }).map((s) => labels(s.items))).toEqual([["Open live", "Code"]]);
  });
  it("a viewer has no Edit pill for an awake screen", () => {
    expect(pillSpecs({ ...base, access: "view" })).toEqual([]);
  });
  it("shapes and text only get the host's actions", () => {
    const sel = { kind: "text" as const, ids: ["t"], screenId: null, bounds: { x: 1, y: 1, width: 5, height: 5 } };
    expect(pillSpecs({ ...base, liveFrame: null, awakeScreenId: null, selection: sel })).toEqual([]);
    const host: PillItem[] = [{ kind: "button", label: "Add to chat", icon: "Add to chat", onPress: vi.fn() }];
    expect(pillSpecs({ ...base, liveFrame: null, awakeScreenId: null, selection: sel, hostShapeItems: host }).map((s) => labels(s.items))).toEqual([["Add to chat"]]);
  });
});
