# Excalidraw Canvas Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or disprove, behind a development-only route, that Excalidraw can be the base of Orion's multiplayer canvas with sandboxed, script-enabled HTML frames, and end with a written go/no-go report.

**Architecture:** Excalidraw renders the board. Generated pages are Excalidraw `embeddable` elements whose content we render ourselves through `renderEmbeddable`, so we control the iframe sandbox and CSP (Excalidraw's built-in AI frame hardcodes a looser sandbox). The scene holds only a screen identifier per frame; page HTML lives in a separate screen store replicated by the relay. A Cloudflare Durable Object relays element diffs, screen revisions and cursors between clients.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `@excalidraw/excalidraw` 0.18.1 (MIT), Astryx, zod, Vitest, Playwright, Cloudflare Workers + Durable Objects (`wrangler dev`).

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-14-excalidraw-canvas-design.md` and the repository rules:

- Base: `@excalidraw/excalidraw` (MIT). Pin the exact version `0.18.1` (the repo pins exact versions).
- Scripts in generated pages are enabled; frames never get same-origin access to the app, its cookies or its credentials; no access to native commands.
- No new windows, window takeover, real form posts or downloads from a frame.
- Network blocked by default: each page gets a content security policy that blocks outside requests and loading outside code; images and fonts are inline.
- Anything a page posts to the host is validated for source, frame identity and shape.
- The spike is built behind a development route and touches no production boards, no database schema and no existing records. Do not remove tldraw packages or the existing tldraw `CanvasRoom` in this plan.
- Application controls use Astryx components and tokens; no raw `<div>`/`<span>` layout, no hardcoded hex or px in app UI (see `AGENTS.md`; run `pnpm exec astryx component <Name>` if unsure a prop exists).
- Every `*.test.ts(x)` sits beside the module it covers (`pnpm check:test-colocation`).
- Use Node 22.23.2. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Scope notes (read before starting)

- **Generation in the spike is a direct dev-only call** to DeepSeek (or a fixture when the fake gate is on). The existing generator is a Supabase task queue plus a connector that returns structured payloads with `script: null`; integrating it, and changing its contract to allow scripts, is delivery stage 2 and stage 6. The report must say so.
- **Magic Frame's built-in generate button is not used.** Verified in Excalidraw's source (`App.tsx`, lines ~2083-2087) and the shipped bundle: its `iframe` element hardcodes `allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads`. Our own `embeddable` + `renderEmbeddable` path replaces it, and a normal Excalidraw **frame** is the sketch region.
- **External-link opening and the per-board network allowlist are stage 2+.** The bridge in this spike supports only screen-to-screen `goto`; link clicks are swallowed.
- **Reusing the existing canvas session ticket** (`mintCanvasSessionTicket`) for the relay is a spike shortcut. Its `clientVersion` still says tldraw; renaming is stage 3.
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
| `board-sync-client.ts` | WebSocket client with reconnect. No Excalidraw dependency. |
| `board-sync-glue.ts` | Pure helpers: which elements to send, collaborator mapping. |
| `use-board-sync.ts` | Hook gluing the sync client to the Excalidraw API and screen store. |
| `excalidraw-board.tsx` | The board component and Astryx toolbar. |
| `board-loader.tsx` | Client wrapper that loads the board with `ssr: false`. |

Other new files: `apps/web/src/app/dev/canvas-excalidraw/page.tsx`, `apps/web/src/app/api/dev/canvas-excalidraw/generate/route.ts`, `.../ticket/route.ts`, `apps/gateway-worker/src/board-room-core.ts`, `apps/gateway-worker/src/board-room.ts`, `playwright.canvas-excalidraw.config.ts`, `e2e/canvas-excalidraw*.spec.ts`, `docs/design/reports/2026-11-14-excalidraw-canvas-spike.md`.

Modified: `apps/web/package.json`, `pnpm-lock.yaml`, `.gitignore`, `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`, `apps/gateway-worker/src/{router.ts,router.test.ts,index.ts,env.ts}`, `apps/gateway-worker/wrangler.jsonc`, `apps/gateway-worker/worker-configuration.d.ts` (regenerated).

---

## Task 1: Mount Excalidraw on a dev route

**Files:**
- Create: `apps/web/src/app/dev/canvas-excalidraw/page.tsx`, `apps/web/src/features/canvas-excalidraw/board-loader.tsx`, `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`, `playwright.canvas-excalidraw.config.ts`, `e2e/canvas-excalidraw.spec.ts`
- Modify: `apps/web/package.json`, `pnpm-lock.yaml`, `.gitignore`, `apps/web/eslint.config.mjs`, `apps/web/tsconfig.json`

**Interfaces:**
- Produces: `ExcalidrawBoard` props `{ boardId?: string; name: string; access: "edit" | "view" }`; route `/dev/canvas-excalidraw[?board=<uuid>&name=<n>&access=view]`; a Playwright config that later tasks extend.

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
      name={(first(params.name) ?? "Guest").slice(0, 40)}
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

export function BoardLoader(props: { boardId?: string; name: string; access: "edit" | "view" }) {
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

export function ExcalidrawBoard({ access }: { boardId?: string; name: string; access: "edit" | "view" }) {
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

export function ExcalidrawBoard({ access }: { boardId?: string; name: string; access: "edit" | "view" }) {
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

## Task 5: Sketch to HTML generation

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

## Task 6: Relay core (merge rules, access, persistence)

**Files:**
- Create: `apps/gateway-worker/src/board-room-core.ts`, `apps/gateway-worker/src/board-room-core.test.ts`

**Interfaces:**
- Produces:
  - `BoardElement = { id: string; version: number; versionNonce: number; isDeleted?: boolean; [key: string]: unknown }`, `BoardScreen = { id: string; rev: number; html: string }`.
  - `BoardStorage = { loadAll(): Promise<{ elements: BoardElement[]; screens: BoardScreen[] }>; putElements(elements: BoardElement[]): Promise<void>; putScreen(screen: BoardScreen): Promise<void> }`.
  - `BoardPeer = { send(message: string): void; name: string; access: "view" | "edit"; color: string }`.
  - `class BoardRoomCore { constructor(storage: BoardStorage); connect(sessionId: string, peer: BoardPeer): void; receive(sessionId: string, raw: string): Promise<void>; disconnect(sessionId: string): void; idle(): Promise<void> }`.
  - `LIMITS`, `isNewer(incoming, existing): boolean`, `colorFor(sessionId): string`.
  - Wire protocol, client → server: `{t:"elements",elements}`, `{t:"screen",id,rev,html}`, `{t:"pointer",x,y,tool,button}`. Server → client: `{t:"init",elements,screens,peers:[{id,name}]}`, `{t:"elements",from,elements}`, `{t:"screen",from,id,rev,html}`, `{t:"pointer",from,name,color,x,y,tool,button}`, `{t:"peer-joined",id,name}`, `{t:"peer-left",id}`, `{t:"error",code}` with codes `read_only | too_large | invalid`.

- [ ] **Step 1: Write the failing tests** — `board-room-core.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { BoardRoomCore, LIMITS, isNewer, type BoardElement, type BoardPeer, type BoardScreen, type BoardStorage } from "./board-room-core";

function memoryStorage(seed?: { elements?: BoardElement[]; screens?: BoardScreen[] }): BoardStorage & { elements: Map<string, BoardElement>; screens: Map<string, BoardScreen> } {
  const elements = new Map((seed?.elements ?? []).map((e) => [e.id, e]));
  const screens = new Map((seed?.screens ?? []).map((s) => [s.id, s]));
  return {
    elements, screens,
    loadAll: async () => ({ elements: [...elements.values()], screens: [...screens.values()] }),
    putElements: async (list) => { for (const e of list) elements.set(e.id, e); },
    putScreen: async (s) => { screens.set(s.id, s); },
  };
}

function peer(access: "edit" | "view" = "edit", name = "P") {
  const received: Record<string, unknown>[] = [];
  const value: BoardPeer = { send: (m) => received.push(JSON.parse(m)), name, access, color: "tomato" };
  return { value, received };
}
const el = (id: string, version: number, versionNonce = 1, extra: Record<string, unknown> = {}): BoardElement => ({ id, version, versionNonce, ...extra });
const send = (core: BoardRoomCore, id: string, message: unknown) => core.receive(id, JSON.stringify(message));

describe("isNewer", () => {
  it("prefers the higher version and breaks ties with the lower nonce", () => {
    expect(isNewer(el("a", 2), el("a", 1))).toBe(true);
    expect(isNewer(el("a", 1), el("a", 2))).toBe(false);
    expect(isNewer(el("a", 2, 5), el("a", 2, 9))).toBe(true);
    expect(isNewer(el("a", 2, 9), el("a", 2, 5))).toBe(false);
    expect(isNewer(el("a", 2, 5), el("a", 2, 5))).toBe(false);
  });
});

describe("BoardRoomCore", () => {
  it("sends the stored board to a joining client", async () => {
    const core = new BoardRoomCore(memoryStorage({ elements: [el("a", 1)], screens: [{ id: "s", rev: 1, html: "<p>x</p>" }] }));
    const a = peer();
    core.connect("A", a.value);
    await core.idle();
    expect(a.received[0]).toMatchObject({ t: "init", elements: [{ id: "a" }], screens: [{ id: "s" }], peers: [{ id: "A", name: "P" }] });
  });

  it("stores accepted elements and broadcasts them to others only", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    const a = peer(), b = peer("edit", "Bea");
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "elements", elements: [el("x", 1)] });
    expect(storage.elements.get("x")).toBeDefined();
    expect(b.received.at(-1)).toMatchObject({ t: "elements", from: "A", elements: [{ id: "x" }] });
    expect(a.received.some((m) => m.t === "elements")).toBe(false);
  });

  it("drops stale elements and does not broadcast them", async () => {
    const core = new BoardRoomCore(memoryStorage({ elements: [el("x", 5, 1, { v: "new" })] }));
    const a = peer(), b = peer();
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "elements", elements: [el("x", 3, 1, { v: "old" })] });
    expect(b.received.some((m) => m.t === "elements")).toBe(false);
  });

  it("rejects writes from a viewer and stores nothing", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    const viewer = peer("view");
    core.connect("V", viewer.value);
    await send(core, "V", { t: "elements", elements: [el("x", 1)] });
    await send(core, "V", { t: "screen", id: "s", rev: 1, html: "<p>x</p>" });
    expect(storage.elements.size).toBe(0);
    expect(storage.screens.size).toBe(0);
    expect(viewer.received.filter((m) => m.t === "error")).toEqual([{ t: "error", code: "read_only" }, { t: "error", code: "read_only" }]);
  });

  it("lets a viewer send cursor movement", async () => {
    const core = new BoardRoomCore(memoryStorage());
    const viewer = peer("view", "Vic"), a = peer();
    core.connect("V", viewer.value); core.connect("A", a.value);
    await send(core, "V", { t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" });
    expect(a.received.at(-1)).toMatchObject({ t: "pointer", from: "V", name: "Vic", x: 1, y: 2 });
  });

  it("keeps cursor positions out of storage", async () => {
    const storage = memoryStorage();
    const core = new BoardRoomCore(storage);
    core.connect("A", peer().value);
    await send(core, "A", { t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" });
    expect(storage.elements.size + storage.screens.size).toBe(0);
  });

  it("accepts a screen only with a higher revision", async () => {
    const storage = memoryStorage({ screens: [{ id: "s", rev: 2, html: "<p>two</p>" }] });
    const core = new BoardRoomCore(storage);
    const a = peer(), b = peer();
    core.connect("A", a.value); core.connect("B", b.value);
    await send(core, "A", { t: "screen", id: "s", rev: 2, html: "<p>same</p>" });
    expect(storage.screens.get("s")?.html).toBe("<p>two</p>");
    await send(core, "A", { t: "screen", id: "s", rev: 3, html: "<p>three</p>" });
    expect(storage.screens.get("s")?.html).toBe("<p>three</p>");
    expect(b.received.at(-1)).toMatchObject({ t: "screen", id: "s", rev: 3 });
  });

  it("rejects oversized, malformed and invalid messages", async () => {
    const core = new BoardRoomCore(memoryStorage());
    const a = peer();
    core.connect("A", a.value);
    await core.receive("A", "x".repeat(LIMITS.maxMessageBytes + 1));
    await core.receive("A", "not json");
    await send(core, "A", { t: "elements", elements: [{ id: 5 }] });
    await send(core, "A", { t: "screen", id: "Bad Id", rev: 1, html: "<p>x</p>" });
    await send(core, "A", { t: "screen", id: "ok", rev: 1, html: "x".repeat(LIMITS.maxScreenHtmlBytes + 1) });
    await send(core, "A", { t: "mystery" });
    expect(a.received.filter((m) => m.t === "error").map((m) => m.code)).toEqual(["too_large", "invalid", "invalid", "invalid", "too_large", "invalid"]);
  });

  it("stops accepting new elements at the cap but still updates existing ones", async () => {
    const seed = Array.from({ length: LIMITS.maxElements }, (_, i) => el(`e${i}`, 1));
    const storage = memoryStorage({ elements: seed });
    const core = new BoardRoomCore(storage);
    core.connect("A", peer().value);
    await send(core, "A", { t: "elements", elements: [el("extra", 1), el("e0", 2)] });
    expect(storage.elements.has("extra")).toBe(false);
    expect(storage.elements.get("e0")?.version).toBe(2);
  });

  it("announces joins and leaves, and survives a restart through storage", async () => {
    const storage = memoryStorage();
    const first = new BoardRoomCore(storage);
    const a = peer(), b = peer("edit", "Bea");
    first.connect("A", a.value);
    first.connect("B", b.value);
    await first.idle();
    expect(a.received.at(-1)).toEqual({ t: "peer-joined", id: "B", name: "Bea" });
    first.disconnect("B");
    expect(a.received.at(-1)).toEqual({ t: "peer-left", id: "B" });
    await send(first, "A", { t: "elements", elements: [el("x", 1)] });
    const second = new BoardRoomCore(storage);
    const c = peer();
    second.connect("C", c.value);
    await second.idle();
    expect(c.received[0]).toMatchObject({ t: "init", elements: [{ id: "x" }] });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/board-room-core.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `board-room-core.ts`

```ts
export interface BoardElement {
  id: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
}
export interface BoardScreen { id: string; rev: number; html: string }
export interface BoardStorage {
  loadAll(): Promise<{ elements: BoardElement[]; screens: BoardScreen[] }>;
  putElements(elements: BoardElement[]): Promise<void>;
  putScreen(screen: BoardScreen): Promise<void>;
}
export interface BoardPeer {
  send(message: string): void;
  name: string;
  access: "view" | "edit";
  color: string;
}

export const LIMITS = {
  maxElements: 5000,
  maxBatch: 500,
  maxScreenHtmlBytes: 512 * 1024,
  maxMessageBytes: 6 * 1024 * 1024,
} as const;

const SCREEN_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const COLORS = ["tomato", "royalblue", "seagreen", "darkorange", "mediumvioletred", "teal", "goldenrod", "slateblue"];

// Excalidraw's own reconciliation rule: higher version wins, ties go to the
// lower nonce, so every client converges on the same element.
export function isNewer(incoming: BoardElement, existing: BoardElement): boolean {
  if (incoming.version !== existing.version) return incoming.version > existing.version;
  return incoming.versionNonce < existing.versionNonce;
}

export function colorFor(sessionId: string): string {
  let hash = 0;
  for (const char of sessionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length]!;
}

function isElement(value: unknown): value is BoardElement {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === "string" && e.id.length > 0 && e.id.length <= 200 &&
    Number.isInteger(e.version) && Number.isInteger(e.versionNonce)
  );
}

export class BoardRoomCore {
  private readonly elements = new Map<string, BoardElement>();
  private readonly screens = new Map<string, BoardScreen>();
  private readonly peers = new Map<string, BoardPeer>();
  private tail: Promise<void>;

  constructor(private readonly storage: BoardStorage) {
    this.tail = storage.loadAll().then((all) => {
      for (const element of all.elements) this.elements.set(element.id, element);
      for (const screen of all.screens) this.screens.set(screen.id, screen);
    });
  }

  // Resolves when everything queued so far has been processed.
  idle(): Promise<void> {
    return this.tail;
  }

  private enqueue(job: () => Promise<void> | void): Promise<void> {
    this.tail = this.tail.then(job).catch(() => undefined);
    return this.tail;
  }

  connect(sessionId: string, peer: BoardPeer): void {
    this.peers.set(sessionId, peer);
    void this.enqueue(() => {
      peer.send(JSON.stringify({
        t: "init",
        elements: [...this.elements.values()],
        screens: [...this.screens.values()],
        peers: [...this.peers].map(([id, p]) => ({ id, name: p.name })),
      }));
      this.broadcast(sessionId, { t: "peer-joined", id: sessionId, name: peer.name });
    });
  }

  disconnect(sessionId: string): void {
    if (!this.peers.delete(sessionId)) return;
    this.broadcast(sessionId, { t: "peer-left", id: sessionId });
  }

  receive(sessionId: string, raw: string): Promise<void> {
    return this.enqueue(() => this.handle(sessionId, raw));
  }

  private broadcast(exceptId: string, message: unknown): void {
    const text = JSON.stringify(message);
    for (const [id, peer] of this.peers) if (id !== exceptId) peer.send(text);
  }

  private fail(peer: BoardPeer, code: "read_only" | "too_large" | "invalid"): void {
    peer.send(JSON.stringify({ t: "error", code }));
  }

  private async handle(sessionId: string, raw: string): Promise<void> {
    const peer = this.peers.get(sessionId);
    if (!peer) return;
    if (raw.length > LIMITS.maxMessageBytes) return this.fail(peer, "too_large");
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return this.fail(peer, "invalid");
      message = parsed as Record<string, unknown>;
    } catch {
      return this.fail(peer, "invalid");
    }

    if (message.t === "pointer") {
      const { x, y } = message;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return this.fail(peer, "invalid");
      this.broadcast(sessionId, {
        t: "pointer", from: sessionId, name: peer.name, color: peer.color, x, y,
        tool: message.tool === "laser" ? "laser" : "pointer",
        button: message.button === "down" ? "down" : "up",
      });
      return;
    }

    if (message.t === "elements") {
      if (peer.access !== "edit") return this.fail(peer, "read_only");
      const list = message.elements;
      if (!Array.isArray(list) || list.length > LIMITS.maxBatch || !list.every(isElement)) return this.fail(peer, "invalid");
      const accepted: BoardElement[] = [];
      for (const element of list) {
        const existing = this.elements.get(element.id);
        if (!existing && this.elements.size >= LIMITS.maxElements) continue;
        if (existing && !isNewer(element, existing)) continue;
        this.elements.set(element.id, element);
        accepted.push(element);
      }
      if (accepted.length === 0) return;
      await this.storage.putElements(accepted);
      this.broadcast(sessionId, { t: "elements", from: sessionId, elements: accepted });
      return;
    }

    if (message.t === "screen") {
      if (peer.access !== "edit") return this.fail(peer, "read_only");
      const { id, rev, html } = message;
      if (typeof id !== "string" || !SCREEN_ID.test(id) || !Number.isInteger(rev) || (rev as number) < 1 || typeof html !== "string") return this.fail(peer, "invalid");
      if (html.length > LIMITS.maxScreenHtmlBytes) return this.fail(peer, "too_large");
      const existing = this.screens.get(id);
      if (existing && existing.rev >= (rev as number)) return;
      const screen: BoardScreen = { id, rev: rev as number, html };
      this.screens.set(id, screen);
      await this.storage.putScreen(screen);
      this.broadcast(sessionId, { t: "screen", from: sessionId, ...screen });
      return;
    }

    this.fail(peer, "invalid");
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/board-room-core.test.ts`
Expected: PASS (all tests). The `too_large` test builds a 6 MB string; that is intentional.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway-worker/src/board-room-core.ts apps/gateway-worker/src/board-room-core.test.ts
git commit -m "feat(gateway): add board relay core with merge rules and access checks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Durable Object, route and wrangler binding

**Files:**
- Create: `apps/gateway-worker/src/board-room.ts`
- Modify: `apps/gateway-worker/src/router.ts`, `router.test.ts`, `index.ts`, `env.ts`, `apps/gateway-worker/wrangler.jsonc`, `apps/gateway-worker/worker-configuration.d.ts` (regenerated)

**Interfaces:**
- Consumes: `BoardRoomCore`, `BoardStorage`, `BoardPeer`, `colorFor` (Task 6); `CANVAS_HEADER`, `CanvasConnect` (router).
- Produces: `RouterDeps.forwardToBoard(request: Request, connect: CanvasConnect): Promise<Response>`; route `GET /board/:boardId?ticket=…&sessionId=…` (WebSocket upgrade); Durable Object class `BoardRoom` bound as `BOARD_ROOM`.

- [ ] **Step 1: Update the router test** — `router.test.ts`

In `deps()` add `forwardToBoard: vi.fn(async () => new Response("board")),` after `forwardToCanvas`. Then add inside `describe("route", …)`:

```ts
  describe("/board/:id", () => {
    const ticket = (room = ROOM) =>
      mintCanvasSessionTicket({ workspaceId: WORKSPACE, roomId: room, userId: USER, userName: "Ada", access: "edit" }, SECRET);

    it("requires a websocket upgrade", async () => {
      const res = await route(new Request(`https://g/board/${ROOM}`), deps());
      expect(res.status).toBe(426);
    });

    it("rejects a missing, invalid or other-board ticket", async () => {
      const d = deps();
      for (const query of [`?sessionId=s`, `?ticket=bad&sessionId=s`, `?ticket=${ticket("44444444-4444-4444-8444-444444444444")}&sessionId=s`]) {
        const res = await route(new Request(`https://g/board/${ROOM}${query}`, { headers: upgrade }), d);
        expect(res.status).toBe(401);
      }
      expect(d.forwardToBoard).not.toHaveBeenCalled();
    });

    it("forwards a valid ticket with its claims and session id", async () => {
      const d = deps();
      const res = await route(new Request(`https://g/board/${ROOM}?ticket=${ticket()}&sessionId=abc`, { headers: upgrade }), d);
      expect(await res.text()).toBe("board");
      expect(d.forwardToBoard).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({ sessionId: "abc", claims: expect.objectContaining({ roomId: ROOM, access: "edit" }) }));
      expect(d.forwardToCanvas).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/gateway-worker exec vitest run src/router.test.ts`
Expected: FAIL (type error / 404 for `/board`).

- [ ] **Step 3: Update the router** — in `router.ts`

Add to `RouterDeps`: `forwardToBoard(request: Request, connect: CanvasConnect): Promise<Response>;`

Replace the `CANVAS_PATH` handling block with a shared helper. The finished section is:

```ts
const CANVAS_PATH = /^\/canvas\/([^/]+)$/;
const BOARD_PATH = /^\/board\/([^/]+)$/;
```

and, inside `route`, replace the existing `const canvas = CANVAS_PATH.exec(...)` block with:

```ts
  const canvas = CANVAS_PATH.exec(url.pathname);
  if (canvas) {
    const connect = authorizeRoom(request, url, decodeURIComponent(canvas[1]!), deps);
    return connect instanceof Response ? connect : deps.forwardToCanvas(request, connect);
  }

  const board = BOARD_PATH.exec(url.pathname);
  if (board) {
    const connect = authorizeRoom(request, url, decodeURIComponent(board[1]!), deps);
    return connect instanceof Response ? connect : deps.forwardToBoard(request, connect);
  }
```

and add above `route`:

```ts
// Shared by the tldraw room and the Excalidraw board relay: a websocket upgrade
// with a ticket signed for exactly this room.
function authorizeRoom(request: Request, url: URL, roomId: string, deps: RouterDeps): CanvasConnect | Response {
  if (!isUpgrade(request)) return json({ error: "Upgrade Required" }, 426);
  let claims: CanvasSessionClaims;
  try {
    claims = verifyCanvasSessionTicket(url.searchParams.get("ticket") ?? "", deps.canvasSecret, roomId, deps.now?.() ?? new Date());
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (sessionId.length < 1 || sessionId.length > 200) return json({ error: "Unauthorized" }, 401);
  return { claims, sessionId };
}
```

- [ ] **Step 4: Write the Durable Object** — `board-room.ts`

```ts
import { DurableObject } from "cloudflare:workers";
import { BoardRoomCore, colorFor, type BoardElement, type BoardScreen, type BoardStorage } from "./board-room-core";
import type { Env } from "./env";
import { CANVAS_HEADER, type CanvasConnect } from "./router";

const BATCH = 100; // put() accepts at most 128 keys

function durableStorage(storage: DurableObjectStorage): BoardStorage {
  return {
    async loadAll() {
      const elements = await storage.list<BoardElement>({ prefix: "el:" });
      const screens = await storage.list<BoardScreen>({ prefix: "screen:" });
      return { elements: [...elements.values()], screens: [...screens.values()] };
    },
    async putElements(elements) {
      for (let index = 0; index < elements.length; index += BATCH) {
        const entries: Record<string, BoardElement> = {};
        for (const element of elements.slice(index, index + BATCH)) entries[`el:${element.id}`] = element;
        await storage.put(entries);
      }
    },
    async putScreen(screen) {
      await storage.put(`screen:${screen.id}`, screen);
    },
  };
}

// One Durable Object per board. Sessions live in memory (not hibernated), the
// same trade-off the existing tldraw CanvasRoom makes.
export class BoardRoom extends DurableObject<Env> {
  private readonly core: BoardRoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new BoardRoomCore(durableStorage(ctx.storage));
  }

  async fetch(request: Request): Promise<Response> {
    const connect = JSON.parse(request.headers.get(CANVAS_HEADER) ?? "null") as CanvasConnect | null;
    if (!connect) return new Response("Bad Request", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    const { sessionId, claims } = connect;
    this.core.connect(sessionId, {
      send: (message) => { try { server.send(message); } catch { /* peer already gone */ } },
      name: claims.userName,
      access: claims.access,
      color: colorFor(sessionId),
    });
    server.addEventListener("message", (event) => {
      if (typeof event.data === "string") void this.core.receive(sessionId, event.data);
    });
    const leave = () => this.core.disconnect(sessionId);
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    return new Response(null, { status: 101, webSocket: client });
  }
}
```

- [ ] **Step 5: Wire it up**

`env.ts`: add `BOARD_ROOM: DurableObjectNamespace;` after `CANVAS_ROOM`.

`index.ts`: add `export { BoardRoom } from "./board-room";` and, inside the `route(...)` deps after `forwardToCanvas`:

```ts
      forwardToBoard: (req, connect) =>
        env.BOARD_ROOM.get(env.BOARD_ROOM.idFromName(`${connect.claims.workspaceId}:${connect.claims.roomId}`))
          .fetch(withHeader(req, CANVAS_HEADER, connect)),
```

`wrangler.jsonc`: add `{ "name": "BOARD_ROOM", "class_name": "BoardRoom" }` to `durable_objects.bindings`, and append `{ "tag": "v2", "new_sqlite_classes": ["BoardRoom"] }` to `migrations`.

Regenerate types: `pnpm --filter @meld/gateway-worker types`.

- [ ] **Step 6: Verify**

Run: `pnpm --filter @meld/gateway-worker exec vitest run && pnpm --filter @meld/gateway-worker typecheck && pnpm --filter @meld/gateway-worker lint && pnpm --filter @meld/gateway-worker build`
Expected: all pass; the dry-run build lists `BOARD_ROOM`.

- [ ] **Step 7: Commit**

```bash
git add apps/gateway-worker
git commit -m "feat(gateway): add BoardRoom Durable Object and /board route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Client sync, cursors, late join, reconnect, persistence

**Files:**
- Create: `board-sync-client.ts`, `board-sync-client.test.ts`, `board-sync-glue.ts`, `board-sync-glue.test.ts`, `use-board-sync.ts` (in `apps/web/src/features/canvas-excalidraw/`); `apps/web/src/app/api/dev/canvas-excalidraw/ticket/route.ts`, `route.test.ts`; `e2e/canvas-excalidraw-sync.spec.ts`
- Modify: `excalidraw-board.tsx`, `playwright.canvas-excalidraw.config.ts`

**Interfaces:**
- Consumes: Task 6 wire protocol; `Screen`, `ScreenStore`.
- Produces:
  - `WebSocketLike`, `class BoardSyncClient { constructor(opts: { connect(): Promise<WebSocketLike>; onMessage(m: ServerMessage): void; onStatus(s: "connecting" | "online" | "offline"): void; backoffMs?(attempt: number): number }); start(): void; stop(): void; send(message: ClientMessage): boolean; isOpen(): boolean; dropConnection(): void }`.
  - `ServerMessage`, `ClientMessage` types mirroring the Task 6 protocol.
  - `elementsToSend(elements, lastSent: Map<string, number>): BoardWireElement[]` (mutates `lastSent`), `toCollaborator(message)`.
  - `useBoardSync({ api, store, boardId, name, access }): { status; peers; sendElements(elements); sendPointer(pointer); sendScreen(screen) }`.
  - `POST /api/dev/canvas-excalidraw/ticket` body `{ boardId, name, access }` → `{ ticket, gatewayUrl }`.
  - Dev hook adds `window.__orionBoard.sync = { status(): string; peerCount(): number; drop(): void }`.

- [ ] **Step 1: Write the failing glue tests** — `board-sync-glue.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { elementsToSend, toCollaborator } from "./board-sync-glue";

const el = (id: string, version: number) => ({ id, version, versionNonce: 1 });

describe("elementsToSend", () => {
  it("returns only elements newer than what was last sent and records them", () => {
    const last = new Map([["a", 2]]);
    const out = elementsToSend([el("a", 2), el("b", 1), el("a", 3)] as never, last);
    expect(out.map((e) => `${e.id}@${e.version}`)).toEqual(["b@1", "a@3"]);
    expect(last.get("a")).toBe(3);
    expect(elementsToSend([el("a", 3), el("b", 1)] as never, last)).toEqual([]);
  });
});

describe("toCollaborator", () => {
  it("maps a pointer message to an Excalidraw collaborator", () => {
    const c = toCollaborator({ t: "pointer", from: "S1", name: "Bea", color: "teal", x: 3, y: 4, tool: "pointer", button: "down" });
    expect(c).toMatchObject({ username: "Bea", pointer: { x: 3, y: 4, tool: "pointer" }, button: "down", color: { background: "teal", stroke: "teal" }, id: "S1" });
  });
});
```

Run `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/board-sync-glue.test.ts` → FAIL. Implement — `board-sync-glue.ts`:

```ts
import type { Collaborator } from "@excalidraw/excalidraw/types";

export type BoardWireElement = { id: string; version: number; versionNonce: number; [key: string]: unknown };

export type PointerMessage = {
  t: "pointer"; from: string; name: string; color: string;
  x: number; y: number; tool: "pointer" | "laser"; button: "up" | "down";
};

// Elements whose version is newer than what we last told the relay about.
export function elementsToSend(
  elements: readonly { id: string; version: number }[],
  lastSent: Map<string, number>,
): BoardWireElement[] {
  const out: BoardWireElement[] = [];
  for (const element of elements) {
    if (element.version > (lastSent.get(element.id) ?? -1)) {
      lastSent.set(element.id, element.version);
      out.push(element as BoardWireElement);
    }
  }
  return out;
}

export function toCollaborator(message: PointerMessage): Collaborator {
  return {
    pointer: { x: message.x, y: message.y, tool: message.tool },
    button: message.button,
    username: message.name,
    color: { background: message.color, stroke: message.color },
    id: message.from,
  };
}
```

Run → PASS.

- [ ] **Step 2: Write the failing sync client test** — `board-sync-client.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardSyncClient, type WebSocketLike } from "./board-sync-client";

class FakeSocket implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const sockets: FakeSocket[] = [];
  const statuses: string[] = [];
  const messages: unknown[] = [];
  const client = new BoardSyncClient({
    connect: async () => { const s = new FakeSocket(); sockets.push(s); return s; },
    onMessage: (m) => messages.push(m),
    onStatus: (s) => statuses.push(s),
    backoffMs: () => 1000,
  });
  return { client, sockets, statuses, messages };
}

describe("BoardSyncClient", () => {
  it("goes online when the socket opens and delivers parsed messages", async () => {
    const { client, sockets, statuses, messages } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.onmessage?.({ data: JSON.stringify({ t: "peer-left", id: "x" }) });
    sockets[0]!.onmessage?.({ data: "not json" });
    expect(statuses).toEqual(["connecting", "online"]);
    expect(messages).toEqual([{ t: "peer-left", id: "x" }]);
  });

  it("only sends while open", async () => {
    const { client, sockets } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.send({ t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" })).toBe(false);
    sockets[0]!.open();
    expect(client.send({ t: "pointer", x: 1, y: 2, tool: "pointer", button: "up" })).toBe(true);
    expect(sockets[0]!.sent).toHaveLength(1);
  });

  it("reconnects after the socket closes, and again after dropConnection", async () => {
    const { client, sockets, statuses } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    sockets[0]!.open();
    sockets[0]!.close();
    expect(statuses.at(-1)).toBe("offline");
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    client.dropConnection();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(3);
  });

  it("does not reconnect after stop", async () => {
    const { client, sockets } = setup();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sockets).toHaveLength(1);
  });
});
```

Run → FAIL. Implement — `board-sync-client.ts`:

```ts
import type { PointerMessage, BoardWireElement } from "./board-sync-glue";

export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export type ClientMessage =
  | { t: "elements"; elements: BoardWireElement[] }
  | { t: "screen"; id: string; rev: number; html: string }
  | { t: "pointer"; x: number; y: number; tool: "pointer" | "laser"; button: "up" | "down" };

export type ServerMessage =
  | { t: "init"; elements: BoardWireElement[]; screens: { id: string; rev: number; html: string }[]; peers: { id: string; name: string }[] }
  | { t: "elements"; from: string; elements: BoardWireElement[] }
  | { t: "screen"; from: string; id: string; rev: number; html: string }
  | PointerMessage
  | { t: "peer-joined"; id: string; name: string }
  | { t: "peer-left"; id: string }
  | { t: "error"; code: string };

type Status = "connecting" | "online" | "offline";
const OPEN = 1;

export class BoardSyncClient {
  private socket: WebSocketLike | null = null;
  private stopped = true;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: {
    connect(): Promise<WebSocketLike>;
    onMessage(message: ServerMessage): void;
    onStatus(status: Status): void;
    backoffMs?(attempt: number): number;
  }) {}

  start(): void {
    this.stopped = false;
    void this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
    this.socket = null;
  }

  isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || !this.isOpen()) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  // Test hook: behave as if the network dropped.
  dropConnection(): void {
    this.socket?.close();
  }

  private async open(): Promise<void> {
    this.opts.onStatus("connecting");
    let socket: WebSocketLike;
    try {
      socket = await this.opts.connect();
    } catch {
      return this.scheduleReconnect();
    }
    if (this.stopped) return socket.close();
    this.socket = socket;
    socket.onopen = () => { this.attempt = 0; this.opts.onStatus("online"); };
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        this.opts.onMessage(JSON.parse(event.data) as ServerMessage);
      } catch { /* ignore malformed */ }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.opts.onStatus("offline");
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.opts.backoffMs ? this.opts.backoffMs(this.attempt) : Math.min(10_000, 500 * 2 ** this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => void this.open(), delay);
  }
}
```

Run → PASS.

- [ ] **Step 3: Write the failing ticket route test and implement** — `apps/web/src/app/api/dev/canvas-excalidraw/ticket/route.test.ts`

```ts
import { verifyCanvasSessionTicket } from "@meld/device-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const SECRET = "s".repeat(40);
const BOARD = "11111111-1111-4111-8111-111111111111";
const post = (payload: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(payload) }));

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/dev/canvas-excalidraw/ticket", () => {
  it("is not found outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ boardId: BOARD, name: "A", access: "edit" })).status).toBe(404);
  });
  it("needs the session secret", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", "");
    expect((await post({ boardId: BOARD, name: "A", access: "edit" })).status).toBe(503);
  });
  it("rejects a bad body", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    expect((await post({ boardId: "nope", name: "A", access: "edit" })).status).toBe(400);
  });
  it("mints a ticket for exactly that board with the asked access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MELD_CANVAS_SESSION_SECRET", SECRET);
    vi.stubEnv("MELD_CANVAS_WS_URL", "ws://127.0.0.1:8788");
    const json = await (await post({ boardId: BOARD, name: "Ada", access: "view" })).json();
    expect(json.gatewayUrl).toBe("ws://127.0.0.1:8788");
    const claims = verifyCanvasSessionTicket(json.ticket, SECRET, BOARD, new Date());
    expect(claims).toMatchObject({ roomId: BOARD, userName: "Ada", access: "view" });
  });
});
```

Run → FAIL. Implement — `ticket/route.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mintCanvasSessionTicket } from "@meld/device-auth";
import { z } from "zod";

// Fixed identity for the throwaway dev workspace; the board id is the room.
const DEV_WORKSPACE = "00000000-0000-4000-8000-000000000001";

const Body = z
  .object({
    boardId: z.string().uuid(),
    name: z.string().min(1).max(40),
    access: z.enum(["edit", "view"]),
  })
  .strict();

// Development-only: stands in for the real session route (delivery stage 3).
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found" }, { status: 404 });
  const secret = process.env.MELD_CANVAS_SESSION_SECRET;
  if (!secret) return Response.json({ error: "MELD_CANVAS_SESSION_SECRET is not set" }, { status: 503 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const ticket = mintCanvasSessionTicket(
    { workspaceId: DEV_WORKSPACE, roomId: body.data.boardId, userId: randomUUID(), userName: body.data.name, access: body.data.access },
    secret,
  );
  return Response.json({ ticket, gatewayUrl: process.env.MELD_CANVAS_WS_URL ?? "ws://127.0.0.1:8788" });
}
```

Run `pnpm --filter @meld/web exec vitest run src/app/api/dev/canvas-excalidraw/ticket` → PASS. (If the id `DEV_WORKSPACE` fails the UUID pattern in `assertInput`, use a v4 UUID such as `22222222-2222-4222-8222-222222222222`.)

- [ ] **Step 4: Write the hook** — `use-board-sync.ts`

```ts
"use client";

import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoardSyncClient, type ServerMessage } from "./board-sync-client";
import { elementsToSend, toCollaborator, type BoardWireElement } from "./board-sync-glue";
import type { Screen, ScreenStore } from "./screen-store";

type Status = "connecting" | "online" | "offline";
type RemoteElements = Parameters<typeof reconcileElements>[1];

const BATCH = 200;

export function useBoardSync(input: {
  api: ExcalidrawImperativeAPI | null;
  store: ScreenStore;
  boardId?: string;
  name: string;
  access: "edit" | "view";
}) {
  const { api, store, boardId, name, access } = input;
  const [status, setStatus] = useState<Status>("connecting");
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const client = useRef<BoardSyncClient | null>(null);
  const lastSent = useRef(new Map<string, number>());
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const live = useRef({ status, peers });
  live.current = { status, peers };

  useEffect(() => {
    if (!api || !boardId) return;
    const collaborators = new Map<SocketId, Collaborator>();
    lastSent.current = new Map();

    const applyRemote = (remote: BoardWireElement[]) => {
      const reconciled = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as unknown as RemoteElements, api.getAppState());
      for (const element of remote) lastSent.current.set(element.id, element.version);
      api.updateScene({ elements: reconciled, captureUpdate: CaptureUpdateAction.NEVER });
    };

    const pushLocal = () => {
      if (access !== "edit" || !client.current?.isOpen()) return;
      const changed = elementsToSend(api.getSceneElementsIncludingDeleted(), lastSent.current);
      for (let index = 0; index < changed.length; index += BATCH) {
        client.current.send({ t: "elements", elements: changed.slice(index, index + BATCH) });
      }
      for (const screen of store.all()) client.current.send({ t: "screen", ...screen });
    };

    const onMessage = (message: ServerMessage) => {
      switch (message.t) {
        case "init":
          for (const screen of message.screens) store.set(screen);
          lastSent.current = new Map();
          applyRemote(message.elements);
          setPeers(message.peers);
          pushLocal(); // anything made offline that the relay has not seen
          break;
        case "elements":
          applyRemote(message.elements);
          break;
        case "screen":
          store.set({ id: message.id, rev: message.rev, html: message.html });
          break;
        case "pointer":
          collaborators.set(message.from as SocketId, toCollaborator(message));
          api.updateScene({ collaborators: new Map(collaborators) });
          break;
        case "peer-joined":
          setPeers((current) => [...current.filter((p) => p.id !== message.id), { id: message.id, name: message.name }]);
          break;
        case "peer-left":
          collaborators.delete(message.id as SocketId);
          api.updateScene({ collaborators: new Map(collaborators) });
          setPeers((current) => current.filter((p) => p.id !== message.id));
          break;
        case "error":
          break;
      }
    };

    const sync = new BoardSyncClient({
      connect: async () => {
        const response = await fetch("/api/dev/canvas-excalidraw/ticket", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ boardId, name, access }),
        });
        if (!response.ok) throw new Error("ticket");
        const { ticket, gatewayUrl } = (await response.json()) as { ticket: string; gatewayUrl: string };
        const url = `${gatewayUrl}/board/${boardId}?ticket=${encodeURIComponent(ticket)}&sessionId=${sessionId}`;
        return new WebSocket(url);
      },
      onMessage,
      onStatus: setStatus,
    });
    client.current = sync;
    sync.start();
    window.__orionBoard = {
      ...window.__orionBoard!,
      sync: { status: () => live.current.status, peerCount: () => live.current.peers.length, drop: () => sync.dropConnection() },
    };
    return () => {
      sync.stop();
      client.current = null;
    };
  }, [api, store, boardId, name, access, sessionId]);

  return {
    status,
    peers,
    sendElements(elements: readonly ExcalidrawElement[]) {
      if (access !== "edit" || !client.current?.isOpen()) return;
      const changed = elementsToSend(elements, lastSent.current);
      for (let index = 0; index < changed.length; index += BATCH) {
        client.current.send({ t: "elements", elements: changed.slice(index, index + BATCH) });
      }
    },
    sendPointer(pointer: { x: number; y: number; tool: "pointer" | "laser" }, button: "up" | "down") {
      client.current?.send({ t: "pointer", ...pointer, button });
    },
    sendScreen(screen: Screen) {
      if (access === "edit") client.current?.send({ t: "screen", ...screen });
    },
  };
}
```

- [ ] **Step 5: Wire the board**

In `excalidraw-board.tsx`:
1. Extend the global type: `sync?: { status: () => string; peerCount: () => number; drop: () => void };` inside `__orionBoard`.
2. Accept `boardId`, `name` in props and call `const sync = useBoardSync({ api, store, boardId, name, access });`.
3. On the `<Excalidraw>` add:

```tsx
          isCollaborating={Boolean(boardId)}
          onPointerUpdate={(payload) => sync.sendPointer(payload.pointer, payload.button)}
```

and extend the existing `onChange` to also call `sync.sendElements(elements);`.
4. Keep a ref so callbacks that Excalidraw captures once (`onApi`, `addFixture`) always reach the current sync: right after `const sync = useBoardSync(...)` add `const syncRef = useRef(sync); syncRef.current = sync;` (import `useRef`). Define `sync` before `addFixture`. In `addFixture`, replace `for (const screen of FIXTURES[key].screens) store.set(screen);` with `for (const screen of FIXTURES[key].screens) { if (store.set(screen)) syncRef.current.sendScreen(screen); }`. In `buildScreen`, after `store.set({ id: screen.screenId, rev: 1, html: screen.html })` call `sync.sendScreen({ id: screen.screenId, rev: 1, html: screen.html })` and add `sync` to its dependency array.
5. Show status in the toolbar: `{boardId ? <Text type="label">{sync.status === "online" ? `Online · ${sync.peers.length} here` : sync.status}</Text> : <Text type="label">Local board</Text>}`.

- [ ] **Step 6: Run the unit tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw src/app/api/dev && pnpm --filter @meld/web typecheck && pnpm --filter @meld/web lint && pnpm check:astryx && pnpm check:test-colocation`
Expected: pass.

- [ ] **Step 7: Run two servers in the Playwright config** — replace `webServer` in `playwright.canvas-excalidraw.config.ts` with:

```ts
const SECRET = "playwright-board-secret-0123456789abcdef";
const relayPort = Number(process.env.MELD_E2E_RELAY_PORT ?? 8788);
```

(placed above `defineConfig`) and

```ts
  webServer: [
    {
      command: `pnpm --filter @meld/web exec next dev --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/dev/canvas-excalidraw`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        MELD_E2E_DIST_DIR: ".next-canvas-excalidraw",
        MELD_E2E_FAKE_WORKSPACES: "true",
        MELD_CANVAS_SESSION_SECRET: SECRET,
        MELD_CANVAS_WS_URL: `ws://127.0.0.1:${relayPort}`,
      },
    },
    {
      command:
        `pnpm --filter @meld/gateway-worker exec wrangler dev --ip 127.0.0.1 --port ${relayPort} ` +
        `--persist-to ../../.context/wrangler-e2e ` +
        `--var MELD_CANVAS_SESSION_SECRET:${SECRET} --var GATEWAY_SUPABASE_URL:http://127.0.0.1:9 ` +
        `--var GATEWAY_SUPABASE_SERVICE_ROLE_KEY:unused --var GATEWAY_HEARTBEAT_SECONDS:30 --var GATEWAY_POLL_INTERVAL_MS:1000`,
      url: `http://127.0.0.1:${relayPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
```

- [ ] **Step 8: Write the failing multiplayer spec** — `e2e/canvas-excalidraw-sync.spec.ts`

```ts
import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";

async function join(browser: Browser, baseURL: string, board: string, name: string, access = "edit"): Promise<Page> {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`/dev/canvas-excalidraw?board=${board}&name=${name}&access=${access}`);
  await expect(page.getByText(/Online/)).toBeVisible();
  return page;
}

const elementCount = (page: Page) => page.evaluate(() => window.__orionBoard!.api.getSceneElements().length);

async function drawRectangle(page: Page, id: string) {
  await page.evaluate((rectId) => {
    const { api, convert } = window.__orionBoard!;
    const added = convert([{ type: "rectangle", id: rectId, x: 20, y: 20, width: 100, height: 60 }]);
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added] });
  }, id);
}

test("two people see each other's drawings, frames and cursors", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const bea = await join(browser, baseURL!, board, "Bea");
  await expect(ada.getByText("Online · 2 here")).toBeVisible();

  await drawRectangle(ada, "from-ada");
  await expect.poll(() => elementCount(bea)).toBe(1);

  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect(bea.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
  await expect(bea.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");

  const box = (await ada.locator("canvas.excalidraw__canvas").first().boundingBox())!;
  await ada.mouse.move(box.x + 300, box.y + 300);
  await ada.mouse.move(box.x + 340, box.y + 320, { steps: 5 });
  await expect.poll(() => bea.evaluate(() => window.__orionBoard!.api.getAppState().collaborators.size)).toBeGreaterThan(0);
});

test("someone joining late sees the whole board", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  await drawRectangle(ada, "early");
  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(ada)).toBe(2);
  const cy = await join(browser, baseURL!, board, "Cy");
  await expect.poll(() => elementCount(cy)).toBe(2);
  await expect(cy.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
});

test("a dropped connection catches up after reconnecting", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const bea = await join(browser, baseURL!, board, "Bea");
  await bea.evaluate(() => window.__orionBoard!.sync!.drop());
  await drawRectangle(ada, "while-away");
  await expect(bea.getByText("Online · 2 here")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => elementCount(bea), { timeout: 20_000 }).toBe(1);
  await drawRectangle(bea, "after-return");
  await expect.poll(() => elementCount(ada)).toBe(2);
});

test("a viewer cannot change the board", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  const vic = await join(browser, baseURL!, board, "Vic", "view");
  await drawRectangle(vic, "sneaky");
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await elementCount(ada)).toBe(0);
});

test("the board is still there after everyone leaves and someone reopens it", async ({ browser, baseURL }) => {
  const board = randomUUID();
  const ada = await join(browser, baseURL!, board, "Ada");
  await drawRectangle(ada, "kept");
  await ada.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(ada)).toBe(2);
  await ada.context().close();
  const again = await join(browser, baseURL!, board, "Ada2");
  await expect.poll(() => elementCount(again)).toBe(2);
  await expect(again.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
});
```

- [ ] **Step 9: Run it**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts canvas-excalidraw-sync`
Expected: PASS. Failures here are findings; diagnose first. Common causes:
- Status never reads "Online": `wrangler dev` not reachable or the ticket route returns 503; check the two server logs.
- Elements echo forever: `lastSent` is not being updated for remote elements; check `applyRemote`.
- Cursors do not appear: `isCollaborating` must be true and `onPointerUpdate` must fire; verify with a `console.log` in the handler, then remove it.
- Reconnect test flaky: raise the poll timeout, but record the reconnect time in the report.

- [ ] **Step 10: Persistence across a relay restart (manual, record result)**

Run the sync spec's "kept" scenario by hand: open `/dev/canvas-excalidraw?board=<uuid>`, draw and add a sample screen, stop the `wrangler dev` process, start it again with the same `--persist-to ../../.context/wrangler-e2e`, reopen the same URL. Record in the report whether the board and screen came back from Durable Object storage.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src e2e/canvas-excalidraw-sync.spec.ts playwright.canvas-excalidraw.config.ts
git commit -m "feat(canvas): sync Excalidraw boards through the Durable Object relay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Stress: 20 live frames and a runaway script

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

## Task 10: Mac host check (manual)

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

Expected: "Orion Preview" opens on the board. (If the route 404s, the preview site is not running in development mode; start it per `apps/mac/scripts/preview.sh --web` output and note what you did.) For a multiplayer check, also start `pnpm --filter @meld/gateway-worker dev` with the secret in `.dev.vars`, set `MELD_CANVAS_SESSION_SECRET` and `MELD_CANVAS_WS_URL=ws://127.0.0.1:8787` for the site, and open the page with `?board=<uuid>&name=Mac`.

- [ ] **Step 2: Walk the checklist and record each result**

1. Two-finger trackpad scroll pans the board.
2. Pinch zooms around the pointer.
3. Pen/rectangle/text tools draw; undo and redo work with ⌘Z and ⇧⌘Z.
4. **Add sample screen** shows a frame; click it to activate; **Log in** switches the frame to the login screen; ⌘Z behaviour noted.
5. **Add probe screen**: every line reads `blocked` / `absent` except possibly `native bridge: present`. Present is expected on WebKit; what matters next.
6. **The native bridge check:** keep the probe frame on the board, switch to another app within 8 seconds, and wait. A macOS notification titled **PROBE** would mean a generated frame reached a native command. **No notification is the pass result.** If one appears, stop: it is a no-go trigger; fix by confirming `isMainFrame` is enforced, and record it.
7. **Add loop screen**: note whether the whole app window freezes (WebKit may share the web process) and whether it recovers on its own. Quit and reopen if not.

- [ ] **Step 3: Record results**

Write every observation (including anything that surprised you or failed) into the report in Task 11. Do not commit the `defaults` change; it is local state.

---

## Task 11: Spike report and go/no-go

**Files:**
- Create: `docs/design/reports/2026-11-14-excalidraw-canvas-spike.md`

- [ ] **Step 1: Run the whole verification set**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm --filter @meld/gateway-worker typecheck && pnpm --filter @meld/gateway-worker test
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
Rows 1-8 from the spec's Spike section: Excalidraw in the Next app; generator connected (state plainly that this was a direct dev route / fixture, not the existing task queue); referenced-page rendering (screen id in the scene, HTML in the screen store) or the fallback; sandbox and CSP and screen-switch message and native-command check and runaway script; two windows through the Durable Object with cursors, late join, reconnect; save, close and reopen (including the manual relay-restart result); 20 live frames with the measured p50/p95; the Mac app web view with trackpad notes.

## Surprises and things that did not work
Everything that failed, needed a workaround or behaved differently from the plan (for example embeddable activation, restoreElements and `link`, CSS import, bundle size, font loading from a CDN).

## Risks that remain
Last-write-wins merging per element; element/HTML separation holds only if ...; tldraw-named ticket claims; production generation path; per-board network allowlist; anything else found.

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
| Spike 2: generator connected, live frame from sketch | 5 (direct dev route; production queue deferred, stated in scope notes) |
| Spike 3: referenced-page rendering or fallback | 4 (scene stores only the screen id; HTML in `ScreenStore`; Step 13 failure notes cover the fallback) |
| Spike 4: sandbox settings, CSP, switch-screen message, native commands, runaway script | 2, 3, 4 (sandbox/CSP/probe/goto), 9 (runaway), 10 (native check) |
| Spike 5: two windows, DO relay, cursors, late join, reconnect | 6, 7, 8 |
| Spike 6: save, close, reopen | 8 (steps 8-10) |
| Spike 7: ~20 live frames | 9 |
| Spike 8: Mac web view, trackpad | 10 |
| Security: isolated origin, no popups/forms/downloads, network blocked, messages validated | 2, 3, 4 |
| Screen-to-screen links through the canvas | 2, 3, 4 |
| External links, network allowlist | Out of this spike (scope notes) |
| Relay: per-element version merge, viewers read-only, presence not stored, per-board Durable Object, reuse of signed session | 6, 7, 8 |
| Go/no-go report with no-go triggers | 4, 9, 10, 11 |
