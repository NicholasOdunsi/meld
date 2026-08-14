import { describe, expect, it } from "vitest";
import { shouldSeedDesignScreens } from "./design-screen-seed";

const base = { hasUnseededActionNodes: true, access: "edit" as const, storeStatus: "synced-remote", hasSeeded: false };

describe("shouldSeedDesignScreens", () => {
  it("seeds when action nodes lack screens, editor, synced-remote, not yet seeded", () => {
    expect(shouldSeedDesignScreens(base)).toBe(true);
  });
  it("does not seed when nothing is unseeded", () => {
    expect(shouldSeedDesignScreens({ ...base, hasUnseededActionNodes: false })).toBe(false);
  });
  it("does not seed for viewers", () => {
    expect(shouldSeedDesignScreens({ ...base, access: "view" })).toBe(false);
  });
  it("waits for synced-remote", () => {
    expect(shouldSeedDesignScreens({ ...base, storeStatus: "synced-local" })).toBe(false);
  });
  it("is one-shot", () => {
    expect(shouldSeedDesignScreens({ ...base, hasSeeded: true })).toBe(false);
  });
});
