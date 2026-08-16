# Semantic-key Prototype Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one composer request generate 1..N design screens that auto-connect by a model-chosen semantic key, viewable individually and via a screen picker in the "Try" preview, replacing the flow-node linking and canvas arrows.

**Architecture:** Each generated screen names itself with a stable `screen_key`; buttons carry a `targetScreenKey`; navigation resolves `key → screen` at render time in the readers (reusing `resolveActionTargets`). Generation returns an array of screens persisted atomically as N `design_screens` + versions + frames. The manual-linking machinery (arrows, `design_screen_action_links`, flow-node resolution, "Build next step") is removed.

**Tech Stack:** TypeScript, Zod, Next.js (App Router, RSC + server actions), Supabase/Postgres (security-definer RPCs + pgTAP), tldraw, Vitest, a local connector that calls the model.

Design spec: `docs/superpowers/specs/2026-08-15-semantic-key-prototype-linking-design.md` — read it for full rationale.

## Global Constraints

- **Follow existing patterns.** SQL mirrors `supabase/migrations/202608130010_design_task_rpcs.sql` (materialization trigger) and `202608140002_user_flow_assist.sql` (security-definer shape, `set search_path = ''`, RLS, grants). Web readers mirror the existing `*-reader.ts`. Server actions mirror `design-screen-generation.ts`.
- **Backward compatibility, always green.** Additive schema changes first; deletions last (Task 9). Persisted actions with only `targetScreenId` (or legacy `targetNodeId`) must keep parsing and resolving. The prototype harness routing contract stays `routes[screenId][actionId] = targetScreenId`.
- **Mirror the two action contracts.** `packages/prototype/src/screen-payload.ts` `DesignScreenActionSchema` and `packages/contracts/src/ai.ts` `HydratedDesignScreenActionSchema` MUST stay in lockstep on target fields (the drift that broke regeneration before).
- **`screen_key` format:** `^[a-z][a-z0-9_-]{0,63}$`. Unique per room among live screens (`deleted_at is null`). Stable across regenerations.
- **No silent truncation.** If a multi-screen request exceeds one response, return the first batch and surface that more remain.
- **Verification per task:** `pnpm --filter @meld/prototype test`, `pnpm --filter @meld/web test`, `pnpm --filter @meld/web typecheck`, connector build, and `pnpm test:db` for SQL — all green. Commit each task with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Do not touch** unrelated already-modified tree files (`conversation.tsx`, `room-conversation-pixel-pattern.svg`, and the pre-existing `page.test.tsx` canvas-screens WIP beyond what a task explicitly needs).

## File Structure

- `packages/prototype/src/screen-payload.ts` — action gains `targetScreenKey`; payload gains `screenKey`; new `DesignScreenBatchSchema`.
- `packages/prototype/src/screen-action-resolve.ts` — resolve by `keyToScreenId`.
- `packages/prototype/src/screen-generation-context.ts` (new) — format existing-screens + dangling-targets context; compute dangling targets.
- `packages/prototype/src/prototype-document.ts` — harness screen picker.
- `packages/contracts/src/ai.ts` — hydrated action mirror (`targetScreenKey`).
- `supabase/migrations/2026081500XX_*.sql` — add `screen_key`; multi-screen materialization; drop `design_screen_action_links`.
- `apps/connector/src/tasks/design-screen-generate-prompt.ts` — batch response schema + prompt.
- `apps/web/src/features/design/design-screen-generation.ts` — context input + batch handling.
- `apps/web/src/features/design/components/screen-composer.tsx` — pass context; remove T1 buttons.
- `apps/web/src/features/design/{prototype-reader,canvas-screen-reader}.ts` — resolve by key; read `screen_key`.
- `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` — `screen` param → start screen.
- `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` — `openPreview` threads id; remove link threading.
- Deleted in Task 9: `use-screen-link-wiring.ts`, `screen-link-arrow.ts`, `design-screen-links.ts`, `action-links-reader.ts`, `outgoing-steps.ts`.

---

### Task 1: Prototype package — keyed action contract + resolution + context

