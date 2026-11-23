import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { SUPPORTED_MODULES } from "./constants";
// @ts-expect-error The import-safe Node build script has no declaration file.
import { runtimeStamp } from "../scripts/build-runtime.mjs";

const bundlePath = new URL("../../../apps/web/public/screen-runtime/runtime.js", import.meta.url);

describe("screen runtime bundle", () => {
  it("stamps the generated asset with the ordered pinned runtime dependencies", () => {
    const { devDependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const versions = ["react", "react-dom", "lucide-react", "clsx", "@tailwindcss/browser"]
      .map((name) => `${name}@${devDependencies[name]}`).join(",");
    const expected = createHash("sha256").update(versions).digest("hex").slice(0, 16);
    expect(runtimeStamp()).toBe(expected);
    expect(readFileSync(bundlePath, "utf8").split("\n")[0]).toBe(`/* orion-screen-runtime ${expected} */`);
  });

  it("exports exactly the supported modules with Babel default and named import interop", () => {
    const source = readFileSync(bundlePath, "utf8").split("/* tailwindcss browser */")[0];
    const window: { __orionModules?: Record<string, Record<string, unknown>> } = {};
    runInNewContext(source, { window, console, setTimeout, clearTimeout });
    const modules = window.__orionModules!;
    expect(Object.keys(modules).sort()).toEqual([...SUPPORTED_MODULES].sort());
    for (const module of Object.values(modules)) {
      expect(module.__esModule).toBe(true);
      expect(module.default).toBeDefined();
    }
    expect(modules.react.createElement).toBeTypeOf("function");
    expect((modules.react.default as Record<string, unknown>).createElement).toBe(modules.react.createElement);
    expect(modules.react.version).toBe("19.2.4");
    expect(modules["react/jsx-runtime"].jsx).toBeTypeOf("function");
    expect(modules["react-dom"].createPortal).toBeTypeOf("function");
    expect(modules["react-dom/client"].createRoot).toBeTypeOf("function");
    expect(modules["lucide-react"].ArrowRight).toBeDefined();
    expect(modules.clsx.default).toBe(modules.clsx.clsx);
    expect((modules.clsx.default as (...args: unknown[]) => string)("a", false, { b: true })).toBe("a b");
  });

  it("includes the complete standalone Tailwind browser IIFE", () => {
    const tailwindPath = new URL("../node_modules/@tailwindcss/browser/dist/index.global.js", import.meta.url);
    const tailwind = readFileSync(tailwindPath, "utf8");
    expect(tailwind).toContain("(()=>{");
    expect(readFileSync(bundlePath, "utf8")).toContain(`/* tailwindcss browser */\n${tailwind}`);
  });
});
