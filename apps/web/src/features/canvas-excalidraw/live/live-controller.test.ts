import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompileResult } from "@meld/screen-runtime";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import {
  COMPILE_TIMEOUT_MESSAGE,
  COMPILE_TIMEOUT_MS,
  createLiveController,
  LOAD_FAILED_MESSAGE,
  READY_TIMEOUT_MS,
  SLEEP_SNAPSHOT_WAIT_MS,
  SNAPSHOT_DELAY_MS,
  type LiveDeps,
} from "./live-controller";

const source = {
  kind: "react" as const,
  files: { "App.tsx": "export default () => <main/>" },
  entry: "App.tsx",
};
const compiled: CompileResult = {
  ok: true,
  screen: {
    kind: "react",
    styles: [],
    scripts: ["window.x = 1"],
    html: '<div id="orion-root"></div>',
    links: [],
  },
};

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
  const send = (data: object, from: unknown = frame) =>
    live.handleMessage({
      source: from,
      data: { source: "orion-frame", ...data },
    });
  return {
    deps,
    live,
    frame,
    send,
    attach: () => live.attachFrame(frame as unknown as Window),
  };
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

  it("resets a loading attempt on disposal and starts a fresh ready timer when reused", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    live.dispose();
    send({ type: "ready" });
    expect(live.getState()).toMatchObject({ phase: "asleep", attempt: 1 });
    await live.wake("ds-a");
    expect(live.getState()).toMatchObject({ phase: "loading", attempt: 2 });
    vi.advanceTimersByTime(READY_TIMEOUT_MS);
    expect(live.getState()).toMatchObject({
      phase: "stopped",
      attempt: 2,
      reason: "timeout",
    });
  });

  it("ignores in-flight compilation after disposal", async () => {
    let finish: (result: CompileResult) => void = () => {};
    const { live } = setup({
      compile: vi.fn(
        () =>
          new Promise<CompileResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(0);
    live.dispose();
    finish(compiled);
    await waking;
    expect(live.getState()).toMatchObject({ phase: "asleep", attempt: 1 });
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
    expect(live.getState()).toMatchObject({
      phase: "stopped",
      reason: "timeout",
    });
  });

  it("keeps running when an error comes before ready", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "error", message: "first script failed" });
    send({ type: "ready" });
    vi.advanceTimersByTime(READY_TIMEOUT_MS);
    expect(live.getState()).toMatchObject({
      phase: "running",
      errors: ["first script failed"],
    });
  });

  it("stops on stuck and ignores messages from other windows", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "stuck" }, {});
    expect(live.getState().phase).toBe("loading");
    send({ type: "stuck" });
    expect(live.getState()).toMatchObject({
      phase: "stopped",
      reason: "stuck",
    });
  });

  it("takes a snapshot shortly after ready and stores it", async () => {
    const { live, attach, send, frame, deps } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "ready" });
    vi.advanceTimersByTime(SNAPSHOT_DELAY_MS);
    expect(frame.postMessage).toHaveBeenCalledWith(
      { source: "orion-host", type: "snapshot" },
      "*",
    );
    send({ type: "snapshot", html: "<p>picture</p>" });
    expect(deps.onSnapshot).toHaveBeenCalledWith("ds-a", "<p>picture</p>");
  });

  it("never snapshots screens whose stored HTML is their source", async () => {
    const { live, attach, send, frame, deps } = setup({
      loadSource: vi.fn(async () => ({ source, snapshot: false })),
    });
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
    expect(frame.postMessage).toHaveBeenCalledWith(
      { source: "orion-host", type: "snapshot" },
      "*",
    );
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
    const { live, attach, send, deps } = setup({
      loadSource: vi.fn(async () => ({ source, snapshot: false })),
    });
    await live.wake("ds-a");
    attach();
    send({ type: "escape" });
    await vi.runAllTimersAsync();
    expect(live.getState().phase).toBe("asleep");
    await live.wake("ds-a");
    await live.wake("ds-b");
    expect(live.getState()).toMatchObject({
      phase: "loading",
      screenId: "ds-b",
    });
    expect(deps.onSleep).toHaveBeenCalledTimes(2);
  });

  it("reports compile errors, load failures and compiler crashes", async () => {
    const errors = [{ file: "App.tsx", message: "Unsupported package: next" }];
    const failing = setup({
      compile: vi.fn(async () => ({ ok: false as const, errors })),
    });
    await failing.live.wake("ds-a");
    expect(failing.live.getState()).toMatchObject({
      phase: "compile-failed",
      errors,
      source,
    });

    const missing = setup({ loadSource: vi.fn(async () => null) });
    await missing.live.wake("ds-a");
    expect(missing.live.getState()).toMatchObject({
      phase: "compile-failed",
      source: null,
      errors: [{ file: "", message: LOAD_FAILED_MESSAGE }],
    });

    const crashed = setup({
      compile: vi.fn(async () => {
        throw new Error("The screen compiler stopped. Try again.");
      }),
    });
    await crashed.live.wake("ds-a");
    expect(crashed.live.getState()).toMatchObject({
      phase: "compile-failed",
      errors: [
        { file: "", message: "The screen compiler stopped. Try again." },
      ],
    });
  });

  it("reloads a stopped screen as a new attempt", async () => {
    const { live, attach, send } = setup();
    await live.wake("ds-a");
    attach();
    send({ type: "stuck" });
    live.reload();
    expect(live.getState()).toMatchObject({
      phase: "loading",
      attempt: 2,
      errors: [],
    });
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
    expect(live.getState()).toMatchObject({
      phase: "loading",
      attempt: 2,
      errors: [],
    });
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
    const { live } = setup({
      compile: vi.fn(() => {
        throw new Error("Worker could not start");
      }),
    });
    await live.wake("ds-a");
    expect(live.getState()).toMatchObject({
      phase: "compile-failed",
      source,
      errors: [{ file: "", message: "Worker could not start" }],
    });
  });

  it("gives up on a compile that never finishes", async () => {
    const { live, deps } = setup({
      compile: vi.fn(() => new Promise<CompileResult>(() => {})),
    });
    const waking = live.wake("ds-a");
    expect(live.getState().phase).toBe("compiling");
    await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS);
    await waking;
    expect(live.getState()).toMatchObject({
      phase: "compile-failed",
      source,
      errors: [{ file: "", message: COMPILE_TIMEOUT_MESSAGE }],
    });
    expect(deps.onSnapshot).not.toHaveBeenCalled();
  });

  it("gives up on a source that never loads", async () => {
    const { live } = setup({
      loadSource: vi.fn(() => new Promise<null>(() => {})),
    });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(COMPILE_TIMEOUT_MS);
    await waking;
    expect(live.getState()).toMatchObject({
      phase: "compile-failed",
      source: null,
      errors: [{ file: "", message: COMPILE_TIMEOUT_MESSAGE }],
    });
  });

  it("ignores a compile result that arrives after the screen went to sleep", async () => {
    let finish: (result: CompileResult) => void = () => {};
    const { live } = setup({
      compile: vi.fn(
        () =>
          new Promise<CompileResult>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const waking = live.wake("ds-a");
    await vi.advanceTimersByTimeAsync(0);
    await live.sleep();
    finish(compiled);
    await waking;
    expect(live.getState()).toEqual({ phase: "asleep", attempt: 1 });
  });

  it("identifies the original attempt after a delayed source read and same-frame wake", async () => {
    const loaded = { source, snapshot: false };
    let finish!: (value: typeof loaded) => void;
    const loadSource = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof loaded>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(loaded);
    const { live } = setup({ loadSource });
    const original = live.wake("ds-a", undefined, "frame-a");
    await live.sleep();
    const reopened = await live.wake("ds-a", undefined, "frame-a");
    finish(loaded);
    expect(await original).toBe(1);
    expect(reopened).toBe(2);
    expect(live.getState()).toMatchObject({
      phase: "loading",
      attempt: reopened,
    });
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
    expect(live.getState()).toMatchObject({
      phase: "stopped",
      reason: "timeout",
      attempt: 2,
    });

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
    expect(live.getState()).toMatchObject({
      phase: "loading",
      screenId: "ds-b",
    });
    expect(deps.onSleep).toHaveBeenCalledOnce();
    expect(deps.onSnapshot).toHaveBeenCalledOnce();
  });

  it("cancels a queued wake when Escape comes during the switch snapshot", async () => {
    const { live, send, deps } = await runningA();
    const toB = live.wake("ds-b");
    send({ type: "escape" });
    send({ type: "snapshot", html: "<p>last</p>" });
    await toB;
    expect(live.getState()).toMatchObject({ phase: "asleep", attempt: 1 });
    expect(deps.loadSource).toHaveBeenCalledOnce();
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("ends with the last screen clicked when two wakes overlap a sleep", async () => {
    const { live, deps } = await runningA();
    const toB = live.wake("ds-b");
    const toC = live.wake("ds-c");
    await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
    await Promise.all([toB, toC]);
    expect(live.getState()).toMatchObject({
      phase: "loading",
      screenId: "ds-c",
    });
    expect(deps.onSleep).toHaveBeenCalledOnce();
  });

  it("keeps the latest of three wakes queued before a sleep snapshot", async () => {
    const { live, send, deps } = await runningA();
    const toB = live.wake("ds-b");
    const toC = live.wake("ds-c");
    const toD = live.wake("ds-d");

    send({ type: "snapshot", html: "<p>last</p>" });
    await Promise.all([toB, toC, toD]);

    expect(live.getState()).toMatchObject({
      phase: "loading",
      screenId: "ds-d",
      attempt: 2,
    });
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
    expect(live.getState()).toMatchObject({
      phase: "loading",
      screenId: "ds-a",
      attempt: 2,
    });
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

  it("clears the ready timer and returns to sleep on dispose", async () => {
    const { live } = setup();
    await live.wake("ds-a");
    live.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(live.getState().phase).toBe("asleep");
  });
});

it("keeps the identical working frame on a debounced draft failure and disables stale picks", async () => {
  const onPicked = vi.fn(),
    onDraftIssues = vi.fn();
  const compile = vi
    .fn()
    .mockResolvedValueOnce(compiled)
    .mockResolvedValueOnce({
      ok: false,
      errors: [{ file: "App.tsx", message: "broken" }],
    });
  const { live, attach, send, frame } = setup({
    compile,
    onPicked,
    onDraftIssues,
  });
  await live.wake("a");
  attach();
  send({ type: "ready" });
  live.setPickEnabled(true);
  const mode = frame.postMessage.mock.calls.at(-1)![0];
  const before = live.getState();
  live.previewDraft(
    "a",
    {
      ...source,
      files: { "App.tsx": source.files["App.tsx"].replace("main", "fail") },
    },
    1,
    "code",
  );
  send({
    type: "picked",
    epoch: mode.epoch,
    src: "App.tsx:21:28",
    label: "old",
  });
  await vi.advanceTimersByTimeAsync(599);
  expect(compile).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(live.getState()).toBe(before);
  live.setPickEnabled(true);
  send({
    type: "picked",
    epoch: frame.postMessage.mock.calls.at(-1)![0].epoch,
    src: "App.tsx:21:28",
    label: "old",
  });
  expect(onPicked).not.toHaveBeenCalled();
  expect(onDraftIssues).toHaveBeenCalledWith("a", 1, [
    { file: "App.tsx", message: "broken" },
  ]);
});
it("installs a newer compiled draft after conversion without remounting at alias time", async () => {
  let finish!: (value: CompileResult) => void;
  const compile = vi
    .fn()
    .mockResolvedValueOnce(compiled)
    .mockImplementationOnce(
      () =>
        new Promise<CompileResult>((r) => {
          finish = r;
        }),
    );
  const { live, attach, send } = setup({ compile });
  await live.wake("old", undefined, "physical");
  attach();
  send({ type: "ready" });
  live.previewDraft("old", source, 1, "tweak");
  await vi.advanceTimersByTimeAsync(0);
  const before = live.getState();
  live.retargetSource("old", "new");
  expect(live.getState()).toMatchObject({
    attempt: before.attempt,
    frameId: "physical",
  });
  finish(compiled);
  await vi.advanceTimersByTimeAsync(0);
  expect(live.getState()).toMatchObject({
    phase: "loading",
    screenId: "new",
    frameId: "physical",
    attempt: before.attempt + 1,
  });
});
it("finishes sleep despite a history edit during the snapshot wait and flushes the captured key twice", async () => {
  const onSleepStart = vi.fn();
  const { live, attach, send, deps } = setup({ onSleepStart });
  await live.wake("a");
  attach();
  send({ type: "ready" });
  const sleeping = live.sleep();
  live.previewDraft("a", source, 1, "history");
  await vi.advanceTimersByTimeAsync(SLEEP_SNAPSHOT_WAIT_MS);
  await sleeping;
  expect(live.getState().phase).toBe("asleep");
  expect(deps.compile).toHaveBeenCalledTimes(1);
  expect(onSleepStart.mock.calls).toEqual([["a"], ["a"]]);
});
it("does not leave initial compiling stuck when a newer draft fails", async () => {
  let finish!: (value: CompileResult) => void;
  const compile = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<CompileResult>((r) => {
          finish = r;
        }),
    )
    .mockResolvedValueOnce({
      ok: false,
      errors: [{ file: "App.tsx", message: "broken" }],
    });
  const { live } = setup({ compile });
  const waking = live.wake("a");
  await vi.advanceTimersByTimeAsync(0);
  const invalid = { ...source, files: { "App.tsx": "<" } };
  live.previewDraft("a", invalid, 1, "code");
  await vi.advanceTimersByTimeAsync(600);
  expect(live.getState()).toMatchObject({
    phase: "compile-failed",
    source: invalid,
  });
  finish(compiled);
  await waking;
  expect(live.getState()).toMatchObject({
    phase: "compile-failed",
    source: invalid,
  });
});

it("publishes initial authored syntax diagnostics for a fresh draft panel",async()=>{
 const errors=[{file:"App.tsx",message:"broken",line:1,column:4}],onDraftIssues=vi.fn();
 const {live}=setup({onDraftIssues,compile:vi.fn(async()=>({ok:false as const,errors}))});
 await live.wake("a");expect(onDraftIssues).toHaveBeenCalledWith("a",0,errors);
 expect(live.getState()).toMatchObject({phase:"compile-failed",errors});
});

describe("selection messages", () => {
  async function running(overrides: Partial<LiveDeps> = {}) {
    const ctx = setup(overrides);
    await ctx.live.wake("a");
    ctx.attach();
    ctx.send({ type: "ready" });
    return ctx;
  }
  const pick = (epoch: number) => ({ type: "picked", epoch, src: "App.tsx:21:28", label: "x" });

  it("posts select-element with a fresh epoch and clear-selection to the live frame", async () => {
    const { live, frame } = await running();
    live.selectElement("App.tsx:21:28");
    const select = frame.postMessage.mock.calls.at(-1)![0];
    expect(select).toMatchObject({ source: "orion-host", type: "select-element", src: "App.tsx:21:28" });
    expect(Number.isSafeInteger(select.epoch)).toBe(true);
    live.clearSelection();
    expect(frame.postMessage.mock.calls.at(-1)![0]).toEqual({ source: "orion-host", type: "clear-selection" });
  });

  it("accepts a picked reply carrying the select-element epoch and drops an older one", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.setPickEnabled(true);
    const stale = frame.postMessage.mock.calls.at(-1)![0].epoch;
    live.selectElement("App.tsx:21:28");
    const epoch = frame.postMessage.mock.calls.at(-1)![0].epoch;
    expect(epoch).toBeGreaterThan(stale);
    send(pick(stale));
    expect(onPicked).not.toHaveBeenCalled();
    send(pick(epoch));
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked).toHaveBeenCalledWith("a", "App.tsx:21:28", "x", epoch, 0, null);
  });

  const posted = (frame: { postMessage: { mock: { calls: unknown[][] } } }) =>
    frame.postMessage.mock.calls.map((c) => c[0] as { type: string; epoch?: number });
  const SRC = "App.tsx:21:28";

  it("never posts pick-mode or enables picking from selectElement/clearSelection", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    const before = posted(frame).length;
    live.selectElement(SRC);
    live.clearSelection();
    expect(posted(frame).slice(before).map((m) => m.type)).toEqual(["select-element", "clear-selection"]);
    // Picking is still off: an unrequested pick at the current epoch is dropped.
    send({ ...pick(posted(frame).at(-2)!.epoch!), src: "App.tsx:0:5" });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("accepts the reply to selectElement with picking off, matching epoch and src", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).toHaveBeenCalledWith("a", SRC, "x", epoch, 0, null);
  });

  it("drops a reply with a different epoch or a different src", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    send({ ...pick(epoch - 1), src: SRC });
    send({ ...pick(epoch + 1), src: SRC });
    send({ ...pick(epoch), src: "App.tsx:0:5" });
    expect(onPicked).not.toHaveBeenCalled();
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).toHaveBeenCalledTimes(1);
  });

  it("consumes the pending select: a second identical reply is dropped", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    send({ ...pick(epoch), src: SRC });
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).toHaveBeenCalledTimes(1);
  });

  it("clears the pending select on clearSelection", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    live.clearSelection();
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("clears the pending select on setPickEnabled, keeping a late reply dropped unless picking is on", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    live.setPickEnabled(false);
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).not.toHaveBeenCalled();
    live.selectElement(SRC);
    const second = posted(frame).at(-1)!.epoch!;
    live.setPickEnabled(true);
    send({ ...pick(second), src: SRC });
    expect(onPicked).not.toHaveBeenCalled(); // epoch moved on
    send({ ...pick(posted(frame).at(-1)!.epoch!), src: SRC });
    expect(onPicked).toHaveBeenCalledTimes(1); // picking on accepts a current pick
  });

  it("clears the pending select when a new frame attaches", async () => {
    const onPicked = vi.fn();
    const { live, frame, send, attach } = await running({ onPicked });
    live.selectElement(SRC);
    const epoch = posted(frame).at(-1)!.epoch!;
    attach();
    send({ ...pick(epoch), src: SRC });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("forwards computed values to onPicked", async () => {
    const onPicked = vi.fn();
    const { live, frame, send } = await running({ onPicked });
    live.setPickEnabled(true);
    const computed = { fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "red", backgroundColor: "blue", width: "1px", height: "1px", padding: "0px", gap: "0px", borderRadius: "0px", display: "block" };
    send({ ...pick(frame.postMessage.mock.calls.at(-1)![0].epoch), computed });
    expect(onPicked.mock.calls[0][5]).toEqual(computed);
  });

  it("calls onDeselected when the frame reports a deselect", async () => {
    const onDeselected = vi.fn();
    const { send } = await running({ onDeselected });
    send({ type: "deselected" });
    expect(onDeselected).toHaveBeenCalledTimes(1);
  });
});
