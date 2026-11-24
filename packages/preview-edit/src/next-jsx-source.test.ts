import { describe, expect, it, vi } from "vitest";
import { captureNextJsxSource } from "./next-jsx-source";

const runtimeId = "(app-pages-browser)/./node_modules/next/dist/compiled/react/cjs/react-jsx-dev-runtime.development.js";
const source = { fileName: "/worktree/app/page.tsx", lineNumber: 415, columnNumber: 11 };

function jsxModule() {
  const module = { exports: { jsxDEV: vi.fn(function () { return { _debugStack: new Error() }; }) } };
  const factory = vi.fn(function () { return "factory result"; });
  return { module, factory, chunk: [[1], { [runtimeId]: factory }] as const };
}

function element(stack: unknown): Element {
  return { "__reactFiber$unit": { _debugStack: stack } } as unknown as Element;
}

describe("Next Webpack JSX source capture", () => {
  it("captures early chunks and preserves both factory and JSX call semantics", () => {
    const runtime = jsxModule();
    const original = runtime.module.exports.jsxDEV;
    const page = { webpackChunk_N_E: [runtime.chunk] };
    const read = captureNextJsxSource(page as unknown as Window);
    const require = () => "dependency";
    const factory = runtime.chunk[1][runtimeId] as (module: unknown, exports: unknown, require: unknown) => unknown;
    expect(factory.call("factory receiver", runtime.module, runtime.module.exports, require)).toBe("factory result");
    expect(runtime.factory).toHaveBeenCalledWith(runtime.module, runtime.module.exports, require);
    expect(runtime.factory.mock.contexts).toEqual(["factory receiver"]);
    const jsxDEV = runtime.module.exports.jsxDEV as (...args: unknown[]) => { _debugStack: Error };
    const args = ["h1", { className: "title" }, "key", false, source, "self"];
    const node = jsxDEV.call("jsx receiver", ...args);
    expect(original).toHaveBeenCalledWith(...args);
    expect(original.mock.contexts).toEqual(["jsx receiver"]);
    expect(read(element(node._debugStack))).toEqual({ file: source.fileName, line: source.lineNumber, column: source.columnNumber });
    expect(read(element(new Error()))).toBeNull();
    expect(read(element(jsxDEV("h1", {}, null, false, { ...source, fileName: "/worktree/node_modules/widget/index.jsx" })._debugStack))).toBeNull();
  });

  it("honors Webpack replacing push and chaining its parent callback", () => {
    const page = {} as { webpackChunk_N_E: unknown[] };
    const read = captureNextJsxSource(page as unknown as Window);
    const chunks: unknown[] = [];
    page.webpackChunk_N_E = chunks;
    const pushParent = chunks.push.bind(chunks);
    const runtime = jsxModule();
    const register = vi.fn(function (this: unknown[], chunk: unknown) {
      expect(this).toBe(chunks);
      expect(runtime.chunk[1][runtimeId]).not.toBe(runtime.factory);
      return pushParent(chunk);
    });
    chunks.push = register;
    expect(chunks.push(runtime.chunk)).toBe(1);
    expect(register).toHaveBeenCalledOnce();
    expect(chunks).toEqual([runtime.chunk]);
    const factory = runtime.chunk[1][runtimeId] as (module: unknown) => unknown;
    factory(runtime.module);
    const jsxDEV = runtime.module.exports.jsxDEV as (...args: unknown[]) => { _debugStack: Error };
    expect(read(element(jsxDEV("h1", {}, null, false, source)._debugStack))?.line).toBe(415);
    const unrelated = { "app/other": vi.fn() };
    expect(chunks.push([[2], unrelated])).toBe(2);
    expect(unrelated["app/other"]).not.toHaveBeenCalled();
  });
});
