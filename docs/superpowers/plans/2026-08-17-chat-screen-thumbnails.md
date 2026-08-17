# Plan: reliable client-captured screen thumbnails in chat

## Context

The design agent's chat reply renders a thumbnail of the built screen. Today
(`apps/web/src/features/design/components/agents-transcript.tsx`) that thumbnail
is a **live sandboxed `<iframe srcDoc>`** — the same preview doc the canvas
frame renders (`buildFramePreviewDoc` in
`apps/web/src/features/canvas/screen-preview-doc.ts`). Rendering one such live
iframe per chat message is slow, and the component paints a hardcoded white
`backgroundColor` behind it (commit `173ea39`) so an unpainted iframe reads as a
clean-but-blank white card. Net effect the user reports: thumbnails are white
and slow, while the canvas (few frames, static surface) renders fine.

**Fix:** replace the per-message live iframe with a **one-time client capture →
in-memory-cached PNG → `<img>`** flow. The live iframe stays only on the canvas.
Capture is proven feasible dependency-free (spike, 2026-08-17): a hidden
`sandbox="allow-same-origin"` iframe renders the exact same preview doc (scripts
stay inert, start screen is visible in raw HTML), and the parent rasterizes it
via `XMLSerializer` → SVG `<foreignObject>` → `<canvas>` → PNG data URL. The
canvas is untainted (same-origin + `data:`/inline resources only) and CSS
variables resolve correctly.

Only the shared `ScreenThumbnail` component is rewired, so this fixes both the
room feed (`conversation.tsx`) and the canvas Agents panel (`screen-composer.tsx`)
at once. **No storage, no migration, no backfill, no server rendering, no new
dependency, no change to `buildFramePreviewDoc`'s output or to the canvas
`ScreenFrameOverlay`.**

## Global Constraints

- **No new npm dependency.** Capture is hand-rolled (`XMLSerializer` +
  `foreignObject` + `<canvas>`), per the validated spike.
- **The capture iframe uses `sandbox="allow-same-origin"`** (NOT `sandbox=""`):
  readable by the parent, but scripts stay disabled. Never grant
  `allow-scripts`.
- **The cache is ephemeral and in-memory only** — a module-level `Map`. No
  `localStorage`/`sessionStorage`, no DB, no network.
- **Do not modify** `buildFramePreviewDoc`, `screen-preview-doc.ts`,
  `screen-frame-overlay.tsx`, or the canvas overlay. The picker chrome is
  removed on the capture side, not by changing the shared doc.
- **Fallbacks never show a white card.** While capturing → skeleton. On
  capture error/timeout, or when the screen has no safe preview → the existing
  "View <screen>" button.
- New browser-only modules are `"use client"` where they use React; the pure
  capture util needs no directive but is browser-only (guard/deny SSR by only
  being called from effects).
- Match existing code style in `features/design`. Reuse design tokens and the
  `@astryxdesign/core` `Skeleton` component (see `prd-generating.tsx` for usage).

## Task 1 — `captureScreenThumbnail` util

**File:** `apps/web/src/features/design/capture-screen-thumbnail.ts` (new)

Implement the hand-rolled capture, exactly the pipeline the spike proved.

```ts
export type ThumbnailSize = { width: number; height: number };

export type CaptureOptions = { signal?: AbortSignal; timeoutMs?: number };

// Renders `doc` in a hidden, script-inert, same-origin iframe and returns a PNG
// data URL of the rendered device frame. Rejects on abort, timeout, or any
// rasterization failure (tainted canvas, image load error). Default timeout:
// 8000ms.
export async function captureScreenThumbnail(
  doc: string,
  size: ThumbnailSize,
  options?: CaptureOptions,
): Promise<string>;
```

Behavior (in order):
1. Reject immediately if `options.signal?.aborted`.
2. Create an `<iframe>`: `sandbox="allow-same-origin"`, `srcdoc = doc`, sized
   `size.width × size.height`, positioned off-screen
   (`position:fixed; left:-99999px; top:0; border:0; visibility:hidden` is fine
   but it MUST have real layout dimensions — do not use `display:none`).
   Append to `document.body`.
3. Await the iframe `load` event, racing a `timeoutMs` timer and the abort
   signal. On timeout/abort → reject.
4. Read `iframe.contentDocument`; if null → reject. Remove the
   `#meld-screen-picker` element from it if present.
5. `const xml = new XMLSerializer().serializeToString(contentDocument.documentElement)`.
6. Build `svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>\``.
7. Load it into an `Image` from
   `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, racing the
   same timeout/abort. On `onerror` → reject.
8. Draw the image onto a `<canvas>` sized `w × h`; `canvas.toDataURL("image/png")`
   inside try/catch (tainted → reject).
9. **Always** remove the iframe (finally block), even on reject.

**Tests** (`capture-screen-thumbnail.test.ts`, jsdom): jsdom cannot rasterize,
so assert observable behavior with the DOM/canvas seams stubbed where needed:
- Rejects synchronously-ish when `signal.aborted` is already true.
- Mounts an iframe with `sandbox="allow-same-origin"` and the given `srcdoc`,
  and **removes it from the DOM** after resolve AND after reject (spy on
  `document.body.childElementCount` or the element).
- Given a `load` that never fires, rejects after `timeoutMs` (use fake timers).
- Removes `#meld-screen-picker` from the captured document before serializing
  (can assert via a stubbed `contentDocument`).
Do NOT assert pixel output in jsdom. Note in the report that real rasterization
is covered by the 2026-08-17 spike.

## Task 2 — `useScreenThumbnail` hook

**File:** `apps/web/src/features/design/use-screen-thumbnail.ts` (new, `"use client"`)

