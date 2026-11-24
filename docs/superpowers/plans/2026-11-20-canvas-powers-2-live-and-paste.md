# Canvas Powers — Plan 2: Live and paste

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner wake one screen on the board into a working app (double-click or **Open live**), see "This screen stopped responding" with **Reload** / **Show code** when it hangs, and paste React or HTML through the dock's **Code** button to create a new screen that appears as a picture and then goes live.

**Architecture:**
- A pure **live state machine** (`live/live-state.ts`) plus a small **live controller** (`live/live-controller.ts`, an external store with timers) own the one live screen. `FrameHost` reads the controller with `useSyncExternalStore`, so Excalidraw's memoised embeddable rendering always sees the current state.
- Screens are compiled in a **Web Worker** (`live/compile.worker.ts`) with `compileScreen` from `@meld/screen-runtime`, then assembled on the main thread with `assembleScreenDocument` + the existing `FRAME_CSP` + the vendored runtime fetched once from `/screen-runtime/runtime.js`. Babel never enters the main bundle: the board imports only new subpath exports (`@meld/screen-runtime/document`, `/bridge`, `/constants`).
- The in-frame bridge gains two host-facing features: a **snapshot** reply (a script-free copy of the rendered DOM, used as the sleeping thumbnail) and **Escape** forwarding. Pasted (and other non-legacy) screens get their board picture from that snapshot; until a snapshot exists they show a static placeholder.
- The **paste dialog** (`paste/`) detects React vs HTML, compiles in the worker to list unsupported packages and other errors *before* creating anything, then calls `createCanvasScreen`, drops an embeddable at the viewport centre at device size, and wakes it live.
- The right-hand panel is a `Layout` end slot (`LayoutPanel`, 280 px) with one **Code** tab in this plan (errors + read-only source). The tab list and content slot are the seam Plan 3 fills with Tweak and the CodeMirror editor.

**Tech Stack:** Next.js 16.2 (Turbopack dev), React 19.2, zod 4, Vitest 4 (+ jsdom 27), Playwright 1.62, `@excalidraw/excalidraw` 0.18.1, Astryx 0.1.8, `@babel/standalone` 7 + parse5 7.3 (worker only).

**Spec:** `docs/superpowers/specs/2026-11-19-canvas-powers-design.md`, delivery step 2: section 5 (Live screen host), section 6 (Paste code), "Safety", and "Error handling summary". Section 3 (source editor) and the Tweak/Code editing tabs are Plan 3.

**Where to work:** worktree `/Users/maxuser/conductor/workspaces/meld/canvas-powers-live-paste`, branch `NicholasOdunsi/canvas-powers-live-paste`, stacked on `NicholasOdunsi/canvas-powers-foundation` (PR #57). Before every shell session: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`. Don't touch other worktrees.

## Global Constraints

Carried from Plan 1 (unchanged):
- Astryx rules from `AGENTS.md`:
  - no raw `<div>` / `<span>` (an `<iframe>` is fine, as in `FrameHost`)
  - no hex values or `NNpx` literals in `style={{}}` or CSS rules; numbers passed to component props (`width={280}`) are fine
  - tokens only: `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`
  - `pnpm check:astryx` must pass
- Flat rule: no drop shadows on new chrome. Depth comes from surface colour only.
- `@excalidraw/excalidraw` stays pinned at `0.18.1`.
- Screen frame network policy is unchanged. `FRAME_CSP` in `apps/web/src/features/canvas-excalidraw/frame-document.ts` stays the single source of the live CSP: no network. Board thumbnails keep `BOARD_FRAME_CSP` and `BOARD_FRAME_SANDBOX` (`""`, no scripts).
- Screen source limits: 1 to 20 files; at most 256 KB total (UTF-8 JSON); paths match `^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$` and never contain `..`; at most 100 links.
- Supported React imports, exactly: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `lucide-react`, `clsx`, plus relative imports of the screen's own `.tsx .ts .jsx .js .css` files.
- Element tag attribute `data-orion-src="<file>:<start>:<end>"`; tags only when `tagElements: true` (the live host compiles with tags on; they never reach a snapshot, copy or download).
- Loop guard: a single synchronous loop run longer than **1000 ms** throws `new Error("__ORION_STUCK__")`.
- Database writes to screen versions happen only through the security-definer RPCs from Plan 1. This plan adds **no migration**.
- Tests sit next to the files they test (`pnpm test:colocation`). A facet test `name.facet.test.ts` is allowed when `name.ts` sits beside it.

New in this plan:
- Live frame: `sandbox="allow-scripts"` (`FRAME_SANDBOX`), `pointer-events: auto`, accent outline `var(--spacing-0-5) solid var(--color-accent)`. Only one live screen at a time.
- Ready timeout: **5000 ms** from document mount to the bridge's `ready`. `ready` means "the document finished loading", never "no errors".
- Board screen HTML (thumbnails/snapshots) stays ≤ **200 000** characters, the existing `board-persistence.ts` limit. A larger snapshot is dropped, never stored (an oversized screen would make every board save fail).
- Snapshots are taken only for screens whose source lives in the screen store (`kind` `react`/`html`). Board-only and legacy screens keep their stored HTML untouched, because the "Preview screen" route runs that HTML with its scripts.
- Copy is user-facing and plain: "This screen stopped responding", "Reload", "Show code", "Open live", "Code", "Paste code".

---

## File map

**Task 0 — prerequisites carried from Plan 1**
- Modify `packages/screen-runtime/src/loop-guard.ts` + `loop-guard.test.ts` (0a)
- Create `packages/screen-runtime/src/embedded-frames.ts` + `.test.ts`; modify `src/compile.ts` + `compile.test.ts` (0b)
- Modify `apps/web/src/features/design/canvas-screen-source.ts` + `.test.ts`, `canvas-screen-source-fake.ts`; create `canvas-screen-source-fake.test.ts` (0c)
- Create `apps/web/src/features/canvas-excalidraw/live/live-state.ts` + `.test.ts` (0d)

**Track L — live screen host** (all under `apps/web/src/features/canvas-excalidraw/` unless stated)
- Modify `packages/screen-runtime/src/runtime/bridge.ts` + `bridge.test.ts`; create `src/runtime/bridge.snapshot.test.ts`; modify `package.json` (exports, jsdom devDependency), `src/index.ts` (L1)
- Modify `board-persistence.ts` (export `MAX_SCREEN_HTML_CHARS`); create `live/live-messages.ts` + `.test.ts` (L2)
- Create `live/runtime-bundle.ts` + `.test.ts`, `live/compile-protocol.ts` + `.test.ts`, `live/compile.worker.ts`, `live/screen-compiler.ts` + `.test.ts` (L3)
- Create `live/live-source.ts` + `.test.ts`, `live/placeholder.ts` + `.test.ts`; modify `apps/web/src/features/design/canvas-screen-reader.ts` + `.test.ts` (L4)
- Create `live/live-controller.ts` + `.test.ts` (L5)
- Create `live/stopped-overlay.tsx` + `.test.tsx`; modify `frame-host.tsx` + `frame-host.test.tsx` (L6)
- Create `live/live-panel.tsx` + `.test.tsx` (L7)
- Create `live/live-hit.ts` + `.test.ts`, `live/live-actions.ts` + `.test.ts` (L8)
- Modify `excalidraw-board.tsx`, `chrome/orion-board.css` (L9)

**Track P — paste code**
- Create `paste/detect-kind.ts` + `.test.ts`, `paste/paste-source.ts` + `.test.ts` (P1)
- Create `paste/placement.ts` + `.test.ts`, `paste/create-pasted-screen.ts` + `.test.ts` (P2)
- Create `paste/paste-dialog.tsx` + `.test.tsx` (P3)
- Modify `excalidraw-board.tsx`; create `e2e/canvas-excalidraw-live.spec.ts` (P4)

Order: 0a, 0b, 0c, 0d, L1 … L9, P1 … P4. L1–L8 and P1–P3 only touch new files plus the listed small edits, so a reviewer can gate each one; L9 and P4 are the two integration tasks.

### Decisions made while planning (resolved ambiguities, recorded here)

1. **Thumbnails for React screens come from a snapshot of the live run.** Board pictures never run code, and the legacy reader has no markup for `react`/`html` versions (it renders them blank). So: after `ready`, and again on sleep, the host asks the frame for a script-free copy of its DOM (Tailwind's generated `<style>` included) and stores it in the board's `ScreenStore`, which the board already persists. Until a snapshot exists (another device, or a screen made elsewhere), the board shows a static placeholder ("Double-click to open"). No second, hidden runner is added: that would run code for screens nobody opened. A pasted screen gets the placeholder first, then goes live immediately, so its real picture is captured within half a second.
2. **No database work is needed.** Live and paste only *create* versions (`create_canvas_screen`) and *read* them. The deferred DB items (link-item validation in `save_canvas_screen_version`, honouring `updating`, `design_screen_events`) only matter once versions are saved from the board (Plan 3) or by AI (Plan 4). See "Track A2: DB follow-ups" at the end. The only reader change, exposing `source_kind`, is a `select` change, not a migration.
3. **Legacy and board-only screens go live from their stored HTML, in memory.** The spec converts board-only screens into `html` design screens "the first time they're opened live or edited". Plan 2 has no editing and no saves, so conversion would create database rows for nothing. Waking a legacy/board-only screen compiles its stored HTML as an in-memory `html` source. Conversion moves to Plan 3, where the first edit saves (the save RPC already accepts `new_kind = 'html'` on a legacy screen).
4. **`iframe` / `frame` / `frameset` / `object` / `embed` are compile errors** in both HTML and JSX (`Embedded frames are not supported: <iframe>`). `iframe srcdoc` would run nested scripts without the loop guard. CSP already blocks `object`/`embed` (`object-src` falls back to `default-src 'none'`) and network iframes (`frame-src 'none'`), so rejecting them loses nothing that worked. Honest limit, written into the code comment: elements created at runtime (`document.createElement("iframe")`, `React.createElement("iframe")`) are not caught; the inherited CSP still applies, so this is a UX gap, not a sandbox escape.
5. **Paste blocks on any compile error**, not only unsupported packages. Plan 2 has no code editor, so a screen that can't compile could not be fixed after creation. The dialog lists every error and creates nothing.
6. **Panel placement:** an Astryx `Layout` `end` slot with `LayoutPanel width={280}`, i.e. beside the board, which narrows while the panel is open. The board keeps panning. The spec says "over the board"; `LayoutPanel` only works inside `Layout`, and AGENTS.md says to frame with Layout + LayoutPanel.
7. **Sleep rules:** Esc (on the board, or forwarded from the frame when the screen didn't `preventDefault` it), any pointer-down on the Excalidraw canvas outside the live screen's bounds (empty board, a shape, or another screen), or **Open live** on another screen.
8. **A screen that throws before `ready` is "crashed", not "stuck".** React screens that throw during start-up post `error` and never `ready`. After 5 s the overlay says "This screen hit an error" with the first message, instead of "stopped responding". Only no-`ready`-and-no-errors is a timeout.
9. **`goto` from a live screen is parsed but ignored** in Plan 2. Clicking through to the target screen is section 9 (Plan 5).
10. **Pasted React without a default export** is normalised: a bare JSX snippet is wrapped in `export default function App()`, and a top-level `function App` / `const App` gets `export default App;` appended. Anything else without a default or `App` export is rejected in the dialog with "Export your component as default".
11. **The dock's Code button only appears on room boards** (`roomId` set, edit access). The local dev board has no screen store to save into.

---
# Task 0 — Prerequisites carried from Plan 1

These come from Plan 1's final review and fix-wave ledger (`.superpowers/sdd/2026-11-19-canvas-powers-1-foundation/final-review.md`, `progress.md`). Each must land before the live host runs real screens.

### Task 0a: Loop guard — top-level timers must not collide across HTML scripts

**Problem:** `loopGuardPlugin` inserts `let _orionLoop = Date.now()` before each loop. For a loop at the top level of a classic script that `let` lands in the document's global lexical scope. HTML screens emit each `<script>` separately (Plan 1 fix I3), so two scripts that each contain a top-level loop throw `SyntaxError: Identifier '_orionLoop' has already been declared` and the second script never runs. (Verified with `node:vm`: two `runInContext` calls declaring the same top-level `let` throw exactly that; the same declarations inside `{ … }` blocks don't.)

**Fix:** when the loop's anchor sits directly in `Program`, wrap declaration + loop in their own block instead of inserting the declaration beside it. React modules are unaffected (each module body is already inside a function).

**Files:**
- Modify: `packages/screen-runtime/src/loop-guard.ts` (the two lines at the end of `guard`)
- Test: `packages/screen-runtime/src/loop-guard.test.ts`, `packages/screen-runtime/src/compile.test.ts`

**Interfaces:** no signature changes. `loopGuardPlugin(options?: { budgetMs?: number })` is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to the top of `packages/screen-runtime/src/loop-guard.test.ts`:

```ts
import { createContext, runInContext } from "node:vm";
```

Add inside `describe("loopGuardPlugin", …)`:

```ts
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
```

Add to `packages/screen-runtime/src/compile.test.ts`, at the top:

```ts
import { createContext, runInContext } from "node:vm";
```

and inside `describe("compileScreen HTML", …)`:

```ts
  it("runs two classic scripts that each have a top-level loop in one document", () => {
    const compiled = screen(compile({ "index.html": "<script>var n = 0; for (let i = 0; i < 2; i++) n++;</script><script>for (let i = 0; i < 3; i++) n++;</script>" }, { tagElements: false }, "html"));
    const context = createContext({});
    for (const script of compiled.scripts) runInContext(script, context);
    expect(context.n).toBe(5);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/loop-guard.test.ts src/compile.test.ts`
Expected: FAIL — `SyntaxError: Identifier '_orionLoop' has already been declared` in the two new multi-script tests.

- [ ] **Step 3: Implement**

In `packages/screen-runtime/src/loop-guard.ts`, replace the last two statements of `guard`:

```ts
      if (anchor.inList) anchor.insertBefore(declaration);
      else anchor.replaceWith(t.blockStatement([declaration, anchor.node]));
```

with:

```ts
      // A top-level `let` lands in the document's shared global lexical scope,
      // so two HTML scripts that each loop would redeclare the same timer.
      // Top-level loops get their own block; nested ones keep the cheaper
      // sibling declaration.
      if (anchor.inList && !anchor.parentPath?.isProgram()) anchor.insertBefore(declaration);
      else anchor.replaceWith(t.blockStatement([declaration, anchor.node]));
```

- [ ] **Step 4: Run the whole package**

Run: `pnpm --filter @meld/screen-runtime test && pnpm --filter @meld/screen-runtime typecheck`
Expected: all tests PASS (138 existing + 3 new), typecheck clean. "guards each loop once" still passes because `guarded` is filled before `replaceWith` requeues the loop.

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/loop-guard.ts packages/screen-runtime/src/loop-guard.test.ts packages/screen-runtime/src/compile.test.ts
git commit -m "fix(screen-runtime): keep top-level loop timers private per script"
```

### Task 0b: Reject embedded frames (`iframe srcdoc` runs without the loop guard)

**Files:**
- Create: `packages/screen-runtime/src/embedded-frames.ts`
- Test: `packages/screen-runtime/src/embedded-frames.test.ts`
- Modify: `packages/screen-runtime/src/compile.ts`, `packages/screen-runtime/src/compile.test.ts`

**Interfaces:**
- Produces:
  - `EMBEDDED_FRAME_TAGS: ReadonlySet<string>` = `iframe`, `frame`, `frameset`, `object`, `embed`
  - `embeddedFrameMessage(tag: string): string` → `"Embedded frames are not supported: <iframe>"`
  - `embeddedFramesPlugin(found: Set<string>): (api: { types: typeof BabelTypes }) => PluginObj` — records lowercase host JSX names in `found`
- `compileScreen` reports one `CompileError` per offending tag (HTML: per element, React: per file and tag).

- [ ] **Step 1: Write the failing tests**

`packages/screen-runtime/src/embedded-frames.test.ts`:

```ts
import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { EMBEDDED_FRAME_TAGS, embeddedFrameMessage, embeddedFramesPlugin } from "./embedded-frames";

function found(code: string) {
  const tags = new Set<string>();
  transform(code, { plugins: ["syntax-jsx", embeddedFramesPlugin(tags)] });
  return [...tags].sort();
}

describe("embeddedFramesPlugin", () => {
  it("records host frame elements", () => {
    expect(found('const a = <main><iframe srcDoc="x" /><object data="y" /><embed /></main>;')).toEqual(["embed", "iframe", "object"]);
  });
  it("ignores components and other host elements", () => {
    expect(found("const a = <Iframe><section /></Iframe>;")).toEqual([]);
  });
  it("names the tag in the message", () => {
    expect(embeddedFrameMessage("iframe")).toBe("Embedded frames are not supported: <iframe>");
    expect([...EMBEDDED_FRAME_TAGS].sort()).toEqual(["embed", "frame", "frameset", "iframe", "object"]);
  });
});
```

Add inside `describe("compileScreen HTML", …)` in `compile.test.ts`:

```ts
  it("rejects embedded frames, which would run scripts without the loop guard", () => {
    const result = compile({ "index.html": '<iframe srcdoc="<script>while(true){}</script>"></iframe><object data="data:text/html,x"></object><embed src="x">' }, { tagElements: false }, "html");
    expect(result).toEqual({ ok: false, errors: [
      { file: "index.html", message: "Embedded frames are not supported: <iframe>" },
      { file: "index.html", message: "Embedded frames are not supported: <object>" },
      { file: "index.html", message: "Embedded frames are not supported: <embed>" },
    ] });
  });
```

Add inside `describe("compileScreen React", …)`:

```ts
  it("rejects embedded frames in JSX", () => {
    const result = compile({ "App.tsx": 'export default function App() { return <iframe srcDoc="<p>x</p>" />; }' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ file: "App.tsx", message: "Embedded frames are not supported: <iframe>" });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/embedded-frames.test.ts src/compile.test.ts`
Expected: FAIL — `Cannot find module './embedded-frames'`, and the compile tests return `ok: true`.

- [ ] **Step 3: Implement**

`packages/screen-runtime/src/embedded-frames.ts`:

```ts
import type { PluginObj, types as BabelTypes } from "@babel/core";

// A nested frame would run its own scripts without the loop guard
// (`<iframe srcdoc>`), and CSP already blocks every other use of these tags
// (network frames via frame-src, object/embed via default-src). Honest limit:
// frames created at runtime (document.createElement / React.createElement)
// are not seen here; the inherited CSP still applies to them.
export const EMBEDDED_FRAME_TAGS: ReadonlySet<string> = new Set(["iframe", "frame", "frameset", "object", "embed"]);

export function embeddedFrameMessage(tag: string): string {
  return `Embedded frames are not supported: <${tag}>`;
}

export function embeddedFramesPlugin(found: Set<string>) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    name: "orion-embedded-frames",
    visitor: {
      JSXOpeningElement(path) {
        const { name } = path.node;
        if (t.isJSXIdentifier(name) && EMBEDDED_FRAME_TAGS.has(name.name)) found.add(name.name);
      },
    },
  });
}
```

In `packages/screen-runtime/src/compile.ts`:

1. Add the import: `import { EMBEDDED_FRAME_TAGS, embeddedFrameMessage, embeddedFramesPlugin } from "./embedded-frames";`
2. In `compileReact`, inside the per-file loop, before `try {`, add `const frames = new Set<string>();`, add `embeddedFramesPlugin(frames),` as the first entry of the first `transform` call's `plugins` array, and after the existing `if (report.dynamicImport) …` line add:

```ts
    for (const tag of [...frames].sort()) errors.push({ file, message: embeddedFrameMessage(tag) });
```

3. In `compileHtml`'s `visit`, directly after `if (node.tagName === "body") body = node;` add:

```ts
      if (EMBEDDED_FRAME_TAGS.has(node.tagName)) {
        errors.push({ file: source.entry, message: embeddedFrameMessage(node.tagName) });
        return false;
      }
```

- [ ] **Step 4: Run the package**

Run: `pnpm --filter @meld/screen-runtime test && pnpm --filter @meld/screen-runtime typecheck`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/embedded-frames.ts packages/screen-runtime/src/embedded-frames.test.ts packages/screen-runtime/src/compile.ts packages/screen-runtime/src/compile.test.ts
git commit -m "fix(screen-runtime): reject embedded frames that would skip the loop guard"
```

### Task 0c: `saveScreenVersion` validates `entry`; the fake checks entry ∈ files

**Files:**
- Modify: `apps/web/src/features/design/canvas-screen-source.ts` (`saveScreenVersion`)
- Modify: `apps/web/src/features/design/canvas-screen-source-fake.ts` (`fakeSave`)
- Test: `apps/web/src/features/design/canvas-screen-source.test.ts`
- Create test: `apps/web/src/features/design/canvas-screen-source-fake.test.ts`

**Interfaces:** signatures unchanged. `saveScreenVersion` returns `{ status: "error" }` without calling the RPC when `entry` is not a safe path or not one of `files`. `fakeSave` returns `null` (→ action `error`) when the resulting entry is not in `files`, matching the SQL `canvas_screen_files_valid` check.

- [ ] **Step 1: Write the failing tests**

Add inside `describe("saveScreenVersion", …)` in `canvas-screen-source.test.ts`:

```ts
  it("rejects an entry that is not one of the files, without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files, entry: "Main.tsx" }))
      .resolves.toEqual({ status: "error" });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: { "../x.tsx": "x" }, entry: "../x.tsx" }))
      .resolves.toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a valid entry through", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: { "index.html": "<p>x</p>" }, kind: "html", entry: "index.html" });
    expect(rpc).toHaveBeenCalledWith("save_canvas_screen_version", expect.objectContaining({ new_kind: "html", new_entry: "index.html" }));
  });
```

`apps/web/src/features/design/canvas-screen-source-fake.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeCreate, fakeRead, fakeSave } from "./canvas-screen-source-fake";

const ROOM = "e4000000-0000-4000-8000-000000000001";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };

describe("canvas screen source fake", () => {
  it("saves when the entry stays among the files", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, { "App.tsx": "export default () => <p/>" }, [])).toMatchObject({ status: "saved" });
  });
  it("rejects files that drop the current entry, like the database does", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, { "Other.tsx": "x" }, [])).toBeNull();
    expect(fakeRead(screenId)?.versionId).toBe(versionId);
  });
  it("rejects an explicit entry that is not among the files", () => {
    const { screenId, versionId } = fakeCreate(ROOM, source, "mobile");
    expect(fakeSave(screenId, versionId, source.files, [], "react", "Main.tsx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/canvas-screen-source.test.ts src/features/design/canvas-screen-source-fake.test.ts`
Expected: FAIL — the RPC is called with `new_entry: "Main.tsx"`, and `fakeSave` returns `{ status: "saved" }` for the bad entries.

- [ ] **Step 3: Implement**

In `canvas-screen-source.ts`, change the source import to also take `SCREEN_PATH`:

```ts
import { SCREEN_KINDS, SCREEN_PATH, ScreenFilesSchema, ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";
```

add next to `Links`:

```ts
const Entry = z.string().regex(SCREEN_PATH).refine((path) => !path.includes(".."));
```

and replace the validation block at the top of `saveScreenVersion` with:

```ts
  const screenId = Id.safeParse(input.screenId);
  const base = Id.nullable().safeParse(input.baseVersionId);
  const files = ScreenFilesSchema.safeParse(input.files);
  const links = Links.safeParse(input.links ?? []);
  const kind = z.enum(SCREEN_KINDS).optional().safeParse(input.kind);
  const entry = Entry.optional().safeParse(input.entry);
  if (!screenId.success || !base.success || !files.success || !links.success || !kind.success || !entry.success) return { status: "error" };
  // The RPC re-checks this, but failing here keeps the e2e fake and production identical.
  if (entry.data !== undefined && !Object.hasOwn(files.data, entry.data)) return { status: "error" };
```

Then use `entry.data` in both branches: `fakeSave(screenId.data, base.data, files.data, links.data, kind.data, entry.data)` and `new_entry: entry.data ?? null`.

In `canvas-screen-source-fake.ts`, in `fakeSave`, after `const previous = …!;` add:

```ts
  const nextEntry = entry ?? previous.entry;
  if (!Object.hasOwn(files, nextEntry)) return null;
```

and build the version with `entry: nextEntry`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/canvas-screen-source.test.ts src/features/design/canvas-screen-source-fake.test.ts && pnpm --filter @meld/web typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/canvas-screen-source.ts apps/web/src/features/design/canvas-screen-source-fake.ts apps/web/src/features/design/canvas-screen-source.test.ts apps/web/src/features/design/canvas-screen-source-fake.test.ts
git commit -m "fix(design): validate screen entry on save, in the action and the e2e fake"
```

### Task 0d: Live state machine — `ready` means "loaded", not "no errors"

HTML screens now post `error` for a throwing script and then `ready` (each script is separate since Plan 1's I3 fix). React screens that throw during start-up post `error` and never `ready`. The live host's state machine is built here, first, so that rule is part of its foundation.

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/live-state.ts`
- Test: `apps/web/src/features/canvas-excalidraw/live/live-state.test.ts`

**Interfaces:**
- Consumes: `type CompileError` from `@meld/screen-runtime` (type-only import, erased at build), `type ScreenSource` from `@meld/screen-runtime/source`.
- Produces (used by L2, L5, L6, L7, L8, L9):

```ts
export const MAX_RUNTIME_ERRORS = 20;
export type StopReason = "stuck" | "timeout" | "crashed";
export type LiveState =
  | { phase: "asleep"; attempt: number }
  | { phase: "compiling"; screenId: string; attempt: number }
  | { phase: "compile-failed"; screenId: string; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | { phase: "loading"; screenId: string; attempt: number; source: ScreenSource; document: string; errors: string[] }
  | { phase: "running"; screenId: string; attempt: number; source: ScreenSource; document: string; errors: string[] }
  | { phase: "stopped"; screenId: string; attempt: number; source: ScreenSource; document: string; errors: string[]; reason: StopReason };
export type LiveEvent =
  | { type: "wake"; screenId: string }
  | { type: "compiled"; attempt: number; source: ScreenSource; document: string }
  | { type: "compile-failed"; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | { type: "frame-ready" } | { type: "frame-error"; message: string } | { type: "frame-stuck" }
  | { type: "ready-timeout"; attempt: number } | { type: "reload" } | { type: "sleep" };
export const ASLEEP: LiveState;
export function liveReducer(state: LiveState, event: LiveEvent): LiveState;
export type LiveView =
  | { mode: "thumbnail" } | { mode: "waking" }
  | { mode: "live"; document: string; attempt: number }
  | { mode: "stopped"; reason: StopReason; detail: string | null };
export function liveViewFor(state: LiveState, screenId: string): LiveView;
export function isAwake(state: LiveState, screenId: string): boolean; // compiling, loading or running that screen
export type LiveIssue = { file: string | null; message: string };
export function liveIssues(state: LiveState): LiveIssue[];
export function liveSourceOf(state: LiveState): ScreenSource | null;
```

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/canvas-excalidraw/live/live-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ASLEEP, isAwake, liveIssues, liveReducer, liveSourceOf, liveViewFor, MAX_RUNTIME_ERRORS, type LiveEvent, type LiveState } from "./live-state";

const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const run = (events: LiveEvent[], from: LiveState = ASLEEP) => events.reduce(liveReducer, from);
const loaded = (): LiveState => run([{ type: "wake", screenId: "ds-a" }, { type: "compiled", attempt: 1, source, document: "<doc>" }]);

describe("liveReducer", () => {
  it("wakes, compiles and loads one screen", () => {
    expect(run([{ type: "wake", screenId: "ds-a" }])).toEqual({ phase: "compiling", screenId: "ds-a", attempt: 1 });
    expect(loaded()).toEqual({ phase: "loading", screenId: "ds-a", attempt: 1, source, document: "<doc>", errors: [] });
  });

  it("treats ready as 'loaded' even after an error, and keeps the error", () => {
    const state = run([{ type: "frame-error", message: "first script failed" }, { type: "frame-ready" }], loaded());
    expect(state).toMatchObject({ phase: "running", errors: ["first script failed"] });
    // A late timer for the same attempt does nothing once the document has loaded.
    expect(liveReducer(state, { type: "ready-timeout", attempt: 1 })).toBe(state);
  });

  it("reports a timeout without errors as stopped responding", () => {
    expect(run([{ type: "ready-timeout", attempt: 1 }], loaded())).toMatchObject({ phase: "stopped", reason: "timeout" });
  });

  it("reports errors without ready as a crash, not a hang", () => {
    expect(run([{ type: "frame-error", message: "boom" }, { type: "ready-timeout", attempt: 1 }], loaded()))
      .toMatchObject({ phase: "stopped", reason: "crashed", errors: ["boom"] });
  });

  it("stops on stuck while loading or running", () => {
    expect(run([{ type: "frame-stuck" }], loaded())).toMatchObject({ phase: "stopped", reason: "stuck" });
    expect(run([{ type: "frame-ready" }, { type: "frame-stuck" }], loaded())).toMatchObject({ phase: "stopped", reason: "stuck" });
  });

  it("ignores stale compile results and timers", () => {
    const second = run([{ type: "wake", screenId: "ds-a" }, { type: "sleep" }, { type: "wake", screenId: "ds-b" }]);
    expect(second).toEqual({ phase: "compiling", screenId: "ds-b", attempt: 2 });
    expect(liveReducer(second, { type: "compiled", attempt: 1, source, document: "old" })).toBe(second);
    const loadingB = liveReducer(second, { type: "compiled", attempt: 2, source, document: "new" });
    expect(liveReducer(loadingB, { type: "ready-timeout", attempt: 1 })).toBe(loadingB);
  });

  it("does not restart a screen that is already awake, but retries a failed or stopped one", () => {
    const state = loaded();
    expect(liveReducer(state, { type: "wake", screenId: "ds-a" })).toBe(state);
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source, errors: [{ file: "App.tsx", message: "Unsupported package: next" }] }]);
    expect(liveReducer(failed, { type: "wake", screenId: "ds-a" })).toMatchObject({ phase: "compiling", attempt: 2 });
    const stopped = run([{ type: "frame-stuck" }], loaded());
    expect(liveReducer(stopped, { type: "wake", screenId: "ds-a" })).toMatchObject({ phase: "compiling", attempt: 2 });
  });

  it("reloads a stopped screen with a fresh attempt and no errors", () => {
    const stopped = run([{ type: "frame-error", message: "x" }, { type: "frame-stuck" }], loaded());
    expect(liveReducer(stopped, { type: "reload" })).toEqual({ phase: "loading", screenId: "ds-a", attempt: 2, source, document: "<doc>", errors: [] });
  });

  it("caps runtime errors and sleeps from any phase", () => {
    let state = loaded();
    for (let index = 0; index < MAX_RUNTIME_ERRORS + 5; index += 1) state = liveReducer(state, { type: "frame-error", message: `e${index}` });
    expect(state.phase === "loading" && state.errors).toHaveLength(MAX_RUNTIME_ERRORS);
    expect(liveReducer(state, { type: "sleep" })).toEqual({ phase: "asleep", attempt: 1 });
    expect(liveReducer(ASLEEP, { type: "sleep" })).toBe(ASLEEP);
  });
});

