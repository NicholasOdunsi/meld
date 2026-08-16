# Design Room Slice 2b — Sandboxed Viewer & Assembler Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app prototype viewer — a room "Prototype" surface that reads a room's built screens, assembles them with the hardened `@meld/prototype`, and renders the result in a sandboxed iframe — after closing the four security gaps the slice-0 final review flagged as required before any interactive viewer ships.

**Architecture:** First harden the assembler (per-screen route namespacing so cross-screen action-id collisions can't misroute; `script-src-attr 'none'` to kill inline handlers at the CSP layer; a validated-assembly entry point that runs `findScreenSafetyViolations` as a hard gate; a self-navigation escape-matrix case). Then add a server reader that pulls `design_screens` + their current `design_screen_versions` under RLS (direct `.from().select()` — the tables already grant `select` to participants; no new RPC) and assembles them, and a viewer surface rendering the assembled document in `<iframe sandbox="allow-scripts">` (never `allow-same-origin`).

**Tech Stack:** TypeScript 5.9.3, Zod 4.4.3, Next.js App Router, `@astryxdesign/core`, `@supabase/ssr`, vitest, Playwright, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md`
**Slice-0 findings driving the hardening:** `docs/design/reports/2026-08-13-design-room-slice-0-findings.md` (the "design changes surfaced" list).

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TypeScript `5.9.3`, Zod `4.4.3`. Never change versions.
- The viewer iframe is always `sandbox="allow-scripts"` and **never** `allow-same-origin`. Generated markup/styles/script are passed as an in-memory `srcDoc` string — never written to a storage bucket or served from a navigable URL (slice-0 constraint).
- **`apps/web/src` is scanned by `scripts/check-astryx-conventions.mjs`:** no raw `<div>`/`<span>` (only those two are rejected — `<iframe>` is allowed), no hardcoded hex/rgb colors, no bare pixel values in inline styles, no Tailwind. Viewer chrome uses `@astryxdesign/core` primitives (`Layout`, `VStack`, `HStack`, `Heading`, `Text`, `Section`) and colors via `style={{ ... "var(--color-…)" }}`. The iframe fills its container with percentage/`100%` sizing, never px literals. The assembled HTML is a runtime string in `srcDoc`, so it never appears as literal `<div` in `.tsx` source.
- Route table becomes screen-scoped: `{ [screenId]: { [actionId]: targetScreenId | null } }`. Action ids are unique only within a screen (`DesignScreenPayloadSchema.superRefine`), so a flat table misroutes when two screens share an id like `go`.
- The safety scan is markup-blind for `on*=` handlers; `script-src-attr 'none'` is the primary defense for inline handlers. The gate additionally rejects forbidden elements and remote URLs in markup (which also closes `<a href="https://…">` self-navigation, since `remote-url` already matches markup).
- No changes to slice-1 migrations or slice-2a connector wiring except the one additive safety-gate call noted in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/prototype/src/prototype-document.ts` | Screen-scoped route table + harness; `PROTOTYPE_CSP` gains `script-src-attr 'none'`; `PrototypeScreen` derives from `DesignScreenPayload`. |
| `packages/prototype/src/prototype-document.test.ts` | Update routing tests; add cross-screen-collision test. |
| `packages/prototype/src/assemble-prototype.ts` | `assembleValidatedPrototype(screens, opts)` — runs `findScreenSafetyViolations` gate, then `buildPrototypeDocument`; throws `PrototypeSafetyError`. |
| `packages/prototype/src/assemble-prototype.test.ts` | Gate accepts clean screens, rejects unsafe with the violations listed. |
| `packages/prototype/src/index.ts` | Export the new module + error. |
| `packages/prototype/src/screen-safety.ts` | `REMOTE_URL` also matches a single-slash `https:/host` (minor hardening). |
| `e2e/prototype-sandbox.spec.ts` | Add a self-navigation case (`<a href>`, inline `onclick`, `location=`) proving containment. |
| `apps/connector/src/tasks/design-screen-generate-prompt.ts` | (Task 4) note the gate now runs at generation. |
| `apps/connector/src/providers/provider-adapter.ts` | (Task 4) run `findScreenSafetyViolations` in the `design_screen_generate` branch → reject unsafe as `malformed_output`. |
| `apps/web/src/features/design/prototype-reader.ts` | `getRoomPrototype(workspaceId, roomId)` — read screens+versions under RLS, assemble. |
| `apps/web/src/features/design/prototype-reader.test.ts` | Reader assembles current versions; skips empty screens. |
| `apps/web/src/features/design/components/prototype-viewer.tsx` | The sandboxed-iframe viewer component (astryx chrome). |
| `apps/web/src/features/rooms/surfaces.ts` | Add `"prototype"` surface + `hasBuiltDesignScreen` to `RoomSurfaceState`. |
| `apps/web/src/features/rooms/surfaces.test.ts` | Cover the new surface gating. |
| `apps/web/src/features/rooms/components/room-tab-strip.tsx` | Add the Prototype tab. |
| `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Plumb `hasBuiltDesignScreen`; render the viewer for `activeSurface === "prototype"`. |
| `e2e/design-prototype.spec.ts` | Room with a built screen → Prototype tab → iframe renders → click navigates. |

---

### Task 1: Screen-scoped route table + harness

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Produces: `buildPrototypeDocument` emits routes as `{ [screenId]: { [actionId]: target } }`; the harness resolves a clicked action against its enclosing `[data-meld-screen]`. Public signature unchanged.

- [ ] **Step 1: Write the failing cross-screen-collision test**

Add to `packages/prototype/src/prototype-document.test.ts`:

```ts
it("routes per screen so two screens can reuse an action id", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const html = buildPrototypeDocument({
    startScreenId: A,
    tokenCss: "",
    screens: [
      { id: A, name: "A", markup: '<button data-meld-action="go">Go</button>', styles: "", script: null,
        actions: [{ id: "go", label: "Go", targetScreenId: B }] },
      { id: B, name: "B", markup: '<button data-meld-action="go">Go</button>', styles: "", script: null,
        actions: [{ id: "go", label: "Go", targetScreenId: A }] },
    ],
  });
  // The route table is nested by screen id, so "go" on A → B and "go" on B → A.
  expect(html).toContain(`"${A}":{"go":"${B}"}`);
  expect(html).toContain(`"${B}":{"go":"${A}"}`);
});
```

Update the existing "maps actions to target screens by id" test's expectation from the flat `"go":"<DASHBOARD>"` to the nested `"<SIGN_UP>":{"go":"<DASHBOARD>"}` form (keep the `not.toContain('"Continue":')` assertion — labels still never appear).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/prototype test prototype-document`
Expected: FAIL — routes are still flat.

