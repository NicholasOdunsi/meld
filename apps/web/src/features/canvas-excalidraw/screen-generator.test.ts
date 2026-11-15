import { describe, expect, it, vi } from "vitest";
import { buildWithFallback, describeOutcome, OwnAiUnavailable, type ScreenGenerator } from "./screen-generator";

const request = { width: 480, height: 640, geometry: [] };
const own: ScreenGenerator = async () => ({ screenId: "own-1", html: "<p>own</p>", provider: "claude" });
const deepseek: ScreenGenerator = async () => ({ screenId: "gen-1", html: "<p>ds</p>", provider: null });
const run = (ownAi: ScreenGenerator | null, fallback: ScreenGenerator = deepseek, signal?: AbortSignal) =>
  buildWithFallback({ request, instruction: "x", ownAi, fallback, signal });

describe("buildWithFallback", () => {
  it("uses the owner's AI when it works", async () => {
    const fallback = vi.fn(deepseek);
    const out = await run(own, fallback);
    expect(out).toMatchObject({ via: "own-ai", provider: "claude", screenId: "own-1" });
    expect(out.fellBackBecause).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });
  it("falls back to DeepSeek, saying why, for each unavailable reason", async () => {
    for (const reason of ["no_connection", "usage_limit", "needs_sign_in", "failed", "timeout"] as const) {
      const out = await run(async () => { throw new OwnAiUnavailable(reason); });
      expect(out).toMatchObject({ via: "deepseek", fellBackBecause: reason, screenId: "gen-1" });
    }
  });
  it("treats an unexpected error from the owner's AI as a failure and falls back", async () => {
    const out = await run(async () => { throw new TypeError("boom"); });
    expect(out.fellBackBecause).toBe("failed");
  });
  it("falls back with no_connection, without calling anything, when there is no own-AI generator", async () => {
    expect((await run(null)).fellBackBecause).toBe("no_connection");
  });
  it("does not fall back when the owner cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const fallback = vi.fn(deepseek);
    await expect(run(async () => { throw new DOMException("x", "AbortError"); }, fallback, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback).not.toHaveBeenCalled();
  });
  it("lets a fallback failure through", async () => {
    await expect(run(null, async () => { throw new Error("deepseek down"); })).rejects.toThrow("deepseek down");
  });
});

describe("describeOutcome", () => {
  it("names the AI that built it, or why DeepSeek stepped in", () => {
    expect(describeOutcome({ screenId: "a", html: "", via: "own-ai", provider: "claude" })).toBe("Built with your AI (claude).");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "usage_limit" })).toBe("Your AI has reached its usage limit, so DeepSeek built this screen.");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "no_connection" })).toBe("No AI of yours is connected here, so DeepSeek built this screen.");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "needs_sign_in" })).toContain("sign in again");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "failed" })).toContain("could not finish");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "timeout" })).toContain("took too long");
  });
});
