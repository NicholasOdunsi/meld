# Design Room slice 0 — spike findings

Date: 2026-08-13
Spike: `.superpowers/sdd/2026-08-13-design-room-slice-0-spike/` (tasks 1–8)
Design spec: `docs/superpowers/specs/2026-08-13-design-room-design.md`

A spike's deliverable is a decision, not code. This report answers the eight
questions the spike was scoped to settle, cites the evidence for each, and
states the verdict. Slice 1 does not start until every verdict below is
**proven** or has an explicit design amendment (see the companion edits to
the spec).

## Verification pass (run in this task, real output)

```
$ pnpm --filter @meld/prototype test
 Test Files  3 passed (3)
      Tests  55 passed (55)

$ pnpm --filter @meld/prototype typecheck
> tsc --noEmit
(clean, no output)

$ pnpm --filter @meld/gateway test sqlite-canvas-room   # run under Node 22.23.2 (node:sqlite requires >=22)
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm test:figma-oembed
1..9
# tests 9
# pass 9
# fail 0

$ pnpm test:e2e:sandbox
Running 5 tests using 1 worker
overlay: 120 camera updates in 1970ms
  ✓ an inert overlay tracks camera movement without drifting (2.4s)
  ✓ no escape attempt reaches the network (952ms)
  ✓ storage, cookies, parent DOM, and top navigation all throw (504ms)
  ✓ an inert frame does not execute script at all (914ms)
  ✓ routing works inside the sandbox (277ms)
  5 passed (6.9s)

$ pnpm check:astryx
apps/web/src/features/rooms/components/stage-coaching-panel.tsx: raw <div> layout
apps/web/src/features/rooms/components/stage-coaching-panel.tsx: raw <span> layout
apps/web/src/features/rooms/components/stage-coaching-panel.tsx: hardcoded pixel
ELIFECYCLE  Command failed with exit code 1.
```

`check:astryx` fails as shown above, but the failure is **unrelated to this
spike**: `stage-coaching-panel.tsx` is an untracked file belonging to
concurrent, unrelated WIP on this shared branch (the "Room stage panel
concept" work — a different feature, not part of any slice-0 commit). It was
never touched by tasks 1–8. Confirmed by temporarily moving the file out of
the tree and rerunning: `pnpm check:astryx` then passes cleanly with no
output (exit 0), then the file was restored unchanged. This proves the thing
`check:astryx` exists to confirm for this spike — **no HTML-emitting module
leaked into `apps/web/src`** from the `@meld/prototype` package or the
gateway work — holds. The three flagged lines are raw-div/span/hardcoded-pixel
convention issues in an unrelated component, not an HTML-emission leak.

```
$ pnpm check:test-colocation
test colocation: 190 test files sit beside their module

$ pnpm lint
✖ 1 problem (0 errors, 1 warning)
apps/web/src/features/prd/repository.test.ts
  9:3  warning  'PrdVersionConflictError' is defined but never used
EXIT: 0
```

The single lint warning is the pre-existing, known issue called out in the
task brief — not introduced by this spike. `pnpm lint` exits 0.

## Findings

### 1. Can a generated screen escape the sandbox?

**PROVEN NO.** `e2e/prototype-sandbox.spec.ts` builds a real
`buildPrototypeDocument` output and loads it into `sandbox="allow-scripts"`
(`allow-same-origin` is never set). The spec runs an 11-attempt escape script
— `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, image beacon, form
submission, top-level navigation, `window.parent`/DOM access, `localStorage`,
`document.cookie`, and `window.open` — against a local capture server. The
capture server received **zero requests** across every attempt in every run.
`top-navigation`, `parent-dom`, `local-storage`, and `cookie` all throw
synchronously (opaque origin, no `allow-same-origin`); `window.open` is
blocked at the browser level (no `allow-popups`); form submission is blocked
at navigation time (no `allow-forms`); `fetch`/`xhr`/`websocket`/`eventsource`/
`beacon` are blocked by the CSP's `connect-src 'none'` / `img-src data:`.
Stable across 3+ consecutive runs, most recently 5/5 passing in this task's
verification pass.

### 2. Does an inert (`sandbox=""`) frame refuse to run script?

**PROVEN YES.** The same spec's `"an inert frame does not execute script at
all"` test loads the assembled document with `sandbox=""` (no
`allow-scripts`). The capture server received zero requests and the frame's
DOM stayed exactly as rendered — the screen's own script (which would set
`document.title = "ran"`) never executed. Canvas thumbnails/frames can safely
use `sandbox=""`.

### 3. Does routing work inside the sandbox?

**PROVEN YES.** `"routing works inside the sandbox"` starts on the first
screen (`<h1>` hidden for the second), clicks the action button, and confirms
the harness's delegated click handler navigates to the second screen
(`<h1>` becomes visible with the correct text) — all under
`sandbox="allow-scripts"` with no `allow-same-origin`.

### 4. Can a screen ride the default tldraw schema as a built-in `frame` with `meta`?

**PROVEN YES.** `apps/gateway/src/canvas/sqlite-canvas-room.test.ts`:
`insertScreenFrame` emits a built-in `frame` shape (`type: "frame"`) carrying
`meta: { meldScreenId }`. No custom shape type and no schema change — the
gateway's bare `createTLSchema()` already recognises `frame`, and `meta` is a
free-form bag on every shape record, so it passes the existing permissive
per-type record authorizers unchanged. The test
`"persists a screen frame and its meldScreenId across a reopen"` inserts a
screen frame, closes the `SqliteCanvasRoom`, opens a **brand-new** instance
against the same SQLite file, and asserts the reopened snapshot still shows
`{ type: "frame", meta: { meldScreenId } }` — `meta` round-trips through
SQLite persistence and a fresh-process reopen, not just an in-memory session.
A second test confirms screen frames stay distinguishable from ordinary
`geo` shapes under the same authorizer path. tldraw stays at `5.3.0`;
`props` (`w`, `h`, `name`, `color`) match `TLFrameShapeProps` verbatim. 6/6
tests pass.