- [ ] **Step 3: Nest the route table and make the harness screen-aware**

In `packages/prototype/src/prototype-document.ts`:
- Replace the flat `routes` build with a per-screen map:
```ts
  const routes: Record<string, Record<string, string | null>> = {};
  for (const screen of input.screens) {
    routes[screen.id] = {};
    for (const action of screen.actions) {
      routes[screen.id][action.id] = action.targetScreenId;
    }
  }
```
- In the `HARNESS` string, resolve the clicked action within its screen: after finding the `data-meld-action` node, walk up to the enclosing `[data-meld-screen]`, read its id, and look up `routes[screenId][action]`:
```js
    var screenEl = node;
    while (screenEl && screenEl !== document.body && !screenEl.hasAttribute("data-meld-screen")) {
      screenEl = screenEl.parentElement;
    }
    var screenId = screenEl && screenEl.getAttribute ? screenEl.getAttribute("data-meld-screen") : null;
    var table = (screenId && routes[screenId]) ? routes[screenId] : {};
    var target = Object.prototype.hasOwnProperty.call(table, action) ? table[action] : null;
```
Keep the null-target "not built" affordance and the `show(target)` behavior unchanged.

- [ ] **Step 4: Run the routing tests**

Run: `pnpm --filter @meld/prototype test prototype-document && pnpm --filter @meld/prototype typecheck`
Expected: PASS (the collision test + the updated map test + the untouched null-target/escape tests).

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/prototype-document.ts packages/prototype/src/prototype-document.test.ts
git commit -m "feat(prototype): screen-scoped route table so action ids don't collide across screens"
```

---

### Task 2: CSP hardening + PrototypeScreen derives from the payload

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Modify: `packages/prototype/src/screen-safety.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`, `packages/prototype/src/screen-safety.test.ts`

**Interfaces:**
- Produces: `PROTOTYPE_CSP` includes `script-src-attr 'none'`; `PrototypeScreen` is `DesignScreenPayload & { id: string; name: string }`; `REMOTE_URL` also catches `https:/host` (single slash).

- [ ] **Step 1: Write the failing tests**

Add to `prototype-document.test.ts`:
```ts
it("blocks inline event handlers at the CSP layer", () => {
  expect(PROTOTYPE_CSP).toContain("script-src-attr 'none'");
});
```
Add to `screen-safety.test.ts`:
```ts
it("rejects a single-slash special-scheme URL", () => {
  const findings = findScreenSafetyViolations(payload({ markup: "<img src='https:/evil.test/a.png'>" }));
  expect(findings.map((f) => f.rule)).toContain("remote-url");
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/prototype test`
Expected: two FAILs.

- [ ] **Step 3: Implement**

- In `prototype-document.ts`, add `"script-src-attr 'none'"` to the `PROTOTYPE_CSP` array (after `script-src 'unsafe-inline'`).
- Change `PrototypeScreen` to derive from the payload so the wire contract and assembler input cannot drift:
```ts
import type { DesignScreenPayload } from "./screen-payload";
export type PrototypeScreen = DesignScreenPayload & { id: string; name: string };
```
(Confirm the assembler only reads `markup/styles/script/actions/id/name` — it does — so this is source-compatible.)
- In `screen-safety.ts`, broaden `REMOTE_URL` so a single slash after a scheme still matches (browsers normalize `https:/host` to an authority). Change the `[/\\]{2}` requirement to also accept a scheme followed by one slash:
```ts
const REMOTE_URL = /(?:\b[a-z][a-z0-9+.-]*:\/?|(?=\/\/)|(?=\\))[/\\]{1,2}[^\s"')]*[^\s"')/\\][^\s"')]*/gi;
```
If that regex proves finicky against the existing passing cases, instead keep `[/\\]{2}` for scheme-less URLs and add a second alternative `\b[a-z][a-z0-9+.-]*:[/\\][^/\\]` for `scheme:/host`. The test in Step 1 plus the existing `screen-safety` suite are the contract — make both green without weakening any existing assertion.

- [ ] **Step 4: Run the whole prototype suite**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck && pnpm --filter @meld/prototype lint`
Expected: PASS (all prior tests still green).

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/prototype-document.ts packages/prototype/src/prototype-document.test.ts \
        packages/prototype/src/screen-safety.ts packages/prototype/src/screen-safety.test.ts
git commit -m "harden(prototype): script-src-attr none, payload-derived screen, single-slash remote urls"
```

---

### Task 3: Validated assembly gate

**Files:**
- Create: `packages/prototype/src/assemble-prototype.ts`
- Modify: `packages/prototype/src/index.ts`
- Test: `packages/prototype/src/assemble-prototype.test.ts`

**Interfaces:**
- Produces: `class PrototypeSafetyError extends Error { readonly violations: { screenId: string; findings: ScreenSafetyFinding[] }[] }` and `assembleValidatedPrototype(input: PrototypeDocumentInput): string` — runs `findScreenSafetyViolations` on every screen; throws `PrototypeSafetyError` if any screen has findings; otherwise returns `buildPrototypeDocument(input)`.

- [ ] **Step 1: Write the failing test**

Create `packages/prototype/src/assemble-prototype.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleValidatedPrototype, PrototypeSafetyError } from "./assemble-prototype";

