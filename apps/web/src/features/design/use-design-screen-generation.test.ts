import { describe, expect, it } from "vitest";
import { aggregateStatus } from "./use-design-screen-generation";

describe("aggregateStatus", () => {
  it("is running while any task is active", () => {
    expect(aggregateStatus(["t1"], null)).toBe("running");
  });
  it("falls back to the last terminal outcome when idle", () => {
    expect(aggregateStatus([], "completed")).toBe("completed");
    expect(aggregateStatus([], "failed")).toBe("failed");
    expect(aggregateStatus([], null)).toBe("idle");
  });
});
