import type { Draft, DraftStatus } from "./edit-draft";

type Entry = { key: string; draft: Draft };
type Snapshot = readonly { boardId: string; status: DraftStatus }[];
export function createDraftRegistry(
  options: { notify?: (listener: () => void) => void } = {},
) {
  const byId = new Map<string, Entry>();
  const unsubscribe = new Map<Draft, () => void>();
  const listeners = new Set<() => void>();
  let view: Snapshot = [];
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let leases = 0;
  let depth = 0;
  let pending = false;
  function emit() {
    if (depth) {
      pending = true;
      return;
    }
    const next = [...new Set(byId.values())].map((entry) => ({
      boardId: entry.key,
      status: entry.draft.getState().status,
    }));
    if (
      next.length === view.length &&
      next.every(
        (entry, i) =>
          entry.boardId === view[i].boardId && entry.status === view[i].status,
      )
    )
      return;
    view = next;
    for (const listener of listeners) {
      if (options.notify) options.notify(listener);
      else listener();
    }
  }
  return {
    get: (id: string) => byId.get(id)?.draft,
    attach(id: string, draft: Draft): Draft {
      const old = byId.get(id);
      if (old) return old.draft;
      const entry = [...byId.values()].find((item) => item.draft === draft) ?? {
        key: id,
        draft,
      };
      byId.set(id, entry);
      if (!unsubscribe.has(draft))
        unsubscribe.set(draft, draft.subscribe(emit));
      emit();
      return draft;
    },
    alias(from: string, to: string) {
      const entry = byId.get(from);
      if (!entry) return;
      const occupied = byId.get(to);
      if (occupied && occupied !== entry) return;
      entry.key = to;
      byId.set(to, entry);
      emit();
    },
    batch(run: () => void) {
      depth++;
      try {
        run();
      } finally {
        depth--;
        if (!depth && pending) {
          pending = false;
          emit();
        }
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => view,
    retain() {
      leases++;
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
    },
    release() {
      leases = Math.max(0, leases - 1);
      if (leases) return;
      clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        // Stop publication before any async flush can settle into a departed room.
        listeners.clear();
        for (const [draft, off] of unsubscribe) {
          off();
          void draft.flush().finally(() => draft.dispose());
        }
        unsubscribe.clear();
        byId.clear();
        view = [];
      }, 0);
    },
  };
}
export type DraftRegistry = ReturnType<typeof createDraftRegistry>;