const clean = {
  startScreenId: "11111111-1111-4111-8111-111111111111",
  tokenCss: "",
  screens: [
    { id: "11111111-1111-4111-8111-111111111111", name: "A",
      markup: '<button data-meld-action="go">Go</button>', styles: "", script: null,
      actions: [{ id: "go", label: "Go", targetScreenId: null }] },
  ],
};

describe("assembleValidatedPrototype", () => {
  it("returns the assembled document for clean screens", () => {
    expect(assembleValidatedPrototype(clean)).toContain("data-meld-screen");
  });

  it("throws PrototypeSafetyError naming the offending screen and rule", () => {
    const bad = {
      ...clean,
      screens: [{ ...clean.screens[0], markup: "<iframe></iframe>" }],
    };
    try {
      assembleValidatedPrototype(bad);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PrototypeSafetyError);
      const e = error as PrototypeSafetyError;
      expect(e.violations[0].screenId).toBe(clean.screens[0].id);
      expect(e.violations[0].findings.map((f) => f.rule)).toContain("forbidden-element");
    }
  });

  it("rejects a screen whose markup navigates to a remote origin", () => {
    const bad = { ...clean, screens: [{ ...clean.screens[0], markup: '<a href="https://evil.test">go</a>' }] };
    expect(() => assembleValidatedPrototype(bad)).toThrow(PrototypeSafetyError);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/prototype test assemble-prototype`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/prototype/src/assemble-prototype.ts`:

```ts
import { buildPrototypeDocument, type PrototypeDocumentInput } from "./prototype-document";
import { findScreenSafetyViolations, type ScreenSafetyFinding } from "./screen-safety";

export class PrototypeSafetyError extends Error {
  override readonly name = "PrototypeSafetyError";
  readonly violations: { screenId: string; findings: ScreenSafetyFinding[] }[];
  constructor(violations: { screenId: string; findings: ScreenSafetyFinding[] }[]) {
    super(`prototype has ${violations.length} unsafe screen(s)`);
    this.violations = violations;
  }
}

// The hard gate the slice-0 review required before any interactive viewer: no
// screen with a safety violation is ever assembled into a rendered document.
export function assembleValidatedPrototype(input: PrototypeDocumentInput): string {
  const violations: { screenId: string; findings: ScreenSafetyFinding[] }[] = [];
  for (const screen of input.screens) {
    const findings = findScreenSafetyViolations({
      markup: screen.markup,
      styles: screen.styles,
      script: screen.script,
      actions: screen.actions,
    });
    if (findings.length > 0) violations.push({ screenId: screen.id, findings });
  }
  if (violations.length > 0) throw new PrototypeSafetyError(violations);
  return buildPrototypeDocument(input);
}
```

Append to `packages/prototype/src/index.ts`:
```ts
export * from "./assemble-prototype";
```

- [ ] **Step 4: Run**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck && pnpm --filter @meld/prototype lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/assemble-prototype.ts packages/prototype/src/assemble-prototype.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): validated assembly gate rejecting unsafe screens"
```

---

### Task 4: Run the safety gate at generation time

**Files:**
- Modify: `apps/connector/src/providers/provider-adapter.ts`
- Test: `apps/connector/src/providers/provider-adapter.test.ts`

**Interfaces:**
- Produces: the `design_screen_generate` branch of `validateTaskResult` rejects a payload that passes `DesignScreenPayloadSchema` but fails `findScreenSafetyViolations` — so unsafe screens never persist.

- [ ] **Step 1: Write the failing test**

Add to `apps/connector/src/providers/provider-adapter.test.ts` a case: a screen payload that is schema-valid but contains `<iframe>` in markup returns `{ ok: false, code: "malformed_output" }` from `validateTaskResult(value, manifest, "design_screen_generate")`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/connector test provider-adapter`
Expected: FAIL — currently only the schema is checked, so the unsafe screen passes.

- [ ] **Step 3: Implement**

In `apps/connector/src/providers/provider-adapter.ts`, import `findScreenSafetyViolations` from `@meld/prototype` and extend the `design_screen_generate` branch:
```ts
  if (kind === "design_screen_generate") {
    const parsed = DesignScreenPayloadSchema.safeParse(value);
    if (!parsed.success) return { ok: false, code: "malformed_output" };
    const findings = findScreenSafetyViolations(parsed.data);
    if (findings.length > 0) return { ok: false, code: "malformed_output" };
    return { ok: true, result: parsed.data };
  }
```

- [ ] **Step 4: Run**

Run: `pnpm --filter @meld/connector test && pnpm --filter @meld/connector typecheck && pnpm --filter @meld/connector lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/connector/src/providers/provider-adapter.ts apps/connector/src/providers/provider-adapter.test.ts
git commit -m "harden(connector): reject unsafe screen payloads at generation"
```

---

### Task 5: Self-navigation escape-matrix case

**Files:**
- Modify: `e2e/prototype-sandbox.spec.ts`

**Interfaces:** proves the hardened document contains no self-navigation escape.

- [ ] **Step 1: Add the test**

Add a Playwright test that assembles (via `buildPrototypeDocument`) a screen whose markup contains an inline handler and a script that attempts self-navigation, mounts it in `sandbox="allow-scripts"`, and asserts: the capture server receives zero requests, and after clicking an `<a href>` / firing the inline handler, the frame's location did not change to the capture origin. Because CSP now has `script-src-attr 'none'`, the inline handler must not run; assert via a sentinel the handler would have set that it did not.

```ts
test("inline handlers are blocked and self-navigation does not leak", async ({ page }) => {
  const doc = buildPrototypeDocument({
    startScreenId: SCREEN_ID, tokenCss: "",
    screens: [{ id: SCREEN_ID, name: "S",
      markup: `<button id="h" onclick="window.__ran=1;location='${origin}/leak'">x</button>`,
      styles: "", script: `window.__ran = window.__ran || 0;`, actions: [] }],
  });
  await page.setContent(`<!DOCTYPE html><html><body>
    <iframe id="f" sandbox="allow-scripts" width="400" height="300"></iframe>
    <script>document.getElementById("f").srcdoc = ${JSON.stringify(doc)};</script></body></html>`);
  await page.frameLocator("#f").locator("#h").click();
  await page.waitForTimeout(500);
  expect(captured).toEqual([]);
});
```

(Note: reading `__ran` across the opaque-origin boundary throws, so assert containment via the capture server staying empty rather than reading the sentinel from the parent.)

- [ ] **Step 2: Run**

Run: `pnpm test:e2e:sandbox`
Expected: PASS (all existing sandbox tests plus this one). If the inline handler DID fire a request, `script-src-attr` is missing or misspelled — fix Task 2, do not weaken this test.

- [ ] **Step 3: Commit**

```bash
git add e2e/prototype-sandbox.spec.ts
git commit -m "test(prototype): prove inline handlers and self-navigation are contained"
```

---

### Task 6: Server reader — assemble a room's prototype

**Files:**
- Create: `apps/web/src/features/design/prototype-reader.ts`
- Test: `apps/web/src/features/design/prototype-reader.test.ts`

**Interfaces:**
- Produces: `getRoomPrototype(workspaceId: string, roomId: string): Promise<{ html: string; screenCount: number } | null>`. Reads `design_screens` (not deleted, `state = 'built'`, with a `current_version_id`) and their current `design_screen_versions` under RLS via the SSR client, maps them to `PrototypeScreen[]`, and returns `assembleValidatedPrototype(...)` output, or `null` when there are no built screens.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/design/prototype-reader.test.ts`. Follow the existing `user-flow-generation.test.ts` mocking approach (mock `@/lib/supabase/server`'s `createClient` to return a fake with `.from(...).select(...)` / `.rpc(...)`). Assert: given two built screens with current versions, `getRoomPrototype` returns `{ html, screenCount: 2 }` and `html` contains both screens' markup; given zero built screens, it returns `null`; a version failing the safety gate is surfaced as `null` (log-and-null, never throw).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- prototype-reader`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/design/prototype-reader.ts`:

```ts
import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assembleValidatedPrototype, type PrototypeScreen } from "@meld/prototype";

const ScreenRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  current_version_id: z.string().uuid(),
  flow_node_id: z.string().nullable(),
  canvas_x: z.number(),
}).strict();

