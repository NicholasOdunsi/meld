# Prototype Fidelity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop two ways a generated prototype lies to the person looking at it — a photo that renders as a broken-image icon, and a primary button that does nothing when clicked.

---

## In plain language

Two things went wrong on the same screen, and they are unrelated bugs with the same shape: **the model produced something wrong, and nothing downstream noticed.**

**The broken photo.** We ask the model to write real Unsplash photo URLs. Unsplash photo IDs are random opaque strings, so the model cannot recall them reliably — it gets most right and invents the rest. Measured on the current room: 13 of 14 URLs return 200, one returns 404, and that one is exactly the broken image in the report. Safety checking validates the *host* and never asks whether the photo exists, so a fabricated ID renders as a broken-image icon with alt text sitting on top of the design — worse-looking than no photo at all.

**The dead "Continue to checkout".** That button was built pointing at nothing: `targetScreenKey: null`. `configure_purchase` was generated at 14:52 and `checkout` at 14:58, in a later run — so when the button was written its destination did not exist yet. The prompt only forbids a null target for *layout nav controls*; for an ordinary button it explicitly permits null. The model took the permitted option on the most important button of the screen. Counting inbound links, `checkout` has exactly one, from `review_pay` — the screen that comes *after* it. The forward path does not exist.

That also silently broke the chain: a null target is not a dangling target, so nothing ever queued a run to connect them. Forward-referencing by key is the exact mechanism chained generation depends on, and CTAs were exempt from it.

And clicking a dead button does nothing visible at all — the harness sets `data-meld-unresolved` on the body and returns. Nothing reads that attribute: not CSS, not app chrome. So a missing link is indistinguishable from broken software.

---

## Two deliberate departures from the first sketch

**Images are repaired in the browser, not verified in the connector.** The first proposal was to HEAD-check each URL in the connector before saving. A browser-side fallback is strictly better: it costs no network round-trips at generation time, it also catches URLs that rot *after* generation, it needs no connector rebuild, and — decisively — it repairs screens that are **already** broken without regenerating them. Both approaches can only end at the same place (a neutral surface where the photo was), so the cheaper one that fixes existing data wins.

**There is no count of unconnected buttons in the toolbar.** It was proposed and it cannot be built honestly. Across the current room, 56 actions have no target, and almost all are deliberate: search, notifications, quantity steppers, "Save listing". Only 3 are genuinely dead CTAs. Nothing distinguishes a dead CTA from an intentional no-op button, so the badge would read "56" when the true answer is 3. A number that wrong is worse than no number. The per-click notice tells the truth at the moment it matters.

---

## Global Constraints

- **Stage only the files you touched, by path.** This workspace carries substantial unrelated uncommitted work (agent cards, toolbar, plane hints, canvas data). `git add -A`, `git add .` and `git commit -a` are FORBIDDEN — they would sweep another session's work into your commit. `git add <exact paths>` only.
- Node must be v22.23.2: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.
- Run tests from the package root: `cd apps/web`, `cd packages/prototype`, or `cd apps/connector`.
- **The harness is a template string of ES5.** `HARNESS` in `prototype-document.ts` is `const`-and-`function`-only ES5 running inside a sandboxed frame: no arrow functions, no `let`/`const`, no template literals, no optional chaining. Match the surrounding style exactly. It is also inside a JS template literal, so a literal backtick or `${` must be escaped.
- **Iframe→host messages are validated by `event.source === iframe.contentWindow`**, never by `event.origin` — the frame is `sandbox="allow-scripts"` without `allow-same-origin`, so its origin is opaque and arrives as `"null"`.
- **Do not touch the CSP.** `img-src data: https://images.unsplash.com` already permits everything this plan needs.
- Pre-existing failures that are NOT yours: 3 tests in `apps/web/src/features/rooms/components/conversation.test.tsx`, plus stale specs in `[workspaceId]/page`, `prd-document`, `prd-editor`. Do not fix them; do not let them block you.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/connector/src/tasks/design-screen-generate-prompt.ts` | Forward CTAs must name a target | 1 |
| `packages/prototype/src/prototype-document.ts` | Report unresolved clicks; repair broken photos | 2, 3 |
| `apps/web/src/features/design/use-prototype-frame.ts` | Carry the unresolved report to the host | 2 |
| `apps/web/src/features/design/components/prototype-viewer.tsx` | Show the notice | 2 |

---

### Task 1: A forward CTA must name its destination

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts`
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a system prompt whose never-null rule covers forward CTAs, not just layout nav controls.

- [ ] **Step 1: Write the failing test**

In `design-screen-generate-prompt.test.ts`, alongside the existing rule assertions (see the `targetScreenKey` group around line 140), add:

```ts
it("requires a forward CTA to name a destination, not just layout nav", () => {
  // The bug this pins: "Continue to checkout" shipped with
  // targetScreenKey: null because the never-null rule named only layout nav
  // controls. The destination screen was generated six minutes later in the
  // next chain run, and nothing ever linked the two -- a null target is not
  // a dangling target, so no follow-up was queued either.
  const p = DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT;
  expect(p).toMatch(/moves the flow forward/i);
  expect(p).toMatch(/Continue/);
  expect(p).toMatch(/forward-reference/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd apps/connector && pnpm vitest run src/tasks/design-screen-generate-prompt.test.ts
```
Expected: FAIL on `/moves the flow forward/i`.

- [ ] **Step 3: Add the rule**

In `BASE_RULES`, immediately after the existing line that begins `- Set each navigating action's targetScreenKey`, insert this line **verbatim**:

```
- A control that moves the flow forward -- Continue, Next, Checkout, Confirm, Pay, Submit, Get started, or a screen's primary CTA -- MUST carry a targetScreenKey; NEVER null. If its destination is not built yet, forward-reference it by key and a later run heals the link. null is only for controls that genuinely stay put: steppers, toggles, search, notifications, save-for-later.
```

Leave every other rule, including the layout-nav rule, exactly as it is. The two rules are deliberately separate: one is about the app shell, this one about page content.

- [ ] **Step 4: Verify**

```bash
cd apps/connector && pnpm vitest run src/tasks/design-screen-generate-prompt.test.ts
```
Expected: PASS, all tests in the file.

- [ ] **Step 5: Commit**

`git add apps/connector/src/tasks/design-screen-generate-prompt.ts apps/connector/src/tasks/design-screen-generate-prompt.test.ts` then commit.

---

