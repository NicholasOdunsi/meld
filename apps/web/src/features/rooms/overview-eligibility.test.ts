import { describe, expect, it } from "vitest";
import {
  countArtifacts,
  hasOverviewTab,
  type RoomArtifactState,
} from "./overview-eligibility";

const EMPTY: RoomArtifactState = {
  hasUserFlow: false,
  hasPrd: false,
  hasPrdTask: false,
  hasBuiltDesignScreen: false,
  decisionCount: 0,
  stage: "discovery",
};

describe("countArtifacts", () => {
  it("counts nothing in a fresh room", () => {
    expect(countArtifacts(EMPTY)).toBe(0);
  });

  it("counts a user flow", () => {
    expect(countArtifacts({ ...EMPTY, hasUserFlow: true })).toBe(1);
  });

  // Mirrors surfaces.ts: a queued PRD task counts the same as a PRD.
  it("counts a queued PRD task as a PRD", () => {
    expect(countArtifacts({ ...EMPTY, hasPrdTask: true })).toBe(1);
  });

  it("does not double-count a PRD that also has a task", () => {
    expect(countArtifacts({ ...EMPTY, hasPrd: true, hasPrdTask: true })).toBe(1);
  });

  it("counts decisions only when there is at least one", () => {
    expect(countArtifacts({ ...EMPTY, decisionCount: 0 })).toBe(0);
    expect(countArtifacts({ ...EMPTY, decisionCount: 3 })).toBe(1);
  });

  // Mirrors surfaces.ts: prototype is reachable from the design stage on,
  // before the first screen is built.
  it("counts a prototype once the room reaches design", () => {
    expect(countArtifacts({ ...EMPTY, stage: "design" })).toBe(1);
  });

  it("counts a prototype from a built screen at any stage", () => {
    expect(countArtifacts({ ...EMPTY, hasBuiltDesignScreen: true })).toBe(1);
  });
});

describe("hasOverviewTab", () => {
  it("stays hidden with no artifacts", () => {
    expect(hasOverviewTab(EMPTY)).toBe(false);
  });

  it("stays hidden with exactly one artifact", () => {
    expect(hasOverviewTab({ ...EMPTY, hasPrd: true })).toBe(false);
  });

  it("appears at two artifacts", () => {
    expect(hasOverviewTab({ ...EMPTY, hasPrd: true, hasUserFlow: true })).toBe(
      true,
    );
  });

  it("appears with more than two", () => {
    expect(
      hasOverviewTab({
        ...EMPTY,
        hasPrd: true,
        hasUserFlow: true,
        decisionCount: 2,
      }),
    ).toBe(true);
  });
});
