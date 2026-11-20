import type { CompileResult } from "@meld/screen-runtime";
import { HOST_MESSAGE_SOURCE } from "@meld/screen-runtime/bridge";
import { assembleScreenDocument } from "@meld/screen-runtime/document";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import { FRAME_CSP } from "../frame-document";
import { parseLiveFrameMessage } from "./live-messages";
import type { LiveSource } from "./live-source";
import { ASLEEP, liveReducer, type LiveEvent, type LiveState } from "./live-state";

export const READY_TIMEOUT_MS = 5000;
export const SNAPSHOT_DELAY_MS = 400;
export const SLEEP_SNAPSHOT_WAIT_MS = 300;
// Loading the source, compiling it and loading the runtime together. The first
// compile also starts the compiler worker, so this is generous.
export const COMPILE_TIMEOUT_MS = 20_000;
export const LOAD_FAILED_MESSAGE = "This screen could not be loaded.";
export const COMPILE_TIMEOUT_MESSAGE = "This screen took too long to open. Try again.";

export type LiveDeps = {
  loadSource: (boardScreenId: string) => Promise<LiveSource | null>;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  runtimeBundle: () => Promise<string>;
  onSnapshot: (boardScreenId: string, html: string) => void;
  onSleep?: () => void;
};

export type LiveController = {
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  wake(boardScreenId: string, preloaded?: LiveSource): Promise<void>;
  sleep(): Promise<void>;
  reload(): void;
  attachFrame(frame: Window | null): void;
  handleMessage(event: { source: unknown; data: unknown }): void;
  dispose(): void;
};

// Owns the board's one live screen: compiling, the ready timeout, frame
// messages and the snapshot that becomes the sleeping picture. React reads it
// through useSyncExternalStore (FrameHost, the board).
export function createLiveController(deps: LiveDeps): LiveController {
  let state: LiveState = ASLEEP;
  // Frame messages carry no attempt id, so the frame is forgotten whenever a
  // new attempt starts: only the frame the host mounts for this attempt (the
  // iframe is keyed by attempt) can talk to the controller.
  let frame: Window | null = null;
  let snapshots = false;
  let snapshotArrived: (() => void) | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const requestSnapshot = () => {
    if (snapshots && frame && state.phase === "running") {
      frame.postMessage({ source: HOST_MESSAGE_SOURCE, type: "snapshot" }, "*");
    }
  };

  function dispatch(event: LiveEvent) {
    const previous = state;
    state = liveReducer(state, event);
    if (state === previous) return;
    if (state.attempt !== previous.attempt) frame = null;
    if (state.phase !== "loading") clearTimeout(readyTimer);
    else if (previous.phase !== "loading" || previous.attempt !== state.attempt) {
      clearTimeout(readyTimer);
      const attempt = state.attempt;
      readyTimer = setTimeout(() => dispatch({ type: "ready-timeout", attempt }), READY_TIMEOUT_MS);
    }
    if (state.phase !== "running") clearTimeout(snapshotTimer);
    else if (previous.phase !== "running") snapshotTimer = setTimeout(requestSnapshot, SNAPSHOT_DELAY_MS);
    listeners.forEach((listener) => listener());
  }

  async function sleep() {
    if (state.phase === "asleep") return;
    if (state.phase === "running" && snapshots && frame) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, SLEEP_SNAPSHOT_WAIT_MS);
        function done() {
          clearTimeout(timer);
          if (snapshotArrived === done) snapshotArrived = null;
          resolve();
        }
        snapshotArrived = done;
        requestSnapshot();
      });
    }
    // Escape or another wake may have put the screen to sleep while waiting.
    if ((state as LiveState).phase === "asleep") return;
    dispatch({ type: "sleep" });
    deps.onSleep?.();
  }

  // Load, compile and fetch the runtime, bounded in time. A compiler that
  // throws synchronously (the worker failed to start) rejects like any other.
  async function prepare(boardScreenId: string, preloaded: LiveSource | undefined, loaded: { value: LiveSource | null }) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(COMPILE_TIMEOUT_MESSAGE)), COMPILE_TIMEOUT_MS);
    });
    const work = (async () => {
      loaded.value = preloaded ?? await deps.loadSource(boardScreenId);
      if (!loaded.value) return null;
      const source = loaded.value.source;
      const [result, runtimeBundle] = await Promise.all([
        Promise.resolve().then(() => deps.compile(source)),
        Promise.resolve().then(() => deps.runtimeBundle()),
      ]);
      return { result, runtimeBundle };
    })();
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function wake(boardScreenId: string, preloaded?: LiveSource) {
    if (state.phase !== "asleep" && state.screenId !== boardScreenId) await sleep();
    const before = state;
    dispatch({ type: "wake", screenId: boardScreenId });
    if (state === before || state.phase !== "compiling") return;
    const attempt = state.attempt;
    snapshots = false;
    const loaded: { value: LiveSource | null } = { value: preloaded ?? null };
    const fail = (message: string) =>
      dispatch({ type: "compile-failed", attempt, source: loaded.value?.source ?? null, errors: [{ file: "", message }] });
    try {
      const prepared = await prepare(boardScreenId, preloaded, loaded);
      if (!prepared || !loaded.value) { fail(LOAD_FAILED_MESSAGE); return; }
      const { result, runtimeBundle } = prepared;
      if (!result.ok) {
        dispatch({ type: "compile-failed", attempt, source: loaded.value.source, errors: result.errors });
        return;
      }
      if (state.phase === "compiling" && state.attempt === attempt) snapshots = loaded.value.snapshot;
      dispatch({
        type: "compiled", attempt, source: loaded.value.source,
        document: assembleScreenDocument(result.screen, { csp: FRAME_CSP, runtimeBundle }),
      });
    } catch (error) {
      fail(error instanceof Error && error.message ? error.message : LOAD_FAILED_MESSAGE);
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    wake,
    sleep,
    reload: () => dispatch({ type: "reload" }),
    attachFrame(next) { frame = next; },
    handleMessage(event) {
      const message = parseLiveFrameMessage(event, frame);
      if (!message || state.phase === "asleep") return;
      const screenId = state.screenId;
      switch (message.type) {
        case "ready": dispatch({ type: "frame-ready" }); break;
        case "error": dispatch({ type: "frame-error", message: message.message }); break;
        case "stuck": dispatch({ type: "frame-stuck" }); break;
        case "escape": void sleep(); break;
        case "snapshot":
          // Untrusted page text: passed on as-is, never parsed or run here.
          // The parser already caps the size; the check keeps this module
          // honest on its own (an oversized picture would fail every save).
          if (snapshots && state.phase === "running" && message.html.length <= MAX_SCREEN_HTML_CHARS) {
            deps.onSnapshot(screenId, message.html);
          }
          snapshotArrived?.();
          break;
        // Clicking through to another screen arrives with Star links (Plan 5).
        case "goto": break;
      }
    },
    dispose() {
      // Subscribers stay: React StrictMode cleans effects up and re-runs them
      // on the same controller.
      clearTimeout(readyTimer);
      clearTimeout(snapshotTimer);
      frame = null;
    },
  };
}
