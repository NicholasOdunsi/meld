import { afterEach, expect, it, vi } from "vitest";
import { createEditDraft, type Write } from "./edit-draft";
const page = (text: string) => ({
  kind: "html" as const,
  entry: "index.html",
  files: { "index.html": text },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());
it("debounces saves and serializes queued revisions against acknowledged bases", async () => {
  vi.useFakeTimers();
  const first = deferred<Awaited<ReturnType<Write>>>();
  const write = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue({ status: "saved", versionId: "v3" });
  const draft = createEditDraft(page("old"), "v1", write, async () => null);
  draft.replace(page("A").files);
  await vi.advanceTimersByTimeAsync(1999);
  expect(write).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledWith(page("A"), "v1");
  draft.replace(page("B").files);
  const flush = draft.flush();
  expect(draft.flush()).toBe(flush);
  first.resolve({ status: "saved", versionId: "v2" });
  await flush;
  expect(write.mock.calls).toEqual([
    [page("A"), "v1"],
    [page("B"), "v2"],
  ]);
  expect(draft.getState().status).toBe("clean");
  draft.dispose();
});
it("keeps immutable snapshots, no-op revisions, undo cleanliness and redo invalidation", async () => {
  const write = vi.fn().mockResolvedValue({ status: "saved", versionId: "v2" });
  const input = page("old");
  const draft = createEditDraft(input, "v1", write, async () => null);
  const view = draft.getState();
  expect(draft.getState()).toBe(view);
  input.files["index.html"] = "mutated";
  expect(draft.getState().source).toEqual(page("old"));
  draft.replace(page("old").files);
  expect(draft.getState()).toBe(view);
  draft.replace(page("A").files);
  draft.undo();
  expect(draft.getState().status).toBe("clean");
  await draft.flush();
  expect(write).not.toHaveBeenCalled();
  draft.redo();
  draft.undo();
  draft.replace(page("new").files);
  expect(draft.getState().canRedo).toBe(false);
  draft.dispose();
});
it("retries the failed capture before newer code and never automatically retries errors", async () => {
  vi.useFakeTimers();
  const write = vi
    .fn()
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "saved", versionId: "v2" })
    .mockResolvedValueOnce({ status: "saved", versionId: "v3" });
  const draft = createEditDraft(page("old"), "v1", write, async () => null);
  draft.replace(page("A").files);
  await draft.flush();
  draft.replace(page("B").files);
  await vi.advanceTimersByTimeAsync(5000);
  await draft.flush();
  expect(write).toHaveBeenCalledTimes(1);
  await draft.retry();
  expect(write.mock.calls).toEqual([
    [page("A"), "v1"],
    [page("A"), "v1", true],
    [page("B"), "v2"],
  ]);
  draft.dispose();
});
it("preserves conflict and history while reload races typing, then explicitly reloads", async () => {
  const latest = deferred<{
    source: ReturnType<typeof page>;
    versionId: string;
  }>();
  const read = vi
    .fn()
    .mockReturnValueOnce(latest.promise)
    .mockResolvedValue({ source: page("theirs"), versionId: "v2" });
  const draft = createEditDraft(
    page("old"),
    "v1",
    async () => ({ status: "conflict", versionId: "v2" }),
    read,
  );
  draft.replace(page("mine").files);
  await draft.flush();
  const loading = draft.reloadLatest();
  draft.replace(page("more").files);
  latest.resolve({ source: page("theirs"), versionId: "v2" });
  await loading;
  expect(draft.getState()).toMatchObject({
    source: page("more"),
    status: "conflict",
    canUndo: true,
  });
  await draft.reloadLatest();
  expect(draft.getState()).toMatchObject({
    source: page("theirs"),
    base: "v2",
    status: "clean",
    canUndo: false,
  });
  draft.dispose();
});

it("keeps late save acknowledgements scoped to their own draft", async () => {
  const first = deferred<Awaited<ReturnType<Write>>>();
  const writeA = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue({ status: "saved", versionId: "a3" });
  const writeB = vi
    .fn()
    .mockResolvedValue({ status: "saved", versionId: "b2" });
  const a = createEditDraft(page("A old"), "a1", writeA, async () => null);
  const b = createEditDraft(page("B old"), "b1", writeB, async () => null);
  a.replace(page("A new").files);
  const savingA = a.flush();
  await Promise.resolve();
  a.undo();
  a.flush();
  b.replace(page("B new").files);
  await b.flush();
  first.resolve({ status: "saved", versionId: "a2" });
  await savingA;
  expect(writeA.mock.calls).toEqual([
    [page("A new"), "a1"],
    [page("A old"), "a2"],
  ]);
  expect(a.getState()).toMatchObject({
    source: page("A old"),
    status: "clean",
    base: "a3",
  });
  expect(b.getState()).toMatchObject({
    source: page("B new"),
    status: "clean",
    base: "b2",
  });
  a.dispose();
  b.dispose();
});

it("retains errors through failed retries and catches thrown writes and reads", async () => {
  const write = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost"))
    .mockResolvedValueOnce({ status: "error" })
    .mockResolvedValueOnce({ status: "conflict", versionId: "v2" });
  const read = vi.fn().mockRejectedValue(new Error("offline"));
  const draft = createEditDraft(page("old"), "v1", write, read);
  draft.replace(page("mine").files);
  await expect(draft.flush()).resolves.toBeUndefined();
  await draft.retry();
  expect(draft.getState().status).toBe("error");
  await draft.retry();
  await draft.reloadLatest();
  expect(draft.getState()).toMatchObject({
    source: page("mine"),
    status: "conflict",
    canUndo: true,
  });
  draft.dispose();
});

it("does not publish or replace cached state for clean flush", async () => {
  const draft = createEditDraft(
    page("old"),
    "v1",
    async () => ({ status: "error" }),
    async () => null,
  );
  const state = draft.getState();
  const listener = vi.fn();
  draft.subscribe(listener);
  await draft.flush();
  expect(draft.getState()).toBe(state);
  expect(listener).not.toHaveBeenCalled();
  draft.dispose();
});
