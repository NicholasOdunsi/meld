# Excalidraw Canvas Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or disprove, behind a development-only route, that Excalidraw can be the base of Orion's canvas with sandboxed, script-enabled HTML frames, and end with a written go/no-go report.

**Architecture:** Excalidraw renders the board. Generated pages are Excalidraw `embeddable` elements whose content we render ourselves through `renderEmbeddable`, so we control the iframe sandbox and CSP (Excalidraw's built-in AI frame hardcodes a looser sandbox). The scene holds only a screen identifier per frame; page HTML lives in a separate revisioned screen store. For the spike the board saves in the browser; multiplayer is deferred to its own plan (`2026-11-14-excalidraw-multiplayer-relay.md`).

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `@excalidraw/excalidraw` 0.18.1 (MIT), Astryx, zod, Vitest, Playwright, Cloudflare Workers + Durable Objects (`wrangler dev`).

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-14-excalidraw-canvas-design.md` and the repository rules:

- Base: `@excalidraw/excalidraw` (MIT). Pin the exact version `0.18.1` (the repo pins exact versions).
- Scripts in generated pages are enabled; frames never get same-origin access to the app, its cookies or its credentials; no access to native commands.
- No new windows, window takeover, real form posts or downloads from a frame.
- Network blocked by default: each page gets a content security policy that blocks outside requests and loading outside code; images and fonts are inline.
- Anything a page posts to the host is validated for source, frame identity and shape.
- Multiplayer is out of this spike (owner decision, 2026-11-14). Keep Excalidraw's element versions and the screen store's revisions intact so it can be added later.
- The spike is built behind a development route and touches no production boards, no database schema and no existing records. The one exception is Task 6's opt-in real-account run (`?room=<uuid>` on a non-fake dev server), which creates a design screen in the room the owner names. Do not remove tldraw packages or the existing tldraw `CanvasRoom` in this plan.
- Application controls use Astryx components and tokens; no raw `<div>`/`<span>` layout, no hardcoded hex or px in app UI (see `AGENTS.md`; run `pnpm exec astryx component <Name>` if unsure a prop exists).
- Every `*.test.ts(x)` sits beside the module it covers (`pnpm check:test-colocation`).
- Use Node 22.23.2. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Scope notes (read before starting)

- **Generation uses the owner's connected AI first, with DeepSeek as the fallback** (no AI connected, usage limit, sign-in needed, failure or timeout). Task 5 builds the DeepSeek path (a direct dev-only server call); Task 6 adds the owner's-AI path through the existing task queue and the fallback logic. The queue path reuses the existing structured generator unchanged, so its pages have no scripts and do not use `data-goto` yet (stages 2 and 6). The report must say so.
- **Magic Frame's built-in generate button is not used.** Verified in Excalidraw's source (`App.tsx`, lines ~2083-2087) and the shipped bundle: its `iframe` element hardcodes `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads`. Our own `embeddable` + `renderEmbeddable` path replaces it, and a normal Excalidraw **frame** is the sketch region.
- **External-link opening and the per-board network allowlist are stage 2+.** The bridge in this spike supports only screen-to-screen `goto`; link clicks are swallowed.
- **Multiplayer is deferred.** The relay, Durable Object and sync tasks live in `2026-11-14-excalidraw-multiplayer-relay.md`. Saving in this spike is the browser's `localStorage` only (single user).
- Where this plan says "if X does not work, fallback Y", the spike's job is to find out. Record what you observe in the report (Task 11), including failures.

## File map

New web feature directory `apps/web/src/features/canvas-excalidraw/` (all tests colocated):

| File | Responsibility |
|---|---|
| `frame-document.ts` | Builds a frame's HTML: injects CSP and the `goto` bridge. Pure. |
| `frame-bridge.ts` | Validates messages from a frame (source, shape, known screen). Pure. |
| `frame-link.ts` | `orion-screen://<id>` link helpers. Pure. |
| `screen-store.ts` | Revisioned store of generated screens, usable with `useSyncExternalStore`. Pure. |
| `frame-host.tsx` | The sandboxed `<iframe>` for one frame; forwards validated `goto`. |
| `fixtures.ts` | Sample, probe and loop screens; the fake generation result. |
| `board-actions.ts` | Add frame element, navigate frame, next position. Uses Excalidraw API. |
| `sketch-request.ts` | zod schema + type for the generation request (shared by client and route). |
| `sketch-prompt.ts` | Builds the model prompt from sketch geometry. Pure. |
| `generate-screen.ts` | Server-side DeepSeek call and response validation. |
| `build-screen.ts` | Client: export selected frame to image + geometry, post it. |
| `screen-generator.ts` | The fallback rule: the owner's AI first, DeepSeek when none, at its limit, needing sign-in, failed or timed out. Pure. |
| `sketch-layout-adapter.ts` | Turns the sketch region into the existing generator's `SketchLayout`. |
| `own-ai-generator.ts`, `own-ai-deps.ts`, `load-screen.ts` | Builds a screen through the existing `design_screen_generate` queue and polls it. |
| `board-persistence.ts` | Encode, decode and save a board (elements and screens) in `localStorage`. Pure apart from the storage handle. |
| `excalidraw-board.tsx` | The board component and Astryx toolbar. |
| `board-loader.tsx` | Client wrapper that loads the board with `ssr: false`. |

Other new files: `apps/web/src/app/dev/canvas-excalidraw/page.tsx`, `apps/web/src/app/api/dev/canvas-excalidraw/generate/route.ts`, `playwright.canvas-excalidraw.config.ts`, `e2e/canvas-excalidraw*.spec.ts`, `docs/design/reports/2026-11-14-excalidraw-canvas-spike.md`.

Modified: `apps/web/package.json`, `pnpm-lock.yaml`, `.gitignore`, `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`. No worker, router or database files change.

---

## Task 1: Mount Excalidraw on a dev route

**Files:**
- Create: `apps/web/src/app/dev/canvas-excalidraw/page.tsx`, `apps/web/src/features/canvas-excalidraw/board-loader.tsx`, `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`, `playwright.canvas-excalidraw.config.ts`, `e2e/canvas-excalidraw.spec.ts`
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`, `.gitignore`, `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`

**Interfaces:**
- Produces: `ExcalidrawBoard` props `{ boardId?: string; access: "edit" | "view" }`; route `/dev/canvas-excalidraw[?board=<uuid>&access=view]` (`board` names the saved board; default `local`); a Playwright config that later tasks extend.

- [ ] **Step 1: Install the dependency**

Run: `pnpm --filter @meld/web add @excalidraw/excalidraw@0.18.1 --save-exact`
Expected: `apps/web/package.json` gains `"@excalidraw/excalidraw": "0.18.1"`; `pnpm-lock.yaml` changes.

- [ ] **Step 2: Ignore the generated build directory** (mirrors how `.next-canvas-next` is handled)

In `.gitignore`, after `apps/web/.next-canvas-next/` add `apps/web/.next-canvas-excalidraw/`.
In `apps/web/eslint.config.mjs`, next to `".next-canvas-next/**",` add `".next-canvas-excalidraw/**",`.
In `apps/web/tsconfig.json` `include`, after the `.next-canvas-next` entries add:

```json
    ".next-canvas-excalidraw/types/**/*.ts",
    ".next-canvas-excalidraw/dev/types/**/*.ts"
```

- [ ] **Step 3: Write the failing smoke test** — `e2e/canvas-excalidraw.spec.ts`

```ts
import { test, expect } from "@playwright/test";

export const route = "/dev/canvas-excalidraw";

test("mounts Excalidraw with no tldraw", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await expect(page.getByText("Canvas lab · Excalidraw spike")).toBeVisible();
  expect(requests.some((url) => url.includes("tldraw"))).toBe(false);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 4: Write the Playwright config** — `playwright.canvas-excalidraw.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MELD_E2E_PORT ?? 3018);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "canvas-excalidraw*.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `pnpm --filter @meld/web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/dev/canvas-excalidraw`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      MELD_E2E_DIST_DIR: ".next-canvas-excalidraw",
      MELD_E2E_FAKE_WORKSPACES: "true",
    },
  },
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts`
Expected: FAIL (route returns 404 / text not found).

- [ ] **Step 6: Write the page** — `apps/web/src/app/dev/canvas-excalidraw/page.tsx`

```tsx
import { notFound } from "next/navigation";
import { BoardLoader } from "@/features/canvas-excalidraw/board-loader";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function CanvasExcalidrawPage({ searchParams }: { searchParams: Promise<Params> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const board = first(params.board);
  return (
    <BoardLoader
      boardId={board && UUID.test(board) ? board : undefined}
      access={first(params.access) === "view" ? "view" : "edit"}
    />
  );
}
```

- [ ] **Step 7: Write the loader** — `board-loader.tsx`

```tsx
"use client";

import dynamic from "next/dynamic";
import { Text } from "@astryxdesign/core/Text";

const ExcalidrawBoard = dynamic(
  () => import("./excalidraw-board").then((module) => module.ExcalidrawBoard),
  { ssr: false, loading: () => <Text>Loading board…</Text> },
);

export function BoardLoader(props: { boardId?: string; access: "edit" | "view" }) {
  return <ExcalidrawBoard {...props} />;
}
```

- [ ] **Step 8: Write the minimal board** — `excalidraw-board.tsx`

```tsx
"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useState } from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

declare global {
  interface Window {
    __orionBoard?: { api: ExcalidrawImperativeAPI };
  }
}

export function ExcalidrawBoard({ access }: { boardId?: string; access: "edit" | "view" }) {
  const [, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  return (
    <VStack gap={0} style={{ height: "100vh" }}>
      <HStack padding={3} gap={2} style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">Canvas lab · Excalidraw spike</Text>
      </HStack>
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          viewModeEnabled={access === "view"}
          excalidrawAPI={(api) => {
            setApi(api);
            window.__orionBoard = { api };
          }}
        />
      </VStack>
    </VStack>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts`
Expected: PASS. If `@excalidraw/excalidraw/index.css` fails to resolve under Next, import it from `node_modules/@excalidraw/excalidraw/dist/prod/index.css` via a relative path instead and note it in the report.

- [ ] **Step 10: Typecheck, lint, and astryx check**

Run: `pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx`
Expected: no errors (fix any Astryx convention findings by swapping to the right component).

- [ ] **Step 11: Commit**

```bash
git add .gitignore apps/web e2e/canvas-excalidraw.spec.ts playwright.canvas-excalidraw.config.ts pnpm-lock.yaml
git commit -m "feat(canvas): mount Excalidraw on a dev-only route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Frame document builder (CSP and `goto` bridge)

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/frame-document.ts`, `frame-document.test.ts`

**Interfaces:**
- Produces: `FRAME_SANDBOX: "allow-scripts"`, `FRAME_CSP: string`, `FRAME_MESSAGE_SOURCE: "orion-frame"`, `buildFrameDocument(html: string): string`.

- [ ] **Step 1: Write the failing test** — `frame-document.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildFrameDocument, FRAME_CSP, FRAME_MESSAGE_SOURCE, FRAME_SANDBOX } from "./frame-document";

describe("buildFrameDocument", () => {
  it("puts the CSP meta first in an existing head", () => {
    const doc = buildFrameDocument("<!doctype html><html><head><title>T</title></head><body>x</body></html>");
    const head = doc.slice(doc.indexOf("<head>") + 6);
    expect(head.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain("<title>T</title>");
  });

  it("adds a head when the page has an html tag but no head", () => {
    const doc = buildFrameDocument("<html><body>x</body></html>");
    expect(doc).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"/);
  });

  it("wraps a fragment in a full document", () => {
    const doc = buildFrameDocument("<h1>Hi</h1>");
    expect(doc.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(doc).toContain("<body><h1>Hi</h1></body>");
  });

  it("keeps the page's own script", () => {
    const doc = buildFrameDocument("<html><head></head><body><script>window.ran=1</script></body></html>");
    expect(doc).toContain("<script>window.ran=1</script>");
  });

  it("does not interpret $ patterns in page content", () => {
    const doc = buildFrameDocument("<html><head><title>$&$1</title></head><body></body></html>");
    expect(doc).toContain("<title>$&$1</title>");
  });

  it("blocks network and outside code but allows inline script and style", () => {
    expect(FRAME_CSP).toContain("connect-src 'none'");
    expect(FRAME_CSP).toContain("default-src 'none'");
    expect(FRAME_CSP).toContain("script-src 'unsafe-inline'");
    expect(FRAME_CSP).toContain("form-action 'none'");
    expect(FRAME_CSP).toContain("base-uri 'none'");
    expect(FRAME_CSP).not.toContain("unsafe-eval");
  });

  it("installs a goto bridge that posts the agreed message source", () => {
    const doc = buildFrameDocument("<h1>Hi</h1>");
    expect(doc).toContain(FRAME_MESSAGE_SOURCE);
    expect(doc).toContain("data-goto");
  });

  it("grants scripts only", () => {
    expect(FRAME_SANDBOX).toBe("allow-scripts");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-document.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `frame-document.ts`

```ts
// Everything that makes a generated page safe to run with scripts enabled.
// The iframe gets FRAME_SANDBOX (no same-origin, popups, forms, downloads or
// top navigation); the document gets FRAME_CSP (no network, no outside code).

export const FRAME_SANDBOX = "allow-scripts";
export const FRAME_MESSAGE_SOURCE = "orion-frame";

export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join("; ");

// A click on [data-goto] asks the canvas to show another screen. Every other
// link click is swallowed: the spike does not open external links.
const BRIDGE = `(function(){
var post=function(m){parent.postMessage(Object.assign({source:"${FRAME_MESSAGE_SOURCE}"},m),"*")};
window.orion={goto:function(k){post({type:"goto",screenKey:String(k)})}};
document.addEventListener("click",function(e){
var a=e.target instanceof Element?e.target.closest("[data-goto],a[href]"):null;
if(!a)return;
e.preventDefault();
var k=a.getAttribute("data-goto");
if(k)post({type:"goto",screenKey:k});
},true);
})();`;

const INJECTED = `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><script>${BRIDGE}</script>`;
const HEAD_OPEN = /<head(\s[^>]*)?>/i;
const HTML_OPEN = /<html(\s[^>]*)?>/i;

export function buildFrameDocument(html: string): string {
  if (HEAD_OPEN.test(html)) return html.replace(HEAD_OPEN, (open) => `${open}${INJECTED}`);
  if (HTML_OPEN.test(html)) return html.replace(HTML_OPEN, (open) => `${open}<head>${INJECTED}</head>`);
  return `<!doctype html><html><head>${INJECTED}</head><body>${html}</body></html>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-document.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/frame-document.ts apps/web/src/features/canvas-excalidraw/frame-document.test.ts
git commit -m "feat(canvas): build frame documents with CSP and goto bridge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Frame message validation and link helpers

**Files:**
- Create: `frame-bridge.ts`, `frame-bridge.test.ts`, `frame-link.ts`, `frame-link.test.ts` (all in `apps/web/src/features/canvas-excalidraw/`)

**Interfaces:**
- Consumes: `FRAME_MESSAGE_SOURCE` from `frame-document.ts`.
- Produces: `parseFrameMessage(event: { source: unknown; data: unknown }, frameWindow: unknown, isKnownScreen: (key: string) => boolean): { source: "orion-frame"; type: "goto"; screenKey: string } | null`; `FRAME_LINK_PREFIX`, `frameLink(id: string): string`, `screenIdFromLink(link: string | null | undefined): string | null`, `isFrameLink(link: string | null | undefined): boolean`.

- [ ] **Step 1: Write the failing tests**

`frame-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { frameLink, isFrameLink, screenIdFromLink } from "./frame-link";

describe("frame links", () => {
  it("round-trips a screen id", () => {
    expect(frameLink("welcome")).toBe("orion-screen://welcome");
    expect(screenIdFromLink("orion-screen://welcome")).toBe("welcome");
    expect(isFrameLink("orion-screen://welcome")).toBe(true);
  });
  it("rejects other schemes and malformed ids", () => {
    expect(screenIdFromLink("https://example.com")).toBeNull();
    expect(screenIdFromLink("orion-screen://Bad Id")).toBeNull();
    expect(screenIdFromLink("orion-screen://")).toBeNull();
    expect(screenIdFromLink(null)).toBeNull();
    expect(isFrameLink(undefined)).toBe(false);
  });
  it("refuses to build a link from a bad id", () => {
    expect(() => frameLink("../x")).toThrow();
  });
});
```

`frame-bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFrameMessage } from "./frame-bridge";

const frame = {};
const known = (key: string) => key === "login";
const good = { source: "orion-frame", type: "goto", screenKey: "login" };

describe("parseFrameMessage", () => {
  it("accepts a well-formed goto from the frame's own window", () => {
    expect(parseFrameMessage({ source: frame, data: good }, frame, known)).toEqual(good);
  });
  it("rejects a message from another window", () => {
    expect(parseFrameMessage({ source: {}, data: good }, frame, known)).toBeNull();
  });
  it("rejects when the frame window is missing", () => {
    expect(parseFrameMessage({ source: null, data: good }, null, known)).toBeNull();
  });
  it("rejects wrong shapes, extra keys and bad keys", () => {
    for (const data of [
      null, "x", {}, { ...good, type: "open" }, { ...good, source: "other" },
      { ...good, extra: 1 }, { ...good, screenKey: "../x" }, { ...good, screenKey: "Login" },
      { ...good, screenKey: 5 },
    ]) {
      expect(parseFrameMessage({ source: frame, data }, frame, known)).toBeNull();
    }
  });
  it("rejects an unknown screen", () => {
    expect(parseFrameMessage({ source: frame, data: { ...good, screenKey: "ghost" } }, frame, known)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-link.test.ts src/features/canvas-excalidraw/frame-bridge.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement** — `frame-link.ts`

```ts
export const FRAME_LINK_PREFIX = "orion-screen://";
const SCREEN_ID = /^[a-z][a-z0-9_-]{0,63}$/;

export function frameLink(id: string): string {
  if (!SCREEN_ID.test(id)) throw new Error(`Invalid screen id: ${id}`);
  return `${FRAME_LINK_PREFIX}${id}`;
}

export function screenIdFromLink(link: string | null | undefined): string | null {
  if (typeof link !== "string" || !link.startsWith(FRAME_LINK_PREFIX)) return null;
  const id = link.slice(FRAME_LINK_PREFIX.length);
  return SCREEN_ID.test(id) ? id : null;
}

export function isFrameLink(link: string | null | undefined): boolean {
  return screenIdFromLink(link) !== null;
}
```

`frame-bridge.ts`:

```ts
import { z } from "zod";
import { FRAME_MESSAGE_SOURCE } from "./frame-document";

const GotoMessage = z
  .object({
    source: z.literal(FRAME_MESSAGE_SOURCE),
    type: z.literal("goto"),
    screenKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  })
  .strict();

export type FrameMessage = z.infer<typeof GotoMessage>;

// A frame may only ask for a screen that exists, and only from its own window.
export function parseFrameMessage(
  event: { source: unknown; data: unknown },
  frameWindow: unknown,
  isKnownScreen: (key: string) => boolean,
): FrameMessage | null {
  if (!frameWindow || event.source !== frameWindow) return null;
  const parsed = GotoMessage.safeParse(event.data);
  if (!parsed.success || !isKnownScreen(parsed.data.screenKey)) return null;
  return parsed.data;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/frame-link.ts apps/web/src/features/canvas-excalidraw/frame-link.test.ts apps/web/src/features/canvas-excalidraw/frame-bridge.ts apps/web/src/features/canvas-excalidraw/frame-bridge.test.ts
git commit -m "feat(canvas): validate frame messages and screen links

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 4: Sandboxed HTML frames on the board

**Files:**
- Create: `screen-store.ts`, `screen-store.test.ts`, `frame-host.tsx`, `frame-host.test.tsx`, `fixtures.ts`, `board-actions.ts` (all in `apps/web/src/features/canvas-excalidraw/`); `e2e/canvas-excalidraw-frames.spec.ts`
- Modify: `excalidraw-board.tsx`

**Interfaces:**
- Consumes: `buildFrameDocument`, `FRAME_SANDBOX`, `parseFrameMessage`, `screenIdFromLink`, `isFrameLink`, `frameLink`.
- Produces:
  - `type Screen = { id: string; rev: number; html: string }`; `createScreenStore(): ScreenStore` with `get(id)`, `set(screen): boolean` (true only if `rev` is higher than the stored one), `all(): Screen[]`, `subscribe(listener): () => void`.
  - `<FrameHost screenId store onNavigate />`.
  - `FIXTURES: Record<"sample" | "probe" | "loop", { screens: Screen[]; frameScreenId: string }>`, `GENERATED_HTML`, `fakeGeneratedScreen(): { screenId: string; html: string }`.
  - `addScreenFrame(api, { screenId, x, y, width?, height? }): ExcalidrawElement`, `navigateFrame(api, elementId, screenId): void`, `nextFramePosition(api): { x: number; y: number }`.
  - Dev hook: `window.__orionBoard = { api, convert, addFixture(key), addFrames(count, key) }` (`convert` is Excalidraw's `convertToExcalidrawElements`, so specs can build elements without importing the package in the browser).

- [ ] **Step 1: Write the failing store test** — `screen-store.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { createScreenStore } from "./screen-store";

describe("screen store", () => {
  it("accepts only higher revisions", () => {
    const store = createScreenStore();
    expect(store.set({ id: "a", rev: 1, html: "one" })).toBe(true);
    expect(store.set({ id: "a", rev: 1, html: "same" })).toBe(false);
    expect(store.set({ id: "a", rev: 0, html: "old" })).toBe(false);
    expect(store.set({ id: "a", rev: 2, html: "two" })).toBe(true);
    expect(store.get("a")?.html).toBe("two");
  });
  it("notifies subscribers only on change and stops after unsubscribe", () => {
    const store = createScreenStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.set({ id: "a", rev: 1, html: "x" });
    store.set({ id: "a", rev: 1, html: "x" });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    store.set({ id: "a", rev: 2, html: "y" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("keeps the same object between reads until replaced", () => {
    const store = createScreenStore();
    store.set({ id: "a", rev: 1, html: "x" });
    expect(store.get("a")).toBe(store.get("a"));
    expect(store.all()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/screen-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `screen-store.ts`

```ts
export type Screen = { id: string; rev: number; html: string };

export type ScreenStore = {
  get(id: string): Screen | undefined;
  set(screen: Screen): boolean;
  all(): Screen[];
  subscribe(listener: () => void): () => void;
};

export function createScreenStore(): ScreenStore {
  const screens = new Map<string, Screen>();
  const listeners = new Set<() => void>();
  return {
    get: (id) => screens.get(id),
    set(screen) {
      const existing = screens.get(screen.id);
      if (existing && existing.rev >= screen.rev) return false;
      screens.set(screen.id, screen);
      listeners.forEach((listener) => listener());
      return true;
    },
    all: () => [...screens.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Write fixtures** — `fixtures.ts` (use named CSS colours so `check:astryx` has no hex to flag)

```ts
import type { Screen } from "./screen-store";

const page = (title: string, body: string, script = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
  `<style>body{font-family:system-ui;margin:0;padding:32px;background:ghostwhite;color:black}` +
  `h1{margin:0 0 8px}button{padding:10px 16px;border:0;border-radius:8px;background:rebeccapurple;color:white;font-size:16px}</style>` +
  `</head><body>${body}${script ? `<script>${script}</script>` : ""}</body></html>`;

export const WELCOME_HTML = page(
  "Welcome",
  '<h1>Welcome</h1><p id="js">script has not run</p><button data-goto="login">Log in</button>',
  'document.getElementById("js").textContent="script ran";',
);
export const LOGIN_HTML = page("Log in", '<h1>Log in</h1><button data-goto="welcome">Back</button>');
export const GENERATED_HTML = page("Generated", '<h1>Generated screen</h1><button data-goto="welcome">Home</button>');

// Reports what a frame is and is not allowed to do. Read the text, or the
// Playwright assertions in e2e/canvas-excalidraw-frames.spec.ts.
export const PROBE_HTML = page(
  "Probe",
  '<h1>Probe</h1><div id="out"></div>',
  `var out=document.getElementById("out");
function line(k,v){var p=document.createElement("p");p.textContent=k+": "+v;p.id=k.replace(/ /g,"-");out.appendChild(p)}
try{fetch("https://example.com/").then(function(){line("network","ALLOWED")},function(){line("network","blocked")})}catch(e){line("network","blocked")}
line("popup",window.open("about:blank")===null?"blocked":"ALLOWED");
line("parent",(function(){try{return parent.document?"ALLOWED":"blocked"}catch(e){return"blocked"}})());
line("storage",(function(){try{localStorage.getItem("x");return"ALLOWED"}catch(e){return"blocked"}})());
var nativeHandler=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.orion;
line("native bridge",nativeHandler?"present":"absent");
if(nativeHandler){setTimeout(function(){try{nativeHandler.postMessage({v:1,type:"notify",title:"PROBE",body:"A generated frame reached the native bridge",path:"/"})}catch(e){}},8000)}`,
);

export const LOOP_HTML = page("Loop", "<h1>Loop</h1>", "while(true){}");

export type FixtureKey = "sample" | "probe" | "loop";

export const FIXTURES: Record<FixtureKey, { screens: Screen[]; frameScreenId: string }> = {
  sample: {
    screens: [
      { id: "welcome", rev: 1, html: WELCOME_HTML },
      { id: "login", rev: 1, html: LOGIN_HTML },
    ],
    frameScreenId: "welcome",
  },
  probe: { screens: [{ id: "probe", rev: 1, html: PROBE_HTML }], frameScreenId: "probe" },
  loop: { screens: [{ id: "loop", rev: 1, html: LOOP_HTML }], frameScreenId: "loop" },
};

export function fakeGeneratedScreen(): { screenId: string; html: string } {
  return { screenId: `generated-${Math.random().toString(36).slice(2, 8)}`, html: GENERATED_HTML };
}
```

Note: `Math.random().toString(36)` can start with a digit-free string but the `generated-` prefix guarantees a leading letter, so the id matches `^[a-z][a-z0-9_-]{0,63}$`.

- [ ] **Step 6: Write the failing frame host test** — `frame-host.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameHost } from "./frame-host";
import { createScreenStore } from "./screen-store";

afterEach(cleanup);

function setup() {
  const store = createScreenStore();
  store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
  store.set({ id: "login", rev: 1, html: "<h1>Login</h1>" });
  const onNavigate = vi.fn();
  const view = render(<FrameHost screenId="welcome" store={store} onNavigate={onNavigate} />);
  return { iframe: view.container.querySelector("iframe")!, onNavigate };
}

const post = (source: unknown, data: unknown) =>
  window.dispatchEvent(new MessageEvent("message", { source: source as MessageEventSource, data }));

describe("FrameHost", () => {
  it("renders the page in a scripts-only sandbox with a CSP", () => {
    const { iframe } = setup();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
  });
  it("navigates on a valid goto from its own window", () => {
    const { iframe, onNavigate } = setup();
    post(iframe.contentWindow, { source: "orion-frame", type: "goto", screenKey: "login" });
    expect(onNavigate).toHaveBeenCalledWith("login");
  });
  it("ignores messages from elsewhere and unknown screens", () => {
    const { iframe, onNavigate } = setup();
    post(window, { source: "orion-frame", type: "goto", screenKey: "login" });
    post(iframe.contentWindow, { source: "orion-frame", type: "goto", screenKey: "ghost" });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/frame-host.test.tsx`
Expected: FAIL (module not found). If jsdom later rejects `MessageEvent` with an `iframe.contentWindow` source, drop the two message tests and keep the attribute test; `frame-bridge.test.ts` already covers the validation, and Playwright covers the live path.

- [ ] **Step 8: Implement** — `frame-host.tsx`

```tsx
"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Text } from "@astryxdesign/core/Text";
import { parseFrameMessage } from "./frame-bridge";
import { buildFrameDocument, FRAME_SANDBOX } from "./frame-document";
import type { ScreenStore } from "./screen-store";

export function FrameHost({ screenId, store, onNavigate }: {
  screenId: string;
  store: ScreenStore;
  onNavigate: (screenKey: string) => void;
}) {
  const screen = useSyncExternalStore(store.subscribe, () => store.get(screenId), () => undefined);
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const message = parseFrameMessage(event, ref.current?.contentWindow, (key) => store.get(key) !== undefined);
      if (message) onNavigate(message.screenKey);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [store, onNavigate]);

  const document = useMemo(() => (screen ? buildFrameDocument(screen.html) : ""), [screen]);
  if (!screen) return <Text>Loading screen…</Text>;
  return (
    <iframe
      ref={ref}
      title={`Screen ${screenId}`}
      data-orion-frame={screenId}
      sandbox={FRAME_SANDBOX}
      srcDoc={document}
      style={{ width: "100%", height: "100%", border: 0, background: "Canvas" }}
    />
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: same as Step 7. Expected: PASS.

- [ ] **Step 10: Write the board actions** — `board-actions.ts`

```ts
import { CaptureUpdateAction, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { frameLink } from "./frame-link";

export const FRAME_WIDTH = 480;
export const FRAME_HEIGHT = 640;
const GAP = 80;

export function nextFramePosition(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const right = api.getSceneElements().reduce((max, element) => Math.max(max, element.x + element.width), -GAP);
  return { x: right + GAP, y: 0 };
}

// An embeddable whose link names a screen; its page is drawn by FrameHost.
export function addScreenFrame(
  api: ExcalidrawImperativeAPI,
  input: { screenId: string; x: number; y: number; width?: number; height?: number },
): ExcalidrawElement {
  const [element] = restoreElements(
    [{
      type: "embeddable",
      id: `frame-${crypto.randomUUID()}`,
      x: input.x,
      y: input.y,
      width: input.width ?? FRAME_WIDTH,
      height: input.height ?? FRAME_HEIGHT,
      link: frameLink(input.screenId),
    } as unknown as ExcalidrawElement],
    null,
  );
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element;
}

export function navigateFrame(api: ExcalidrawImperativeAPI, elementId: string, screenId: string): void {
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((element) => (element.id === elementId ? newElementWith(element, { link: frameLink(screenId) }) : element)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
```

- [ ] **Step 11: Wire the board** — replace `excalidraw-board.tsx` with:

```tsx
"use client";

import "@excalidraw/excalidraw/index.css";
import { Excalidraw, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { addScreenFrame, navigateFrame, nextFramePosition } from "./board-actions";
import { FIXTURES, type FixtureKey } from "./fixtures";
import { FrameHost } from "./frame-host";
import { isFrameLink, screenIdFromLink } from "./frame-link";
import { createScreenStore } from "./screen-store";

declare global {
  interface Window {
    __orionBoard?: {
      api: ExcalidrawImperativeAPI;
      convert: typeof convertToExcalidrawElements;
      addFixture: (key: FixtureKey) => void;
      addFrames: (count: number, key: FixtureKey) => void;
    };
  }
}

export function ExcalidrawBoard({ access }: { boardId?: string; access: "edit" | "view" }) {
  const store = useMemo(() => createScreenStore(), []);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const addFixture = useCallback(
    (target: ExcalidrawImperativeAPI, key: FixtureKey, at?: { x: number; y: number }) => {
      for (const screen of FIXTURES[key].screens) store.set(screen);
      addScreenFrame(target, { screenId: FIXTURES[key].frameScreenId, ...(at ?? nextFramePosition(target)) });
    },
    [store],
  );

  const onApi = useCallback(
    (next: ExcalidrawImperativeAPI) => {
      setApi(next);
      window.__orionBoard = {
        api: next,
        convert: convertToExcalidrawElements,
        addFixture: (key) => addFixture(next, key),
        addFrames: (count, key) => {
          for (let index = 0; index < count; index += 1) {
            addFixture(next, key, { x: (index % 5) * 520, y: Math.floor(index / 5) * 700 });
          }
        },
      };
    },
    [addFixture],
  );

  return (
    <VStack gap={0} style={{ height: "100vh" }}>
      <HStack padding={3} gap={2} wrap="wrap" style={{ background: "var(--color-background-surface)" }}>
        <Text type="label">Canvas lab · Excalidraw spike</Text>
        <Button label="Add sample screen" size="sm" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "sample")} />
        <Button label="Add probe screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "probe")} />
        <Button label="Add loop screen" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => api && addFixture(api, "loop")} />
      </HStack>
      <VStack style={{ flex: 1, minHeight: 0 }} role="application" aria-label="Board workspace">
        <Excalidraw
          viewModeEnabled={access === "view"}
          excalidrawAPI={onApi}
          validateEmbeddable={(link) => isFrameLink(link)}
          renderEmbeddable={(element) => {
            const screenId = screenIdFromLink(element.link);
            if (!screenId || !api) return null;
            return (
              <FrameHost
                screenId={screenId}
                store={store}
                onNavigate={(screenKey) => navigateFrame(api, element.id, screenKey)}
              />
            );
          }}
        />
      </VStack>
    </VStack>
  );
}
```

- [ ] **Step 12: Write the failing end-to-end spec** — `e2e/canvas-excalidraw-frames.spec.ts`

```ts
import { test, expect, type Page } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

// Embeddables ignore the pointer until activated: hover, then click.
async function activateFirstFrame(page: Page) {
  const container = page.locator(".excalidraw__embeddable-container").first();
  const box = await container.boundingBox();
  if (!box) throw new Error("No frame on the board");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const events = await container.locator(".excalidraw__embeddable-container__inner").evaluate((node) => getComputedStyle(node).pointerEvents);
    if (events !== "none") return;
  }
}

test("a sample screen renders with scripts on and the agreed sandbox", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  const iframe = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");
});

test("the probe screen cannot reach the network, popups, the app or storage", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add probe screen" }).click();
  const frame = page.frameLocator('iframe[data-orion-frame="probe"]');
  await expect(frame.locator("#network")).toHaveText("network: blocked");
  await expect(frame.locator("#popup")).toHaveText("popup: blocked");
  await expect(frame.locator("#parent")).toHaveText("parent: blocked");
  await expect(frame.locator("#storage")).toHaveText("storage: blocked");
  await expect(frame.locator("#native-bridge")).toHaveText("native bridge: absent");
});

test("a button in one screen switches the frame to another screen", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  await activateFirstFrame(page);
  await page.frameLocator('iframe[data-orion-frame="welcome"]').getByRole("button", { name: "Log in" }).click();
  await expect(page.locator('iframe[data-orion-frame="login"]')).toBeVisible();
  await expect(page.locator('iframe[data-orion-frame="welcome"]')).toHaveCount(0);
});
```

- [ ] **Step 13: Run it**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-frames`
Expected: PASS. If a test fails, that is a spike finding — diagnose before changing the design:
- No iframe appears: `validateEmbeddable`/`renderEmbeddable` did not engage for a custom-scheme link. Try `validateEmbeddable={true}` temporarily to see whether validation is the cause, and record the result in the report.
- `convertToExcalidrawElements`/`restoreElements` dropped `link`: read `window.__orionBoard.api.getSceneElements()` in the browser and set `link` explicitly with `newElementWith` after restore.
- A "blocked" probe line reads "ALLOWED": the sandbox or CSP is not applied; that is a **no-go trigger**, so stop and record it.
- Activation needs a different gesture: adjust `activateFirstFrame`, keep the assertion.

- [ ] **Step 14: Typecheck, lint, astryx check, and unit tests**

Run: `pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation && pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw`
Expected: all pass.

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw e2e/canvas-excalidraw-frames.spec.ts
git commit -m "feat(canvas): render sandboxed script-enabled HTML frames on the Excalidraw board

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 5: Sketch to HTML generation (the DeepSeek path)

**Files:**
- Create: `sketch-request.ts`, `sketch-request.test.ts`, `sketch-prompt.ts`, `sketch-prompt.test.ts`, `generate-screen.ts`, `generate-screen.test.ts`, `build-screen.ts`, `build-screen.test.ts` (in `apps/web/src/features/canvas-excalidraw/`); `apps/web/src/app/api/dev/canvas-excalidraw/generate/route.ts`, `route.test.ts`; `e2e/canvas-excalidraw-generate.spec.ts`
- Modify: `excalidraw-board.tsx`

**Interfaces:**
- Consumes: `fakeGeneratedScreen` (fixtures), `isWorkspaceFakeEnabled` (`@/features/workspaces/e2e-gate`), `Screen`, `ScreenStore`, `addScreenFrame`, `nextFramePosition`.
- Produces:
  - `SketchRequestSchema`/`SketchRequest = { width: number; height: number; geometry: SketchShape[]; imageDataUrl?: string }`, `SketchShape = { type: string; x: number; y: number; width: number; height: number; text?: string }`.
  - `buildSketchPrompt(request: Pick<SketchRequest, "width" | "height" | "geometry">): { system: string; user: string }`.
  - `generateScreen(input: { prompt: {system: string; user: string}; imageDataUrl?: string; apiKey: string; model: string; fetch?: typeof fetch; timeoutMs?: number }): Promise<{ screenId: string; html: string }>`; `class GenerateError extends Error { code: "network" | "timeout" | "http" | "bad_json" | "invalid_screen" }`.
  - `postSketch(request: SketchRequest, fetchImpl?: typeof fetch): Promise<{ screenId: string; html: string }>`.
  - `collectSketch(api, frame): Promise<SketchRequest>`.
  - `POST /api/dev/canvas-excalidraw/generate` → `{ screenId, html }`.

- [ ] **Step 1: Write the failing schema test** — `sketch-request.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { SketchRequestSchema } from "./sketch-request";

const base = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 10, y: 10, width: 100, height: 40 }] };

describe("SketchRequestSchema", () => {
  it("accepts a normal request", () => {
    expect(SketchRequestSchema.safeParse(base).success).toBe(true);
  });
  it("rejects absurd sizes, too many shapes and extra keys", () => {
    expect(SketchRequestSchema.safeParse({ ...base, width: 0 }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, width: 100000 }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, geometry: Array(501).fill(base.geometry[0]) }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
  it("only accepts a png data URL for the image and caps its size", () => {
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: "data:image/png;base64,AAAA" }).success).toBe(true);
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: "https://example.com/x.png" }).success).toBe(false);
    expect(SketchRequestSchema.safeParse({ ...base, imageDataUrl: `data:image/png;base64,${"A".repeat(4_000_001)}` }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement — `sketch-request.ts`

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/sketch-request.test.ts` → FAIL.

```ts
import { z } from "zod";

export const SketchShapeSchema = z
  .object({
    type: z.string().min(1).max(40),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    text: z.string().max(500).optional(),
  })
  .strict();

export const SketchRequestSchema = z
  .object({
    width: z.number().int().min(100).max(4000),
    height: z.number().int().min(100).max(4000),
    geometry: z.array(SketchShapeSchema).max(500),
    imageDataUrl: z
      .string()
      .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
      .max(4_000_000)
      .optional(),
  })
  .strict();

export type SketchShape = z.infer<typeof SketchShapeSchema>;
export type SketchRequest = z.infer<typeof SketchRequestSchema>;
```

Run the test again → PASS.

- [ ] **Step 3: Write the failing prompt test** — `sketch-prompt.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { buildSketchPrompt } from "./sketch-prompt";

describe("buildSketchPrompt", () => {
  const request = {
    width: 480,
    height: 640,
    geometry: [
      { type: "rectangle", x: 10, y: 20, width: 200, height: 40 },
      { type: "text", x: 12, y: 24, width: 80, height: 20, text: "Email" },
    ],
  };
  it("states the frame size and lists each shape with its text", () => {
    const { user } = buildSketchPrompt(request);
    expect(user).toContain("480 x 640");
    expect(user).toContain("rectangle 200x40 at (10, 20)");
    expect(user).toContain('text 80x20 at (12, 24) "Email"');
  });
  it("tells the model how to link screens and what it may not load", () => {
    const { system } = buildSketchPrompt(request);
    expect(system).toContain("data-goto");
    expect(system).toContain("screenKey");
    expect(system).toMatch(/no external|inline/i);
  });
  it("lists at most 100 shapes and says when it trimmed", () => {
    const many = { ...request, geometry: Array(150).fill(request.geometry[0]) };
    const lines = buildSketchPrompt(many).user.split("\n").filter((line) => line.startsWith("- "));
    expect(lines).toHaveLength(100);
    expect(buildSketchPrompt(many).user).toContain("50 more shapes not listed");
  });
});
```

Run → FAIL. Implement — `sketch-prompt.ts`:

```ts
import type { SketchRequest } from "./sketch-request";

const MAX_LISTED = 100;

const SYSTEM = [
  "You turn a rough wireframe sketch into one complete, self-contained HTML screen.",
  "Return JSON only: {\"screenKey\": string, \"html\": string}.",
  "screenKey is a short lowercase slug matching ^[a-z][a-z0-9_-]{0,40}$ that names the screen.",
  "html is a full document (<!doctype html> through </html>) sized for the frame given by the user.",
  "Use inline CSS and, where behaviour is needed, inline <script>. No external resources: no remote URLs, links, fonts, images or imports. Use inline SVG or data: URIs for images and icons.",
  "Do not use <form> submission, <iframe>, <base> or <meta http-equiv>.",
  "To link to another screen, put data-goto=\"<screen-key>\" on a button or anchor, using lowercase slug keys. Do not use href for navigation.",
  "Treat the sketch as layout intent, not pixels: build a polished, consistent interface that follows its structure and any text in it.",
].join("\n");

export function buildSketchPrompt(request: Pick<SketchRequest, "width" | "height" | "geometry">): { system: string; user: string } {
  const listed = request.geometry.slice(0, MAX_LISTED);
  const lines = listed.map((shape) => {
    const text = shape.text ? ` "${shape.text}"` : "";
    return `- ${shape.type} ${Math.round(shape.width)}x${Math.round(shape.height)} at (${Math.round(shape.x)}, ${Math.round(shape.y)})${text}`;
  });
  const hidden = request.geometry.length - listed.length;
  const user = [
    `Frame size: ${request.width} x ${request.height}.`,
    "Shapes in the sketch, positions relative to the frame's top-left corner:",
    ...lines,
    ...(hidden > 0 ? [`${hidden} more shapes not listed.`] : []),
    "An image of the sketch may be attached; use it with the list above.",
  ].join("\n");
  return { system: SYSTEM, user };
}
```

Run → PASS.

- [ ] **Step 4: Write the failing generator test** — `generate-screen.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { GenerateError, generateScreen } from "./generate-screen";

const prompt = { system: "s", user: "u" };
const reply = (content: unknown, ok = true) =>
  vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), { status: ok ? 200 : 500 }));

describe("generateScreen", () => {
  it("returns a unique screen id built from the model's key", async () => {
    const fetch = reply({ screenKey: "login", html: "<html><body>Hi</body></html>" });
    const result = await generateScreen({ prompt, apiKey: "k", model: "m", fetch });
    expect(result.screenId).toMatch(/^login-[a-z0-9]{4}$/);
    expect(result.html).toContain("Hi");
  });
  it("sends the key as a bearer token, asks for JSON, and attaches the image", async () => {
    const fetch = reply({ screenKey: "a", html: "<p>x</p>" });
    await generateScreen({ prompt, imageDataUrl: "data:image/png;base64,AAAA", apiKey: "secret", model: "m", fetch });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,AAAA");
  });
  it("maps failures to typed errors", async () => {
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({}, false) })).rejects.toMatchObject({ code: "http" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply("not json") })).rejects.toMatchObject({ code: "bad_json" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({ screenKey: "Bad Key", html: "<p>x</p>" }) })).rejects.toMatchObject({ code: "invalid_screen" });
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: reply({ screenKey: "a", html: "plain text" }) })).rejects.toBeInstanceOf(GenerateError);
    await expect(generateScreen({ prompt, apiKey: "k", model: "m", fetch: vi.fn(async () => { throw new TypeError("down"); }) })).rejects.toMatchObject({ code: "network" });
  });
});
```

Run → FAIL. Implement — `generate-screen.ts`:

```ts
import { z } from "zod";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export type GenerateErrorCode = "network" | "timeout" | "http" | "bad_json" | "invalid_screen";

export class GenerateError extends Error {
  constructor(readonly code: GenerateErrorCode) {
    super(`Screen generation failed: ${code}`);
    this.name = "GenerateError";
  }
}

const ScreenReply = z.object({
  screenKey: z.string().regex(/^[a-z][a-z0-9_-]{0,40}$/),
  html: z.string().min(1).max(200_000).regex(/</),
});

export async function generateScreen(input: {
  prompt: { system: string; user: string };
  imageDataUrl?: string;
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): Promise<{ screenId: string; html: string }> {
  const doFetch = input.fetch ?? globalThis.fetch;
  const userContent = input.imageDataUrl
    ? [{ type: "text", text: input.prompt.user }, { type: "image_url", image_url: { url: input.imageDataUrl } }]
    : input.prompt.user;
  let response: Response;
  try {
    response = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: input.prompt.system }, { role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new GenerateError(timedOut ? "timeout" : "network");
  }
  if (!response.ok) throw new GenerateError("http");
  let raw: unknown;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    raw = JSON.parse(typeof content === "string" ? content : "");
  } catch {
    throw new GenerateError("bad_json");
  }
  const parsed = ScreenReply.safeParse(raw);
  if (!parsed.success) throw new GenerateError("invalid_screen");
  const suffix = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return { screenId: `${parsed.data.screenKey}-${suffix}`, html: parsed.data.html };
}
```

Run → PASS.

- [ ] **Step 5: Write the failing route test** — `apps/web/src/app/api/dev/canvas-excalidraw/generate/route.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const body = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 }] };
const post = (payload: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(payload) }));

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/dev/canvas-excalidraw/generate", () => {
  it("is not found outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post(body)).status).toBe(404);
  });
  it("rejects an invalid body", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await post({ width: 1 })).status).toBe(400);
  });
  it("returns a fixture screen in fake mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    const response = await post(body);
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.screenId).toMatch(/^generated-/);
    expect(json.html).toContain("Generated screen");
  });
  it("needs an API key outside fake mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "false");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect((await post(body)).status).toBe(503);
  });
});
```

Run → FAIL. Implement — `route.ts`:

```ts
import { fakeGeneratedScreen } from "@/features/canvas-excalidraw/fixtures";
import { GenerateError, generateScreen } from "@/features/canvas-excalidraw/generate-screen";
import { buildSketchPrompt } from "@/features/canvas-excalidraw/sketch-prompt";
import { SketchRequestSchema } from "@/features/canvas-excalidraw/sketch-request";
import { isWorkspaceFakeEnabled } from "@/features/workspaces/e2e-gate";

