import type { CompileError, CompileResult } from "@meld/screen-runtime";
import { HOST_MESSAGE_SOURCE } from "@meld/screen-runtime/bridge";
import { assembleScreenDocument } from "@meld/screen-runtime/document";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import { FRAME_CSP } from "../frame-document";
import { parseLiveFrameMessage, type Computed } from "./live-messages";
import type { LiveSource } from "./live-source";
import {
  ASLEEP,
  liveReducer,
  type LiveEvent,
  type LiveState,
} from "./live-state";

export const READY_TIMEOUT_MS = 5000;
export const SNAPSHOT_DELAY_MS = 400;
export const SLEEP_SNAPSHOT_WAIT_MS = 300;
// Loading the source, compiling it and loading the runtime together. The first
// compile also starts the compiler worker, so this is generous.
export const COMPILE_TIMEOUT_MS = 20_000;
export const LOAD_FAILED_MESSAGE = "This screen could not be loaded.";
export const COMPILE_TIMEOUT_MESSAGE =
  "This screen took too long to open. Try again.";

export type LiveDeps = {
  loadSource: (boardScreenId: string) => Promise<LiveSource | null>;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  runtimeBundle: () => Promise<string>;
  onSnapshot: (boardScreenId: string, html: string) => void;
  onSleep?: () => void;
  notify?: (listener: () => void) => void;
  onSleepStart?: (boardId: string) => void;
  onPicked?: (
    boardId: string,
    src: string,
    label: string,
    epoch: number,
    revision: number,
    computed: Computed | null,
  ) => void;
  onDeselected?: () => void;
  onDraftIssues?: (
    boardId: string,
    revision: number,
    issues: CompileError[],
  ) => void;
};

