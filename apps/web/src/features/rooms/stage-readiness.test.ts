import { describe, expect, it } from "vitest";
import {
  computeStageChecklist,
  stageAfter,
  stageBefore,
  type StageReadinessSignals,
} from "./stage-readiness";

const EMPTY: StageReadinessSignals = {
  participantCount: 1,
  hasHumanMessage: false,
  hasAgentReply: false,
  hasPrd: false,
  prdStatus: null,
  userFlowCount: 0,
  decisionCount: 0,
  designAssetCount: 0,
  manualChecks: { problem_framed: false, design_reviewed: false },
  builtScreenCount: 0,
  designReferenceCount: 0,
  hasDesignProfile: false,
  designReviewedAt: null,
  latestDesignRevisionAt: null,
};

function withSignals(
  overrides: Partial<StageReadinessSignals>,
): StageReadinessSignals {
  return { ...EMPTY, ...overrides };
}

describe("stage ordering", () => {
  it("walks discovery -> define -> design -> development", () => {
    expect(stageAfter("discovery")).toBe("define");
    expect(stageAfter("define")).toBe("design");
    expect(stageAfter("design")).toBe("development");
    expect(stageAfter("development")).toBeNull();

    expect(stageBefore("discovery")).toBeNull();
    expect(stageBefore("development")).toBe("design");
  });
});

describe("discovery", () => {
  it("starts empty with problem-framing as the only required item", () => {
    const checklist = computeStageChecklist("discovery", EMPTY);
    expect(checklist.totalCount).toBe(3);
    expect(checklist.doneCount).toBe(0);
    expect(checklist.isReady).toBe(false);
    const required = checklist.items.filter((item) => item.required);
    expect(required.map((item) => item.key)).toEqual(["problem_framed"]);
    // Every discovery item is auto-derived now — nothing to hand-confirm.
    expect(checklist.items.every((item) => item.kind === "auto")).toBe(true);
  });

  it("frames the problem once a person spoke and an agent replied", () => {
    const oneSided = computeStageChecklist(
      "discovery",
      withSignals({ hasHumanMessage: true }),
    );
    const framed = oneSided.items.find((item) => item.key === "problem_framed");
    expect(framed?.done).toBe(false);
    expect(oneSided.isReady).toBe(false);

    const exchange = computeStageChecklist(
      "discovery",
      withSignals({ hasHumanMessage: true, hasAgentReply: true }),
    );
    expect(
      exchange.items.find((item) => item.key === "problem_framed")?.done,
    ).toBe(true);
    // Ready on the framed problem alone — context is only a supporting signal.
    expect(exchange.isReady).toBe(true);
  });

  it("counts an upload or a user flow as context added", () => {
    const uploaded = computeStageChecklist(
      "discovery",
      withSignals({ designAssetCount: 2 }),
    );
    expect(
      uploaded.items.find((item) => item.key === "context_added")?.done,
    ).toBe(true);
    const flow = computeStageChecklist(
      "discovery",
      withSignals({ userFlowCount: 1 }),
    );
    expect(flow.items.find((item) => item.key === "context_added")?.done).toBe(
      true,
    );
  });
});