const MODEL = "deepseek-flash";

// Development-only. The production path will go through the existing
// generation task queue (delivery stage 2).
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = SketchRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (isWorkspaceFakeEnabled()) return Response.json(fakeGeneratedScreen());
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return Response.json({ error: "DEEPSEEK_API_KEY is not set" }, { status: 503 });
  try {
    return Response.json(
      await generateScreen({
        prompt: buildSketchPrompt(parsed.data),
        imageDataUrl: parsed.data.imageDataUrl,
        apiKey,
        model: process.env.DEEPSEEK_TEXT_MODEL || MODEL,
      }),
    );
  } catch (error) {
    return Response.json({ error: error instanceof GenerateError ? error.code : "failed" }, { status: 502 });
  }
}
```

Run → PASS: `pnpm --filter @meld/web exec vitest run src/app/api/dev/canvas-excalidraw`.

- [ ] **Step 6: Write the failing client test** — `build-screen.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { postSketch } from "./build-screen";

const request = { width: 480, height: 640, geometry: [] };

describe("postSketch", () => {
  it("returns the generated screen", async () => {
    const fetch = vi.fn(async () => Response.json({ screenId: "a-1234", html: "<p>x</p>" }));
    expect(await postSketch(request, fetch)).toEqual({ screenId: "a-1234", html: "<p>x</p>" });
    expect(fetch).toHaveBeenCalledWith("/api/dev/canvas-excalidraw/generate", expect.objectContaining({ method: "POST" }));
  });
  it("throws a readable error on failure and on a malformed reply", async () => {
    await expect(postSketch(request, vi.fn(async () => Response.json({ error: "http" }, { status: 502 })))).rejects.toThrow("http");
    await expect(postSketch(request, vi.fn(async () => Response.json({ nope: 1 })))).rejects.toThrow("malformed");
  });
});
```

Run → FAIL. Implement — `build-screen.ts`:

```ts
import { exportToBlob, getDataURL } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawFrameLikeElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { z } from "zod";
import type { SketchRequest } from "./sketch-request";

