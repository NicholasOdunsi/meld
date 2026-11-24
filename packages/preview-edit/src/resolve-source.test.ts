// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { firstAppFrame, fromDebugSource, fromSourceMap, parseUrlFrames, projectPath, resolveAnySource } from "./resolve-source";

const ORIGIN = "http://127.0.0.1:5333";
// The real stack a Vite 8 + React 19 app produced for its <h1>.
const VITE_STACK = [
  "Error: react-stack-top-frame",
  "    at exports.jsxDEV (http://127.0.0.1:5333/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=dd017fce:196:25)",
  "    at App (http://127.0.0.1:5333/src/App.tsx:2:5)",
  "    at Object.react_stack_bottom_frame (http://127.0.0.1:5333/node_modules/.vite/deps/react-dom_client.js?v=7e3ac2ae:14139:12)",
].join("\n");

// ";IAIU" maps generated line 2, column 4 (0-based) to original line 5, column 10 (0-based) of App.tsx.
const MAP = { version: 3, sources: ["App.tsx"], names: [], mappings: ";IAIU" };
const inline = (map: unknown) => `export default 1;\n//# sourceMappingURL=data:application/json;base64,${btoa(JSON.stringify(map))}\n`;

function element(fiber: Record<string, unknown>): Element {
  const el = document.createElement("h1");
  Object.assign(el, { __reactFiber$x: fiber });
  return el;
}
const moduleFetch = (text: string) => vi.fn(async () => new Response(text)) as unknown as typeof fetch;

describe("fromDebugSource", () => {
  it("reads React 18's _debugSource and marks the column as fuzzy", () => {
    const el = element({ _debugSource: { fileName: "/proj/src/App.jsx", lineNumber: 19, columnNumber: 11 } });
    expect(fromDebugSource(el)).toEqual({ file: "/proj/src/App.jsx", line: 19, column: 11, fuzzy: true });
  });
  it("is null without a usable _debugSource", () => {
    expect(fromDebugSource(element({}))).toBeNull();
    expect(fromDebugSource(element({ _debugSource: { fileName: "a.jsx" } }))).toBeNull();
    expect(fromDebugSource(document.createElement("div"))).toBeNull();
  });
});

describe("firstAppFrame", () => {
  it("skips React internals and dependency bundles and keeps the app frame", () => {
    expect(firstAppFrame(parseUrlFrames(VITE_STACK), ORIGIN)).toEqual({ methodName: "App", url: "http://127.0.0.1:5333/src/App.tsx", line: 2, column: 5 });
  });
  it("reads Vite creation frames from WKWebView", () => {
    const stack = [
      `@${ORIGIN}/node_modules/.vite/deps/react_jsx-dev-runtime.js:196:30`,
      `App@${ORIGIN}/src/App.tsx:54:72`,
      `react_stack_bottom_frame@${ORIGIN}/node_modules/.vite/deps/react-dom_client.js:14139:21`,
    ].join("\n");
    expect(firstAppFrame(parseUrlFrames(stack), ORIGIN)).toEqual({
      methodName: "App", url: `${ORIGIN}/src/App.tsx`, line: 54, column: 72,
    });
  });
  it("ignores frames from another origin", () => {
    expect(firstAppFrame(parseUrlFrames("    at A (http://cdn.example.com/a.js:1:1)"), ORIGIN)).toBeNull();
  });
  it("skips the jsx runtime inside a single bundle (Create React App)", () => {
    const stack = ["Error", "    at exports.jsxDEV (http://127.0.0.1:5333/static/js/bundle.js:100:1)", "    at App (http://127.0.0.1:5333/static/js/bundle.js:900:7)"].join("\n");
    expect(firstAppFrame(parseUrlFrames(stack), ORIGIN)?.line).toBe(900);
  });
});

describe("projectPath", () => {
  it("resolves a relative source against the module URL", () => {
    expect(projectPath("App.tsx", "http://127.0.0.1:5333/src/App.tsx")).toBe("src/App.tsx");
    expect(projectPath("../lib/x.tsx", "http://127.0.0.1:5333/src/App.tsx")).toBe("lib/x.tsx");
  });
  it("strips webpack:// prefixes", () => {
    expect(projectPath("webpack://my-app/./src/App.js", "http://localhost:3000/static/js/bundle.js")).toBe("src/App.js");
  });
});

describe("fromSourceMap", () => {
  it("decodes an inline source map to the original position", async () => {
    const el = element({ _debugStack: { stack: VITE_STACK } });
    const result = await fromSourceMap(el, moduleFetch(inline(MAP)), ORIGIN);
    expect(result).toEqual({ file: "src/App.tsx", line: 5, column: 11 });
  });
  it("follows an external .map file", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(url.endsWith(".map") ? JSON.stringify(MAP) : "export default 1;\n//# sourceMappingURL=App.tsx.map\n");
    }) as unknown as typeof fetch;
    const result = await fromSourceMap(element({ _debugStack: { stack: VITE_STACK } }), fetchImpl, ORIGIN);
    expect(result?.file).toBe("src/App.tsx");
    expect(calls[1]).toBe("http://127.0.0.1:5333/src/App.tsx.map");
  });
  it("never resolves to a dependency file, but still resolves the app's own source", async () => {
    const el = element({ _debugStack: { stack: VITE_STACK } });
    const dependency = { ...MAP, sources: ["webpack://app/./node_modules/lib/Button.js"] };
    expect(await fromSourceMap(el, moduleFetch(inline(dependency)), ORIGIN)).toBeNull();
    const linked = { ...MAP, sources: ["../../node_modules/.pnpm/lib@1.0.0/node_modules/lib/Button.js"] };
    expect(await fromSourceMap(el, moduleFetch(inline(linked)), ORIGIN)).toBeNull();
    const own = { ...MAP, sources: ["webpack://app/./src/App.tsx"] };
    expect(await fromSourceMap(el, moduleFetch(inline(own)), ORIGIN)).toEqual({ file: "src/App.tsx", line: 5, column: 11 });
  });
  it("is null when the module has no source map, the fetch fails, or the position is unmapped", async () => {
    const el = element({ _debugStack: { stack: VITE_STACK } });
    expect(await fromSourceMap(el, moduleFetch("export default 1;"), ORIGIN)).toBeNull();
    expect(await fromSourceMap(el, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch, ORIGIN)).toBeNull();
    expect(await fromSourceMap(el, moduleFetch(inline({ ...MAP, mappings: "" })), ORIGIN)).toBeNull();
    expect(await fromSourceMap(document.createElement("div"), moduleFetch(""), ORIGIN)).toBeNull();
  });
});

describe("resolveAnySource", () => {
  it("prefers React 18's _debugSource without any network call", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const el = element({ _debugSource: { fileName: "/p/a.jsx", lineNumber: 3, columnNumber: 5 } });
    expect(await resolveAnySource(el, fetchImpl, ORIGIN)).toEqual({ file: "/p/a.jsx", line: 3, column: 5, fuzzy: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("falls back to the source map for a Vite-style stack", async () => {
    const el = element({ _debugStack: { stack: VITE_STACK } });
    expect(await resolveAnySource(el, moduleFetch(inline(MAP)), ORIGIN)).toEqual({ file: "src/App.tsx", line: 5, column: 11 });
  });
  it("is null for an element with no React record (not a React app)", async () => {
    expect(await resolveAnySource(document.createElement("div"), vi.fn() as unknown as typeof fetch, ORIGIN)).toBeNull();
  });
});