describe("later stages", () => {
  it("auto-checks Define items and requires all of them", () => {
    const checklist = computeStageChecklist(
      "define",
      withSignals({
        hasPrd: true,
        userFlowCount: 1,
        decisionCount: 3,
        prdStatus: "accepted",
      }),
    );
    expect(checklist.doneCount).toBe(4);
    expect(checklist.isReady).toBe(true);
    expect(checklist.items.every((item) => item.required)).toBe(true);
  });

  it("keeps a drafted-but-unaccepted PRD one short of ready", () => {
    const checklist = computeStageChecklist(
      "define",
      withSignals({ hasPrd: true, userFlowCount: 1, decisionCount: 1 }),
    );
    expect(checklist.isReady).toBe(false);
    const accepted = checklist.items.find(
      (item) => item.key === "prd_accepted",
    );
    expect(accepted?.done).toBe(false);
    expect(accepted?.detail).toBe("awaiting acceptance");
  });

  it("gates Design on a manual review even when a screen exists", () => {
    const checklist = computeStageChecklist(
      "design",
      withSignals({ builtScreenCount: 1 }),
    );
    expect(checklist.doneCount).toBe(1);
    expect(checklist.isReady).toBe(false);
    const reviewed = checklist.items.find(
      (item) => item.key === "design_reviewed",
    );
    expect(reviewed?.kind).toBe("manual");
    expect(reviewed?.manualKey).toBe("design_reviewed");
    expect(reviewed?.done).toBe(false);
  });

  it("treats development as a terminal handoff summary with no next stage", () => {
    const checklist = computeStageChecklist(
      "development",
      withSignals({ hasPrd: true, prdStatus: "accepted", designAssetCount: 6 }),
    );
    expect(checklist.isTerminal).toBe(true);
    expect(checklist.nextStage).toBeNull();
    expect(checklist.previousStage).toBe("design");
    const journey = checklist.items.find((item) => item.key === "prd_journey");
    expect(journey?.detail).toBe("final");
  });
});

function signals(over: Partial<StageReadinessSignals> = {}): StageReadinessSignals {
  return {
    participantCount: 1, hasHumanMessage: true, hasAgentReply: true, hasPrd: true,
    prdStatus: "accepted", userFlowCount: 0, decisionCount: 0, designAssetCount: 0,
    builtScreenCount: 0, designReferenceCount: 0, hasDesignProfile: false,
    designReviewedAt: null, latestDesignRevisionAt: null,
    manualChecks: { problem_framed: false, design_reviewed: false },
    ...over,
  };
}
function designItem(s: StageReadinessSignals, key: string) {
  return computeStageChecklist("design", s).items.find((i) => i.key === key);
}

describe("design stage — screens designed", () => {
  it("is done with a built screen", () => {
    expect(designItem(signals({ builtScreenCount: 2 }), "screens_designed")?.done).toBe(true);
  });
  it("is done with a Figma reference and no screens", () => {
    expect(designItem(signals({ designReferenceCount: 1 }), "screens_designed")?.done).toBe(true);
  });
  it("is not done with neither, and is required", () => {
    const item = designItem(signals(), "screens_designed");
    expect(item?.done).toBe(false);
    expect(item?.required).toBe(true);
  });
  it("no longer includes flows_refined or design_assets", () => {
    const keys = computeStageChecklist("design", signals()).items.map((i) => i.key);
    expect(keys).not.toContain("flows_refined");
    expect(keys).not.toContain("design_assets");
  });
});

describe("design stage — design system (supporting)", () => {
  it("is not required and reflects hasDesignProfile", () => {
    const off = designItem(signals(), "design_system");
    expect(off?.required).toBe(false);
    expect(off?.done).toBe(false);
    expect(designItem(signals({ hasDesignProfile: true }), "design_system")?.done).toBe(true);
  });
});

describe("design stage — review staleness", () => {
  const reviewed = { manualChecks: { problem_framed: false, design_reviewed: true } } as const;
  it("done when reviewed and no revisions exist", () => {
    expect(designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T10:00:00.000Z" }), "design_reviewed")?.done).toBe(true);
  });
  it("done when review is at/after the latest revision", () => {
    expect(designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T12:00:00.000Z", latestDesignRevisionAt: "2026-08-14T11:00:00.000Z" }), "design_reviewed")?.done).toBe(true);
  });
  it("NOT done + 'design changed since review' when a revision is newer", () => {
    const item = designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T10:00:00.000Z", latestDesignRevisionAt: "2026-08-14T11:00:00.000Z" }), "design_reviewed");
    expect(item?.done).toBe(false);
    expect(item?.detail).toBe("design changed since review");
  });
  it("not done when never reviewed", () => {
    expect(designItem(signals(), "design_reviewed")?.done).toBe(false);
  });
});