const Reply = z.object({ screenId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), html: z.string().min(1) });

export async function postSketch(
  request: SketchRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ screenId: string; html: string }> {
  const response = await fetchImpl("/api/dev/canvas-excalidraw/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : "failed";
    throw new Error(message);
  }
  const parsed = Reply.safeParse(json);
  if (!parsed.success) throw new Error("malformed reply");
  return parsed.data;
}

// What the model sees: an image of the frame plus the shapes inside it.
export async function collectSketch(
  api: ExcalidrawImperativeAPI,
  frame: ExcalidrawFrameLikeElement,
): Promise<SketchRequest> {
  const elements = api.getSceneElements();
  const children = elements.filter((element) => element.frameId === frame.id);
  const geometry = children.map((element: ExcalidrawElement) => ({
    type: element.type,
    x: Math.round(element.x - frame.x),
    y: Math.round(element.y - frame.y),
    width: Math.round(element.width),
    height: Math.round(element.height),
    ...(element.type === "text" ? { text: (element as ExcalidrawTextElement).text.slice(0, 500) } : {}),
  }));
  const blob = await exportToBlob({
    elements,
    appState: { exportBackground: true, viewBackgroundColor: "white" },
    files: api.getFiles(),
    mimeType: "image/png",
    exportingFrame: frame,
    maxWidthOrHeight: 1024,
  });
  return {
    width: Math.max(100, Math.round(frame.width)),
    height: Math.max(100, Math.round(frame.height)),
    geometry: geometry.slice(0, 500),
    imageDataUrl: await getDataURL(blob),
  };
}
```

Run `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/build-screen.test.ts` → PASS. (`collectSketch` is exercised by the end-to-end test; it imports Excalidraw, so `build-screen.test.ts` imports only `postSketch`. If vitest cannot import the Excalidraw module graph in node, move `postSketch` to `post-sketch.ts` and `collectSketch` stays in `build-screen.ts`; update the test import and the Files list.)

- [ ] **Step 7: Add the "Build screen" action to the board**

In `excalidraw-board.tsx`:
1. Add imports: `import { collectSketch, postSketch } from "./build-screen";`
2. Add state: `const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null); const [status, setStatus] = useState("");`
3. Add the handler inside the component:

```tsx
  const buildScreen = useCallback(async () => {
    if (!api || !selectedFrameId) return;
    const frame = api.getSceneElements().find((element) => element.id === selectedFrameId);
    if (!frame || (frame.type !== "frame" && frame.type !== "magicframe")) return;
    setStatus("Building screen…");
    try {
      const screen = await postSketch(await collectSketch(api, frame));
      store.set({ id: screen.screenId, rev: 1, html: screen.html });
      addScreenFrame(api, { screenId: screen.screenId, x: frame.x + frame.width + 80, y: frame.y, width: frame.width, height: frame.height });
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? `Could not build the screen: ${error.message}` : "Could not build the screen");
    }
  }, [api, selectedFrameId, store]);
