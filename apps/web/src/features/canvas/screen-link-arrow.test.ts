import { createBindingId } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";
import {
  meldLinkFromMeta,
  reconcileScreenLinks,
  screenLinkArrowId,
  screenLinkArrowRecords,
  screenLinkFromArrow,
  type ExistingLinkArrow,
  type ScreenLinkRow,
} from "./screen-link-arrow";

const SCREEN_A = "a0000000-0000-4000-8000-00000000000a";
const SCREEN_B = "b0000000-0000-4000-8000-00000000000b";
const SCREEN_C = "c0000000-0000-4000-8000-00000000000c";

describe("meldLinkFromMeta", () => {
  it("parses a complete meldLink blob", () => {
    expect(
      meldLinkFromMeta({
        meldLink: {
          sourceScreenId: SCREEN_A,
          actionId: "go",
          targetScreenId: SCREEN_B,
        },
      }),
    ).toEqual({ sourceScreenId: SCREEN_A, actionId: "go", targetScreenId: SCREEN_B });
  });

  it("returns null for missing or partial meta", () => {
    expect(meldLinkFromMeta(null)).toBeNull();
    expect(meldLinkFromMeta({})).toBeNull();
    expect(meldLinkFromMeta({ meldLink: { sourceScreenId: SCREEN_A } })).toBeNull();
    expect(meldLinkFromMeta({ meldLink: 42 })).toBeNull();
  });
});

describe("screenLinkFromArrow", () => {
  it("returns null when the shape is not an arrow", () => {
    expect(
      screenLinkFromArrow(
        { type: "frame" },
        { startScreenId: SCREEN_A, endScreenId: SCREEN_B },
      ),
    ).toBeNull();
  });

  it("returns null when an end is unbound", () => {
    expect(
      screenLinkFromArrow(
        { type: "arrow" },
        { startScreenId: SCREEN_A, endScreenId: null },
      ),
    ).toBeNull();
  });

  it("returns null when both ends bind the same screen", () => {
    expect(
      screenLinkFromArrow(
        { type: "arrow" },
        { startScreenId: SCREEN_A, endScreenId: SCREEN_A },
      ),
    ).toBeNull();
  });

  it("extracts an unpicked link for a plain arrow between two frames", () => {
    expect(
      screenLinkFromArrow(
        { type: "arrow" },
        { startScreenId: SCREEN_A, endScreenId: SCREEN_B },
      ),
    ).toEqual({ sourceScreenId: SCREEN_A, targetScreenId: SCREEN_B });
  });

  it("carries a stored actionId when its source/target still match the terminals", () => {
    expect(
      screenLinkFromArrow(
        {
          type: "arrow",
          meta: {
            meldLink: {
              sourceScreenId: SCREEN_A,
              actionId: "go",
              targetScreenId: SCREEN_B,
            },
          },
        },
        { startScreenId: SCREEN_A, endScreenId: SCREEN_B },
      ),
    ).toEqual({ sourceScreenId: SCREEN_A, targetScreenId: SCREEN_B, actionId: "go" });
  });

  it("drops a stale actionId when the arrow was dragged onto a different frame", () => {
    expect(
      screenLinkFromArrow(
        {
          type: "arrow",
          meta: {
            meldLink: {
              sourceScreenId: SCREEN_A,
              actionId: "go",
              targetScreenId: SCREEN_B,
            },
          },
        },
        { startScreenId: SCREEN_A, endScreenId: SCREEN_C },
      ),
    ).toEqual({ sourceScreenId: SCREEN_A, targetScreenId: SCREEN_C });
  });
});

describe("reconcileScreenLinks", () => {
  const row: ScreenLinkRow = {
    sourceScreenId: SCREEN_A,
    actionId: "go",
    targetScreenId: SCREEN_B,
  };

  it("creates an arrow for a row with no matching arrow", () => {
    expect(reconcileScreenLinks([row], [])).toEqual({
      toCreate: [row],
      toRemove: [],
    });
  });

  it("leaves a matching arrow untouched", () => {
    const arrow: ExistingLinkArrow = { id: "shape:link", meldLink: row };
    expect(reconcileScreenLinks([row], [arrow])).toEqual({
      toCreate: [],
      toRemove: [],
    });
  });

  it("removes an arrow whose row is gone", () => {
    const arrow: ExistingLinkArrow = { id: "shape:link", meldLink: row };
    expect(reconcileScreenLinks([], [arrow])).toEqual({
      toCreate: [],
      toRemove: ["shape:link"],
    });
  });

  it("replaces an arrow whose target no longer matches the row", () => {
    const arrow: ExistingLinkArrow = {
      id: "shape:link",
      meldLink: { sourceScreenId: SCREEN_A, actionId: "go", targetScreenId: SCREEN_C },
    };
    expect(reconcileScreenLinks([row], [arrow])).toEqual({
      toCreate: [row],
      toRemove: ["shape:link"],
    });
  });

  it("keeps the first arrow and removes a duplicate for the same key", () => {
    const first: ExistingLinkArrow = { id: "shape:link-1", meldLink: row };
    const dup: ExistingLinkArrow = { id: "shape:link-2", meldLink: row };
    expect(reconcileScreenLinks([row], [first, dup])).toEqual({
      toCreate: [],
      toRemove: ["shape:link-2"],
    });
  });

  it("ignores arrows that carry no meldLink", () => {
    const plain: ExistingLinkArrow = { id: "shape:plain", meldLink: null };
    expect(reconcileScreenLinks([], [plain])).toEqual({
      toCreate: [],
      toRemove: [],
    });
  });
});

describe("screenLinkArrowRecords", () => {
  it("builds a deterministic arrow bound to both frames and tagged with the override", () => {
    const row: ScreenLinkRow = {
      sourceScreenId: SCREEN_A,
      actionId: "go",
      targetScreenId: SCREEN_B,
    };
    const { arrow, bindings } = screenLinkArrowRecords({
      row,
      startFrameId: "shape:frame-a",
      endFrameId: "shape:frame-b",
      pageId: "page:canvas",
      index: "a1",
    });

    expect(arrow.id).toBe(screenLinkArrowId(SCREEN_A, "go"));
    expect(arrow.type).toBe("arrow");
    expect(arrow.parentId).toBe("page:canvas");
    expect(arrow.meta).toEqual({ meldLink: row });

    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toMatchObject({
      id: createBindingId(`screen-link-${SCREEN_A}-go:start`),
      fromId: arrow.id,
      toId: "shape:frame-a",
      props: { terminal: "start" },
    });
    expect(bindings[1]).toMatchObject({
      id: createBindingId(`screen-link-${SCREEN_A}-go:end`),
      fromId: arrow.id,
      toId: "shape:frame-b",
      props: { terminal: "end" },
    });
  });
});