**Files:**
- Modify: `packages/prototype/src/screen-payload.ts`
- Modify: `packages/prototype/src/screen-action-resolve.ts`
- Create: `packages/prototype/src/screen-generation-context.ts`
- Modify: `packages/prototype/src/index.ts` (export the new module)
- Test: the three `*.test.ts` beside them.

**Interfaces:**
- Produces: `DesignScreenActionSchema` action shape `{ id, label, targetScreenKey?: string|null, targetScreenId?: string|null, targetNodeId?: string|null }` (targetNodeId kept temporarily, unused, removed in Task 9). `DesignScreenPayloadSchema` gains `screenKey: string` (slug). `DesignScreenBatchSchema = z.object({ screens: z.array(DesignScreenPayloadSchema).min(1).max(SCREEN_BATCH_MAX) })` with `SCREEN_BATCH_MAX = 12`.
- Produces: `resolveActionTargets(actions, { keyToScreenId })` → `{ id, label, targetScreenId }[]`, precedence `keyToScreenId.get(targetScreenKey) ?? targetScreenId ?? null`.
- Produces: `computeDanglingTargets(screens): string[]` (target keys referenced by any action but not owned by any screen) and `formatScreenGenerationContext({ existingScreens: {key,name}[], danglingTargets: string[] }): string`.

- [ ] **Step 1 — Re-key the action + add `screenKey` + batch schema.** In `screen-payload.ts`, rename the action target field to `targetScreenKey: z.string().trim().min(1).max(64).nullable().optional()` (keep `targetScreenId` and the temporarily-retained `targetNodeId` both `nullable().optional()`), add `screenKey: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,63}$/)` to `DesignScreenPayloadSchema`, and export `SCREEN_BATCH_MAX = 12` and `DesignScreenBatchSchema`.

- [ ] **Step 2 — Failing test for resolution + dangling + format.** Write/extend tests:

```ts
// screen-action-resolve.test.ts
it("resolves targetScreenKey to its screen", () => {
  expect(resolveActionTargets([{ id: "go", label: "Home", targetScreenKey: "home" }],
    { keyToScreenId: new Map([["home", SCREEN_HOME]]) }))
    .toEqual([{ id: "go", label: "Home", targetScreenId: SCREEN_HOME }]);
});
it("falls back to legacy targetScreenId, else null", () => {
  const map = new Map<string,string>();
  expect(resolveActionTargets([{ id: "a", label: "A", targetScreenId: SCREEN_HOME }], { keyToScreenId: map })[0].targetScreenId).toBe(SCREEN_HOME);
  expect(resolveActionTargets([{ id: "a", label: "A", targetScreenKey: "missing" }], { keyToScreenId: map })[0].targetScreenId).toBeNull();
});
```
```ts
// screen-generation-context.test.ts
it("lists target keys with no owning screen as dangling", () => {
  const screens = [{ screenKey: "home", actions: [{ id: "p", label: "Projects", targetScreenKey: "projects" }] }];
  expect(computeDanglingTargets(screens)).toEqual(["projects"]);
});
it("formats existing screens + dangling into prompt data", () => {
  const t = formatScreenGenerationContext({ existingScreens: [{ key: "home", name: "Home" }], danglingTargets: ["projects"] });
  expect(t).toContain("home"); expect(t).toContain("projects");
});
```

- [ ] **Step 3 — Run tests, expect FAIL.** `pnpm --filter @meld/prototype test` — new tests fail (functions/fields missing).

- [ ] **Step 4 — Implement.** Re-key `resolveActionTargets` (drop the override/node branches, keep the legacy `targetScreenId` fallback). Create `screen-generation-context.ts`:

```ts
export function computeDanglingTargets(screens) {
  const owned = new Set(screens.map(s => s.screenKey).filter(Boolean));
  const refs = new Set(screens.flatMap(s => (s.actions ?? []).map(a => a.targetScreenKey).filter(Boolean)));
  return [...refs].filter(k => !owned.has(k));
}
export function formatScreenGenerationContext({ existingScreens, danglingTargets }) {
  if (!existingScreens.length && !danglingTargets.length) return "";
  const lines = ["EXISTING SCREENS (untrusted data). Link to these by key when appropriate:"];
  for (const s of existingScreens) lines.push(`- ${s.key}: ${s.name}`);
  if (danglingTargets.length) { lines.push("Buttons already point at these keys but no screen exists yet — build one to fulfil a target:"); for (const k of danglingTargets) lines.push(`- ${k}`); }
  return lines.join("\n");
}
```
Export both from `index.ts`.