```

4. Add a toolbar button after "Add loop screen": `<Button label="Build screen" size="sm" variant="primary" isDisabled={!selectedFrameId || access === "view"} onClick={() => void buildScreen()} />` and `{status ? <Text role="status">{status}</Text> : null}`.
5. Add to `<Excalidraw>`: 

```tsx
          onChange={(elements, appState) => {
            const selected = elements.find((element) => appState.selectedElementIds[element.id] && !element.isDeleted && (element.type === "frame" || element.type === "magicframe"));
            setSelectedFrameId(selected ? selected.id : null);
          }}
```

- [ ] **Step 8: Write the end-to-end spec** — `e2e/canvas-excalidraw-generate.spec.ts`

```ts
import { test, expect } from "@playwright/test";

test("a sketch inside a frame becomes a live screen beside it", async ({ page }) => {
  await page.goto("/dev/canvas-excalidraw");
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  // Draw a frame with a rectangle in it through the scene API.
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    const elements = convert([
      { type: "rectangle", id: "box", x: 40, y: 40, width: 200, height: 60 },
      { type: "frame", id: "sketch", x: 0, y: 0, width: 400, height: 500, children: ["box"] },
    ]);
    api.updateScene({ elements });
    api.updateScene({ appState: { selectedElementIds: { sketch: true } } });
  });
  await expect(page.getByRole("button", { name: "Build screen" })).toBeEnabled();
  await page.getByRole("button", { name: "Build screen" }).click();
  const generated = page.locator('iframe[data-orion-frame^="generated-"]');
  await expect(generated).toBeVisible();
  await expect(page.frameLocator('iframe[data-orion-frame^="generated-"]').getByRole("heading", { name: "Generated screen" })).toBeVisible();
});
```

- [ ] **Step 9: Run everything for this task**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw src/app/api/dev && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation`
Expected: all pass.

