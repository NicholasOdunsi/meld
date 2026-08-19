# Component Skills + Design System Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The distiller emits real HTML/CSS for a core set of components per uploaded design system, assembled into one shared component stylesheet injected into every generated screen; the screen generator composes screens from `ds-*` component classes instead of re-deriving CSS; and a workspace-level Design System page renders the distilled tokens and components as live pixels.

**Architecture:** Component HTML lives in `profile_json.components[].html` (flows to the connector for the screen-gen prompt); a compiled `component_css` shared stylesheet is stored on the profile version (flows to the web render, injected beside `tokenCss`). Model-authored component HTML/CSS passes the existing screen safety sanitizer. Data path: distiller response schema → `DesignProfileSchema` → `compileComponentCss` → adapter safety scan → `ai_tasks.result_json.payload` → `materialize_design_profile_distill` trigger → `design_system_profile_versions.component_css` → render injection + hydrate read.

**Tech Stack:** TypeScript, Next.js 16 / React 19, zod 4, Postgres/plpgsql (Supabase), Vitest, Playwright, pnpm/turbo monorepo. Node 22.23.2 (`.nvmrc`).

## Global Constraints

- Node 22.23.2 — a bare shell defaults to Homebrew Node 18 and breaks pnpm/vitest. Run `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22.23.2` first in every shell.
- Feature is dev-only behind the existing design/canvas trial; no production exposure.
- Component `html`/`css` are **optional** on the profile schema — existing prose-only profiles must still parse, and non-core components stay `{name, rules}`.
- `token_css` is compiled by Meld, never the model (`token-css.ts`); `component_css` is likewise **assembled by Meld** from model-authored per-component `css`, after sanitization.
- Model-authored component HTML/CSS must pass `findScreenSafetyViolations` (`packages/prototype/src/screen-safety.ts`): no `<script>`/JS/inline handlers, no forbidden elements, no remote URLs (only `data:` URIs), no `@import`. The connector `design_screen_generate` branch (`provider-adapter.ts:496-508`) is the pattern to mirror.
- Component classes are `ds-`-namespaced; component CSS uses `--ds-*` token variables.
- Byte caps: mirror existing profile caps (`design-profile.ts`: `MAX_PROFILE_BYTES=65536`, `MAX_PROFILE_COMPONENTS=80`, `MAX_COMPONENT_RULE_BYTES=2048`). Add `MAX_COMPONENT_HTML_BYTES`, `MAX_COMPONENT_CSS_BYTES`, `MAX_COMPONENT_CSS_TOTAL_BYTES`. The `design_system_profile_versions` size checks are `octet_length(...) <= 65536`.
- v1 core set (the only components that get `html`/`css`): `app-shell`, `button`, `input`, `form-field`, `card`, `table`, `status-badge`, `page-header`.
- Tests colocated (enforced by `scripts/check-test-colocation.mjs`); commit after each task; every commit message ends with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- SQL verified with the pinned CLI (`~/.local/share/supabase/supabase test db`, v2.109.1) per repo memory; the brew CLI fails `db reset`.

---

## Phase A — data model + compiler + storage

## Task 1: Add `html`/`css` to component schema + `componentCss` to the distill result

**Files:**
- Modify: `packages/contracts/src/design-profile.ts`
- Test: `packages/contracts/src/design-profile.test.ts`

**Interfaces:**
- Produces: `DesignProfileSchema.components[]` accepts optional `html?: string`, `css?: string` (trimmed, byte-capped). `DesignProfileDistillResultSchema` gains `componentCss: z.string().max(MAX_PROFILE_BYTES)`. New consts `MAX_COMPONENT_HTML_BYTES = 8192`, `MAX_COMPONENT_CSS_BYTES = 8192`.

- [ ] **Step 1: Write the failing test** — append to `design-profile.test.ts`:

```ts
it("accepts optional component html/css and trims them", () => {
  const p = {
    colors: [], typeScale: [], spacing: [], radii: [],
    components: [{ name: "button", rules: "bold", html: "  <button class=\"ds-button\"></button> ", css: ".ds-button{font-weight:600}" }],
  };
  const parsed = DesignProfileSchema.parse(p);
  expect(parsed.components[0].html).toBe('<button class="ds-button"></button>');
  expect(parsed.components[0].css).toContain(".ds-button");
});
it("still parses prose-only components (html/css absent)", () => {
  const parsed = DesignProfileSchema.parse({ colors: [], typeScale: [], spacing: [], radii: [], components: [{ name: "button", rules: "bold" }] });
  expect(parsed.components[0].html).toBeUndefined();
});
it("distill result carries componentCss", () => {
  const r = DesignProfileDistillResultSchema.parse({
    profile: { colors: [], typeScale: [], spacing: [], radii: [], components: [] },
    tokenCss: ":root{}", componentCss: ".ds-button{font-weight:600}",
  });
  expect(r.componentCss).toContain(".ds-button");
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/contracts exec vitest run src/design-profile.test.ts` → FAIL (unknown keys rejected by `.strict()`).

- [ ] **Step 3: Implement** — in `design-profile.ts`: add consts near line 9:
```ts
export const MAX_COMPONENT_HTML_BYTES = 8192;
export const MAX_COMPONENT_CSS_BYTES = 8192;
```
In the `components` item object (line 71-83), add after `rules`:
```ts
            html: z
              .string()
              .trim()
              .min(1)
              .refine((v) => byteLength(v) <= MAX_COMPONENT_HTML_BYTES, {
                message: `component html exceeds ${MAX_COMPONENT_HTML_BYTES} bytes`,
              })
              .optional(),
            css: z
              .string()
              .trim()
              .min(1)
              .refine((v) => byteLength(v) <= MAX_COMPONENT_CSS_BYTES, {
                message: `component css exceeds ${MAX_COMPONENT_CSS_BYTES} bytes`,
              })
              .optional(),
```
In `DesignProfileDistillResultSchema` (line 97-102) add `componentCss: z.string().max(MAX_PROFILE_BYTES)`.

- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Typecheck + commit** — `pnpm --filter @meld/contracts exec tsc --noEmit`; commit `feat(contracts): optional component html/css + componentCss on distill result`.

---

## Task 2: `compileComponentCss` — assemble the shared component stylesheet

**Files:**
- Modify: `packages/prototype/src/token-css.ts` (add sibling export) OR create `packages/prototype/src/component-css.ts` (create — keeps concerns separate)
- Test: `packages/prototype/src/component-css.test.ts`
- Modify: `packages/prototype/src/index.ts` (export the new function)

**Interfaces:**
- Consumes: `DesignProfile` (Task 1).
- Produces: `compileComponentCss(profile: DesignProfile): string` — concatenates every component's `css` (skipping components without `css`), separated by `\n`, with each component's block prefixed by a `/* ds:<name> */` marker comment. Returns `""` when no component has css. Enforces `MAX_COMPONENT_CSS_TOTAL_BYTES = 49152` (truncate-and-stop at the component boundary that would exceed it; never split a block).

- [ ] **Step 1: Write failing test** — `component-css.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compileComponentCss } from "./component-css";
const base = { colors: [], typeScale: [], spacing: [], radii: [] };
describe("compileComponentCss", () => {
  it("concatenates component css with name markers", () => {
    const css = compileComponentCss({ ...base, components: [
      { name: "button", rules: "x", css: ".ds-button{font-weight:600}" },
      { name: "card", rules: "x", css: ".ds-card{border:1px}" },
    ]} as never);
    expect(css).toContain("/* ds:button */");
    expect(css).toContain(".ds-button{font-weight:600}");
    expect(css).toContain(".ds-card{border:1px}");
  });
  it("returns empty when no component has css", () => {
    expect(compileComponentCss({ ...base, components: [{ name: "button", rules: "x" }] } as never)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/prototype exec vitest run src/component-css.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** — create `component-css.ts`:
```ts
import type { DesignProfile } from "@meld/contracts";

