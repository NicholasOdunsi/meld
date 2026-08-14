import { createShapeId } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";
import {
  reconcileScreenFrames,
  SCREEN_FRAME_COLOR,
  screenFrameId,
  screenFrameRecord,
} from "./screen-frame-reconcile";

describe("screenFrameId", () => {
  it("uses the gateway's deterministic screen id seed", () => {
    expect(screenFrameId("screen-1")).toBe(createShapeId("screen-screen-1"));
    expect(screenFrameId("screen-1")).toBe(screenFrameId("screen-1"));
    expect(screenFrameId("screen-1")).not.toBe(screenFrameId("screen-2"));
  });
});

describe("screenFrameRecord", () => {
  it("builds the same built-in frame projection as the gateway helper", () => {
    const id = "11111111-1111-4111-8111-111111111111";

    expect(screenFrameRecord({
      id,
      name: "Checkout",
      x: 120,
      y: 240,
      pageId: "page:canvas",
      index: "a4",
    })).toEqual({
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
      props: {
        w: 390,
        h: 844,
        name: "Checkout",
        color: SCREEN_FRAME_COLOR,
      },
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
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("leaves an already-projected row alone", () => {
    const result = reconcileScreenFrames(
      [{ id: screenFrameId("s1"), meldScreenId: "s1" }],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("flags a frame whose screen row is gone as an orphan", () => {
    const result = reconcileScreenFrames(
      [{ id: screenFrameId("gone"), meldScreenId: "gone" }],
      [],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([screenFrameId("gone")]);
    expect(result.duplicates).toEqual([]);
  });

  it("ignores non-screen frames", () => {
    const result = reconcileScreenFrames(
      [{ id: "shape:flow-frame", meldScreenId: null }],
      [],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });

  it("classifies later frames for the same screen as duplicates", () => {
    const result = reconcileScreenFrames(
      [
        { id: "shape:screen-s1", meldScreenId: "s1" },
        { id: "shape:screen-s1-copy", meldScreenId: "s1" },
      ],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual(["shape:screen-s1-copy"]);
  });

  it("keeps the deterministic projection when a copy appears first", () => {
    const deterministicId = screenFrameId("s1");
    const result = reconcileScreenFrames(
      [
        { id: "shape:screen-s1-copy", meldScreenId: "s1" },
        { id: deterministicId, meldScreenId: "s1" },
      ],
      [{ id: "s1", name: "A", canvasX: 0, canvasY: 0 }],
    );

    expect(result.toCreate).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.duplicates).toEqual(["shape:screen-s1-copy"]);
  });

  it("preserves source ordering in both parts of the diff", () => {
    const result = reconcileScreenFrames(
      [
        { id: "shape:orphan-2", meldScreenId: "orphan-2" },
        { id: "shape:existing", meldScreenId: "existing" },
        { id: "shape:orphan-1", meldScreenId: "orphan-1" },
      ],
      [
        { id: "missing-2", name: "B", canvasX: 2, canvasY: 2 },
        { id: "existing", name: "Existing", canvasX: 0, canvasY: 0 },
        { id: "missing-1", name: "A", canvasX: 1, canvasY: 1 },
      ],
    );

    expect(result.toCreate).toEqual(["missing-2", "missing-1"]);
    expect(result.orphans).toEqual(["shape:orphan-2", "shape:orphan-1"]);
    expect(result.duplicates).toEqual([]);
  });
});