A hook that lazily captures a screen's thumbnail when it scrolls near the
viewport, with an in-memory content-addressed cache. Depends on Task 1's
`captureScreenThumbnail` and `ThumbnailSize`.

```ts
export type ScreenThumbnailState =
  | { status: "idle" }        // not yet visible / no doc
  | { status: "capturing" }
  | { status: "ready"; src: string }
  | { status: "error" };

export function useScreenThumbnail(
  doc: string | null,
  size: ThumbnailSize,
): { state: ScreenThumbnailState; containerRef: (node: Element | null) => void };
```

Behavior:
- Module-level `const cache = new Map<string, string>()` mapping a **hash of
  `doc`** → PNG data URL. Implement a small, fast string hash (e.g. FNV-1a) over
  the full `doc`; identical content reuses the cached PNG across remounts and
  across both mount sites.
- `doc === null` → state stays `{ status: "idle" }`, never captures. (Caller
  renders the View button.)
- If `doc` is non-null and already cached → return `{ status: "ready", src }`
  immediately (no capture, no visibility wait).
- Otherwise: set up an `IntersectionObserver` on the element passed to
  `containerRef` (use a callback ref; re-observe when the node changes). When it
  first intersects (rootMargin e.g. `"200px"` so it captures just before
  visible), transition `idle → capturing`, call `captureScreenThumbnail(doc,
  size, { signal })`, then on success cache + `→ ready`, on failure `→ error`.
- Abort the in-flight capture on unmount or when `doc` changes (AbortController).
- Disconnect the observer once capture starts (one-shot).
- Guard `typeof IntersectionObserver === "undefined"` (SSR/jsdom without the
  polyfill): treat as immediately-visible and capture on mount (still gated by
  `doc` non-null).

**Tests** (`use-screen-thumbnail.test.tsx`, jsdom + `@testing-library/react`):
inject a fake `captureScreenThumbnail` via `vi.mock`, and a controllable
`IntersectionObserver` mock (store the callback, fire it manually).
- `doc === null` → stays `idle`, capture never called.
- Cached doc → `ready` immediately without waiting for intersection.
- Not visible → `idle`; after the observer fires → `capturing` → `ready` with
  the resolved src; capture called once.
- Capture rejects → `error`.
- Second hook with the same `doc` → `ready` from cache, capture NOT called again.
- Unmount mid-capture aborts (assert the signal passed to capture is aborted).

## Task 3 — Rewrite `ScreenThumbnail` to use the hook

**File:** `apps/web/src/features/design/components/agents-transcript.tsx` (edit)
Plus its test `agents-transcript.test.tsx`.

Rewrite the `ScreenThumbnail` component (currently the live-iframe + white-fill
block). Remove the `<iframe>`, the `backgroundColor:"#ffffff"`, `colorScheme`,
and `loading="lazy"`. New behavior:

- Compute `doc = useMemo(() => { try { return buildFramePreviewDoc(screen,
  tokenCss); } catch { return null; } }, [screen, tokenCss])` (keep existing).
- `size = frameSizeForFormFactor(screen.formFactor)` (keep). Display box stays
  `THUMBNAIL_WIDTH = 220`, `height = Math.min(size.h * (220 / size.w),
  THUMBNAIL_MAX_HEIGHT = 200)` (keep the existing constants/mapping).
- `const { state, containerRef } = useScreenThumbnail(doc, { width: size.w,
  height: size.h })`.
- Render inside the existing `<button>` (keep `data-testid=
  \`agents-thumbnail-${screen.id}\``, `aria-label`, `onClick={onOpen}`,
  `borderRadius`, `border`, `overflow:hidden`, the 220×height box) — attach
  `ref={containerRef}`:
  - `state.status === "ready"` → `<img src={state.src}>` at `width:100%;
    height:100%; object-fit:cover; object-position:top; display:block`.
  - `"idle" | "capturing"` → `<Skeleton>` filling the box (width 220, height as
    computed; radius to match). Import from `@astryxdesign/core/Skeleton`.
  - `"error"` → render the **View button fallback** (see below) INSTEAD of the
    button/skeleton — i.e. capture failure degrades to the same affordance as
    "no preview".
- When `doc === null` (no safe preview) → render the View button fallback, as
  today.

**View button fallback:** the existing `BuiltReply` already renders a
`<Button>View</Button>` when there's no `screen`. Factor the button into a small
local helper (e.g. `ViewScreenButton({ screenName, onOpen })`) reused by both
`BuiltReply`'s no-screen branch and `ScreenThumbnail`'s null-doc/error branch, so
there's one View-button implementation. Keep its label/size/variant identical.

`BuiltReply` keeps deciding thumbnail-vs-button by whether `screen && onPreview`
exist; `ScreenThumbnail` now internally owns the doc-null/error → button
degradation.

**Tests** (`agents-transcript.test.tsx`): the existing thumbnail assertions
expect the live iframe — update them. Mock `useScreenThumbnail` (or
`captureScreenThumbnail` + IntersectionObserver) so the component is
deterministic:
- `ready` → renders an `<img>` with the src, inside the testid button, click
  calls `onPreview` with the screen id.
- `capturing`/`idle` → renders a `Skeleton`, no `<img>`, no iframe.
- `error` → renders the "View <screen>" button, click calls `onPreview`.
- No-safe-preview screen (doc null) → View button (existing case still passes).
Ensure no `<iframe>` is rendered by `ScreenThumbnail` in any state.

## Verification

- `pnpm --filter web test` (or the repo's test runner) green for the three new/
  edited test files.
- `pnpm --filter web typecheck` / lint clean for changed files.
- Manual: a design turn in the room feed shows a skeleton then a faithful
  screen image (not a white box); the canvas Agents panel behaves the same; the
  canvas frame overlay is unchanged.