const VersionRowSchema = z.object({
  id: z.string().uuid(),
  screen_id: z.string().uuid(),
  markup: z.string(),
  styles: z.string(),
  script: z.string().nullable(),
  actions_json: z.array(z.object({
    id: z.string(), label: z.string(), targetScreenId: z.string().uuid().nullable(),
  }).strict()),
}).strict();

export async function getRoomPrototype(
  workspaceId: string, roomId: string,
): Promise<{ html: string; screenCount: number } | null> {
  const ids = z.object({ workspaceId: z.string().uuid(), roomId: z.string().uuid() }).safeParse({ workspaceId, roomId });
  if (!ids.success) return null;
  try {
    const supabase = await createClient(new Headers());
    const screensResult = await supabase
      .from("design_screens")
      .select("id,name,current_version_id,flow_node_id,canvas_x")
      .eq("room_id", roomId)
      .eq("state", "built")
      .is("deleted_at", null)
      .not("current_version_id", "is", null)
      .order("canvas_x", { ascending: true });
    if (screensResult.error) { console.error("prototype screens read failed", screensResult.error); return null; }
    const screens = z.array(ScreenRowSchema).safeParse(screensResult.data);
    if (!screens.success || screens.data.length === 0) return null;

    const versionIds = screens.data.map((s) => s.current_version_id);
    const versionsResult = await supabase
      .from("design_screen_versions")
      .select("id,screen_id,markup,styles,script,actions_json")
      .in("id", versionIds);
    if (versionsResult.error) { console.error("prototype versions read failed", versionsResult.error); return null; }
    const versions = z.array(VersionRowSchema).safeParse(versionsResult.data);
    if (!versions.success) return null;
    const byId = new Map(versions.data.map((v) => [v.id, v]));

    const built: PrototypeScreen[] = [];
    for (const s of screens.data) {
      const v = byId.get(s.current_version_id);
      if (!v) continue;
      built.push({ id: s.id, name: s.name, markup: v.markup, styles: v.styles, script: v.script, actions: v.actions_json });
    }
    if (built.length === 0) return null;

    const html = assembleValidatedPrototype({
      screens: built,
      startScreenId: built[0].id,   // slice 2c refines start selection via the flow start path
      tokenCss: "",                 // slice 2c threads the active profile token CSS
    });
    return { html, screenCount: built.length };
  } catch (thrown) {
    console.error("getRoomPrototype failed", thrown);
    return null;
  }
}
```

(Note: `tokenCss` is empty here — the viewer proves assembly + sandboxing; slice 2c threads the workspace's active `token_css` and the flow-derived start screen. `actions_json` is already stored in the payload's `actions` shape.)

- [ ] **Step 4: Run**

Run: `pnpm --filter web test -- prototype-reader && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/prototype-reader.ts apps/web/src/features/design/prototype-reader.test.ts
git commit -m "feat(web): server reader assembling a room's built prototype under RLS"
```

---

### Task 7: The sandboxed viewer component

**Files:**
- Create: `apps/web/src/features/design/components/prototype-viewer.tsx`
- Test: `apps/web/src/features/design/components/prototype-viewer.test.tsx`

**Interfaces:**
- Produces: `PrototypeViewer({ html, screenCount }: { html: string | null; screenCount: number })` — renders the assembled document in `<iframe sandbox="allow-scripts">` (no `allow-same-origin`), or an empty-state when `html` is null.

- [ ] **Step 1: Write the failing test**

Create `prototype-viewer.test.tsx` (React Testing Library, matching the repo's component test style). Assert: with `html` set, an `<iframe>` renders with a `sandbox` attribute equal to `"allow-scripts"` and `srcDoc` equal to the html; the iframe does NOT contain `allow-same-origin`; with `html` null, an empty-state message renders and no iframe.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- prototype-viewer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/design/components/prototype-viewer.tsx`:

```tsx
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";

export function PrototypeViewer({ html, screenCount }: { html: string | null; screenCount: number }) {
  if (!html) {
    return (
      <VStack gap={2} padding={6} align="center" justify="center" height="100%">
        <Text type="supporting">No screens built yet. Generate a screen to see the prototype.</Text>
      </VStack>
    );
  }
  return (
    <VStack gap={0} width="100%" height="100%" style={{ backgroundColor: "var(--color-background-body)" }}>
      <iframe
        title={`Prototype preview (${screenCount} screen${screenCount === 1 ? "" : "s"})`}
        sandbox="allow-scripts"
        srcDoc={html}
        style={{ width: "100%", height: "100%", border: "0" }}
      />
    </VStack>
  );
}
```

(`<iframe>` is not in the astryx reject list; `width/height: "100%"` and `border: "0"` are not pixel literals so they pass the pixel check. Confirm with `pnpm check:astryx`.)

- [ ] **Step 4: Run + astryx check**

Run: `pnpm --filter web test -- prototype-viewer && pnpm --filter web typecheck && pnpm check:astryx`
Expected: PASS. If `check:astryx` flags the iframe's `border: "0"` or the sizing, switch to a CSS-variable or a className backed by a module the checker accepts, matching how other components avoid literals.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/prototype-viewer.tsx apps/web/src/features/design/components/prototype-viewer.test.tsx
git commit -m "feat(web): sandboxed prototype viewer component"
```

---

### Task 8: Wire the Prototype surface into the room

**Files:**
- Modify: `apps/web/src/features/rooms/surfaces.ts`
- Test: `apps/web/src/features/rooms/surfaces.test.ts`
- Modify: `apps/web/src/features/rooms/components/room-tab-strip.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Modify: the room backend that builds `RoomSurfaceState` (find via `getRoomPageData` — likely `apps/web/src/features/rooms/supabase-backend.ts` and its fake)