### 5. Does Figma oEmbed return a usable thumbnail without OAuth?

**OPEN.** The probe (`scripts/design/figma-oembed-check.mjs`) and its
self-test (`pnpm test:figma-oembed`, 9/9 passing — URL normalisation, host
allowlist, https-only, byte-cap enforced on actual UTF-8 bytes not string
length, userinfo stripped, thumbnail extraction, 404/error handling) are
proven. The endpoint itself is reachable and enforces URL shape correctly: a
live attempt against a placeholder `/file/` URL returned a clean 404 (not a
crash or malformed response), and the probe's own hardening was proven
against a Figma *community* URL, which the endpoint rejects with "Not a
Figma URL" (community files are not the same object type as link-shared
`/design/` or `/file/` files). No genuine link-shared Figma file URL was
available in this environment, so the actual thumbnail payload has never
been observed. This is a **human step**:

```
node scripts/design/figma-oembed-check.mjs --live "<shared-figma-file-url>"
```

**Consequence for later slices:** the spec already treats a Figma link as
readiness-satisfying even when oEmbed fails, and the lane degrades to a
plain link card — so this OPEN verdict does not block slice 1 or later
work, but the live probe must be run with a real shared link before shipping
the Figma preview-card UI.

### 6. Does the canvas overlay track the camera?

**PROVEN (viable).** `e2e/prototype-overlay.spec.ts`: an inert overlay
(absolutely-positioned iframe, transform-driven placement) tracked 120
simulated camera updates (pan + zoom) with **zero accumulated drift** — final
rect landed exactly at 238×119px — and completed all 120 updates in
**1970–1974ms** across runs (most recent run in this task: `overlay: 120
camera updates in 1970ms`).

Interpreted carefully: 120 awaited `requestAnimationFrame` frames have a
~2000ms floor at 60fps, so a ~1970-1974ms result means the overlay added
negligible per-frame cost — it did **not** cause gross frame-rate
degradation. This is **not** a per-frame skip audit (it does not prove zero
frames were ever skipped under real GPU/paint load). Verdict: live overlays
are viable for slice 3; the static-image fallback described in the spec is
retained as a contingency, not required.

### 7. Do the byte budgets fit the task caps?

**PROVEN.** `packages/prototype/src/screen-payload.test.ts`,
`"leaves headroom inside the connector result cap"`: markup (96 KiB) +
styles (32 KiB) + script (32 KiB) = 160 KiB is asserted
`≤ MAX_RESULT_BYTES * 0.7` (i.e. ≤ 70% of the 256 KiB connector result cap),
measured with UTF-8 byte length (`TextEncoder`), not code-unit length — a
distinction separately proven in the same suite with a 𝄞 (surrogate-pair)
character. 55/55 tests pass across the package.

### 8. Task scope

**DECIDED, not tested.** `ai_tasks.room_id` is `not null`
(`supabase/migrations/202607280001_*.sql`, line 83: `room_id uuid not
null,`), and `AITaskSchema.roomId` is required
(`packages/contracts/src/ai.ts`, `roomId: z.string().uuid()`). Every task in
the system is room-scoped by construction. Rather than generalising the task
model — nullable `room_id` plus a scope column, rippling through RLS,
dispatch, gateway hydration, and settlement for one task kind — **profile
distillation is initiated from a room**, and its *result* is promoted to
workspace scope. No code proves this because none was needed to prove it;
it's a design constraint slice 1 implements directly. Stated here so a
future reader does not go looking for evidence that was never meant to
exist.

## Design changes surfaced by the spike

Follow-ups discovered during the spike, for slice 1 to inherit:

- **Routing must be namespaced per screen.** The assembler's route table is
  currently flat, keyed by action id. Action ids are only unique **within a
  screen** (`DesignScreenPayloadSchema.superRefine`), so two screens each
  using an action id like `"go"` would misroute in a flat table. Slice 1 must
  namespace routes by screen (e.g. `{ screenId: { actionId: target } }`) or
  guarantee globally-unique action ids.
- **`insertScreenFrame` is create-only as written** — its record id is
  derived from `meldScreenId` alone, so a repeat call overwrites the frame's
  x/y/w/h. Slice 1 needs an idempotency/no-op guard before calling it on a
  screen that already has a shape.
- **Safety scan hardening applied in-slice.** Four bypasses found and fixed
  during task 2: backslash-style remote URLs (`\\evil.test/...`, which
  browsers normalise like `//`), static `import ... from` (only dynamic
  `import()` was originally covered), bracket-notation navigation
  (`window["open"]`, `window["location"]`), and script-rule findings leaking
  raw regex source instead of the offending construct. A known residual: the
  CSS comment-strip in the assembler (`splitHoistedAtRules`) is not
  CSS-string-literal aware — cosmetic (could mis-hoist an at-rule mentioned
  inside a CSS string), not a sandbox breakout.
- **Assembler integrity:** `<script>`/`<style>` raw-text breakout (content
  like `"</script>"` inside a screen's own script or CSS terminating the
  assembled document's real `<script>`/`<style>` tags early) is neutralised
  within the document — the iframe still contains all content, but a
  screen's content can no longer corrupt the assembled document's own
  structure. This is a robustness fix inside the (already sandboxed)
  document, not a new external escape.
