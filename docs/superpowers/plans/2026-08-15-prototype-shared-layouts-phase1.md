# Prototype Shared Layouts — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist reusable layouts (app shells) and render them composed around each screen's content, deterministically — with standalone (no-layout) screens rendering byte-identical to today.

**Architecture:** Layouts mirror the existing screen/version tables. Screens gain a nullable `layout_id`. The read/assembly path in `@meld/prototype` injects a layout's shell markup around a screen's content at a `data-meld-slot` marker, scopes styles per-layout and per-screen, and merges the layout's (namespaced) nav actions into each screen's route table. Generation is out of scope for this phase; the materializer is exercised by hand-authored task payloads.

**Tech Stack:** TypeScript, Zod, Vitest (`packages/prototype`, `apps/web`), Postgres + pgtap (`supabase/`).

## Global Constraints

- Slug shape for `layout_key`: `^[a-z][a-z0-9_-]{0,63}$` (same as `screen_key`).
- Byte bounds reuse screen limits: shell markup ≤ 98304, shell styles ≤ 32768, actions ≤ 16384 (`pg_column_size`), matching `design_screen_versions` checks.
- A layout version's `shell_markup` MUST contain **exactly one** empty element carrying `data-meld-slot`.
- Layout-key collisions follow **Policy A** (claim-and-displace), identical to `202608150011_design_screen_key_claim_displaces.sql` for screen keys.
- Standalone screens (`layout_id IS NULL`) must render identically to current behavior — this is a hard regression guard.
- pgtap runs against a schema-only scratch clone, never `supabase db reset` on the dev DB. Recipe: clone as `supabase_admin`, `ALTER DATABASE <db> SET search_path TO public, extensions`, `GRANT USAGE ON SCHEMA extensions`, run the `.test.sql` file via `psql`.
- Every migration file is append-only with a timestamp after `202608150011`.

---

### Task 1: Layout tables, `layout_id` column, and version-promotion RPC

**Files:**
- Create: `supabase/migrations/202608150012_design_layouts.sql`
- Test: `supabase/tests/design_layouts.test.sql`

**Interfaces:**
- Produces (DB):
  - table `public.design_layouts(id, room_id, workspace_id, layout_key, name, current_version_id, created_by, created_at, updated_at, deleted_at)`
  - table `public.design_layout_versions(id, layout_id, room_id, workspace_id, shell_markup, shell_styles, actions_json, base_version_id, profile_version_id, originating_task_id, promoted, created_by, created_at)`
  - `public.design_screens.layout_id uuid null references public.design_layouts(id)`
  - `public.insert_and_promote_layout_version(target_layout_id uuid, new_shell_markup text, new_shell_styles text, new_actions jsonb, base_version uuid, profile_version uuid, task_id uuid, author uuid) returns public.design_layout_versions`

- [ ] **Step 1: Write the failing pgtap test**

Create `supabase/tests/design_layouts.test.sql`, mirroring the fixture block of `supabase/tests/design_screen_delete.test.sql` (users, workspace, project, membership, room, participant). Then:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- (fixtures: reuse the exact insert block from design_screen_delete.test.sql,
--  giving an editor user 'aa...002' edit access to room 'ad...001')

-- 1. tables exist
select has_table('public','design_layouts','design_layouts table exists');
select has_table('public','design_layout_versions','design_layout_versions table exists');

-- 2. design_screens gained layout_id
select has_column('public','design_screens','layout_id','design_screens has layout_id');

-- 3. a layout + version can be created and promoted via the RPC
insert into public.design_layouts (id, room_id, workspace_id, layout_key, name, created_by)
values ('b1000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',
        'ab000000-0000-4000-8000-000000000001','app-shell','App Shell',
        'aa000000-0000-4000-8000-000000000002');