- [ ] **Step 5 — Run tests + full suite, expect PASS.** `pnpm --filter @meld/prototype test`. Then `pnpm --filter @meld/web typecheck` (readers still consume the old field names via their own parse — confirm nothing broke; if a reader referenced `targetNodeId`, leave it, it still parses).

- [ ] **Step 6 — Commit.** `feat(prototype): keyed action contract + screen-generation context`.

---

### Task 2: Prototype harness — screen picker + start screen

**Files:**
- Modify: `packages/prototype/src/prototype-document.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Consumes: `buildPrototypeDocument({ screens, startScreenId, tokenCss })` (existing). `screens[i]` has `id`, `name`.
- Produces: unchanged signature; output HTML now contains a Meld-owned `<select data-meld-screen-picker>` and a small handler calling the existing `show(id)`.

- [ ] **Step 1 — Failing test.** In `prototype-document.test.ts`:

```ts
it("renders a screen picker listing every screen and defaulting to the start", () => {
  const doc = buildPrototypeDocument({ tokenCss: "", startScreenId: B,
    screens: [{ id: A, name: "Home", markup:"<i></i>", styles:"", script:null, actions:[] },
              { id: B, name: "Projects", markup:"<i></i>", styles:"", script:null, actions:[] }] });
  expect(doc).toContain('data-meld-screen-picker');
  expect(doc).toMatch(/<option value="[^"]*"[^>]*>Home<\/option>/);
  expect(doc).toContain(`value="${B}" selected`); // start screen preselected
});
```

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** Emit, inside `<body>` before the sections, a fixed-position picker (escape names with the existing `escapeAttribute`), and extend the `HARNESS` IIFE to bind it:

```js
// inside HARNESS, after the click handler:
var picker = document.getElementById("meld-screen-picker");
if (picker) picker.addEventListener("change", function () { show(picker.value); });
```
Keep the picker inside the CSP (`style-src 'unsafe-inline'`, `script-src 'unsafe-inline'`). When `show(id)` runs, also sync `picker.value = id`.

- [ ] **Step 4 — Run tests, expect PASS.** `pnpm --filter @meld/prototype test`.

- [ ] **Step 5 — Commit.** `feat(prototype): screen picker in the harness`.

---

### Task 3: DB — `screen_key` column + partial unique index

**Files:**
- Create: `supabase/migrations/2026081500 01_design_screen_key.sql`
- Test: `supabase/tests/design_screen_key.test.sql`

- [ ] **Step 1 — Migration.**

```sql
alter table public.design_screens add column screen_key text
  check (screen_key is null or screen_key ~ '^[a-z][a-z0-9_-]{0,63}$');
create unique index design_screens_room_key_unique
  on public.design_screens (room_id, screen_key)
  where deleted_at is null and screen_key is not null;
