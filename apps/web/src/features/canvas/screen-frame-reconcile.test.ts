import { createShapeId } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";
import {
  reconcileScreenFrames,
  SCREEN_FRAME_COLOR,
  screenFrameId,
  screenFrameRecord,
} from "./screen-frame-reconcile";

// A size that is NOT the legacy default (390x844), so the "snap to form factor"
// logic never fires for these frames and the toCreate/orphan/duplicate cases
// stay isolated from resizing.
const SIZED = { w: 800, h: 600 };

describe("screenFrameId", () => {
  it("uses the gateway's deterministic screen id seed", () => {
    expect(screenFrameId("screen-1")).toBe(createShapeId("screen-screen-1"));
    expect(screenFrameId("screen-1")).toBe(screenFrameId("screen-1"));
    expect(screenFrameId("screen-1")).not.toBe(screenFrameId("screen-2"));
  });
});

describe("screenFrameRecord", () => {
  it("sizes a frame by its form factor (default desktop)", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const base = {
      id,
      name: "Checkout",
      x: 120,
      y: 240,
      pageId: "page:canvas",
      index: "a4",
    };

    expect(screenFrameRecord(base).props).toMatchObject({ w: 1280, h: 832 });
    expect(
      screenFrameRecord({ ...base, formFactor: "mobile" }).props,
    ).toMatchObject({ w: 390, h: 844 });
    expect(
      screenFrameRecord({ ...base, formFactor: "tablet" }).props,
    ).toMatchObject({ w: 834, h: 1112 });

    expect(screenFrameRecord(base)).toEqual({
      id: screenFrameId(id),
      typeName: "shape",
      type: "frame",
      x: 120,
      y: 240,
      rotation: 0,
      index: "a4",
      parentId: "page:canvas",
      isLocked: false,
      opacity: 1,
      props: { w: 1280, h: 832, name: "Checkout", color: SCREEN_FRAME_COLOR },
      meta: { meldScreenId: id },
    });
  });
});

describe("reconcileScreenFrames", () => {
  it("creates frames for rows without a projection", () => {
    const result = reconcileScreenFrames(
      [],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.toCreate).toEqual(["s1"]);
    expect(result.toResize).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("leaves an already-projected row alone", () => {
    const result = reconcileScreenFrames(
      [{ id: screenFrameId("s1"), meldScreenId: "s1", ...SIZED }],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.toResize).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("flags a frame whose screen row is gone as an orphan", () => {
    const result = reconcileScreenFrames(
      [{ id: screenFrameId("gone"), meldScreenId: "gone", ...SIZED }],
      [],
    );

    expect(result.orphans).toEqual([screenFrameId("gone")]);
    expect(result.toResize).toEqual([]);
  });

  it("ignores non-screen frames", () => {
    const result = reconcileScreenFrames(
      [{ id: "shape:flow-frame", meldScreenId: null, ...SIZED }],
      [],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("classifies later frames for the same screen as duplicates", () => {
    const result = reconcileScreenFrames(
      [
        { id: "shape:screen-s1", meldScreenId: "s1", ...SIZED },
        { id: "shape:screen-s1-copy", meldScreenId: "s1", ...SIZED },
      ],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.duplicates).toEqual(["shape:screen-s1-copy"]);
  });

  it("keeps the deterministic projection when a copy appears first", () => {
    const deterministicId = screenFrameId("s1");
    const result = reconcileScreenFrames(
      [
        { id: "shape:screen-s1-copy", meldScreenId: "s1", ...SIZED },
        { id: deterministicId, meldScreenId: "s1", ...SIZED },
      ],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.duplicates).toEqual(["shape:screen-s1-copy"]);
  });

  it("preserves source ordering in both parts of the diff", () => {
    const result = reconcileScreenFrames(
      [
        { id: "shape:orphan-2", meldScreenId: "orphan-2", ...SIZED },
        { id: "shape:existing", meldScreenId: "existing", ...SIZED },
        { id: "shape:orphan-1", meldScreenId: "orphan-1", ...SIZED },
      ],
      [
        { id: "missing-2", name: "B", canvasX: 2, canvasY: 2 },
        { id: "existing", name: "Existing", canvasX: 0, canvasY: 0 },
        { id: "missing-1", name: "A", canvasX: 1, canvasY: 1 },
      ],
    );

    expect(result.toCreate).toEqual(["missing-2", "missing-1"]);
    expect(result.orphans).toEqual(["shape:orphan-2", "shape:orphan-1"]);
  });

  describe("toResize (snap a legacy-default frame to its form factor)", () => {
    const legacyFrame = (screenId: string) => ({
      id: screenFrameId(screenId),
      meldScreenId: screenId,
      w: 390,
      h: 844,
    });

    it("snaps a legacy-default frame to a desktop screen's size", () => {
      const result = reconcileScreenFrames(
        [legacyFrame("s1")],
        [{ id: "s1", name: "A", canvasX: 0, canvasY: 0, formFactor: "desktop" }],
      );
      expect(result.toResize).toEqual([
        { id: screenFrameId("s1"), w: 1280, h: 832 },
      ]);
    });

    it("defaults an unset form factor to desktop", () => {
      const result = reconcileScreenFrames(
        [legacyFrame("s1")],
        [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
      );
      expect(result.toResize).toEqual([
        { id: screenFrameId("s1"), w: 1280, h: 832 },
      ]);
    });

    it("leaves a legacy-default frame alone for a mobile screen (already matches)", () => {
      const result = reconcileScreenFrames(
        [legacyFrame("s1")],
        [{ id: "s1", name: "A", canvasX: 0, canvasY: 0, formFactor: "mobile" }],
      );
      expect(result.toResize).toEqual([]);
    });

    it("never resizes a frame the user has sized to something else", () => {
      const result = reconcileScreenFrames(
        [{ id: screenFrameId("s1"), meldScreenId: "s1", w: 1000, h: 700 }],
        [{ id: "s1", name: "A", canvasX: 0, canvasY: 0, formFactor: "desktop" }],
      );
      expect(result.toResize).toEqual([]);
    });
  });
});