export type LiveController = {
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  // The attempt this request opened or reused, or undefined if superseded before opening.
  wake(
    boardScreenId: string,
    preloaded?: LiveSource,
    frameId?: string,
  ): Promise<number | undefined>;
  sleep(): Promise<void>;
  reload(): void;
  attachFrame(frame: Window | null): void;
  handleMessage(event: { source: unknown; data: unknown }): void;
  canPick(): boolean;
  setPickEnabled(enabled: boolean): void;
  // Highlights an element chosen outside the frame (the layer tree). Takes a
  // fresh pick epoch so the frame's `picked` reply passes the epoch guard;
  // it never turns picking on or off.
  selectElement(src: string): void;
  clearSelection(): void;
  previewDraft(
    boardId: string,
    source: ScreenSource,
    revision: number,
    origin: "code" | "tweak" | "history",
  ): void;
  retargetSource(from: string, to: string): void;
  setSnapshotEligible(boardId: string, enabled: boolean): void;
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
  type ActiveDocument = {
    boardId: string;
    currentRevision: number;
    installedRevision: number | null;
    departing: boolean;
    source: ScreenSource | null;
  };
  let activeDocument: ActiveDocument | null = null;
  let previewEpoch = 0,
    pickEpoch = 0;
  let picking = false;
  // The one outstanding selectElement request: its reply is accepted even with
  // picking off, once, and only for the same epoch and src.
  let pendingSelect: { epoch: number; src: string } | null = null;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  function cancelPreview() {
    clearTimeout(previewTimer);
    previewTimer = undefined;
    return ++previewEpoch;
  }
  function canPick() {
    return (
      !!activeDocument &&
      !activeDocument.departing &&
      state.phase === "running" &&
      activeDocument.installedRevision !== null &&
      activeDocument.installedRevision === activeDocument.currentRevision
    );
  }
  function setPickEnabled(enabled: boolean) {
    picking = enabled && canPick();
    pickEpoch++;
    pendingSelect = null;
    frame?.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        type: "pick-mode",
        enabled: picking,
        epoch: pickEpoch,
      },
      "*",
    );
  }
  function selectElement(src: string) {
    // Nothing to select while the draft is stale or the frame is not running.
    if (!canPick()) return;
    pickEpoch++;
    pendingSelect = { epoch: pickEpoch, src };
    frame?.postMessage(
      {
        source: HOST_MESSAGE_SOURCE,
        type: "select-element",
        src,
        epoch: pickEpoch,
      },
      "*",
    );
  }
  function clearSelection() {
    pendingSelect = null;
    frame?.postMessage(
      { source: HOST_MESSAGE_SOURCE, type: "clear-selection" },
      "*",
    );
  }
  function previewDraft(
    boardId: string,
    source: ScreenSource,
    revision: number,
    origin: "code" | "tweak" | "history",
  ) {
    const target = activeDocument;
    if (!target || target.boardId !== boardId) return;
    target.currentRevision = revision;
    target.source = source;
    setPickEnabled(false);
    if (target.departing) return;
    const epoch = cancelPreview();
    const owns = () =>
      activeDocument === target &&
      !target.departing &&
      epoch === previewEpoch &&
      target.currentRevision === revision &&
      state.phase !== "asleep";
    const fail = (errors: CompileError[]) => {
      if (!owns()) return;
      deps.onDraftIssues?.(target.boardId, revision, errors);
      if (target.installedRevision === null)
        dispatch({
          type: "draft-compile-failed",
          screenId: target.boardId,
          attempt: state.attempt,
          source,
          errors,
        });
    };
    const run = async () => {
      if (!owns()) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(COMPILE_TIMEOUT_MESSAGE)),
            COMPILE_TIMEOUT_MS,
          );
        });
        const [result, runtimeBundle] = await Promise.race([
          Promise.all([
            Promise.resolve().then(() => deps.compile(source)),
            Promise.resolve().then(() => deps.runtimeBundle()),
          ]),
          timeout,
        ]);
        if (!owns()) return;
        if (!result.ok) {
          fail(result.errors);
          return;
        }
        const document = assembleScreenDocument(result.screen, {
          csp: FRAME_CSP,
          runtimeBundle,
        });
        target.installedRevision = revision;
        deps.onDraftIssues?.(target.boardId, revision, []);
        dispatch({
          type: "edited-document",
          screenId: target.boardId,
          source,
          document,
        });
      } catch (error) {
        fail([
          {
            file: "",
            message: error instanceof Error ? error.message : String(error),
          },
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    if (origin === "code")
      previewTimer = setTimeout(() => {
        void run();
      }, 600);
    else void run();
  }
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
    else if (
      previous.phase !== "loading" ||
      previous.attempt !== state.attempt
    ) {
      clearTimeout(readyTimer);
      const attempt = state.attempt;
      readyTimer = setTimeout(
        () => dispatch({ type: "ready-timeout", attempt }),
        READY_TIMEOUT_MS,
      );
    }
    if (state.phase !== "running") clearTimeout(snapshotTimer);
    else if (previous.phase !== "running")
      snapshotTimer = setTimeout(requestSnapshot, SNAPSHOT_DELAY_MS);
    listeners.forEach((listener) =>
      deps.notify ? deps.notify(listener) : listener(),
    );
  }

  // One sleep at a time: Escape and a wake of another screen can both ask for
  // it during the snapshot round trip, and must share the same one.
  let sleeping: Promise<void> | null = null;
  let latestWake = 0;

  function sleep(): Promise<void> {
    latestWake += 1;
    return sleepCurrent();
  }

  function sleepCurrent(): Promise<void> {
    if (state.phase === "asleep") return Promise.resolve();
    if (!sleeping) {
      sleeping = sleepOnce().finally(() => {
        sleeping = null;
      });
    }
    return sleeping;
  }

  async function sleepOnce() {
    const attempt = state.attempt;
    if (state.phase === "asleep") return;
    const boardId = state.screenId,
      departing = activeDocument;
    if (departing) departing.departing = true;
    cancelPreview();
    setPickEnabled(false);
    deps.onSleepStart?.(boardId);
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
    deps.onSleepStart?.(boardId);
    if (activeDocument === departing) activeDocument = null;
    // Only put to sleep the attempt this call set out to stop: while waiting
    // it may already be asleep, reloaded or replaced.
    if ((state as LiveState).phase === "asleep" || state.attempt !== attempt)
      return;
    dispatch({ type: "sleep" });
    deps.onSleep?.();
  }

  // Load, compile and fetch the runtime, bounded in time. A compiler that
  // throws synchronously (the worker failed to start) rejects like any other.
  async function prepare(
    attempt: number,
    boardScreenId: string,
    preloaded: LiveSource | undefined,
    loaded: { value: LiveSource | null },
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(COMPILE_TIMEOUT_MESSAGE)),
        COMPILE_TIMEOUT_MS,
      );
    });
    const work = (async () => {
      loaded.value = preloaded ?? (await deps.loadSource(boardScreenId));
      if (
        !loaded.value ||
        state.phase !== "compiling" ||
        state.attempt !== attempt
      )
        return null;
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

  async function wake(
    boardScreenId: string,
    preloaded?: LiveSource,
    frameId?: string,
  ) {
    const request = ++latestWake;
    // A pending sleep (Escape) finishes first, even for the same screen, so
    // the wake that follows it is not swallowed.
    if (sleeping) {
      await sleeping;
      if (request !== latestWake) return;
    }
    if (
      state.phase !== "asleep" &&
      (state.screenId !== boardScreenId || state.frameId !== frameId)
    ) {
      await sleepCurrent();
      if (request !== latestWake) return;
    }
    const before = state;
    dispatch({ type: "wake", screenId: boardScreenId, frameId });
    if (state.phase === "asleep") return;
    const attempt = state.attempt;
    if (state === before || state.phase !== "compiling") return attempt;
    snapshots = false;
    const document: ActiveDocument = {
      boardId: boardScreenId,
      currentRevision: preloaded?.revision ?? 0,
      installedRevision: null,
      departing: false,
      source: preloaded?.source ?? null,
    };
    activeDocument = document;
    const epoch = cancelPreview();
    setPickEnabled(false);
    const owns = () =>
      activeDocument === document &&
      epoch === previewEpoch &&
      !document.departing;
    const loaded: { value: LiveSource | null } = { value: preloaded ?? null };
    const fail = (message:string)=>{
      if(!owns())return;
      const errors=[{file:"",message}];
      deps.onDraftIssues?.(document.boardId,loaded.value?.revision??document.currentRevision,errors);
      dispatch({type:"compile-failed",attempt,source:loaded.value?.source??null,errors});
    };
    try {
      const prepared = await prepare(attempt, boardScreenId, preloaded, loaded);
      if (!owns()) return attempt;
      if (!prepared || !loaded.value) {
        fail(LOAD_FAILED_MESSAGE);
        return attempt;
      }
      document.source = loaded.value.source;
      document.currentRevision =
        loaded.value.revision ?? document.currentRevision;
      snapshots = loaded.value.snapshot;
      const { result, runtimeBundle } = prepared;
      if (!result.ok) {
        deps.onDraftIssues?.(document.boardId,document.currentRevision,result.errors);
        dispatch({
          type: "compile-failed",
          attempt,
          source: loaded.value.source,
          errors: result.errors,
        });
        return attempt;
      }
      if (state.phase === "compiling" && state.attempt === attempt)
        document.installedRevision = document.currentRevision;
      dispatch({
        type: "compiled",
        attempt,
        source: loaded.value.source,
        document: assembleScreenDocument(result.screen, {
          csp: FRAME_CSP,
          runtimeBundle,
        }),
      });
    } catch (error) {
      fail(
        error instanceof Error && error.message
          ? error.message
          : LOAD_FAILED_MESSAGE,
      );
    }
    return attempt;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    wake,
    sleep,
    canPick,
    setPickEnabled,
    selectElement,
    clearSelection,
    previewDraft,
    retargetSource(from, to) {
      if (activeDocument?.boardId === from) activeDocument.boardId = to;
      dispatch({ type: "retarget-source", from, to });
    },
    setSnapshotEligible(boardId, enabled) {
      if (activeDocument?.boardId === boardId) snapshots = enabled;
    },
    reload: () => {
      if (activeDocument?.departing) return;
      cancelPreview();
      setPickEnabled(false);
      if (
        activeDocument?.source &&
        activeDocument.currentRevision !== activeDocument.installedRevision
      )
        previewDraft(
          activeDocument.boardId,
          activeDocument.source,
          activeDocument.currentRevision,
          "history",
        );
      else dispatch({ type: "reload" });
    },
    attachFrame(next) {
      frame = next;
      picking = false;
      pickEpoch++;
      pendingSelect = null;
    },
    handleMessage(event) {
      const message = parseLiveFrameMessage(event, frame);
      if (!message || state.phase === "asleep") return;
      const screenId = state.screenId;
      switch (message.type) {
        case "ready":
          dispatch({ type: "frame-ready" });
          break;
        case "picked": {
          const requested =
            pendingSelect !== null &&
            message.epoch === pendingSelect.epoch &&
            message.src === pendingSelect.src;
          if (
            !(picking || requested) ||
            !canPick() ||
            message.epoch !== pickEpoch ||
            !activeDocument?.source
          )
            return;
          const match = /^(.+):(\d+):(\d+)$/.exec(message.src);
          if (
            !match ||
            match[0] !== message.src ||
            !Object.hasOwn(activeDocument.source.files, match[1])
          )
            return;
          const start = Number(match[2]),
            end = Number(match[3]);
          if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start >= end ||
            end > activeDocument.source.files[match[1]].length
          )
            return;
          if (requested) pendingSelect = null;
          deps.onPicked?.(
            screenId,
            message.src,
            message.label,
            message.epoch,
            activeDocument.currentRevision,
            message.computed ?? null,
          );
          break;
        }
        case "deselected":
          deps.onDeselected?.();
          break;
        case "error":
          dispatch({ type: "frame-error", message: message.message });
          break;
        case "stuck":
          dispatch({ type: "frame-stuck" });
          break;
        case "escape":
          void sleep();
          break;
        case "snapshot":
          // Untrusted page text: passed on as-is, never parsed or run here.
          // The parser already caps the size; the check keeps this module
          // honest on its own (an oversized picture would fail every save).
          if (
            snapshots &&
            state.phase === "running" &&
            message.html.length <= MAX_SCREEN_HTML_CHARS
          ) {
            deps.onSnapshot(screenId, message.html);
          }
          snapshotArrived?.();
          break;
        // Clicking through to another screen arrives with Star links (Plan 5).
        case "goto":
          break;
      }
    },
    dispose() {
      // Subscribers stay: React StrictMode cleans effects up and re-runs them
      // on the same controller.
      latestWake += 1;
      cancelPreview();
      setPickEnabled(false);
      activeDocument = null;
      frame = null;
      snapshots = false;
      dispatch({ type: "sleep" });
      snapshotArrived?.();
    },
  };
}
