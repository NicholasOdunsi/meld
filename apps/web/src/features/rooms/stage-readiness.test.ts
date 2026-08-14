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

  it("gates Design on a manual review even when assets exist", () => {
    const checklist = computeStageChecklist(
      "design",
      withSignals({ userFlowCount: 1, designAssetCount: 6 }),
    );
    expect(checklist.doneCount).toBe(2);
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
