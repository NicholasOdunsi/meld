# Canvas live edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner click an element in the live preview of any web project's Build Star on the Canvas and change it (text, colour, size, spacing, corners) directly in the code (React projects), or describe a bigger change to the AI agent (every project).

**Architecture:** A launcher starts the project's own dev server (Next, Vite, Create React App, Astro, Nuxt, Angular, or its `dev`/`start` script). A script injected into the preview page resolves a clicked element to its source file and line through three strategies (React 18 `_debugSource`, Next's `/__nextjs_original-stack-frames`, and a generic source-map decode of React's `_debugStack`). A small Node helper bundled in the Mac app turns that into an element range and applies the existing `@meld/screen-runtime` `inspectElement` / `applyTweak` to the file in the build's worktree. The existing web `TweakPanel` (inside `LivePanel`) shows the fields; the Mac app and the web board exchange selection and edit requests by polling `window.__orionPreviewEdit`, the same way the board's preview frame is polled today.

**Tech Stack:** TypeScript (new package `@meld/preview-edit`, tsup, vitest, `@babel/standalone`), Swift 6 / SwiftUI / WebKit (apps/mac), React + Astryx + the inspector kit (apps/web).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-24-canvas-live-edit-design.md`. Branch: `NicholasOdunsi/canvas-live-edit` (never commit to `main`).
- Any web project can be previewed and described; direct edits need React (JSX). Verified by spike: Daily Quest (Next 15.5.0, React 19.1.0) and a fresh Vite 8 + React 19 app. React 18 / Create React App paths are unit-tested only (no real app in the acceptance run); say so in reports.
- Direct edits touch `.tsx`, `.jsx` and `.js` files only. Turbopack's frame format is not handled (it falls through to the describe box).
- No file in the user's repo is changed except by an explicit edit; no config, plugin or tag is added to the app.
- Edits only touch `.tsx` / `.jsx` files inside the Star's recorded worktree (the check `BuildPreview.worktree(for:)` already makes); never `node_modules`, never outside the root, never through a symlink that leaves it.
- Typed values only: reuse `cssValue` validation inside `applyTweak` (6-digit hex colours, px lengths, weights 100–900). Text edits are the existing `applyTweak` text path.
- Nothing is saved to Git automatically. Undo/Redo is a separate before/after history (not Git commits).
- Edit mode is disabled while the Star's build status is `working` or `needs_you`, and when the preview server is down.
- The describe box sends text only, through the existing `FrameModel.sendStream(_:provider:model:starTaskID:build: true)`; the body is at most 10,000 characters. No contract or database change.
- UI uses the existing inspector kit and Astryx components only: `LivePanel`, `TweakPanel`, `Section`, `FieldRow`, `TextField` (`live/inspector-ui.tsx`), Astryx `Button` / `Banner` / `Text` / `VStack`. Flat style, no offset shadows, no raw hex or px in Orion UI code (the injected overlay inside the third-party preview page is the one exception and uses a single named constant).
- Every `*.test.ts(x)` sits beside the module it covers (`pnpm test:colocation`). All of these stay green: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test:workspace`, `pnpm check:astryx`, `pnpm test:colocation`, and `swift test` in `apps/mac`.
- Run Node commands with `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.

## File Structure

New package `packages/preview-edit` (`@meld/preview-edit`):

| File | Responsibility |
|------|----------------|
| `src/creation-frame.ts` | Next strategy: parse a React creation stack into one webpack frame; `resolveSource(element, fetch)` asks Next's dev server for the original file and line; `reactFiber(element)` |
| `src/resolve-source.ts` | The strategy chain: React 18 `_debugSource`, then Next, then source-map decode (`resolveAnySource`) |
| `src/locate-element.ts` | `(source text, line, column)` → the JSX element's `{start, end}` range |
| `src/edit-session.ts` | `inspect` / `apply` / `restore` against a worktree on disk, with safe-path rules |
| `src/cli.ts` | stdin JSON → one `edit-session` call → stdout JSON (the helper the Mac app runs) |
| `src/overlay-core.ts` | Pure DOM helpers: pickable check, computed-style subset, element path |
| `src/overlay.ts` | The injected script: hover outline, click to pick, inline text retype, resize handles, message posting |
| `tsup.config.ts` | Builds `cli.ts` → `edit-helper.mjs` and `overlay.ts` → `overlay.js` into `apps/mac/Sources/Orion/Resources/PreviewEdit/` |

Mac (`apps/mac/Sources/Orion/Project/`): `PreviewLaunchPlan.swift` (pick how to start a project's dev server), `PreviewEditResources.swift` (locate bundled files), `PreviewEditHistory.swift` (undo/redo), `PreviewEditHelper.swift` (run the Node helper), `PreviewEditor.swift` (state + exchange with the board), changes to `BuildPreview.swift`, `CanvasLivePreview.swift`, `ProjectScreen.swift`, `FrameModel.swift`, `Package.swift`.

Web (`apps/web/src/features/canvas-excalidraw/preview-edit/`): `preview-edit-store.ts` (selection + request queue shared with the Mac app via `window.__orionPreviewEdit`), `preview-edit-panel.tsx` (the panel), plus a small mount in `excalidraw-board.tsx`.

Shared constant: the message and request shapes are defined once in `preview-edit-store.ts` (web) and mirrored in `PreviewEditor.swift` (Mac); Task 6 and Task 8 tests pin both against the same JSON samples.

---

### Task 1: Package scaffold and source resolver

**Files:**
- Create: `packages/preview-edit/package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`
- Create: `packages/preview-edit/src/creation-frame.ts` (this is the Next.js strategy; Task 1B adds the others)
- Test: `packages/preview-edit/src/creation-frame.test.ts`
- Modify: root `package.json` (add `"@meld/preview-edit": "workspace:*"` to `devDependencies`, next to `@meld/prototype`), `pnpm-lock.yaml`

**Interfaces:**
- Produces: `parseCreationFrame(stack: string): CreationFrame | null`, `resolveSource(element: Element, fetchImpl?: typeof fetch): Promise<ResolvedSource | null>` (the Next strategy), types `CreationFrame = { methodName: string; file: string; line: number; column: number }`, `ResolvedSource = { file: string; line: number; column: number; fuzzy?: boolean }` (file relative to the project root, line and column 1-based).

- [ ] **Step 1: Scaffold the package**

`packages/preview-edit/package.json`:

```json
{
  "name": "@meld/preview-edit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./creation-frame": "./src/creation-frame.ts",
    "./edit-session": "./src/edit-session.ts",
    "./locate-element": "./src/locate-element.ts"
  },
  "scripts": {
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/standalone": "7.29.14",
    "@jridgewell/trace-mapping": "0.3.31",
    "@meld/screen-runtime": "workspace:*",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@types/babel__core": "7.20.5",
    "@types/babel__standalone": "7.1.9",
    "@types/node": "20.19.43",
    "eslint": "9.39.5",
    "jsdom": "27.0.0",
    "tsup": "8.5.1",
    "typescript": "5.9.3",
    "typescript-eslint": "8.65.0",
    "vitest": "4.1.10"
  }
}
```

`tsconfig.json` (same as `packages/device-auth/tsconfig.json` plus DOM for the overlay):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tsup.config.ts"]
}
```

`eslint.config.mjs`: copy `packages/device-auth/eslint.config.mjs` verbatim. `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });
```

Add the root dependency line, then run `pnpm install` (this updates `pnpm-lock.yaml`; CI uses `--frozen-lockfile`, so commit the lockfile). Expected: install succeeds, no other package's version changes.

- [ ] **Step 2: Write the failing test**

`src/creation-frame.test.ts`:

```ts
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
```

This file needs a DOM: add `// @vitest-environment jsdom` as the first line of the test file.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/creation-frame.test.ts`
Expected: FAIL (`Failed to resolve import "./creation-frame"`).

- [ ] **Step 4: Implement**

`src/creation-frame.ts`:

```ts
export type CreationFrame = { methodName: string; file: string; line: number; column: number };
export type ResolvedSource = { file: string; line: number; column: number };

// "at Home (webpack-internal:///(app-pages-browser)/./app/page.tsx:541:104)". The path is lazy so a
// route-group folder such as (shop) keeps its parentheses.
const APP_FRAME = /\bat (?:(\S+) )?\((webpack-internal:\/\/\/\(app-pages-browser\)\/\.\/.+?):(\d+):(\d+)\)/;

export function parseCreationFrame(stack: string): CreationFrame | null {
  for (const line of stack.split("\n")) {
    const match = APP_FRAME.exec(line);
    if (match) return { methodName: match[1] ?? "", file: match[2]!, line: Number(match[3]), column: Number(match[4]) };
  }
  return null;
}

export function reactFiber(element: Element): Record<string, unknown> | null {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  return key ? ((element as unknown as Record<string, Record<string, unknown> | undefined>)[key] ?? null) : null;
}

function creationStack(element: Element): string | null {
  const stack = (reactFiber(element)?._debugStack as { stack?: unknown } | undefined)?.stack;
  return typeof stack === "string" ? stack : null;
}

// React 19 dev builds remember where each element was created; Next's dev server maps that position back to
// the original source. Both are internal, so any surprise (missing fiber, server error, odd reply) is null.
export async function resolveSource(element: Element, fetchImpl: typeof fetch = fetch): Promise<ResolvedSource | null> {
  const stack = creationStack(element);
  const frame = stack ? parseCreationFrame(stack) : null;
  if (!frame) return null;
  try {
    const response = await fetchImpl("/__nextjs_original-stack-frames", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frames: [{ file: frame.file, methodName: frame.methodName, line1: frame.line, column1: frame.column, arguments: [] }],
        isServer: false, isEdgeServer: false, isAppDirectory: true,
      }),
    });
    if (!response.ok) return null;
    const [first] = (await response.json()) as { status?: string; value?: { originalStackFrame?: { file?: unknown; line1?: unknown; column1?: unknown } } }[];
    const original = first?.status === "fulfilled" ? first.value?.originalStackFrame : undefined;
    if (!original || typeof original.file !== "string" || !Number.isInteger(original.line1) || !Number.isInteger(original.column1)) return null;
    return { file: original.file, line: original.line1 as number, column: original.column1 as number };
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run the tests, lint and typecheck**

Run: `pnpm --filter @meld/preview-edit exec vitest run && pnpm --filter @meld/preview-edit lint && pnpm --filter @meld/preview-edit typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/preview-edit package.json pnpm-lock.yaml
git commit -m "Add the preview source resolver"
```

---

### Task 1B: More ways to find the source (React 18 and source maps)

**Files:**
- Create: `packages/preview-edit/src/resolve-source.ts`
- Test: `packages/preview-edit/src/resolve-source.test.ts`

**Interfaces:**
- Consumes: `reactFiber`, `resolveSource`, `ResolvedSource` (Task 1).
- Produces: `fromDebugSource(element)`, `parseUrlFrames(stack)`, `firstAppFrame(frames, origin)`, `projectPath(source, moduleUrl)`, `fromSourceMap(element, fetchImpl, origin)`, and `resolveAnySource(element, fetchImpl?, origin?): Promise<ResolvedSource | null>` — the one function the overlay calls. Order: React 18 `_debugSource`, then Next, then source map. The first non-null result wins; every failure is `null`.

- [ ] **Step 1: Write the failing test**

`src/resolve-source.test.ts` (first line `// @vitest-environment jsdom`):

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm install && pnpm --filter @meld/preview-edit exec vitest run src/resolve-source.test.ts`
Expected: FAIL (missing module). `pnpm install` adds `@jridgewell/trace-mapping` (commit the lockfile change).

- [ ] **Step 3: Implement**

`src/resolve-source.ts`:

```ts
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { reactFiber, resolveSource, type ResolvedSource } from "./creation-frame";

export type UrlFrame = { methodName: string; url: string; line: number; column: number };

// React 17/18 dev builds record where an element was written when the JSX-source transform is on.
export function fromDebugSource(element: Element): ResolvedSource | null {
  const source = reactFiber(element)?._debugSource as { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown } | undefined;
  if (!source || typeof source.fileName !== "string" || !Number.isInteger(source.lineNumber) || !Number.isInteger(source.columnNumber)) return null;
  return { file: source.fileName, line: source.lineNumber as number, column: source.columnNumber as number, fuzzy: true };
}

const URL_FRAME = /^\s*at (?:(\S+) )?\(?(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/;

export function parseUrlFrames(stack: string): UrlFrame[] {
  const frames: UrlFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = URL_FRAME.exec(line);
    if (match) frames.push({ methodName: match[1] ?? "", url: match[2]!, line: Number(match[3]), column: Number(match[4]) });
  }
  return frames;
}

const REACT_INTERNAL = /jsxDEV|jsxs?$|react_stack|renderWith|react-stack/;
const LIBRARY_PATH = /\/(node_modules|\.vite\/deps|@vite|@react-refresh|@id)(\/|$)/;

// The first frame that is the app's own component: same origin, not React's runtime, not a dependency bundle.
export function firstAppFrame(frames: UrlFrame[], origin: string): UrlFrame | null {
  for (const frame of frames) {
    let url: URL;
    try { url = new URL(frame.url); } catch { continue; }
    if (url.origin !== origin || REACT_INTERNAL.test(frame.methodName) || LIBRARY_PATH.test(url.pathname)) continue;
    return frame;
  }
  return null;
}

// Where a source-map "source" lives in the project, relative to its root.
export function projectPath(source: string, moduleUrl: string): string | null {
  const webpack = /^webpack:\/\/[^/]*\/(?:\.\/)?(.+)$/.exec(source);
  if (webpack) return webpack[1]!;
  try {
    const path = decodeURIComponent(new URL(source, moduleUrl).pathname).replace(/^\/+/, "");
    return path || null;
  } catch {
    return null;
  }
}

async function loadMap(moduleUrl: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const text = await (await fetchImpl(moduleUrl)).text();
  const reference = [...text.matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g)].at(-1)?.[1];
  if (!reference) return null;
  if (reference.startsWith("data:")) {
    const inline = /^data:application\/json(?:;charset=[^;,]+)?;base64,(.+)$/.exec(reference);
    if (!inline) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(inline[1]!), (char) => char.charCodeAt(0))));
  }
  return (await fetchImpl(new URL(reference, moduleUrl).href)).json();
}

