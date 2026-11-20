import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompileResult } from "@meld/screen-runtime";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import {
  COMPILE_TIMEOUT_MESSAGE, COMPILE_TIMEOUT_MS, createLiveController, LOAD_FAILED_MESSAGE, READY_TIMEOUT_MS,
  SLEEP_SNAPSHOT_WAIT_MS, SNAPSHOT_DELAY_MS, type LiveDeps,
} from "./live-controller";

const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const compiled: CompileResult = { ok: true, screen: { kind: "react", styles: [], scripts: ["window.x = 1"], html: '<div id="orion-root"></div>', links: [] } };

function setup(overrides: Partial<LiveDeps> = {}) {
  const deps = {
    loadSource: vi.fn(async () => ({ source, snapshot: true })),
    compile: vi.fn(async () => compiled),
    runtimeBundle: vi.fn(async () => "/* runtime */"),
    onSnapshot: vi.fn(),
    onSleep: vi.fn(),
    ...overrides,
  } satisfies LiveDeps;
  const live = createLiveController(deps);
  const frame = { postMessage: vi.fn() };
  const send = (data: object, from: unknown = frame) => live.handleMessage({ source: from, data: { source: "orion-frame", ...data } });
  return { deps, live, frame, send, attach: () => live.attachFrame(frame as unknown as Window) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createLiveController", () => {
  it("builds the live document with the live CSP and inlined runtime", async () => {
    const { live, deps } = setup();
    const listener = vi.fn();
    live.subscribe(listener);
    await live.wake("ds-a");
    const state = live.getState();
    expect(state.phase).toBe("loading");
    if (state.phase !== "loading") throw new Error(state.phase);
    expect(state.document).toContain("connect-src 'none'");
    expect(state.document).toContain("/* runtime */");
    expect(deps.compile).toHaveBeenCalledWith(source);
    expect(listener).toHaveBeenCalled();
  });

  it("uses a preloaded source without loading it again", async () => {
    const { live, deps } = setup();
    await live.wake("ds-a", { source, snapshot: true });
    expect(deps.loadSource).not.toHaveBeenCalled();
    expect(live.getState().phase).toBe("loading");
  });

  it("stops after five seconds without ready", async () => {
    const { live, attach } = setup();
    await live.wake("ds-a");
    attach();
    vi.advanceTimersByTime(READY_TIMEOUT_MS);
    expect(live.getState()).toMatchObject({ phase: "stopped", reason: "timeout" });
  });

  it("keeps running when an error comes before ready", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "error", message: "first script failed" });
    send({ type: "ready" });
    vi.advanceTimersByTime(READY_TIMEOUT_MS);
    expect(live.getState()).toMatchObject({ phase: "running", errors: ["first script failed"] });
  });

  it("stops on stuck and ignores messages from other windows", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "stuck" }, {});
    expect(live.getState().phase).toBe("loading");
    send({ type: "stuck" });
    expect(live.getState()).toMatchObject({ phase: "stopped", reason: "stuck" });
  });

  it("takes a snapshot shortly after ready and stores it", async () => {
    const { live, attach, send, frame, deps } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "ready" });
    vi.advanceTimersByTime(SNAPSHOT_DELAY_MS);
    expect(frame.postMessage).toHaveBeenCalledWith({ source: "orion-host", type: "snapshot" }, "*");
    send({ type: "snapshot", html: "<p>picture</p>" });
    expect(deps.onSnapshot).toHaveBeenCalledWith("ds-a", "<p>picture</p>");
  });

  it("never snapshots screens whose stored HTML is their source", async () => {
    const { live, attach, send, frame, deps } = setup({ loadSource: vi.fn(async () => ({ source, snapshot: false })) });
    await live.wake("welcome");
    attach();
    send({ type: "ready" });
    vi.advanceTimersByTime(SNAPSHOT_DELAY_MS);
    send({ type: "snapshot", html: "<p>x</p>" });
    expect(frame.postMessage).not.toHaveBeenCalled();
    expect(deps.onSnapshot).not.toHaveBeenCalled();
  });

  it("asks for a last snapshot when going to sleep", async () => {
    const { live, attach, send, frame, deps } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "ready" });
    const sleeping = live.sleep();
    expect(frame.postMessage).toHaveBeenCalledWith({ source: "orion-host", type: "snapshot" }, "*");
    send({ type: "snapshot", html: "<p>last</p>" });
    await sleeping;
    expect(deps.onSnapshot).toHaveBeenCalledWith("ds-a", "<p>last</p>");
    expect(live.getState()).toEqual({ phase: "asleep", attempt: 1 });
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("sleeps anyway when the frame does not answer", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "ready" });
    const sleeping = live.sleep();
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await sleeping;
    expect(live.getState().phase).toBe("asleep");
  });

  it("sleeps on Escape from the frame and before waking another screen", async () => {
    const { live, attach, send, deps } = setup({ loadSource: vi.fn(async () => ({ source, snapshot: false })) });
    await live.wake("ds-a");
    attach();
    send({ type: "escape" });
    await vi.runAllTimersAsync();
    expect(live.getState().phase).toBe("asleep");
    await live.wake("ds-a");
    await live.wake("ds-b");
    expect(live.getState()).toMatchObject({ phase: "loading", screenId: "ds-b" });
    expect(deps.onSleep).toHaveBeenCalledTimes(2);
  });

  it("reports compile errors, load failures and compiler crashes", async () => {
    const errors = [{ file: "App.tsx", message: "Unsupported package: next" }];
    const failing = setup({ compile: vi.fn(async () => ({ ok: false as const, errors })) });
    await failing.live.wake("ds-a");
    expect(failing.live.getState()).toMatchObject({ phase: "compile-failed", errors, source });

    const missing = setup({ loadSource: vi.fn(async () => null) });
    await missing.live.wake("ds-a");
    expect(missing.live.getState()).toMatchObject({ phase: "compile-failed", source: null, errors: [{ file: "", message: LOAD_FAILED_MESSAGE }] });

    const crashed = setup({ compile: vi.fn(async () => { throw new Error("The screen compiler stopped. Try again."); }) });
    await crashed.live.wake("ds-a");
    expect(crashed.live.getState()).toMatchObject({ phase: "compile-failed", errors: [{ file: "", message: "The screen compiler stopped. Try again." }] });
  });

  it("reloads a stopped screen as a new attempt", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "stuck" });
    live.reload();
    expect(live.getState()).toMatchObject({ phase: "loading", attempt: 2, errors: [] });
  });

  // Review finding 1: frame events carry no attempt id.
  it("ignores messages from the previous attempt's frame after a reload", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "stuck" });
    live.reload();
    // The old document is still attached until the host mounts the new frame.
    send({ type: "error", message: "late error from the old page" });
    send({ type: "ready" });
    expect(live.getState()).toMatchObject({ phase: "loading", attempt: 2, errors: [] });
    const next = { postMessage: vi.fn() };
    live.attachFrame(next as unknown as Window);
    send({ type: "ready" }, next);
    expect(live.getState()).toMatchObject({ phase: "running", attempt: 2 });
  });

  it("ignores frame messages before any frame is attached and while asleep", async () => {
    const { live, send, attach } = setup();
    send({ type: "ready" }, undefined);
    expect(live.getState().phase).toBe("asleep");
    await live.wake("ds-a");
    send({ type: "ready" }, undefined);
    expect(live.getState().phase).toBe("loading");
    attach();
    await live.sleep();
    send({ type: "stuck" });
    expect(live.getState().phase).toBe("asleep");
  });

  // Review finding 2: synchronous throws and compiles that never finish.
  it("treats a compiler that throws synchronously as a failed compile", async () => {
    const { live } = setup({ compile: vi.fn(() => { throw new Error("Worker could not start"); }) });
    await live.wake("ds-a");
    expect(live.getState()).toMatchObject({ phase: "compile-failed", source, errors: [{ file: "", message: "Worker could not start" }] });
  });

  it("gives up on a compile that never finishes", async () => {
    const { live, deps } = setup({ compile: vi.fn(() => new Promise<CompileResult>(() => {})) });
    const waking = live.wake("ds-a");
    expect(live.getState().phase).toBe("compiling");
    await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS);
    await waking;
    expect(live.getState()).toMatchObject({ phase: "compile-failed", source, errors: [{ file: "", message: COMPILE_TIMEOUT_MESSAGE }] });
    expect(deps.onSnapshot).not.toHaveBeenCalled();
  });

  it("gives up on a source that never loads", async () => {
    const { live } = setup({ loadSource: vi.fn(() => new Promise<null>(() => {})) });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS);
    await waking;
    expect(live.getState()).toMatchObject({ phase: "compile-failed", source: null, errors: [{ file: "", message: COMPILE_TIMEOUT_MESSAGE }] });
  });

  it("ignores a compile result that arrives after the screen went to sleep", async () => {
    let finish: (result: CompileResult) => void = () => {};
    const { live } = setup({ compile: vi.fn(() => new Promise<CompileResult>((resolve) => { finish = resolve; })) });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(0);
    await live.sleep();
    finish(compiled);
    await waking;
    expect(live.getState()).toEqual({ phase: "asleep", attempt: 1 });
  });

  // Review finding 3: oversized snapshots are dropped, never stored.
  it("drops a snapshot larger than the board limit and passes others on unchanged", async () => {
    const { live, attach, send, deps } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "ready" });
    vi.advanceTimersByTime(SNAPSHOT_DELAY_MS);
    send({ type: "snapshot", html: "x".repeat(MAX_SCREEN_HTML_CHARS + 1) });
    expect(deps.onSnapshot).not.toHaveBeenCalled();
    const untrusted = '<img src=x onerror="alert(1)"><script>evil()</script>';
    send({ type: "snapshot", html: untrusted });
    expect(deps.onSnapshot).toHaveBeenCalledWith("ds-a", untrusted);
  });

  it("does not store a snapshot sent while the screen is still loading", async () => {
    const { live, attach, send, deps } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "snapshot", html: "<p>early</p>" });
    expect(deps.onSnapshot).not.toHaveBeenCalled();
  });

  // Review finding 5: every entry to loading gets its own ready timer.
  it("restarts the ready timer on reload and ignores the earlier attempt's timer", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    vi.advanceTimersByTime(READY_TIMEOUT_MS - 1000);
    live.reload();
    vi.advanceTimersByTime(1000);
    expect(live.getState()).toMatchObject({ phase: "loading", attempt: 2 });
    vi.advanceTimersByTime(READY_TIMEOUT_MS - 1000);
    expect(live.getState()).toMatchObject({ phase: "stopped", reason: "timeout", attempt: 2 });

    live.reload();
    attach();
    send({ type: "ready" });
    vi.advanceTimersByTime(READY_TIMEOUT_MS * 2);
    expect(live.getState()).toMatchObject({ phase: "running", attempt: 3 });
  });

  // Overlapping sleeps (review fix round 1).
  async function runningA() {
    const ctx = setup();
    await ctx.live.wake("ds-a");
    ctx.attach();
    ctx.send({ type: "ready" });
    return ctx;
  }

  it("does not put a newly woken screen to sleep when an earlier sleep finishes", async () => {
    const { live, send, deps } = await runningA();
    send({ type: "escape" });
    const waking = live.wake("ds-b");
    send({ type: "snapshot", html: "<p>last</p>" });
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await waking;
    expect(live.getState()).toMatchObject({ phase: "loading", screenId: "ds-b" });
    expect(deps.onSleep).toHaveBeenCalledOnce();
    expect(deps.onSnapshot).toHaveBeenCalledOnce();
  });

  it("ends with the last screen clicked when two wakes overlap a sleep", async () => {
    const { live, deps } = await runningA();
    const toB = live.wake("ds-b");
    const toC = live.wake("ds-c");
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await Promise.all([toB, toC]);
    expect(live.getState()).toMatchObject({ phase: "loading", screenId: "ds-c" });
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("keeps the latest of three wakes queued before a sleep snapshot", async () => {
    const { live, send, deps } = await runningA();
    const toB = live.wake("ds-b");
    const toC = live.wake("ds-c");
    const toD = live.wake("ds-d");

    send({ type: "snapshot", html: "<p>last</p>" });
    await Promise.all([toB, toC, toD]);

    expect(live.getState()).toMatchObject({ phase: "loading", screenId: "ds-d", attempt: 2 });
    expect(deps.loadSource).toHaveBeenCalledTimes(2);
    expect(deps.loadSource).toHaveBeenLastCalledWith("ds-d");
    expect(deps.onSleep).toHaveBeenCalledOnce();
    expect(deps.onSnapshot).toHaveBeenCalledOnce();
    expect(deps.onSnapshot).toHaveBeenCalledWith("ds-a", "<p>last</p>");
  });

  it("wakes the same screen again when asked during its pending sleep", async () => {
    const { live, send, deps } = await runningA();
    send({ type: "escape" });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await waking;
    expect(live.getState()).toMatchObject({ phase: "loading", screenId: "ds-a", attempt: 2 });
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("fires onSleep once when sleep is asked for twice", async () => {
    const { live, deps } = await runningA();
    const first = live.sleep();
    const second = live.sleep();
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await Promise.all([first, second]);
    expect(live.getState().phase).toBe("asleep");
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("stops timers on dispose", async () => {
    const { live } = setup();
    await live.wake("ds-a");
    live.dispose();
    vi.advanceTimersByTime(READY_TIMEOUT_MS);
    expect(live.getState().phase).toBe("loading");
  });
});
