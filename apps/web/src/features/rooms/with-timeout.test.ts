import { describe, expect, it, vi } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves when the work finishes in time", async () => {
    await expect(withTimeout(async () => 42, 1000, "too slow")).resolves.toBe(
      42,
    );
  });

  it("rejects when the work never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(
      () => new Promise<number>(() => {}),
      30_000,
      "extraction timed out",
    );
    const assertion = expect(pending).rejects.toThrow("extraction timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.useRealTimers();
  });
});