export const MAX_COMPONENT_CSS_TOTAL_BYTES = 49152;
const encoder = new TextEncoder();

// Meld assembles the shared component stylesheet from the (already sanitized)
// per-component css. Model authors each component's css; Meld only concatenates.
export function compileComponentCss(profile: DesignProfile): string {
  const blocks: string[] = [];
  let used = 0;
  for (const component of profile.components) {
    if (!component.css) continue;
    const block = `/* ds:${component.name} */\n${component.css}`;
    const size = encoder.encode(block).length + 1;
    if (used + size > MAX_COMPONENT_CSS_TOTAL_BYTES) break;
    blocks.push(block);
    used += size;
  }
  return blocks.join("\n");
}
```
Add `export * from "./component-css";` (or explicit export) to `packages/prototype/src/index.ts` next to the token-css export.

- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `feat(prototype): compileComponentCss assembles the shared component stylesheet`.

---

## Task 3: SQL — `component_css` column, trigger INSERT, hydrate read

**Files:**
- Create: `supabase/migrations/20260819000001_design_profile_component_css.sql`
- Test: `supabase/tests/design_profile_component_css.test.sql`

**Interfaces:**
- Produces: `design_system_profile_versions.component_css text` (nullable, `octet_length <= 65536`). `materialize_design_profile_distill` writes it from `payload->>'componentCss'`. `hydrate_authorized_room_context` exposes `'componentCss'`.

- [ ] **Step 1: Write the failing SQL test** — `design_profile_component_css.test.sql`, modeled on `supabase/tests/design_profiles.test.sql` and `design_task_rpcs.test.sql` (read both for the harness). In a transaction: seed workspace + a completed `design_profile_distill` `ai_tasks` row whose `result_json` payload is `{"profile":{...minimal...},"tokenCss":":root{}","componentCss":".ds-button{font-weight:600}"}` linked via `design_profile_distills`; fire the materialize path (status→completed); assert the new `design_system_profile_versions` row has `component_css = '.ds-button{font-weight:600}'`. Second case: a payload WITHOUT `componentCss` inserts `component_css = null` (back-compat) and does not error.

- [ ] **Step 2: Run to verify fail** — `~/.local/share/supabase/supabase test db` → FAIL (`component_css` column does not exist).
- [ ] **Step 3: Write the migration** — `20260819000001_design_profile_component_css.sql`:
```sql
alter table public.design_system_profile_versions
  add column component_css text,
  add constraint design_system_profile_versions_component_css_size
    check (component_css is null or octet_length(component_css) <= 65536);