// Any bundler that serves source maps (Vite, Parcel, Create React App, Rspack...): decode React's creation
// position in the served module back to the file the author wrote.
export async function fromSourceMap(element: Element, fetchImpl: typeof fetch, origin: string): Promise<ResolvedSource | null> {
  const stack = (reactFiber(element)?._debugStack as { stack?: unknown } | undefined)?.stack;
  if (typeof stack !== "string") return null;
  const frame = firstAppFrame(parseUrlFrames(stack), origin);
  if (!frame) return null;
  try {
    const map = await loadMap(frame.url, fetchImpl);
    if (!map) return null;
    const original = originalPositionFor(new TraceMap(map as ConstructorParameters<typeof TraceMap>[0]), { line: frame.line, column: frame.column - 1 });
    if (original.source === null || original.line === null || original.column === null) return null;
    const file = projectPath(original.source, frame.url);
    return file ? { file, line: original.line, column: original.column + 1 } : null;
  } catch {
    return null;
  }
}

export async function resolveAnySource(
  element: Element,
  fetchImpl: typeof fetch = fetch,
  origin: string = location.origin,
): Promise<ResolvedSource | null> {
  return fromDebugSource(element) ?? (await resolveSource(element, fetchImpl)) ?? (await fromSourceMap(element, fetchImpl, origin));
}
```

- [ ] **Step 4: Run the tests, lint and typecheck**

Run: `pnpm --filter @meld/preview-edit exec vitest run && pnpm --filter @meld/preview-edit lint && pnpm --filter @meld/preview-edit typecheck`
Expected: PASS. In the Next-strategy tests from Task 1 nothing changes. If the "unmapped position" test (`mappings: ""`) throws inside `TraceMap`, the `try/catch` already returns `null`; if it instead returns a mapping, change that case to a map whose only segment is on another line.

- [ ] **Step 5: Real check against a Vite app**

Create a scratch Vite app (`npm create vite@latest app -- --template react-ts --no-interactive`, `npm install`), start it with `npx vite --host 127.0.0.1 --port 5333`, bundle the overlay the same way as Task 5 Step 6 (build first), inject it with Playwright and click the `<h1>`. Expected: the posted `picked` message has `src: { file: "src/App.tsx", line: <the <h1> line>, column: 11 }`. Kill the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add packages/preview-edit pnpm-lock.yaml
git commit -m "Find an element's source through React 18 records and source maps"
```

---

### Task 2: Element locator

**Files:**
- Create: `packages/preview-edit/src/locate-element.ts`
- Test: `packages/preview-edit/src/locate-element.test.ts`

**Interfaces:**
- Produces: `offsetOf(source: string, line: number, column: number): number | null`, `locateElementAt(source: string, file: string, line: number, column: number): { start: number; end: number } | null`. `file` only chooses the parser plugins (`.tsx`/`.ts` → typescript + jsx).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { locateElementAt, offsetOf } from "./locate-element";

const SOURCE = [
  "export default function Home() {",
  "  return (",
  "    <main className=\"hero\">",
  "      <h1 className=\"greet-1\">{name}</h1>",
  "      <p>Plan your day</p>",
  "    </main>",
  "  );",
  "}",
].join("\n");

describe("offsetOf", () => {
  it("turns a 1-based line and column into an offset", () => {
    expect(offsetOf(SOURCE, 1, 1)).toBe(0);
    expect(SOURCE.slice(offsetOf(SOURCE, 4, 7)!, offsetOf(SOURCE, 4, 7)! + 3)).toBe("<h1");
  });
  it("rejects positions outside the file", () => {
    expect(offsetOf(SOURCE, 0, 1)).toBeNull();
    expect(offsetOf(SOURCE, 99, 1)).toBeNull();
    expect(offsetOf(SOURCE, 1, 0)).toBeNull();
  });
});