### Task 2: A dead button says so

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Modify: `apps/web/src/features/design/use-prototype-frame.ts`
- Modify: `apps/web/src/features/design/components/prototype-viewer.tsx`
- Test: `packages/prototype/src/prototype-document.test.ts`, `apps/web/src/features/design/use-prototype-frame.test.ts` (or the existing equivalent), `apps/web/src/features/design/components/prototype-viewer.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `meld:action-unresolved` (iframe → host) carrying `{ action: string, label: string }`; `usePrototypeFrame` gains an `onUnresolved` callback; the viewer renders a transient notice.

**Contract:**

1. When a click resolves to no target, the harness continues to set `data-meld-unresolved` (existing tests depend on it) **and** posts `{ type: "meld:action-unresolved", action, label }` to `parent`, wrapped in `try/catch` like the existing `report` and shortcut posts. `label` is the clicked control's trimmed `textContent`, collapsed to single spaces, capped at 60 characters. An empty label posts `""` — the host handles that case, not the harness.
2. `usePrototypeFrame` gains optional `onUnresolved?: (info: { action: string; label: string }) => void`, held in a ref like `onScreenChanged` and `onShortcut`, validated the same way: right `event.source`, object payload, both fields strings.
3. `PrototypeViewer` shows a notice naming the button: **`"Continue to checkout" isn't connected to a screen yet.`** With an empty label, it reads: **`That button isn't connected to a screen yet.`** The notice replaces itself when a different dead button is clicked, and clears when navigation succeeds (a `meld:screen-changed` arrives).
4. The notice must not cover the screen pill or the viewport toggle, and must not resize the iframe — a remount resets the prototype to its start screen.

**Wording is fixed.** Use those two sentences exactly; they are asserted in tests. Say "isn't connected to a screen yet" — not "broken", not "invalid". The button is fine; its destination has not been built.

- [ ] **Step 1: Write the failing tests**

In `packages/prototype/src/prototype-document.test.ts`, near the existing `data-meld-unresolved` assertion (around line 183):

```ts
it("tells the host when a click resolves to nothing", () => {
  // Silence here is what made a missing link look like broken software:
  // data-meld-unresolved was set on the body and read by nobody.
  const doc = buildPrototypeDocument(twoScreenInput());
  expect(doc).toContain('"meld:action-unresolved"');
});
```

Then extend the existing harness-execution test (the one that asserts `bodyAttributes.get("data-meld-unresolved")`) to assert the posted message: it must be `{ type: "meld:action-unresolved", action: "go", label: <the control's text> }`. Follow that test's existing mechanism for capturing `parent.postMessage` — do not invent a second one.

For `usePrototypeFrame`: a test that an `onUnresolved` callback fires for a well-formed message from the right source, and does **not** fire for one from a foreign `event.source`.

For `PrototypeViewer`: a test that the notice text appears with the exact sentence after an unresolved message, and disappears after a `meld:screen-changed`.

- [ ] **Step 2: Run them to verify they fail**

```bash
cd packages/prototype && pnpm vitest run src/prototype-document.test.ts
cd apps/web && pnpm vitest run src/features/design/use-prototype-frame.test.ts src/features/design/components/prototype-viewer.test.tsx
```
Expected: FAIL, all new assertions.

- [ ] **Step 3: Implement**

Harness first, then the hook, then the viewer. Build the notice from Astryx components and `--meld-*` / `--spacing-*` tokens — read the actual API at implementation time rather than guessing; `Banner` is the likely fit. No raw hex.

- [ ] **Step 4: Verify**

Run both suites above plus the whole `packages/prototype` suite. Report the exact commands and output.

- [ ] **Step 5: Commit** (staging only the paths above)

---

### Task 3: A missing photo degrades to a clean surface

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1 or 2 — but it edits the same `HARNESS` string as Task 2, so it runs after it.
- Produces: any `<img>` that fails to load is swapped to a neutral gradient and marked `data-meld-photo-missing`.

**Contract:**

1. The harness catches image load failures **two** ways, because one is not enough:
   - a capture-phase `window.addEventListener("error", handler, true)`, which sees resource errors that bubble nowhere; and
   - a sweep at startup over every `<img>` already in the document, treating `img.complete && img.naturalWidth === 0` as failed. The harness script runs at the end of the body, so an image can already have failed before any listener exists. Without the sweep the fix misses exactly the fast-404 case it was written for.
2. A failed image keeps its element, its box, its classes and its `alt` — only `src` is replaced. Replacing the `<img>` with a `<div>` is forbidden: generated CSS targets `img` for `object-fit`, `aspect-ratio` and sizing, and swapping the tag silently breaks those layouts.
3. The replacement is an inline SVG `data:` URI drawing a neutral vertical gradient, with `preserveAspectRatio="none"` so it fills whatever box the image had. `img-src data:` is already in the CSP; do not change it.
4. The element gets `data-meld-photo-missing` set — the seam tests assert on, and a hook for styling later.
5. Guard against re-entry: once an element carries `data-meld-photo-missing`, the handler returns immediately. A data URI cannot fail, but the guard costs one line and an error loop inside a sandboxed frame is unpleasant to debug.

- [ ] **Step 1: Write the failing tests**

In `packages/prototype/src/prototype-document.test.ts`:

```ts
it("repairs an image that fails to load", () => {
  // 1 in 14 generated Unsplash URLs 404s -- the model cannot recall opaque
  // photo IDs reliably. A broken-image icon with alt text sitting on the
  // design reads far worse than no photograph at all.
  const doc = buildPrototypeDocument(twoScreenInput());
  expect(doc).toContain("data-meld-photo-missing");
  expect(doc).toContain("naturalWidth");
});
```

Then, using the file's existing harness-execution harness, add behavioural tests:
- an `<img>` whose load fails gets `data-meld-photo-missing` and a `data:image/svg+xml` `src`, and is still an `IMG` element with its `alt` intact;
- an image that already failed **before** the harness ran (`complete === true`, `naturalWidth === 0`) is repaired by the startup sweep;
- a healthy image is left completely untouched.

If the existing test harness cannot model image loading, extend it — say so in your report rather than dropping the assertion.

- [ ] **Step 2: Run to verify failure**

```bash
cd packages/prototype && pnpm vitest run src/prototype-document.test.ts
```

- [ ] **Step 3: Implement in `HARNESS`**

ES5 only (see Global Constraints). Watch the escaping: the SVG data URI contains characters that must survive being inside a TypeScript template literal.

- [ ] **Step 4: Verify**

```bash
cd packages/prototype && pnpm vitest run
cd apps/web && pnpm vitest run src/features/design
```

- [ ] **Step 5: Commit** (staging only the paths above)

---

## Testing

Every task is test-first: the test lands failing, then the implementation.

**Not covered by unit tests, and stated rather than assumed:** whether a real 404 image in a real sandboxed iframe is actually repaired, and whether the notice reads well over a generated screen, can only be judged by looking at the running app. jsdom does not load images and does not enforce CSP. That check is manual and is not claimed as done by any test in this plan.

## Out of scope

- Repairing the existing `configure_purchase → checkout` link in the live database (a data fix, offered separately — it is the user's room).
- The `my_orders` chain loop (10 inbound links, screen soft-deleted twice) — a separate open bug.
- Connector-side URL verification (see "deliberate departures").
- Any change to the CSP or to `screen-safety.ts`.
