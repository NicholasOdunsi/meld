import type { CompileError } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";

export const MAX_RUNTIME_ERRORS = 20;
export type StopReason = "stuck" | "timeout" | "crashed";

type Running = { screenId: string; attempt: number; source: ScreenSource; document: string; errors: string[] };
export type LiveState =
  | { phase: "asleep"; attempt: number }
  | { phase: "compiling"; screenId: string; attempt: number }
  | { phase: "compile-failed"; screenId: string; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | ({ phase: "loading" } & Running)
  | ({ phase: "running" } & Running)
  | ({ phase: "stopped"; reason: StopReason } & Running);

export type LiveEvent =
  | { type: "wake"; screenId: string }
  | { type: "compiled"; attempt: number; source: ScreenSource; document: string }
  | { type: "compile-failed"; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | { type: "frame-ready" }
  | { type: "frame-error"; message: string }
  | { type: "frame-stuck" }
  | { type: "ready-timeout"; attempt: number }
  | { type: "reload" }
  | { type: "sleep" };

export const ASLEEP: LiveState = { phase: "asleep", attempt: 0 };

function running(state: Running): Running {
  return { screenId: state.screenId, attempt: state.attempt, source: state.source, document: state.document, errors: state.errors };
}

// One live screen at a time. `attempt` grows on every wake and reload so a
// late compile result or ready timer from an earlier attempt is ignored.
export function liveReducer(state: LiveState, event: LiveEvent): LiveState {
  switch (event.type) {
    case "wake":
      if (state.phase !== "asleep" && state.screenId === event.screenId
        && (state.phase === "compiling" || state.phase === "loading" || state.phase === "running")) return state;
      return { phase: "compiling", screenId: event.screenId, attempt: state.attempt + 1 };
    case "compiled":
      if (state.phase !== "compiling" || state.attempt !== event.attempt) return state;
      return { phase: "loading", screenId: state.screenId, attempt: state.attempt, source: event.source, document: event.document, errors: [] };
    case "compile-failed":
      if (state.phase !== "compiling" || state.attempt !== event.attempt) return state;
      return { phase: "compile-failed", screenId: state.screenId, attempt: state.attempt, source: event.source, errors: event.errors };
    case "frame-error":
      if (state.phase !== "loading" && state.phase !== "running") return state;
      if (state.errors.length >= MAX_RUNTIME_ERRORS) return state;
      return { ...state, errors: [...state.errors, event.message] };
    case "frame-ready":
      // `ready` means the document finished loading, not that nothing failed:
      // an HTML screen reports a throwing script and still announces ready.
      if (state.phase !== "loading") return state;
      return { phase: "running", ...running(state) };
    case "frame-stuck":
      if (state.phase !== "loading" && state.phase !== "running") return state;
      return { phase: "stopped", reason: "stuck", ...running(state) };
    case "ready-timeout":
      if (state.phase !== "loading" || state.attempt !== event.attempt) return state;
      // Errors with no ready: the screen crashed while starting (React posts
      // error and never ready). Nothing at all: it stopped responding.
      return { phase: "stopped", reason: state.errors.length ? "crashed" : "timeout", ...running(state) };
    case "reload":
      if (state.phase !== "loading" && state.phase !== "running" && state.phase !== "stopped") return state;
      return { phase: "loading", ...running(state), attempt: state.attempt + 1, errors: [] };
    case "sleep":
      return state.phase === "asleep" ? state : { phase: "asleep", attempt: state.attempt };
  }
}

export type LiveView =
  | { mode: "thumbnail" }
  | { mode: "waking" }
  | { mode: "live"; document: string; attempt: number }
  | { mode: "stopped"; reason: StopReason; detail: string | null };

export function liveViewFor(state: LiveState, screenId: string): LiveView {
  if (state.phase === "asleep" || state.screenId !== screenId) return { mode: "thumbnail" };
  switch (state.phase) {
    case "compiling": return { mode: "waking" };
    // A compile error keeps the picture; the panel shows the errors.
    case "compile-failed": return { mode: "thumbnail" };
    case "loading":
    case "running": return { mode: "live", document: state.document, attempt: state.attempt };
    // Only a crash is explained by its first error; a stuck loop or a page
    // that never loaded may have logged an unrelated error earlier.
    case "stopped": return { mode: "stopped", reason: state.reason, detail: state.reason === "crashed" ? state.errors[0] ?? null : null };
  }
}

export function isAwake(state: LiveState, screenId: string): boolean {
  return (state.phase === "compiling" || state.phase === "loading" || state.phase === "running") && state.screenId === screenId;
}

export type LiveIssue = { file: string | null; message: string };

export function liveIssues(state: LiveState): LiveIssue[] {
  if (state.phase === "compile-failed") return state.errors.map((error) => ({ file: error.file || null, message: error.message }));
  if (state.phase === "loading" || state.phase === "running" || state.phase === "stopped") {
    return state.errors.map((message) => ({ file: null, message }));
  }
  return [];
}

export function liveSourceOf(state: LiveState): ScreenSource | null {
  if (state.phase === "asleep" || state.phase === "compiling") return null;
  return state.source;
}
