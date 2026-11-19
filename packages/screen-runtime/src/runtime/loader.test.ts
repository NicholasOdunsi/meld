import { describe, expect, it, vi } from "vitest";
import { MODULE_LOADER_SOURCE } from "./loader";

type Exports = Record<string, unknown>;
type Factory = (require: (path: string) => unknown, module: { exports: unknown }, exports: Exports) => void;
type LoaderWindow = {
  __orionModules: Record<string, unknown>;
  __orionDefine: (path: string, factory: Factory) => void;
  __orionRequire: (path: string) => unknown;
  __orionMount: (path: string) => void;
  __orionReport?: (error: unknown) => void;
};
function setup(modules: Record<string, unknown> = {}) {
  const window = { __orionModules: modules } as LoaderWindow;
  const root = {};
  const document = { getElementById: vi.fn(() => root) };
  new Function("window", "document", MODULE_LOADER_SOURCE)(window, document);
  return { window, document, root };
}

describe("MODULE_LOADER_SOURCE", () => {
  it("loads own supported libraries and exact compiled source paths", () => {
    const react = {};
    const { window } = setup({ react, unsupported: {} });
    window.__orionDefine("src/value.ts", (require, module) => { module.exports = require("react"); });
    expect(window.__orionRequire("src/value.ts")).toBe(react);
    expect(() => window.__orionRequire("unsupported")).toThrow();
    expect(() => window.__orionRequire("missing.ts")).toThrow();
  });
  it("does not resolve inherited module or library properties", () => {
    const { window } = setup(Object.create({ react: {} }) as Record<string, unknown>);
    for (const key of ["react", "toString", "constructor", "__proto__"]) {
      expect(() => window.__orionRequire(key)).toThrow();
    }
    for (const key of ["toString", "constructor", "__proto__"]) {
      window.__orionDefine(key, (_require, module) => { module.exports = key; });
      expect(window.__orionRequire(key)).toBe(key);
    }
  });
  it("caches modules before evaluation for circular dependencies", () => {
    const { window } = setup();
    const first = vi.fn((require: (path: string) => unknown, _module: { exports: unknown }, exports: Exports) => {
      exports.name = "first";
      exports.second = require("second.ts");
    });
    window.__orionDefine("first.ts", first);
    window.__orionDefine("second.ts", (require, _module, exports) => { exports.first = require("first.ts"); });
    const result = window.__orionRequire("first.ts") as Exports;
    expect((result.second as Exports).first).toBe(result);
    expect(window.__orionRequire("first.ts")).toBe(result);
    expect(first).toHaveBeenCalledTimes(1);
  });
  it("retries a module whose factory previously failed", () => {
    const { window } = setup();
    let attempts = 0;
    window.__orionDefine("retry.ts", (_require, module) => {
      if (++attempts === 1) throw new Error("failed initialization");
      module.exports = 42;
    });
    expect(() => window.__orionRequire("retry.ts")).toThrow("failed initialization");
    expect(window.__orionRequire("retry.ts")).toBe(42);
    expect(attempts).toBe(2);
  });
  it.each(["default", "App"])("mounts the %s component with React error reporting", (key) => {
    const Component = () => null;
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));
    const createElement = vi.fn((component: unknown) => ({ component }));
    const { window, root, document } = setup({ react: { createElement }, "react-dom/client": { createRoot } });
    window.__orionReport = vi.fn();
    window.__orionDefine("entry.tsx", (_require, _module, exports) => { exports[key] = Component; });
    window.__orionMount("entry.tsx");
    expect(document.getElementById).toHaveBeenCalledWith("orion-root");
    expect(createElement).toHaveBeenCalledWith(Component);
    expect(render).toHaveBeenCalledWith({ component: Component });
    const options = createRoot.mock.calls[0] as unknown as [unknown, { onUncaughtError: (error: unknown) => void; onCaughtError: (error: unknown) => void }];
    expect(options[0]).toBe(root);
    const error = new Error("render failed");
    options[1].onCaughtError(error);
    options[1].onUncaughtError(error);
    expect(window.__orionReport).toHaveBeenNthCalledWith(1, error);
    expect(window.__orionReport).toHaveBeenNthCalledWith(2, error);
  });
  it("throws an explanatory missing component error", () => {
    const { window } = setup();
    window.__orionReport = vi.fn();
    window.__orionDefine("entry.tsx", () => {});
    expect(() => window.__orionMount("entry.tsx")).toThrow("The entry file has no default export or App component.");
  });
});