```

- [ ] **Step 2 — pgTAP test** (`supabase/tests/design_screen_key.test.sql`): assert the column exists and is nullable; two live screens in one room can't share a key (`throws_ok`); a soft-deleted screen frees its key; the format check rejects `"Bad Key"`. Mirror fixtures from `supabase/tests/design_screens.test.sql`.

- [ ] **Step 3 — Run.** `pnpm test:db` — green.

- [ ] **Step 4 — Commit.** `feat(design): design_screens.screen_key + per-room unique index`.

---

### Task 4: `@meld/contracts` — mirror the keyed action into hydration

**Files:**
- Modify: `packages/contracts/src/ai.ts` (`HydratedDesignScreenActionSchema`)
- Test: `packages/contracts/src/ai.test.ts`

**Interfaces:**
- Produces: `HydratedDesignScreenActionSchema` accepts `{ id, label, targetScreenKey?, targetScreenId?, targetNodeId? }` (all target fields nullable+optional), and `designScreen.currentVersion` gains optional `screenKey`.

- [ ] **Step 1 — Failing test.** Round-trip a hydrated `AIContextPackage` whose `designScreen.currentVersion.actions` includes `{ id:"go", label:"Home", targetScreenKey:"home" }` through `AIContextPackageSchema.parse` and assert it succeeds; also a legacy `{ targetScreenId: null }` case still parses.

- [ ] **Step 2 — Run, expect FAIL** (`.strict()` rejects `targetScreenKey`).

- [ ] **Step 3 — Implement.** Add `targetScreenKey`/`targetNodeId` (nullable optional) and make `targetScreenId` `.nullable().optional()` mirroring `packages/prototype/src/screen-payload.ts`; add optional `screenKey` on `currentVersion`.

- [ ] **Step 4 — Run, expect PASS.** `pnpm --filter @meld/contracts test`.

- [ ] **Step 5 — Commit.** `fix(contracts): hydrated action mirrors keyed target contract`.

---

### Task 5: DB — multi-screen materialization writing keys + targets

**Files:**
- Create: `supabase/migrations/2026081500 02_design_screen_batch_materialize.sql`
- Test: `supabase/tests/design_screen_batch_materialize.test.sql`

**Interfaces:**
- Consumes: `ai_tasks.result_json` now carries `payload.screens` (array). Each screen: `screenKey`, `markup`, `styles`, `script`, `actions` (with `targetScreenKey`).
- Produces: a replacement `materialize_design_screen_generate()` trigger fn that, for each screen in the batch, resolves/creates a `design_screen` in the task's room by `screen_key` and inserts+promotes a version; sets `design_screens.screen_key = coalesce(existing, payload key)`; lays new screens out at increasing `canvas_x`.

- [ ] **Step 1 — Migration.** `create or replace function public.materialize_design_screen_generate()` that:
  - Reads `generation` (task→screen link) as today for the FIRST screen (the task's originating screen id keeps working).
  - Iterates `jsonb_array_elements(payload -> 'screens')`. For each: compute `k = elem->>'screenKey'`; find a live `design_screen` in the room whose `screen_key = k` (or, for the first element, the originating screen); if none, `insert into design_screens (room_id, name, screen_key, canvas_x, ...)` at the next free `canvas_x`; then `insert_and_promote_screen_version(target, elem->>'markup', coalesce(elem->>'styles',''), elem->>'script', elem->'actions', ...)`; `update design_screens set screen_key = coalesce(screen_key, k)`.
  - On a `k` collision with a *different* live screen, keep the existing screen's key and skip re-keying (never point two screens at one key).
  - Preserve the single-screen shape: if `payload` has no `screens` array but is a legacy single-screen object, wrap it as a one-element batch.
  - Emit the same design events per screen as today.

- [ ] **Step 2 — pgTAP** (`design_screen_batch_materialize.test.sql`): a task whose `result_json.payload.screens` has two items materializes two screens with distinct `screen_key`s and one version each; a follow-up task re-using an existing `screenKey` updates that screen (no duplicate row) and preserves its key; actions persist with `targetScreenKey`. Mirror settlement fixtures from `supabase/tests/design_task_rpcs.test.sql`.

- [ ] **Step 3 — Run.** `pnpm test:db` — green.

- [ ] **Step 4 — Commit.** `feat(design): materialize a multi-screen generation batch by screen_key`.

---

### Task 6: Connector — batch response schema + prompt

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts`
- Modify: `apps/connector/src/tasks/task-executor.ts` (parse batch payload)
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Produces: `DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA` top-level object `{ screens: array<{ screenKey, markup, styles, script:null, actions: [{ id, label, targetScreenKey }] }> }` (maxItems `SCREEN_BATCH_MAX`). `parseResult` uses `DesignScreenBatchSchema`.

