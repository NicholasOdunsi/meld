// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseCreationFrame, resolveSource } from "./creation-frame";

const STACK = [
  "Error: react-stack-top-frame",
  "    at exports.jsxDEV (eval at (app-pages-browser)/../node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js (http://127.0.0.1:3321/_next/static/chunks/app/page.js:192:1), <anonymous>:321:13)",
  "    at Home (webpack-internal:///(app-pages-browser)/./app/page.tsx:541:104)",
  "    at Object.react_stack_bottom_frame (eval at x (http://127.0.0.1:3321/_next/static/chunks/main-app.js:1181:1), <anonymous>:23584:20)",
].join("\n");

function elementWithStack(stack: unknown): Element {
  const element = document.createElement("h1");
  Object.assign(element, { __reactFiber$abc: { _debugStack: { stack } } });
  return element;
}

describe("parseCreationFrame", () => {
  it("finds the first app frame and ignores React internals", () => {
    expect(parseCreationFrame(STACK)).toEqual({
      methodName: "Home",
      file: "webpack-internal:///(app-pages-browser)/./app/page.tsx",
      line: 541,
      column: 104,
    });
  });
  it("keeps route-group parentheses in the path", () => {
    const frame = parseCreationFrame("    at Page (webpack-internal:///(app-pages-browser)/./app/(shop)/cart/page.tsx:10:5)");
    expect(frame?.file).toBe("webpack-internal:///(app-pages-browser)/./app/(shop)/cart/page.tsx");
  });
  it("returns null when no app frame exists", () => {
    expect(parseCreationFrame("Error: x\n    at foo (http://a/b.js:1:1)")).toBeNull();
  });
});

describe("resolveSource", () => {
  const reply = (frame: unknown) =>
    vi.fn(async () => new Response(JSON.stringify([{ status: "fulfilled", value: { originalStackFrame: frame } }])));

  it("asks the dev server for the original position", async () => {
    const fetchImpl = reply({ file: "app/page.tsx", line1: 415, column1: 11 });
    const result = await resolveSource(elementWithStack(STACK), fetchImpl as unknown as typeof fetch);
    expect(result).toEqual({ file: "app/page.tsx", line: 415, column: 11 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/__nextjs_original-stack-frames");
    expect(JSON.parse(String(init.body))).toEqual({
      frames: [{ file: "webpack-internal:///(app-pages-browser)/./app/page.tsx", methodName: "Home", line1: 541, column1: 104, arguments: [] }],
      isServer: false, isEdgeServer: false, isAppDirectory: true,
    });
  });
  it("returns null without a React fiber or a stack", async () => {
    expect(await resolveSource(document.createElement("div"))).toBeNull();
    expect(await resolveSource(elementWithStack(undefined))).toBeNull();
  });
  it("returns null when the server cannot map the frame", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    expect(await resolveSource(elementWithStack(STACK), fetchImpl as unknown as typeof fetch)).toBeNull();
  });
  it("returns null for an unmapped or non-numeric reply", async () => {
    expect(await resolveSource(elementWithStack(STACK), reply({ file: "app/page.tsx" }) as unknown as typeof fetch)).toBeNull();
  });
});
