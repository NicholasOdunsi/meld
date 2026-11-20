import { describe, expect, it } from "vitest";
import { ASLEEP, isAwake, liveIssues, liveReducer, liveSourceOf, liveViewFor, MAX_RUNTIME_ERRORS, type LiveEvent, type LiveState } from "./live-state";

const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const run = (events: LiveEvent[], from: LiveState = ASLEEP) => events.reduce(liveReducer, from);
const loaded = (): LiveState => run([{ type: "wake", screenId: "ds-a" }, { type: "compiled", attempt: 1, source, document: "<doc>" }]);

describe("liveReducer", () => {
  it("wakes, compiles and loads one screen", () => {
    expect(run([{ type: "wake", screenId: "ds-a" }])).toEqual({ phase: "compiling", screenId: "ds-a", attempt: 1 });
    expect(loaded()).toEqual({ phase: "loading", screenId: "ds-a", attempt: 1, source, document: "<doc>", errors: [] });
  });

  it("treats ready as 'loaded' even after an error, and keeps the error", () => {
    const state = run([{ type: "frame-error", message: "first script failed" }, { type: "frame-ready" }], loaded());
    expect(state).toMatchObject({ phase: "running", errors: ["first script failed"] });
    // A late timer for the same attempt does nothing once the document has loaded.
    expect(liveReducer(state, { type: "ready-timeout", attempt: 1 })).toBe(state);
  });

  it("reports a timeout without errors as stopped responding", () => {
    expect(run([{ type: "ready-timeout", attempt: 1 }], loaded())).toMatchObject({ phase: "stopped", reason: "timeout" });
  });

  it("reports errors without ready as a crash, not a hang", () => {
    expect(run([{ type: "frame-error", message: "boom" }, { type: "ready-timeout", attempt: 1 }], loaded()))
      .toMatchObject({ phase: "stopped", reason: "crashed", errors: ["boom"] });
  });

  it("stops on stuck while loading or running", () => {
    expect(run([{ type: "frame-stuck" }], loaded())).toMatchObject({ phase: "stopped", reason: "stuck" });
    expect(run([{ type: "frame-ready" }, { type: "frame-stuck" }], loaded())).toMatchObject({ phase: "stopped", reason: "stuck" });
  });

  it("ignores stale compile results and timers", () => {
    const second = run([{ type: "wake", screenId: "ds-a" }, { type: "sleep" }, { type: "wake", screenId: "ds-b" }]);
    expect(second).toEqual({ phase: "compiling", screenId: "ds-b", attempt: 2 });
    expect(liveReducer(second, { type: "compiled", attempt: 1, source, document: "old" })).toBe(second);
    const loadingB = liveReducer(second, { type: "compiled", attempt: 2, source, document: "new" });
    expect(liveReducer(loadingB, { type: "ready-timeout", attempt: 1 })).toBe(loadingB);
  });

  it("does not restart a screen that is already awake, but retries a failed or stopped one", () => {
    const state = loaded();
    expect(liveReducer(state, { type: "wake", screenId: "ds-a" })).toBe(state);
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source, errors: [{ file: "App.tsx", message: "Unsupported package: next" }] }]);
    expect(liveReducer(failed, { type: "wake", screenId: "ds-a" })).toMatchObject({ phase: "compiling", attempt: 2 });
    const stopped = run([{ type: "frame-stuck" }], loaded());
    expect(liveReducer(stopped, { type: "wake", screenId: "ds-a" })).toMatchObject({ phase: "compiling", attempt: 2 });
  });

  it("reloads a stopped screen with a fresh attempt and no errors", () => {
    const stopped = run([{ type: "frame-error", message: "x" }, { type: "frame-stuck" }], loaded());
    expect(liveReducer(stopped, { type: "reload" })).toEqual({ phase: "loading", screenId: "ds-a", attempt: 2, source, document: "<doc>", errors: [] });
  });

  it("caps runtime errors and sleeps from any phase", () => {
    let state = loaded();
    for (let index = 0; index < MAX_RUNTIME_ERRORS + 5; index += 1) state = liveReducer(state, { type: "frame-error", message: `e${index}` });
    expect(state.phase === "loading" && state.errors).toHaveLength(MAX_RUNTIME_ERRORS);
    expect(liveReducer(state, { type: "sleep" })).toEqual({ phase: "asleep", attempt: 1 });
    expect(liveReducer(ASLEEP, { type: "sleep" })).toBe(ASLEEP);
  });
});

describe("views", () => {
  it("maps state to what one screen shows", () => {
    expect(liveViewFor(ASLEEP, "ds-a")).toEqual({ mode: "thumbnail" });
    expect(liveViewFor(run([{ type: "wake", screenId: "ds-a" }]), "ds-a")).toEqual({ mode: "waking" });
    expect(liveViewFor(loaded(), "ds-a")).toEqual({ mode: "live", document: "<doc>", attempt: 1 });
    expect(liveViewFor(loaded(), "ds-b")).toEqual({ mode: "thumbnail" });
    expect(liveViewFor(run([{ type: "frame-error", message: "boom" }, { type: "ready-timeout", attempt: 1 }], loaded()), "ds-a"))
      .toEqual({ mode: "stopped", reason: "crashed", detail: "boom" });
    // An earlier, unrelated error is not the reason a screen got stuck.
    expect(liveViewFor(run([{ type: "frame-error", message: "boom" }, { type: "frame-ready" }, { type: "frame-stuck" }], loaded()), "ds-a"))
      .toEqual({ mode: "stopped", reason: "stuck", detail: null });
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source: null, errors: [{ file: "", message: "x" }] }]);
    expect(liveViewFor(failed, "ds-a")).toEqual({ mode: "thumbnail" });
  });

  it("lists issues and source for the panel", () => {
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source, errors: [{ file: "App.tsx", message: "bad" }, { file: "", message: "gone" }] }]);
    expect(liveIssues(failed)).toEqual([{ file: "App.tsx", message: "bad" }, { file: null, message: "gone" }]);
    expect(liveIssues(run([{ type: "frame-error", message: "late" }], loaded()))).toEqual([{ file: null, message: "late" }]);
    expect(liveSourceOf(failed)).toBe(source);
    expect(liveSourceOf(ASLEEP)).toBeNull();
    expect(isAwake(loaded(), "ds-a")).toBe(true);
    expect(isAwake(failed, "ds-a")).toBe(false);
  });
});