describe("locateElementAt", () => {
  it("returns the range of the element whose opening < is at the position", () => {
    const range = locateElementAt(SOURCE, "app/page.tsx", 4, 7)!;
    expect(SOURCE.slice(range.start, range.end)).toBe("<h1 className=\"greet-1\">{name}</h1>");
  });
  it("returns the outer element for the outer position", () => {
    const range = locateElementAt(SOURCE, "app/page.tsx", 3, 5)!;
    expect(SOURCE.slice(range.start, range.start + 5)).toBe("<main");
    expect(SOURCE.slice(range.end - 7, range.end)).toBe("</main>");
  });
  it("returns null when no element starts there", () => {
    expect(locateElementAt(SOURCE, "app/page.tsx", 4, 8)).toBeNull();
  });
  it("returns null for code that does not parse", () => {
    expect(locateElementAt("const = ;", "app/page.tsx", 1, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/locate-element.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement**

```ts
import { packages } from "@babel/standalone";
import type { NodePath, types as t } from "@babel/core";

export type ElementRange = { start: number; end: number };

export function offsetOf(source: string, line: number, column: number): number | null {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return null;
  const lines = source.split("\n");
  if (line > lines.length) return null;
  let offset = column - 1;
  for (let index = 0; index < line - 1; index++) offset += lines[index]!.length + 1;
  return offset <= source.length ? offset : null;
}

// The element whose opening "<" is exactly at the resolved position. The dev server's column points at that "<".
export function locateElementAt(source: string, file: string, line: number, column: number): ElementRange | null {
  const offset = offsetOf(source, line, column);
  if (offset === null) return null;
  try {
    const ast = packages.parser.parse(source, {
      sourceType: "unambiguous",
      plugins: /\.tsx?$/.test(file) ? ["typescript", "jsx"] : ["jsx"],
    });
    let found: ElementRange | null = null;
    packages.traverse.default(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const { start, end } = path.node;
        if (start === offset && end != null) {
          found = { start, end };
          path.stop();
        }
      },
    });
    return found;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @meld/preview-edit exec vitest run && pnpm --filter @meld/preview-edit typecheck`
Expected: PASS. If `packages.traverse.default` or the `NodePath` type is rejected by the compiler, copy the exact import and call shape from `packages/screen-runtime/src/edit/jsx.ts:1-2,368-380`, which already compiles.

- [ ] **Step 5: Commit**

```bash
git add packages/preview-edit/src/locate-element.ts packages/preview-edit/src/locate-element.test.ts
git commit -m "Locate the JSX element at a resolved source position"
```

---

### Task 3: Edit session (inspect, apply, restore)

**Files:**
- Create: `packages/preview-edit/src/edit-session.ts`
- Test: `packages/preview-edit/src/edit-session.test.ts`

**Interfaces:**
- Consumes: `locateElementAt` (Task 2); `inspectElement(files, src)` and `applyTweak(files, src, tweak)` from `@meld/screen-runtime/edit`; `Inspection`, `Tweak` from `@meld/screen-runtime/edit/types`.
- Produces:
  - `type Source = { file: string; line: number; column: number }`
  - `type Change = { path: string; before: string; after: string }`
  - `type Failure = "not-found" | "not-literal" | "too-large" | "outside-root" | "conflict"`
  - `type Outcome = { ok: true; fields: NonNullable<Inspection>; changes: Change[] } | { ok: false; reason: Failure }`
  - `inspect(root: string, src: Source): Promise<Outcome>` (changes is `[]`)
  - `apply(root: string, src: Source, tweak: Tweak): Promise<Outcome>`
  - `restore(root: string, files: { path: string; expect: string; contents: string }[]): Promise<{ ok: true; changes: Change[] } | { ok: false; reason: Failure }>`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apply, inspect, restore } from "./edit-session";

const PAGE = [
  "export default function Home() {",
  "  return (",
  "    <main>",
  "      <p className=\"tagline\">Plan your day</p>",
  "      <h1>{greeting}</h1>",
  "    </main>",
  "  );",
  "}",
  "",
].join("\n");

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "preview-edit-"));
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app/page.tsx"), PAGE);
});

const tagline = { file: "app/page.tsx", line: 4, column: 7 };
const heading = { file: "app/page.tsx", line: 5, column: 7 };

describe("inspect", () => {
  it("lists editable fields for a literal element", async () => {
    const result = await inspect(root, tagline);
    expect(result.ok && result.fields.text).toMatchObject({ editable: true, value: "Plan your day" });
  });
  it("shows computed text as read-only", async () => {
    const result = await inspect(root, heading);
    expect(result.ok && result.fields.text.editable).toBe(false);
  });
  it("reports not-found for a position with no element", async () => {
    expect(await inspect(root, { ...tagline, column: 9 })).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("apply", () => {
  it("changes literal text on disk and reports before and after", async () => {
    const result = await apply(root, tagline, { field: "text", value: "Plan it" });
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toContain(">Plan it</p>");
    if (result.ok) expect(result.changes).toEqual([{ path: "app/page.tsx", before: PAGE, after: PAGE.replace("Plan your day", "Plan it") }]);
  });
  it("adds an inline style when the element has none", async () => {
    await apply(root, tagline, { field: "color", value: "#ff0000" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toContain("color");
  });
  it("refuses computed text and writes nothing", async () => {
    expect(await apply(root, heading, { field: "text", value: "Hi" })).toEqual({ ok: false, reason: "not-literal" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE);
  });
  it("refuses an invalid colour", async () => {
    expect(await apply(root, tagline, { field: "color", value: "red; background: url(x)" })).toEqual({ ok: false, reason: "not-literal" });
  });
});

describe("safe paths", () => {
  it("refuses files outside the root", async () => {
    expect(await inspect(root, { ...tagline, file: "../outside.tsx" })).toEqual({ ok: false, reason: "outside-root" });
    expect(await inspect(root, { ...tagline, file: "/etc/passwd" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("refuses node_modules and non-JSX files", async () => {
    await mkdir(path.join(root, "node_modules/x"), { recursive: true });
    await writeFile(path.join(root, "node_modules/x/a.tsx"), PAGE);
    await writeFile(path.join(root, "app/styles.css"), "a{}");
    expect(await inspect(root, { ...tagline, file: "node_modules/x/a.tsx" })).toEqual({ ok: false, reason: "outside-root" });
    expect(await inspect(root, { ...tagline, file: "app/styles.css" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("refuses a symlink that leaves the root", async () => {
    const elsewhere = await mkdtemp(path.join(os.tmpdir(), "preview-edit-out-"));
    await writeFile(path.join(elsewhere, "page.tsx"), PAGE);
    await symlink(path.join(elsewhere, "page.tsx"), path.join(root, "app/linked.tsx"));
    expect(await inspect(root, { ...tagline, file: "app/linked.tsx" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("accepts a plain .js file that contains JSX", async () => {
    await writeFile(path.join(root, "app/legacy.js"), "export const A = () => <p>Hi</p>;\n");
    const result = await inspect(root, { file: "app/legacy.js", line: 1, column: 24 });
    expect(result.ok && result.fields.text.value).toBe("Hi");
  });
  it("tries one column less for a fuzzy position, and only when asked", async () => {
    expect((await inspect(root, { ...tagline, column: 8 })).ok).toBe(false);
    expect((await inspect(root, { ...tagline, column: 8, fuzzy: true })).ok).toBe(true);
  });
  it("accepts an absolute path that is inside the root", async () => {
    expect((await inspect(root, { ...tagline, file: path.join(root, "app/page.tsx") })).ok).toBe(true);
  });
  it("refuses a very large file", async () => {
    await writeFile(path.join(root, "app/big.tsx"), "x".repeat(200_001));
    expect(await inspect(root, { ...tagline, file: "app/big.tsx" })).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("restore", () => {
  it("writes the contents when the file still matches what is expected", async () => {
    const edited = await apply(root, tagline, { field: "text", value: "Plan it" });
    const change = edited.ok ? edited.changes[0]! : null;
    const undone = await restore(root, [{ path: change!.path, expect: change!.after, contents: change!.before }]);
    expect(undone.ok).toBe(true);
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE);
  });
  it("refuses when the file changed since, and writes nothing", async () => {
    await writeFile(path.join(root, "app/page.tsx"), PAGE + "// agent edit\n");
    expect(await restore(root, [{ path: "app/page.tsx", expect: PAGE, contents: "x" }])).toEqual({ ok: false, reason: "conflict" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE + "// agent edit\n");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/edit-session.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement**

```ts
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { applyTweak, inspectElement } from "@meld/screen-runtime/edit";
import type { Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import { locateElementAt } from "./locate-element";

// `fuzzy` marks a position from React 18's _debugSource, whose column base differs by toolchain: try it, then one less.
export type Source = { file: string; line: number; column: number; fuzzy?: boolean };
export type Change = { path: string; before: string; after: string };
export type Failure = "not-found" | "not-literal" | "too-large" | "outside-root" | "conflict";
export type Outcome =
  | { ok: true; fields: NonNullable<Inspection>; changes: Change[] }
  | { ok: false; reason: Failure };

const MAX_FILE_CHARS = 200_000;
const JSX_FILE = /\.(tsx|jsx|js)$/;

type Resolved = { absolute: string; relative: string };

// A file the helper may touch: a .tsx/.jsx inside the root, outside node_modules, reached without leaving the
// root (symlinks are resolved first). Anything else is "outside-root".
async function resolveInRoot(root: string, file: string): Promise<Resolved | null> {
  const realRoot = await fs.realpath(root).catch(() => null);
  if (!realRoot) return null;
  const candidate = path.isAbsolute(file) ? path.relative(realRoot, file) : path.normalize(file);
  if (!candidate || candidate.startsWith("..") || path.isAbsolute(candidate)) return null;
  if (candidate.split(path.sep).includes("node_modules") || !JSX_FILE.test(candidate)) return null;
  const real = await fs.realpath(path.join(realRoot, candidate)).catch(() => null);
  if (!real || !real.startsWith(realRoot + path.sep)) return null;
  return { absolute: real, relative: path.relative(realRoot, real) };
}

async function writeAtomically(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, contents);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function findRange(text: string, file: string, src: Source) {
  return locateElementAt(text, file, src.line, src.column)
    ?? (src.fuzzy && src.column > 1 ? locateElementAt(text, file, src.line, src.column - 1) : null);
}

type Target = { resolved: Resolved; text: string; entry: string; tag: string };

async function target(root: string, src: Source): Promise<Target | Failure> {
  const resolved = await resolveInRoot(root, src.file);
  if (!resolved) return "outside-root";
  const text = await fs.readFile(resolved.absolute, "utf8").catch(() => null);
  if (text === null) return "not-found";
  if (text.length > MAX_FILE_CHARS) return "too-large";
  const range = findRange(text, resolved.relative, src);
  if (!range) return "not-found";
  // The edit library only knows screen-shaped paths; it needs the extension and nothing else.
  const entry = `entry.${path.extname(resolved.relative).slice(1)}`;
  return { resolved, text, entry, tag: `${entry}:${range.start}:${range.end}` };
}

export async function inspect(root: string, src: Source): Promise<Outcome> {
  const found = await target(root, src);
  if (typeof found === "string") return { ok: false, reason: found };
  const fields = inspectElement({ [found.entry]: found.text }, found.tag);
  return fields ? { ok: true, fields, changes: [] } : { ok: false, reason: "not-found" };
}

export async function apply(root: string, src: Source, tweak: Tweak): Promise<Outcome> {
  const found = await target(root, src);
  if (typeof found === "string") return { ok: false, reason: found };
  const result = applyTweak({ [found.entry]: found.text }, found.tag, tweak);
  if (!result.ok) return { ok: false, reason: result.reason };
  const after = result.files[found.entry]!;
  await writeAtomically(found.resolved.absolute, after);
  // An edit inside the element never moves its opening "<", so the same position still finds it.
  const range = findRange(after, found.resolved.relative, src);
  const fields = range ? inspectElement({ [found.entry]: after }, `${found.entry}:${range.start}:${range.end}`) : null;
  if (!fields) return { ok: false, reason: "not-found" };
  return { ok: true, fields, changes: [{ path: found.resolved.relative, before: found.text, after }] };
}

export async function restore(
  root: string,
  files: { path: string; expect: string; contents: string }[],
): Promise<{ ok: true; changes: Change[] } | { ok: false; reason: Failure }> {
  const planned: { resolved: Resolved; before: string; contents: string }[] = [];
  for (const file of files) {
    const resolved = await resolveInRoot(root, file.path);
    if (!resolved) return { ok: false, reason: "outside-root" };
    const current = await fs.readFile(resolved.absolute, "utf8").catch(() => null);
    if (current === null) return { ok: false, reason: "not-found" };
    if (current !== file.expect) return { ok: false, reason: "conflict" };
    if (file.contents.length > MAX_FILE_CHARS) return { ok: false, reason: "too-large" };
    planned.push({ resolved, before: current, contents: file.contents });
  }
  for (const item of planned) await writeAtomically(item.resolved.absolute, item.contents);
  return { ok: true, changes: planned.map((item) => ({ path: item.resolved.relative, before: item.before, after: item.contents })) };
}
```

- [ ] **Step 4: Run tests, lint and typecheck**

Run: `pnpm --filter @meld/preview-edit exec vitest run && pnpm --filter @meld/preview-edit lint && pnpm --filter @meld/preview-edit typecheck`
Expected: PASS. The "adds an inline style" test depends on the existing library's inline fallback (`jsx.ts` around line 362); if it fails, read that code path and fix the test's expectation to the library's real output, not the implementation.

- [ ] **Step 5: Commit**

```bash
git add packages/preview-edit/src/edit-session.ts packages/preview-edit/src/edit-session.test.ts
git commit -m "Apply edits to a build's worktree through the screen editor"
```

---

### Task 4: Helper command and build output

**Files:**
- Create: `packages/preview-edit/src/cli.ts`, `packages/preview-edit/src/cli.test.ts`, `packages/preview-edit/tsup.config.ts`
- Create (generated, committed): `apps/mac/Sources/Orion/Resources/PreviewEdit/edit-helper.mjs`
- Modify: `apps/mac/Package.swift` (resources), `.github/workflows/ci.yml` (staleness check), `packages/screen-runtime/package.json` only if the helper bundle needs a new export (it should not)

**Interfaces:**
- Consumes: `inspect`, `apply`, `restore` (Task 3).
- Produces: `handle(request: unknown): Promise<unknown>` (exported for tests). Process protocol: read all of stdin as one JSON request, write one JSON line to stdout. Requests:
  - `{"op":"inspect","root":"/abs/worktree","src":{"file":"app/page.tsx","line":415,"column":11}}`
  - `{"op":"apply","root":"…","src":{…},"tweak":{"field":"color","value":"#ff0000"}}`
  - `{"op":"restore","root":"…","files":[{"path":"app/page.tsx","expect":"…","contents":"…"}]}`
  Reply is the `Outcome` / restore result JSON from Task 3; any invalid request replies `{"ok":false,"reason":"not-found"}`.

- [ ] **Step 1: Write the failing test**

`src/cli.test.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { handle } from "./cli";

async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), "preview-cli-"));
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app/page.tsx"), "export default function A() {\n  return <p>Hi</p>;\n}\n");
  return root;
}

describe("handle", () => {
  it("inspects", async () => {
    const root = await project();
    const reply = await handle({ op: "inspect", root, src: { file: "app/page.tsx", line: 2, column: 10 } }) as { ok: boolean; fields: { text: { value: string } } };
    expect(reply.ok).toBe(true);
    expect(reply.fields.text.value).toBe("Hi");
  });
  it("applies a tweak", async () => {
    const root = await project();
    const reply = await handle({ op: "apply", root, src: { file: "app/page.tsx", line: 2, column: 10 }, tweak: { field: "text", value: "Yo" } }) as { ok: boolean };
    expect(reply.ok).toBe(true);
  });
  it("rejects malformed requests without throwing", async () => {
    expect(await handle({ op: "delete-everything" })).toEqual({ ok: false, reason: "not-found" });
    expect(await handle(null)).toEqual({ ok: false, reason: "not-found" });
    expect(await handle({ op: "apply", root: "/tmp", src: { file: "a.tsx", line: 0, column: 1 }, tweak: { field: "text", value: "x" } })).toEqual({ ok: false, reason: "not-found" });
  });
  it("rejects a field that is not editable", async () => {
    const root = await project();
    expect(await handle({ op: "apply", root, src: { file: "app/page.tsx", line: 2, column: 10 }, tweak: { field: "position", value: "x" } })).toEqual({ ok: false, reason: "not-found" });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/cli.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement the command**

`src/cli.ts`:

```ts
import { FIELDS } from "@meld/screen-runtime/edit/types";
import { z } from "zod";
import { apply, inspect, restore } from "./edit-session";

const Source = z.object({
  file: z.string().min(1).max(300),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  fuzzy: z.boolean().optional(),
}).strict();

const Request = z.discriminatedUnion("op", [
  z.object({ op: z.literal("inspect"), root: z.string().min(1), src: Source }).strict(),
  z.object({
    op: z.literal("apply"), root: z.string().min(1), src: Source,
    tweak: z.object({ field: z.enum(FIELDS), value: z.string().max(2000), index: z.number().int().min(0).optional() }).strict(),
  }).strict(),
  z.object({
    op: z.literal("restore"), root: z.string().min(1),
    files: z.array(z.object({ path: z.string().min(1).max(300), expect: z.string(), contents: z.string() }).strict()).min(1).max(20),
  }).strict(),
]);

const REJECTED = { ok: false, reason: "not-found" } as const;

export async function handle(request: unknown): Promise<unknown> {
  const parsed = Request.safeParse(request);
  if (!parsed.success) return REJECTED;
  const { data } = parsed;
  try {
    if (data.op === "inspect") return await inspect(data.root, data.src);
    if (data.op === "apply") return await apply(data.root, data.src, data.tweak);
    return await restore(data.root, data.files);
  } catch {
    return REJECTED;
  }
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  let request: unknown = null;
  try { request = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* answered as rejected below */ }
  process.stdout.write(`${JSON.stringify(await handle(request))}\n`);
}

// Run only as the bundled helper, never when imported by a test.
if (process.argv[1]?.endsWith("edit-helper.mjs")) void main();
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Build config and resource wiring**

First add `"build": "tsup"` to the `scripts` of `packages/preview-edit/package.json` (it was left out of Task 1 so `pnpm build` never ran a build with no config). Then `tsup.config.ts`:

```ts
import { defineConfig } from "tsup";

const out = "../../apps/mac/Sources/Orion/Resources/PreviewEdit";

export default defineConfig([
  {
    entry: { "edit-helper": "src/cli.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: out,
    clean: false,
    splitting: false,
    minify: true,
    // The Mac's runtime has no node_modules: bundle everything.
    noExternal: [/.*/],
    outExtension: () => ({ js: ".mjs" }),
    banner: {
      js: [
        'import { createRequire as __meldCreateRequire } from "node:module";',
        "const require = __meldCreateRequire(import.meta.url);",
      ].join("\n"),
    },
  },
]);
```

(The overlay entry is added to this array in Task 5.) In `apps/mac/Package.swift` change `resources: [.copy("Resources/ProviderMarks")],` to:

```swift
            resources: [.copy("Resources/ProviderMarks"), .copy("Resources/PreviewEdit")],
```

In `.github/workflows/ci.yml`, after the `- run: pnpm build` line in the `validate` job add:

```yaml
      - name: The Mac app's bundled preview-edit files are up to date
        run: git diff --exit-code -- apps/mac/Sources/Orion/Resources/PreviewEdit
```

- [ ] **Step 6: Build and smoke-test the real bundle**

Run: `pnpm --filter @meld/preview-edit build`
Expected: `apps/mac/Sources/Orion/Resources/PreviewEdit/edit-helper.mjs` exists.

Then, with the Mac's own Node (the runtime the preview uses):

```bash
NODE="$HOME/Library/Application Support/Meld/runtime/current/bin/node"
echo '{"op":"inspect","root":"/tmp/does-not-exist","src":{"file":"a.tsx","line":1,"column":1}}' | "$NODE" apps/mac/Sources/Orion/Resources/PreviewEdit/edit-helper.mjs
```

Expected: `{"ok":false,"reason":"outside-root"}` (the root does not exist, so no path can resolve inside it). If the Mac runtime Node is older than 20 or missing, run it with the repo's Node 22 instead and note the runtime version in the task report.

- [ ] **Step 7: Commit**

```bash
git add packages/preview-edit apps/mac/Package.swift apps/mac/Sources/Orion/Resources/PreviewEdit .github/workflows/ci.yml
git commit -m "Bundle the preview edit helper into the Mac app"
```

---

### Task 5: Overlay script

**Files:**
- Create: `packages/preview-edit/src/overlay-core.ts`, `packages/preview-edit/src/overlay.ts`
- Test: `packages/preview-edit/src/overlay-core.test.ts`
- Modify: `packages/preview-edit/tsup.config.ts` (add the overlay build)
- Create (generated, committed): `apps/mac/Sources/Orion/Resources/PreviewEdit/overlay.js`

**Interfaces:**
- Consumes: `resolveAnySource` (Task 1B).
- Produces (from `overlay-core.ts`): `COMPUTED_KEYS`, `type Computed = Record<(typeof COMPUTED_KEYS)[number], string>`, `isPickable(el: Element): boolean`, `readComputed(el: Element, win: Window): Computed`, `describeElement(el: Element, win: Window): { tag: string; text: string; html: string; computed: Computed }`, `pathTo(el: Element, root: Element): number[]`, `elementAt(root: Element, path: readonly number[]): Element | null`.
- Produces (page API, `window.__orionPreviewEdit`): `setEnabled(on: boolean)`, `setSelectionInfo({ textEditable: boolean })`, `reselect()`.
- Messages posted to Swift via `window.webkit.messageHandlers.orionPreview.postMessage(object)`:
  - `{ "type": "picked", "src": { "file": string, "line": number, "column": number, "fuzzy"?: boolean } | null, "tag": string, "text": string, "html": string, "computed": Computed }`
  - `{ "type": "cleared" }`
  - `{ "type": "retyped", "text": string }`
  - `{ "type": "resized", "width": number, "height": number }` (integer CSS px; either may be omitted when unchanged)

- [ ] **Step 1: Write the failing test**

`overlay-core.test.ts` (first line `// @vitest-environment jsdom`):

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { COMPUTED_KEYS, describeElement, elementAt, isPickable, pathTo, readComputed } from "./overlay-core";

function page(html: string): Element {
  document.body.innerHTML = html;
  return document.body;
}

describe("isPickable", () => {
  it("accepts content elements and rejects the document shell, scripts and styles", () => {
    page("<main><h1>Hi</h1><script></script><style></style></main>");
    expect(isPickable(document.querySelector("h1")!)).toBe(true);
    expect(isPickable(document.body)).toBe(false);
    expect(isPickable(document.documentElement)).toBe(false);
    expect(isPickable(document.querySelector("script")!)).toBe(false);
    expect(isPickable(document.querySelector("style")!)).toBe(false);
  });
});

describe("readComputed", () => {
  it("returns every key as a short string", () => {
    page('<p style="color: rgb(1, 2, 3); font-size: 20px; padding: 4px 8px 4px 8px">x</p>');
    const computed = readComputed(document.querySelector("p")!, window);
    expect(Object.keys(computed).sort()).toEqual([...COMPUTED_KEYS].sort());
    expect(computed.color).toBe("rgb(1, 2, 3)");
    expect(computed.fontSize).toBe("20px");
    // The panel only accepts short values (the shorthand padding is cut to its first value).
    expect(computed.padding.length).toBeLessThanOrEqual(12);
    expect(computed.padding).toBe("4px");
  });
});

describe("describeElement", () => {
  it("returns tag, text, bounded html and computed styles", () => {
    page(`<p class="a">${"x".repeat(2000)}</p>`);
    const info = describeElement(document.querySelector("p")!, window);
    expect(info.tag).toBe("p");
    expect(info.text.length).toBeLessThanOrEqual(200);
    expect(info.html.length).toBeLessThanOrEqual(600);
    expect(info.html.startsWith('<p class="a">')).toBe(true);
  });
});

describe("pathTo / elementAt", () => {
  it("round trips through element indexes", () => {
    const root = page("<main><div></div><div><span></span><b id='t'></b></div></main>");
    const target = document.getElementById("t")!;
    const path = pathTo(target, root);
    expect(path).toEqual([0, 1, 1]);
    expect(elementAt(root, path)).toBe(target);
    expect(elementAt(root, [0, 9])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/overlay-core.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement the core**

`overlay-core.ts`:

```ts
export const COMPUTED_KEYS = [
  "fontFamily", "fontSize", "fontWeight", "color", "backgroundColor",
  "width", "height", "padding", "gap", "borderRadius", "display",
] as const;
export type Computed = Record<(typeof COMPUTED_KEYS)[number], string>;

// The web panel accepts these caps (computedSchema in live/live-messages.ts).
const CAPS: Record<(typeof COMPUTED_KEYS)[number], number> = {
  fontFamily: 120, fontSize: 12, fontWeight: 12, color: 40, backgroundColor: 40,
  width: 12, height: 12, padding: 12, gap: 12, borderRadius: 12, display: 20,
};
const SKIPPED = new Set(["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);

export function isPickable(el: Element): boolean {
  return el.nodeType === 1 && !SKIPPED.has(el.tagName);
}

// A shorthand such as "4px 8px 4px 8px" is shown as its first value.
const first = (value: string) => value.trim().split(/\s+/)[0] ?? "";

export function readComputed(el: Element, win: Window): Computed {
  const style = win.getComputedStyle(el);
  const raw: Record<(typeof COMPUTED_KEYS)[number], string> = {
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    color: style.color, backgroundColor: style.backgroundColor, width: style.width, height: style.height,
    padding: first(style.padding), gap: first(style.gap), borderRadius: first(style.borderRadius), display: style.display,
  };
  const out = {} as Computed;
  for (const key of COMPUTED_KEYS) out[key] = raw[key].slice(0, CAPS[key]);
  return out;
}

export function describeElement(el: Element, win: Window) {
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").trim().slice(0, 200),
    html: el.outerHTML.slice(0, 600),
    computed: readComputed(el, win),
  };
}

export function pathTo(el: Element, root: Element): number[] {
  const path: number[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
  }
  return path;
}

export function elementAt(root: Element, path: readonly number[]): Element | null {
  let node: Element | undefined = root;
  for (const index of path) {
    node = node?.children[index];
    if (!node) return null;
  }
  return node ?? null;
}
```

- [ ] **Step 3b: Run the core tests**

Run: `pnpm --filter @meld/preview-edit exec vitest run src/overlay-core.test.ts`
Expected: PASS.

- [ ] **Step 4: Implement the injected script**

`overlay.ts` (not unit-tested: it is a thin shell over the tested core and the Task 1 resolver; it is verified in Task 9's acceptance run):

```ts
import { resolveAnySource } from "./resolve-source";
import { describeElement, elementAt, isPickable, pathTo } from "./overlay-core";

// One colour for the outline and handles inside the third-party preview page, where Orion's tokens do not exist.
const HIGHLIGHT = "#4c8dff";
const HANDLE = 8;

type Native = { postMessage(message: unknown): void };
const native = (): Native | undefined =>
  (window as unknown as { webkit?: { messageHandlers?: { orionPreview?: Native } } }).webkit?.messageHandlers?.orionPreview;
const post = (message: unknown) => native()?.postMessage(message);

let enabled = false;
let textEditable = false;
let selected: Element | null = null;
let selectedPath: number[] = [];
let hovered: Element | null = null;

function box(id: string): HTMLDivElement {
  let element = document.getElementById(id) as HTMLDivElement | null;
  if (!element) {
    element = document.createElement("div");
    element.id = id;
    Object.assign(element.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483646", boxSizing: "border-box" });
    document.documentElement.appendChild(element);
  }
  return element;
}

function outline(id: string, target: Element | null, solid: boolean) {
  const element = box(id);
  if (!target || !enabled) { element.style.display = "none"; return; }
  const rect = target.getBoundingClientRect();
  Object.assign(element.style, {
    display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    border: `${solid ? 2 : 1}px ${solid ? "solid" : "dashed"} ${HIGHLIGHT}`,
  });
}

const handles: Record<"right" | "bottom" | "corner", HTMLDivElement> = {} as never;
function drawHandles() {
  const rect = selected && enabled ? selected.getBoundingClientRect() : null;
  for (const kind of ["right", "bottom", "corner"] as const) {
    const handle = (handles[kind] ??= (() => {
      const element = box(`orion-handle-${kind}`);
      Object.assign(element.style, { pointerEvents: "auto", background: HIGHLIGHT, width: `${HANDLE}px`, height: `${HANDLE}px`, cursor: kind === "right" ? "ew-resize" : kind === "bottom" ? "ns-resize" : "nwse-resize" });
      element.addEventListener("pointerdown", (event) => startResize(event, kind));
      return element;
    })());
    if (!rect) { handle.style.display = "none"; continue; }
    handle.style.display = "block";
    handle.style.left = `${kind === "bottom" ? rect.left + rect.width / 2 - HANDLE / 2 : rect.right - HANDLE / 2}px`;
    handle.style.top = `${kind === "right" ? rect.top + rect.height / 2 - HANDLE / 2 : rect.bottom - HANDLE / 2}px`;
  }
}

function startResize(event: PointerEvent, kind: "right" | "bottom" | "corner") {
  if (!selected) return;
  event.preventDefault();
  event.stopPropagation();
  const target = selected as HTMLElement;
  const start = target.getBoundingClientRect();
  const originalWidth = target.style.width;
  const originalHeight = target.style.height;
  let width = Math.round(start.width);
  let height = Math.round(start.height);
  const move = (next: PointerEvent) => {
    if (kind !== "bottom") { width = Math.max(8, Math.round(start.width + next.clientX - event.clientX)); target.style.width = `${width}px`; }
    if (kind !== "right") { height = Math.max(8, Math.round(start.height + next.clientY - event.clientY)); target.style.height = `${height}px`; }
    drawHandles(); outline("orion-selected", target, true);
  };
  const up = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    // The live drag was only a preview; the code edit (then hot reload) decides the final style.
    target.style.width = originalWidth; target.style.height = originalHeight;
    post({ type: "resized", ...(kind !== "bottom" ? { width } : {}), ...(kind !== "right" ? { height } : {}) });
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
}

async function pick(target: Element) {
  selected = target;
  selectedPath = pathTo(target, document.documentElement);
  outline("orion-selected", target, true);
  drawHandles();
  const src = await resolveAnySource(target);
  if (selected !== target) return;
  post({ type: "picked", src, ...describeElement(target, window) });
}

function clear() {
  selected = null; hovered = null; selectedPath = [];
  outline("orion-selected", null, true); outline("orion-hover", null, false); drawHandles();
  post({ type: "cleared" });
}

function underPointer(event: MouseEvent): Element | null {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  return target && isPickable(target) && !target.id?.startsWith("orion-") ? target : null;
}

document.addEventListener("pointermove", (event) => {
  if (!enabled) return;
  hovered = underPointer(event);
  outline("orion-hover", hovered && hovered !== selected ? hovered : null, false);
}, true);

document.addEventListener("click", (event) => {
  if (!enabled) return;
  const target = underPointer(event);
  if (!target) return;
  event.preventDefault(); event.stopPropagation();
  void pick(target);
}, true);

document.addEventListener("dblclick", (event) => {
  if (!enabled || !selected || !textEditable || underPointer(event) !== selected) return;
  event.preventDefault(); event.stopPropagation();
  const target = selected as HTMLElement;
  target.contentEditable = "plaintext-only";
  target.focus();
  const finish = (commit: boolean) => {
    target.removeEventListener("blur", onBlur); target.removeEventListener("keydown", onKey);
    target.removeAttribute("contenteditable");
    if (commit) post({ type: "retyped", text: target.textContent ?? "" });
  };
  const onBlur = () => finish(true);
  const onKey = (key: KeyboardEvent) => {
    if (key.key === "Enter") { key.preventDefault(); finish(true); } else if (key.key === "Escape") { finish(false); }
  };
  target.addEventListener("blur", onBlur); target.addEventListener("keydown", onKey);
}, true);

document.addEventListener("keydown", (event) => { if (enabled && event.key === "Escape" && selected) clear(); }, true);

// A hot reload replaces nodes: find the selection again by its position in the page and report fresh values.
new MutationObserver(() => {
  if (!enabled || !selectedPath.length) return;
  const again = elementAt(document.documentElement, selectedPath);
  if (again && again !== selected && isPickable(again)) void pick(again);
  else if (selected) { outline("orion-selected", selected, true); drawHandles(); }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("scroll", () => { drawHandles(); outline("orion-selected", selected, true); }, true);

(window as unknown as { __orionPreviewEdit: unknown }).__orionPreviewEdit = {
  setEnabled(on: boolean) { enabled = on; if (!on) clear(); },
  setSelectionInfo(info: { textEditable: boolean }) { textEditable = info.textEditable; },
  reselect() { if (selected) void pick(selected); },
};
```

- [ ] **Step 5: Add the overlay to the build and run the checks**

Append to the array in `tsup.config.ts`:

```ts
  {
    entry: { overlay: "src/overlay.ts" },
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    outDir: out,
    clean: false,
    minify: true,
    outExtension: () => ({ js: ".js" }),
  },
```

Run: `pnpm --filter @meld/preview-edit build && pnpm --filter @meld/preview-edit exec vitest run && pnpm --filter @meld/preview-edit lint && pnpm --filter @meld/preview-edit typecheck`
Expected: `overlay.js` and `edit-helper.mjs` exist under `apps/mac/Sources/Orion/Resources/PreviewEdit/`; all checks PASS.

- [ ] **Step 6: Real-page check on Daily Quest (no Mac app yet)**

Copy a Daily Quest worktree to a scratch folder as in the spike (`rsync` without `node_modules`/`.next`, symlink `node_modules`), start `next dev --port 3321`, then run this Playwright script from `/tmp` (the repo already has `playwright-core` under `node_modules/.pnpm`; use its path as in the spike):

```js
import { chromium } from "<repo>/node_modules/.pnpm/playwright-core@1.62.0/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";
const browser = await chromium.launch();
const page = await browser.newPage();
const posted = [];
await page.exposeFunction("__capture", (m) => posted.push(m));
await page.addInitScript(() => { window.webkit = { messageHandlers: { orionPreview: { postMessage: (m) => window.__capture(m) } } }; });
await page.goto("http://127.0.0.1:3321/", { waitUntil: "networkidle" });
await page.addScriptTag({ content: readFileSync("<repo>/apps/mac/Sources/Orion/Resources/PreviewEdit/overlay.js", "utf8") });
await page.evaluate(() => window.__orionPreviewEdit.setEnabled(true));
await page.click("p.tagline");
await page.waitForTimeout(500);
console.log(JSON.stringify(posted.find((m) => m.type === "picked"), null, 1));
await browser.close();
```

Expected: a `picked` message whose `src.file` is `app/page.tsx` and `src.line` is the line of the `<p className="tagline">` element, `tag` is `p`, and `computed.fontSize` is a short string. Kill the scratch server afterwards (`pkill -f "next dev --hostname 127.0.0.1 --port 3321"`).

- [ ] **Step 7: Commit**

```bash
git add packages/preview-edit apps/mac/Sources/Orion/Resources/PreviewEdit
git commit -m "Add the preview selection overlay"
```

---

### Task 6: Mac model — history, helper runner, editor

**Files:**
- Create: `apps/mac/Sources/Orion/Project/PreviewEditResources.swift`, `PreviewEditHistory.swift`, `PreviewEditHelper.swift`, `PreviewEditor.swift`
- Modify: `apps/mac/Sources/Orion/Project/BuildPreview.swift` (expose `nodeURL`, `worktree(for:)`, `isRunning(_:)`)
- Test: `apps/mac/Tests/OrionTests/PreviewEditHistoryTests.swift`, `PreviewEditorTests.swift`

**Interfaces:**
- Consumes: the helper protocol from Task 4; overlay messages from Task 5.
- Produces:
  - `struct PreviewEditChange: Codable, Equatable, Sendable { let path: String; let before: String; let after: String }`
  - `struct PreviewEditHistory { var canUndo: Bool; var canRedo: Bool; mutating func record(_ changes: [PreviewEditChange]); func nextUndo() -> [PreviewEditChange]?; func nextRedo() -> [PreviewEditChange]?; mutating func didUndo(); mutating func didRedo() }` (capped at 100 entries).
  - `protocol PreviewEditRunning: Sendable { func run(_ request: Data) async -> Data? }` and `struct PreviewEditHelper: PreviewEditRunning` (spawns `node edit-helper.mjs`, writes the request to stdin, returns stdout; `nil` after a 10-second timeout or a non-zero exit).
  - `@MainActor @Observable final class PreviewEditor` with: `private(set) var starID: String?` (the Star in edit mode), `private(set) var selection: Selection?`, `var isActive: Bool`, `func toggle(_ starID: String)`, `func receive(_ message: PreviewMessage)`, `func handle(_ request: PreviewRequest) async`, and `func snapshotJSON() -> String?`. Types `Selection` (Codable, the JSON the web panel receives) and `PreviewMessage` / `PreviewRequest` (Decodable) are defined in `PreviewEditor.swift` (see Step 4).

- [ ] **Step 1: Write the failing history test**

`PreviewEditHistoryTests.swift`:

```swift
import Testing
@testable import Orion

struct PreviewEditHistoryTests {
    private func change(_ before: String, _ after: String) -> [PreviewEditChange] {
        [PreviewEditChange(path: "app/page.tsx", before: before, after: after)]
    }

    @Test func undoAndRedoWalkTheRecordedEdits() {
        var history = PreviewEditHistory()
        history.record(change("a", "b"))
        history.record(change("b", "c"))
        #expect(history.canUndo && !history.canRedo)
        #expect(history.nextUndo() == change("b", "c"))
        history.didUndo()
        #expect(history.nextUndo() == change("a", "b"))
        #expect(history.nextRedo() == change("b", "c"))
        history.didRedo()
        #expect(history.nextRedo() == nil)
    }

    @Test func aNewEditClearsRedo() {
        var history = PreviewEditHistory()
        history.record(change("a", "b"))
        history.didUndo()
        #expect(history.canRedo)
        history.record(change("a", "z"))
        #expect(!history.canRedo)
    }

    @Test func keepsOnlyTheLatestHundred() {
        var history = PreviewEditHistory()
        for index in 0..<150 { history.record(change("\(index)", "\(index + 1)")) }
        var undone = 0
        while history.canUndo { history.didUndo(); undone += 1 }
        #expect(undone == 100)
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mac && swift test --filter PreviewEditHistoryTests`
Expected: FAIL (missing types).

- [ ] **Step 3: Implement history and resources**

`PreviewEditHistory.swift`:

```swift
import Foundation

struct PreviewEditChange: Codable, Equatable, Sendable {
    let path: String
    let before: String
    let after: String
}

/// Before/after contents of each edit, per Star. Separate from Git on purpose: a nudge is not a commit.
struct PreviewEditHistory {
    private static let limit = 100
    private var undoStack: [[PreviewEditChange]] = []
    private var redoStack: [[PreviewEditChange]] = []

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    mutating func record(_ changes: [PreviewEditChange]) {
        guard !changes.isEmpty else { return }
        undoStack.append(changes)
        if undoStack.count > Self.limit { undoStack.removeFirst(undoStack.count - Self.limit) }
        redoStack.removeAll()
    }

    func nextUndo() -> [PreviewEditChange]? { undoStack.last }
    func nextRedo() -> [PreviewEditChange]? { redoStack.last }

    mutating func didUndo() { if let changes = undoStack.popLast() { redoStack.append(changes) } }
    mutating func didRedo() { if let changes = redoStack.popLast() { undoStack.append(changes) } }
}
```

`PreviewEditResources.swift`:

```swift
import Foundation

enum PreviewEditResources {
    /// SwiftPM puts the resource bundle next to the executable in a dev build and in Contents/Resources in the app.
    static func url(_ name: String) -> URL? {
        let roots = [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap { $0 }
        for root in roots {
            guard let bundle = Bundle(url: root.appendingPathComponent("OrionMac_Orion.bundle")),
                  let url = bundle.url(forResource: name, withExtension: nil, subdirectory: "PreviewEdit") else { continue }
            return url
        }
        return nil
    }

    static var overlayScript: String? {
        url("overlay.js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }
}
```

- [ ] **Step 4: Run history tests; then write the editor tests**

Run: `swift test --filter PreviewEditHistoryTests` → PASS.

`PreviewEditorTests.swift` (the helper is faked, so no Node is needed):

```swift
import Foundation
import Testing
@testable import Orion

@MainActor
struct PreviewEditorTests {
    final class FakeHelper: PreviewEditRunning, @unchecked Sendable {
        var requests: [[String: Any]] = []
        var replies: [Data] = []
        func run(_ request: Data) async -> Data? {
            requests.append((try? JSONSerialization.jsonObject(with: request)) as? [String: Any] ?? [:])
            return replies.isEmpty ? nil : replies.removeFirst()
        }
    }

    private static let fieldsJSON = """
    {"text":{"editable":true,"value":"Hi"},"color":{"editable":true,"value":null},"backgroundColor":{"editable":true,"value":null},
     "fontSize":{"editable":true,"value":null},"fontWeight":{"editable":true,"value":null},"fontFamily":{"editable":true,"value":null},
     "padding":{"editable":true,"value":null},"gap":{"editable":true,"value":null},"borderRadius":{"editable":true,"value":null},
     "width":{"editable":true,"value":null},"height":{"editable":true,"value":null}}
    """

    private func reply(_ json: String) -> Data { Data(json.utf8) }

    private func editor(_ helper: FakeHelper, lock: String? = nil) -> PreviewEditor {
        PreviewEditor(helper: helper, root: { _ in URL(fileURLWithPath: "/tmp/worktree") },
                      lockReason: { _ in lock }, send: { _, _ in true })
    }

    private func picked(_ editor: PreviewEditor, helper: FakeHelper) async {
        helper.replies = [reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[]}")]
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(
            src: .init(file: "app/page.tsx", line: 4, column: 7), tag: "p", text: "Hi", html: "<p>Hi</p>", computed: [:])))
        await editor.settle()
    }

    @Test func aPickAsksTheHelperToInspectAndShowsTheFields() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        #expect(helper.requests.first?["op"] as? String == "inspect")
        #expect(helper.requests.first?["root"] as? String == "/tmp/worktree")
        #expect(editor.selection?.fields != nil)
        #expect(editor.selection?.reason == nil)
    }

    @Test func anUnresolvedElementShowsTheReasonAndNoFields() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: nil, tag: "h1", text: "Good", html: "<h1>Good</h1>", computed: [:])))
        await editor.settle()
        #expect(editor.selection?.fields == nil)
        #expect(editor.selection?.reason == "Orion can't find this element's code. Describe the change instead.")
    }

    @Test func aHelperRefusalOfComputedTextExplainsIt() async {
        let helper = FakeHelper()
        helper.replies = [reply("{\"ok\":false,\"reason\":\"not-found\"}")]
        let editor = editor(helper)
        editor.toggle("star-1")
        editor.receive(.picked(PreviewPick(src: .init(file: "app/page.tsx", line: 4, column: 7), tag: "p", text: "", html: "", computed: [:])))
        await editor.settle()
        #expect(editor.selection?.fields == nil)
        #expect(editor.selection?.reason != nil)
    }

    @Test func aTweakIsAppliedRecordedAndCanBeUndone() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        helper.replies = [reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"A\",\"after\":\"B\"}]}"),
                          reply("{\"ok\":true,\"changes\":[{\"path\":\"app/page.tsx\",\"before\":\"B\",\"after\":\"A\"}]}")]
        await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
        #expect(helper.requests.last?["op"] as? String == "apply")
        #expect(editor.selection?.canUndo == true)
        await editor.handle(.undo)
        let restore = helper.requests.last
        #expect(restore?["op"] as? String == "restore")
        let file = (restore?["files"] as? [[String: Any]])?.first
        #expect(file?["expect"] as? String == "B")
        #expect(file?["contents"] as? String == "A")
        #expect(editor.selection?.canUndo == false)
        #expect(editor.selection?.canRedo == true)
    }

    @Test func editsAreRefusedWhileTheBuildIsRunning() async {
        let helper = FakeHelper()
        let editor = editor(helper, lock: "This Star is still building.")
        await picked(editor, helper: helper)
        let before = helper.requests.count
        await editor.handle(.tweak(field: "color", value: "#ff0000", index: nil))
        #expect(helper.requests.count == before)
        #expect(editor.selection?.locked == "This Star is still building.")
    }
}
```

Run: `swift test --filter PreviewEditorTests` → FAIL (missing types).

- [ ] **Step 5: Implement the helper runner and expose the preview internals**

In `BuildPreview.swift`: change `private func worktree(for starID: String) -> URL?` to `func worktree(for starID: String) -> URL?`, and add:

```swift
    var nodeURL: URL { meldRoot.appending(path: "runtime/current/bin/node") }
```

(`meldRoot` is currently `private var`; change it to `fileprivate`/internal so the new property compiles. Use `child.executableURL = nodeURL` in `start` to avoid duplicating the path.)

`PreviewEditHelper.swift`:

```swift
import Foundation

protocol PreviewEditRunning: Sendable {
    func run(_ request: Data) async -> Data?
}

/// Runs the bundled edit helper with the same Node runtime the preview server uses.
struct PreviewEditHelper: PreviewEditRunning {
    let node: URL

    func run(_ request: Data) async -> Data? {
        guard let script = PreviewEditResources.url("edit-helper.mjs") else { return nil }
        return await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                let process = Process()
                process.executableURL = node
                process.arguments = [script.path]
                let input = Pipe(), output = Pipe()
                process.standardInput = input
                process.standardOutput = output
                process.standardError = FileHandle.nullDevice
                do { try process.run() } catch { continuation.resume(returning: nil); return }
                input.fileHandleForWriting.write(request)
                try? input.fileHandleForWriting.close()
                let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
                DispatchQueue.global().asyncAfter(deadline: .now() + 10, execute: timeout)
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                timeout.cancel()
                continuation.resume(returning: process.terminationStatus == 0 ? data : nil)
            }
        }
    }
}
```

- [ ] **Step 6: Implement the editor**

`PreviewEditor.swift`:

```swift
import Foundation
import Observation

struct PreviewSource: Codable, Equatable, Sendable { let file: String; let line: Int; let column: Int; var fuzzy: Bool? = nil }

struct PreviewPick: Decodable, Equatable {
    let src: PreviewSource?
    let tag: String
    let text: String
    let html: String
    let computed: [String: String]
}

enum PreviewMessage: Equatable {
    case picked(PreviewPick)
    case cleared
    case retyped(text: String)
    case resized(width: Int?, height: Int?)

    /// The overlay posts plain JSON objects ({"type": "picked", ...}).
    init?(body: Any) {
        guard let object = body as? [String: Any], let type = object["type"] as? String else { return nil }
        switch type {
        case "picked":
            guard let data = try? JSONSerialization.data(withJSONObject: object),
                  let pick = try? JSONDecoder().decode(PreviewPick.self, from: data) else { return nil }
            self = .picked(pick)
        case "cleared": self = .cleared
        case "retyped": self = .retyped(text: String((object["text"] as? String ?? "").prefix(2000)))
        case "resized":
            self = .resized(width: object["width"] as? Int, height: object["height"] as? Int)
        default: return nil
        }
    }
}

/// What the web panel sends back (read from window.__orionPreviewEdit.take()).
enum PreviewRequest: Equatable {
    case tweak(field: String, value: String, index: Int?)
    case undo
    case redo
    case describe(String)
    case close

    init?(json: [String: Any]) {
        switch json["kind"] as? String {
        case "tweak":
            guard let field = json["field"] as? String, let value = json["value"] as? String else { return nil }
            self = .tweak(field: field, value: value, index: json["index"] as? Int)
        case "undo": self = .undo
        case "redo": self = .redo
        case "describe":
            guard let text = json["text"] as? String else { return nil }
            self = .describe(text)
        case "close": self = .close
        default: return nil
        }
    }
}

@MainActor
@Observable
final class PreviewEditor {
    /// What the web panel renders. Encoded to JSON and pushed into the board.
    struct Selection: Encodable, Equatable {
        var starId: String
        var label: String
        var tag: String
        var html: String
        var fields: [String: FieldState]?
        var computed: [String: String]
        var reason: String?
        var locked: String?
        var canUndo: Bool
        var canRedo: Bool
        var pending: Bool
    }
    struct FieldState: Codable, Equatable { let editable: Bool; let value: String?; let runs: [String]? }

    private(set) var starID: String?
    private(set) var selection: Selection?
    var isActive: Bool { starID != nil }

    private let helper: any PreviewEditRunning
    private let root: (String) -> URL?
    private let lockReason: (String) -> String?
    private let send: (String, String) async -> Bool
    private var source: PreviewSource?
    private var pick: PreviewPick?
    private var histories: [String: PreviewEditHistory] = [:]
    private var inFlight: Task<Void, Never>?
    private var generation = 0

    init(helper: any PreviewEditRunning,
         root: @escaping (String) -> URL?,
         lockReason: @escaping (String) -> String?,
         send: @escaping (_ body: String, _ starID: String) async -> Bool) {
        self.helper = helper; self.root = root; self.lockReason = lockReason; self.send = send
    }

    func toggle(_ id: String) {
        if starID == id { stop() } else { starID = id; selection = nil; source = nil; pick = nil }
    }

    func stop() { starID = nil; selection = nil; source = nil; pick = nil; inFlight?.cancel() }

    func receive(_ message: PreviewMessage) {
        guard let starID else { return }
        switch message {
        case .cleared: selection = nil; source = nil; pick = nil
        case .picked(let next):
            generation += 1
            let mine = generation
            pick = next; source = next.src
            inFlight = Task { [weak self] in await self?.inspect(next, starID: starID, generation: mine) }
        case .retyped(let text):
            inFlight = Task { [weak self] in await self?.handle(.tweak(field: "text", value: text, index: nil)) }
        case .resized(let width, let height):
            inFlight = Task { [weak self] in
                if let width { await self?.handle(.tweak(field: "width", value: String(width), index: nil)) }
                if let height { await self?.handle(.tweak(field: "height", value: String(height), index: nil)) }
            }
        }
    }

    /// Lets tests (and the exchange loop) wait for the work a message started.
    func settle() async { await inFlight?.value }

    func handle(_ request: PreviewRequest) async {
        guard let starID else { return }
        switch request {
        case .close: stop()
        case .undo: await replay(undo: true, starID: starID)
        case .redo: await replay(undo: false, starID: starID)
        case .describe(let text): await describe(text, starID: starID)
        case .tweak(let field, let value, let index): await tweak(field: field, value: value, index: index, starID: starID)
        }
    }

    func snapshotJSON() -> String? {
        guard let selection, let data = try? JSONEncoder().encode(selection) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: Helper calls

    private func call(_ object: [String: Any]) async -> [String: Any]? {
        guard let request = try? JSONSerialization.data(withJSONObject: object),
              let data = await helper.run(request) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func srcJSON(_ source: PreviewSource) -> [String: Any] {
        var json: [String: Any] = ["file": source.file, "line": source.line, "column": source.column]
        if let fuzzy = source.fuzzy { json["fuzzy"] = fuzzy }
        return json
    }

    private func fields(from reply: [String: Any]) -> [String: FieldState]? {
        guard let object = reply["fields"],
              let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? JSONDecoder().decode([String: FieldState].self, from: data)
    }

    private func reasonText(_ reply: [String: Any]?) -> String {
        switch reply?["reason"] as? String {
        case "conflict": "The file changed since. Pick the element again."
        case "too-large": "This file is too large to edit directly. Describe the change instead."
        case "not-literal": "This value comes from code, so Orion can't change it directly. Describe the change instead."
        default: "Orion can't find this element's code. Describe the change instead."
        }
    }

    private func publish(fields: [String: FieldState]?, reason: String?, starID: String, pending: Bool = false) {
        guard let pick else { return }
        let history = histories[starID] ?? PreviewEditHistory()
        selection = Selection(starId: starID, label: pick.tag, tag: pick.tag, html: pick.html, fields: fields,
                              computed: pick.computed, reason: reason, locked: lockReason(starID),
                              canUndo: history.canUndo, canRedo: history.canRedo, pending: pending)
    }

    private func inspect(_ pick: PreviewPick, starID: String, generation: Int) async {
        guard let src = pick.src else {
            publish(fields: nil, reason: reasonText(nil), starID: starID); return
        }
        guard let root = root(starID) else {
            publish(fields: nil, reason: reasonText(nil), starID: starID); return
        }
        let reply = await call(["op": "inspect", "root": root.path, "src": srcJSON(src)])
        guard generation == self.generation else { return }
        if reply?["ok"] as? Bool == true, let fields = fields(from: reply!) {
            publish(fields: fields, reason: nil, starID: starID)
        } else {
            publish(fields: nil, reason: reasonText(reply), starID: starID)
        }
    }

    private func tweak(field: String, value: String, index: Int?, starID: String) async {
        if lockReason(starID) != nil { publish(fields: selection?.fields, reason: selection?.reason, starID: starID); return }
        guard let src = source, let root = root(starID) else { return }
        publish(fields: selection?.fields, reason: nil, starID: starID, pending: true)
        var tweak: [String: Any] = ["field": field, "value": value]
        if let index { tweak["index"] = index }
        let reply = await call(["op": "apply", "root": root.path, "src": srcJSON(src), "tweak": tweak])
        guard reply?["ok"] as? Bool == true, let fields = fields(from: reply!) else {
            publish(fields: selection?.fields, reason: reasonText(reply), starID: starID); return
        }
        if let raw = reply?["changes"], let data = try? JSONSerialization.data(withJSONObject: raw),
           let changes = try? JSONDecoder().decode([PreviewEditChange].self, from: data) {
            histories[starID, default: PreviewEditHistory()].record(changes)
        }
        publish(fields: fields, reason: nil, starID: starID)
    }

    private func replay(undo: Bool, starID: String) async {
        if lockReason(starID) != nil { return }
        guard let root = root(starID) else { return }
        var history = histories[starID] ?? PreviewEditHistory()
        guard let changes = undo ? history.nextUndo() : history.nextRedo() else { return }
        let files = changes.map { change in
            ["path": change.path, "expect": undo ? change.after : change.before, "contents": undo ? change.before : change.after]
        }
        let reply = await call(["op": "restore", "root": root.path, "files": files])
        guard reply?["ok"] as? Bool == true else {
            publish(fields: selection?.fields, reason: reasonText(reply), starID: starID); return
        }
        if undo { history.didUndo() } else { history.didRedo() }
        histories[starID] = history
        publish(fields: selection?.fields, reason: nil, starID: starID)
    }

    private func describe(_ text: String, starID: String) async {
        let request = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty, let pick else { return }
        var lines = ["Change this element in the app:"]
        if let src = source { lines.append("Code: \(src.file):\(src.line)") }
        lines.append("Element: \(pick.html)")
        let styles = pick.computed.sorted { $0.key < $1.key }.map { "\($0.key) \($0.value)" }.joined(separator: ", ")
        if !styles.isEmpty { lines.append("Styles: \(styles)") }
        lines.append("Request: \(request)")
        _ = await send(String(lines.joined(separator: "\n").prefix(10_000)), starID)
    }
}
```

- [ ] **Step 7: Run the Mac tests**

Run: `cd apps/mac && swift test --filter "PreviewEdit"`
Expected: PASS. (The test for the unresolved element expects exactly the sentence `Orion can't find this element's code. Describe the change instead.`; the helper-refusal test only requires a non-nil reason.)

- [ ] **Step 8: Commit**

```bash
git add apps/mac
git commit -m "Add the Mac preview editor model"
```

---

### Task 6B: Preview launcher for any web project

**Files:**
- Create: `apps/mac/Sources/Orion/Project/PreviewLaunchPlan.swift`
- Test: `apps/mac/Tests/OrionTests/PreviewLaunchPlanTests.swift`
- Modify: `apps/mac/Sources/Orion/Project/BuildPreview.swift` (`canPreview`, `start`, `stop`, failure text)

**Interfaces:**
- Produces:
  - `struct PreviewLaunchFiles { let read: (String) -> Data?; let exists: (String) -> Bool }` (paths relative to the worktree)
  - `struct PreviewLaunchPlan: Equatable { enum Kind: Equatable { case node(entry: String); case npmScript(String) }; let kind: Kind; let arguments: [String]; let environment: [String: String] }`
  - `enum PreviewLaunchError: Error, Equatable { case notAWebProject, dependenciesMissing, noDevScript }`
  - `enum PreviewLauncher { static func plan(packageJSON: Data, port: UInt16, files: PreviewLaunchFiles) throws(PreviewLaunchError) -> PreviewLaunchPlan }`

- [ ] **Step 1: Write the failing test**

`PreviewLaunchPlanTests.swift`:

```swift
import Foundation
import Testing
@testable import Orion

struct PreviewLaunchPlanTests {
    private func files(_ present: [String: String]) -> PreviewLaunchFiles {
        PreviewLaunchFiles(
            read: { present[$0].map { Data($0.utf8) } },
            exists: { path in present.keys.contains { $0 == path || $0.hasPrefix(path + "/") } })
    }
    private func manifest(_ json: String) -> Data { Data(json.utf8) }

    @Test func nextRunsItsOwnBinaryOnLoopback() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"next":"15.5.0"}}"#), port: 4100,
            files: files(["node_modules/next/package.json": #"{"bin":{"next":"./dist/bin/next"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/next/dist/bin/next"))
        #expect(plan.arguments == ["dev", "--hostname", "127.0.0.1", "--port", "4100"])
    }

    @Test func viteRunsItsBinaryWithAStrictPort() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"devDependencies":{"vite":"8.3.6","react":"19"}}"#), port: 5200,
            files: files(["node_modules/vite/package.json": #"{"bin":{"vite":"bin/vite.js"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/vite/bin/vite.js"))
        #expect(plan.arguments == ["--host", "127.0.0.1", "--port", "5200", "--strictPort"])
    }

    @Test func aStringBinFieldWorks() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"devDependencies":{"vite":"8"}}"#), port: 1,
            files: files(["node_modules/vite/package.json": #"{"bin":"./cli.js"}"#]))
        #expect(plan.kind == .node(entry: "node_modules/vite/cli.js"))
    }

    @Test func createReactAppIsConfiguredThroughEnvironment() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"react-scripts":"5.0.1"}}"#), port: 3300,
            files: files(["node_modules/react-scripts/package.json": #"{"bin":{"react-scripts":"./bin/react-scripts.js"}}"#]))
        #expect(plan.arguments == ["start"])
        #expect(plan.environment == ["PORT": "3300", "HOST": "127.0.0.1", "BROWSER": "none"])
    }

    @Test func nextWinsOverViteWhenBothArePresent() throws {
        let plan = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"dependencies":{"next":"15","vite":"8"}}"#), port: 1,
            files: files(["node_modules/next/package.json": #"{"bin":{"next":"dist/bin/next"}}"#,
                          "node_modules/vite/package.json": #"{"bin":{"vite":"bin/vite.js"}}"#]))
        #expect(plan.kind == .node(entry: "node_modules/next/dist/bin/next"))
    }

    @Test func anUnknownProjectRunsItsDevScriptThenItsStartScript() throws {
        let installed = files(["node_modules/.package-lock.json": "{}"])
        let dev = try PreviewLauncher.plan(
            packageJSON: manifest(#"{"scripts":{"start":"node a","dev":"node b"}}"#), port: 3400, files: installed)
        #expect(dev.kind == .npmScript("dev"))
        #expect(dev.environment["PORT"] == "3400")
        let start = try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"start":"node a"}}"#), port: 1, files: installed)
        #expect(start.kind == .npmScript("start"))
    }

    @Test func missingDependenciesAreReportedNotLaunched() {
        #expect(throws: PreviewLaunchError.dependenciesMissing) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"dependencies":{"vite":"8"}}"#), port: 1, files: files([:]))
        }
        #expect(throws: PreviewLaunchError.dependenciesMissing) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"dev":"x"}}"#), port: 1, files: files([:]))
        }
    }

    @Test func aProjectWithNothingToRunIsNotPreviewable() {
        let installed = files(["node_modules/.package-lock.json": "{}"])
        #expect(throws: PreviewLaunchError.noDevScript) {
            try PreviewLauncher.plan(packageJSON: manifest(#"{"scripts":{"build":"x"}}"#), port: 1, files: installed)
        }
        #expect(throws: PreviewLaunchError.notAWebProject) {
            try PreviewLauncher.plan(packageJSON: manifest("not json"), port: 1, files: installed)
        }
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mac && swift test --filter PreviewLaunchPlanTests`
Expected: FAIL (missing types).

- [ ] **Step 3: Implement the planner**

`PreviewLaunchPlan.swift`:

```swift
import Foundation

struct PreviewLaunchFiles {
    let read: (String) -> Data?
    let exists: (String) -> Bool
}

struct PreviewLaunchPlan: Equatable {
    enum Kind: Equatable {
        case node(entry: String)
        case npmScript(String)
    }
    let kind: Kind
    let arguments: [String]
    let environment: [String: String]
}

enum PreviewLaunchError: Error, Equatable {
    case notAWebProject
    case dependenciesMissing
    case noDevScript
}

/// Chooses how to start a project's own dev server on a loopback port Orion reserved.
/// Known tools run their installed binary directly with Orion's Node; anything else runs the
/// project's `dev` (then `start`) script through npm with PORT set.
enum PreviewLauncher {
    private struct Known {
        let package: String
        let bin: String
        let arguments: (UInt16) -> [String]
        let environment: (UInt16) -> [String: String]
    }

    private static func loopback(_ command: [String]) -> (UInt16) -> [String] {
        { port in command + ["--host", "127.0.0.1", "--port", String(port)] }
    }

    // Order matters: frameworks built on Vite also list `vite`, so Vite is last.
    private static let known: [Known] = [
        Known(package: "next", bin: "next",
              arguments: { ["dev", "--hostname", "127.0.0.1", "--port", String($0)] }, environment: { _ in [:] }),
        Known(package: "react-scripts", bin: "react-scripts",
              arguments: { _ in ["start"] },
              environment: { ["PORT": String($0), "HOST": "127.0.0.1", "BROWSER": "none"] }),
        Known(package: "astro", bin: "astro", arguments: loopback(["dev"]), environment: { _ in [:] }),
        Known(package: "nuxt", bin: "nuxt", arguments: loopback(["dev"]), environment: { _ in [:] }),
        Known(package: "@angular/cli", bin: "ng", arguments: loopback(["serve"]), environment: { _ in [:] }),
        Known(package: "vite", bin: "vite",
              arguments: { ["--host", "127.0.0.1", "--port", String($0), "--strictPort"] }, environment: { _ in [:] }),
    ]

    static func plan(packageJSON: Data, port: UInt16, files: PreviewLaunchFiles) throws(PreviewLaunchError) -> PreviewLaunchPlan {
        guard let manifest = (try? JSONSerialization.jsonObject(with: packageJSON)) as? [String: Any] else {
            throw .notAWebProject
        }
        let dependencies = Set((manifest["dependencies"] as? [String: Any] ?? [:]).keys)
            .union((manifest["devDependencies"] as? [String: Any] ?? [:]).keys)
        for tool in known where dependencies.contains(tool.package) {
            guard let entry = binEntry(of: tool.package, named: tool.bin, files: files) else { throw .dependenciesMissing }
            return PreviewLaunchPlan(kind: .node(entry: entry), arguments: tool.arguments(port), environment: tool.environment(port))
        }
        let scripts = manifest["scripts"] as? [String: Any] ?? [:]
        guard let script = ["dev", "start"].first(where: { scripts[$0] is String }) else { throw .noDevScript }
        guard files.exists("node_modules") else { throw .dependenciesMissing }
        return PreviewLaunchPlan(kind: .npmScript(script), arguments: [],
                                 environment: ["PORT": String(port), "HOST": "127.0.0.1", "BROWSER": "none"])
    }

    /// The installed package's own `bin` entry, relative to the worktree (nil when it is not installed).
    private static func binEntry(of package: String, named bin: String, files: PreviewLaunchFiles) -> String? {
        guard let data = files.read("node_modules/\(package)/package.json"),
              let manifest = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return nil }
        let relative: String?
        if let single = manifest["bin"] as? String {
            relative = single
        } else if let table = manifest["bin"] as? [String: String] {
            relative = table[bin] ?? table.values.first
        } else {
            relative = nil
        }
        guard var path = relative, !path.contains("..") else { return nil }
        if path.hasPrefix("./") { path.removeFirst(2) }
        return "node_modules/\(package)/\(path)"
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `swift test --filter PreviewLaunchPlanTests`
Expected: PASS.

- [ ] **Step 5: Use the plan in `BuildPreview`**

In `BuildPreview.swift` replace `canPreview` and the process setup in `start`:

```swift
    private func launchPlan(for starID: String, port: UInt16) -> Result<PreviewLaunchPlan, PreviewLaunchError> {
        guard let folder = worktree(for: starID),
              let manifest = try? Data(contentsOf: folder.appending(path: "package.json")) else { return .failure(.notAWebProject) }
        let files = PreviewLaunchFiles(
            read: { try? Data(contentsOf: folder.appending(path: $0)) },
            exists: { FileManager.default.fileExists(atPath: folder.appending(path: $0).path) })
        do { return .success(try PreviewLauncher.plan(packageJSON: manifest, port: port, files: files)) }
        catch let error as PreviewLaunchError { return .failure(error) }
        catch { return .failure(.notAWebProject) }
    }

    func canPreview(_ starID: String) -> Bool {
        if case .success = launchPlan(for: starID, port: 3000) { return true }
        return false
    }

    private func message(for error: PreviewLaunchError) -> String {
        switch error {
        case .dependenciesMissing: String(localized: "Install this project's dependencies in the build worktree first.")
        case .noDevScript: String(localized: "This project has no dev or start script to preview.")
        case .notAWebProject: String(localized: "This project can't be previewed.")
        }
    }
```

In `start(_:)`, after the port is reserved, replace the Next-specific `Process` setup:

```swift
        let plan: PreviewLaunchPlan
        switch launchPlan(for: id, port: port) {
        case .success(let value): plan = value
        case .failure(let error): failure = (id, message(for: error)); return nil
        }
        let runtime = nodeURL.deletingLastPathComponent()
        let child = Process()
        switch plan.kind {
        case .node(let entry):
            child.executableURL = nodeURL
            child.arguments = [entry] + plan.arguments
        case .npmScript(let name):
            child.executableURL = runtime.appending(path: "npm")
            child.arguments = ["run", name]
        }
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = runtime.path + ":" + (environment["PATH"] ?? "/usr/bin:/bin")
        for (key, value) in plan.environment { environment[key] = value }
        child.environment = environment
        child.currentDirectoryURL = folder
```

(keep the existing `standardInput/Output/Error`, `terminationHandler`, readiness polling and `failure = (id, "The preview server could not start.")` code unchanged; delete the old `guard let folder = worktree(for: id), canPreview(id)` block and the old `child.executableURL`/`arguments` lines; keep `folder` from `worktree(for: id)`). Replace the old reserved-port guard's failure text only if it conflicts; its wording stays.

An `npm run` child starts its own children, so `terminate()` on the parent would leave the dev server running. In `stop()` and in the failure path, before `server.process.terminate()` add:

```swift
    private func terminateTree(_ process: Process) {
        guard process.isRunning else { return }
        let pkill = Process()
        pkill.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
        pkill.arguments = ["-TERM", "-P", String(process.processIdentifier)]
        try? pkill.run()
        pkill.waitUntilExit()
        process.terminate()
    }
```

and call `terminateTree(server.process)` / `terminateTree(child)` instead of the bare `terminate()` calls.

- [ ] **Step 6: Build and run the Mac tests**

Run: `cd apps/mac && swift build 2>&1 | tail -10 && swift test 2>&1 | tail -10`
Expected: Build complete; PASS. Then confirm the existing Daily Quest Star still previews (Task 9 covers the real run).

- [ ] **Step 7: Commit**

```bash
git add apps/mac
git commit -m "Start any web project's dev server for the Canvas preview"
```

---

### Task 7: Mac wiring — injection, pencil toggle, exchange with the board

**Files:**
- Modify: `apps/mac/Sources/Orion/Project/CanvasLivePreview.swift`, `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `apps/mac/Sources/Orion/Frame/FrameModel.swift`
- Test: `apps/mac/Tests/OrionTests/PreviewEditorTests.swift` (add exchange tests)

**Interfaces:**
- Consumes: `PreviewEditor` (Task 6), `PreviewEditResources.overlayScript`, `FrameModel.sendStream`, `BuildPreview`.
- Produces: `FrameModel.previewEditor`, a pencil button in the live preview header, and the board contract `window.__orionPreviewEdit = { setSelection(json: string | null), take(): object[] }` (implemented in Task 8) that Mac calls every 60 ms from the existing preview loop.

- [ ] **Step 1: Write the failing exchange test**

Add to `PreviewEditorTests.swift`:

```swift
    @Test func exchangePushesTheSelectionAndAppliesRequestsFromTheBoard() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        var calls: [String] = []
        helper.replies = [reply("{\"ok\":true,\"fields\":\(Self.fieldsJSON),\"changes\":[{\"path\":\"a.tsx\",\"before\":\"A\",\"after\":\"B\"}]}")]
        await editor.exchange { script, arguments in
            calls.append(script)
            if script.contains("take()") { return [["kind": "tweak", "field": "color", "value": "#ff0000"]] }
            return nil
        }
        #expect(calls.contains { $0.contains("setSelection") })
        #expect(helper.requests.last?["op"] as? String == "apply")
    }

    @Test func exchangeDoesNotPushAnUnchangedSelectionTwice() async {
        let helper = FakeHelper()
        let editor = editor(helper)
        await picked(editor, helper: helper)
        var pushes = 0
        for _ in 0..<3 {
            await editor.exchange { script, _ in
                if script.contains("setSelection") { pushes += 1 }
                return script.contains("take()") ? [] : nil
            }
        }
        #expect(pushes == 1)
    }
```

Run: `swift test --filter PreviewEditorTests` → FAIL (`exchange` missing).

- [ ] **Step 2: Implement `exchange` in `PreviewEditor`**

Add to `PreviewEditor.swift`:

```swift
    private var lastPushed: String??

    /// One round with the board: push the selection if it changed, then run what the panel asked for.
    /// `evaluate` runs JavaScript in the board page (ProjectScreen passes webView.callAsyncJavaScript).
    func exchange(_ evaluate: (_ script: String, _ arguments: [String: Any]) async -> Any?) async {
        let json = snapshotJSON()
        if lastPushed == nil || lastPushed! != json {
            lastPushed = .some(json)
            _ = await evaluate("window.__orionPreviewEdit?.setSelection(json)", ["json": json.map { $0 as Any } ?? NSNull()])
        }
        guard let requests = await evaluate("return window.__orionPreviewEdit?.take() ?? []", [:]) as? [[String: Any]] else { return }
        for object in requests {
            if let request = PreviewRequest(json: object) { await handle(request) }
        }
    }
```

Run: `swift test --filter PreviewEditorTests` → PASS.

- [ ] **Step 3: Inject the overlay and receive its messages**

Replace `CanvasLivePreview.swift` with:

```swift
import SwiftUI
import WebKit

/// A separate, local browser surface. The hosted Canvas and its native bridge
/// stay mounted behind it, with their own session and navigation.
struct CanvasLivePreview: NSViewRepresentable {
    let url: URL
    let editing: Bool
    let textEditable: Bool
    let onMessage: @MainActor (PreviewMessage) -> Void

    func makeCoordinator() -> Navigation { Navigation(origin: url, onMessage: onMessage) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        if let script = PreviewEditResources.overlayScript {
            configuration.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        configuration.userContentController.add(context.coordinator, name: "orionPreview")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.load(URLRequest(url: url))
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
        view.evaluateJavaScript("window.__orionPreviewEdit?.setEnabled(\(editing ? "true" : "false"))")
        view.evaluateJavaScript("window.__orionPreviewEdit?.setSelectionInfo({textEditable: \(textEditable ? "true" : "false")})")
    }

    static func dismantleNSView(_ view: WKWebView, coordinator: Navigation) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "orionPreview")
    }

    @MainActor
    final class Navigation: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let origin: URL
        var onMessage: @MainActor (PreviewMessage) -> Void

        init(origin: URL, onMessage: @escaping @MainActor (PreviewMessage) -> Void) {
            self.origin = origin
            self.onMessage = onMessage
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            // Only the preview's own page may talk to the editor.
            let page = message.frameInfo.securityOrigin
            guard message.frameInfo.isMainFrame, page.host == origin.host, page.port == origin.port,
                  let decoded = PreviewMessage(body: message.body) else { return }
            onMessage(decoded)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let destination = navigationAction.request.url,
                  destination.scheme == origin.scheme,
                  destination.host == origin.host,
                  destination.port == origin.port else { return .cancel }
            return .allow
        }
    }
}
```

(The coordinator keeps a strong reference from the content controller until `dismantleNSView` removes it; `Navigation` does not reference the web view.)

- [ ] **Step 4: Own the editor in `FrameModel`**

In `FrameModel.swift`, next to `let buildPreview = BuildPreview()`:

```swift
    @ObservationIgnored private(set) lazy var previewEditor = PreviewEditor(
        helper: PreviewEditHelper(node: buildPreview.nodeURL),
        root: { [weak self] starID in self?.buildPreview.worktree(for: starID) },
        lockReason: { [weak self] starID in self?.previewEditLockReason(starID) },
        send: { [weak self] body, starID in
            guard let self else { return false }
            let choice = self.agentChoice()
            return await self.sendStream(body, provider: choice.provider, model: choice.model, starTaskID: starID, build: true)
        })

    /// Edits are off while the agent is working in the same worktree, and when the preview is down.
    func previewEditLockReason(_ starID: String) -> String? {
        if let status = visibleStream?.stars.first(where: { $0.id == starID })?.build?.status,
           status == .working || status == .needsYou {
            return String(localized: "This Star is still building. Edit once it finishes.")
        }
        return buildPreview.runningURL(for: starID) == nil ? String(localized: "The preview isn't running.") : nil
    }
```

`agentChoice()` is the existing function that returns `(provider, model)` at `FrameModel.swift:335-337` (it begins `let selected = modelByProject[...]`); if its real name differs, use that function's name. Also call `previewEditor.stop()` in `pageDidLeaveFrame()` next to `buildPreview.stop()`, and when the Star's preview disappears (`canvasPreviews` no longer contains `previewEditor.starID`) — do that inside `ProjectScreen`'s tracking loop (Step 5). If `StreamBuild.Status` case names differ (`needsYou` vs `needs_you`), use the enum's actual cases.

- [ ] **Step 5: Pencil toggle and the exchange loop in `ProjectScreen`**

In `livePreview(_:)`: pass the new parameters and add the pencil next to the globe button:

```swift
                Button {
                    frame.previewEditor.toggle(preview.id)
                } label: {
                    Label("Edit", systemImage: "pencil")
                        .labelStyle(.iconOnly)
                        .padding(OrionSpacing.xs)
                }
                .buttonStyle(.plain)
                .help("Edit this page")
                .foregroundStyle(frame.previewEditor.starID == preview.id
                                 ? OrionColor.dayBreakBlue.color : .secondary)
                // (placed before the globe Button, inside the same HStack)
...
            CanvasLivePreview(
                url: preview.url,
                editing: frame.previewEditor.starID == preview.id,
                textEditable: frame.previewEditor.selection?.fields?["text"]?.editable == true
            ) { message in
                frame.previewEditor.receive(message)
            }
```

In `trackPreviewFrames()`, at the end of each loop iteration (before the `Task.sleep`), add:

```swift
            if frame.previewEditor.isActive {
                if let editing = frame.previewEditor.starID, !previews.contains(where: { $0.id == editing }) {
                    frame.previewEditor.stop()
                }
                await frame.previewEditor.exchange { script, arguments in
                    try? await webView.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page)
                }
            }
```

and include `frame.previewEditor.starID ?? ""` in `previewTrackingKey` so the loop restarts when edit mode toggles.

- [ ] **Step 6: Build and test**

Run: `cd apps/mac && swift build 2>&1 | tail -20 && swift test 2>&1 | tail -15`
Expected: Build complete; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mac
git commit -m "Wire the preview overlay and editor into the Canvas"
```

---

### Task 8: Web — store, panel and board mount

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/preview-edit/preview-edit-store.ts`, `preview-edit-store.test.ts`, `preview-edit-panel.tsx`, `preview-edit-panel.test.tsx`
- Modify: `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`

**Interfaces:**
- Produces:
  - `type PreviewSelection = { starId: string; label: string; tag: string; html: string; fields: NonNullable<Inspection> | null; computed: Computed; reason: string | null; locked: string | null; canUndo: boolean; canRedo: boolean; pending: boolean }` (`Computed` from `../live/live-messages`)
  - `type PreviewRequest = { kind: "tweak"; field: Field; value: string; index?: number } | { kind: "undo" } | { kind: "redo" } | { kind: "describe"; text: string } | { kind: "close" }`
  - `previewEditStore: { get(): PreviewSelection | null; subscribe(listener: () => void): () => void; setFromJson(json: string | null): void; enqueue(request: PreviewRequest): void; take(): PreviewRequest[] }`
  - `installPreviewEditBridge(win: Window): () => void` — defines `win.__orionPreviewEdit = { setSelection(json), take() }` and returns an uninstall function.
  - `<PreviewEditPanel selection onRequest />` and the mounting hook `usePreviewSelection()`.

- [ ] **Step 1: Write the failing store test**

`preview-edit-store.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { computedSchema } from "../live/live-messages";
import { installPreviewEditBridge, previewEditStore } from "./preview-edit-store";

const SELECTION = {
  starId: "s1", label: "p", tag: "p", html: "<p>Hi</p>", fields: null,
  computed: { fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "rgb(0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", width: "100px", height: "20px", padding: "4px", gap: "normal", borderRadius: "0px", display: "block" },
  reason: "Orion can't find this element's code. Describe the change instead.",
  locked: null, canUndo: false, canRedo: false, pending: false,
};

afterEach(() => previewEditStore.setFromJson(null));

describe("previewEditStore", () => {
  it("holds the selection pushed as JSON and notifies listeners", () => {
    const listener = vi.fn();
    const stop = previewEditStore.subscribe(listener);
    previewEditStore.setFromJson(JSON.stringify(SELECTION));
    expect(previewEditStore.get()?.tag).toBe("p");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });
  it("accepts the computed values the Mac overlay sends", () => {
    expect(computedSchema.safeParse(SELECTION.computed).success).toBe(true);
  });
  it("ignores malformed or oversized selections", () => {
    previewEditStore.setFromJson("{not json");
    expect(previewEditStore.get()).toBeNull();
    previewEditStore.setFromJson(JSON.stringify({ ...SELECTION, html: "x".repeat(5000) }));
    expect(previewEditStore.get()).toBeNull();
  });
  it("queues requests and hands them over once", () => {
    previewEditStore.enqueue({ kind: "undo" });
    previewEditStore.enqueue({ kind: "tweak", field: "color", value: "#ff0000" });
    expect(previewEditStore.take()).toEqual([{ kind: "undo" }, { kind: "tweak", field: "color", value: "#ff0000" }]);
    expect(previewEditStore.take()).toEqual([]);
  });
});

describe("installPreviewEditBridge", () => {
  it("exposes setSelection and take on the window for the Mac app", () => {
    const win = {} as Window & { __orionPreviewEdit?: { setSelection(json: string | null): void; take(): unknown[] } };
    const uninstall = installPreviewEditBridge(win);
    win.__orionPreviewEdit!.setSelection(JSON.stringify(SELECTION));
    expect(previewEditStore.get()?.starId).toBe("s1");
    previewEditStore.enqueue({ kind: "close" });
    expect(win.__orionPreviewEdit!.take()).toEqual([{ kind: "close" }]);
    uninstall();
    expect(win.__orionPreviewEdit).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/preview-edit/preview-edit-store.test.ts`
Expected: FAIL (missing module).

- [ ] **Step 3: Implement the store**

`preview-edit-store.ts`:

```ts
import { z } from "zod";
import { FIELDS, type Field, type Inspection } from "@meld/screen-runtime/edit/types";
import { computedSchema } from "../live/live-messages";

const FieldState = z.object({ editable: z.boolean(), value: z.string().max(2000).nullable(), runs: z.array(z.string().max(2000)).max(8).nullish() });
const SelectionSchema = z.object({
  starId: z.string().max(80),
  label: z.string().max(60),
  tag: z.string().max(40),
  html: z.string().max(600),
  fields: z.record(z.enum(FIELDS), FieldState).nullable(),
  computed: computedSchema,
  reason: z.string().max(300).nullable(),
  locked: z.string().max(300).nullable(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  pending: z.boolean(),
}).strict();

export type PreviewSelection = Omit<z.infer<typeof SelectionSchema>, "fields"> & { fields: NonNullable<Inspection> | null };
export type PreviewRequest =
  | { kind: "tweak"; field: Field; value: string; index?: number }
  | { kind: "undo" } | { kind: "redo" } | { kind: "close" }
  | { kind: "describe"; text: string };

let current: PreviewSelection | null = null;
let queue: PreviewRequest[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export const previewEditStore = {
  get: () => current,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  setFromJson(json: string | null) {
    let next: PreviewSelection | null = null;
    if (json !== null) {
      try {
        const parsed = SelectionSchema.safeParse(JSON.parse(json));
        next = parsed.success ? (parsed.data as unknown as PreviewSelection) : null;
      } catch { next = null; }
    }
    if (next === null && current === null) return;
    current = next;
    notify();
  },
  enqueue(request: PreviewRequest) { queue.push(request); },
  take(): PreviewRequest[] { const taken = queue; queue = []; return taken; },
};

type BridgeWindow = Window & { __orionPreviewEdit?: { setSelection(json: string | null): void; take(): PreviewRequest[] } };

export function installPreviewEditBridge(win: Window): () => void {
  const target = win as BridgeWindow;
  target.__orionPreviewEdit = { setSelection: (json) => previewEditStore.setFromJson(json), take: () => previewEditStore.take() };
  return () => { delete target.__orionPreviewEdit; };
}
```

- [ ] **Step 4: Run the store tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/preview-edit/preview-edit-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing panel test**

`preview-edit-panel.test.tsx` (first line `// @vitest-environment jsdom` only if the repo's web tests do not already default to jsdom; check another `*.test.tsx` in `canvas-excalidraw/live/` and copy its header):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PreviewSelection } from "./preview-edit-store";
import { PreviewEditPanel } from "./preview-edit-panel";

const FIELD = { editable: true, value: null };
const fields = {
  text: { editable: true, value: "Plan your day" }, color: FIELD, backgroundColor: FIELD, fontSize: FIELD, fontWeight: FIELD,
  fontFamily: FIELD, padding: FIELD, gap: FIELD, borderRadius: FIELD, width: FIELD, height: FIELD,
};
const base: PreviewSelection = {
  starId: "s1", label: "p", tag: "p", html: "<p>Plan your day</p>", fields,
  computed: { fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "rgb(0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", width: "100px", height: "20px", padding: "4px", gap: "normal", borderRadius: "0px", display: "block" },
  reason: null, locked: null, canUndo: true, canRedo: false, pending: false,
};

describe("PreviewEditPanel", () => {
  it("shows the tweak fields for an editable element", () => {
    render(<PreviewEditPanel selection={base} onRequest={vi.fn()} />);
    expect(screen.getByDisplayValue("Plan your day")).toBeTruthy();
  });
  it("explains why an element cannot be edited and still offers the describe box", () => {
    render(<PreviewEditPanel selection={{ ...base, fields: null, reason: "Orion can't find this element's code. Describe the change instead." }} onRequest={vi.fn()} />);
    expect(screen.getByText(/can't find this element's code/)).toBeTruthy();
    expect(screen.getByLabelText("Tell Orion what to change")).toBeTruthy();
  });
  it("sends the describe text and clears the box", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={base} onRequest={onRequest} />);
    const box = screen.getByLabelText("Tell Orion what to change") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "make this a card" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onRequest).toHaveBeenCalledWith({ kind: "describe", text: "make this a card" });
    expect(box.value).toBe("");
  });
  it("disables fields and shows the reason while the build is running", () => {
    render(<PreviewEditPanel selection={{ ...base, locked: "This Star is still building. Edit once it finishes." }} onRequest={vi.fn()} />);
    expect(screen.getByText(/still building/)).toBeTruthy();
    expect(screen.queryByDisplayValue("Plan your day")).toBeNull();
  });
  it("sends undo and redo and disables them when there is nothing to do", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={base} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onRequest).toHaveBeenCalledWith({ kind: "undo" });
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("closes", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={base} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onRequest).toHaveBeenCalledWith({ kind: "close" });
  });
});
```

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/preview-edit/preview-edit-panel.test.tsx` → FAIL (missing module).

- [ ] **Step 6: Implement the panel**

`preview-edit-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { LivePanel } from "../live/live-panel";
import { TextField } from "../live/inspector-ui";
import { TweakPanel } from "../live/tweak-panel";
import { rgbToHex } from "../live/inspector-values";
import type { PreviewRequest, PreviewSelection } from "./preview-edit-store";

export function PreviewEditPanel({ selection, onRequest }: { selection: PreviewSelection; onRequest: (request: PreviewRequest) => void }) {
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onRequest({ kind: "describe", text });
    setDraft("");
  };
  const used = [selection.computed.color, selection.computed.backgroundColor]
    .map((css) => rgbToHex(css)).filter((hex): hex is string => !!hex);
  const editable = selection.fields !== null && selection.locked === null;
  return (
    <LivePanel tab="tweak" onTabChange={() => {}} onClose={() => onRequest({ kind: "close" })}
      disabledTabs={{ code: "Code isn't shown for an app preview." }}>
      <VStack gap={3}>
        {selection.locked ? <Banner status="info" title={selection.locked} /> : null}
        {!selection.locked && selection.reason ? <Banner status="info" title={selection.reason} /> : null}
        {editable ? (
          <TweakPanel
            selectionKey={`${selection.starId}:${selection.tag}`}
            fields={selection.fields!}
            computed={selection.computed}
            used={used}
            isPending={selection.pending}
            onTweak={(tweak) => onRequest({ kind: "tweak", ...tweak })}
          />
        ) : null}
        <VStack gap={2}>
          <Button label="Undo" size="sm" isDisabled={!selection.canUndo || selection.locked !== null} onClick={() => onRequest({ kind: "undo" })} />
          <Button label="Redo" size="sm" isDisabled={!selection.canRedo || selection.locked !== null} onClick={() => onRequest({ kind: "redo" })} />
        </VStack>
        <Text type="label">Tell Orion what to change</Text>
        <TextField ariaLabel="Tell Orion what to change" value={draft} onChange={setDraft} onCommit={send} />
        <Button label="Send" size="sm" isDisabled={draft.trim() === ""} onClick={send} />
      </VStack>
    </LivePanel>
  );
}
```

`PanelCloseButton` inside `LivePanel` already provides the accessible close control; if its accessible name is not matched by `/close/i` in the test, change the test query to the name `PanelCloseButton` really exposes (read `live/live-panel.tsx:21-30`). If `rgbToHex` has a different signature or returns a different type, read `live/inspector-values.ts` and adapt; keep the `hand-edit-panel.tsx:170` call shape as the source of truth.

- [ ] **Step 7: Mount it in the board**

In `excalidraw-board.tsx`: import `useSyncExternalStore` (already imported), `installPreviewEditBridge`, `previewEditStore`, `PreviewEditPanel`. Add inside the component, near the other `useEffect`s:

```tsx
  useEffect(() => installPreviewEditBridge(window), []);
  const previewSelection = useSyncExternalStore(previewEditStore.subscribe, previewEditStore.get, () => null);
```

and make the `end=` prop's conditional chain start with the preview panel:

```tsx
        end={previewSelection ? (
          <PreviewEditPanel selection={previewSelection} onRequest={previewEditStore.enqueue} />
        ) : api && access === "edit" && selection && selection.kind !== "screen" && shapeInfo ? (
          /* existing ShapePanel branch, unchanged */
```

(Keep every existing branch exactly as it is; only prepend the new one.)

- [ ] **Step 8: Run the web checks**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw && pnpm --filter @meld/web typecheck && pnpm check:astryx && pnpm --filter @meld/web lint`
Expected: PASS. If `pnpm check:astryx` flags a raw `div`/hex in the new files, replace it with the component or token it names.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Add the Canvas edit panel for app previews"
```

---

### Task 9: Acceptance on Daily Quest (Next.js) and a Vite app in Orion Staging

**Files:** none new (manual verification and fixes found by it).

- [ ] **Step 1: Build and install into Orion Staging**

```bash
cd apps/mac && swift build
APP="../../.context/staging/Orion Staging.app"
pkill -f "Orion Staging.app/Contents/MacOS/Orion"; sleep 1
cp .build/debug/Orion "$APP/Contents/MacOS/Orion"
rm -rf "$APP/Contents/Resources/OrionMac_Orion.bundle" && cp -R .build/debug/OrionMac_Orion.bundle "$APP/Contents/Resources/"
install_name_tool -add_rpath @executable_path/../Frameworks "$APP/Contents/MacOS/Orion"
codesign --force --deep --sign - "$APP" && open "$APP"
```

(The two extra lines — copying the resource bundle and adding the rpath — are required: forgetting the rpath crashes the app at launch with a missing Sparkle framework.) Confirm `…/Contents/Resources/OrionMac_Orion.bundle/PreviewEdit/overlay.js` and `edit-helper.mjs` exist. The staging web server must be running the branch's web code (restart the `web` process from `.context/staging/start.sh web` so the new panel is served).

- [ ] **Step 2: Walk the acceptance script and record results**

1. Open the Testing project, the finished Daily Quest Star, **Preview in Canvas**. Click the pencil in the preview header. Expected: the pencil turns blue; hovering the page outlines elements.
2. Click the tagline ("Plan your day Effectively"). Expected: a panel opens with Text, Colour, Size, etc., and the code shows `app/page.tsx` unchanged.
3. Change the text; Expected: the page updates within a second; `git diff` in the worktree shows only that line changing.
4. Change the colour; Expected: an inline `style={{ color: ... }}` is added to that element.
5. Press Undo; Expected: the file is exactly the original (`git diff` empty), then Redo restores it.
6. Click the big greeting ("Good"). Expected: the Text field is read-only/hidden with the reason that it comes from code; colour and size remain editable.
7. Type "make this tagline bigger and bold" in the describe box and Send. Expected: a new message appears in the Star's conversation starting with "Change this element in the app:" and containing `Code: app/page.tsx:` and the element HTML.
8. While that build is running, click an element and try a change. Expected: the panel shows "This Star is still building. Edit once it finishes." and nothing is written.
9. Stop the preview server (kill the `next dev` child) and wait for the preview to drop. Expected: edit mode turns off.

**Part B — a Vite + React app.** Make a scratch app (`npm create vite@latest vite-qa -- --template react-ts --no-interactive`, `git init`, commit), then in Orion Staging create a project, link that folder (Link project code → local folder), and send: "Install the dependencies with npm install, then add a one-line tagline under the heading." Approve the requests.

10. When the Star finishes, click **Preview in Canvas**. Expected: the Vite app renders in the frame (the launcher chose `vite`, not `next`).
11. Turn on the pencil and click the `<h1>`. Expected: the panel opens, the Text field shows the heading, and the result is `src/App.tsx` (check the describe text in step 12).
12. Change the heading text and colour; undo; redo. Expected: the same behaviour as steps 3–5, and `git diff` in the Star's worktree changes only `src/App.tsx`.
13. Send a described change. Expected: the build message contains `Code: src/App.tsx:`.
14. Stop Orion and relaunch: no orphaned `vite` process remains (`pgrep -fl "vite --host"` is empty).

**Part C — a project that cannot be edited directly.** If a React 18, Create React App or Vue app is at hand, repeat steps 10–11 against it and note what happens (preview should start; a non-React app should show the "can't find this element's code" message and keep the describe box). Do not block the release on Part C, but report it plainly as tested or not tested.

Save screenshots of steps 2, 6 and 11 to `.context/` and embed them in the final report. Any step that fails: fix it with a test where the layer has one, re-run the whole script, and note the fix in the commit message.

- [ ] **Step 3: Full verification**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test:workspace && pnpm check:astryx && pnpm test:colocation && (cd apps/mac && swift test)` and `git diff --exit-code -- apps/mac/Sources/Orion/Resources/PreviewEdit`.
Expected: all PASS; no diff in the bundled files.

- [ ] **Step 4: Open the PR**

Push the branch, open a PR to `main` titled "Edit a running app by pointing at it on the Canvas" with the acceptance results and screenshots, wait for all four CI jobs (database, e2e, gateway-integration, validate) to pass, and report. Do not merge without the owner's say-so: merging deploys to production.

---

## Self-Review

- **Spec coverage:** source resolver (Tasks 1, 1B); element range + edit helper reusing the existing editor, safe writes, `not-found` / `not-literal` / `too-large` / `outside-root` (Tasks 2–4); selection overlay with hover, click, inline text retype and resize handles (Task 5); property list and panel reuse via `TweakPanel` in `LivePanel` with the same inspector kit (Task 8); undo/redo outside Git (Task 6); describe path via `sendStream(build: true)` with element context, text only (Tasks 6, 8); lock while building and when the preview is down (Tasks 6, 7); pencil toggle in the preview header (Task 7); Mac bundling and CI staleness (Task 4); tests per layer and the Daily Quest acceptance (Task 9). Any-project preview (Task 6B) and the React 18 / Create React App / Vite lookups (Task 1B). Deliberately not covered because the spec excludes them: reordering/dragging in the page flow, CSS modules and shared stylesheets, screenshots, Turbopack, and direct edits for Vue, Svelte, Angular and plain HTML (they get preview, selection and the describe box).
- **Placeholder scan:** the only "read this first" instructions point to specific existing lines (`jsx.ts:1-2,368-380`, `live-panel.tsx:21-30`, `hand-edit-panel.tsx:170`, the `agentChoice()` function) where an exact existing signature could differ; each says what to do if it does.
- **Type consistency:** `Source`/`Change`/`Outcome` (Task 3) are what the helper protocol (Task 4) and `PreviewEditChange` / helper JSON (Task 6) carry; overlay messages (Task 5) are the cases `PreviewMessage(body:)` decodes (Task 6); `PreviewRequest` kinds (`tweak`, `undo`, `redo`, `describe`, `close`) match between `preview-edit-store.ts` (Task 8) and `PreviewRequest(json:)` (Task 6); the selection JSON keys in `PreviewEditor.Selection` match `SelectionSchema` in the store.