select lives_ok($$
  select public.insert_and_promote_layout_version(
    'b1000000-0000-4000-8000-000000000001',
    '<aside>nav</aside><main data-meld-slot></main>',
    'aside{display:block}',
    '[{"id":"nav-home","label":"Home","targetScreenKey":"home"}]'::jsonb,
    null, null, null, 'aa000000-0000-4000-8000-000000000002')
$$, 'insert_and_promote_layout_version succeeds');

select is(
  (select promoted from public.design_layout_versions
   where layout_id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'first layout version promotes');

select is(
  (select dl.current_version_id is not null from public.design_layouts dl
   where dl.id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'promoted version becomes the layout current version');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run (scratch-clone recipe):
```bash
C=supabase_db_meld
docker exec $C psql -U supabase_admin -d postgres -c "DROP DATABASE IF EXISTS meld_pgtap WITH (FORCE);" -c "CREATE DATABASE meld_pgtap;"
docker exec $C sh -c "pg_dump -U supabase_admin -d postgres --schema-only 2>/dev/null | psql -U supabase_admin -d meld_pgtap -q >/dev/null 2>&1"
docker exec $C psql -U supabase_admin -d meld_pgtap -c "ALTER DATABASE meld_pgtap SET search_path TO public, extensions;" -c "GRANT USAGE ON SCHEMA extensions TO public;"
docker cp supabase/tests/design_layouts.test.sql $C:/tmp/dl.test.sql
docker exec $C psql -U postgres -d meld_pgtap -tA -f /tmp/dl.test.sql 2>&1 | grep -E "^not ok|ERROR" | head
```
Expected: FAIL — `relation "public.design_layouts" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608150012_design_layouts.sql`. Model the two tables and the RPC on `202608130006_design_screens.sql` + `202608130007_design_screen_promote.sql` (read both first). Requirements:
- `design_layouts`: columns as in Interfaces; FK `current_version_id → design_layout_versions(id)` added after the versions table (deferred like `design_screens_current_version_fkey`); partial unique index on `(room_id, layout_key) where deleted_at is null` (mirror how screen_key uniqueness is done in `202608150002_design_screen_key.sql`); `create index design_layouts_room on design_layouts(room_id) where deleted_at is null`.
- `design_layout_versions`: columns as in Interfaces; size checks copied from `design_screen_versions` (markup ≤ 98304, styles ≤ 32768, actions ≤ 16384); a `protect_design_layout_version()` immutability trigger copied structurally from `protect_design_screen_version()`.
- `alter table public.design_screens add column layout_id uuid references public.design_layouts(id);`
- `insert_and_promote_layout_version(...)`: a structural copy of `insert_and_promote_screen_version` — insert version, CAS-promote against `base_version`, set `current_version_id`/`updated_at` on the layout. (Layouts have no `state`/`updating`; drop those two assignments.)
- RLS: enable on both tables; policies copied from `design_screens`/`design_screen_versions` (`is_room_participant` / `can_edit_room`). Grants: RPC `revoke all ... ; grant execute ... to service_role;`.

- [ ] **Step 4: Run the test to verify it passes**

Re-run the Step 2 block. Expected: `ok 1..6`, no `not ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608150012_design_layouts.sql supabase/tests/design_layouts.test.sql
git commit -m "feat(design): design_layouts tables, screen layout_id, layout version RPC"
```

---

### Task 2: Layout-aware composition in `@meld/prototype`

**Files:**
- Create: `packages/prototype/src/compose-layout.ts`
- Create: `packages/prototype/src/compose-layout.test.ts`
- Modify: `packages/prototype/src/prototype-document.ts`
- Modify: `packages/prototype/src/index.ts`

**Interfaces:**
- Consumes: `ResolvedScreenAction` (`./screen-action-resolve`), `DesignScreenPayload` (`./screen-payload`).
- Produces:
  - `export type PrototypeLayout = { id: string; shellMarkup: string; shellStyles: string; actions: ResolvedScreenAction[] }`
  - `export type PrototypeScreen = DesignScreenPayload & { id: string; name: string; layout?: PrototypeLayout | null }` (extend the existing type in `prototype-document.ts`)
  - `export function injectSlot(shellMarkup: string, content: string): { markup: string; ok: boolean }` — inserts `content` inside the single empty `data-meld-slot` element; `ok:false` if not exactly one slot.
  - `export function namespaceLayoutActionId(actionId: string): string` — returns `layout__<actionId>`.
  - `export function composeScreen(screen: PrototypeScreen): { markup: string; contentStyles: string; layoutStyles: { id: string; css: string } | null; routes: Record<string, string | null> }`

- [ ] **Step 1: Write the failing tests**

Create `packages/prototype/src/compose-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { injectSlot, namespaceLayoutActionId, composeScreen } from "./compose-layout";

const shell = '<aside><a data-meld-action="nav-home">Home</a></aside><main data-meld-slot></main>';

describe("injectSlot", () => {
  it("injects content into the single slot element", () => {
    const r = injectSlot(shell, "<p>content</p>");
    expect(r.ok).toBe(true);
    expect(r.markup).toContain("<main data-meld-slot><p>content</p></main>");
    expect(r.markup).toContain("nav-home");
  });
  it("reports not-ok when there is no slot", () => {
    expect(injectSlot("<main></main>", "x").ok).toBe(false);
  });
  it("reports not-ok when there are two slots", () => {
    expect(injectSlot("<a data-meld-slot></a><b data-meld-slot></b>", "x").ok).toBe(false);
  });
});

describe("composeScreen", () => {
  const base = { id: "s1", name: "S1", screenKey: "home", styles: "", script: null } as const;

  it("standalone screen: markup and routes unchanged, no layout styles", () => {
    const r = composeScreen({
      ...base, markup: "<h1>hi</h1>",
      actions: [{ id: "go", label: "Go", targetScreenId: "s2", targetScreenKey: null }],
      layout: null,
    });
    expect(r.markup).toBe("<h1>hi</h1>");
    expect(r.layoutStyles).toBeNull();
    expect(r.routes).toEqual({ go: "s2" });
  });

  it("layout screen: shell wraps content, nav ids namespaced, routes merged", () => {
    const r = composeScreen({
      ...base, markup: "<h1>hi</h1>",
      actions: [{ id: "go", label: "Go", targetScreenId: "s2", targetScreenKey: null }],
      layout: {
        id: "L1", shellStyles: "aside{color:red}", shellMarkup: shell,
        actions: [{ id: "nav-home", label: "Home", targetScreenId: "s1", targetScreenKey: "home" }],
      },
    });
    expect(r.markup).toContain('data-meld-action="layout__nav-home"');
    expect(r.markup).toContain("<h1>hi</h1>");
    expect(r.layoutStyles).toEqual({ id: "L1", css: "aside{color:red}" });
    expect(r.routes).toEqual({ go: "s2", layout__nav_home: "s1" });
  });
});
```

Note: the route key for `nav-home` is `layout__nav-home` (hyphen kept). Adjust the last `toEqual` to `{ go: "s2", "layout__nav-home": "s1" }`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @meld/prototype test compose-layout`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `compose-layout.ts`**

```ts
import type { ResolvedScreenAction } from "./screen-action-resolve";
import type { DesignScreenPayload } from "./screen-payload";

export type PrototypeLayout = {
  id: string;
  shellMarkup: string;
  shellStyles: string;
  actions: ResolvedScreenAction[];
};

const SLOT = /<([a-zA-Z][\w-]*)((?:[^>]*?)\bdata-meld-slot\b(?:[^>]*?))>\s*<\/\1>/g;

export function injectSlot(shellMarkup: string, content: string) {
  const matches = shellMarkup.match(SLOT);
  if (!matches || matches.length !== 1) return { markup: shellMarkup, ok: false };
  const markup = shellMarkup.replace(SLOT, (_m, tag, attrs) => `<${tag}${attrs}>${content}</${tag}>`);
  return { markup, ok: true };
}

export function namespaceLayoutActionId(actionId: string): string {
  return `layout__${actionId}`;
}

// Rewrites data-meld-action="X" -> data-meld-action="layout__X" for each layout
// action id, so a content action can never shadow a nav link in the route table.
function namespaceShellActions(markup: string, actions: ResolvedScreenAction[]): string {
  let out = markup;
  for (const a of actions) {
    out = out.split(`data-meld-action="${a.id}"`).join(`data-meld-action="${namespaceLayoutActionId(a.id)}"`);
  }
  return out;
}

export function composeScreen(
  screen: DesignScreenPayload & { id: string; name: string; layout?: PrototypeLayout | null },
) {
  const routes: Record<string, string | null> = {};
  for (const a of screen.actions) routes[a.id] = a.targetScreenId ?? null;

  if (!screen.layout) {
    return { markup: screen.markup, contentStyles: screen.styles, layoutStyles: null as { id: string; css: string } | null, routes };
  }

  const layout = screen.layout;
  const injected = injectSlot(layout.shellMarkup, screen.markup);
  // Missing/duplicate slot: fall back to standalone content, drop the shell.
  const markup = injected.ok
    ? namespaceShellActions(injected.markup, layout.actions)
    : screen.markup;

  if (injected.ok) {
    for (const a of layout.actions) routes[namespaceLayoutActionId(a.id)] = a.targetScreenId ?? null;
  }

  return {
    markup,
    contentStyles: screen.styles,
    layoutStyles: injected.ok ? { id: layout.id, css: layout.shellStyles } : null,
    routes,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @meld/prototype test compose-layout`. Expected: PASS.

- [ ] **Step 5: Wire composition into `buildPrototypeDocument`**

In `prototype-document.ts`: extend `PrototypeScreen` with `layout?: PrototypeLayout | null` (import `PrototypeLayout`, `composeScreen`). Replace the per-screen `routes`, `scoped` styles, and `sections` construction so each screen goes through `composeScreen`:
- `routes[screen.id] = composed.routes;`
- content styles: `[data-meld-screen="${screen.id}"] { ${split.scoped} }` where the split now runs on `composed.contentStyles`.
- layout styles: collect `composed.layoutStyles` into a `Map<layoutId, css>` and emit once per layout as `[data-meld-layout="${layoutId}"] { ${scopedLayoutCss} }` (run `splitHoistedAtRules` on it too, hoisting @keyframes/@font-face).
- section tag: `<section data-meld-screen="${screen.id}"${layoutAttr}${hidden}>${composed.markup}</section>` where `layoutAttr` is ` data-meld-layout="${screen.layout.id}"` when a layout is present.

Keep `embedJson`, harness, picker, CSP unchanged.

- [ ] **Step 6: Extend `prototype-document.test.ts`**

Add a case: a screen with a `layout` renders `data-meld-layout`, injects the shell, emits one `[data-meld-layout="..."]` style block, and its `meld-routes` JSON contains both the content action and the `layout__`-prefixed nav action. Add a regression case asserting a `layout: null` screen produces byte-identical output to the pre-change snapshot (compare against the existing standalone expectation already in this file).

- [ ] **Step 7: Export + run the package suite**

Add `export * from "./compose-layout";` to `packages/prototype/src/index.ts`. Run: `pnpm --filter @meld/prototype test`. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/prototype/src/compose-layout.ts packages/prototype/src/compose-layout.test.ts packages/prototype/src/prototype-document.ts packages/prototype/src/prototype-document.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): compose shared layout shell around screen content"
```

---

### Task 3: Materializer fans out layouts (`create` / `reuse` / `null`)

**Files:**
- Create: `supabase/migrations/202608150013_materialize_layouts.sql`
- Modify: `supabase/tests/design_screen_batch_materialize.test.sql`

**Interfaces:**
- Consumes: `insert_and_promote_layout_version` (Task 1), the existing `materialize_design_screen_generate()` body (copy from `202608150011`).
- Produces: `materialize_design_screen_generate()` that, per screen element, reads an optional `"layout"` object:
  - `{"reuse":{"layoutKey":"app-shell"}}` → resolve live layout by key, set `design_screens.layout_id`.
  - `{"create":{"layoutKey","name","shellMarkup","shellStyles","actions"}}` → resolve-or-create `design_layouts` by key using **Policy A** displacement (mirror the screen-key branch), write a version via `insert_and_promote_layout_version`, set the screen's `layout_id`. Skip the layout write if `shellMarkup` has no `data-meld-slot`.
  - absent/`null` → leave `layout_id` null.

- [ ] **Step 1: Add failing test section**

In `design_screen_batch_materialize.test.sql`, bump `plan(27)` → `plan(31)` and append Section 6 after Section 5 (before `finish()`), using a fresh originating screen `ae...006`. Payload sets element 0's `"layout": {"create": {...valid shell with a data-meld-slot...}}`. Assert:
1. a `design_layouts` row is created keyed `app-shell`;
2. its version's `shell_markup` matches;
3. the originating screen's `layout_id` points at that layout;
4. a second task with `"layout":{"reuse":{"layoutKey":"app-shell"}}` on a different screen sets that screen's `layout_id` to the same layout without creating a new one.

(Write the four `select is(...)` assertions with concrete ids, mirroring existing sections.)

- [ ] **Step 2: Run to verify failure**

Apply migrations 12 + current function to the scratch clone, run the test:
```bash
# after loading schema clone + Task 1 migration into meld_pgtap:
docker cp supabase/tests/design_screen_batch_materialize.test.sql $C:/tmp/mat.test.sql
docker exec $C psql -U postgres -d meld_pgtap -tA -f /tmp/mat.test.sql 2>&1 | grep -E "^not ok" | head
```
Expected: the 4 new assertions fail (`layout_id` null, no `design_layouts` row).

- [ ] **Step 3: Implement migration 13**

Create `202608150013_materialize_layouts.sql`: `create or replace function public.materialize_design_screen_generate()` starting from the full `202608150011` body. Inside the loop, after the screen's `target_screen` is resolved and BEFORE `insert_and_promote_screen_version`, add layout handling that computes a `layout_id_val uuid` and, after the screen version is written, `update public.design_screens set layout_id = layout_id_val where id = target_screen.id` when non-null. The `create` branch reuses the Policy A key-claim SQL shape (displace other live layout holding the key, then claim/create) against `design_layouts`. Validate `shellMarkup ~ 'data-meld-slot'` before creating a version; skip layout assignment if absent.

- [ ] **Step 4: Run to verify pass**

Re-run Step 2 block against a clone that now includes migration 13. Expected: full suite `ok`, no `not ok` (the original 27 still pass).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608150013_materialize_layouts.sql supabase/tests/design_screen_batch_materialize.test.sql
git commit -m "feat(design): materialize screen layouts (create/reuse) with Policy A keys"
```

---

### Task 4: Readers join layouts and produce composed previews

**Files:**
- Modify: `apps/web/src/features/design/canvas-screen-reader.ts`
- Modify: `apps/web/src/features/design/prototype-reader.ts`
- Modify: `apps/web/src/features/rooms/e2e-fake.ts`
- Test: `apps/web/src/features/design/canvas-screen-reader.test.ts` (or the existing reader test file for this module)

**Interfaces:**
- Consumes: `PrototypeLayout` (Task 2), `resolveActionTargets`.
- Produces: both readers attach a resolved `PrototypeLayout | null` to each screen whose `layout_id` is set, so downstream assembly composes the shell. `keyToScreenId` is reused to resolve the layout's own `actions` targets.

- [ ] **Step 1: Write the failing reader test**

Add a case to the canvas-screen-reader test (follow the fake path via `isRoomFakeEnabled`, as the reader already imports `fakeListRoomCanvasScreens`): a room with one layout and one screen referencing it returns the screen with a non-null `layout` whose `actions[0].targetScreenId` is resolved through `keyToScreenId`. (If no reader test file exists yet, create `canvas-screen-reader.test.ts` using the e2e-fake fixtures.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @meld/web test canvas-screen-reader`
Expected: FAIL (`layout` undefined).

- [ ] **Step 3: Implement**

In each reader: select `layout_id` on screens; batch-fetch the referenced live `design_layouts` + their `current_version_id` `design_layout_versions` (`shell_markup, shell_styles, actions_json`); build a `layoutsById` map; attach `layout: layout_id ? { id, shellMarkup, shellStyles, actions: resolveActionTargets(version.actions_json, { keyToScreenId }) } : null` to each screen's preview/entry. Update the `CanvasScreenRowSchema` to include `layout_id: z.string().uuid().nullable()`. Mirror the schema/fetch/attach in `prototype-reader.ts`. Update `e2e-fake.ts` fixtures + `fakeListRoomCanvasScreens` to carry `layout` so the fake path stays representative.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @meld/web test canvas-screen-reader`. Expected: PASS.

- [ ] **Step 5: Run the web design + rooms suites for regressions**

Run: `pnpm --filter @meld/web test design && pnpm --filter @meld/web test rooms`. Expected: pass (standalone screens unaffected).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/design/canvas-screen-reader.ts apps/web/src/features/design/prototype-reader.ts apps/web/src/features/rooms/e2e-fake.ts apps/web/src/features/design/canvas-screen-reader.test.ts
git commit -m "feat(design): readers resolve and attach shared layouts to screens"
```

---

### Task 5: Full-suite verification gate

**Files:** none (verification only).

- [ ] **Step 1:** Run the four sibling pgtap suites against a fresh clone with migrations 12+13 applied (`design_layouts`, `design_screen_batch_materialize`, `design_screen_key`, `design_screen_delete`, `design_screen_restore`) — all `ok`, no `not ok`.
- [ ] **Step 2:** Run `pnpm --filter @meld/prototype test` and `pnpm --filter @meld/web test design` — all pass.
- [ ] **Step 3:** Run `pnpm --filter @meld/prototype build` (or the repo typecheck task) to confirm no type breakage from the extended `PrototypeScreen`.
- [ ] **Step 4:** Confirm a `layout: null` screen still renders byte-identical (the Task 2 regression case) — this is the standalone guard.
- [ ] **Step 5: Commit** any snapshot/lockfile updates with `chore(design): phase 1 shared-layouts verification`.

---

## Self-Review

**Spec coverage:** data model → Task 1; rendering/composition + route merge + slot fallback + action namespacing → Task 2; materialization (create/reuse/null + Policy A + slot validation) → Task 3; readers/compose + e2e-fake → Task 4; forward-only migration (no backfill) → satisfied by `layout_id` defaulting null and the standalone regression guard (Tasks 1, 2, 5); testing strategy → Tasks 1–5. Generation (prompt/schema/context) is intentionally deferred to the Phase 2 plan.

**Placeholder scan:** migration bodies reference concrete source files to copy from (`202608130006/07`, `202608150011`, `202608150002`) with the exact deltas listed; composition ships real code; tests ship real assertions. No TBD/TODO.

**Type consistency:** `PrototypeLayout` (id/shellMarkup/shellStyles/actions:ResolvedScreenAction[]) is defined in Task 2 and consumed unchanged in Task 4. `composeScreen` return shape (markup/contentStyles/layoutStyles/routes) is produced in Task 2 and consumed in Task 2 Step 5. `insert_and_promote_layout_version` signature is fixed in Task 1 and called in Task 3. `layout_id` column name is consistent across Tasks 1, 3, 4.