**Interfaces:**
- Produces: `"prototype"` is a `RoomSurface`; `RoomSurfaceState` gains `hasBuiltDesignScreen`; the tab and panel render it; the page passes assembled html to `PrototypeViewer`.

- [ ] **Step 1: Add the surface (test-first)**

Add to `surfaces.test.ts` a case: `getRoomSurfaces` includes `"prototype"` when `hasBuiltDesignScreen` is true and omits it otherwise. Then in `surfaces.ts`: add `"prototype"` to the `RoomSurface` union, add `hasBuiltDesignScreen: boolean` to `RoomSurfaceState`, and in `getRoomSurfaces` push `"prototype"` into `artifacts` when `state.hasBuiltDesignScreen`.

Run: `pnpm --filter web test -- surfaces` → PASS.

- [ ] **Step 2: Compute `hasBuiltDesignScreen` in the backend**

In the backend that assembles `RoomSurfaceState` (mirror how `hasUserFlow` is computed at `supabase-backend.ts:301-330`): add a read `supabase.from("design_screens").select("id").eq("room_id", roomId).eq("state", "built").is("deleted_at", null).limit(1).maybeSingle()` and set `hasBuiltDesignScreen: Boolean(result.data)`. Update the fake backend the tests use to accept/emit the same field. Run the backend tests: `pnpm --filter web test -- supabase-backend` (and the fake) → PASS.

