import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
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
});
