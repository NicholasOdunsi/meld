import type { ScreenSource } from "@meld/screen-runtime/source";

type Files = Record<string, string>;
export type Write = (
  source: ScreenSource,
  base: string | null,
  retryUncertain?: true,
) => Promise<
  | { status: "saved"; versionId: string }
  | { status: "conflict"; versionId: string | null }
  | { status: "error" }
>;
export type Read = () => Promise<{
  source: ScreenSource;
  versionId: string;
} | null>;
export type DraftStatus = "clean" | "dirty" | "saving" | "conflict" | "error";
export type DraftState = {
  source: ScreenSource;
  revision: number;
  base: string | null;
  status: DraftStatus;
  canUndo: boolean;
  canRedo: boolean;
};
export type Draft = {
  getState(): DraftState;
  subscribe(fn: () => void): () => void;
  replace(files: Files): void;
  undo(): void;
  redo(): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  reloadLatest(): Promise<void>;
  dispose(): void;
};
type Status = DraftStatus;
const copyFiles = (files: Files): Files => Object.freeze({ ...files });
const copySource = (source: ScreenSource): ScreenSource =>
  Object.freeze({ ...source, files: copyFiles(source.files) });

export function createEditDraft(
  initial: ScreenSource,
  initialBase: string | null,
  write: Write,
  read: Read,
): Draft {
  let source = copySource(initial);
  let acknowledged = source.files;
  let base = initialBase;
  let revision = 0;
  let status: Status = "clean";
  let writeRequested = false;
  let failedCapture: ScreenSource | null = null;
  let explicitRetry = false;
  let active: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const past: Files[] = [];
  const future: Files[] = [];
  const listeners = new Set<() => void>();
  const equal = (a: Files, b: Files) =>
    Object.keys(a).length === Object.keys(b).length &&
    Object.entries(a).every(([k, v]) => Object.hasOwn(b, k) && b[k] === v);
  const snapshot = () => ({
    source,
    base,
    revision,
    status,
    canUndo: !!past.length,
    canRedo: !!future.length,
  });
  let view = snapshot();
  function publish() {
    const next = snapshot();
    if (
      next.source === view.source &&
      next.base === view.base &&
      next.revision === view.revision &&
      next.status === view.status &&
      next.canUndo === view.canUndo &&
      next.canRedo === view.canRedo
    )
      return;
    view = next;
    for (const listener of listeners) listener();
  }
  function cancelTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function changed(files: Files) {
    cancelTimer();
    source = copySource({ ...source, files });
    revision++;
    if (status !== "conflict" && !failedCapture) {
      status = active
        ? "saving"
        : equal(files, acknowledged)
          ? "clean"
          : "dirty";
      timer = setTimeout(() => {
        void flush();
      }, 2000);
    }
    publish();
  }
  async function drain() {
    while (writeRequested && status !== "conflict") {
      writeRequested = false;
      const recovering = explicitRetry && failedCapture !== null;
      const capture = recovering ? failedCapture! : source;
      explicitRetry = false;
      if (!recovering && equal(capture.files, acknowledged)) {
        status = "clean";
        publish();
        continue;
      }
      status = "saving";
      publish();
      let reply: Awaited<ReturnType<Write>>;
      try {
        reply = recovering
          ? await write(capture, base, true)
          : await write(capture, base);
      } catch {
        reply = { status: "error" };
      }
      if (reply.status !== "saved") {
        failedCapture = reply.status === "error" ? capture : null;
        cancelTimer();
        writeRequested = false;
        status = reply.status;
        publish();
        return;
      }
      failedCapture = null;
      if (recovering && !equal(source.files, capture.files))
        writeRequested = true;
      base = reply.versionId;
      acknowledged = capture.files;
      status = equal(source.files, acknowledged) ? "clean" : "dirty";
      publish();
    }
  }
  function flush(): Promise<void> {
    cancelTimer();
    if (status === "conflict" || (failedCapture && !explicitRetry))
      return active ?? Promise.resolve();
    writeRequested = true;
    if (!active) {
      // Set active before starting drain, including synchronous store listeners.
      active = Promise.resolve()
        .then(drain)
        .finally(() => {
          active = null;
          // A new explicit flush can arrive between drain resolution and cleanup.
          if (writeRequested && status !== "conflict") return flush();
        });
    }
    return active;
  }
  return {
    getState: () => view,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    replace(files: Files) {
      if (equal(source.files, files)) return;
      past.push(source.files);
      future.length = 0;
      changed(copyFiles(files));
    },
    undo() {
      const files = past.pop();
      if (!files) return;
      future.push(source.files);
      changed(files);
    },
    redo() {
      const files = future.pop();
      if (!files) return;
      past.push(source.files);
      changed(files);
    },
    flush,
    retry() {
      if (status !== "error" || !failedCapture)
        return active ?? Promise.resolve();
      explicitRetry = true;
      return flush();
    },
    async reloadLatest() {
      if (status !== "conflict") return;
      const token = revision;
      let latest: Awaited<ReturnType<Read>>;
      try {
        latest = await read();
      } catch {
        return;
      }
      if (!latest || token !== revision || status !== "conflict") return;
      source = copySource(latest.source);
      acknowledged = source.files;
      base = latest.versionId;
      revision++;
      past.length = 0;
      future.length = 0;
      status = "clean";
      publish();
    },
    dispose() {
      cancelTimer();
      listeners.clear();
    },
  };
}