- [ ] **Step 3: Add the tab**

In `room-tab-strip.tsx`, add after the decisions tab, guarded by `surfaces.includes("prototype")`:
```tsx
{surfaces.includes("prototype") ? (
  <Tab value="prototype" label="Prototype" href={`${basePath}?tab=prototype`} icon={/* an existing pixel icon */} selectedIcon={/* … */} />
) : null}
```
Match the icon-prop shape the sibling tabs use.

- [ ] **Step 4: Render the panel**

In `page.tsx`: when the room has a built screen, call `getRoomPrototype(workspaceId, roomId)` (guard so it only runs for the prototype surface to avoid an extra query on every load), and add a branch to the surface ternary:
```tsx
: activeSurface === "prototype" ? (
  <PrototypeViewer html={prototype?.html ?? null} screenCount={prototype?.screenCount ?? 0} />
)
```
Import `PrototypeViewer` and `getRoomPrototype`. Follow the existing pattern where `UserFlowTrialTab` data is loaded conditionally.

- [ ] **Step 5: Run the web suite + checks**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm check:astryx && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/rooms/surfaces.ts apps/web/src/features/rooms/surfaces.test.ts \
        apps/web/src/features/rooms/components/room-tab-strip.tsx \
        apps/web/src/app/\(app\)/\[workspaceId\]/rooms/\[roomId\]/page.tsx \
        apps/web/src/features/rooms/supabase-backend.ts apps/web/src/features/rooms/fake-backend.ts
