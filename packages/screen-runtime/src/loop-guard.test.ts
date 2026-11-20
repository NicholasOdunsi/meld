import { transform } from "@babel/standalone";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { LOOP_BUDGET_MS, STUCK_MESSAGE } from "./constants";
import { loopGuardPlugin } from "./loop-guard";

function guard(code: string, budgetMs = 20) {
  return transform(code, { parserOpts: { allowReturnOutsideFunction: true }, plugins: [loopGuardPlugin({ budgetMs })] }).code!;
}

function clock(step = 1) {
  let time = -step;
  return { now: () => time += step };
}

describe("loopGuardPlugin", () => {
  it("keeps top-level loop timers private so separate classic scripts can each loop", () => {
    const script = (code: string) => transform(code, { sourceType: "script", plugins: [loopGuardPlugin({ budgetMs: 20 })] }).code!;
    const context = createContext({});
    runInContext(script("var total = 0; for (let i = 0; i < 3; i++) total += i;"), context);
    expect(() => runInContext(script("for (var j = 0; j < 2; j++) total += 10; outer: while (true) { break outer; }"), context)).not.toThrow();
    expect(context.total).toBe(23);
    expect(context.j).toBe(2);
  });
  it("still stops an endless top-level loop in a classic script", () => {
    const code = transform("while (true) {}", { sourceType: "script", plugins: [loopGuardPlugin({ budgetMs: 20 })] }).code!;
    expect(() => runInContext(code, createContext({}))).toThrow(STUCK_MESSAGE);
  });
  it("tells the frame bridge directly before throwing, so browsers that mask thrown errors still report it", () => {
    // WebKit hides an error's text in a sandboxed frame ("Script error."), so
    // the message alone can't be relied on to reach the board.
    const stuck = vi.fn();
    const code = transform("while (true) {}", { sourceType: "script", plugins: [loopGuardPlugin({ budgetMs: 20 })] }).code!;
    expect(() => runInContext(code, createContext({ __orionStuck: stuck }))).toThrow(STUCK_MESSAGE);
    expect(stuck).toHaveBeenCalledTimes(1);
  });
  it("stops an endless while loop", () => {
    expect(() => new Function(guard("while (true) {}"))()).toThrow(STUCK_MESSAGE);
  });
  it("stops an endless for loop with a non-block body", () => {
    expect(() => new Function(guard("for (;;) void 0;"))()).toThrow(STUCK_MESSAGE);
  });
  it("stops an endless do-while", () => {
    expect(() => new Function(guard("do {} while (true);"))()).toThrow(STUCK_MESSAGE);
  });
  it("guards a loop in a non-block position", () => {
    expect(() => new Function(guard("if (true) while (true) {}"))()).toThrow(STUCK_MESSAGE);
  });
  it("keeps labels working", () => {
    const code = guard("let n = 0; outer: for (let i = 0; i < 3; i++) { for (;;) { n++; continue outer; } } return n;");
    expect(new Function(code)()).toBe(3);
  });
  it("leaves finite loops alone", () => {
    expect(new Function(guard("let s = 0; for (let i = 0; i < 1000; i++) s += i; return s;"))()).toBe(499500);
  });
  it("keeps stacked labels working", () => {
    const code = guard("let n = 0; outer: inner: for (let i = 0; i < 3; i++) { n++; continue outer; } return n;");
    expect(new Function(code)()).toBe(3);
  });
  it.each([
    "for (const key in { a: 1, b: 2 }) n++;",
    "for (const value of [1, 2]) n++;",
    "while (n < 2) n++;",
    "do n++; while (n < 2);",
    "for (; n < 2;) n++;",
  ])("guards finite loop forms: %s", (loop) => {
    const code = guard(`let n = 0; ${loop} return n;`);
    expect(new Function(code)()).toBe(2);
    expect(() => new Function("Date", code)(clock(21))).toThrow(STUCK_MESSAGE);
  });
  it("uses the default budget", () => {
    const code = transform("while (a) {}", { plugins: [loopGuardPlugin()] }).code!;
    expect(LOOP_BUDGET_MS).toBe(1000);
    expect(code).toContain(`> ${LOOP_BUDGET_MS}`);
  });
  it("resets nested loop timers for each invocation", () => {
    const code = guard("let n = 0; for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) n++; } return n;", 9);
    expect(new Function("Date", code)(clock())).toBe(6);
    expect(code.match(/__ORION_STUCK__/g)).toHaveLength(2);
  });
  it("keeps conditional loop initialization conditional", () => {
    const code = guard("if (false) while (true) {} return 42;");
    expect(new Function("Date", code)({ now: () => { throw new Error("unexpected timer"); } })).toBe(42);
  });
  it("guards each loop once", () => {
    expect(guard("while (a) {}").match(/__ORION_STUCK__/g)).toHaveLength(1);
  });
  it("excludes awaited time and preserves await expression values", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      let total = 0;
      for (let i = 0; i < 3; i++) total += await pause(i);
      return total;
    })();`);
    await expect(new Function("Date", "pause", code)(
      { now: () => time }, async (value: number) => { time += 100; return value; },
    )).resolves.toBe(3);
  });
  it("resets all enclosing loops after await", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      let n = 0;
      for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { await pause(); n++; } }
      return n;
    })();`);
    await expect(new Function("Date", "pause", code)(
      { now: () => time }, async () => { time += 100; },
    )).resolves.toBe(6);
  });
  it("still guards synchronous work after await", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      for (let i = 0; i < 3; i++) { await pause(); work(); }
    })();`);
    await expect(new Function("Date", "pause", "work", code)(
      { now: () => time }, async () => { time += 100; }, () => { time += 21; },
    )).rejects.toThrow(STUCK_MESSAGE);
  });
  it("does not reset enclosing timers for awaits inside a nested function", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      for (let i = 0; i < 3; i++) { (async () => { await pause(); })(); }
    })();`);
    await expect(new Function("Date", "pause", code)(
      { now: () => time }, () => { time += 21; return Promise.resolve(); },
    )).rejects.toThrow(STUCK_MESSAGE);
  });
  it("excludes for-await iterator suspension from enclosing loop budgets", async () => {
    let time = 0;
    const iterable = { [Symbol.asyncIterator]() {
      let value = 0;
      return { async next() {
        time += 100;
        value++;
        return { value, done: value > 3 };
      } };
    } };
    const code = guard(`return (async () => {
      let total = 0;
      for (let i = 0; i < 2; i++) { for await (const value of iterable) total += value; }
      return total;
    })();`);
    await expect(new Function("Date", "iterable", code)({ now: () => time }, iterable)).resolves.toBe(12);
  });
  it.each(["yield i", "yield* [i]"])("excludes suspended generator time: %s", (expression) => {
    let time = 0;
    const code = guard(`return (function* () {
      let last;
      for (let i = 0; i < 3; i++) last = ${expression};
      return last;
    })();`);
    const iterator = new Function("Date", code)({ now: () => time });
    expect(iterator.next().value).toBe(0);
    time += 100;
    expect(iterator.next(4).value).toBe(1);
    time += 100;
    expect(iterator.next(5).value).toBe(2);
    time += 100;
    expect(iterator.next(6)).toEqual({ done: true, value: expression === "yield i" ? 6 : undefined });
  });

  it("resets after a rejected await caught inside the loop", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      let n = 0;
      for (let i = 0; i < 3; i++) { try { await pause(); } catch { n++; } }
      return n;
    })();`);
    await expect(new Function("Date", "pause", code)(
      { now: () => time }, async () => { time += 100; throw new Error("expected"); },
    )).resolves.toBe(3);
  });
  it("guards synchronous catch work after a rejected await", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      for (let i = 0; i < 3; i++) { try { await pause(); } catch { work(); } }
    })();`);
    await expect(new Function("Date", "pause", "work", code)(
      { now: () => time }, async () => { time += 100; throw new Error("expected"); }, () => { time += 21; },
    )).rejects.toThrow(STUCK_MESSAGE);
  });
  it("preserves awaits in loop headers and nested await expressions", async () => {
    let time = 0;
    const code = guard(`return (async () => {
      let n = 0;
      for (; await (await pause(n < 3)); n++) {}
      return n;
    })();`);
    await expect(new Function("Date", "pause", code)(
      { now: () => time }, async (value: boolean) => { time += 100; return value; },
    )).resolves.toBe(3);
  });
  it("resets after a generator throw caught inside its loop", () => {
    let time = 0;
    const code = guard(`return (function* () {
      for (let i = 0; i < 3; i++) { try { yield i; } catch {} }
    })();`);
    const iterator = new Function("Date", code)({ now: () => time });
    expect(iterator.next().value).toBe(0);
    time += 100;
    expect(iterator.throw(new Error("expected")).value).toBe(1);
    time += 100;
    expect(iterator.throw(new Error("expected")).value).toBe(2);
  });

});