- [ ] **Step 10: Real-model smoke (manual; do not commit the key)**

With `DEEPSEEK_API_KEY` exported and `MELD_E2E_FAKE_WORKSPACES` unset, run `pnpm --filter @meld/web dev`, open `/dev/canvas-excalidraw`, draw a frame with a few rectangles and text, select it, click **Build screen**. Record in the report: did a plausible screen appear, did `data-goto` links work, any console errors. Skip and say so in the report if no key is available.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src e2e/canvas-excalidraw-generate.spec.ts
git commit -m "feat(canvas): build an HTML screen from a sketch frame

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Build with the owner's own AI first, DeepSeek as the fallback

**Files:**
- Create (in `apps/web/src/features/canvas-excalidraw/`): `screen-generator.ts`, `screen-generator.test.ts`, `sketch-layout-adapter.ts`, `sketch-layout-adapter.test.ts`, `own-ai-generator.ts`, `own-ai-generator.test.ts`, `own-ai-deps.ts`; `apps/web/src/features/canvas-excalidraw/load-screen.ts` (server action); `e2e/canvas-excalidraw-own-ai.spec.ts`
- Modify: `excalidraw-board.tsx`, `board-loader.tsx`, `apps/web/src/app/dev/canvas-excalidraw/page.tsx`

**Interfaces:**
- Consumes: `SketchRequest` (Task 5), `postSketch` (Task 5, the DeepSeek path), `generateDesignScreen`, `getDesignScreenGeneration` (`apps/web/src/features/design/design-screen-generation.ts`), `serializeSketch`, `SketchLayout` (`@meld/prototype`), `AITaskStatus` (`@meld/contracts`), `fetchTaskStatuses(roomId)` (wired the way `apps/web/src/features/prd/components/room-task-status-provider.tsx` line ~125 does), `listRoomCanvasScreens` (`apps/web/src/features/design/canvas-screen-reader.ts`), `buildFramePreviewDoc` (`apps/web/src/features/canvas/screen-preview-doc.ts`).
- Produces:
  - `type FallbackReason = "no_connection" | "usage_limit" | "needs_sign_in" | "failed" | "timeout"`; `class OwnAiUnavailable extends Error { reason: FallbackReason; detail?: string }`.
  - `type GeneratedScreen = { screenId: string; html: string; via: "own-ai" | "deepseek"; provider: string | null; fellBackBecause?: FallbackReason }`.
  - `type ScreenGenerator = (input: { request: SketchRequest; instruction: string; signal?: AbortSignal }) => Promise<{ screenId: string; html: string; provider: string | null }>`.
  - `buildWithFallback(input: { request; instruction; ownAi: ScreenGenerator | null; fallback: ScreenGenerator; signal?: AbortSignal }): Promise<GeneratedScreen>`; `describeOutcome(screen: GeneratedScreen): string`.
  - `toSketchLayout(request: Pick<SketchRequest, "width" | "height" | "geometry">): SketchLayout`.
  - `createOwnAiGenerator(deps: OwnAiDeps, options?: { pollMs?: number; maxPolls?: number; maxWaitingPolls?: number }): ScreenGenerator`.
  - Page option `?room=<uuid>`: the room whose connected AI is used. Without it, or with no connected AI, the fallback runs.

**How it fits the existing product.** Your AIs are already connected through the connector (providers `codex`, `claude`, `deepseek`), and design screens are generated by queueing a `design_screen_generate` task; the task's status can read `usage_limit_reached` or `needs_reauthentication`. The spike reuses that queue unchanged, so no schema, contract or connector change. DeepSeek here means the direct server-side call from Task 5. Limits of this task, to state in the report:
- The existing generator returns structured screens with no scripts and its own action links, assembled into a page by `buildFramePreviewDoc`. Pages built through the owner's AI therefore carry no scripts and do not yet use `data-goto` links; script-enabled and linked generation through the queue is delivery stages 2 and 6.
- With `?room=<uuid>` on a real (non-fake) run, each build writes a real design screen into that room. It is opt-in and only ever happens in development. The fake gate uses the existing in-memory fake, so tests write nothing.

- [ ] **Step 1: Write the failing orchestrator test** — `screen-generator.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { buildWithFallback, describeOutcome, OwnAiUnavailable, type ScreenGenerator } from "./screen-generator";

const request = { width: 480, height: 640, geometry: [] };
const own: ScreenGenerator = async () => ({ screenId: "own-1", html: "<p>own</p>", provider: "claude" });
const deepseek: ScreenGenerator = async () => ({ screenId: "gen-1", html: "<p>ds</p>", provider: null });
const run = (ownAi: ScreenGenerator | null, fallback: ScreenGenerator = deepseek, signal?: AbortSignal) =>
  buildWithFallback({ request, instruction: "x", ownAi, fallback, signal });

describe("buildWithFallback", () => {
  it("uses the owner's AI when it works", async () => {
    const fallback = vi.fn(deepseek);
    const out = await run(own, fallback);
    expect(out).toMatchObject({ via: "own-ai", provider: "claude", screenId: "own-1" });
    expect(out.fellBackBecause).toBeUndefined();
    expect(fallback).not.toHaveBeenCalled();
  });
  it("falls back to DeepSeek, saying why, for each unavailable reason", async () => {
    for (const reason of ["no_connection", "usage_limit", "needs_sign_in", "failed", "timeout"] as const) {
      const out = await run(async () => { throw new OwnAiUnavailable(reason); });
      expect(out).toMatchObject({ via: "deepseek", fellBackBecause: reason, screenId: "gen-1" });
    }
  });
  it("treats an unexpected error from the owner's AI as a failure and falls back", async () => {
    const out = await run(async () => { throw new TypeError("boom"); });
    expect(out.fellBackBecause).toBe("failed");
  });
  it("falls back with no_connection, without calling anything, when there is no own-AI generator", async () => {
    expect((await run(null)).fellBackBecause).toBe("no_connection");
  });
  it("does not fall back when the owner cancels", async () => {
    const controller = new AbortController();
    controller.abort();
    const fallback = vi.fn(deepseek);
    await expect(run(async () => { throw new DOMException("x", "AbortError"); }, fallback, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fallback).not.toHaveBeenCalled();
  });
  it("lets a fallback failure through", async () => {
    await expect(run(null, async () => { throw new Error("deepseek down"); })).rejects.toThrow("deepseek down");
  });
});

describe("describeOutcome", () => {
  it("names the AI that built it, or why DeepSeek stepped in", () => {
    expect(describeOutcome({ screenId: "a", html: "", via: "own-ai", provider: "claude" })).toBe("Built with your AI (claude).");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "usage_limit" })).toBe("Your AI has reached its usage limit, so DeepSeek built this screen.");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "no_connection" })).toBe("No AI of yours is connected here, so DeepSeek built this screen.");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "needs_sign_in" })).toContain("sign in again");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "failed" })).toContain("could not finish");
    expect(describeOutcome({ screenId: "a", html: "", via: "deepseek", provider: null, fellBackBecause: "timeout" })).toContain("took too long");
  });
});
```