```
Then `create or replace function public.materialize_design_profile_distill()` — copy the live body from `supabase/migrations/202608130010_design_task_rpcs.sql:560-642` verbatim and make two edits: (a) the payload guard (lines ~591-598) tolerates an absent `componentCss` (do NOT require it); (b) the INSERT (lines ~600-613) adds `component_css` to the column list with value `payload ->> 'componentCss'` (null when absent). Then `create or replace function public.hydrate_authorized_room_context(...)` — copy its live body and add `'componentCss', version.component_css` beside the existing `'tokenCss', version.token_css` (line ~776). Keep both function signatures unchanged.

- [ ] **Step 4: Run to verify pass** — `~/.local/share/supabase/supabase test db` → PASS.
- [ ] **Step 5: Arity/parity + commit** — `pnpm check:sql-arities && pnpm check:sql-rooms`; commit `feat(design): store + hydrate component_css on the profile version`.

---

## Phase B — distiller emits component skills

## Task 4: Distiller response schema + prompt emit core-set html/css

**Files:**
- Modify: `apps/connector/src/tasks/design-profile-distill-prompt.ts`
- Test: `apps/connector/src/tasks/design-profile-distill-prompt.test.ts`

**Interfaces:**
- Produces: `DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA` per-component `properties` gains optional `html`, `css` (string, maxLength 8192). Prompt instructs the model to emit html/css **only** for the core set, using `ds-` classes + `--ds-*` tokens, static HTML/CSS, no JS.

- [ ] **Step 1: Write failing test** — append:
```ts
it("allows optional html/css on distilled components", () => {
  const item = (DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA.properties as {
    components: { items: { properties: Record<string, unknown> } };
  }).components.items.properties;
  expect(item).toHaveProperty("html");
  expect(item).toHaveProperty("css");
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/connector exec vitest run src/tasks/design-profile-distill-prompt.test.ts` → FAIL.
- [ ] **Step 3: Implement** — in the components `items.properties` (schema line ~97-113) add `html: { type: "string", maxLength: 8192 }` and `css: { type: "string", maxLength: 8192 }` (NOT in `required` — optional). Extend `DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT` (line 14-26) with a rule block:
```
- For these core components ONLY -- app-shell, button, input, form-field, card, table, status-badge, page-header -- also emit `html` (a usage template using ds-namespaced classes, e.g. <button class="ds-button">) and `css` (that component's styles using the --ds-* token variables). Static HTML/CSS only: no JavaScript, no <script>, no inline event handlers, no remote URLs (images/fonts as data: URIs), no @import. Match the source system's look. Do not emit html/css for any other component -- give those `rules` prose only.
- Every component class name is ds-namespaced (starts with `ds-`). Component css must reference the --ds-* token variables you extracted, not invent new brand colors.
```
Bump the byte-budget test slack if a golden byte-budget assertion exists (as prior prompt changes did).

- [ ] **Step 4: Run to verify pass** — same command → PASS (update any golden schema-key/required snapshot in the file to include the new optional props).
- [ ] **Step 5: Commit** — `feat(connector): distiller emits html/css for core components`.

---

## Task 5: Executor compiles `componentCss`; adapter safety-scans component html/css

**Files:**
- Modify: `apps/connector/src/tasks/task-executor.ts` (design_profile_distill `parseResult`, ~line 252-256)
- Modify: `apps/connector/src/providers/provider-adapter.ts` (distill branch, ~line 486-494)
- Test: `apps/connector/src/tasks/task-executor.test.ts` (or the distill-focused test file), `apps/connector/src/providers/provider-adapter.test.ts`

**Interfaces:**
- Consumes: `compileComponentCss` (Task 2), `findScreenSafetyViolations` (`@meld/prototype`).
- Produces: `parseResult` returns `{ profile, tokenCss, componentCss }`. Adapter rejects a distill result whose any component html/css violates screen-safety.

- [ ] **Step 1: Write failing tests** —
  (a) executor: distilling a profile with `components:[{name:"button",rules:"x",css:".ds-button{}",html:"<button class=\"ds-button\"></button>"}]` yields a result whose `componentCss` contains `.ds-button`.
  (b) adapter: a distill `value` whose component `html` contains `<script>` (or an `onclick`) returns `{ ok: false, code: "malformed_output" }`; a clean one returns `{ ok: true }`.
  Write with the existing test setup in each file (read them for the harness/mocks).

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/connector exec vitest run src/tasks/task-executor.test.ts src/providers/provider-adapter.test.ts` → FAIL.
- [ ] **Step 3: Implement** —
  In `task-executor.ts` `design_profile_distill.parseResult` (line 252-256):
```ts
    parseResult: (result: unknown): DesignProfileDistillResult => {
      const profile = DesignProfileSchema.parse(result);
      return { profile, tokenCss: compileTokenCss(profile), componentCss: compileComponentCss(profile) };
    },
```
  Import `compileComponentCss` from `@meld/prototype` (beside `compileTokenCss`, line 22).
  In `provider-adapter.ts` distill branch (line 486-494), after the successful `DesignProfileSchema.safeParse`, scan each component that has html/css by shaping it as a `DesignScreenPayload` and reusing `findScreenSafetyViolations`:
```ts
    if (kind === "design_profile_distill") {
      const parsed = DesignProfileSchema.safeParse(value);
      if (!parsed.success) return { ok: false, code: "malformed_output" };
      const unsafe = parsed.data.components.some((c) =>
        (c.html || c.css) &&
        findScreenSafetyViolations({
          markup: c.html ?? "", styles: c.css ?? "", script: null, actions: [],
        } as never).length > 0,
      );
      return unsafe ? { ok: false, code: "malformed_output" } : { ok: true, result: parsed.data };
    }
```
  Import `findScreenSafetyViolations` (already imported for the screen branch at ~line 501).

- [ ] **Step 4: Run to verify pass** — same command → PASS. Typecheck: `pnpm --filter @meld/connector exec tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat(connector): compile componentCss + safety-scan component html/css`.

---

## Phase C — render injection

## Task 6: Inject `componentCss` into the rendered prototype document

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts` (`PrototypeDocumentInput`, `buildPrototypeDocument` line ~237)
- Modify: `packages/prototype/src/assemble-prototype.ts` (`assembleValidatedPrototype` input passthrough)
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Produces: `PrototypeDocumentInput` gains `componentCss?: string`; the built document contains a `<style>` with the component css **after** the token-css `<style>` and **before** per-screen styles. `assembleValidatedPrototype` passes `componentCss` through.

- [ ] **Step 1: Write failing test** — assert `buildPrototypeDocument({screens:[…], startScreenId, tokenCss:":root{}", componentCss:".ds-button{font-weight:600}"})` output contains `.ds-button{font-weight:600}` and that its index is after the tokenCss and before the first screen's scoped styles. (Read the test file for how it builds a minimal screens fixture.)

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/prototype exec vitest run src/prototype-document.test.ts` → FAIL.
- [ ] **Step 3: Implement** — add `componentCss?: string` to `PrototypeDocumentInput` (line 15-19). In `buildPrototypeDocument`, right after the tokenCss style line (line 237), insert:
```ts
        input.componentCss ? `<style>${neutralizeStyleClose(input.componentCss)}</style>` : "",
```
(filter falsy entries out of the head array if it isn't already). In `assemble-prototype.ts` `assembleValidatedPrototype` (line 29-60), thread `componentCss: input.componentCss` into the `buildPrototypeDocument` call (line 59) and the `PrototypeDocumentInput` it accepts.

- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Commit** — `feat(prototype): inject componentCss stylesheet after tokens in the render`.

---

## Task 7: Thread `componentCss` from the DB through the readers + previews

**Files:**
- Modify: `apps/web/src/features/design/prototype-reader.ts` (`assembleRoomPrototype`, `getRoomPrototype`)
- Modify: `apps/web/src/features/design/design-profile-reader.ts` (`getActiveDesignProfile` return)
- Modify: `apps/web/src/features/canvas/screen-preview-doc.ts` (`buildFramePreviewDoc` gains componentCss)
- Modify callers passing `tokenCss`: `apps/web/src/features/canvas/screen-frame-overlay.tsx`, `apps/web/src/features/design/components/agents-transcript.tsx`
- Test: colocated tests for `prototype-reader`, `design-profile-reader`, `screen-preview-doc`

**Interfaces:**
- Consumes: `component_css` column (Task 3), `assembleValidatedPrototype` componentCss (Task 6).
- Produces: `assembleRoomPrototype(screens, tokenCss, componentCss, startScreenId?)`; `getActiveDesignProfile → { hasActiveProfile, tokenCss, componentCss }`; `buildFramePreviewDoc(screen, tokenCss, componentCss)`.

- [ ] **Step 1: Write failing tests** — (a) `getActiveDesignProfile` returns `componentCss` from the version row; (b) `buildFramePreviewDoc(screen, ":root{}", ".ds-x{}")` output contains `.ds-x{}`; (c) `assembleRoomPrototype` passes componentCss into the document. Use the existing test fixtures/mocks in each file.

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/web exec vitest run src/features/design/design-profile-reader.test.ts src/features/canvas/screen-preview-doc.test.ts src/features/design/prototype-reader.test.ts` → FAIL.
- [ ] **Step 3: Implement** —
  - `prototype-reader.ts`: `getRoomPrototype` selects `component_css` alongside `token_css` (line 286-296) and passes it into `assembleRoomPrototype`; widen `assembleRoomPrototype` signature to `(screens, tokenCss, componentCss, startScreenId?)` and pass `componentCss` into `assembleValidatedPrototype`.
  - `design-profile-reader.ts`: select `component_css`, return `componentCss` (default `""`) in all return branches (mirror the existing `tokenCss: ""` fallbacks).
  - `screen-preview-doc.ts`: `buildFramePreviewDoc(screen, tokenCss, componentCss = "")` → pass componentCss into `assembleValidatedPrototype`.
  - Update callers: `screen-frame-overlay.tsx` takes `componentCss?: string` prop and passes it to `buildFramePreviewDoc`; its parent (canvas) already reads the profile — thread `componentCss` from `getActiveDesignProfile` down. `agents-transcript.tsx` takes `componentCss` prop (default `""`) and passes it through `DesignTurnBubbles → BuiltReply → ScreenThumbnail → buildFramePreviewDoc`.

- [ ] **Step 4: Run to verify pass** — the vitest set → PASS; `pnpm --filter @meld/web exec tsc --noEmit` clean (fix any caller the new required arg breaks — search usages of `assembleRoomPrototype`/`buildFramePreviewDoc`).
- [ ] **Step 5: Commit** — `feat(canvas): thread componentCss from profile version into screen render`.

---

## Phase D — generator composes from components

## Task 8: Screen-gen prompt shows component templates + compose rule

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts` (`componentRulesSection` ~line 48-76; `BASE_RULES` ~line 12-36)
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Consumes: `context.designProfile.profile.components[]` now carrying optional `html`.
- Produces: for a component with `html`, the prompt section shows its usage template + rules; components without `html` render prose as today. `BASE_RULES` tells the model to compose from `ds-` classes and not re-implement/restyle them.

- [ ] **Step 1: Write failing test** — a component `{name:"button", rules:"bold", html:"<button class=\"ds-button\"></button>"}` produces a section that includes the html template string and the class `ds-button`; a prose-only component still appears as `- name: rules`.

- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/connector exec vitest run src/tasks/design-screen-generate-prompt.test.ts` → FAIL.
- [ ] **Step 3: Implement** — in `componentRulesSection`, when `component.html` is present emit e.g. ``- ${component.name} (use `class="ds-..."`): ${component.rules}\n  usage: ${component.html}`` (keep within the existing `MAX_COMPONENT_PROMPT_BYTES` budget accounting — count the html bytes too); prose-only unchanged. Add to `BASE_RULES`:
```
- When the design system supplies component usage templates (below), COMPOSE screens from them: reuse their ds- classes and markup shape, and do NOT re-implement or restyle any ds- class. Write CSS only for page-specific layout. For anything no component covers, build cleanly with the --ds-* tokens.
```

- [ ] **Step 4: Run to verify pass** — same command → PASS (update golden byte-budget slack if asserted).
- [ ] **Step 5: Commit** — `feat(connector): screen generator composes from component templates`.

---

## Phase E — Design System viewer (workspace page)

## Task 9: Read the active profile for the viewer

**Files:**
- Create: `apps/web/src/features/design/workspace-design-profile.ts`
- Test: `apps/web/src/features/design/workspace-design-profile.test.ts`

**Interfaces:**
- Produces: `getWorkspaceDesignSystem(workspaceId: string): Promise<{ profile: DesignProfile; tokenCss: string; componentCss: string } | null>` — reads `design_system_profiles.active_version_id` → the version's `profile_json`/`token_css`/`component_css` for a workspace directly (no room hop). Returns `null` when no active profile. Mirrors `design-profile-reader.ts` query style + `isRoomFakeEnabled()` fake branch.

- [ ] **Step 1: Write failing test** — with a mocked supabase returning an active version, asserts the parsed `profile`, `tokenCss`, `componentCss`; returns `null` when no profile. (Follow `design-profile-reader.test.ts`.)
- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/web exec vitest run src/features/design/workspace-design-profile.test.ts` → FAIL.
- [ ] **Step 3: Implement** — query by `workspace_id` directly; `DesignProfileSchema.safeParse(profile_json)`; return the three fields. Add a `fakeGetWorkspaceDesignSystem` branch in `e2e-fake.ts` (Task 12 wires the fixture).
- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit** — `feat(design): read a workspace's active design profile for the viewer`.

---

## Task 10: Viewer page — tokens + live components

**Files:**
- Create: `apps/web/src/app/(app)/[workspaceId]/design-system/page.tsx`
- Create: `apps/web/src/features/design/components/design-system-view.tsx` (+ colocated test)
- Modify: `apps/web/src/ui/workspace-navigation.tsx` (add a "Design System" nav link → `/${workspaceId}/design-system`)

**Interfaces:**
- Consumes: `getWorkspaceDesignSystem` (Task 9), `buildFramePreviewDoc` (Task 7), `PrototypeViewer` iframe pattern (`prototype-viewer.tsx`).
- Produces: a read-only page rendering token swatches (colors/type/spacing/radii) and, for each component with `html`, a live sandboxed iframe preview (built by wrapping the component `html`+`css` through `buildFramePreviewDoc`-style assembly with `tokenCss`+`componentCss`), labeled with `name` + its `ds-` class. Empty state when no profile.

- [ ] **Step 1: Write failing test** — `design-system-view.test.tsx` (`@testing-library/react`): given a profile with a color token and one component with `html`, renders the color name and a component preview `iframe`; given no profile, renders the empty-state upload prompt. Mock the sandbox/iframe as sibling tests do.
- [ ] **Step 2: Run to verify fail** — `pnpm --filter @meld/web exec vitest run src/features/design/components/design-system-view.test.tsx` → FAIL.
- [ ] **Step 3: Implement** — `page.tsx` (server component): `const ds = await getWorkspaceDesignSystem(workspaceId)`; render `<DesignSystemView data={ds} />`. `design-system-view.tsx`: token sections (map colors→swatches, type/spacing/radii→rows) and a components grid; per component build a preview doc: wrap `component.html` as a single-screen payload and assemble via the same `assembleValidatedPrototype`/`buildFramePreviewDoc` path with `tokenCss` + `componentCss`, render in `<iframe sandbox="" srcDoc={doc} title={`${name} preview`}/>`. Components without `html` show a "described, not generated" chip. Empty state links to the composer's design-system upload. Add the nav link in `workspace-navigation.tsx`.
- [ ] **Step 4: Run to verify pass** — the vitest test → PASS; `pnpm --filter @meld/web exec tsc --noEmit`; `pnpm check:astryx`.
- [ ] **Step 5: Lint + commit** — `pnpm --filter @meld/web exec eslint src/app/\(app\)/\[workspaceId\]/design-system/page.tsx src/features/design/components/design-system-view.tsx`; commit `feat(design): workspace Design System viewer page`.

---

## Phase F — fakes, e2e, verification

## Task 11: Fake distiller emits component skills

**Files:**
- Modify: `apps/web/src/features/rooms/e2e-fake.ts`
- Test: covered by e2e (Task 12); add/adjust any fake unit test if present.

**Interfaces:**
- Produces: the fake design-profile distillation result and the fake active-profile reads carry a `component` with `html`+`css` and a non-empty `componentCss`, so screen render + the viewer are observable without a model.

- [ ] **Step 1: Implement** — in the fake distillation/profile fixtures, add a core component e.g. `{ name: "button", rules: "bold", html: "<button class=\"ds-button\">Action</button>", css: ".ds-button{font-weight:600;background:var(--ds-color-brand-dark);color:#fff}" }` and set the fake's `componentCss` to that css; ensure `fakeGetWorkspaceDesignSystem` (Task 9) returns it. Keep existing token fixtures intact.
- [ ] **Step 2: Verify** — `pnpm --filter @meld/web exec vitest run` stays green; `tsc --noEmit` clean.
- [ ] **Step 3: Commit** — `test(e2e): fake design system carries component skills`.

---

## Task 12: E2E — component stylesheet in screens + viewer renders

**Files:**
- Create: `e2e/design-system-viewer.spec.ts`
- Modify: an existing canvas-trial spec or add coverage that a generated screen's rendered doc includes the component stylesheet
- Test: the specs are the test.

**Interfaces:** Consumes Tasks 1-11.

- [ ] **Step 1: Viewer spec** — navigate to `/{workspaceId}/design-system`, assert a token swatch is visible and at least one component preview `iframe[title$="preview"]` is attached; assert the injected doc contains `ds-button` (read the iframe's `srcdoc` attribute).
- [ ] **Step 2: Screen-injection assertion** — in a canvas-trial screen-generation spec (fake profile with skills), after a screen materializes, assert the preview document includes the component stylesheet (`.ds-button` present in the built doc / the `ds-button` class usable).
- [ ] **Step 3: Run** — `pnpm exec playwright test --config playwright.canvas-trial.config.ts design-system-viewer.spec.ts` (and the touched canvas-trial spec). If the local DB-auth env gap blocks the run (composer/app never renders, `permission denied for function ...`), capture it and rely on CI — verify `tsc`/`vitest`/spec-compile locally and report DONE_WITH_CONCERNS.
- [ ] **Step 4: Commit** — `test(e2e): design system viewer + component stylesheet in generated screens`.

---

## Task 13: Full-suite verification

- [ ] **Step 1:** `pnpm typecheck && pnpm lint` → clean.
- [ ] **Step 2:** `pnpm --filter @meld/contracts exec vitest run && pnpm --filter @meld/prototype exec vitest run && pnpm --filter @meld/connector exec vitest run && pnpm --filter @meld/web exec vitest run` → all green.
- [ ] **Step 3:** `~/.local/share/supabase/supabase test db && pnpm test:sql` → green.
- [ ] **Step 4:** `pnpm test:astryx && pnpm test:colocation` → green.
- [ ] **Step 5:** Commit any fixups: `chore(design): verification fixups for component skills + viewer`.

---

## Self-review

**Spec coverage:**
- G1 skills — data model (T1), compiler (T2), storage (T3), distiller emit (T4), executor+adapter safety (T5), render injection (T6, T7), generator composes (T8). ✅
- G2 viewer — read (T9), page + nav (T10). ✅
- Safety (reuse `findScreenSafetyViolations`, `ds-` namespace, byte caps) — T5 (adapter scan), T1/T2 caps, Global Constraints. ✅
- Back-compat (optional html/css; null component_css) — T1, T3. ✅
- Success criteria observability (reuse jump, viewer pixels) — T10 viewer, T12 e2e. ✅
- Non-goals respected (no JS/behavior, no React execution, core-set only) — T4 prompt (core-set only), safety scan rejects JS. ✅

**Placeholder scan:** No TBD/TODO. Directives like "read the test file for the harness" point at concrete files with the code to add; SQL/viewer tasks give representative code + exact anchors (the SDD implementer reads the file). Acceptable.

**Type consistency:** `componentCss` name used consistently (contract result, `compileComponentCss`, `PrototypeDocumentInput`, `getActiveDesignProfile`/`getRoomPrototype`/`getWorkspaceDesignSystem` returns, `buildFramePreviewDoc`/`assembleRoomPrototype` args, SQL `component_css` / payload `componentCss`). `html`/`css` optional-string fields consistent across contract (T1), distiller schema (T4), prompt (T8), fake (T11). `findScreenSafetyViolations` payload shape `{markup, styles, script, actions}` matches its real signature. ✅
