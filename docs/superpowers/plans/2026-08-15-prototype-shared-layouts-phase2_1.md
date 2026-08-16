# Prototype Shared Layouts — Phase 2.1 (Layout boundary + dynamic chrome) Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix two layout-boundary defects seen in real generations: (1) a shared layout that bakes in screen-specific state (active nav item, breadcrumb current page, contextual pills) so every screen shows the wrong one; (2) layout nav links left with null targets so the shared sidebar doesn't navigate. Make the shell an invariant frame, let the routing harness set active-state/breadcrumb dynamically per current screen, and heal nav targets via forward-reference keys surfaced as dangling targets.

**Architecture:** The routing harness (which already knows the current screen) gains active-state + breadcrumb behavior driven by a `data-meld-active` attribute and a `data-meld-crumb` placeholder — so the static shared shell renders correct per-screen chrome without baking anything in. The generation prompt is tightened so the layout is screen-agnostic and its nav always carries stable `targetScreenKey`s. Layout nav targets join the dangling-target set so later screens get keyed to fulfill them.

**Tech Stack:** TypeScript, Vitest (+ jsdom for harness runtime), Zod, JSON Schema.

## Global Constraints

- Evidence this fixes: DB shows layout `fleet_os` shell hardcodes `<button class="sb-item active" data-meld-action="nav_events">` and `<span class="cr-cur">Auction Events</span>`; and its nav actions `Vehicle Pool`/`Allocation Results` have `targetScreenKey = null` while screens `vehicle_pool`/`allocation_results` exist.
- The shell is STATIC markup reused verbatim across screens, so anything varying per screen (active nav, breadcrumb current) MUST NOT be baked in — it is applied at runtime by the harness.
- Active-state contract: the harness marks the nav control whose route target equals the current screen with attribute `data-meld-active` (empty value), and removes it from all others; layouts style the active state via the `[data-meld-active]` selector, NOT a hardcoded class on a specific item.
- Breadcrumb contract: the harness sets the text of a `[data-meld-crumb]` element (if present in the current section) to the current screen's name (the section's `aria-label`).
- Active-state/breadcrumb only apply within layout sections (`<section … data-meld-layout=…>`) — standalone (`layout: null`) screens are behaviorally untouched.
- No DB/migration change. No new CSP capability (harness uses querySelector/textContent/setAttribute only).
- The `layout` wire shape is unchanged from Phase 2; this only changes prompt guidance + rendering + dangling computation.

---

### Task 1: Harness applies active-state + breadcrumb per current screen

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts` (the `HARNESS` string, inside `show()`)
- Test: `packages/prototype/src/prototype-document.test.ts` (+ a jsdom runtime test)

**Interfaces:**
- Produces: rendered documents whose harness, on navigating to a screen, sets `data-meld-active` on the current screen's nav control and fills `[data-meld-crumb]`. Standalone screens unaffected.

- [ ] **Step 1: Write a failing jsdom runtime test.** In `prototype-document.test.ts`, add (at top of file if not present) `// @vitest-environment jsdom` OR a per-test jsdom setup (check how the package configures env; if the file must stay node, create a new `prototype-document.harness.test.ts` with `// @vitest-environment jsdom`). Build a document with a layout whose shell has two nav buttons and a crumb placeholder:

