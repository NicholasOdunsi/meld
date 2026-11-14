import { describe, expect, it, vi } from "vitest";
import { createScreenStore } from "./screen-store";

describe("screen store", () => {
  it("accepts only higher revisions", () => {
    const store = createScreenStore();
    expect(store.set({ id: "a", rev: 1, html: "one" })).toBe(true);
    expect(store.set({ id: "a", rev: 1, html: "same" })).toBe(false);
    expect(store.set({ id: "a", rev: 0, html: "old" })).toBe(false);
    expect(store.set({ id: "a", rev: 2, html: "two" })).toBe(true);
    expect(store.get("a")?.html).toBe("two");
  });
  it("notifies subscribers only on change and stops after unsubscribe", () => {
    const store = createScreenStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ id: "a", rev: 1, html: "x" });
    store.set({ id: "a", rev: 1, html: "x" });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.set({ id: "a", rev: 2, html: "y" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("keeps the same object between reads until replaced", () => {
    const store = createScreenStore();
    store.set({ id: "a", rev: 1, html: "x" });
    expect(store.get("a")).toBe(store.get("a"));
    expect(store.all()).toHaveLength(1);
  });
});