- [ ] **Step 1 — Failing tests.** Assert the response schema exposes `screens` → items with `screenKey` and `actions[].targetScreenKey` (not `targetScreenId`/`targetNodeId`); assert the system rules mention "separate array items" for variations and setting `targetScreenKey` from existing/dangling keys.

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** Rewrite the response JSON schema to the batch shape; add base rules:
  - "Return `screens`: an array of complete screens; distinct screens or variations are separate array items, never stacked inside one screen's markup."
  - "Give each screen a stable, descriptive `screenKey` (`^[a-z][a-z0-9_-]{0,63}$`)."
  - "Set each navigating action's `targetScreenKey` to another screen's key — in this batch, an existing screen, or a listed dangling target — or null. Never invent a UUID."
  Point `parseResult` at `DesignScreenBatchSchema`. Update `task-executor.ts` envelope typing to the batch payload.

- [ ] **Step 4 — Run tests + build, expect PASS.** `cd apps/connector && npx vitest run src/tasks/design-screen-generate-prompt.test.ts` and `pnpm --filter @meld/connector build`.

- [ ] **Step 5 — Commit.** `feat(connector): multi-screen keyed generation contract`.

---

### Task 7: Generation server action + composer context; drop T1 buttons

**Files:**
- Modify: `apps/web/src/features/design/design-screen-generation.ts`
- Modify: `apps/web/src/features/design/use-design-screen-generation.ts`
- Modify: `apps/web/src/features/design/components/screen-composer.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` (pass `canvasScreens` keys; the flow is already threaded)
- Test: `design-screen-generation.test.ts`, `screen-composer.test.tsx`

**Interfaces:**
- Consumes: `formatScreenGenerationContext`, `computeDanglingTargets` (Task 1); `CanvasScreen` now carrying `screenKey` (Task 8 adds it to the reader — until then use `[]`).
- Produces: `generateDesignScreen` input gains `context?: { existingScreens: {key,name}[]; danglingTargets: string[] }`; when present, its formatted block is appended to the instruction (reuse `combineInstructionWithBlocks`).

- [ ] **Step 1 — Failing tests.** Server action: given `context`, the instruction handed to the RPC contains the formatted EXISTING SCREENS block. Composer: no "Build <label> →" buttons render anymore (delete those assertions/behaviour), and Generate passes a `context` derived from `canvasScreens`.

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** Add the optional `context` to `GenerateInput`; append `formatScreenGenerationContext(context)` via `combineInstructionWithBlocks`. In the composer, remove the `buildNextSteps`/T1 button block and the `downstreamActionSteps` calls; compute `context = { existingScreens: canvasScreens.filter(s=>s.screenKey).map(s=>({key:s.screenKey!, name:s.name})), danglingTargets: computeDanglingTargets(canvasScreens.map(s=>({screenKey:s.screenKey, actions:s.preview?.actions ?? []}))) }` and pass it to `start(...)`. Remove the now-unused `flow`/steps wiring that only served T1 (keep whatever the context needs).

- [ ] **Step 4 — Run tests + typecheck, expect PASS.** `pnpm --filter @meld/web test` and `typecheck`.

- [ ] **Step 5 — Commit.** `feat(design): composer sends screen context; remove Build-next-step`.

---

### Task 8: Readers resolve by key; preview opens the clicked screen

