import { afterEach, expect, it, vi } from "vitest";
import { createDraftRegistry } from "./draft-registry";
import { createEditDraft } from "./edit-draft";
const page = (text: string) => ({
  kind: "html" as const,
  entry: "index.html",
  files: { "index.html": text },
});
afterEach(() => vi.useRealTimers());
it("retains original aliases and caches snapshots until visible status changes", () => {
  const registry = createDraftRegistry();
  const draft = createEditDraft(
    page("a"),
    "v1",
    async () => ({ status: "error" }),
    async () => null,
  );
  registry.attach("old", draft);
  registry.alias("old", "new");
  expect(registry.get("old")).toBe(draft);
  expect(registry.get("new")).toBe(draft);
  const view = registry.getSnapshot();
  const listener = vi.fn();
  registry.subscribe(listener);
  draft.replace(page("b").files);
  expect(listener).toHaveBeenCalledTimes(1);
  const dirty = registry.getSnapshot();
  expect(dirty).not.toBe(view);
  draft.replace(page("c").files);
  expect(registry.getSnapshot()).toBe(dirty);
  expect(listener).toHaveBeenCalledTimes(1);
  draft.dispose();
});
it("cancels StrictMode teardown and flushes actual departing registry only", async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockResolvedValue({ status: "saved", versionId: "v2" });
  const registry = createDraftRegistry();
  const draft = createEditDraft(page("a"), "v1", write, async () => null);
  registry.attach("a", draft);
  registry.retain();
  registry.release();
  registry.retain();
  await vi.advanceTimersByTimeAsync(0);
  expect(write).not.toHaveBeenCalled();
  expect(registry.get("a")).toBe(draft);
  draft.replace(page("b").files);
  registry.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(write).toHaveBeenCalledExactlyOnceWith(page("b"), "v1");
  expect(registry.get("a")).toBeUndefined();
});
it("batches alias and status publication", () => {
  const registry = createDraftRegistry();
  const draft = createEditDraft(
    page("a"),
    "v1",
    async () => ({ status: "error" }),
    async () => null,
  );
  registry.attach("old", draft);
  const listener = vi.fn();
  registry.subscribe(listener);
  registry.batch(() => {
    registry.alias("old", "new");
    draft.replace(page("b").files);
  });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(registry.getSnapshot()).toEqual([{ boardId: "new", status: "dirty" }]);
  draft.dispose();
});