describe("views", () => {
  it("maps state to what one screen shows", () => {
    expect(liveViewFor(ASLEEP, "ds-a")).toEqual({ mode: "thumbnail" });
    expect(liveViewFor(run([{ type: "wake", screenId: "ds-a" }]), "ds-a")).toEqual({ mode: "waking" });
    expect(liveViewFor(loaded(), "ds-a")).toEqual({ mode: "live", document: "<doc>", attempt: 1 });
    expect(liveViewFor(loaded(), "ds-b")).toEqual({ mode: "thumbnail" });
    expect(liveViewFor(run([{ type: "frame-error", message: "boom" }, { type: "ready-timeout", attempt: 1 }], loaded()), "ds-a"))
      .toEqual({ mode: "stopped", reason: "crashed", detail: "boom" });
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source: null, errors: [{ file: "", message: "x" }] }]);
    expect(liveViewFor(failed, "ds-a")).toEqual({ mode: "thumbnail" });
  });

  it("lists issues and source for the panel", () => {
    const failed = run([{ type: "wake", screenId: "ds-a" }, { type: "compile-failed", attempt: 1, source, errors: [{ file: "App.tsx", message: "bad" }, { file: "", message: "gone" }] }]);
    expect(liveIssues(failed)).toEqual([{ file: "App.tsx", message: "bad" }, { file: null, message: "gone" }]);
    expect(liveIssues(run([{ type: "frame-error", message: "late" }], loaded()))).toEqual([{ file: null, message: "late" }]);
    expect(liveSourceOf(failed)).toBe(source);
    expect(liveSourceOf(ASLEEP)).toBeNull();
    expect(isAwake(loaded(), "ds-a")).toBe(true);
    expect(isAwake(failed, "ds-a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-state.test.ts`
Expected: FAIL with `Cannot find module './live-state'`.

- [ ] **Step 3: Implement**

`apps/web/src/features/canvas-excalidraw/live/live-state.ts`:

```ts
import type { CompileError } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";

export const MAX_RUNTIME_ERRORS = 20;
export type StopReason = "stuck" | "timeout" | "crashed";

type Running = { screenId: string; attempt: number; source: ScreenSource; document: string; errors: string[] };
export type LiveState =
  | { phase: "asleep"; attempt: number }
  | { phase: "compiling"; screenId: string; attempt: number }
  | { phase: "compile-failed"; screenId: string; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | ({ phase: "loading" } & Running)
  | ({ phase: "running" } & Running)
  | ({ phase: "stopped"; reason: StopReason } & Running);

export type LiveEvent =
  | { type: "wake"; screenId: string }
  | { type: "compiled"; attempt: number; source: ScreenSource; document: string }
  | { type: "compile-failed"; attempt: number; source: ScreenSource | null; errors: CompileError[] }
  | { type: "frame-ready" }
  | { type: "frame-error"; message: string }
  | { type: "frame-stuck" }
  | { type: "ready-timeout"; attempt: number }
  | { type: "reload" }
  | { type: "sleep" };

export const ASLEEP: LiveState = { phase: "asleep", attempt: 0 };

function running(state: Running): Running {
  return { screenId: state.screenId, attempt: state.attempt, source: state.source, document: state.document, errors: state.errors };
}

// One live screen at a time. `attempt` grows on every wake and reload so a
// late compile result or ready timer from an earlier attempt is ignored.
export function liveReducer(state: LiveState, event: LiveEvent): LiveState {
  switch (event.type) {
    case "wake":
      if (state.phase !== "asleep" && state.screenId === event.screenId
        && (state.phase === "compiling" || state.phase === "loading" || state.phase === "running")) return state;
      return { phase: "compiling", screenId: event.screenId, attempt: state.attempt + 1 };
    case "compiled":
      if (state.phase !== "compiling" || state.attempt !== event.attempt) return state;
      return { phase: "loading", screenId: state.screenId, attempt: state.attempt, source: event.source, document: event.document, errors: [] };
    case "compile-failed":
      if (state.phase !== "compiling" || state.attempt !== event.attempt) return state;
      return { phase: "compile-failed", screenId: state.screenId, attempt: state.attempt, source: event.source, errors: event.errors };
    case "frame-error":
      if (state.phase !== "loading" && state.phase !== "running") return state;
      if (state.errors.length >= MAX_RUNTIME_ERRORS) return state;
      return { ...state, errors: [...state.errors, event.message] };
    case "frame-ready":
      // `ready` means the document finished loading, not that nothing failed:
      // an HTML screen reports a throwing script and still announces ready.
      if (state.phase !== "loading") return state;
      return { phase: "running", ...running(state) };
    case "frame-stuck":
      if (state.phase !== "loading" && state.phase !== "running") return state;
      return { phase: "stopped", reason: "stuck", ...running(state) };
    case "ready-timeout":
      if (state.phase !== "loading" || state.attempt !== event.attempt) return state;
      // Errors with no ready: the screen crashed while starting (React posts
      // error and never ready). Nothing at all: it stopped responding.
      return { phase: "stopped", reason: state.errors.length ? "crashed" : "timeout", ...running(state) };
    case "reload":
      if (state.phase !== "loading" && state.phase !== "running" && state.phase !== "stopped") return state;
      return { phase: "loading", ...running(state), attempt: state.attempt + 1, errors: [] };
    case "sleep":
      return state.phase === "asleep" ? state : { phase: "asleep", attempt: state.attempt };
  }
}

export type LiveView =
  | { mode: "thumbnail" }
  | { mode: "waking" }
  | { mode: "live"; document: string; attempt: number }
  | { mode: "stopped"; reason: StopReason; detail: string | null };

export function liveViewFor(state: LiveState, screenId: string): LiveView {
  if (state.phase === "asleep" || state.screenId !== screenId) return { mode: "thumbnail" };
  switch (state.phase) {
    case "compiling": return { mode: "waking" };
    // A compile error keeps the picture; the panel shows the errors.
    case "compile-failed": return { mode: "thumbnail" };
    case "loading":
    case "running": return { mode: "live", document: state.document, attempt: state.attempt };
    case "stopped": return { mode: "stopped", reason: state.reason, detail: state.errors[0] ?? null };
  }
}

export function isAwake(state: LiveState, screenId: string): boolean {
  return (state.phase === "compiling" || state.phase === "loading" || state.phase === "running") && state.screenId === screenId;
}

export type LiveIssue = { file: string | null; message: string };

export function liveIssues(state: LiveState): LiveIssue[] {
  if (state.phase === "compile-failed") return state.errors.map((error) => ({ file: error.file || null, message: error.message }));
  if (state.phase === "loading" || state.phase === "running" || state.phase === "stopped") {
    return state.errors.map((message) => ({ file: null, message }));
  }
  return [];
}

export function liveSourceOf(state: LiveState): ScreenSource | null {
  if (state.phase === "asleep" || state.phase === "compiling") return null;
  return state.source;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-state.test.ts && pnpm --filter @meld/web typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/live-state.ts apps/web/src/features/canvas-excalidraw/live/live-state.test.ts
git commit -m "feat(canvas): live screen state machine (ready means loaded, not error-free)"
```

---
# Track L — Live screen host

### Task L1: Frame bridge — snapshot replies, Escape forwarding, browser-safe subpath exports

**Files:**
- Modify: `packages/screen-runtime/src/runtime/bridge.ts`
- Test: `packages/screen-runtime/src/runtime/bridge.test.ts` (unchanged cases must still pass), create `packages/screen-runtime/src/runtime/bridge.snapshot.test.ts`
- Modify: `packages/screen-runtime/package.json` (exports + `jsdom` devDependency), `packages/screen-runtime/src/index.ts`

**Interfaces:**
- Produces from `@meld/screen-runtime/bridge`: `FRAME_MESSAGE_SOURCE = "orion-frame"` (existing), `HOST_MESSAGE_SOURCE = "orion-host"`, `FRAME_BRIDGE_SOURCE` (existing, extended).
- New subpath exports, none of which import Babel: `@meld/screen-runtime/bridge`, `@meld/screen-runtime/constants`, `@meld/screen-runtime/document` (`assembleScreenDocument`, `inlineScript`).
- Frame → parent messages added: `{ source: "orion-frame", type: "snapshot", html: string }` (reply only), `{ source: "orion-frame", type: "escape" }`.
- Parent → frame message: `{ source: "orion-host", type: "snapshot" }`, accepted only when `event.source === window.parent`.
- Snapshot content: `"<!doctype html>" + documentElement.outerHTML` of a clone with every `<script>` and `<meta http-equiv>` removed, and every `on*` and `data-orion-src` attribute removed. `<style>` elements (including Tailwind's generated one) are kept. The live document itself is not touched.

- [ ] **Step 1: Add jsdom to the package and write the failing test**

Run: `pnpm --filter @meld/screen-runtime add -D jsdom@27.0.0` (the exact version `apps/web` already uses).

`packages/screen-runtime/src/runtime/bridge.snapshot.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAG_ATTRIBUTE } from "../constants";
import { FRAME_BRIDGE_SOURCE, FRAME_MESSAGE_SOURCE, HOST_MESSAGE_SOURCE } from "./bridge";

type Handler = (event: unknown) => void;

function setup(markup: string) {
  document.head.innerHTML = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'"><style>p{color:red}</style><script>window.loaded = true</script>`;
  document.body.innerHTML = markup;
  const handlers: Record<string, Handler> = {};
  const parent = { postMessage: vi.fn() };
  const frameWindow = {
    parent,
    addEventListener: (type: string, handler: Handler) => { handlers[type] = handler; },
  } as Record<string, unknown>;
  const frameDocument = { addEventListener: vi.fn(), documentElement: document.documentElement };
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(frameWindow, frameDocument);
  return { frameWindow, parent, handlers };
}

afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("frame bridge snapshots", () => {
  it("copies the rendered page without scripts, CSP, handlers or source tags", () => {
    const { frameWindow } = setup(`<main ${TAG_ATTRIBUTE}="App.tsx:0:9"><button class="p-2" onclick="go()">Count 1</button></main>`);
    const html = (frameWindow.__orionSnapshot as () => string)();
    expect(html.startsWith("<!doctype html><html>")).toBe(true);
    expect(html).toContain("<style>p{color:red}</style>");
    expect(html).toContain('<button class="p-2">Count 1</button>');
    for (const removed of ["<script", "onclick", TAG_ATTRIBUTE, "Content-Security-Policy"]) expect(html).not.toContain(removed);
    // The live page keeps everything.
    expect(document.querySelector("button")?.getAttribute("onclick")).toBe("go()");
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });

  it("answers snapshot requests from the parent only", () => {
    const { parent, handlers } = setup("<p>Hi</p>");
    handlers.message({ source: {}, data: { source: HOST_MESSAGE_SOURCE, type: "snapshot" } });
    handlers.message({ source: parent, data: { source: "someone-else", type: "snapshot" } });
    handlers.message({ source: parent, data: null });
    expect(parent.postMessage).not.toHaveBeenCalled();
    handlers.message({ source: parent, data: { source: HOST_MESSAGE_SOURCE, type: "snapshot" } });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith(
      { source: FRAME_MESSAGE_SOURCE, type: "snapshot", html: expect.stringContaining("<p>Hi</p>") }, "*",
    );
  });

  it("forwards Escape unless the screen handled it", () => {
    const { parent, handlers } = setup("<p>Hi</p>");
    handlers.keydown({ key: "Escape", defaultPrevented: true });
    handlers.keydown({ key: "a", defaultPrevented: false });
    expect(parent.postMessage).not.toHaveBeenCalled();
    handlers.keydown({ key: "Escape", defaultPrevented: false });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({ source: FRAME_MESSAGE_SOURCE, type: "escape" }, "*");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/runtime/bridge.snapshot.test.ts`
Expected: FAIL — `HOST_MESSAGE_SOURCE` is undefined and `frameWindow.__orionSnapshot is not a function`.

- [ ] **Step 3: Implement**

In `packages/screen-runtime/src/runtime/bridge.ts`, change the import and add the constant:

```ts
import { SCREEN_KEY, STUCK_MESSAGE, TAG_ATTRIBUTE } from "../constants";

export const FRAME_MESSAGE_SOURCE = "orion-frame";
export const HOST_MESSAGE_SOURCE = "orion-host";
```

Inside `FRAME_BRIDGE_SOURCE`, directly after the `window.addEventListener('unhandledrejection', …);` block, add:

```js
  // The board shows sleeping screens as pictures that never run code, so the
  // host asks for a copy of the rendered page with every script removed.
  window.__orionSnapshot = () => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll('script,meta[http-equiv]').forEach((node) => node.remove());
    root.querySelectorAll('*').forEach((node) => {
      for (const attribute of Array.from(node.attributes)) {
        if (/^on/i.test(attribute.name) || attribute.name === ${JSON.stringify(TAG_ATTRIBUTE)}) node.removeAttribute(attribute.name);
      }
    });
    return '<!doctype html>' + root.outerHTML;
  };
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.source !== ${JSON.stringify(HOST_MESSAGE_SOURCE)}) return;
    if (data.type === 'snapshot') post({ type: 'snapshot', html: window.__orionSnapshot() });
  });
  // Escape puts the live screen back to sleep, unless the screen used it.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) post({ type: 'escape' });
  });
```

`packages/screen-runtime/package.json` `exports` becomes:

```json
  "exports": {
    ".": "./src/index.ts",
    "./bridge": "./src/runtime/bridge.ts",
    "./constants": "./src/constants.ts",
    "./document": "./src/document.ts",
    "./source": "./src/source.ts"
  },
```

In `packages/screen-runtime/src/index.ts`, change the bridge line to:

```ts
export { FRAME_MESSAGE_SOURCE, HOST_MESSAGE_SOURCE } from "./runtime/bridge";
```

- [ ] **Step 4: Run the package**

Run: `pnpm --filter @meld/screen-runtime test && pnpm --filter @meld/screen-runtime typecheck && pnpm --filter @meld/screen-runtime lint`
Expected: all PASS (the existing `bridge.test.ts` cases are unchanged: the new listeners register under `message` and `keydown`, which those tests never call).

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/runtime/bridge.ts packages/screen-runtime/src/runtime/bridge.snapshot.test.ts packages/screen-runtime/src/index.ts packages/screen-runtime/package.json pnpm-lock.yaml
git commit -m "feat(screen-runtime): frame snapshots, Escape forwarding and browser-safe exports"
```

### Task L2: Parse live frame messages in the board

**Files:**
- Modify: `apps/web/src/features/canvas-excalidraw/board-persistence.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/live-messages.ts`
- Test: `apps/web/src/features/canvas-excalidraw/live/live-messages.test.ts`

**Interfaces:**
- Produces: `MAX_SCREEN_HTML_CHARS = 200_000` from `board-persistence.ts` (the existing `ScreenSchema` limit, now named).
- Produces from `live/live-messages.ts`:

```ts
export type LiveFrameMessage =
  | { source: "orion-frame"; type: "ready" } | { source: "orion-frame"; type: "stuck" }
  | { source: "orion-frame"; type: "escape" }
  | { source: "orion-frame"; type: "error"; message: string }
  | { source: "orion-frame"; type: "goto"; screenKey: string }
  | { source: "orion-frame"; type: "snapshot"; html: string };
export function parseLiveFrameMessage(event: { source: unknown; data: unknown }, frameWindow: unknown): LiveFrameMessage | null;
```

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/canvas-excalidraw/live/live-messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";
import { parseLiveFrameMessage } from "./live-messages";

const frame = {};
const from = (data: unknown, source: unknown = frame) => parseLiveFrameMessage({ source, data }, frame);

describe("parseLiveFrameMessage", () => {
  it("accepts every bridge message from the live frame", () => {
    for (const type of ["ready", "stuck", "escape"]) expect(from({ source: "orion-frame", type })).toEqual({ source: "orion-frame", type });
    expect(from({ source: "orion-frame", type: "error", message: "boom" })).toMatchObject({ type: "error", message: "boom" });
    expect(from({ source: "orion-frame", type: "goto", screenKey: "settings" })).toMatchObject({ type: "goto", screenKey: "settings" });
    expect(from({ source: "orion-frame", type: "snapshot", html: "<p>x</p>" })).toMatchObject({ type: "snapshot", html: "<p>x</p>" });
  });

  it("rejects other windows, no live frame, unknown shapes and oversized snapshots", () => {
    expect(from({ source: "orion-frame", type: "ready" }, {})).toBeNull();
    expect(parseLiveFrameMessage({ source: null, data: { source: "orion-frame", type: "ready" } }, null)).toBeNull();
    expect(from({ source: "other", type: "ready" })).toBeNull();
    expect(from({ source: "orion-frame", type: "ready", extra: 1 })).toBeNull();
    expect(from({ source: "orion-frame", type: "goto", screenKey: "Bad/Key" })).toBeNull();
    expect(from({ source: "orion-frame", type: "error", message: "x".repeat(501) })).toBeNull();
    expect(from({ source: "orion-frame", type: "snapshot", html: "x".repeat(MAX_SCREEN_HTML_CHARS + 1) })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-messages.test.ts`
Expected: FAIL — `MAX_SCREEN_HTML_CHARS` is not exported and `./live-messages` is missing.

- [ ] **Step 3: Implement**

In `board-persistence.ts`, add below `MAX_SAVED_BYTES`:

```ts
// One screen's stored HTML. A larger screen would make every board save fail,
// so anything that writes to the screen store must respect this.
export const MAX_SCREEN_HTML_CHARS = 200_000;
```

and change the schema line to `html: z.string().max(MAX_SCREEN_HTML_CHARS),`.

`apps/web/src/features/canvas-excalidraw/live/live-messages.ts`:

```ts
import { z } from "zod";
import { FRAME_MESSAGE_SOURCE } from "@meld/screen-runtime/bridge";
import { SCREEN_KEY } from "@meld/screen-runtime/constants";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";

const source = z.literal(FRAME_MESSAGE_SOURCE);
const LiveFrameMessageSchema = z.discriminatedUnion("type", [
  z.object({ source, type: z.literal("ready") }).strict(),
  z.object({ source, type: z.literal("stuck") }).strict(),
  z.object({ source, type: z.literal("escape") }).strict(),
  z.object({ source, type: z.literal("error"), message: z.string().max(500) }).strict(),
  z.object({ source, type: z.literal("goto"), screenKey: z.string().regex(SCREEN_KEY) }).strict(),
  z.object({ source, type: z.literal("snapshot"), html: z.string().max(MAX_SCREEN_HTML_CHARS) }).strict(),
]);

export type LiveFrameMessage = z.infer<typeof LiveFrameMessageSchema>;

// Only the one live frame may talk to the board, and only in these shapes.
export function parseLiveFrameMessage(event: { source: unknown; data: unknown }, frameWindow: unknown): LiveFrameMessage | null {
  if (!frameWindow || event.source !== frameWindow) return null;
  const parsed = LiveFrameMessageSchema.safeParse(event.data);
  return parsed.success ? parsed.data : null;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-messages.test.ts src/features/canvas-excalidraw/board-persistence.test.ts && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/board-persistence.ts apps/web/src/features/canvas-excalidraw/live/live-messages.ts apps/web/src/features/canvas-excalidraw/live/live-messages.test.ts
git commit -m "feat(canvas): validate messages from the live screen frame"
```

### Task L3: Compile in a worker; fetch the runtime once

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/compile-protocol.ts` + `compile-protocol.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/compile.worker.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/screen-compiler.ts` + `screen-compiler.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/runtime-bundle.ts` + `runtime-bundle.test.ts`

**Interfaces:**
- Produces:

```ts
// compile-protocol.ts (imports Babel through compileScreen; only the worker and the inline fallback load it)
export type CompileRequest = { id: number; source: ScreenSource; tagElements: boolean };
export type CompileResponse = { id: number; result: CompileResult };
export function handleCompileRequest(data: unknown): CompileResponse | null;

// screen-compiler.ts (no Babel import)
export type ScreenCompiler = { compile(source: ScreenSource, options: { tagElements: boolean }): Promise<CompileResult>; dispose(): void };
export type WorkerLike = Pick<Worker, "postMessage" | "addEventListener" | "terminate">;
export const COMPILER_STOPPED_MESSAGE = "The screen compiler stopped. Try again.";
export function createWorkerCompiler(makeWorker?: () => WorkerLike): ScreenCompiler;
export function createInlineCompiler(): ScreenCompiler;
export function createScreenCompiler(): ScreenCompiler; // worker when available

// runtime-bundle.ts
export const RUNTIME_BUNDLE_URL = "/screen-runtime/runtime.js";
export function loadRuntimeBundle(fetcher?: typeof fetch): Promise<string>;
export function resetRuntimeBundleForTests(): void;
```

- [ ] **Step 1: Write the failing tests**

`live/compile-protocol.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleCompileRequest } from "./compile-protocol";

const react = { kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };

describe("handleCompileRequest", () => {
  it("compiles a valid request", () => {
    const response = handleCompileRequest({ id: 3, source: react, tagElements: true });
    expect(response?.id).toBe(3);
    expect(response?.result.ok).toBe(true);
  });
  it("returns compile errors for an invalid source", () => {
    expect(handleCompileRequest({ id: 4, source: { ...react, entry: "Main.tsx" }, tagElements: false })).toEqual({
      id: 4, result: { ok: false, errors: [{ file: "", message: "The entry must be one of the files" }] },
    });
  });
  it("ignores messages that are not compile requests", () => {
    expect(handleCompileRequest({ id: "x" })).toBeNull();
    expect(handleCompileRequest(null)).toBeNull();
  });
});
```

`live/screen-compiler.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { COMPILER_STOPPED_MESSAGE, createInlineCompiler, createWorkerCompiler, type WorkerLike } from "./screen-compiler";

const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };

function fakeWorker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const worker = {
    postMessage: vi.fn(),
    addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => { handlers[type] = handler; }),
    terminate: vi.fn(),
  };
  return { worker: worker as unknown as WorkerLike, raw: worker, handlers };
}

describe("createWorkerCompiler", () => {
  it("matches replies to requests by id and creates the worker lazily", async () => {
    const fake = fakeWorker();
    const make = vi.fn(() => fake.worker);
    const compiler = createWorkerCompiler(make);
    expect(make).not.toHaveBeenCalled();
    const first = compiler.compile(source, { tagElements: true });
    const second = compiler.compile(source, { tagElements: false });
    expect(fake.raw.postMessage.mock.calls.map(([request]) => request)).toEqual([
      { id: 0, source, tagElements: true }, { id: 1, source, tagElements: false },
    ]);
    fake.handlers.message({ data: { id: 1, result: { ok: false, errors: [] } } });
    fake.handlers.message({ data: { id: 0, result: { ok: true, screen: "first" } } });
    await expect(first).resolves.toEqual({ ok: true, screen: "first" });
    await expect(second).resolves.toEqual({ ok: false, errors: [] });
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("rejects pending work when the worker crashes and starts a new one next time", async () => {
    const fakes = [fakeWorker(), fakeWorker()];
    const make = vi.fn(() => fakes[make.mock.calls.length - 1].worker);
    const compiler = createWorkerCompiler(make);
    const pending = compiler.compile(source, { tagElements: true });
    fakes[0].handlers.error({});
    await expect(pending).rejects.toThrow(COMPILER_STOPPED_MESSAGE);
    expect(fakes[0].raw.terminate).toHaveBeenCalled();
    void compiler.compile(source, { tagElements: true });
    expect(make).toHaveBeenCalledTimes(2);
  });
});

describe("createInlineCompiler", () => {
  it("compiles on the calling thread", async () => {
    await expect(createInlineCompiler().compile(source, { tagElements: false })).resolves.toMatchObject({ ok: true });
    await expect(createInlineCompiler().compile({ ...source, files: { "App.tsx": 'import x from "next/link"; export default x;' } }, { tagElements: false }))
      .resolves.toEqual({ ok: false, errors: [{ file: "App.tsx", message: "Unsupported package: next/link" }] });
  });
});
```

`live/runtime-bundle.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRuntimeBundle, resetRuntimeBundleForTests, RUNTIME_BUNDLE_URL } from "./runtime-bundle";

beforeEach(() => resetRuntimeBundleForTests());

describe("loadRuntimeBundle", () => {
  it("fetches the vendored runtime once", async () => {
    const fetcher = vi.fn(async () => new Response("/* runtime */"));
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("/* runtime */");
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("/* runtime */");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(RUNTIME_BUNDLE_URL);
  });
  it("retries after a failed fetch", async () => {
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(loadRuntimeBundle(fetcher)).rejects.toThrow("Could not load the screen runtime (500)");
    fetcher.mockResolvedValueOnce(new Response("ok"));
    await expect(loadRuntimeBundle(fetcher)).resolves.toBe("ok");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/compile-protocol.test.ts src/features/canvas-excalidraw/live/screen-compiler.test.ts src/features/canvas-excalidraw/live/runtime-bundle.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`live/compile-protocol.ts`:

```ts
import { z } from "zod";
import { compileScreen, type CompileResult } from "@meld/screen-runtime";
import { ScreenSourceSchema, type ScreenSource } from "@meld/screen-runtime/source";

export type CompileRequest = { id: number; source: ScreenSource; tagElements: boolean };
export type CompileResponse = { id: number; result: CompileResult };

const RequestSchema = z.object({ id: z.number().int().nonnegative(), source: z.unknown(), tagElements: z.boolean() }).strict();

export function handleCompileRequest(data: unknown): CompileResponse | null {
  const request = RequestSchema.safeParse(data);
  if (!request.success) return null;
  const { id, tagElements } = request.data;
  const source = ScreenSourceSchema.safeParse(request.data.source);
  if (!source.success) {
    return { id, result: { ok: false, errors: [{ file: "", message: source.error.issues[0]?.message ?? "This screen's files are not valid" }] } };
  }
  try {
    return { id, result: compileScreen(source.data, { tagElements }) };
  } catch (error) {
    return { id, result: { ok: false, errors: [{ file: "", message: error instanceof Error ? error.message : String(error) }] } };
  }
}
```

`live/compile.worker.ts`:

```ts
import { handleCompileRequest } from "./compile-protocol";

// Babel runs here, off the board's thread. The worker is created the first
// time a screen goes live or code is pasted, then reused.
globalThis.addEventListener("message", (event: MessageEvent) => {
  const response = handleCompileRequest(event.data);
  if (response) globalThis.postMessage(response);
});
```

`live/screen-compiler.ts`:

```ts
import type { CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { CompileRequest, CompileResponse } from "./compile-protocol";

export type ScreenCompiler = {
  compile(source: ScreenSource, options: { tagElements: boolean }): Promise<CompileResult>;
  dispose(): void;
};
export type WorkerLike = Pick<Worker, "postMessage" | "addEventListener" | "terminate">;
export const COMPILER_STOPPED_MESSAGE = "The screen compiler stopped. Try again.";

type Pending = { resolve: (result: CompileResult) => void; reject: (error: Error) => void };

export function createWorkerCompiler(
  makeWorker: () => WorkerLike = () => new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" }),
): ScreenCompiler {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  const pending = new Map<number, Pending>();
  const failAll = (message: string) => {
    for (const entry of pending.values()) entry.reject(new Error(message));
    pending.clear();
  };
  function ensure(): WorkerLike {
    if (worker) return worker;
    const created = makeWorker();
    created.addEventListener("message", (event: MessageEvent<CompileResponse>) => {
      const entry = pending.get(event.data?.id);
      if (!entry) return;
      pending.delete(event.data.id);
      entry.resolve(event.data.result);
    });
    created.addEventListener("error", () => {
      failAll(COMPILER_STOPPED_MESSAGE);
      created.terminate();
      if (worker === created) worker = null;
    });
    worker = created;
    return created;
  }
  return {
    compile(source, options) {
      const target = ensure();
      const request: CompileRequest = { id: nextId++, source, tagElements: options.tagElements };
      return new Promise<CompileResult>((resolve, reject) => {
        pending.set(request.id, { resolve, reject });
        target.postMessage(request);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll("The screen compiler was closed.");
    },
  };
}

// Tests and environments without Worker compile on the calling thread.
export function createInlineCompiler(): ScreenCompiler {
  let nextId = 0;
  return {
    async compile(source, options) {
      const { handleCompileRequest } = await import("./compile-protocol");
      const response = handleCompileRequest({ id: nextId++, source, tagElements: options.tagElements });
      return response ? response.result : { ok: false, errors: [{ file: "", message: "This screen could not be compiled." }] };
    },
    dispose() {},
  };
}

export function createScreenCompiler(): ScreenCompiler {
  return typeof Worker === "undefined" ? createInlineCompiler() : createWorkerCompiler();
}
```

`live/runtime-bundle.ts`:

```ts
// The vendored React/Lucide/clsx/Tailwind runtime (Plan 1, Task B8), served
// from apps/web/public. It is inlined into every live document so the frame
// never fetches anything (FRAME_CSP blocks the network anyway).
export const RUNTIME_BUNDLE_URL = "/screen-runtime/runtime.js";

let cached: Promise<string> | null = null;

export function loadRuntimeBundle(fetcher: typeof fetch = fetch): Promise<string> {
  cached ??= fetcher(RUNTIME_BUNDLE_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load the screen runtime (${response.status})`);
      return response.text();
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

export function resetRuntimeBundleForTests(): void {
  cached = null;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint`
Expected: PASS. If typecheck rejects `globalThis.postMessage(response)` in the worker, write `(globalThis as unknown as { postMessage(message: unknown): void }).postMessage(response)`; do not add the `webworker` lib to the app tsconfig.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/compile-protocol.ts apps/web/src/features/canvas-excalidraw/live/compile-protocol.test.ts apps/web/src/features/canvas-excalidraw/live/compile.worker.ts apps/web/src/features/canvas-excalidraw/live/screen-compiler.ts apps/web/src/features/canvas-excalidraw/live/screen-compiler.test.ts apps/web/src/features/canvas-excalidraw/live/runtime-bundle.ts apps/web/src/features/canvas-excalidraw/live/runtime-bundle.test.ts
git commit -m "feat(canvas): compile screens in a worker and load the runtime once"
```

### Task L4: Where a live screen's source comes from, and pictures for source screens

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/live-source.ts` + `live-source.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/placeholder.ts` + `placeholder.test.ts`
- Modify: `apps/web/src/features/design/canvas-screen-reader.ts` + `canvas-screen-reader.test.ts`

**Interfaces:**
- Consumes: `readScreenSource` / `LoadedScreenSource` from `@/features/design/canvas-screen-source` (Plan 1), `ScreenStore` from `../screen-store`.
- Produces:

```ts
// live-source.ts
export type LiveSource = { source: ScreenSource; snapshot: boolean };
export function designScreenIdFromBoardId(boardScreenId: string): string | null; // inverse of boardScreenId()
export function resolveLiveSource(boardScreenId: string, deps: {
  roomId: string | null; store: Pick<ScreenStore, "get">; readSource: typeof readScreenSource;
}): Promise<LiveSource | null>;

// placeholder.ts
export function sleepingPlaceholder(name: string): string;
export function sleepingDocument(screen: { name: string; sourceKind?: "html" | "react" }, legacy: () => string | null): string | null;

// canvas-screen-reader.ts: CanvasScreen gains
sourceKind?: "html" | "react"; // absent means a legacy markup/styles/script version
```

- [ ] **Step 1: Write the failing tests**

`live/live-source.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { designScreenIdFromBoardId, resolveLiveSource } from "./live-source";

const UUID = "e5000000-0000-4000-8000-000000000001";
const VERSION = "e6000000-0000-4000-8000-000000000001";
const react = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const store = (html?: string) => ({ get: vi.fn(() => (html ? { id: `ds-${UUID}`, rev: 1, html } : undefined)) });

describe("designScreenIdFromBoardId", () => {
  it("reads the design screen id from a board screen id", () => {
    expect(designScreenIdFromBoardId(`ds-${UUID}`)).toBe(UUID);
    expect(designScreenIdFromBoardId("welcome")).toBeNull();
    expect(designScreenIdFromBoardId(`ds-${UUID}x`)).toBeNull();
  });
});

describe("resolveLiveSource", () => {
  it("uses the stored source of a react or html design screen and keeps its picture fresh", async () => {
    const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "mobile" as const, legacy: false as const, source: react, links: [] } }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<p>pic</p>"), readSource }))
      .resolves.toEqual({ source: react, snapshot: true });
    expect(readSource).toHaveBeenCalledWith(UUID);
  });

  it("runs a legacy design screen from its board HTML and never overwrites it", async () => {
    const readSource = vi.fn(async () => ({ status: "ok" as const, screen: { screenId: UUID, versionId: VERSION, formFactor: "desktop" as const, legacy: true as const } }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<h1>Old</h1>"), readSource }))
      .resolves.toEqual({ source: { kind: "html", files: { "index.html": "<h1>Old</h1>" }, entry: "index.html" }, snapshot: false });
  });

  it("runs a board-only screen from its HTML without asking the server", async () => {
    const readSource = vi.fn();
    await expect(resolveLiveSource("welcome", { roomId: null, store: store("<h1>Hi</h1>"), readSource }))
      .resolves.toMatchObject({ snapshot: false, source: { kind: "html" } });
    expect(readSource).not.toHaveBeenCalled();
  });

  it("gives up when the server read fails or there is nothing stored", async () => {
    const readSource = vi.fn(async () => ({ status: "error" as const }));
    await expect(resolveLiveSource(`ds-${UUID}`, { roomId: "room", store: store("<p>pic</p>"), readSource })).resolves.toBeNull();
    await expect(resolveLiveSource("welcome", { roomId: null, store: store(), readSource })).resolves.toBeNull();
  });
});
```

`live/placeholder.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { sleepingDocument, sleepingPlaceholder } from "./placeholder";

describe("sleepingPlaceholder", () => {
  it("names the screen, escapes it and has no script", () => {
    const html = sleepingPlaceholder('<b>"Plans"</b>');
    expect(html).toContain("&#60;b&#62;&#34;Plans&#34;&#60;/b&#62;");
    expect(html).toContain("Double-click to open");
    expect(html).not.toContain("<script");
  });
});

describe("sleepingDocument", () => {
  it("uses the placeholder for source screens and the legacy document otherwise", () => {
    const legacy = vi.fn(() => "<legacy>");
    expect(sleepingDocument({ name: "Today", sourceKind: "react" }, legacy)).toContain("Today");
    expect(legacy).not.toHaveBeenCalled();
    expect(sleepingDocument({ name: "Old" }, legacy)).toBe("<legacy>");
  });
});
```

Add to `canvas-screen-reader.test.ts`, inside `describe("listRoomCanvasScreens", …)`:

```ts
  it("marks screens whose current version is a react or html source", async () => {
    const { versionQuery } = withRows([screenRows[0]], [{ ...versionRows[0], markup: "", styles: "", source_kind: "react" }]);
    const [screen] = await listRoomCanvasScreens(ROOM_ID);
    expect(screen.sourceKind).toBe("react");
    expect(versionQuery.select).toHaveBeenCalledWith("id,screen_id,markup,styles,script,actions_json,source_kind");
  });

  it("leaves legacy screens without a source kind", async () => {
    withRows([screenRows[0]], [{ ...versionRows[0], source_kind: "legacy" }]);
    const [screen] = await listRoomCanvasScreens(ROOM_ID);
    expect(screen).not.toHaveProperty("sourceKind");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-source.test.ts src/features/canvas-excalidraw/live/placeholder.test.ts src/features/design/canvas-screen-reader.test.ts`
Expected: FAIL — missing modules, and the reader's strict version schema rejects `source_kind`.

- [ ] **Step 3: Implement**

`live/live-source.ts`:

```ts
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { readScreenSource } from "@/features/design/canvas-screen-source";
import type { ScreenStore } from "../screen-store";

// `snapshot`: whether the board may replace the stored picture with a copy of
// the running page. Only true for screens whose source lives in the screen
// store; legacy and board-only HTML is the source itself (the Preview route
// runs it with scripts), so it is never overwritten.
export type LiveSource = { source: ScreenSource; snapshot: boolean };

const BOARD_DESIGN_ID = /^ds-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function designScreenIdFromBoardId(boardScreenId: string): string | null {
  return BOARD_DESIGN_ID.exec(boardScreenId)?.[1] ?? null;
}

export async function resolveLiveSource(boardScreenId: string, deps: {
  roomId: string | null;
  store: Pick<ScreenStore, "get">;
  readSource: typeof readScreenSource;
}): Promise<LiveSource | null> {
  const designId = designScreenIdFromBoardId(boardScreenId);
  if (designId && deps.roomId) {
    const read = await deps.readSource(designId);
    if (read.status !== "ok") return null;
    if (!read.screen.legacy) return { source: read.screen.source, snapshot: true };
  }
  const html = deps.store.get(boardScreenId)?.html;
  if (!html) return null;
  // Legacy and board-only screens run from the HTML the board already has.
  // Nothing is saved here: conversion into an html design screen happens on
  // the first edit (Plan 3).
  return { source: { kind: "html", files: { "index.html": html }, entry: "index.html" }, snapshot: false };
}
```

`live/placeholder.ts`:

```ts
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Shown for a react/html screen until it has been opened live once on this
// board (its picture is a snapshot of the running page). Static: thumbnails
// never run code. System colours only, so it reads in light and dark.
export function sleepingPlaceholder(name: string): string {
  return "<!doctype html><style>html,body{margin:0;height:100%}"
    + "body{display:grid;place-items:center;font-family:system-ui,sans-serif;color:GrayText;background:Canvas;text-align:center}</style>"
    + `<main><p><strong>${escapeHtml(name)}</strong></p><p>Double-click to open</p></main>`;
}

export function sleepingDocument(
  screen: { name: string; sourceKind?: "html" | "react" },
  legacy: () => string | null,
): string | null {
  return screen.sourceKind ? sleepingPlaceholder(screen.name) : legacy();
}
```

In `apps/web/src/features/design/canvas-screen-reader.ts`:
1. Add to `CanvasScreenVersionRowSchema` (inside the `.object({ … })`): `source_kind: z.enum(["legacy", "html", "react"]).default("legacy"),`
2. Add to the `CanvasScreen` type, after `formFactor`:

```ts
  // Set when the current version stores React or HTML source files (canvas
  // powers). Absent for legacy markup/styles/script versions. The legacy
  // `preview` of a source screen is empty, so callers that draw pictures
  // must check this first.
  sourceKind?: "html" | "react";
```

3. Change the versions `.select(...)` to `.select("id,screen_id,markup,styles,script,actions_json,source_kind")`.
4. In the `screens.data.map(...)` return object, after `formFactor: screen.form_factor,` add:

```ts
          ...(version?.screen_id === screen.id && version.source_kind !== "legacy"
            ? { sourceKind: version.source_kind }
            : {}),
```

The e2e fake (`fakeListRoomCanvasScreens`) needs no change: it only holds legacy screens, and the field is optional.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live src/features/design/canvas-screen-reader.test.ts && pnpm --filter @meld/web typecheck`
Expected: PASS (existing reader `toEqual` assertions still pass because legacy screens get no `sourceKind` key).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/live-source.ts apps/web/src/features/canvas-excalidraw/live/live-source.test.ts apps/web/src/features/canvas-excalidraw/live/placeholder.ts apps/web/src/features/canvas-excalidraw/live/placeholder.test.ts apps/web/src/features/design/canvas-screen-reader.ts apps/web/src/features/design/canvas-screen-reader.test.ts
git commit -m "feat(canvas): resolve live sources and give source screens a picture"
```

### Task L5: Live controller (timers, compile, frame messages, snapshots)

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/live-controller.ts`
- Test: `apps/web/src/features/canvas-excalidraw/live/live-controller.test.ts`

**Interfaces:**
- Consumes: `liveReducer`, `ASLEEP`, `LiveState` (0d); `parseLiveFrameMessage` (L2); `LiveSource` (L4); `assembleScreenDocument` from `@meld/screen-runtime/document`, `HOST_MESSAGE_SOURCE` from `@meld/screen-runtime/bridge` (L1); `FRAME_CSP` from `../frame-document`.
- Produces:

```ts
export const READY_TIMEOUT_MS = 5000;
export const SNAPSHOT_DELAY_MS = 400;
export const SLEEP_SNAPSHOT_WAIT_MS = 300;
export const LOAD_FAILED_MESSAGE = "This screen could not be loaded.";
export type LiveDeps = {
  loadSource: (boardScreenId: string) => Promise<LiveSource | null>;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  runtimeBundle: () => Promise<string>;
  onSnapshot: (boardScreenId: string, html: string) => void;
  onSleep?: () => void;
};
export type LiveController = {
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  wake(boardScreenId: string, preloaded?: LiveSource): Promise<void>;
  sleep(): Promise<void>;
  reload(): void;
  attachFrame(frame: Window | null): void;
  handleMessage(event: { source: unknown; data: unknown }): void;
  dispose(): void;
};
export function createLiveController(deps: LiveDeps): LiveController;
```

- [ ] **Step 1: Write the failing test**

`live/live-controller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompileResult } from "@meld/screen-runtime";
import { createLiveController, LOAD_FAILED_MESSAGE, READY_TIMEOUT_MS, SLEEP_SNAPSHOT_WAIT_MS, SNAPSHOT_DELAY_MS, type LiveDeps } from "./live-controller";

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
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-controller.test.ts`
Expected: FAIL with `Cannot find module './live-controller'`.

- [ ] **Step 3: Implement**

`live/live-controller.ts`:

```ts
import type { CompileResult } from "@meld/screen-runtime";
import { HOST_MESSAGE_SOURCE } from "@meld/screen-runtime/bridge";
import { assembleScreenDocument } from "@meld/screen-runtime/document";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { FRAME_CSP } from "../frame-document";
import { parseLiveFrameMessage } from "./live-messages";
import type { LiveSource } from "./live-source";
import { ASLEEP, liveReducer, type LiveEvent, type LiveState } from "./live-state";

export const READY_TIMEOUT_MS = 5000;
export const SNAPSHOT_DELAY_MS = 400;
export const SLEEP_SNAPSHOT_WAIT_MS = 300;
export const LOAD_FAILED_MESSAGE = "This screen could not be loaded.";

export type LiveDeps = {
  loadSource: (boardScreenId: string) => Promise<LiveSource | null>;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  runtimeBundle: () => Promise<string>;
  onSnapshot: (boardScreenId: string, html: string) => void;
  onSleep?: () => void;
};

export type LiveController = {
  getState(): LiveState;
  subscribe(listener: () => void): () => void;
  wake(boardScreenId: string, preloaded?: LiveSource): Promise<void>;
  sleep(): Promise<void>;
  reload(): void;
  attachFrame(frame: Window | null): void;
  handleMessage(event: { source: unknown; data: unknown }): void;
  dispose(): void;
};

// Owns the board's one live screen: compiling, the ready timeout, frame
// messages and the snapshot that becomes the sleeping picture. React reads it
// through useSyncExternalStore (FrameHost, the board).
export function createLiveController(deps: LiveDeps): LiveController {
  let state: LiveState = ASLEEP;
  let frame: Window | null = null;
  let snapshots = false;
  let snapshotArrived: (() => void) | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const requestSnapshot = () => {
    if (snapshots && frame) frame.postMessage({ source: HOST_MESSAGE_SOURCE, type: "snapshot" }, "*");
  };

  function dispatch(event: LiveEvent) {
    const previous = state;
    state = liveReducer(state, event);
    if (state === previous) return;
    if (state.phase !== "loading") clearTimeout(readyTimer);
    else if (previous.phase !== "loading" || previous.attempt !== state.attempt) {
      clearTimeout(readyTimer);
      const attempt = state.attempt;
      readyTimer = setTimeout(() => dispatch({ type: "ready-timeout", attempt }), READY_TIMEOUT_MS);
    }
    if (state.phase !== "running") clearTimeout(snapshotTimer);
    else if (previous.phase !== "running") snapshotTimer = setTimeout(requestSnapshot, SNAPSHOT_DELAY_MS);
    listeners.forEach((listener) => listener());
  }

  async function sleep() {
    if (state.phase === "asleep") return;
    if (state.phase === "running" && snapshots && frame) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, SLEEP_SNAPSHOT_WAIT_MS);
        function done() {
          clearTimeout(timer);
          if (snapshotArrived === done) snapshotArrived = null;
          resolve();
        }
        snapshotArrived = done;
        requestSnapshot();
      });
    }
    if (state.phase === "asleep") return;
    dispatch({ type: "sleep" });
    deps.onSleep?.();
  }

  async function wake(boardScreenId: string, preloaded?: LiveSource) {
    if (state.phase !== "asleep" && state.screenId !== boardScreenId) await sleep();
    const before = state;
    dispatch({ type: "wake", screenId: boardScreenId });
    if (state === before || state.phase !== "compiling") return;
    const attempt = state.attempt;
    const fail = (source: ScreenSource | null, message: string) =>
      dispatch({ type: "compile-failed", attempt, source, errors: [{ file: "", message }] });
    try {
      const loaded = preloaded ?? await deps.loadSource(boardScreenId);
      if (!loaded) { fail(null, LOAD_FAILED_MESSAGE); return; }
      const [result, runtimeBundle] = await Promise.all([deps.compile(loaded.source), deps.runtimeBundle()]);
      if (!result.ok) {
        dispatch({ type: "compile-failed", attempt, source: loaded.source, errors: result.errors });
        return;
      }
      if (state.phase === "compiling" && state.attempt === attempt) snapshots = loaded.snapshot;
      dispatch({
        type: "compiled", attempt, source: loaded.source,
        document: assembleScreenDocument(result.screen, { csp: FRAME_CSP, runtimeBundle }),
      });
    } catch (error) {
      fail(preloaded?.source ?? null, error instanceof Error ? error.message : LOAD_FAILED_MESSAGE);
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    wake,
    sleep,
    reload: () => dispatch({ type: "reload" }),
    attachFrame(next) { frame = next; },
    handleMessage(event) {
      const message = parseLiveFrameMessage(event, frame);
      if (!message || state.phase === "asleep") return;
      const screenId = state.screenId;
      switch (message.type) {
        case "ready": dispatch({ type: "frame-ready" }); break;
        case "error": dispatch({ type: "frame-error", message: message.message }); break;
        case "stuck": dispatch({ type: "frame-stuck" }); break;
        case "escape": void sleep(); break;
        case "snapshot":
          if (snapshots) deps.onSnapshot(screenId, message.html);
          snapshotArrived?.();
          break;
        // Clicking through to another screen arrives with Star links (Plan 5).
        case "goto": break;
      }
    },
    dispose() {
      // Subscribers stay: React StrictMode cleans effects up and re-runs them
      // on the same controller.
      clearTimeout(readyTimer);
      clearTimeout(snapshotTimer);
      frame = null;
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/live-controller.ts apps/web/src/features/canvas-excalidraw/live/live-controller.test.ts
git commit -m "feat(canvas): live screen controller with ready timeout and snapshots"
```

### Task L6: `FrameHost` renders the live frame, the waking spinner and the stopped overlay

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/stopped-overlay.tsx` + `stopped-overlay.test.tsx`
- Modify: `apps/web/src/features/canvas-excalidraw/frame-host.tsx` + `frame-host.test.tsx`

**Interfaces:**
- Consumes: `LiveController` (L5), `liveViewFor`, `ASLEEP`, `StopReason` (0d), `FRAME_SANDBOX`, `BOARD_FRAME_SANDBOX`, `buildBoardFrameDocument` from `frame-document.ts`.
- Produces:
  - `StoppedOverlay({ reason, detail, onReload, onShowCode? }: { reason: StopReason; detail: string | null; onReload: () => void; onShowCode?: () => void })`
  - `FrameHost({ screenId, store, live?, onShowCode? })`. The live iframe carries `data-orion-live={screenId}`; thumbnails keep `data-orion-frame={screenId}`.

- [ ] **Step 1: Write the failing tests**

`live/stopped-overlay.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoppedOverlay } from "./stopped-overlay";

afterEach(cleanup);

describe("StoppedOverlay", () => {
  it("says the screen stopped responding and offers Reload and Show code", async () => {
    const onReload = vi.fn();
    const onShowCode = vi.fn();
    render(<StoppedOverlay reason="stuck" detail={null} onReload={onReload} onShowCode={onShowCode} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This screen stopped responding");
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await userEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(onReload).toHaveBeenCalledOnce();
    expect(onShowCode).toHaveBeenCalledOnce();
  });

  it("names a start-up error instead", () => {
    render(<StoppedOverlay reason="crashed" detail="x is not defined" onReload={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This screen hit an error");
    expect(screen.getByText("x is not defined")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show code" })).toBeNull();
  });
});
```

Replace `frame-host.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameHost } from "./frame-host";
import type { LiveController } from "./live/live-controller";
import type { LiveState } from "./live/live-state";
import { createScreenStore } from "./screen-store";

afterEach(cleanup);

const source = { kind: "react" as const, files: { "App.tsx": "x" }, entry: "App.tsx" };

function fakeLive(state: LiveState) {
  return {
    getState: () => state,
    subscribe: () => () => {},
    attachFrame: vi.fn(),
    reload: vi.fn(),
  } as unknown as LiveController & { attachFrame: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
}

function setup(live?: LiveController, onShowCode?: () => void) {
  const store = createScreenStore();
  store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
  const view = render(<FrameHost screenId="welcome" store={store} live={live} onShowCode={onShowCode} />);
  return { container: view.container };
}

describe("FrameHost", () => {
  it("renders a static page with scripts disabled", () => {
    const iframe = setup().container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("script-src 'none'");
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
    expect(iframe.style.pointerEvents).toBe("none");
  });

  it("shows the thumbnail with a spinner while the screen wakes", () => {
    setup(fakeLive({ phase: "compiling", screenId: "welcome", attempt: 1 }));
    expect(screen.getByText("Opening screen…")).toBeInTheDocument();
    expect(document.querySelector("iframe[data-orion-frame='welcome']")).not.toBeNull();
  });

  it("runs the live document with scripts and pointer events, and reports its window", () => {
    const live = fakeLive({ phase: "running", screenId: "welcome", attempt: 2, source, document: "<p>live</p>", errors: [] });
    const iframe = setup(live).container.querySelector("iframe[data-orion-live='welcome']") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toBe("<p>live</p>");
    expect(iframe.style.pointerEvents).toBe("auto");
    expect(live.attachFrame).toHaveBeenCalledWith(iframe.contentWindow);
  });

  it("keeps other screens as pictures while one is live", () => {
    setup(fakeLive({ phase: "running", screenId: "other", attempt: 1, source, document: "<p>live</p>", errors: [] }));
    expect(document.querySelector("iframe[data-orion-live]")).toBeNull();
  });

  it("replaces a stuck frame with the overlay", async () => {
    const live = fakeLive({ phase: "stopped", reason: "stuck", screenId: "welcome", attempt: 1, source, document: "<p>live</p>", errors: [] });
    const onShowCode = vi.fn();
    setup(live, onShowCode);
    expect(document.querySelector("iframe")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await userEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(live.reload).toHaveBeenCalledOnce();
    expect(onShowCode).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-host.test.tsx src/features/canvas-excalidraw/live/stopped-overlay.test.tsx`
Expected: FAIL — `./live/stopped-overlay` is missing and `FrameHost` ignores `live`.

- [ ] **Step 3: Implement**

`live/stopped-overlay.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { StopReason } from "./live-state";

// Replaces a live frame that hung or crashed. The frame is unmounted, so its
// timers stop too. Excalidraw disables pointer events on embeddables that are
// not "active", so the overlay turns them back on for its buttons.
export function StoppedOverlay({ reason, detail, onReload, onShowCode }: {
  reason: StopReason;
  detail: string | null;
  onReload: () => void;
  onShowCode?: () => void;
}) {
  const crashed = reason === "crashed";
  return (
    <VStack
      role="alert"
      height="100%"
      justify="center"
      align="center"
      gap={2}
      padding={4}
      style={{ pointerEvents: "auto", background: "var(--color-background-surface)" }}
    >
      <Text type="label">{crashed ? "This screen hit an error" : "This screen stopped responding"}</Text>
      {crashed && detail ? <Text type="supporting" maxLines={3}>{detail}</Text> : null}
      <HStack gap={2}>
        <Button label="Reload" size="sm" variant="primary" onClick={onReload} />
        {onShowCode ? <Button label="Show code" size="sm" variant="ghost" onClick={onShowCode} /> : null}
      </HStack>
    </VStack>
  );
}
```

Replace `frame-host.tsx` with:

```tsx
"use client";

import { useMemo, useSyncExternalStore } from "react";
import { Overlay } from "@astryxdesign/core/Overlay";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { buildBoardFrameDocument, BOARD_FRAME_SANDBOX, FRAME_SANDBOX } from "./frame-document";
import type { LiveController } from "./live/live-controller";
import { ASLEEP, liveViewFor } from "./live/live-state";
import { StoppedOverlay } from "./live/stopped-overlay";
import type { ScreenStore } from "./screen-store";

const noSubscribe = () => () => {};
const frameStyle = { width: "100%", height: "100%", border: 0, background: "var(--color-background-surface)" } as const;

export function FrameHost({ screenId, store, live, onShowCode }: {
  screenId: string;
  store: ScreenStore;
  live?: LiveController;
  onShowCode?: () => void;
}) {
  const screen = useSyncExternalStore(store.subscribe, () => store.get(screenId), () => undefined);
  const liveState = useSyncExternalStore(live?.subscribe ?? noSubscribe, () => live?.getState() ?? ASLEEP, () => ASLEEP);
  const view = liveViewFor(liveState, screenId);
  const document = useMemo(() => (screen ? buildBoardFrameDocument(screen.html) : ""), [screen]);

  if (live && view.mode === "live") {
    return (
      <iframe
        key={view.attempt}
        title={`Live screen ${screenId}`}
        data-orion-live={screenId}
        sandbox={FRAME_SANDBOX}
        srcDoc={view.document}
        ref={(frame) => live.attachFrame(frame?.contentWindow ?? null)}
        style={{ ...frameStyle, pointerEvents: "auto", outline: "var(--spacing-0-5) solid var(--color-accent)" }}
      />
    );
  }
  if (live && view.mode === "stopped") {
    return <StoppedOverlay reason={view.reason} detail={view.detail} onReload={() => live.reload()} onShowCode={onShowCode} />;
  }
  const thumbnail = screen ? (
    <iframe
      title={`Screen ${screenId}`}
      data-orion-frame={screenId}
      sandbox={BOARD_FRAME_SANDBOX}
      srcDoc={document}
      style={{ ...frameStyle, pointerEvents: "none" }}
    />
  ) : <Text>Loading screen…</Text>;
  if (view.mode === "waking") {
    return (
      <Overlay content={<Spinner label="Opening screen…" />} align="center" style={{ width: "100%", height: "100%" }}>
        {thumbnail}
      </Overlay>
    );
  }
  return thumbnail;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-host.test.tsx src/features/canvas-excalidraw/live && pnpm --filter @meld/web typecheck && pnpm check:astryx`
Expected: PASS. If `Spinner`'s visible label renders twice (visible text plus `aria-label`), use `screen.getAllByText("Opening screen…")[0]` in the test rather than changing the component.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/frame-host.tsx apps/web/src/features/canvas-excalidraw/frame-host.test.tsx apps/web/src/features/canvas-excalidraw/live/stopped-overlay.tsx apps/web/src/features/canvas-excalidraw/live/stopped-overlay.test.tsx
git commit -m "feat(canvas): live frame, waking spinner and stopped overlay in FrameHost"
```

### Task L7: Right-hand panel shell + read-only Code view (Plan 3's seam)

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/live-panel.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/live/live-panel.test.tsx`

**Interfaces:**
- Consumes: `LiveIssue` (0d), `ScreenSource`.
- Produces:

```ts
export type LivePanelTab = "code" | "tweak";
export const LIVE_PANEL_TABS: readonly { value: LivePanelTab; label: string }[]; // Plan 2: [{ value: "code", label: "Code" }]
export const LIVE_PANEL_WIDTH = 280;
export function LivePanel(props: { title: string; tab: LivePanelTab; onTabChange: (tab: LivePanelTab) => void; onClose: () => void; tabs?: readonly { value: LivePanelTab; label: string }[]; children: ReactNode }): JSX.Element;
export function LiveCodeView(props: { source: ScreenSource | null; issues: readonly LiveIssue[] }): JSX.Element;
export function codeLanguageFor(path: string): "javascript" | "html" | "css" | "plaintext";
```

**Seam for Plan 3:** Plan 3 adds `{ value: "tweak", label: "Tweak" }` to `LIVE_PANEL_TABS` (the tab list appears automatically once there are two) and replaces `LiveCodeView` with the CodeMirror editor as the `code` tab's children. Nothing else in the board changes.

- [ ] **Step 1: Write the failing test**

`live/live-panel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Layout } from "@astryxdesign/core/Layout";
import { codeLanguageFor, LiveCodeView, LivePanel } from "./live-panel";

afterEach(cleanup);

const source = { kind: "react" as const, files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" };

describe("LivePanel", () => {
  it("shows its content without a tab list while there is one tab, and closes", async () => {
    const onClose = vi.fn();
    render(<Layout end={<LivePanel title="Screen code" tab="code" onTabChange={vi.fn()} onClose={onClose}><p>body</p></LivePanel>} />);
    expect(screen.getByText("Screen code")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows tabs once Plan 3 adds a second one", async () => {
    const onTabChange = vi.fn();
    render(<Layout end={(
      <LivePanel title="Screen" tab="code" onTabChange={onTabChange} onClose={vi.fn()}
        tabs={[{ value: "tweak", label: "Tweak" }, { value: "code", label: "Code" }]}><p>body</p></LivePanel>
    )} />);
    await userEvent.click(screen.getByRole("tab", { name: "Tweak" }));
    expect(onTabChange).toHaveBeenCalledWith("tweak");
  });
});

describe("LiveCodeView", () => {
  it("lists problems and shows each file", () => {
    render(<LiveCodeView source={source} issues={[{ file: "App.tsx", message: "Unsupported package: next" }, { file: null, message: "boom" }]} />);
    expect(screen.getByText("This screen has 2 problems")).toBeInTheDocument();
    expect(screen.getByText("Unsupported package: next")).toBeInTheDocument();
    expect(screen.getAllByText("App.tsx").length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("return <main>Hi</main>");
  });

  it("explains when there is no source", () => {
    render(<LiveCodeView source={null} issues={[]} />);
    expect(screen.getByText("The code for this screen isn't available.")).toBeInTheDocument();
  });

  it("picks a highlighting language from the file name", () => {
    expect(codeLanguageFor("App.tsx")).toBe("javascript");
    expect(codeLanguageFor("index.html")).toBe("html");
    expect(codeLanguageFor("styles.css")).toBe("css");
    expect(codeLanguageFor("notes.md")).toBe("plaintext");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-panel.test.tsx`
Expected: FAIL with `Cannot find module './live-panel'`.

- [ ] **Step 3: Implement**

`live/live-panel.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { HStack } from "@astryxdesign/core/HStack";
import { LayoutPanel } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { LiveIssue } from "./live-state";

export type LivePanelTab = "code" | "tweak";
// Plan 3 adds Tweak here and swaps the Code tab's content for the editor.
export const LIVE_PANEL_TABS: readonly { value: LivePanelTab; label: string }[] = [{ value: "code", label: "Code" }];
export const LIVE_PANEL_WIDTH = 280;

export function LivePanel({ title, tab, onTabChange, onClose, tabs = LIVE_PANEL_TABS, children }: {
  title: string;
  tab: LivePanelTab;
  onTabChange: (tab: LivePanelTab) => void;
  onClose: () => void;
  tabs?: readonly { value: LivePanelTab; label: string }[];
  children: ReactNode;
}) {
  return (
    <LayoutPanel width={LIVE_PANEL_WIDTH} hasDivider padding={3} label="Live screen">
      <VStack gap={3} data-testid="live-panel">
        <HStack gap={2} align="center" justify="between">
          <Text type="label">{title}</Text>
          <Button label="Close" size="sm" variant="ghost" onClick={onClose} />
        </HStack>
        {tabs.length > 1 ? (
          <TabList value={tab} onChange={(value) => onTabChange(value as LivePanelTab)} size="sm" hasDivider>
            {tabs.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
          </TabList>
        ) : null}
        {children}
      </VStack>
    </LayoutPanel>
  );
}

export function codeLanguageFor(path: string): "javascript" | "html" | "css" | "plaintext" {
  if (/\.(tsx?|jsx?)$/.test(path)) return "javascript";
  if (/\.html?$/.test(path)) return "html";
  if (path.endsWith(".css")) return "css";
  return "plaintext";
}

// Plan 2's Code tab: what went wrong, and the source to read and copy.
export function LiveCodeView({ source, issues }: { source: ScreenSource | null; issues: readonly LiveIssue[] }) {
  return (
    <VStack gap={3}>
      {issues.length ? (
        <VStack gap={1}>
          <Banner status="error" title={issues.length === 1 ? "This screen has a problem" : `This screen has ${issues.length} problems`} />
          <List density="compact">
            {issues.map((issue, index) => (
              <ListItem key={`${index}-${issue.message}`} label={issue.message} description={issue.file ?? undefined} />
            ))}
          </List>
        </VStack>
      ) : null}
      {source ? Object.entries(source.files).map(([path, code]) => (
        <CodeBlock key={path} title={path} code={code} language={codeLanguageFor(path)} size="sm" width="100%" isWrapped maxHeight="60vh" />
      )) : <Text type="supporting">The code for this screen isn&apos;t available.</Text>}
    </VStack>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-panel.test.tsx && pnpm --filter @meld/web typecheck && pnpm check:astryx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/live-panel.tsx apps/web/src/features/canvas-excalidraw/live/live-panel.test.tsx
git commit -m "feat(canvas): live screen panel with a read-only Code tab"
```

### Task L8: Hit testing and pill actions for live screens

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/live/live-hit.ts` + `live-hit.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/live/live-actions.ts` + `live-actions.test.ts`

**Interfaces:**
- Consumes: `screenIdFromLink` (`../frame-link`), `SelectionSummary` (`../chrome/selection`), `ScreenAction` (`../chrome/selection-pill`).
- Produces:

```ts
// live-hit.ts
export type HitElement = { type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };
export function screenAt(elements: readonly HitElement[], point: { x: number; y: number }): string | null; // topmost Orion screen
export function isInsideScreen(elements: readonly HitElement[], boardScreenId: string, point: { x: number; y: number }): boolean;

// live-actions.ts
export function liveScreenActions(selection: SelectionSummary, awake: boolean, handlers: {
  onOpenLive: (boardScreenId: string) => void; onCode: (boardScreenId: string) => void;
}): ScreenAction[];
```

- [ ] **Step 1: Write the failing tests**

`live/live-hit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isInsideScreen, screenAt } from "./live-hit";

const screen = (id: string, x: number, extra: object = {}) => ({ type: "embeddable", x, y: 0, width: 100, height: 200, link: `orion-screen://${id}`, ...extra });
const elements = [screen("ds-a", 0), screen("ds-b", 50), { type: "rectangle", x: 300, y: 0, width: 50, height: 50 }, screen("gone", 400, { isDeleted: true })];

describe("live hit testing", () => {
  it("finds the topmost screen under a point", () => {
    expect(screenAt(elements, { x: 75, y: 10 })).toBe("ds-b");
    expect(screenAt(elements, { x: 10, y: 10 })).toBe("ds-a");
    expect(screenAt(elements, { x: 310, y: 10 })).toBeNull();
    expect(screenAt(elements, { x: 450, y: 10 })).toBeNull();
    expect(screenAt([{ type: "embeddable", x: 0, y: 0, width: 10, height: 10, link: "https://x" }], { x: 1, y: 1 })).toBeNull();
  });
  it("tells whether a point is on the live screen", () => {
    expect(isInsideScreen(elements, "ds-a", { x: 10, y: 199 })).toBe(true);
    expect(isInsideScreen(elements, "ds-a", { x: 101, y: 10 })).toBe(false);
    expect(isInsideScreen(elements, "missing", { x: 10, y: 10 })).toBe(false);
  });
});
```

`live/live-actions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { liveScreenActions } from "./live-actions";

const bounds = { x: 0, y: 0, width: 10, height: 10 };
const screenSelection = { kind: "screen" as const, ids: ["e"], bounds, screenId: "ds-a" };

describe("liveScreenActions", () => {
  it("offers Open live and Code for a sleeping screen", () => {
    const onOpenLive = vi.fn();
    const onCode = vi.fn();
    const actions = liveScreenActions(screenSelection, false, { onOpenLive, onCode });
    expect(actions.map((action) => action.label)).toEqual(["Open live", "Code"]);
    actions[0].onPress();
    actions[1].onPress();
    expect(onOpenLive).toHaveBeenCalledWith("ds-a");
    expect(onCode).toHaveBeenCalledWith("ds-a");
  });
  it("drops Open live while the screen is awake, and offers nothing for shapes", () => {
    expect(liveScreenActions(screenSelection, true, { onOpenLive: vi.fn(), onCode: vi.fn() }).map((action) => action.label)).toEqual(["Code"]);
    expect(liveScreenActions({ kind: "shape", ids: ["r"], bounds, screenId: null }, false, { onOpenLive: vi.fn(), onCode: vi.fn() })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live/live-hit.test.ts src/features/canvas-excalidraw/live/live-actions.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`live/live-hit.ts`:

```ts
import { screenIdFromLink } from "../frame-link";

export type HitElement = { type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };

const contains = (element: HitElement, point: { x: number; y: number }) =>
  point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height;

// Axis-aligned: Orion screens are never rotated by Orion, and a hand-rotated
// one simply needs a double-click nearer its middle.
export function screenAt(elements: readonly HitElement[], point: { x: number; y: number }): string | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.isDeleted || element.type !== "embeddable" || !contains(element, point)) continue;
    const screenId = screenIdFromLink(element.link);
    if (screenId) return screenId;
  }
  return null;
}

export function isInsideScreen(elements: readonly HitElement[], boardScreenId: string, point: { x: number; y: number }): boolean {
  return elements.some((element) => !element.isDeleted && element.type === "embeddable"
    && screenIdFromLink(element.link) === boardScreenId && contains(element, point));
}
```

`live/live-actions.ts`:

```ts
import type { SelectionSummary } from "../chrome/selection";
import type { ScreenAction } from "../chrome/selection-pill";

export function liveScreenActions(selection: SelectionSummary, awake: boolean, handlers: {
  onOpenLive: (boardScreenId: string) => void;
  onCode: (boardScreenId: string) => void;
}): ScreenAction[] {
  if (selection.kind !== "screen" || !selection.screenId) return [];
  const screenId = selection.screenId;
  return [
    ...(awake ? [] : [{ label: "Open live", onPress: () => handlers.onOpenLive(screenId) }]),
    { label: "Code", onPress: () => handlers.onCode(screenId) },
  ];
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/live && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/live/live-hit.ts apps/web/src/features/canvas-excalidraw/live/live-hit.test.ts apps/web/src/features/canvas-excalidraw/live/live-actions.ts apps/web/src/features/canvas-excalidraw/live/live-actions.test.ts
git commit -m "feat(canvas): hit testing and pill actions for live screens"
```

### Task L9: Wire the live host into the board

**Files:**
- Modify: `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`
- Modify: `apps/web/src/features/canvas-excalidraw/chrome/orion-board.css`
- Create test: `e2e/canvas-excalidraw-live.spec.ts`

**Interfaces:**
- Consumes everything from 0d and L1–L8.
- Produces (for P4): inside `ExcalidrawBoard`, the values `live: LiveController`, `compiler: ScreenCompiler`, `showCode: () => void`, and the existing `view: Viewport` state.
- Behaviour:
  - Double-click on a screen (on the Excalidraw canvas) wakes it. **Open live** in the pill wakes it. **Code** in the pill wakes it and opens the panel.
  - Esc, a pointer-down on the canvas outside the live screen, or waking another screen puts it to sleep, closes the panel and clears Excalidraw's `activeEmbeddable`.
  - A compile failure opens the panel on Code with the errors; the picture stays.
  - Design screens whose current version is `react`/`html` get the static placeholder as their first picture (`sleepingDocument`).

- [ ] **Step 1: Write the failing browser test**

`e2e/canvas-excalidraw-live.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

async function addFixture(page: Page, key: "sample" | "loop") {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate((fixture) => window.__orionBoard!.addFixture(fixture), key);
}

async function doubleClickScreen(page: Page, screenId: string) {
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

test("double-click wakes a screen with its scripts, and Escape puts it back to sleep", async ({ page }) => {
  await addFixture(page, "sample");
  await doubleClickScreen(page, "welcome");
  const live = page.locator('iframe[data-orion-live="welcome"]');
  await expect(live).toBeVisible();
  await expect(page.frameLocator('iframe[data-orion-live="welcome"]').getByText("script ran")).toBeVisible();
  expect(await live.evaluate((frame) => getComputedStyle(frame).outlineStyle)).toBe("solid");
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  // A board-only screen keeps its own HTML: no snapshot replaces it.
  expect(await page.locator('iframe[data-orion-frame="welcome"]').getAttribute("srcdoc")).toContain("script has not run");
});

test("the pill's Open live wakes the selected screen", async ({ page }) => {
  await addFixture(page, "sample");
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  await page.getByTestId("selection-pill").getByRole("button", { name: "Open live" }).click();
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();
  await expect(page.getByTestId("selection-pill").getByRole("button", { name: "Open live" })).toHaveCount(0);
});

test("an endless loop shows the stopped overlay and the board keeps working", async ({ page }) => {
  await addFixture(page, "loop");
  await doubleClickScreen(page, "loop");
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await expect(page.locator("iframe[data-orion-live]")).toHaveCount(0);
  const zoom = () => page.evaluate(() => window.__orionBoard!.api.getAppState().zoom.value);
  const before = await zoom();
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await zoom()).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Show code" }).click();
  await expect(page.getByTestId("live-panel")).toContainText("while(true)");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  // Clicking empty board puts it to sleep and closes the panel.
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  await expect(page.getByText("This screen stopped responding")).toHaveCount(0);
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts e2e/canvas-excalidraw-live.spec.ts`
Expected: FAIL — no `iframe[data-orion-live]` appears after the double-click.

- [ ] **Step 3: Wire the board**

In `excalidraw-board.tsx`:

1. Imports. Add `viewportCoordsToSceneCoords` to the existing `@excalidraw/excalidraw` import, add `useSyncExternalStore` and the event types to the React import:

```ts
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
```

and add:

```ts
import { Layout } from "@astryxdesign/core/Layout";
import { readScreenSource } from "@/features/design/canvas-screen-source";
import { liveScreenActions } from "./live/live-actions";
import { createLiveController } from "./live/live-controller";
import { isInsideScreen, screenAt } from "./live/live-hit";
import { LiveCodeView, LivePanel, type LivePanelTab } from "./live/live-panel";
import { isAwake, liveIssues, liveSourceOf } from "./live/live-state";
import { resolveLiveSource } from "./live/live-source";
import { sleepingDocument } from "./live/placeholder";
import { loadRuntimeBundle } from "./live/runtime-bundle";
import { createScreenCompiler } from "./live/screen-compiler";
```

2. Directly after `const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);` add:

```tsx
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  useEffect(() => { apiRef.current = api; }, [api]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<LivePanelTab>("code");
  const showCode = useCallback(() => { setPanelTab("code"); setPanelOpen(true); }, []);
  // Babel lives in a worker that starts the first time a screen goes live.
  const compiler = useMemo(() => createScreenCompiler(), []);
  useEffect(() => () => compiler.dispose(), [compiler]);
  const live = useMemo(() => createLiveController({
    loadSource: (id) => resolveLiveSource(id, { roomId: roomId ?? null, store, readSource: readScreenSource }),
    compile: (source) => compiler.compile(source, { tagElements: true }),
    runtimeBundle: () => loadRuntimeBundle(),
    // The snapshot becomes the sleeping picture; the board saves it like any screen.
    onSnapshot: (id, html) => {
      const current = store.get(id);
      if (current?.html !== html) store.set({ id, rev: (current?.rev ?? 0) + 1, html });
    },
    onSleep: () => {
      setPanelOpen(false);
      apiRef.current?.updateScene({ appState: { activeEmbeddable: null } });
    },
  }), [compiler, roomId, store]);
  const liveState = useSyncExternalStore(live.subscribe, live.getState, live.getState);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => live.handleMessage(event);
    // Capture phase, and no defaultPrevented check: Excalidraw handles Escape
    // itself and may stop or prevent it before a bubbling listener runs.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && live.getState().phase !== "asleep") void live.sleep();
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown, true);
      live.dispose();
    };
  }, [live]);
  // A screen that can't compile keeps its picture; the errors open on Code.
  useEffect(() => { if (liveState.phase === "compile-failed") showCode(); }, [liveState.phase, showCode]);
  const scenePoint = useCallback((event: { clientX: number; clientY: number }) => {
    const current = apiRef.current;
    return current ? viewportCoordsToSceneCoords(event, current.getAppState()) : null;
  }, []);
  const onBoardDoubleClick = useCallback((event: ReactMouseEvent) => {
    if (!(event.target instanceof HTMLCanvasElement) || !apiRef.current) return;
    const point = scenePoint(event);
    const screenId = point ? screenAt(apiRef.current.getSceneElements(), point) : null;
    if (screenId) void live.wake(screenId);
  }, [live, scenePoint]);
  const onBoardPointerDown = useCallback((event: ReactPointerEvent) => {
    const state = live.getState();
    if (state.phase === "asleep" || !(event.target instanceof HTMLCanvasElement) || !apiRef.current) return;
    const point = scenePoint(event);
    if (point && !isInsideScreen(apiRef.current.getSceneElements(), state.screenId, point)) void live.sleep();
  }, [live, scenePoint]);
```

3. In `onApi`, replace the body of `loadDocument` with:

```ts
        loadDocument: async (designScreenId) => {
          if (!roomId) return null;
          const screen = await loadRoomScreen(roomId, designScreenId);
          if (!screen) return null;
          // React/HTML source screens have no legacy markup: show the static
          // placeholder until the screen is opened live and snapshotted.
          const html = sleepingDocument(screen, () =>
            buildFramePreviewDoc(screen, previewTheme(getComputedStyle(document.body)), previewChromeCss));
          return html ? { html, formFactor: screen.formFactor } : null;
        },
```

4. Replace the whole `<VStack className="orion-board" …> … </VStack>` element (the board area, from its opening tag to its closing tag, keeping every child exactly as it is except the two changes below) with:

```tsx
      <Layout
        height="fill"
        padding={0}
        style={{ flex: 1, minHeight: 0 }}
        content={(
          <VStack
            className="orion-board"
            height="100%"
            style={{ position: "relative" }}
            role="application"
            aria-label="Board workspace"
            onDoubleClick={onBoardDoubleClick}
            onPointerDownCapture={onBoardPointerDown}
          >
            {/* existing children: <Excalidraw …/>, CanvasDock, SelectionPill, ZoomControl */}
          </VStack>
        )}
        end={panelOpen && liveState.phase !== "asleep" ? (
          <LivePanel title="Screen code" tab={panelTab} onTabChange={setPanelTab} onClose={() => setPanelOpen(false)}>
            <LiveCodeView source={liveSourceOf(liveState)} issues={liveIssues(liveState)} />
          </LivePanel>
        ) : undefined}
      />
```

   The two child changes:
   - `renderEmbeddable` renders `<FrameHost screenId={screenId} store={store} live={live} onShowCode={showCode} />`.
   - `SelectionPill`'s `screenActions` prop becomes:

```tsx
            screenActions={[
              ...liveScreenActions(selection, selection.screenId ? isAwake(liveState, selection.screenId) : false, {
                onOpenLive: (id) => void live.wake(id),
                onCode: (id) => void live.wake(id).then(showCode),
              }),
              ...(screenActionsFor?.(selection) ?? []),
            ]}
```

5. In `chrome/orion-board.css`, add `.orion-board .excalidraw__embeddable-hint,` to the selector list (Excalidraw's "click to interact" hint contradicts double-click / Open live).

- [ ] **Step 4: Run the checks**

Run:

```bash
pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx \
  && pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw \
  && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts e2e/canvas-excalidraw-live.spec.ts e2e/canvas-excalidraw-chrome.spec.ts e2e/canvas-excalidraw-frames.spec.ts
```

Expected: all PASS. Two things to check if they fail:
- **Canvas has no height inside `Layout`:** inspect `.orion-board` in the trace. The content area must stretch; if Astryx's `LayoutContent` adds scrolling or padding, keep `padding={0}` and give `.orion-board` `height="100%"` (already set). Do not add a raw wrapper element.
- **Worker fails to start under Turbopack:** the overlay never appears and the panel shows "The screen compiler stopped. Try again." Check the browser console for the worker URL. `new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" })` is the pattern Turbopack and webpack both support. Do not silently switch to `createInlineCompiler`; if you must, record it as a deviation in the PR.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx apps/web/src/features/canvas-excalidraw/chrome/orion-board.css e2e/canvas-excalidraw-live.spec.ts
git commit -m "feat(canvas): wake one screen live on the board, with stopped overlay and code panel"
```

---

# Track P — Paste code

### Task P1: Detect React vs HTML and build the screen source

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/paste/detect-kind.ts` + `detect-kind.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/paste/paste-source.ts` + `paste-source.test.ts`

**Interfaces:**
- Produces:

```ts
// detect-kind.ts
export type DetectedKind = { ok: true; kind: ScreenKind } | { ok: false; message: string };
export const EMPTY_PASTE_MESSAGE = "Paste some code first.";
export const NOT_CODE_MESSAGE = "This doesn't look like React or HTML. Paste a React component or an HTML page.";
export function detectScreenKind(code: string): DetectedKind;

// paste-source.ts
export type PastedSource = { ok: true; source: ScreenSource } | { ok: false; message: string };
export const NO_EXPORT_MESSAGE = "Export your component as default, for example: export default function App() { … }";
export const TOO_LARGE_MESSAGE = "This code is too large. A screen can be at most 256 KB.";
export function normalizeReact(code: string): string | null;
export function buildPastedSource(code: string, kind: ScreenKind): PastedSource; // react → App.tsx, html → index.html
```

Rules (spec section 6): `import`/`export` or JSX means React; a leading `<` with HTML tags means HTML; anything else is an inline error. A leading `<` that contains JSX-only syntax (`className=`, `attr={…}`, `<>`, `{/* */}`) is React.

- [ ] **Step 1: Write the failing tests**

`paste/detect-kind.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectScreenKind, EMPTY_PASTE_MESSAGE, NOT_CODE_MESSAGE } from "./detect-kind";

describe("detectScreenKind", () => {
  it.each([
    ['import { useState } from "react";\nexport default function App() { return <main/>; }', "react"],
    ["export default () => <main>Hi</main>", "react"],
    ['<div className="p-4">Hi</div>', "react"],
    ["<>\n  <h1>Hi</h1>\n</>", "react"],
    ['<button onClick={() => go()}>Go</button>', "react"],
    ["function App() {\n  return (<main>Hi</main>);\n}", "react"],
    ["const App = () => <main>Hi</main>;", "react"],
    ["<!doctype html><html><body><h1>Hi</h1></body></html>", "html"],
    ["<main><h1>Hi</h1></main>", "html"],
    ['<button onclick="x={a:1}">Go</button>', "html"],
    ["  <script>document.body.append('x')</script>", "html"],
  ])("detects %s", (code, kind) => {
    expect(detectScreenKind(code)).toEqual({ ok: true, kind });
  });

  it("explains empty and non-code pastes", () => {
    expect(detectScreenKind("   ")).toEqual({ ok: false, message: EMPTY_PASTE_MESSAGE });
    expect(detectScreenKind("make me a login page")).toEqual({ ok: false, message: NOT_CODE_MESSAGE });
    expect(detectScreenKind("body { color: red }")).toEqual({ ok: false, message: NOT_CODE_MESSAGE });
  });
});
```

`paste/paste-source.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPastedSource, NO_EXPORT_MESSAGE, normalizeReact, TOO_LARGE_MESSAGE } from "./paste-source";

describe("normalizeReact", () => {
  it("keeps code that already exports a component", () => {
    for (const code of ["export default function App() { return null; }", "export function App() { return null; }", "function App() { return null; }\nexport { App };"]) {
      expect(normalizeReact(code)).toBe(code);
    }
  });
  it("wraps a bare JSX snippet in a default App component", () => {
    expect(normalizeReact('<div className="p-4">Hi</div>')).toBe('export default function App() {\n  return (\n    <>\n<div className="p-4">Hi</div>\n    </>\n  );\n}\n');
  });
  it("exports a declared App component", () => {
    expect(normalizeReact("function App() { return <main/>; }")).toBe("function App() { return <main/>; }\n\nexport default App;\n");
    expect(normalizeReact("const App = () => <main/>;")).toBe("const App = () => <main/>;\n\nexport default App;\n");
  });
  it("gives up when there is no component to mount", () => {
    expect(normalizeReact("const Card = () => <main/>;")).toBeNull();
  });
});

describe("buildPastedSource", () => {
  it("builds a one-file React source", () => {
    expect(buildPastedSource("export default () => <main/>", "react")).toEqual({
      ok: true, source: { kind: "react", files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" },
    });
  });
  it("builds a one-file HTML source", () => {
    expect(buildPastedSource("  <h1>Hi</h1>\n", "html")).toEqual({
      ok: true, source: { kind: "html", files: { "index.html": "<h1>Hi</h1>" }, entry: "index.html" },
    });
  });
  it("explains a missing export and an oversized paste", () => {
    expect(buildPastedSource("const Card = () => <main/>;", "react")).toEqual({ ok: false, message: NO_EXPORT_MESSAGE });
    expect(buildPastedSource(`<p>${"x".repeat(262_144)}</p>`, "html")).toEqual({ ok: false, message: TOO_LARGE_MESSAGE });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`paste/detect-kind.ts`:

```ts
import type { ScreenKind } from "@meld/screen-runtime/source";

export type DetectedKind = { ok: true; kind: ScreenKind } | { ok: false; message: string };
export const EMPTY_PASTE_MESSAGE = "Paste some code first.";
export const NOT_CODE_MESSAGE = "This doesn't look like React or HTML. Paste a React component or an HTML page.";

const MODULE_SYNTAX = /^\s*(import|export)\s/m;
const LEADING_TAG = /^<(!doctype\b|>|[a-z][a-z0-9-]*[\s>/])/i;
// JSX-only syntax: className, attr={…} (not inside a quoted HTML attribute),
// fragments and JSX comments.
const JSX_ONLY = /\sclassName=|\s[A-Za-z][\w-]*=\{|^<>|\{\s*\/\*/m;
const COMPONENT_RETURNING_JSX = /(=>|\breturn\b)\s*\(?\s*<[A-Za-z>]/;

export function detectScreenKind(code: string): DetectedKind {
  const text = code.trim();
  if (!text) return { ok: false, message: EMPTY_PASTE_MESSAGE };
  if (MODULE_SYNTAX.test(text)) return { ok: true, kind: "react" };
  if (LEADING_TAG.test(text)) return { ok: true, kind: JSX_ONLY.test(text) ? "react" : "html" };
  if (COMPONENT_RETURNING_JSX.test(text)) return { ok: true, kind: "react" };
  return { ok: false, message: NOT_CODE_MESSAGE };
}
```

`paste/paste-source.ts`:

```ts
import { ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";

export type PastedSource = { ok: true; source: ScreenSource } | { ok: false; message: string };
export const NO_EXPORT_MESSAGE = "Export your component as default, for example: export default function App() { … }";
export const TOO_LARGE_MESSAGE = "This code is too large. A screen can be at most 256 KB.";

const EXPORTS_COMPONENT = /\bexport\s+default\b|\bexport\s+(function|const|class)\s+App\b|\bexport\s*\{[^}]*\bApp\b[^}]*\}/;
const MODULE_SYNTAX = /^\s*(import|export)\s/m;
const DECLARES_APP = /^(?:function\s+App\b|const\s+App\s*=|class\s+App\b)/m;

// The runtime mounts the entry's default export, or its `App` export.
export function normalizeReact(code: string): string | null {
  const text = code.trim();
  if (EXPORTS_COMPONENT.test(text)) return text;
  if (!MODULE_SYNTAX.test(text) && text.startsWith("<")) {
    return `export default function App() {\n  return (\n    <>\n${text}\n    </>\n  );\n}\n`;
  }
  if (DECLARES_APP.test(text)) return `${text}\n\nexport default App;\n`;
  return null;
}

export function buildPastedSource(code: string, kind: ScreenKind): PastedSource {
  let candidate: ScreenSource;
  if (kind === "react") {
    const normalized = normalizeReact(code);
    if (normalized === null) return { ok: false, message: NO_EXPORT_MESSAGE };
    candidate = { kind, files: { "App.tsx": normalized }, entry: "App.tsx" };
  } else {
    candidate = { kind, files: { "index.html": code.trim() }, entry: "index.html" };
  }
  const parsed = ScreenSourceSchema.safeParse(candidate);
  return parsed.success ? { ok: true, source: parsed.data } : { ok: false, message: TOO_LARGE_MESSAGE };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/paste/detect-kind.ts apps/web/src/features/canvas-excalidraw/paste/detect-kind.test.ts apps/web/src/features/canvas-excalidraw/paste/paste-source.ts apps/web/src/features/canvas-excalidraw/paste/paste-source.test.ts
git commit -m "feat(canvas): detect pasted React or HTML and build its source"
```

### Task P2: Place and create a pasted screen

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/paste/placement.ts` + `placement.test.ts`
- Create: `apps/web/src/features/canvas-excalidraw/paste/create-pasted-screen.ts` + `create-pasted-screen.test.ts`

**Interfaces:**
- Consumes: `createCanvasScreen` / `CreateCanvasScreenResult` (Plan 1), `boardScreenId` (`../design-screen-board`), `frameSizeForFormFactor` + `FormFactor` (`@meld/prototype`), `sleepingPlaceholder` (L4), `LiveSource` (L4), `Viewport` (`../chrome/zoom`).
- Produces:

```ts
// placement.ts
export function centredPosition(view: Viewport, size: { w: number; h: number }): { x: number; y: number };

// create-pasted-screen.ts
export type PasteInput = { name: string; source: ScreenSource; formFactor: FormFactor };
export type PasteDeps = {
  roomId: string;
  view: Viewport;
  store: Pick<ScreenStore, "set">;
  create: (input: { roomId: string; name: string; source: ScreenSource; formFactor: FormFactor }) => Promise<CreateCanvasScreenResult>;
  addFrame: (frame: { screenId: string; x: number; y: number; width: number; height: number }) => void;
  wake: (boardScreenId: string, preloaded: LiveSource) => void;
};
export function createPastedScreen(deps: PasteDeps, input: PasteInput): Promise<{ status: "created"; boardScreenId: string } | { status: "error" }>;
```

- [ ] **Step 1: Write the failing tests**

`paste/placement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sceneToContainer } from "../chrome/selection";
import { centredPosition } from "./placement";

describe("centredPosition", () => {
  it("centres a frame of the given size in the visible board", () => {
    expect(centredPosition({ scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 }, { w: 390, h: 844 })).toEqual({ x: 305, y: -22 });
  });
  it("accounts for scroll and zoom", () => {
    const view = { scrollX: 100, scrollY: -50, zoom: 2, width: 1000, height: 800 };
    const size = { w: 390, h: 844 };
    const at = centredPosition(view, size);
    expect(sceneToContainer({ x: at.x + size.w / 2, y: at.y + size.h / 2 }, view)).toEqual({ x: 500, y: 400 });
  });
});
```

`paste/create-pasted-screen.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createPastedScreen, type PasteDeps } from "./create-pasted-screen";

const SCREEN = "E5000000-0000-4000-8000-000000000001";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 1000, height: 800 };

function deps(result: Awaited<ReturnType<PasteDeps["create"]>>) {
  return {
    roomId: "room", view,
    store: { set: vi.fn(() => true) },
    create: vi.fn(async () => result),
    addFrame: vi.fn(),
    wake: vi.fn(),
  } satisfies PasteDeps;
}

describe("createPastedScreen", () => {
  it("saves the screen, shows its placeholder at the centre at device size, then wakes it", async () => {
    const d = deps({ status: "created", screenId: SCREEN, versionId: "v" });
    await expect(createPastedScreen(d, { name: "Counter", source, formFactor: "mobile" }))
      .resolves.toEqual({ status: "created", boardScreenId: `ds-${SCREEN.toLowerCase()}` });
    expect(d.create).toHaveBeenCalledWith({ roomId: "room", name: "Counter", source, formFactor: "mobile" });
    expect(d.store.set).toHaveBeenCalledWith({ id: `ds-${SCREEN.toLowerCase()}`, rev: 1, html: expect.stringContaining("Counter") });
    expect(d.addFrame).toHaveBeenCalledWith({ screenId: `ds-${SCREEN.toLowerCase()}`, x: 305, y: -22, width: 390, height: 844 });
    expect(d.wake).toHaveBeenCalledWith(`ds-${SCREEN.toLowerCase()}`, { source, snapshot: true });
  });

  it("adds nothing when saving fails", async () => {
    const d = deps({ status: "error" });
    await expect(createPastedScreen(d, { name: "Counter", source, formFactor: "desktop" })).resolves.toEqual({ status: "error" });
    expect(d.store.set).not.toHaveBeenCalled();
    expect(d.addFrame).not.toHaveBeenCalled();
    expect(d.wake).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste/placement.test.ts src/features/canvas-excalidraw/paste/create-pasted-screen.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`paste/placement.ts`:

```ts
import type { Viewport } from "../chrome/zoom";

// Excalidraw maps scene -> viewport as (scene + scroll) * zoom, so the scene
// point under the viewport centre is centre / zoom - scroll.
export function centredPosition(view: Viewport, size: { w: number; h: number }): { x: number; y: number } {
  return {
    x: view.width / 2 / view.zoom - view.scrollX - size.w / 2,
    y: view.height / 2 / view.zoom - view.scrollY - size.h / 2,
  };
}
```

`paste/create-pasted-screen.ts`:

```ts
import { frameSizeForFormFactor, type FormFactor } from "@meld/prototype";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { CreateCanvasScreenResult } from "@/features/design/canvas-screen-source";
import type { Viewport } from "../chrome/zoom";
import { boardScreenId } from "../design-screen-board";
import type { LiveSource } from "../live/live-source";
import { sleepingPlaceholder } from "../live/placeholder";
import type { ScreenStore } from "../screen-store";
import { centredPosition } from "./placement";

export type PasteInput = { name: string; source: ScreenSource; formFactor: FormFactor };
export type PasteDeps = {
  roomId: string;
  view: Viewport;
  store: Pick<ScreenStore, "set">;
  create: (input: { roomId: string; name: string; source: ScreenSource; formFactor: FormFactor }) => Promise<CreateCanvasScreenResult>;
  addFrame: (frame: { screenId: string; x: number; y: number; width: number; height: number }) => void;
  wake: (boardScreenId: string, preloaded: LiveSource) => void;
};

// Save first, so nothing lands on the board that the screen store doesn't
// have. The placeholder is the picture until the live run's snapshot arrives.
export async function createPastedScreen(
  deps: PasteDeps,
  input: PasteInput,
): Promise<{ status: "created"; boardScreenId: string } | { status: "error" }> {
  const created = await deps.create({ roomId: deps.roomId, name: input.name, source: input.source, formFactor: input.formFactor });
  if (created.status !== "created") return { status: "error" };
  const id = boardScreenId(created.screenId);
  deps.store.set({ id, rev: 1, html: sleepingPlaceholder(input.name) });
  const size = frameSizeForFormFactor(input.formFactor);
  deps.addFrame({ screenId: id, ...centredPosition(deps.view, size), width: size.w, height: size.h });
  deps.wake(id, { source: input.source, snapshot: true });
  return { status: "created", boardScreenId: id };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste && pnpm --filter @meld/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/paste/placement.ts apps/web/src/features/canvas-excalidraw/paste/placement.test.ts apps/web/src/features/canvas-excalidraw/paste/create-pasted-screen.ts apps/web/src/features/canvas-excalidraw/paste/create-pasted-screen.test.ts
git commit -m "feat(canvas): create a pasted screen at the centre of the board"
```

### Task P3: Paste dialog

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/paste/paste-dialog.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/paste/paste-dialog.test.tsx`

**Interfaces:**
- Consumes: `detectScreenKind` (P1), `buildPastedSource` (P1), `PasteInput` (P2), `CompileResult` / `CompileError` (type-only).
- Produces:

```ts
export const DEFAULT_PASTE_NAME = "Pasted screen";
export const FORM_FACTOR_CHOICES: readonly { value: FormFactor; label: "Phone" | "Tablet" | "Desktop" }[];
export function PasteDialog(props: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  onCreate: (input: PasteInput) => Promise<"created" | "error">;
}): JSX.Element;
```

- Behaviour: **Create screen** detects the kind (inline error on the text area if it isn't code), builds the source, compiles it (without tags). Any compile error, including unsupported packages, is listed and nothing is created. On success it calls `onCreate`, then resets and closes. A failed save shows "Could not save this screen. Try again." and keeps the code.

- [ ] **Step 1: Write the failing test**

`paste/paste-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PasteDialog } from "./paste-dialog";

afterEach(cleanup);

const ok = { ok: true as const, screen: { kind: "react" as const, styles: [], scripts: [], html: "", links: [] } };

function setup(overrides: Partial<Parameters<typeof PasteDialog>[0]> = {}) {
  const props = {
    isOpen: true,
    onOpenChange: vi.fn(),
    compile: vi.fn(async () => ok),
    onCreate: vi.fn(async () => "created" as const),
    ...overrides,
  };
  render(<PasteDialog {...props} />);
  return props;
}

async function paste(code: string) {
  await userEvent.click(screen.getByLabelText("Code"));
  await userEvent.paste(code);
}

describe("PasteDialog", () => {
  it("creates a React screen at the chosen size and closes", async () => {
    const props = setup();
    await paste("export default function App() { return <main>Hi</main>; }");
    await userEvent.click(screen.getByRole("radio", { name: "Tablet" }));
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(props.compile).toHaveBeenCalledWith({ kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" });
    expect(props.onCreate).toHaveBeenCalledWith({
      name: "Pasted screen", formFactor: "tablet",
      source: { kind: "react", files: { "App.tsx": "export default function App() { return <main>Hi</main>; }" }, entry: "App.tsx" },
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates an HTML screen with the given name", async () => {
    const props = setup();
    await paste("<main><h1>Hi</h1></main>");
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Welcome");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Welcome", formFactor: "mobile", source: expect.objectContaining({ kind: "html" }) }));
  });

  it("lists unsupported packages and creates nothing", async () => {
    const props = setup({ compile: vi.fn(async () => ({ ok: false as const, errors: [{ file: "App.tsx", message: "Unsupported package: framer-motion" }] })) });
    await paste('import { motion } from "framer-motion";\nexport default function App() { return <motion.div />; }');
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(await screen.findByText("Unsupported package: framer-motion")).toBeInTheDocument();
    expect(screen.getByText("This code can't run yet")).toBeInTheDocument();
    expect(props.onCreate).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("explains a paste that isn't code without compiling", async () => {
    const props = setup();
    await paste("make me a login page");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(screen.getByText("This doesn't look like React or HTML. Paste a React component or an HTML page.")).toBeInTheDocument();
    expect(props.compile).not.toHaveBeenCalled();
  });

  it("keeps the code when saving fails", async () => {
    const props = setup({ onCreate: vi.fn(async () => "error" as const) });
    await paste("<p>x</p>");
    await userEvent.click(screen.getByRole("button", { name: "Create screen" }));
    expect(await screen.findByText("Could not save this screen. Try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Code")).toHaveValue("<p>x</p>");
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste/paste-dialog.test.tsx`
Expected: FAIL with `Cannot find module './paste-dialog'`.

- [ ] **Step 3: Implement**

`paste/paste-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type { FormFactor } from "@meld/prototype";
import type { CompileError, CompileResult } from "@meld/screen-runtime";
import type { ScreenSource } from "@meld/screen-runtime/source";
import type { PasteInput } from "./create-pasted-screen";
import { detectScreenKind } from "./detect-kind";
import { buildPastedSource } from "./paste-source";

export const DEFAULT_PASTE_NAME = "Pasted screen";
export const FORM_FACTOR_CHOICES: readonly { value: FormFactor; label: "Phone" | "Tablet" | "Desktop" }[] = [
  { value: "mobile", label: "Phone" },
  { value: "tablet", label: "Tablet" },
  { value: "desktop", label: "Desktop" },
];

export function PasteDialog({ isOpen, onOpenChange, compile, onCreate }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  compile: (source: ScreenSource) => Promise<CompileResult>;
  onCreate: (input: PasteInput) => Promise<"created" | "error">;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(DEFAULT_PASTE_NAME);
  const [formFactor, setFormFactor] = useState<FormFactor>("mobile");
  const [problem, setProblem] = useState<string | null>(null);
  const [errors, setErrors] = useState<CompileError[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setProblem(null);
    setErrors([]);
    const detected = detectScreenKind(code);
    if (!detected.ok) { setProblem(detected.message); return; }
    const built = buildPastedSource(code, detected.kind);
    if (!built.ok) { setProblem(built.message); return; }
    setBusy(true);
    try {
      // Unsupported packages and other errors are named before anything is created.
      const result = await compile(built.source);
      if (!result.ok) { setErrors(result.errors); return; }
      const created = await onCreate({ name: name.trim() || DEFAULT_PASTE_NAME, source: built.source, formFactor });
      if (created === "error") { setProblem("Could not save this screen. Try again."); return; }
      setCode("");
      setName(DEFAULT_PASTE_NAME);
      onOpenChange(false);
    } catch {
      setProblem("Could not check this code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={640}>
      <DialogHeader title="Paste code" subtitle="React (Tailwind and Lucide icons built in) or plain HTML" onOpenChange={onOpenChange} />
      <VStack gap={3} padding={4}>
        <TextArea
          label="Code"
          value={code}
          rows={14}
          hasSpellCheck={false}
          placeholder="Paste a React component or an HTML page"
          status={problem ? { type: "error", message: problem } : undefined}
          onChange={(value) => { setCode(value); setProblem(null); setErrors([]); }}
        />
        <TextInput label="Name" value={name} onChange={setName} />
        <SegmentedControl label="Device" value={formFactor} onChange={(value) => setFormFactor(value as FormFactor)}>
          {FORM_FACTOR_CHOICES.map((choice) => <SegmentedControlItem key={choice.value} value={choice.value} label={choice.label} />)}
        </SegmentedControl>
        {errors.length ? (
          <VStack gap={1}>
            <Banner status="error" title={errors.length === 1 ? "This code can't run yet" : `This code can't run yet (${errors.length} problems)`} />
            <List density="compact">
              {errors.map((error, index) => (
                <ListItem key={`${index}-${error.message}`} label={error.message} description={error.file || undefined} />
              ))}
            </List>
          </VStack>
        ) : null}
        <HStack gap={2} justify="end">
          <Button label="Cancel" variant="ghost" onClick={() => onOpenChange(false)} />
          <Button label={busy ? "Checking…" : "Create screen"} variant="primary" isDisabled={busy} onClick={() => void submit()} />
        </HStack>
      </VStack>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/paste && pnpm --filter @meld/web typecheck && pnpm check:astryx`
Expected: PASS. If `TextArea`'s floating status message isn't found by `getByText`, assert on `screen.getByLabelText("Code")` having `aria-invalid="true"` plus `findByText` for the message; don't move the message out of the component's `status` prop.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/paste/paste-dialog.tsx apps/web/src/features/canvas-excalidraw/paste/paste-dialog.test.tsx
git commit -m "feat(canvas): paste code dialog that names unsupported packages first"
```

### Task P4: Wire paste into the board, end-to-end

**Files:**
- Modify: `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`
- Modify test: `e2e/canvas-excalidraw-live.spec.ts` (add the paste tests)

**Interfaces:**
- Consumes: `PasteDialog` (P3), `createPastedScreen` (P2), `createCanvasScreen` (Plan 1), `addScreenFrame` (`./board-actions`), and `live`, `compiler`, `view` from L9.

- [ ] **Step 1: Write the failing browser tests**

Append to `e2e/canvas-excalidraw-live.spec.ts`:

```ts
const roomId = "40000000-0000-4000-8000-000000000001";

async function openRoomBoard(page: Page, baseURL: string) {
  await page.context().addCookies([
    { name: "meld-e2e-user-id", value: "10000000-0000-4000-8000-000000000001", url: baseURL },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL },
  ]);
  await page.goto(`${route}?room=${roomId}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
}

async function pasteCode(page: Page, code: string, name: string, device: "Phone" | "Tablet" | "Desktop") {
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Code" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: device }).click();
  await dialog.getByRole("button", { name: "Create screen" }).click();
  return dialog;
}

const embeddableCount = (page: Page) => page.evaluate(() =>
  window.__orionBoard!.api.getSceneElements().filter((element) => element.type === "embeddable").length);

test("pasted React goes live, works, sleeps to a script-free picture and wakes again", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, `import { useState } from "react";
import { Plus } from "lucide-react";
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="p-6">
      <button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => setCount(count + 1)}>
        <Plus size={16} /> Count {count}
      </button>
    </main>
  );
}`, "Counter", "Phone");
  const liveFrame = page.locator("iframe[data-orion-live]");
  await expect(liveFrame).toBeVisible();
  const screenId = (await liveFrame.getAttribute("data-orion-live"))!;
  expect(screenId).toMatch(/^ds-/);
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: /Count 0/ }).click();
  await expect(app.getByRole("button", { name: /Count 1/ })).toBeVisible();
  // Tailwind ran inside the frame.
  expect(await app.getByRole("button").evaluate((button) => getComputedStyle(button).borderTopLeftRadius)).not.toBe("0px");
  // Focus is inside the frame: the bridge forwards Escape.
  await page.keyboard.press("Escape");
  await expect(liveFrame).toHaveCount(0);
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect.poll(() => thumbnail.getAttribute("srcdoc")).toContain("Count 1");
  const srcdoc = (await thumbnail.getAttribute("srcdoc"))!;
  expect(srcdoc).not.toContain("<script");
  expect(srcdoc).not.toContain("data-orion-src");
  await doubleClickScreen(page, screenId);
  await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: /Count 0/ })).toBeVisible();
});

test("a pasted endless loop shows the stopped overlay and Reload brings it back", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, "export default function App() {\n  return <button onClick={() => { while (true) {} }}>Freeze</button>;\n}", "Freeze", "Phone");
  await page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: "Freeze" }).click();
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: "Freeze" })).toBeVisible();
});

test("pasted HTML runs its inline handlers", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, `<main><button onclick="this.textContent = 'Clicked'">Press</button></main>`, "Plain", "Desktop");
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: "Press" }).click();
  await expect(app.getByRole("button", { name: "Clicked" })).toBeVisible();
});

test("an unsupported package is named in the dialog and nothing is created", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  const before = await embeddableCount(page);
  const dialog = await pasteCode(page, 'import { motion } from "framer-motion";\nexport default function App() { return <motion.div>Hi</motion.div>; }', "Motion", "Phone");
  await expect(dialog.getByText("Unsupported package: framer-motion")).toBeVisible();
  expect(await embeddableCount(page)).toBe(before);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts e2e/canvas-excalidraw-live.spec.ts`
Expected: the four new tests FAIL (the dock has no Code button: no caller passes `onCode`); the three L9 tests still PASS.

- [ ] **Step 3: Wire the dialog**

In `excalidraw-board.tsx`:

1. Add imports:

```ts
import { createCanvasScreen } from "@/features/design/canvas-screen-source";
import { createPastedScreen } from "./paste/create-pasted-screen";
import { PasteDialog } from "./paste/paste-dialog";
```

(`addScreenFrame` is already imported from `./board-actions`.)

2. Next to the panel state from L9 add:

```tsx
  const [pasteOpen, setPasteOpen] = useState(false);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
```

(place it after the existing `const [view, setView] = useState<Viewport>(…)` line so `view` is defined).

3. Change the `CanvasDock`'s `onCode` prop to:

```tsx
            onCode={onCode ?? (roomId && access === "edit" ? () => setPasteOpen(true) : undefined)}
```

4. Render the dialog as the last child of the outer `VStack` (after the `Layout`):

```tsx
      {roomId && access === "edit" ? (
        <PasteDialog
          isOpen={pasteOpen}
          onOpenChange={setPasteOpen}
          compile={(source) => compiler.compile(source, { tagElements: false })}
          onCreate={async (input) => {
            const current = apiRef.current;
            if (!current) return "error";
            const result = await createPastedScreen({
              roomId,
              view: viewRef.current,
              store,
              create: createCanvasScreen,
              addFrame: (frame) => { addScreenFrame(current, frame); },
              wake: (id, preloaded) => { void live.wake(id, preloaded); },
            }, input);
            return result.status === "created" ? "created" : "error";
          }}
        />
      ) : null}
```

- [ ] **Step 4: Run everything for the board**

Run:

```bash
pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm test:colocation \
  && pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw src/features/design \
  && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts
```

Expected: all PASS, including every existing `canvas-excalidraw*` spec. If the Tailwind radius assertion fails while the counter works, open the trace: the runtime bundle's Tailwind must have produced a `<style>` in the frame's head. Fix the runtime (Plan 1 B8 output), not the test.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx e2e/canvas-excalidraw-live.spec.ts
git commit -m "feat(canvas): paste React or HTML from the dock into a live screen"
```

---

## Track A2: DB follow-ups — not needed for live and paste (deferred)

Checked against what this plan actually calls (`create_canvas_screen` via `createCanvasScreen`, and reads via `readScreenSource` / the canvas screen reader). None of these block it, so none are in this plan and **no migration is added**:

| Deferred item (Plan 1 review) | Why it doesn't block Plan 2 | Where it lands |
|---|---|---|
| Per-item link validation in `save_canvas_screen_version` | Plan 2 never saves a version or writes links | Before Plan 3's first save (drafts) |
| `save_canvas_screen_version` ignores `design_screens.updating` | Only matters when board saves race AI generation | Plan 3 (board saves) / Plan 4 (AI revise) |
| No `design_screen_events` for canvas create/save/restore | Other open clients won't see a pasted screen until reload; the pasting client places it itself | Plan 4, with the chat chip |
| Legacy readers render `react`/`html` screens blank | **Handled here for the board** (L4 `sourceKind` + placeholder + snapshots). Still blank in `prototype-reader.ts` (prototype view) and transcript thumbnails (`buildFramePreviewDoc` callers) | Plan 5 (Star screens and click-through) |
| `create_canvas_screen` has no `links` parameter | Links matter for arrows and markers only | Plan 5 |

Each of those, when done, is a migration that needs schema review before merge (the 11 Nov rule; merging to `main` runs `supabase db push`) and a pgTAP test using the scratch-DB recipe.

---

## Finish

- [ ] Run the full repo checks:

```bash
pnpm typecheck && pnpm lint && pnpm test:workspace && pnpm test && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts
```

Expected: all pass. If an unrelated check already fails on the base branch, record it in the PR with the output; don't fix it here.

- [ ] Mac check: run `apps/mac/scripts/preview.sh`, open a project's Canvas. Paste the counter screen from P4, click it, press Esc, double-click it, then paste the endless loop and confirm the overlay appears and trackpad panning still works. Capture screenshots with `screencapture -l <windowid>` into `.context/` for the owner. Note in the PR whether the board froze for about a second during the loop (expected: the loop guard's 1 s budget; WebKit runs the frame in the board's process).
- [ ] Open the PR against `NicholasOdunsi/canvas-powers-foundation` (stacked on #57). Say in the description: "No migration. Depends on #57's migration review." List the recorded decisions from the top of this plan.

## Self-review notes

- **Spec coverage:**
  - §5 `liveScreenId` on the board, live document only for that screen, scriptless thumbnails for the rest: 0d, L5, L6, L9.
  - §5 waking by double-click or Open live, spinner while compiling in a worker, compile error keeps the thumbnail and opens Code with errors: L3, L6, L8, L9.
  - §5 sleep on Esc, empty board, another screen; thumbnail cache refreshed: L1 (snapshot), L5, L9. "Pending draft flushed as a new version" has nothing to flush until Plan 3 adds drafts.
  - §5 stuck on `stuck` or no `ready` within 5 s, overlay with Reload / Show code: 0d, L5, L6, plus the crash distinction (decision 8).
  - §5 Tweak/Code panel: shell + read-only Code tab + seam (L7, L9). Tweak, the CodeMirror editor, Copy/Download, drafts and conflicts are Plan 3.
  - §6 dialog with text area, Phone/Tablet/Desktop and name; kind detection; unsupported imports listed before creating; create at viewport centre at device size, then open live: P1–P4.
  - Safety: loop guard fixes (0a, 0b), live frame only for the one screen, overlay replaces the frame, `FRAME_CSP` unchanged.
  - Error table rows in scope: compile error (L9), unsupported package (P3/P4), endless loop (L9/P4).
  - Plan 1 carry-overs: 0a loop-guard collision, 0b embedded frames, 0c entry validation + fake check, 0d ready ≠ no errors, and the legacy-reader blank thumbnails for the board (L4).
- **Type consistency checked:** `LiveState`/`LiveEvent`/`liveViewFor`/`isAwake`/`liveIssues`/`liveSourceOf` (0d) are used with the same names in L5–L9. `LiveSource` is defined once (L4) and used by L5, P2 and P4. `ScreenCompiler.compile(source, { tagElements })` is the same in L3, L9 and P4. `MAX_SCREEN_HTML_CHARS` (L2) limits snapshots. `boardScreenId` (existing) and `designScreenIdFromBoardId` (L4) are inverses. `PasteInput` (P2) is the dialog's `onCreate` argument (P3).
- **Not in this plan:** source editor and Tweak/Code editing (Plan 3), chat chip and revise task (Plan 4), edit-instead-of-duplicate, Star placement, arrows, missing markers and live click-through via `goto` (Plan 5), converting board-only screens into design screens (Plan 3, decision 3).