- [ ] **Step 2: Run to verify it fails**, then implement — `screen-generator.ts`

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/screen-generator.test.ts` → FAIL.

```ts
import type { SketchRequest } from "./sketch-request";

export type FallbackReason = "no_connection" | "usage_limit" | "needs_sign_in" | "failed" | "timeout";

export class OwnAiUnavailable extends Error {
  constructor(readonly reason: FallbackReason, readonly detail?: string) {
    super(`Own AI unavailable: ${reason}`);
    this.name = "OwnAiUnavailable";
  }
}

export type GeneratedScreen = {
  screenId: string;
  html: string;
  via: "own-ai" | "deepseek";
  provider: string | null;
  fellBackBecause?: FallbackReason;
};

export type ScreenGenerator = (input: {
  request: SketchRequest;
  instruction: string;
  signal?: AbortSignal;
}) => Promise<{ screenId: string; html: string; provider: string | null }>;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

// The owner's connected AI first; DeepSeek when there is none, it is at its
// limit, it needs a fresh sign-in, or it failed. Cancelling never falls back.
export async function buildWithFallback(input: {
  request: SketchRequest;
  instruction: string;
  ownAi: ScreenGenerator | null;
  fallback: ScreenGenerator;
  signal?: AbortSignal;
}): Promise<GeneratedScreen> {
  const { request, instruction, signal } = input;
  let reason: FallbackReason = "no_connection";
  if (input.ownAi) {
    try {
      const built = await input.ownAi({ request, instruction, signal });
      return { ...built, via: "own-ai" };
    } catch (error) {
      if (isAbort(error)) throw error;
      reason = error instanceof OwnAiUnavailable ? error.reason : "failed";
    }
  }
  const built = await input.fallback({ request, instruction, signal });
  return { ...built, via: "deepseek", fellBackBecause: reason };
}

const WHY: Record<FallbackReason, string> = {
  no_connection: "No AI of yours is connected here",
  usage_limit: "Your AI has reached its usage limit",
  needs_sign_in: "Your AI needs you to sign in again",
  failed: "Your AI could not finish",
  timeout: "Your AI took too long",
};

export function describeOutcome(screen: GeneratedScreen): string {
  if (screen.via === "own-ai") return `Built with your AI (${screen.provider ?? "connected"}).`;
  return `${WHY[screen.fellBackBecause ?? "no_connection"]}, so DeepSeek built this screen.`;
}
```

Run → PASS.

- [ ] **Step 3: Write the failing layout adapter test** — `sketch-layout-adapter.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { toSketchLayout } from "./sketch-layout-adapter";

describe("toSketchLayout", () => {
  it("buckets shapes by position and size inside the frame, keeping text", () => {
    const layout = toSketchLayout({
      width: 400,
      height: 600,
      geometry: [
        { type: "rectangle", x: 10, y: 10, width: 380, height: 60 },
        { type: "text", x: 150, y: 290, width: 100, height: 20, text: "Welcome" },
        { type: "diamond", x: 300, y: 540, width: 80, height: 40 },
      ],
    });
    expect(layout.truncated).toBe(false);
    expect(layout.boxes[0]).toMatchObject({ shapeKind: "rectangle", position: { vertical: "top", horizontal: "center" }, size: { width: "full" } });
    expect(layout.boxes.find((box) => box.text === "Welcome")).toMatchObject({ shapeKind: "text", position: { vertical: "middle", horizontal: "center" } });
    expect(layout.boxes.at(-1)).toMatchObject({ shapeKind: "other", position: { vertical: "bottom", horizontal: "right" } });
  });
  it("marks a very busy sketch as truncated", () => {
    const geometry = Array.from({ length: 70 }, (_, i) => ({ type: "rectangle", x: i, y: i, width: 10, height: 10 }));
    const layout = toSketchLayout({ width: 400, height: 600, geometry });
    expect(layout.boxes).toHaveLength(60);
    expect(layout.truncated).toBe(true);
  });
});
```

Run → FAIL. Implement — `sketch-layout-adapter.ts`:

```ts
import { serializeSketch, type SketchLayout } from "@meld/prototype";
import type { SketchRequest } from "./sketch-request";

// The sketch region's shapes, in the form the existing screen generator takes.
export function toSketchLayout(request: Pick<SketchRequest, "width" | "height" | "geometry">): SketchLayout {
  return serializeSketch(
    request.geometry.map((shape) => ({
      kind: shape.type,
      x: shape.x,
      y: shape.y,
      w: shape.width,
      h: shape.height,
      text: shape.text ?? null,
    })),
    { x: 0, y: 0, w: request.width, h: request.height },
  );
}
```

Run → PASS. (The test's position expectations assume `serializeSketch`'s thirds; if one of them is off by a bucket, fix the test's coordinates, not the function.)

- [ ] **Step 4: Write the failing own-AI generator test** — `own-ai-generator.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { createOwnAiGenerator, type OwnAiDeps } from "./own-ai-generator";
import { OwnAiUnavailable } from "./screen-generator";

const request = { width: 480, height: 640, geometry: [{ type: "rectangle", x: 0, y: 0, width: 100, height: 40 }] };
const input = { request, instruction: "A login screen" };
const SCREEN = "3f1c2b7a-1111-4111-8111-aaaaaaaaaaaa";

function deps(overrides: Partial<OwnAiDeps> = {}): OwnAiDeps {
  return {
    start: vi.fn(async () => ({ status: "queued" as const, taskId: "t1", screenId: SCREEN })),
    generation: vi.fn(async () => ({ versionId: "v1" })),
    taskStatus: vi.fn(async () => ({ status: "completed" as const, provider: "claude" })),
    loadDocument: vi.fn(async () => "<html><body>built</body></html>"),
    wait: async () => undefined,
    ...overrides,
  };
}
const make = (d: OwnAiDeps) => createOwnAiGenerator(d, { pollMs: 0, maxPolls: 6, maxWaitingPolls: 3 });

