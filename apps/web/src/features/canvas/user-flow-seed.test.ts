import { describe, expect, it } from "vitest";
import { shouldSeedJourneyFlow } from "./user-flow-seed";

const base = {
  hasSeedFlow: true,
  access: "edit" as const,
  storeStatus: "synced-remote",
  canvasIsEmpty: true,
  hasSeeded: false,
};

describe("shouldSeedJourneyFlow", () => {
  it("seeds an empty, synced canvas for an editor with a seed flow", () => {
    expect(shouldSeedJourneyFlow(base)).toBe(true);
  });

  it("never seeds without a seed flow", () => {
    expect(shouldSeedJourneyFlow({ ...base, hasSeedFlow: false })).toBe(false);
  });

  it("never seeds for a viewer", () => {
    expect(shouldSeedJourneyFlow({ ...base, access: "view" })).toBe(false);
  });

  it("waits for synced-remote (an empty synced-local canvas may be un-synced)", () => {
    expect(shouldSeedJourneyFlow({ ...base, storeStatus: "synced-local" })).toBe(
      false,
    );
    expect(shouldSeedJourneyFlow({ ...base, storeStatus: "loading" })).toBe(
      false,
    );
  });

  it("never seeds over a non-empty canvas", () => {
    expect(shouldSeedJourneyFlow({ ...base, canvasIsEmpty: false })).toBe(false);
  });

  it("is one-shot once seeded", () => {
    expect(shouldSeedJourneyFlow({ ...base, hasSeeded: true })).toBe(false);
  });
});