git commit -m "feat(web): room Prototype surface rendering the sandboxed viewer"
```

---

### Task 9: End-to-end — built screen renders and navigates

**Files:**
- Create: `e2e/design-prototype.spec.ts`

**Interfaces:** proves the whole path in a real browser against the app.

- [ ] **Step 1: Write the spec**

Follow `e2e/user-flow-trial.spec.ts` for harness/seed conventions. Seed (via the test's DB helper or the fake backend) a room with two built `design_screens` + current `design_screen_versions` whose markup wires `screen A`'s button to `screen B`. Load the room with `?tab=prototype`. Assert: the Prototype tab is present; the `<iframe>` renders; clicking the in-prototype button inside the frame navigates from A to B (`frameLocator("iframe").getByText(...)`).

- [ ] **Step 2: Run**

Run: `pnpm exec playwright test e2e/design-prototype.spec.ts` (or the project's e2e runner). Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/design-prototype.spec.ts
git commit -m "test(e2e): room prototype viewer renders and navigates"
```

---

## Definition of done

- `pnpm --filter @meld/prototype test` (routing now screen-scoped; validated-assembly gate; single-slash remote URL) + typecheck + lint pass.
- `pnpm test:e2e:sandbox` passes including the self-navigation/inline-handler containment case; `PROTOTYPE_CSP` contains `script-src-attr 'none'`.
- `pnpm --filter @meld/connector test` passes with the generation-time safety gate rejecting unsafe screens.
- `pnpm --filter web test`, `typecheck`, `lint`, and `check:astryx` pass; the room exposes a Prototype surface that assembles built screens under RLS and renders them in `sandbox="allow-scripts"` (no `allow-same-origin`).
- `e2e/design-prototype.spec.ts` proves in-app render + click-through.

The four slice-0-flagged security gaps are now closed: per-screen route namespacing (Task 1), `script-src-attr 'none'` + inline-handler containment (Tasks 2, 5), the safety scan wired as a hard gate at both assembly and generation (Tasks 3, 4), and the self-navigation escape case (Task 5).

Slice 2c (the Canvas composer that fires `design_profile_distill` / `design_screen_generate`, seeds screens from the Define flow, threads the active profile `token_css` and the flow-derived start screen into the viewer, and shows per-screen generation state) builds on this viewer.
```