```ts
// @vitest-environment jsdom
import { buildPrototypeDocument } from "./prototype-document";

function render(html: string) {
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<body[^>]*>/, "").replace(/<\/body>[\s\S]*$/, "");
  // execute the harness <script>
  const scripts = Array.from(document.querySelectorAll("script:not([type])"));
  for (const s of scripts) { const fn = new Function(s.textContent ?? ""); fn(); }
}

it("marks the current screen's nav control active and fills the breadcrumb", () => {
  const shell =
    '<nav><a data-meld-action="nav-a">A</a><a data-meld-action="nav-b">B</a></nav>' +
    '<span data-meld-crumb></span><main data-meld-slot></main>';
  const layout = { id: "L1", shellMarkup: shell, shellStyles: "", actions: [
    { id: "nav-a", label: "A", targetScreenId: "s1", targetScreenKey: "a" },
    { id: "nav-b", label: "B", targetScreenId: "s2", targetScreenKey: "b" },
  ]};
  const base = { styles: "", script: null };
  const html = buildPrototypeDocument({
    startScreenId: "s1", tokenCss: "",
    screens: [
      { ...base, id: "s1", name: "Alpha", screenKey: "a", markup: "<p>a</p>", actions: [], layout },
      { ...base, id: "s2", name: "Beta", screenKey: "b", markup: "<p>b</p>", actions: [], layout },
    ],
  });
  render(html);
  const s1 = document.querySelector('[data-meld-screen="s1"]')!;
  // start screen s1: its nav-a (namespaced layout__nav-a) points at s1 → active; crumb = "Alpha"
  expect(s1.querySelector('[data-meld-action="layout__nav-a"]')!.hasAttribute("data-meld-active")).toBe(true);
  expect(s1.querySelector('[data-meld-action="layout__nav-b"]')!.hasAttribute("data-meld-active")).toBe(false);
  expect(s1.querySelector("[data-meld-crumb]")!.textContent).toBe("Alpha");
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/prototype test prototype-document` → the new test FAILS (no `data-meld-active` / crumb empty).

- [ ] **Step 3: Implement the harness change.** In `prototype-document.ts`, inside `HARNESS`'s `show(id)`, AFTER `document.body.setAttribute("data-meld-current", id);` and before `return true;`, add — only for layout sections:

```js
    if (next.hasAttribute("data-meld-layout")) {
      var tbl = routes[id] || {};
      var controls = next.querySelectorAll("[data-meld-action]");
      Array.prototype.forEach.call(controls, function (el) {
        var act = el.getAttribute("data-meld-action");
        if (Object.prototype.hasOwnProperty.call(tbl, act) && tbl[act] === id) {
          el.setAttribute("data-meld-active", "");
        } else {
          el.removeAttribute("data-meld-active");
        }
      });
      var crumb = next.querySelector("[data-meld-crumb]");
      if (crumb) { crumb.textContent = next.getAttribute("aria-label") || ""; }
    }
```
(`next` is already the resolved section in `show`.) Do not touch the click handler, picker, CSP, or namespacing.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/prototype test prototype-document` → new test PASSES. Add a second assertion: after simulating a click on `layout__nav-b` (or calling the picker), s2 becomes active and its crumb reads "Beta", and s1's `data-meld-active` is cleared. (Dispatch a click on the `layout__nav-b` element inside the visible section and re-query.)

- [ ] **Step 5: Update the standalone byte-identical regression.** The Phase 1 "`layout: null` renders byte-identical" snapshot test will now differ ONLY because the embedded harness string changed (a legitimate, intended change). Update that expected snapshot to the new harness output, and confirm a `layout: null` screen still has NO `data-meld-active`/`data-meld-crumb` behavior (the gate `next.hasAttribute("data-meld-layout")` is false for standalone sections). Keep all other standalone assertions intact.

- [ ] **Step 6: Full package suite** — `pnpm --filter @meld/prototype test` green.

- [ ] **Step 7: Commit** — `git add packages/prototype/src/prototype-document.ts packages/prototype/src/prototype-document*.test.ts && git commit -m "feat(prototype): harness drives active-nav and breadcrumb per current screen"`

---

### Task 2: Prompt — invariant layout frame + always-targeted nav (v3)

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts` (`BASE_RULES`, version)
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Produces: `BASE_RULES` layout bullets that forbid baked-in screen-specific state and require targeted nav; `DESIGN_SCREEN_GENERATE_PROMPT_VERSION = "design-screen-generate-v3"`.

- [ ] **Step 1: Write failing tests** in `design-screen-generate-prompt.test.ts`:

```ts
it("prompt version is v3", () => {
  expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe("design-screen-generate-v3");
});
it("layout rules forbid baked screen-specific state and require targeted nav", () => {
  const p = DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT;
  expect(p).toMatch(/data-meld-active/);          // active state contract
  expect(p).toMatch(/data-meld-crumb/);           // breadcrumb contract
  expect(p).toMatch(/never .*null/i);             // nav always targeted (phrasing may vary; keep the assertion aligned to the added text)
});
```
(Adjust the third matcher to the exact phrase you write, but it MUST assert nav links are never null.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/connector test design-screen-generate-prompt` → FAIL.

- [ ] **Step 3: Implement.** In `BASE_RULES`, REPLACE the current layout bullets (lines ~31-34, the ones beginning "A layout is the persistent app shell…") so they read (verbatim intent; keep them as `-` bullets in the same block):

```
- A layout is the persistent app shell (sidebar, header bar, page frame) shared UNCHANGED across every screen that uses it. Put ONLY invariant chrome in the layout; anything that differs between pages (the page title, the current breadcrumb segment, page-specific actions or banners) belongs in the SCREEN content, not the layout.
- The layout is static and reused verbatim, so it must NOT hardcode any per-screen state: do NOT mark a specific nav item active/current, and do NOT bake a specific page name into a breadcrumb or header. Meld sets these at runtime — style the active nav item via the [data-meld-active] attribute selector, and put an empty <span data-meld-crumb></span> where the current page name should appear.
- Every navigating control in the layout's nav MUST carry a targetScreenKey (a stable lowercase slug matching its destination, e.g. "vehicle_pool") — NEVER null for a nav link. Use a forward reference when that screen does not exist yet; it heals when a screen is later generated with that key. Reuse the SAME key for that screen when you build it.
- Set each screen's "layout": null only for screens with no app chrome (login, splash, marketing, full-screen modal). Otherwise set exactly one of "reuse" (an EXISTING layout key from the context) or "create" (a genuinely different frame). A created layout's "shellMarkup" MUST contain exactly one empty element carrying data-meld-slot where Meld injects the screen content; the layout's "actions" own the shared nav — do NOT repeat nav inside a screen's content.
```
Bump `DESIGN_SCREEN_GENERATE_PROMPT_VERSION = "design-screen-generate-v3"`.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/connector test` green (existing prompt/schema tests unchanged except the version assertion).

- [ ] **Step 5: Commit** — `git add apps/connector/src/tasks/design-screen-generate-prompt.ts apps/connector/src/tasks/design-screen-generate-prompt.test.ts && git commit -m "feat(connector): layout prompt rules for invariant frame and always-targeted nav (v3)"`

---

### Task 3: Layout nav targets join the dangling-target set

**Files:**
- Modify: `packages/prototype/src/screen-generation-context.ts` (`computeDanglingTargets`)
- Modify: `apps/web/src/features/design/components/screen-composer.tsx` (pass layout nav actions)
- Test: `packages/prototype/src/screen-generation-context.test.ts`, composer test

**Interfaces:**
- Produces: `computeDanglingTargets(screens, layouts?)` also treats layout nav `targetScreenKey`s as referenced, so an unbuilt layout nav destination is surfaced as a dangling target for the model to fulfill.

- [ ] **Step 1: Write failing test** in `screen-generation-context.test.ts`:

```ts
it("treats a layout nav target with no owning screen as dangling", () => {
  const out = computeDanglingTargets(
    [{ screenKey: "home", actions: [] }],
    [{ actions: [{ targetScreenKey: "vehicle_pool" }, { targetScreenKey: "home" }] }],
  );
  expect(out).toContain("vehicle_pool");   // unbuilt layout destination surfaced
  expect(out).not.toContain("home");        // owned by a screen → not dangling
});
it("still works with no layouts arg (back-compat)", () => {
  expect(computeDanglingTargets([{ screenKey: "a", actions: [{ targetScreenKey: "b" }] }])).toEqual(["b"]);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/prototype test screen-generation-context` → FAIL (arity/type).

- [ ] **Step 3: Implement.** In `screen-generation-context.ts`, add an optional second param and a type:

```ts
export type LayoutForDanglingCheck = {
  actions?: readonly { targetScreenKey?: string | null }[];
};

export function computeDanglingTargets(
  screens: readonly ScreenForDanglingCheck[],
  layouts: readonly LayoutForDanglingCheck[] = [],
): string[] {
  const owned = new Set(
    screens.map((s) => s.screenKey).filter((k): k is string => Boolean(k)),
  );
  const referenced = new Set([
    ...screens.flatMap((s) => (s.actions ?? []).map((a) => a.targetScreenKey)),
    ...layouts.flatMap((l) => (l.actions ?? []).map((a) => a.targetScreenKey)),
  ].filter((k): k is string => Boolean(k)));
  return [...referenced].filter((k) => !owned.has(k));
}
```

- [ ] **Step 4: Wire the composer.** In `screen-composer.tsx`, where `danglingTargets` is computed via `computeDanglingTargets`, pass the distinct layouts' nav actions as the second arg: gather `layouts` = the distinct `canvasScreen.layout` objects (by `layout.id`) that are non-null, mapping each to `{ actions: layout.actions }` (the resolved `PrototypeLayout.actions` carry `targetScreenKey`). Confirm via the composer test that a room whose layout nav references an unbuilt key now includes that key in the `context.danglingTargets` passed to `generation.start`.

- [ ] **Step 5: Run to verify pass** — `pnpm --filter @meld/prototype test screen-generation-context && pnpm --filter @meld/web test screen-composer` → PASS.

- [ ] **Step 6: Regression** — `pnpm --filter @meld/web test design && pnpm --filter @meld/prototype test` green.

- [ ] **Step 7: Commit** — `git add packages/prototype/src/screen-generation-context.ts packages/prototype/src/screen-generation-context.test.ts apps/web/src/features/design/components/screen-composer.tsx <composer test> && git commit -m "feat(design): surface layout nav targets as dangling targets"`

---

### Task 4: Verification gate (isolated)

**Files:** none.

- [ ] **Step 1:** In an isolated worktree at HEAD (the main tree has unrelated WIP), hardlink node_modules and run: `pnpm --filter @meld/prototype test`, `pnpm --filter @meld/connector test`, `pnpm --filter @meld/web test design && pnpm --filter @meld/web test rooms`. All green.
- [ ] **Step 2:** Typecheck `@meld/prototype`, `@meld/connector`, `@meld/web` — clean.
- [ ] **Step 3:** Confirm no `supabase/` change in this phase (`git diff --stat <phase2.1 base>..HEAD -- supabase/` empty).
- [ ] **Step 4:** Confirm the standalone byte-identical guard passes with the updated harness snapshot.
- [ ] **Step 5:** Remove the worktree; leave the main tree/WIP untouched.

---

## Self-Review

**Spec coverage:** invariant-frame prompt (no baked active/breadcrumb) → Task 2; harness-driven active-state + breadcrumb → Task 1; nav always targeted + forward-reference healing → Task 2 (prompt) + Task 3 (dangling surfacing); standalone unaffected → Task 1 gate on `data-meld-layout` + Step 5; no DB change → Task 4 Step 3.

**Placeholder scan:** harness code, prompt bullets, and `computeDanglingTargets` ship as real code; tests are concrete. The one flexible bit (Task 2 Step 1 third matcher) is explicitly tied to the added text.

**Type consistency:** `computeDanglingTargets(screens, layouts?)` defined in Task 3 and called with the layout arg in the composer (same task). `data-meld-active`/`data-meld-crumb` contract is identical across Task 1 (harness) and Task 2 (prompt). `next` in the harness is the resolved section already bound in `show()`.