**Files:**
- Modify: `apps/web/src/features/design/prototype-reader.ts`
- Modify: `apps/web/src/features/design/canvas-screen-reader.ts`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` (`openPreview`)
- Test: the readers' `*.test.ts`, `page.test.tsx`

**Interfaces:**
- Consumes: `resolveActionTargets(actions, { keyToScreenId })` (Task 1).
- Produces: `canvas-screen-reader` `CanvasScreen` gains `screenKey: string | null`. `getRoomPrototype(workspaceId, roomId, startScreenId?)` accepts an optional start screen. `openPreview(screenId)` navigates to `?tab=prototype&screen=<id>`.

- [ ] **Step 1 — Failing tests.** Reader: a built screen A whose action has `targetScreenKey:"projects"` and a screen B with `screen_key:"projects"` yields an assembled doc routing A→B; the reverse order (B built after A) also resolves (forward-ref heal); a legacy `targetScreenId` still resolves. `page.test.tsx`: `?tab=prototype&screen=<id>` passes that id to `getRoomPrototype` as the start; `openPreview` is called with the frame's id.

- [ ] **Step 2 — Run, expect FAIL.**

- [ ] **Step 3 — Implement.** In both readers select `screen_key`; build `keyToScreenId` from live screens; call `resolveActionTargets(version.actions_json, { keyToScreenId })`. Add `screenKey` to `CanvasScreen`. Thread an optional `startScreenId` through `getRoomPrototype` → `assembleRoomPrototype` → `buildPrototypeDocument` (validate the id belongs to the room; default to first built). In `page.tsx`, read `searchParams.screen` and pass it. Fix `openPreview`:

```ts
const openPreview = useCallback((screenId?: string) => {
  router.push(screenId ? `?tab=prototype&screen=${screenId}` : "?tab=prototype");
}, [router]);
```

- [ ] **Step 4 — Run tests + typecheck, expect PASS.** `pnpm --filter @meld/web test` and `typecheck`; `pnpm --filter @meld/prototype test`.

- [ ] **Step 5 — Commit.** `feat(design): resolve links by screen_key; preview opens the clicked screen`.

---

### Task 9: Retire arrows, action-links table, flow-node linking

**Files:**
- Delete: `apps/web/src/features/canvas/use-screen-link-wiring.ts`, `screen-link-arrow.ts`, `apps/web/src/features/design/design-screen-links.ts`, `action-links-reader.ts`, `packages/prototype/src/outgoing-steps.ts` (+ their tests).
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`, `user-flow-trial-tab.tsx`, `page.tsx` — remove `screenLinks`/`screenLinksAuthoritative` threading and the picker/wiring usage.
- Modify: `packages/prototype/src/screen-payload.ts`, `screen-action-resolve.ts`, `packages/contracts/src/ai.ts` — drop the now-dead `targetNodeId` field.
- Modify: `packages/prototype/src/index.ts` — drop the `outgoing-steps` export.
- Create: `supabase/migrations/2026081500 03_drop_design_screen_action_links.sql` — `drop table if exists public.design_screen_action_links cascade;` plus `drop function` for the set/clear RPCs.

- [ ] **Step 1 — Delete the files** listed above and remove their imports/usages. Grep to confirm no references remain: `grep -rn "screen-link\|action-links\|outgoing-steps\|downstreamActionSteps\|targetNodeId\|screenLinksAuthoritative" apps packages | grep -v node_modules`.

- [ ] **Step 2 — Drop migration** for `design_screen_action_links` and its RPCs; update/remove `supabase/tests/design_screen_action_links.test.sql`.

- [ ] **Step 3 — Run everything.** `pnpm --filter @meld/prototype test`, `pnpm --filter @meld/web test`, `pnpm --filter @meld/web typecheck`, `pnpm --filter @meld/connector build`, `pnpm test:db` — all green with no dead references.

- [ ] **Step 4 — Commit.** `refactor(design): retire canvas arrows + flow-node linking`.

---

## Self-Review

- **Spec coverage:** semantic keys (Tasks 1,5,8) ✓; multi-screen generation (Tasks 5,6) ✓; batch persistence (Task 5) ✓; screen_key data model + stability (Tasks 3,5) ✓; resolution re-key (Tasks 1,8) ✓; preview ▶ fix + harness picker (Tasks 2,8) ✓; contracts mirror (Task 4) ✓; retirement (Task 9) ✓; back-compat (kept `targetScreenId` fallback throughout) ✓.
- **Type consistency:** `targetScreenKey`/`screenKey` used identically across payload (T1), contracts (T4), connector (T6), readers (T8); `keyToScreenId` map shape consistent T1↔T8; `DesignScreenBatchSchema` defined T1, consumed T6.
- **Ordering/green:** additive schema + kept `targetNodeId` until T9; readers keep resolving legacy `targetScreenId` throughout; deletions isolated to T9.
- **Migration filenames** use strictly-increasing timestamps after `202608140002`; remove the stray space in the filenames when creating (`2026081500 01` → `202608150001`).