describe("createOwnAiGenerator", () => {
  it("queues with the sketch layout, waits for the version, and returns the page", async () => {
    const d = deps();
    const out = await make(d)(input);
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ instruction: "A login screen", layout: expect.objectContaining({ boxes: expect.any(Array) }) }));
    expect(out).toEqual({ screenId: "own-3f1c2b7a", html: "<html><body>built</body></html>", provider: "claude" });
  });
  it("keeps polling while the task runs", async () => {
    let calls = 0;
    const d = deps({
      generation: vi.fn(async () => (++calls < 3 ? { versionId: null } : { versionId: "v1" })),
      taskStatus: vi.fn(async () => ({ status: "running" as const, provider: "codex" })),
    });
    expect((await make(d)(input)).provider).toBe("codex");
  });
  it.each([
    ["usage_limit_reached", "usage_limit"],
    ["needs_reauthentication", "needs_sign_in"],
    ["failed", "failed"],
    ["cancelled", "failed"],
    ["needs_review", "failed"],
  ] as const)("maps task status %s to %s", async (status, reason) => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason });
  });
  it("reports no connection when the queue refuses the task", async () => {
    const d = deps({ start: vi.fn(async () => ({ status: "error" as const, message: "no device" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "no_connection" });
  });
  it("reports no connection when the device never picks the task up", async () => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status: "waiting_for_device" as const, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "no_connection" });
  });
  it("times out when nothing finishes", async () => {
    const d = deps({ generation: vi.fn(async () => ({ versionId: null })), taskStatus: vi.fn(async () => ({ status: "running" as const, provider: "claude" })) });
    await expect(make(d)(input)).rejects.toMatchObject({ reason: "timeout" });
  });
  it("treats a version whose page cannot be loaded as a failure", async () => {
    const d = deps({ loadDocument: vi.fn(async () => null) });
    await expect(make(d)(input)).rejects.toBeInstanceOf(OwnAiUnavailable);
  });
  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(make(deps())({ ...input, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
```

Run → FAIL. Implement — `own-ai-generator.ts`:

```ts
import type { AITaskStatus } from "@meld/contracts";
import type { SketchLayout } from "@meld/prototype";
import { toSketchLayout } from "./sketch-layout-adapter";
import { OwnAiUnavailable, type FallbackReason, type ScreenGenerator } from "./screen-generator";

export type OwnAiDeps = {
  start(input: { name: string; instruction: string; layout: SketchLayout }): Promise<
    { status: "queued"; taskId: string; screenId: string } | { status: "error"; message: string }
  >;
  generation(taskId: string): Promise<{ versionId: string | null } | null>;
  taskStatus(taskId: string): Promise<{ status: AITaskStatus; provider: string } | null>;
  loadDocument(screenId: string): Promise<string | null>;
  wait?(ms: number): Promise<void>;
};

const BAD_END: Partial<Record<AITaskStatus, FallbackReason>> = {
  usage_limit_reached: "usage_limit",
  needs_reauthentication: "needs_sign_in",
  failed: "failed",
  cancelled: "failed",
  needs_review: "failed",
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createOwnAiGenerator(
  deps: OwnAiDeps,
  options: { pollMs?: number; maxPolls?: number; maxWaitingPolls?: number } = {},
): ScreenGenerator {
  const pollMs = options.pollMs ?? 2000;
  const maxPolls = options.maxPolls ?? 150; // 5 minutes at 2 s
  const maxWaitingPolls = options.maxWaitingPolls ?? 8; // ~16 s with no device
  const wait = deps.wait ?? sleep;

  return async ({ request, instruction, signal }) => {
    const aborted = () => new DOMException("Cancelled", "AbortError");
    if (signal?.aborted) throw aborted();
    const started = await deps.start({ name: "Sketch screen", instruction, layout: toSketchLayout(request) });
    if (started.status === "error") throw new OwnAiUnavailable("no_connection", started.message);

    let waiting = 0;
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (signal?.aborted) throw aborted();
      const generation = await deps.generation(started.taskId);
      const status = await deps.taskStatus(started.taskId);
      if (generation?.versionId) {
        const html = await deps.loadDocument(started.screenId);
        if (!html) throw new OwnAiUnavailable("failed", "The built screen could not be loaded");
        return { screenId: `own-${started.screenId.slice(0, 8)}`, html, provider: status?.provider ?? null };
      }
      const bad = status ? BAD_END[status.status] : undefined;
      if (bad) throw new OwnAiUnavailable(bad);
      waiting = status?.status === "waiting_for_device" ? waiting + 1 : 0;
      if (waiting >= maxWaitingPolls) throw new OwnAiUnavailable("no_connection", "No device picked the task up");
      await wait(pollMs);
    }
    throw new OwnAiUnavailable("timeout");
  };
}
```

Run → PASS. Note `screenId.slice(0, 8)` of a UUID is lowercase hex, so `own-xxxxxxxx` matches the screen-id pattern.

- [ ] **Step 5: Wire the real dependencies** — `load-screen.ts` (server action) and `own-ai-deps.ts` (client)

`load-screen.ts`:

```ts
"use server";

import { listRoomCanvasScreens } from "@/features/design/canvas-screen-reader";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

// The built screen as the existing reader returns it; the client assembles the
// page with the same theme CSS the canvas preview uses.
export async function loadRoomScreen(roomId: string, screenId: string): Promise<CanvasScreen | null> {
  const screens = await listRoomCanvasScreens(roomId);
  return screens.find((screen) => screen.id === screenId) ?? null;
}
```

`own-ai-deps.ts`: export `createRoomOwnAiDeps(roomId: string): OwnAiDeps` with:
- `start`: `(input) => generateDesignScreen({ roomId, name: input.name, instruction: input.instruction, layout: input.layout })` (no `provider`: the owner's default connected AI is used).
- `generation`: `async (taskId) => { const g = await getDesignScreenGeneration(taskId); return g ? { versionId: g.versionId } : null; }`.
- `taskStatus`: wire it exactly as `apps/web/src/features/prd/components/room-task-status-provider.tsx` does at line ~125 (`fetchTaskStatuses(roomId)`; read that file for the import and any client it needs), then `async (taskId) => { const row = (await fetchTaskStatuses(roomId)).find((s) => s.taskId === taskId); return row ? { status: row.status, provider: row.provider } : null; }`.
- `loadDocument`: `async (screenId) => { const screen = await loadRoomScreen(roomId, screenId); if (!screen) return null; return buildFramePreviewDoc(screen, tokenCss, componentCss); }` with `tokenCss`/`componentCss` obtained the way `apps/web/src/features/canvas-next/canvas-prototype.tsx` and `preview-theme.ts` obtain `tokenCss` and `previewChromeCss` (read both and copy that approach; `buildFramePreviewDoc` returns `null` for an unbuilt screen).

This file needs no unit test of its own beyond what `own-ai-generator.test.ts` covers (it contains only wiring); the end-to-end test in Step 7 exercises it through the existing fake.

- [ ] **Step 6: Use it from the board**

1. `page.tsx`: read `room` like `board` (`first(params.room)`, validated with the same `UUID` regex) and pass `roomId` to `<BoardLoader>`; extend `BoardLoader`'s props and the board's props with `roomId?: string`.
2. In `excalidraw-board.tsx` replace the direct `postSketch` call in `buildScreen` with:

```tsx
    const ownAi = roomId ? createOwnAiGenerator(createRoomOwnAiDeps(roomId)) : null;
    const deepseek: ScreenGenerator = async ({ request }) => ({ ...(await postSketch(request)), provider: null });
    const built = await buildWithFallback({ request: await collectSketch(api, frame), instruction: instruction.trim() || "Build this sketch as a polished screen.", ownAi, fallback: deepseek });
    store.set({ id: built.screenId, rev: 1, html: built.html });
    addScreenFrame(api, { screenId: built.screenId, x: frame.x + frame.width + 80, y: frame.y, width: frame.width, height: frame.height });
    setStatus(describeOutcome(built));
```

   (imports: `createOwnAiGenerator`, `createRoomOwnAiDeps`, `buildWithFallback`, `describeOutcome`, `type ScreenGenerator`). Keep the existing `try/catch` that shows "Could not build the screen: …" when even the fallback fails.
3. Add an Astryx text field for the instruction above the **Build screen** button, with state `const [instruction, setInstruction] = useState("")`. Run `pnpm exec astryx component TextField` (or `astryx search "text input"`) and use the component and props it documents; label it "Describe this screen".

- [ ] **Step 7: Write the end-to-end spec** — `e2e/canvas-excalidraw-own-ai.spec.ts`

```ts
import { test, expect, type Page } from "@playwright/test";

// The existing in-memory fake room (apps/web/src/features/rooms/e2e-fake.ts).
const FAKE_ROOM = "40000000-0000-4000-8000-000000000001";

async function drawSketchFrame(page: Page) {
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    api.updateScene({
      elements: convert([
        { type: "rectangle", id: "box", x: 40, y: 40, width: 200, height: 60 },
        { type: "frame", id: "sketch", x: 0, y: 0, width: 400, height: 500, children: ["box"] },
      ]),
    });
    api.updateScene({ appState: { selectedElementIds: { sketch: true } } });
  });
}

test("with a room, the owner's AI builds the screen through the existing queue", async ({ page }) => {
  await page.goto(`/dev/canvas-excalidraw?room=${FAKE_ROOM}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawSketchFrame(page);
  await page.getByRole("button", { name: "Build screen" }).click();
  await expect(page.locator('iframe[data-orion-frame^="own-"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Built with your AI/)).toBeVisible();
});

test("without a room, DeepSeek builds it and says why", async ({ page }) => {
  await page.goto("/dev/canvas-excalidraw");
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawSketchFrame(page);
  await page.getByRole("button", { name: "Build screen" }).click();
  await expect(page.locator('iframe[data-orion-frame^="generated-"]')).toBeVisible();
  await expect(page.getByText("No AI of yours is connected here, so DeepSeek built this screen.")).toBeVisible();
});
```

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-own-ai canvas-excalidraw-generate`
Expected: PASS. If the fake room's generation never materialises a version for the first test, read `fakeListRoomTaskStatuses` and `fakeGetDesignScreenGeneration` in `apps/web/src/features/rooms/e2e-fake.ts` to see what advances the fake task (the room page's poll normally drives it); if the spike's own polling does not advance it, call the same fetcher the room provider uses (it advances the fake as a side effect) and record that in the report. If the fake room cannot be made to complete a task from this route at all, keep the second test, mark the first `test.fixme` with the reason, and say so in the report; the pure tests in Steps 1-4 still cover the logic.

- [ ] **Step 8: Real-account smoke (manual; do not commit keys)**

With a normal (non-fake) dev run, a signed-in account, a connected AI and a room id: open `/dev/canvas-excalidraw?room=<room uuid>`, build from a sketch, and record in the report which AI built it, how long it took, and that a design screen appeared in that room. Then disconnect the AI (or use a room with none) and confirm DeepSeek steps in with the right message; if you can reach a usage limit, record that too. Skip and say so if no account is available.

- [ ] **Step 9: Verify and commit**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation`

```bash
git add apps/web/src e2e/canvas-excalidraw-own-ai.spec.ts
git commit -m "feat(canvas): build screens with the owner's own AI, DeepSeek as fallback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Save and reopen (single user)

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/board-persistence.ts`, `board-persistence.test.ts`, `e2e/canvas-excalidraw-persistence.spec.ts`
- Modify: `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`

**Interfaces:**
- Consumes: `Screen`, `createScreenStore` (Task 4).
- Produces:
  - `SavedBoard = { version: 1; elements: { id: string; type: string; [key: string]: unknown }[]; screens: Screen[] }`, `MAX_SAVED_BYTES`.
  - `boardStorageKey(boardId?: string): string`.
  - `encodeBoard(elements: readonly { id: string; type: string; isDeleted?: boolean }[], screens: Screen[]): string` (drops deleted elements).
  - `decodeBoard(raw: string | null): SavedBoard | null` (null for missing, oversized, malformed or invalid data).
  - `loadBoard(storage: Pick<Storage, "getItem">, key: string): SavedBoard | null`, `saveBoard(storage: Pick<Storage, "setItem">, key: string, elements, screens): boolean` (false when the write fails, for example quota).

The spike saves to the browser's `localStorage` (about 5 MB). It does not persist pasted images. Server saving, revision checks and recovery copies are delivery stage 2.

- [ ] **Step 1: Write the failing test** — `board-persistence.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import { boardStorageKey, decodeBoard, encodeBoard, loadBoard, MAX_SAVED_BYTES, saveBoard } from "./board-persistence";

const rect = { id: "r1", type: "rectangle", x: 1, y: 2, version: 3 };
const screen = { id: "welcome", rev: 1, html: "<p>hi</p>" };

describe("board persistence", () => {
  it("round-trips elements and screens and drops deleted elements", () => {
    const raw = encodeBoard([rect, { id: "gone", type: "ellipse", isDeleted: true }], [screen]);
    expect(decodeBoard(raw)).toEqual({ version: 1, elements: [rect], screens: [screen] });
  });
  it("keys boards separately, with a default for no id", () => {
    expect(boardStorageKey("abc")).toBe("orion:canvas-excalidraw:abc");
    expect(boardStorageKey()).toBe("orion:canvas-excalidraw:local");
  });
  it("rejects missing, malformed, wrong-version and invalid data", () => {
    expect(decodeBoard(null)).toBeNull();
    expect(decodeBoard("not json")).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 2, elements: [], screens: [] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: "x", screens: [] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: [], screens: [{ id: "Bad Id", rev: 1, html: "x" }] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: [{ nope: 1 }], screens: [] }))).toBeNull();
  });
  it("rejects data over the size cap", () => {
    expect(decodeBoard("x".repeat(MAX_SAVED_BYTES + 1))).toBeNull();
  });
  it("loads through storage and reports a failed save", () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) };
    expect(saveBoard(storage, "k", [rect], [screen])).toBe(true);
    expect(loadBoard(storage, "k")?.elements).toEqual([rect]);
    expect(loadBoard(storage, "missing")).toBeNull();
    const full = { setItem: vi.fn(() => { throw new DOMException("full", "QuotaExceededError"); }) };
    expect(saveBoard(full, "k", [rect], [screen])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/board-persistence.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `board-persistence.ts`

```ts
import { z } from "zod";
import type { Screen } from "./screen-store";

export const MAX_SAVED_BYTES = 4_000_000;

const ScreenSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    rev: z.number().int().min(1),
    html: z.string().max(200_000),
  })
  .strict();

const SavedSchema = z
  .object({
    version: z.literal(1),
    elements: z.array(z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough()).max(5000),
    screens: z.array(ScreenSchema).max(200),
  })
  .strict();

export type SavedBoard = z.infer<typeof SavedSchema>;

export function boardStorageKey(boardId?: string): string {
  return `orion:canvas-excalidraw:${boardId ?? "local"}`;
}

export function encodeBoard(
  elements: readonly { id: string; type: string; isDeleted?: boolean }[],
  screens: Screen[],
): string {
  return JSON.stringify({ version: 1, elements: elements.filter((element) => !element.isDeleted), screens });
}

export function decodeBoard(raw: string | null): SavedBoard | null {
  if (!raw || raw.length > MAX_SAVED_BYTES) return null;
  try {
    const parsed = SavedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function loadBoard(storage: Pick<Storage, "getItem">, key: string): SavedBoard | null {
  return decodeBoard(storage.getItem(key));
}

export function saveBoard(
  storage: Pick<Storage, "setItem">,
  key: string,
  elements: readonly { id: string; type: string; isDeleted?: boolean }[],
  screens: Screen[],
): boolean {
  try {
    storage.setItem(key, encodeBoard(elements, screens));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: same as Step 2. Expected: PASS.

- [ ] **Step 5: Wire the board** — in `excalidraw-board.tsx`

1. Imports: add `getSceneVersion, restoreElements` to the `@excalidraw/excalidraw` import, `useEffect, useRef` to the React import, and `import { boardStorageKey, loadBoard, saveBoard } from "./board-persistence";`.
2. Take `boardId` from props: `export function ExcalidrawBoard({ boardId, access }: { boardId?: string; access: "edit" | "view" })`.
3. Replace the `store` line with:

```tsx
  const storageKey = boardStorageKey(boardId);
  const saved = useMemo(() => loadBoard(window.localStorage, storageKey), [storageKey]);
  const store = useMemo(() => {
    const created = createScreenStore();
    for (const screen of saved?.screens ?? []) created.set(screen);
    return created;
  }, [saved]);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSavedVersion = useRef(-1);
  const pending = useRef<readonly ExcalidrawElement[] | null>(null);

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current);
    const elements = pending.current;
    if (!elements) return;
    pending.current = null;
    lastSavedVersion.current = getSceneVersion(elements);
    setSaveFailed(!saveBoard(window.localStorage, storageKey, elements, store.all()));
  }, [storageKey, store]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);
```

and import the type `import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";`.
4. Extend the existing `onChange` so, after setting the selected frame, it adds:

```tsx
            if (getSceneVersion(elements) !== lastSavedVersion.current) {
              pending.current = elements;
              clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(flush, 400);
            }
```

5. Restore on mount: add to `<Excalidraw>`:

```tsx
          initialData={saved ? { elements: restoreElements(saved.elements as unknown as ExcalidrawElement[], null), scrollToContent: true } : undefined}
```

6. Toolbar: add `<Button label="Clear board" size="sm" variant="ghost" isDisabled={!api || access === "view"} onClick={() => { if (!api) return; window.localStorage.removeItem(storageKey); api.resetScene(); }} />` and `{saveFailed ? <Text role="status">Could not save this board in the browser. Export is not available yet.</Text> : null}`.

- [ ] **Step 6: Write the end-to-end spec** — `e2e/canvas-excalidraw-persistence.spec.ts`

```ts
import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const key = (board: string) => `orion:canvas-excalidraw:${board}`;
const savedLength = (page: Page, board: string) =>
  page.evaluate((k) => localStorage.getItem(k)?.length ?? 0, key(board));
const elementCount = (page: Page) => page.evaluate(() => window.__orionBoard!.api.getSceneElements().length);

async function drawRectangle(page: Page) {
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    const added = convert([{ type: "rectangle", id: "kept", x: 20, y: 20, width: 100, height: 60 }]);
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added] });
  });
}

test("a board and its screens survive a reload", async ({ page }) => {
  const board = randomUUID();
  await page.goto(`/dev/canvas-excalidraw?board=${board}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawRectangle(page);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect.poll(() => savedLength(page, board)).toBeGreaterThan(0);

  await page.reload();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect(page.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");
});

test("boards with different ids do not share content", async ({ page }) => {
  const first = randomUUID();
  await page.goto(`/dev/canvas-excalidraw?board=${first}`);
  await drawRectangle(page);
  await expect.poll(() => savedLength(page, first)).toBeGreaterThan(0);
  await page.goto(`/dev/canvas-excalidraw?board=${randomUUID()}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  expect(await elementCount(page)).toBe(0);
});

test("a failed save is shown", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name.startsWith("orion:canvas-excalidraw:")) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  });
  await page.goto(`/dev/canvas-excalidraw?board=${randomUUID()}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawRectangle(page);
  await expect(page.getByText("Could not save this board in the browser")).toBeVisible();
});
```

- [ ] **Step 7: Run everything for this task**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-persistence && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation`
Expected: pass. If `initialData` is ignored when the Excalidraw component mounts before `restoreElements` runs, fall back to `api.updateScene({ elements: restoreElements(...), captureUpdate: CaptureUpdateAction.NEVER })` inside `onApi` and record that in the report.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src e2e/canvas-excalidraw-persistence.spec.ts
git commit -m "feat(canvas): save and reopen a board in the browser

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Stress: 20 live frames and a runaway script

**Files:**
- Create: `e2e/canvas-excalidraw-stress.spec.ts`

**Interfaces:**
- Consumes: `window.__orionBoard.addFrames(count, key)`, `window.__orionBoard.api`.

- [ ] **Step 1: Write the spec** — `e2e/canvas-excalidraw-stress.spec.ts`

```ts
import { test, expect } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("pan and zoom stay smooth with 20 live frames", async ({ page }, testInfo) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFrames(20, "sample"));
  await expect(page.locator("iframe[data-orion-frame]")).not.toHaveCount(0);

  const frames = await page.evaluate(async () => {
    const { api } = window.__orionBoard!;
    api.scrollToContent(undefined, { fitToViewport: true, animate: false });
    const deltas: number[] = [];
    let last = performance.now();
    const start = last;
    let tick = 0;
    await new Promise<void>((done) => {
      const step = (now: number) => {
        deltas.push(now - last);
        last = now;
        tick += 1;
        const state = api.getAppState();
        api.updateScene({
          appState: {
            scrollX: state.scrollX + (tick % 2 === 0 ? 12 : -12),
            scrollY: state.scrollY + (tick % 2 === 0 ? 8 : -8),
            zoom: { value: Math.max(0.2, Math.min(2, state.zoom.value * (tick % 40 < 20 ? 1.01 : 0.99))) as typeof state.zoom.value },
          },
        });
        if (now - start < 5000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    return deltas;
  });

  const sorted = [...frames].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const result = { frames: frames.length, p50: Math.round(p50 * 10) / 10, p95: Math.round(p95 * 10) / 10, liveFrames: 20 };
  await testInfo.attach("twenty-frame-pan-zoom.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  console.log("20 live frames, 5s pan/zoom:", JSON.stringify(result));
  // No-go trigger from the spec: unacceptable performance with 20 live frames.
  expect(p95).toBeLessThanOrEqual(50);
});

test("a script that loops forever: does the board stay usable?", async ({ page }, testInfo) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Add loop screen" }).click();
  const responsive = await Promise.race([
    page.evaluate(() => performance.now()).then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  await testInfo.attach("runaway-script.json", { body: JSON.stringify({ boardResponsiveAfter5s: responsive }), contentType: "application/json" });
  console.log("runaway script, board responsive after 5s:", responsive);
  // Recorded, not asserted: the answer is the finding. Close the page so a hung renderer cannot stall the run.
  await page.close({ runBeforeUnload: false }).catch(() => undefined);
  expect(typeof responsive).toBe("boolean");
});
```

- [ ] **Step 2: Run it and record the numbers**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-stress`
Expected: the first test passes with p95 ≤ 50 ms or fails (a failure is a no-go signal; do not tune the threshold to pass). Copy both console lines into the report.

- [ ] **Step 3: Commit**

```bash
git add e2e/canvas-excalidraw-stress.spec.ts
git commit -m "test(canvas): measure 20 live frames and a runaway frame script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Mac host check (manual)

**Files:**
- Modify: nothing unless the native-bridge probe finds a leak.

**Interfaces:**
- Consumes: the probe screen (`PROBE_HTML` posts a `notify` bridge message from inside the frame after 8 seconds); `apps/mac/scripts/preview.sh`; `NativeBridge.userContentController` which already requires `message.frameInfo.isMainFrame` and a same-origin check (`apps/mac/Sources/Orion/Bridge/NativeBridge.swift:49-53`).

- [ ] **Step 1: Point the preview app at the dev route**

Run from the repository root:

```bash
defaults write com.orion.app.preview lastPageURL "http://127.0.0.1:3107/dev/canvas-excalidraw"
apps/mac/scripts/preview.sh
```

Expected: "Orion Preview" opens on the board. (If the route 404s, the preview site is not running in development mode; start it per `apps/mac/scripts/preview.sh --web` output and note what you did.)

- [ ] **Step 2: Walk the checklist and record each result**

1. Two-finger trackpad scroll pans the board.
2. Pinch zooms around the pointer.
3. Pen/rectangle/text tools draw; undo and redo work with ⌘Z and ⇧⌘Z.
4. **Add sample screen** shows a frame; click it to activate; **Log in** switches the frame to the login screen; ⌘Z behaviour noted.
5. **Add probe screen**: every line reads `blocked` / `absent` except possibly `native bridge: present`. Present is expected on WebKit; what matters next.
6. **The native bridge check:** keep the probe frame on the board, switch to another app within 8 seconds, and wait. A macOS notification titled **PROBE** would mean a generated frame reached a native command. **No notification is the pass result.** If one appears, stop: it is a no-go trigger; fix by confirming `isMainFrame` is enforced, and record it.
7. Add a frame, quit the preview app, reopen it, and note whether the board comes back (browser storage in the app's web view).
8. **Add loop screen**: note whether the whole app window freezes (WebKit may share the web process) and whether it recovers on its own. Quit and reopen if not.

- [ ] **Step 3: Record results**

Write every observation (including anything that surprised you or failed) into the report in Task 11. Do not commit the `defaults` change; it is local state.

---

## Task 10: Spike report and go/no-go

**Files:**
- Create: `docs/design/reports/2026-11-14-excalidraw-canvas-spike.md`

- [ ] **Step 1: Run the whole verification set**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw src/app/api/dev
pnpm check:astryx && pnpm check:test-colocation
pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts
```

Expected: record pass/fail counts exactly as printed.

- [ ] **Step 2: Write the report** with this structure, filling every section from what you observed (no placeholders; write "not run" with the reason where something was skipped):

```markdown
# Excalidraw canvas spike report

Date: <today>
Spec: docs/superpowers/specs/2026-11-14-excalidraw-canvas-design.md
Plan: docs/superpowers/plans/2026-11-14-excalidraw-canvas-spike.md

## Decision
GO / NO-GO / GO WITH CHANGES, in one sentence, then the reason in plain language.

## What was built
The dev route, frame rendering, generation, relay and tests, in a few lines.

## Results against the spec's checklist
| # | Item | Result | Evidence |
Rows for the spec's Spike section (multiplayer rows are marked deferred): Excalidraw in the Next app; generator connected (state which path built the screen in each manual test: the owner's AI through the existing queue or the DeepSeek fallback, the fallback reasons observed, and that queue-built pages have no scripts or `data-goto` links yet); referenced-page rendering (screen id in the scene, HTML in the screen store) or the fallback; sandbox and CSP and screen-switch message and native-command check and runaway script; save, close and reopen in the browser (and in the Mac app's web view); 20 live frames with the measured p50/p95; the Mac app web view with trackpad notes.

## Surprises and things that did not work
Everything that failed, needed a workaround or behaved differently from the plan (for example embeddable activation, restoreElements and `link`, CSS import, bundle size, font loading from a CDN).

## Risks that remain
Element/HTML separation holds only if ...; `localStorage` size limits and no image persistence; production generation path; per-board network allowlist; multiplayer still to do (deferred plan); anything else found.

## Recommendation for stage 2
What to carry forward, what to change in the spec, and a size estimate for stage 2.
```

- [ ] **Step 3: Self-check against `AGENTS.md`** (re-read the new `.tsx` files)

Replace any raw `<div>`/`<span>` layout, imported CSS, or hardcoded `#hex`/`px` in app UI with Astryx components and tokens. The `<iframe>` and the `style={{ height: "100vh" }}`/`flex` layout styles are the accepted exceptions (the existing preview overlay uses a raw iframe; confirm `pnpm check:astryx` passes).

- [ ] **Step 4: Commit and report**

```bash
git add docs/design/reports/2026-11-14-excalidraw-canvas-spike.md
git commit -m "docs: record Excalidraw canvas spike results

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Tell the owner the decision, the headline numbers, and what you want to change in the spec before stage 2.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Spike 1: Excalidraw in Next app, Astryx shell | 1 |
| Spike 2: generator connected, live frame from sketch; owner's AI first, DeepSeek fallback | 5 (DeepSeek path), 6 (owner's AI through the existing queue, fallback rule) |
| Spike 3: referenced-page rendering or fallback | 4 (scene stores only the screen id; HTML in `ScreenStore`; Step 13 failure notes cover the fallback) |
| Spike 4: sandbox settings, CSP, switch-screen message, native commands, runaway script | 2, 3, 4 (sandbox/CSP/probe/goto), 8 (runaway), 9 (native check) |
| Spike 5: two windows through a relay (multiplayer) | Deferred by the owner: `2026-11-14-excalidraw-multiplayer-relay.md` |
| Spike 6: save, close, reopen | 7 (browser storage, single user) |
| Spike 7: ~20 live frames | 8 |
| Spike 8: Mac web view, trackpad | 9 |
| Security: isolated origin, no popups/forms/downloads, network blocked, messages validated | 2, 3, 4 |
| Screen-to-screen links through the canvas | 2, 3, 4 |
| External links, network allowlist | Out of this spike (scope notes) |
| Go/no-go report with no-go triggers | 4, 8, 9, 10 |
