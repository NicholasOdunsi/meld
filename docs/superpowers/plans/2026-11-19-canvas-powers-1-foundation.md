# Canvas Powers — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the three foundations every later Canvas powers stage builds on:
1. versioned code-file storage for canvas screens,
2. a pure screen compiler and runtime, which turn React or HTML into one safe, loop-guarded document,
3. Orion's own board chrome, which replaces Excalidraw's UI with a side dock, selection pill and zoom control.

**Architecture:** There are three independent tracks (A, B and C) that share no files, so they can run in parallel.
- **Track A** extends `design_screen_versions` with `source_kind` / `files` / `entry` / `links`. It adds three security-definer RPCs and wraps them in Next server actions.
- **Track B** creates `packages/screen-runtime`, a pure TypeScript package. It uses Babel standalone (plugins for the loop guard, element tags and module graph) plus parse5, and builds a vendored runtime bundle (React, ReactDOM, lucide-react, clsx, Tailwind browser) into `apps/web/public/screen-runtime/runtime.js`.
- **Track C** changes only `apps/web/src/features/canvas-excalidraw`. It hides Excalidraw's UI with a scoped stylesheet and renders Astryx-built chrome driven by the Excalidraw imperative API.

**Tech Stack:** Supabase Postgres + pgTAP, Next.js server actions, zod 4, Vitest 4, Playwright 1.62, `@excalidraw/excalidraw` 0.18.1, Astryx 0.1.8, `@babel/standalone` 7, parse5 7.3.0, esbuild (runtime bundle only).

**Spec:** `docs/superpowers/specs/2026-11-19-canvas-powers-design.md`. This plan covers delivery step 1 (1a, 1b and 1c). Steps 2–6 get their own plans after this one lands.

**Where to work:** start a fresh worktree and branch from `origin/main`, for example `NicholasOdunsi/canvas-powers-foundation`. Don't work on `NicholasOdunsi/branch-content-plan-gaps`: another session has uncommitted work there.

## Global Constraints

- Astryx rules from `AGENTS.md`:
  - no raw `<div>` / `<span>`
  - no hex values or `NNpx` literals in `style={{}}` or CSS rules
  - tokens only: `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`
  - `pnpm check:astryx` must pass
- Flat rule: no drop shadows on new chrome. Depth comes from surface colour only.
- `@excalidraw/excalidraw` stays pinned at `0.18.1`.
- Screen frame network policy is unchanged. `FRAME_CSP` in `apps/web/src/features/canvas-excalidraw/frame-document.ts` stays the single source of the CSP: no network.
- Screen source limits:
  - 1 to 20 files
  - at most 256 KB total, measured as UTF-8 JSON
  - paths match `^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$` and never contain `..`
  - at most 100 links
- Supported React imports, exactly: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `lucide-react`, `clsx`, plus relative imports of the screen's own files (`.tsx .ts .jsx .js .css`).
- Element tag attribute: `data-orion-src="<file>:<start>:<end>"` (character offsets into the original file). Tags are added only to host elements (lowercase JSX names or HTML elements), and only when `tagElements: true`.
- Loop guard: a single synchronous loop run longer than **1000 ms** throws `new Error("__ORION_STUCK__")`.
- Database writes to screen versions happen **only** through security-definer RPCs. No insert policy is added.
- The migration must get schema review before it's applied to production (11 Nov decision). The executing agent applies it locally only, then flags it in the PR description.
- Tests sit next to the files they test (`pnpm test:colocation`).

---

## File map

**Track A: storage**
- Create `supabase/migrations/20261120090000_canvas_screen_source.sql`: columns, constraints, `canvas_screen_files_valid`, `create_canvas_screen`, `save_canvas_screen_version`, `restore_screen_version`
- Create `supabase/tests/canvas_screen_source.test.sql`
- Create `apps/web/src/features/design/canvas-screen-source.ts`: server actions
- Create `apps/web/src/features/design/canvas-screen-source-fake.ts`: in-memory fake for e2e mode
- Create `apps/web/src/features/design/canvas-screen-source.test.ts`

**Track B: screen runtime package**
- Create `packages/screen-runtime/{package.json,tsconfig.json,eslint.config.mjs}`
- Create `packages/screen-runtime/src/source.ts` + `.test.ts`: types, zod schema and limits (no Babel import, safe on the server)
- Create `packages/screen-runtime/src/constants.ts`
- Create `packages/screen-runtime/src/loop-guard.ts` + `.test.ts`
- Create `packages/screen-runtime/src/tag-elements.ts` + `.test.ts`
- Create `packages/screen-runtime/src/module-graph.ts` + `.test.ts`
- Create `packages/screen-runtime/src/links.ts` + `.test.ts`
- Create `packages/screen-runtime/src/compile.ts` + `.test.ts`: `compileScreen` for react and html
- Create `packages/screen-runtime/src/runtime/loader.ts` + `.test.ts`: module loader and mount source string
- Create `packages/screen-runtime/src/runtime/bridge.ts` + `.test.ts`: in-frame bridge source string
- Create `packages/screen-runtime/src/document.ts` + `.test.ts`: `assembleScreenDocument`
- Create `packages/screen-runtime/src/index.ts`
- Create `packages/screen-runtime/runtime/entry.ts`, `packages/screen-runtime/scripts/build-runtime.mjs`
- Create (generated, committed) `apps/web/public/screen-runtime/runtime.js`
- Create `packages/screen-runtime/src/runtime-bundle.test.ts`: checks the generated bundle

**Track C: board chrome**
- Create `apps/web/src/features/canvas-excalidraw/chrome/orion-board.css`
- Create `apps/web/src/features/canvas-excalidraw/chrome/tool-icons.tsx`
- Create `apps/web/src/features/canvas-excalidraw/chrome/tools.ts` + `.test.ts`
- Create `apps/web/src/features/canvas-excalidraw/chrome/canvas-dock.tsx` + `.test.tsx`
- Create `apps/web/src/features/canvas-excalidraw/chrome/zoom.ts` + `.test.ts`
- Create `apps/web/src/features/canvas-excalidraw/chrome/zoom-control.tsx`
- Create `apps/web/src/features/canvas-excalidraw/chrome/selection.ts` + `.test.ts`
- Create `apps/web/src/features/canvas-excalidraw/chrome/selection-pill.tsx` + `.test.tsx`
- Modify `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`
- Create `e2e/canvas-excalidraw-chrome.spec.ts`

Plan deviation from the spec, recorded here: the spec's "Shapes flyout" is two dock buttons (Rectangle, Ellipse) and no diamond. That's simpler, needs no menu, and diamond can be added later if it's missed. The spec also says `form_factor` lives on the version. It already exists on `design_screens` (`202608150005`), so it's written there instead.

---

# Track A — Screen source storage

### Task A1: Migration + pgTAP

**Files:**
- Create: `supabase/migrations/20261120090000_canvas_screen_source.sql`
- Test: `supabase/tests/canvas_screen_source.test.sql`

**Interfaces:**
- Produces (SQL, all `security definer`, executable by `authenticated` only):
  - `public.create_canvas_screen(target_room_id uuid, screen_name text, new_kind text, new_files jsonb, new_entry text, new_form_factor text) returns jsonb`, which returns `{"screenId": uuid, "versionId": uuid}`
  - `public.save_canvas_screen_version(target_screen_id uuid, base_version uuid, new_files jsonb, new_links text[] default '{}', new_kind text default null, new_entry text default null) returns jsonb`, which returns `{"status":"saved","versionId":uuid}` or `{"status":"conflict","versionId":uuid|null}`
  - `public.restore_screen_version(target_screen_id uuid, target_version_id uuid) returns jsonb`, which returns `{"status":"saved","versionId":uuid}`
  - Errors use errcode `P0001` with messages `not_authorized`, `invalid_canvas_screen` and `version_not_found`.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/canvas_screen_source.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','cs-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','cs-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Canvas source workspace','e1000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Canvas source project','e1000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Canvas source room','e1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);

create temporary table created as
select public.create_canvas_screen(
  'e4000000-0000-4000-8000-000000000001', 'Today', 'react',
  '{"App.tsx":"export default function App(){return <main>Hi</main>}"}'::jsonb, 'App.tsx', 'mobile') as result;

select is((select state::text from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'built', 'a created canvas screen is built');
select is((select form_factor from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  'mobile', 'the form factor is stored on the screen');
select is((select source_kind from public.design_screen_versions where id = (select (result->>'versionId')::uuid from created)),
  'react', 'the first version is a react source');
select is((select current_version_id from public.design_screens where id = (select (result->>'screenId')::uuid from created)),
  (select (result->>'versionId')::uuid from created), 'the first version is current');

create temporary table saved as
select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created),
  '{"App.tsx":"export default function App(){return <main>Hello</main>}"}'::jsonb,
  array['settings']) as result;

select is((select result->>'status' from saved), 'saved', 'saving on the current version succeeds');
select is((select links from public.design_screen_versions where id = (select (result->>'versionId')::uuid from saved)),
  array['settings'], 'links are stored with the version');

select is((select public.save_canvas_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created),
  '{"App.tsx":"x"}'::jsonb) ->> 'status'), 'conflict', 'saving on a stale base is a conflict');

select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Bad','react','{"App.tsx":"x"}'::jsonb,'Main.tsx','mobile') $$,
  'P0001', 'invalid_canvas_screen', 'the entry must be one of the files');

select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Bad','react','{"../x.tsx":"x"}'::jsonb,'../x.tsx','mobile') $$,
  'P0001', 'invalid_canvas_screen', 'paths cannot climb out of the screen');

create temporary table restored as
select public.restore_screen_version(
  (select (result->>'screenId')::uuid from created),
  (select (result->>'versionId')::uuid from created)) as result;

select is((select files->>'App.tsx' from public.design_screen_versions where id = (select (result->>'versionId')::uuid from restored)),
  'export default function App(){return <main>Hi</main>}', 'restore copies the old files into a new current version');

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.create_canvas_screen('e4000000-0000-4000-8000-000000000001','Nope','html','{"index.html":"<p>x</p>"}'::jsonb,'index.html','desktop') $$,
  'P0001', 'not_authorized', 'an outsider cannot create a screen');
select throws_ok(
  format($$ select public.save_canvas_screen_version(%L::uuid, null, '{"App.tsx":"x"}'::jsonb) $$,
    (select result->>'screenId' from created)),
  'P0001', 'not_authorized', 'an outsider cannot save a version');

select * from finish();
rollback;
```

The temporary tables are created while the role is `authenticated`, so that role owns them and can read them. No extra grants are needed.

- [ ] **Step 2: Run it to verify it fails**

Use the branch-pure scratch-DB recipe: clone the schema-only into a scratch DB **as `supabase_admin`**, set `search_path` to `public, extensions`, then run the file with psql. **Never** run `supabase db reset`.

Run: `psql "$SCRATCH_DB_URL" -f supabase/tests/canvas_screen_source.test.sql`
Expected: FAIL with `function public.create_canvas_screen(...) does not exist`

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261120090000_canvas_screen_source.sql`:

```sql
-- Canvas screens carry their own source files (React or plain HTML) and keep
-- every change as a version. Legacy screens keep markup/styles/script.
-- Writes happen only through the security-definer functions below.

alter table public.design_screen_versions
  add column source_kind text not null default 'legacy',
  add column files jsonb,
  add column entry text,
  add column links text[] not null default '{}';

alter table public.design_screen_versions
  add constraint design_screen_version_source_kind
    check (source_kind in ('legacy', 'html', 'react')),
  add constraint design_screen_version_source_shape check (
    (source_kind = 'legacy' and files is null and entry is null)
    or (source_kind <> 'legacy' and jsonb_typeof(files) = 'object'
        and entry is not null and files ? entry)
  ),
  add constraint design_screen_version_files_size
    check (files is null or pg_column_size(files) <= 262144),
  add constraint design_screen_version_links_count
    check (cardinality(links) <= 100);

-- 1-20 string files, safe relative paths, entry among them.
create function public.canvas_screen_files_valid(candidate jsonb, candidate_entry text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate is not null
    and jsonb_typeof(candidate) = 'object'
    and candidate_entry is not null
    and candidate ? candidate_entry
    and (select count(*) from jsonb_object_keys(candidate)) between 1 and 20
    and octet_length(candidate::text) <= 262144
    and not exists (
      select 1 from jsonb_each(candidate) as file(path, content)
      where jsonb_typeof(file.content) <> 'string'
         or file.path !~ '^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$'
         or position('..' in file.path) > 0
    );
$$;
revoke all on function public.canvas_screen_files_valid(jsonb, text) from public, anon, authenticated, service_role;

create function public.create_canvas_screen(
  target_room_id uuid,
  screen_name text,
  new_kind text,
  new_files jsonb,
  new_entry text,
  new_form_factor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.design_screens;
  inserted public.design_screen_versions;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if new_kind is null or new_kind not in ('html', 'react')
    or new_form_factor is null or new_form_factor not in ('mobile', 'tablet', 'desktop')
    or not public.canvas_screen_files_valid(new_files, new_entry)
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;

  created := public.create_design_screen(target_room_id, screen_name);

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, promoted, created_by
  ) values (
    created.id, created.room_id, '', '', null, '[]'::jsonb,
    new_kind, new_files, new_entry, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id,
      state = 'built',
      form_factor = new_form_factor,
      updated_at = now()
  where id = created.id;

  return jsonb_build_object('screenId', created.id, 'versionId', inserted.id);
end;
$$;
revoke all on function public.create_canvas_screen(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_canvas_screen(uuid, text, text, jsonb, text, text)
  to authenticated;

create function public.save_canvas_screen_version(
  target_screen_id uuid,
  base_version uuid,
  new_files jsonb,
  new_links text[] default '{}',
  new_kind text default null,
  new_entry text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  current_version public.design_screen_versions;
  next_kind text;
  next_entry text;
  inserted public.design_screen_versions;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if screen.current_version_id is distinct from base_version then
    return jsonb_build_object('status', 'conflict', 'versionId', screen.current_version_id);
  end if;

  select * into current_version
  from public.design_screen_versions
  where id = screen.current_version_id;

  next_kind := coalesce(new_kind, nullif(current_version.source_kind, 'legacy'));
  next_entry := coalesce(new_entry, current_version.entry);
  if next_kind is null or next_kind not in ('html', 'react')
    or not public.canvas_screen_files_valid(new_files, next_entry)
    or cardinality(coalesce(new_links, '{}')) > 100
  then
    raise exception 'invalid_canvas_screen' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, base_version_id, promoted, created_by
  ) values (
    screen.id, screen.room_id, '', '', null, '[]'::jsonb,
    next_kind, new_files, next_entry, coalesce(new_links, '{}'), base_version, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id, state = 'built', updated_at = now()
  where id = screen.id;

  return jsonb_build_object('status', 'saved', 'versionId', inserted.id);
end;
$$;
revoke all on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.save_canvas_screen_version(uuid, uuid, jsonb, text[], text, text)
  to authenticated;

-- Restoring never rewrites history: the chosen version is copied forward.
create function public.restore_screen_version(
  target_screen_id uuid,
  target_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  screen public.design_screens;
  source public.design_screen_versions;
  inserted public.design_screen_versions;
begin
  select * into screen
  from public.design_screens
  where id = target_screen_id and deleted_at is null
  for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into source
  from public.design_screen_versions
  where id = target_version_id and screen_id = target_screen_id;
  if source.id is null then
    raise exception 'version_not_found' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    source_kind, files, entry, links, base_version_id, profile_version_id,
    promoted, created_by
  ) values (
    screen.id, screen.room_id, source.markup, source.styles, source.script, source.actions_json,
    source.source_kind, source.files, source.entry, source.links, screen.current_version_id,
    source.profile_version_id, true, auth.uid()
  )
  returning * into inserted;

  update public.design_screens
  set current_version_id = inserted.id, state = 'built', updated_at = now()
  where id = screen.id;

  return jsonb_build_object('status', 'saved', 'versionId', inserted.id);
end;
$$;
revoke all on function public.restore_screen_version(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_screen_version(uuid, uuid) to authenticated;
```

- [ ] **Step 4: Apply to the scratch DB and run the test**

Run: `psql "$SCRATCH_DB_URL" -f supabase/migrations/20261120090000_canvas_screen_source.sql && psql "$SCRATCH_DB_URL" -f supabase/tests/canvas_screen_source.test.sql`
Expected: `ok 1` … `ok 12`, then `# Looks like you passed all 12 tests` (or the equivalent `finish()` output with no failures)

Then run the repo SQL checks: `pnpm test:sql`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261120090000_canvas_screen_source.sql supabase/tests/canvas_screen_source.test.sql
git commit -m "feat(db): versioned source files for canvas screens"
```

### Task A2: Server actions

**Files:**
- Create: `apps/web/src/features/design/canvas-screen-source.ts`
- Create: `apps/web/src/features/design/canvas-screen-source-fake.ts`
- Test: `apps/web/src/features/design/canvas-screen-source.test.ts`

**Interfaces:**
- Consumes: the A1 RPCs, plus `ScreenSourceSchema`, `ScreenKind` and `ScreenSource` from `@meld/screen-runtime/source` (Task B1). If Track B hasn't merged yet, implement B1 first: it's tiny and has no dependencies.
- Produces:

```ts
export type CreateCanvasScreenResult = { status: "created"; screenId: string; versionId: string } | { status: "error" };
export async function createCanvasScreen(input: { roomId: string; name: string; source: ScreenSource; formFactor: "mobile" | "tablet" | "desktop" }): Promise<CreateCanvasScreenResult>;

export type SaveScreenVersionResult = { status: "saved"; versionId: string } | { status: "conflict"; versionId: string | null } | { status: "error" };
export async function saveScreenVersion(input: { screenId: string; baseVersionId: string | null; files: Record<string, string>; links?: string[]; kind?: ScreenKind; entry?: string }): Promise<SaveScreenVersionResult>;
export async function restoreScreenVersion(input: { screenId: string; versionId: string }): Promise<SaveScreenVersionResult>;

export type ScreenVersionSummary = { id: string; createdAt: string; kind: "legacy" | ScreenKind };
export async function listScreenVersions(screenId: string): Promise<{ status: "ok"; versions: ScreenVersionSummary[] } | { status: "error" }>;

export type LoadedScreenSource =
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: false; source: ScreenSource; links: string[] }
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: true };
export async function readScreenSource(screenId: string): Promise<{ status: "ok"; screen: LoadedScreenSource } | { status: "error" }>;
```

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/design/canvas-screen-source.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import {
  createCanvasScreen,
  listScreenVersions,
  readScreenSource,
  restoreScreenVersion,
  saveScreenVersion,
} from "./canvas-screen-source";

const ROOM = "e4000000-0000-4000-8000-000000000001";
const SCREEN = "e5000000-0000-4000-8000-000000000001";
const VERSION = "e6000000-0000-4000-8000-000000000001";
const NEXT = "e6000000-0000-4000-8000-000000000002";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };

beforeEach(() => vi.clearAllMocks());

describe("createCanvasScreen", () => {
  it("calls create_canvas_screen and maps the ids", async () => {
    const rpc = vi.fn(async () => ({ data: { screenId: SCREEN, versionId: VERSION }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(createCanvasScreen({ roomId: ROOM, name: "Today", source, formFactor: "mobile" }))
      .resolves.toEqual({ status: "created", screenId: SCREEN, versionId: VERSION });
    expect(rpc).toHaveBeenCalledWith("create_canvas_screen", {
      target_room_id: ROOM, screen_name: "Today", new_kind: "react",
      new_files: source.files, new_entry: "App.tsx", new_form_factor: "mobile",
    });
  });

  it("rejects a source whose entry is not a file, without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(createCanvasScreen({ roomId: ROOM, name: "x", source: { ...source, entry: "Main.tsx" }, formFactor: "mobile" }))
      .resolves.toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveScreenVersion", () => {
  it("passes the base version and maps saved", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files, links: ["settings"] }))
      .resolves.toEqual({ status: "saved", versionId: NEXT });
    expect(rpc).toHaveBeenCalledWith("save_canvas_screen_version", {
      target_screen_id: SCREEN, base_version: VERSION, new_files: source.files,
      new_links: ["settings"], new_kind: null, new_entry: null,
    });
  });

  it("maps a conflict", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "conflict", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files }))
      .resolves.toEqual({ status: "conflict", versionId: NEXT });
  });

  it("maps an RPC error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "nope" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: null, files: source.files }))
      .resolves.toEqual({ status: "error" });
  });
});

describe("restoreScreenVersion", () => {
  it("calls restore_screen_version", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(restoreScreenVersion({ screenId: SCREEN, versionId: VERSION }))
      .resolves.toEqual({ status: "saved", versionId: NEXT });
    expect(rpc).toHaveBeenCalledWith("restore_screen_version", { target_screen_id: SCREEN, target_version_id: VERSION });
  });
});

function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "order", "limit"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

describe("readScreenSource", () => {
  it("returns the current react source", async () => {
    const screens = selectChain({ data: { id: SCREEN, current_version_id: VERSION, form_factor: "mobile" }, error: null });
    const versions = selectChain({ data: { id: VERSION, source_kind: "react", files: source.files, entry: "App.tsx", links: [] }, error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => (table === "design_screens" ? screens : versions)) });
    await expect(readScreenSource(SCREEN)).resolves.toEqual({
      status: "ok",
      screen: { screenId: SCREEN, versionId: VERSION, formFactor: "mobile", legacy: false, source, links: [] },
    });
  });

  it("marks a legacy version", async () => {
    const screens = selectChain({ data: { id: SCREEN, current_version_id: VERSION, form_factor: "desktop" }, error: null });
    const versions = selectChain({ data: { id: VERSION, source_kind: "legacy", files: null, entry: null, links: [] }, error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => (table === "design_screens" ? screens : versions)) });
    await expect(readScreenSource(SCREEN)).resolves.toEqual({
      status: "ok",
      screen: { screenId: SCREEN, versionId: VERSION, formFactor: "desktop", legacy: true },
    });
  });
});

describe("listScreenVersions", () => {
  it("lists newest first", async () => {
    const versions = selectChain({ data: [{ id: NEXT, created_at: "2026-11-20T10:00:00Z", source_kind: "react" }], error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => versions) });
    await expect(listScreenVersions(SCREEN)).resolves.toEqual({
      status: "ok", versions: [{ id: NEXT, createdAt: "2026-11-20T10:00:00Z", kind: "react" }],
    });
    expect(versions.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/canvas-screen-source.test.ts`
Expected: FAIL with `Cannot find module './canvas-screen-source'`

- [ ] **Step 3: Implement the fake**

`apps/web/src/features/design/canvas-screen-source-fake.ts`:

```ts
import type { ScreenKind, ScreenSource } from "@meld/screen-runtime/source";

type FakeVersion = { id: string; kind: ScreenKind; files: Record<string, string>; entry: string; links: string[]; createdAt: string };
type FakeScreen = { roomId: string; formFactor: "mobile" | "tablet" | "desktop"; current: string; versions: FakeVersion[] };

// Next dev compiles server actions into separate module graphs; keep the fake
// on the server global so every graph sees the same screens.
const screens = ((globalThis as typeof globalThis & { __orionFakeCanvasScreens?: Map<string, FakeScreen> })
  .__orionFakeCanvasScreens ??= new Map());

export function fakeCreate(roomId: string, source: ScreenSource, formFactor: FakeScreen["formFactor"]) {
  const screenId = crypto.randomUUID();
  const version: FakeVersion = { id: crypto.randomUUID(), ...source, links: [], createdAt: new Date().toISOString() };
  screens.set(screenId, { roomId, formFactor, current: version.id, versions: [version] });
  return { screenId, versionId: version.id };
}

export function fakeSave(screenId: string, base: string | null, files: Record<string, string>, links: string[], kind?: ScreenKind, entry?: string) {
  const screen = screens.get(screenId);
  if (!screen) return null;
  if (screen.current !== base) return { status: "conflict" as const, versionId: screen.current };
  const previous = screen.versions.find((version) => version.id === screen.current)!;
  const version: FakeVersion = {
    id: crypto.randomUUID(), kind: kind ?? previous.kind, entry: entry ?? previous.entry,
    files, links, createdAt: new Date().toISOString(),
  };
  screen.versions.push(version);
  screen.current = version.id;
  return { status: "saved" as const, versionId: version.id };
}

export function fakeRestore(screenId: string, versionId: string) {
  const screen = screens.get(screenId);
  const source = screen?.versions.find((version) => version.id === versionId);
  if (!screen || !source) return null;
  return fakeSave(screenId, screen.current, source.files, source.links, source.kind, source.entry);
}

export function fakeRead(screenId: string) {
  const screen = screens.get(screenId);
  const version = screen?.versions.find((candidate) => candidate.id === screen.current);
  if (!screen || !version) return null;
  return {
    screenId, versionId: version.id, formFactor: screen.formFactor, legacy: false as const,
    source: { kind: version.kind, files: version.files, entry: version.entry }, links: version.links,
  };
}

export function fakeList(screenId: string) {
  const screen = screens.get(screenId);
  if (!screen) return null;
  return [...screen.versions].reverse().map((version) => ({ id: version.id, createdAt: version.createdAt, kind: version.kind }));
}
```

- [ ] **Step 4: Implement the actions**

`apps/web/src/features/design/canvas-screen-source.ts`:

```ts
"use server";

import { z } from "zod";
import { SCREEN_KINDS, ScreenFilesSchema, ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const Id = z.string().uuid();
const FormFactor = z.enum(["mobile", "tablet", "desktop"]);
const Links = z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)).max(100);
const SavedRow = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), versionId: Id }),
  z.object({ status: z.literal("conflict"), versionId: Id.nullable() }),
]);

export type CreateCanvasScreenResult = { status: "created"; screenId: string; versionId: string } | { status: "error" };
export type SaveScreenVersionResult = { status: "saved"; versionId: string } | { status: "conflict"; versionId: string | null } | { status: "error" };
export type ScreenVersionSummary = { id: string; createdAt: string; kind: "legacy" | ScreenKind };
export type LoadedScreenSource =
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: false; source: ScreenSource; links: string[] }
  | { screenId: string; versionId: string; formFactor: "mobile" | "tablet" | "desktop"; legacy: true };

function fail(operation: string, reason: unknown) {
  console.error(`canvas screen ${operation} failed:`, reason instanceof Error ? reason.message : reason);
}

export async function createCanvasScreen(input: {
  roomId: string; name: string; source: ScreenSource; formFactor: "mobile" | "tablet" | "desktop";
}): Promise<CreateCanvasScreenResult> {
  const roomId = Id.safeParse(input.roomId);
  const source = ScreenSourceSchema.safeParse(input.source);
  const formFactor = FormFactor.safeParse(input.formFactor);
  const name = z.string().trim().min(1).max(120).safeParse(input.name);
  if (!roomId.success || !source.success || !formFactor.success || !name.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeCreate } = await import("./canvas-screen-source-fake");
      return { status: "created", ...fakeCreate(roomId.data, source.data, formFactor.data) };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("create_canvas_screen", {
      target_room_id: roomId.data, screen_name: name.data, new_kind: source.data.kind,
      new_files: source.data.files, new_entry: source.data.entry, new_form_factor: formFactor.data,
    });
    if (error) { fail("create", error.message); return { status: "error" }; }
    const parsed = z.object({ screenId: Id, versionId: Id }).safeParse(data);
    return parsed.success ? { status: "created", ...parsed.data } : { status: "error" };
  } catch (thrown) {
    fail("create", thrown);
    return { status: "error" };
  }
}

export async function saveScreenVersion(input: {
  screenId: string; baseVersionId: string | null; files: Record<string, string>;
  links?: string[]; kind?: ScreenKind; entry?: string;
}): Promise<SaveScreenVersionResult> {
  const screenId = Id.safeParse(input.screenId);
  const base = Id.nullable().safeParse(input.baseVersionId);
  const files = ScreenFilesSchema.safeParse(input.files);
  const links = Links.safeParse(input.links ?? []);
  const kind = z.enum(SCREEN_KINDS).optional().safeParse(input.kind);
  if (!screenId.success || !base.success || !files.success || !links.success || !kind.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeSave } = await import("./canvas-screen-source-fake");
      return fakeSave(screenId.data, base.data, files.data, links.data, kind.data, input.entry) ?? { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("save_canvas_screen_version", {
      target_screen_id: screenId.data, base_version: base.data, new_files: files.data,
      new_links: links.data, new_kind: kind.data ?? null, new_entry: input.entry ?? null,
    });
    if (error) { fail("save", error.message); return { status: "error" }; }
    const parsed = SavedRow.safeParse(data);
    return parsed.success ? parsed.data : { status: "error" };
  } catch (thrown) {
    fail("save", thrown);
    return { status: "error" };
  }
}

export async function restoreScreenVersion(input: { screenId: string; versionId: string }): Promise<SaveScreenVersionResult> {
  const screenId = Id.safeParse(input.screenId);
  const versionId = Id.safeParse(input.versionId);
  if (!screenId.success || !versionId.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRestore } = await import("./canvas-screen-source-fake");
      return fakeRestore(screenId.data, versionId.data) ?? { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.rpc("restore_screen_version", {
      target_screen_id: screenId.data, target_version_id: versionId.data,
    });
    if (error) { fail("restore", error.message); return { status: "error" }; }
    const parsed = SavedRow.safeParse(data);
    return parsed.success ? parsed.data : { status: "error" };
  } catch (thrown) {
    fail("restore", thrown);
    return { status: "error" };
  }
}

export async function listScreenVersions(screenId: string): Promise<{ status: "ok"; versions: ScreenVersionSummary[] } | { status: "error" }> {
  const id = Id.safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeList } = await import("./canvas-screen-source-fake");
      const versions = fakeList(id.data);
      return versions ? { status: "ok", versions } : { status: "error" };
    }
    const client = await createClient(new Headers());
    const { data, error } = await client.from("design_screen_versions")
      .select("id, created_at, source_kind").eq("screen_id", id.data)
      .order("created_at", { ascending: false }).limit(50);
    if (error) { fail("list", error.message); return { status: "error" }; }
    const rows = z.array(z.object({ id: Id, created_at: z.string(), source_kind: z.enum(["legacy", ...SCREEN_KINDS]) })).safeParse(data);
    if (!rows.success) return { status: "error" };
    return { status: "ok", versions: rows.data.map((row) => ({ id: row.id, createdAt: row.created_at, kind: row.source_kind })) };
  } catch (thrown) {
    fail("list", thrown);
    return { status: "error" };
  }
}

export async function readScreenSource(screenId: string): Promise<{ status: "ok"; screen: LoadedScreenSource } | { status: "error" }> {
  const id = Id.safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRead } = await import("./canvas-screen-source-fake");
      const screen = fakeRead(id.data);
      return screen ? { status: "ok", screen } : { status: "error" };
    }
    const client = await createClient(new Headers());
    const screenRow = await client.from("design_screens")
      .select("id, current_version_id, form_factor").eq("id", id.data).is("deleted_at", null).maybeSingle();
    const screen = z.object({ id: Id, current_version_id: Id, form_factor: FormFactor }).safeParse(screenRow.data);
    if (screenRow.error || !screen.success) return { status: "error" };
    const versionRow = await client.from("design_screen_versions")
      .select("id, source_kind, files, entry, links").eq("id", screen.data.current_version_id).maybeSingle();
    const version = z.object({
      id: Id, source_kind: z.enum(["legacy", ...SCREEN_KINDS]), files: z.unknown(), entry: z.string().nullable(), links: z.array(z.string()),
    }).safeParse(versionRow.data);
    if (versionRow.error || !version.success) return { status: "error" };
    const base = { screenId: screen.data.id, versionId: version.data.id, formFactor: screen.data.form_factor };
    if (version.data.source_kind === "legacy") return { status: "ok", screen: { ...base, legacy: true } };
    const source = ScreenSourceSchema.safeParse({ kind: version.data.source_kind, files: version.data.files, entry: version.data.entry });
    if (!source.success) return { status: "error" };
    return { status: "ok", screen: { ...base, legacy: false, source: source.data, links: version.data.links } };
  } catch (thrown) {
    fail("read", thrown);
    return { status: "error" };
  }
}
```

Add `"@meld/screen-runtime": "workspace:*"` to `apps/web/package.json` dependencies, then run `pnpm install`.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/design/canvas-screen-source.test.ts && pnpm --filter @meld/web typecheck`
Expected: all tests PASS, typecheck clean

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/design/canvas-screen-source*.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(design): server actions for canvas screen sources and versions"
```

---

# Track B — `packages/screen-runtime`

### Task B1: Package scaffold + source schema

**Files:**
- Create: `packages/screen-runtime/package.json`, `tsconfig.json`, `eslint.config.mjs`
- Create: `packages/screen-runtime/src/source.ts`, `src/constants.ts`
- Test: `packages/screen-runtime/src/source.test.ts`

**Interfaces:**
- Produces from `@meld/screen-runtime/source`: `SCREEN_KINDS`, `ScreenKind`, `MAX_SCREEN_FILES = 20`, `MAX_SCREEN_SOURCE_BYTES = 262144`, `SCREEN_PATH`, `ScreenFilesSchema`, `ScreenSourceSchema` and `ScreenSource`.
- Produces from `@meld/screen-runtime` (`src/constants.ts`, re-exported by the index): `TAG_ATTRIBUTE = "data-orion-src"`, `STUCK_MESSAGE = "__ORION_STUCK__"`, `LOOP_BUDGET_MS = 1000`, `SUPPORTED_MODULES`, `MAX_SCREEN_LINKS = 100` and `SCREEN_KEY`.

- [ ] **Step 1: Scaffold the package**

`packages/screen-runtime/package.json`:

```json
{
  "name": "@meld/screen-runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./source": "./src/source.ts"
  },
  "scripts": {
    "build:runtime": "node scripts/build-runtime.mjs",
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@babel/standalone": "7.28.5",
    "parse5": "7.3.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@tailwindcss/browser": "4.1.17",
    "@types/babel__core": "7.20.5",
    "@types/babel__standalone": "7.1.9",
    "clsx": "2.1.1",
    "esbuild": "0.25.12",
    "eslint": "9.39.5",
    "lucide-react": "0.553.0",
    "react": "19.2.0",
    "react-dom": "19.2.0",
    "typescript": "5.9.3",
    "typescript-eslint": "8.65.0"
  }
}
```

Version pins: before committing, run `pnpm view <pkg> version` for each new package (`@babel/standalone`, `@tailwindcss/browser`, `@types/babel__core`, `@types/babel__standalone`, `clsx`, `esbuild`, `lucide-react`) and pin the current latest exact version within the major shown. For `react` / `react-dom`, use **the exact version `apps/web` already uses** (`grep '"react"' apps/web/package.json`).

Copy `packages/prototype/tsconfig.json` and `packages/prototype/eslint.config.mjs` unchanged. Then change the tsconfig `include` to `["src/**/*.ts", "runtime/**/*.ts"]` and add `"lib": ["ES2022", "DOM"]` to its `compilerOptions`.

- [ ] **Step 2: Write the failing test**

`packages/screen-runtime/src/source.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ScreenSourceSchema } from "./source";

const ok = { kind: "react", files: { "App.tsx": "export default () => null" }, entry: "App.tsx" };

describe("ScreenSourceSchema", () => {
  it("accepts a valid react source", () => {
    expect(ScreenSourceSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects an entry that is not a file", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, entry: "Main.tsx" }).success).toBe(false);
  });
  it("rejects paths that climb out", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, files: { "../x.tsx": "" }, entry: "../x.tsx" }).success).toBe(false);
  });
  it("rejects more than 20 files", () => {
    const files = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`f${index}.ts`, ""]));
    expect(ScreenSourceSchema.safeParse({ kind: "react", files, entry: "f0.ts" }).success).toBe(false);
  });
  it("rejects sources over 256 KB", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, files: { "App.tsx": "x".repeat(262_145) } }).success).toBe(false);
  });
  it("rejects unknown kinds", () => {
    expect(ScreenSourceSchema.safeParse({ ...ok, kind: "vue" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm install && pnpm --filter @meld/screen-runtime test`
Expected: FAIL with `Cannot find module './source'`

- [ ] **Step 4: Implement**

`packages/screen-runtime/src/source.ts`:

```ts
import { z } from "zod";

export const SCREEN_KINDS = ["html", "react"] as const;
export type ScreenKind = (typeof SCREEN_KINDS)[number];
export const MAX_SCREEN_FILES = 20;
export const MAX_SCREEN_SOURCE_BYTES = 262_144;
export const SCREEN_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]{0,119}$/;

const PathSchema = z.string().regex(SCREEN_PATH).refine((path) => !path.includes(".."), "Paths cannot contain ..");

export const ScreenFilesSchema = z
  .record(PathSchema, z.string())
  .refine((files) => {
    const count = Object.keys(files).length;
    return count >= 1 && count <= MAX_SCREEN_FILES;
  }, "A screen has 1 to 20 files")
  .refine(
    (files) => new TextEncoder().encode(JSON.stringify(files)).length <= MAX_SCREEN_SOURCE_BYTES,
    "A screen's files are at most 256 KB",
  );

export const ScreenSourceSchema = z
  .object({ kind: z.enum(SCREEN_KINDS), files: ScreenFilesSchema, entry: z.string() })
  .strict()
  .refine((source) => Object.hasOwn(source.files, source.entry), {
    message: "The entry must be one of the files",
    path: ["entry"],
  });

export type ScreenSource = z.infer<typeof ScreenSourceSchema>;
```

`packages/screen-runtime/src/constants.ts`:

```ts
export const TAG_ATTRIBUTE = "data-orion-src";
export const STUCK_MESSAGE = "__ORION_STUCK__";
export const LOOP_BUDGET_MS = 1000;
export const MAX_SCREEN_LINKS = 100;
export const SCREEN_KEY = /^[a-z][a-z0-9_-]{0,63}$/;
export const SUPPORTED_MODULES = [
  "react",
  "react/jsx-runtime",
  "react-dom",
  "react-dom/client",
  "lucide-react",
  "clsx",
] as const;
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @meld/screen-runtime test && pnpm --filter @meld/screen-runtime typecheck`
Expected: 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/screen-runtime pnpm-lock.yaml
git commit -m "feat(screen-runtime): package scaffold and screen source schema"
```

### Task B2: Loop guard plugin

**Files:**
- Create: `packages/screen-runtime/src/loop-guard.ts`
- Test: `packages/screen-runtime/src/loop-guard.test.ts`

**Interfaces:**
- Produces: `loopGuardPlugin(options?: { budgetMs?: number }): (api: { types: typeof BabelTypes }) => PluginObj`

- [ ] **Step 1: Write the failing test**

```ts
import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { STUCK_MESSAGE } from "./constants";
import { loopGuardPlugin } from "./loop-guard";

function guard(code: string, budgetMs = 20) {
  return transform(code, { plugins: [loopGuardPlugin({ budgetMs })] }).code!;
}

describe("loopGuardPlugin", () => {
  it("stops an endless while loop", () => {
    expect(() => new Function(guard("while (true) {}"))()).toThrow(STUCK_MESSAGE);
  });
  it("stops an endless for loop with a non-block body", () => {
    expect(() => new Function(guard("for (;;) void 0;"))()).toThrow(STUCK_MESSAGE);
  });
  it("stops an endless do-while", () => {
    expect(() => new Function(guard("do {} while (true);"))()).toThrow(STUCK_MESSAGE);
  });
  it("guards a loop in a non-block position", () => {
    expect(() => new Function(guard("if (true) while (true) {}"))()).toThrow(STUCK_MESSAGE);
  });
  it("keeps labels working", () => {
    const code = guard("let n = 0; outer: for (let i = 0; i < 3; i++) { for (;;) { n++; continue outer; } } return n;");
    expect(new Function(code)()).toBe(3);
  });
  it("leaves finite loops alone", () => {
    expect(new Function(guard("let s = 0; for (let i = 0; i < 1000; i++) s += i; return s;"))()).toBe(499500);
  });
  it("guards each loop once", () => {
    expect(guard("while (a) {}").match(/__ORION_STUCK__/g)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/loop-guard.test.ts`
Expected: FAIL with `Cannot find module './loop-guard'`

- [ ] **Step 3: Implement**

```ts
import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import { LOOP_BUDGET_MS, STUCK_MESSAGE } from "./constants";

type Loop = BabelTypes.WhileStatement | BabelTypes.DoWhileStatement | BabelTypes.ForStatement | BabelTypes.ForInStatement | BabelTypes.ForOfStatement;

// CodePen-style protection: every loop records when it started and throws once
// one synchronous run passes the budget. The runtime turns the error into the
// "This screen stopped responding" overlay.
export function loopGuardPlugin(options: { budgetMs?: number } = {}) {
  const budget = options.budgetMs ?? LOOP_BUDGET_MS;
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => {
    const guarded = new WeakSet<BabelTypes.Node>();
    const now = () => t.callExpression(t.memberExpression(t.identifier("Date"), t.identifier("now")), []);
    function guard(path: NodePath<Loop>) {
      if (guarded.has(path.node)) return;
      guarded.add(path.node);
      const started = path.scope.generateUidIdentifier("orionLoop");
      const check = t.ifStatement(
        t.binaryExpression(">", t.binaryExpression("-", now(), started), t.numericLiteral(budget)),
        t.throwStatement(t.newExpression(t.identifier("Error"), [t.stringLiteral(STUCK_MESSAGE)])),
      );
      const body = path.get("body") as NodePath<BabelTypes.Statement>;
      if (body.isBlockStatement()) body.unshiftContainer("body", check);
      else body.replaceWith(t.blockStatement([check, body.node]));
      const anchor = path.parentPath?.isLabeledStatement() ? path.parentPath : path;
      anchor.insertBefore(t.variableDeclaration("const", [t.variableDeclarator(started, now())]));
    }
    return {
      name: "orion-loop-guard",
      visitor: {
        WhileStatement: guard,
        DoWhileStatement: guard,
        ForStatement: guard,
        ForInStatement: guard,
        ForOfStatement: guard,
      },
    };
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/loop-guard.test.ts`
Expected: 7 PASS. If "guards each loop once" fails, the `WeakSet` check isn't reached after `replaceWith`. Make sure `guarded.add` runs before any mutation.

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/loop-guard*.ts
git commit -m "feat(screen-runtime): loop guard babel plugin"
```

### Task B3: Element tag plugin

**Files:**
- Create: `packages/screen-runtime/src/tag-elements.ts`
- Test: `packages/screen-runtime/src/tag-elements.test.ts`

**Interfaces:**
- Produces:
  - `tagElementsPlugin(file: string): (api: { types: typeof BabelTypes }) => PluginObj`, which adds `data-orion-src="<file>:<start>:<end>"` to host JSX elements
  - `parseTag(value: string): { file: string; start: number; end: number } | null`

- [ ] **Step 1: Write the failing test**

```ts
import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { parseTag, tagElementsPlugin } from "./tag-elements";

const source = `export default function App() {\n  return <main className="p-4"><Card /><h1>Hi</h1></main>;\n}`;

function tagged(code: string) {
  return transform(code, { filename: "App.tsx", plugins: [tagElementsPlugin("App.tsx")], parserOpts: { plugins: ["jsx", "typescript"] } }).code!;
}

describe("tagElementsPlugin", () => {
  it("tags host elements with their source range", () => {
    const out = tagged(source);
    const tags = [...out.matchAll(/data-orion-src="([^"]+)"/g)].map((match) => parseTag(match[1])!);
    expect(tags).toHaveLength(2);
    const h1 = tags.find((tag) => source.slice(tag.start, tag.end).startsWith("<h1"))!;
    expect(source.slice(h1.start, h1.end)).toBe("<h1>Hi</h1>");
    expect(h1.file).toBe("App.tsx");
  });
  it("does not tag components", () => {
    expect(tagged(source)).not.toMatch(/<Card[^>]*data-orion-src/);
  });
  it("parses tags with folders in the file name", () => {
    expect(parseTag("ui/Button.tsx:10:20")).toEqual({ file: "ui/Button.tsx", start: 10, end: 20 });
    expect(parseTag("nonsense")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/tag-elements.test.ts`
Expected: FAIL with `Cannot find module './tag-elements'`

- [ ] **Step 3: Implement**

```ts
import type { PluginObj, types as BabelTypes } from "@babel/core";
import { TAG_ATTRIBUTE } from "./constants";

// Live mode only: every host element remembers where it came from so the Tweak
// panel can edit the exact source. Plugins run before presets, so offsets are
// positions in the file as written.
export function tagElementsPlugin(file: string) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    name: "orion-tag-elements",
    visitor: {
      JSXOpeningElement(path) {
        const name = path.node.name;
        if (!t.isJSXIdentifier(name) || !/^[a-z]/.test(name.name)) return;
        const element = path.parentPath.node;
        if (element.start == null || element.end == null) return;
        const already = path.node.attributes.some((attribute) => t.isJSXAttribute(attribute) && attribute.name.name === TAG_ATTRIBUTE);
        if (already) return;
        path.node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(TAG_ATTRIBUTE), t.stringLiteral(`${file}:${element.start}:${element.end}`)),
        );
      },
    },
  });
}

export function parseTag(value: string): { file: string; start: number; end: number } | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (!match) return null;
  return { file: match[1], start: Number(match[2]), end: Number(match[3]) };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/tag-elements.test.ts`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/tag-elements*.ts
git commit -m "feat(screen-runtime): tag host elements with source ranges"
```

### Task B4: Module graph plugin

**Files:**
- Create: `packages/screen-runtime/src/module-graph.ts`
- Test: `packages/screen-runtime/src/module-graph.test.ts`

**Interfaces:**
- Produces:
  - `resolveScreenImport(from: string, specifier: string, files: Record<string, string>): string | null`
  - `moduleGraphPlugin(file: string, files: Record<string, string>, report: ModuleReport): (api) => PluginObj`
  - `type ModuleReport = { unsupported: Set<string>; missing: Set<string>; styles: Set<string>; dynamicImport: boolean }`
- Behaviour:
  - Bare imports outside `SUPPORTED_MODULES` are added to `unsupported`.
  - Relative imports are rewritten to the resolved file path, or added to `missing`.
  - A relative `.css` import is removed and its path is added to `styles`.
  - A dynamic `import()` sets `dynamicImport`.

- [ ] **Step 1: Write the failing test**

```ts
import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { moduleGraphPlugin, resolveScreenImport, type ModuleReport } from "./module-graph";

const files = {
  "App.tsx": "",
  "ui/Button.tsx": "",
  "ui/index.ts": "",
  "styles.css": "",
};

function run(code: string) {
  const report: ModuleReport = { unsupported: new Set(), missing: new Set(), styles: new Set(), dynamicImport: false };
  const out = transform(code, { filename: "App.tsx", plugins: [moduleGraphPlugin("App.tsx", files, report)], parserOpts: { plugins: ["jsx", "typescript"] } }).code!;
  return { out, report };
}

describe("resolveScreenImport", () => {
  it("resolves extensions and index files", () => {
    expect(resolveScreenImport("App.tsx", "./ui/Button", files)).toBe("ui/Button.tsx");
    expect(resolveScreenImport("App.tsx", "./ui", files)).toBe("ui/index.ts");
    expect(resolveScreenImport("ui/Button.tsx", "../styles.css", files)).toBe("styles.css");
    expect(resolveScreenImport("App.tsx", "./nope", files)).toBeNull();
  });
});

describe("moduleGraphPlugin", () => {
  it("rewrites relative imports to file paths", () => {
    const { out } = run(`import { Button } from "./ui/Button"; export { x } from "./ui";`);
    expect(out).toContain(`from "ui/Button.tsx"`);
    expect(out).toContain(`from "ui/index.ts"`);
  });
  it("reports unsupported packages", () => {
    const { report } = run(`import { motion } from "framer-motion"; import React from "react";`);
    expect([...report.unsupported]).toEqual(["framer-motion"]);
  });
  it("collects css imports and removes them", () => {
    const { out, report } = run(`import "./styles.css";`);
    expect([...report.styles]).toEqual(["styles.css"]);
    expect(out).not.toContain("styles.css");
  });
  it("reports missing relative files", () => {
    expect([...run(`import x from "./gone";`).report.missing]).toEqual(["./gone"]);
  });
  it("flags dynamic import", () => {
    expect(run(`const m = import("react");`).report.dynamicImport).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/module-graph.test.ts`
Expected: FAIL with `Cannot find module './module-graph'`

- [ ] **Step 3: Implement**

```ts
import type { NodePath, PluginObj, types as BabelTypes } from "@babel/core";
import { SUPPORTED_MODULES } from "./constants";

export type ModuleReport = { unsupported: Set<string>; missing: Set<string>; styles: Set<string>; dynamicImport: boolean };

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"];
const SUPPORTED = new Set<string>(SUPPORTED_MODULES);

function join(from: string, specifier: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const segment of specifier.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export function resolveScreenImport(from: string, specifier: string, files: Record<string, string>): string | null {
  const base = join(from, specifier);
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (Object.hasOwn(files, candidate)) return candidate;
  }
  return null;
}

export function moduleGraphPlugin(file: string, files: Record<string, string>, report: ModuleReport) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => {
    function visitSource(path: NodePath<BabelTypes.ImportDeclaration | BabelTypes.ExportNamedDeclaration | BabelTypes.ExportAllDeclaration>) {
      const source = path.node.source;
      if (!source) return;
      const specifier = source.value;
      if (!specifier.startsWith(".")) {
        if (!SUPPORTED.has(specifier)) report.unsupported.add(specifier);
        return;
      }
      const resolved = resolveScreenImport(file, specifier, files);
      if (!resolved) {
        report.missing.add(specifier);
        return;
      }
      if (resolved.endsWith(".css")) {
        report.styles.add(resolved);
        path.remove();
        return;
      }
      path.node.source = t.stringLiteral(resolved);
    }
    return {
      name: "orion-module-graph",
      visitor: {
        ImportDeclaration: visitSource,
        ExportNamedDeclaration: visitSource,
        ExportAllDeclaration: visitSource,
        Import() {
          report.dynamicImport = true;
        },
      },
    };
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/module-graph.test.ts`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/module-graph*.ts
git commit -m "feat(screen-runtime): resolve and validate screen imports"
```

### Task B5: Link extraction

**Files:**
- Create: `packages/screen-runtime/src/links.ts`
- Test: `packages/screen-runtime/src/links.test.ts`

**Interfaces:**
- Produces: `extractLinks(files: Record<string, string>): string[]`. It returns unique, sorted screen keys from `data-goto="key"` / `data-goto='key'` and `orion.goto("key")` / `orion.goto('key')`, capped at `MAX_SCREEN_LINKS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { extractLinks } from "./links";

describe("extractLinks", () => {
  it("finds data-goto and orion.goto targets", () => {
    expect(extractLinks({
      "App.tsx": `<button data-goto="settings"/> <a data-goto='profile'/> onClick={() => orion.goto("settings")} orion.goto( 'stats' )`,
      "index.html": `<button data-goto="home">`,
    })).toEqual(["home", "profile", "settings", "stats"]);
  });
  it("ignores invalid keys and dynamic targets", () => {
    expect(extractLinks({ "App.tsx": `orion.goto(name) <a data-goto="Bad Key">` })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/links.test.ts`
Expected: FAIL with `Cannot find module './links'`

- [ ] **Step 3: Implement**

```ts
import { MAX_SCREEN_LINKS, SCREEN_KEY } from "./constants";

const PATTERNS = [/data-goto=["']([^"']+)["']/g, /orion\.goto\(\s*["']([^"']+)["']\s*\)/g];

export function extractLinks(files: Record<string, string>): string[] {
  const keys = new Set<string>();
  for (const content of Object.values(files)) {
    for (const pattern of PATTERNS) {
      for (const match of content.matchAll(pattern)) if (SCREEN_KEY.test(match[1])) keys.add(match[1]);
    }
  }
  return [...keys].sort().slice(0, MAX_SCREEN_LINKS);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/links.test.ts`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/links*.ts
git commit -m "feat(screen-runtime): extract screen links"
```

### Task B6: Runtime loader and bridge sources

**Files:**
- Create: `packages/screen-runtime/src/runtime/loader.ts`, `src/runtime/bridge.ts`
- Test: `packages/screen-runtime/src/runtime/loader.test.ts`, `src/runtime/bridge.test.ts`

**Interfaces:**
- Produces:
  - `MODULE_LOADER_SOURCE: string`, which defines `window.__orionDefine(path, factory)` and `window.__orionMount(entry)`
  - `FRAME_BRIDGE_SOURCE: string`, which defines `window.__orionReport(error)` and `window.orion.goto(key)`. It posts `{source: "orion-frame", type: "ready" | "stuck" | "error" | "goto", ...}` to the parent.
  - `FRAME_MESSAGE_SOURCE = "orion-frame"`. It has the same value as the web app's constant, which stays the web's own until stage 2 swaps it.

- [ ] **Step 1: Write the failing tests**

`src/runtime/loader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MODULE_LOADER_SOURCE } from "./loader";

function sandbox(modules: Record<string, unknown>) {
  const window: Record<string, any> = { __orionModules: modules };
  const document = { getElementById: vi.fn(() => ({ id: "orion-root" })) };
  new Function("window", "document", MODULE_LOADER_SOURCE)(window, document);
  return { window, document };
}

describe("module loader", () => {
  it("requires defined files and supported modules", () => {
    const { window } = sandbox({ clsx: { __esModule: true, default: () => "joined" } });
    window.__orionDefine("util.ts", (require: any, module: any) => { module.exports = { value: require("clsx").default() }; });
    window.__orionDefine("App.tsx", (require: any, module: any, exports: any) => { exports.default = () => require("util.ts").value; });
    expect(window.__orionRequire("App.tsx").default()).toBe("joined");
  });

  it("mounts the default export with createRoot", () => {
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));
    const createElement = vi.fn((component) => ({ component }));
    const { window } = sandbox({ "react-dom/client": { createRoot }, react: { createElement } });
    const App = () => null;
    window.__orionDefine("App.tsx", (_r: any, _m: any, exports: any) => { exports.default = App; });
    window.__orionMount("App.tsx");
    expect(createRoot).toHaveBeenCalledWith({ id: "orion-root" }, expect.objectContaining({ onUncaughtError: expect.any(Function) }));
    expect(render).toHaveBeenCalledWith({ component: App });
  });

  it("explains a missing component", () => {
    const { window } = sandbox({});
    window.__orionDefine("App.tsx", () => {});
    expect(() => window.__orionMount("App.tsx")).toThrow("no default export or App component");
  });
});
```

`src/runtime/bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { FRAME_BRIDGE_SOURCE } from "./bridge";

function boot() {
  const posted: unknown[] = [];
  const listeners: Record<string, ((event: any) => void)[]> = {};
  const window: Record<string, any> = {
    parent: { postMessage: (message: unknown) => posted.push(message) },
    addEventListener: (type: string, listener: (event: any) => void) => { (listeners[type] ??= []).push(listener); },
  };
  const document = { addEventListener: vi.fn() };
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(window, document);
  return { window, posted, listeners };
}

describe("frame bridge", () => {
  it("reports a stuck loop as stuck", () => {
    const { window, posted } = boot();
    window.__orionReport(new Error("__ORION_STUCK__"));
    expect(posted).toContainEqual({ source: "orion-frame", type: "stuck" });
  });
  it("reports other errors with their message", () => {
    const { window, posted } = boot();
    window.__orionReport(new Error("boom"));
    expect(posted).toContainEqual({ source: "orion-frame", type: "error", message: "boom" });
  });
  it("sends goto for valid keys only", () => {
    const { window, posted } = boot();
    window.orion.goto("settings");
    window.orion.goto("Bad Key");
    expect(posted.filter((message: any) => message.type === "goto")).toEqual([{ source: "orion-frame", type: "goto", screenKey: "settings" }]);
  });
  it("turns uncaught window errors into reports", () => {
    const { posted, listeners } = boot();
    listeners.error[0]({ error: new Error("__ORION_STUCK__"), preventDefault: () => {} });
    expect(posted).toContainEqual({ source: "orion-frame", type: "stuck" });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/runtime`
Expected: FAIL with `Cannot find module './loader'` / `'./bridge'`

- [ ] **Step 3: Implement**

`src/runtime/loader.ts`:

```ts
// Runs inside the screen frame. A tiny CommonJS loader: compiled files register
// with __orionDefine; bare names come from the vendored runtime bundle.
export const MODULE_LOADER_SOURCE = `(function(){
var defs = {}, cache = {};
window.__orionDefine = function(path, factory){ defs[path] = factory; };
function req(path){
  var modules = window.__orionModules || {};
  if (Object.prototype.hasOwnProperty.call(modules, path)) return modules[path];
  if (cache[path]) return cache[path].exports;
  var factory = defs[path];
  if (!factory) throw new Error("Module not found: " + path);
  var module = { exports: {} };
  cache[path] = module;
  factory(req, module, module.exports);
  return module.exports;
}
window.__orionRequire = req;
window.__orionMount = function(entry){
  var exported = req(entry);
  var Component = exported["default"] || exported.App;
  if (!Component) throw new Error("The entry file has no default export or App component.");
  var modules = window.__orionModules;
  var report = function(error){ if (window.__orionReport) window.__orionReport(error); };
  modules["react-dom/client"].createRoot(document.getElementById("orion-root"), { onUncaughtError: report, onCaughtError: report })
    .render(modules.react.createElement(Component));
};
})();`;
```

`src/runtime/bridge.ts`:

```ts
import { STUCK_MESSAGE } from "../constants";

export const FRAME_MESSAGE_SOURCE = "orion-frame";

// Runs inside the screen frame, before any screen code. Everything the board
// learns about the screen arrives through these messages.
export const FRAME_BRIDGE_SOURCE = `(function(){
var post = function(message){ window.parent.postMessage(Object.assign({ source: "${FRAME_MESSAGE_SOURCE}" }, message), "*"); };
var KEY = /^[a-z][a-z0-9_-]{0,63}$/;
window.__orionReport = function(error){
  var message = error && error.message ? String(error.message) : String(error);
  if (message.indexOf("${STUCK_MESSAGE}") !== -1) post({ type: "stuck" });
  else post({ type: "error", message: message.slice(0, 500) });
};
window.orion = { goto: function(key){ key = String(key); if (KEY.test(key)) post({ type: "goto", screenKey: key }); } };
window.addEventListener("error", function(event){ event.preventDefault(); window.__orionReport(event.error || event.message); });
window.addEventListener("unhandledrejection", function(event){ event.preventDefault(); window.__orionReport(event.reason); });
document.addEventListener("click", function(event){
  var target = event.target && event.target.closest ? event.target.closest("[data-goto],a[href]") : null;
  if (!target) return;
  event.preventDefault();
  var key = target.getAttribute("data-goto");
  if (key) window.orion.goto(key);
}, true);
window.__orionReady = function(){ post({ type: "ready" }); };
})();`;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/runtime`
Expected: 7 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/runtime
git commit -m "feat(screen-runtime): in-frame module loader and bridge"
```

### Task B7: `compileScreen`

**Files:**
- Create: `packages/screen-runtime/src/compile.ts`
- Test: `packages/screen-runtime/src/compile.test.ts`

**Interfaces:**
- Consumes: B1–B5.
- Produces:

```ts
export type CompileError = { file: string; message: string };
export type CompiledScreen = { kind: ScreenKind; styles: string[]; script: string; html: string; links: string[] };
export type CompileResult = { ok: true; screen: CompiledScreen } | { ok: false; errors: CompileError[] };
export function compileScreen(source: ScreenSource, options: { tagElements: boolean; loopBudgetMs?: number }): CompileResult;
```

- **React:** `script` registers every JS/TS file with `__orionDefine` and then calls `__orionMount(entry)`. `html` is `<div id="orion-root"></div>`.
- **HTML:** `script` holds the loop-guarded inline scripts, joined. `html` is the entry's body markup with the inline scripts and styles removed (they move to `script` and `styles`), tagged when asked.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { compileScreen } from "./compile";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";

const react = {
  kind: "react" as const,
  entry: "App.tsx",
  files: {
    "App.tsx": `import { Button } from "./Button";\nimport "./app.css";\nexport default function App() { return <main><Button /></main>; }`,
    "Button.tsx": `import clsx from "clsx";\nexport function Button() { return <button className={clsx("a")}>Go</button>; }`,
    "app.css": `main { color: red }`,
  },
};

describe("compileScreen (react)", () => {
  it("compiles every file and mounts the entry", () => {
    const result = compileScreen(react, { tagElements: false });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.screen.script).toContain(`__orionDefine("App.tsx"`);
    expect(result.screen.script).toContain(`__orionDefine("Button.tsx"`);
    expect(result.screen.script).toContain(`__orionMount("App.tsx")`);
    expect(result.screen.styles).toEqual(["main { color: red }"]);
    expect(result.screen.script).not.toContain("data-orion-src");
  });

  it("runs end to end through the loader", () => {
    const result = compileScreen(react, { tagElements: false });
    if (!result.ok) throw new Error("compile failed");
    const rendered: unknown[] = [];
    const window: Record<string, any> = {
      __orionModules: {
        react: { __esModule: true, createElement: (type: unknown) => ({ type }) },
        "react/jsx-runtime": { __esModule: true, jsx: (type: unknown) => ({ type }), jsxs: (type: unknown) => ({ type }) },
        clsx: { __esModule: true, default: (value: string) => value },
        "react-dom/client": { createRoot: () => ({ render: (tree: unknown) => rendered.push(tree) }) },
      },
    };
    new Function("window", "document", `${MODULE_LOADER_SOURCE}\nwith (window) { ${result.screen.script} }`)(window, { getElementById: () => ({}) });
    expect(rendered).toHaveLength(1);
  });

  it("tags elements when asked", () => {
    const result = compileScreen(react, { tagElements: true });
    if (!result.ok) throw new Error("compile failed");
    expect(result.screen.script).toContain("App.tsx:");
    expect(result.screen.script).toContain("data-orion-src");
  });

  it("reports unsupported packages by name", () => {
    const result = compileScreen({ ...react, files: { ...react.files, "App.tsx": `import { motion } from "framer-motion";\nexport default () => null;` } }, { tagElements: false });
    expect(result).toEqual({ ok: false, errors: [{ file: "App.tsx", message: "Unsupported package: framer-motion" }] });
  });

  it("reports syntax errors with the file", () => {
    const result = compileScreen({ ...react, files: { ...react.files, "Button.tsx": "export function Button( {" } }, { tagElements: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].file).toBe("Button.tsx");
  });

  it("finds links", () => {
    const result = compileScreen({ ...react, files: { ...react.files, "Button.tsx": `export function Button() { return <button data-goto="settings">Go</button>; }` } }, { tagElements: false });
    if (!result.ok) throw new Error("compile failed");
    expect(result.screen.links).toEqual(["settings"]);
  });
});

describe("compileScreen (html)", () => {
  const html = {
    kind: "html" as const,
    entry: "index.html",
    files: { "index.html": `<!doctype html><html><head><style>h1{color:red}</style></head><body><h1>Hi</h1><script>while(true){}</script></body></html>` },
  };

  it("splits markup, styles and guarded scripts", () => {
    const result = compileScreen(html, { tagElements: false, loopBudgetMs: 5 });
    if (!result.ok) throw new Error("compile failed");
    expect(result.screen.html).toContain("<h1>Hi</h1>");
    expect(result.screen.html).not.toContain("<script");
    expect(result.screen.styles).toEqual(["h1{color:red}"]);
    expect(() => new Function(result.screen.script)()).toThrow("__ORION_STUCK__");
  });

  it("tags elements with source offsets", () => {
    const result = compileScreen(html, { tagElements: true });
    if (!result.ok) throw new Error("compile failed");
    const match = /<h1 data-orion-src="index.html:(\d+):(\d+)"/.exec(result.screen.html)!;
    expect(html.files["index.html"].slice(Number(match[1]), Number(match[2]))).toBe("<h1>Hi</h1>");
  });

  it("rejects external scripts and stylesheets", () => {
    const result = compileScreen({ ...html, files: { "index.html": `<script src="https://x.test/a.js"></script><link rel="stylesheet" href="a.css">` } }, { tagElements: false });
    expect(result).toEqual({ ok: false, errors: [
      { file: "index.html", message: "External scripts are not supported" },
      { file: "index.html", message: "External stylesheets are not supported" },
    ] });
  });
});
```

The end-to-end test uses `with (window)` because the compiled script calls the bare globals `__orionDefine` / `__orionMount`, exactly as it does in the frame.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/compile.test.ts`
Expected: FAIL with `Cannot find module './compile'`

- [ ] **Step 3: Implement**

```ts
import { transform } from "@babel/standalone";
import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { TAG_ATTRIBUTE } from "./constants";
import { extractLinks } from "./links";
import { loopGuardPlugin } from "./loop-guard";
import { moduleGraphPlugin, type ModuleReport } from "./module-graph";
import type { ScreenKind, ScreenSource } from "./source";
import { tagElementsPlugin } from "./tag-elements";

export type CompileError = { file: string; message: string };
export type CompiledScreen = { kind: ScreenKind; styles: string[]; script: string; html: string; links: string[] };
export type CompileResult = { ok: true; screen: CompiledScreen } | { ok: false; errors: CompileError[] };
type Options = { tagElements: boolean; loopBudgetMs?: number };

const SCRIPT_FILE = /\.(tsx|ts|jsx|js)$/;

function message(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

function compileReact(source: ScreenSource, options: Options): CompileResult {
  const errors: CompileError[] = [];
  const styles = new Set<string>();
  const modules: string[] = [];
  for (const [file, code] of Object.entries(source.files)) {
    if (!SCRIPT_FILE.test(file)) continue;
    const report: ModuleReport = { unsupported: new Set(), missing: new Set(), styles: new Set(), dynamicImport: false };
    try {
      // Pass 1: TS + JSX + Orion plugins, still ES modules. The automatic JSX
      // runtime adds its `react/jsx-runtime` import at Program exit, so the
      // CommonJS conversion must be a second pass or that import survives.
      const esm = transform(code, {
        filename: file,
        sourceType: "module",
        plugins: [
          loopGuardPlugin({ budgetMs: options.loopBudgetMs }),
          ...(options.tagElements ? [tagElementsPlugin(file)] : []),
          moduleGraphPlugin(file, source.files, report),
        ],
        presets: [["react", { runtime: "automatic" }], ["typescript", { isTSX: true, allExtensions: true }]],
      }).code ?? "";
      const output = transform(esm, { sourceType: "module", plugins: ["transform-modules-commonjs"] }).code ?? "";
      modules.push(`__orionDefine(${JSON.stringify(file)}, function(require, module, exports){\n${output}\n});`);
    } catch (error) {
      errors.push({ file, message: message(error) });
      continue;
    }
    for (const name of report.unsupported) errors.push({ file, message: `Unsupported package: ${name}` });
    for (const name of report.missing) errors.push({ file, message: `File not found: ${name}` });
    if (report.dynamicImport) errors.push({ file, message: "Dynamic import() is not supported" });
    for (const style of report.styles) styles.add(style);
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    screen: {
      kind: "react",
      styles: [...styles].map((file) => source.files[file]),
      script: `${modules.join("\n")}\n__orionMount(${JSON.stringify(source.entry)});`,
      html: `<div id="orion-root"></div>`,
      links: extractLinks(source.files),
    },
  };
}

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function text(element: Element): string {
  return element.childNodes.map((child) => ("value" in child ? String(child.value) : "")).join("");
}

function compileHtml(source: ScreenSource, options: Options): CompileResult {
  const file = source.entry;
  const document = parse(source.files[file], { sourceCodeLocationInfo: true });
  const errors: CompileError[] = [];
  const styles: string[] = [];
  const scripts: string[] = [];
  let body: Element | null = null;

  const walk = (parent: Node) => {
    if (!("childNodes" in parent)) return;
    for (const child of [...parent.childNodes]) {
      if (!isElement(child)) continue;
      if (child.tagName === "body") body = child;
      if (child.tagName === "script") {
        if (child.attrs.some((attr) => attr.name === "src")) errors.push({ file, message: "External scripts are not supported" });
        else scripts.push(text(child));
        parent.childNodes.splice(parent.childNodes.indexOf(child), 1);
        continue;
      }
      if (child.tagName === "link" && child.attrs.some((attr) => attr.name === "rel" && attr.value.includes("stylesheet"))) {
        errors.push({ file, message: "External stylesheets are not supported" });
        parent.childNodes.splice(parent.childNodes.indexOf(child), 1);
        continue;
      }
      if (child.tagName === "style") {
        styles.push(text(child));
        parent.childNodes.splice(parent.childNodes.indexOf(child), 1);
        continue;
      }
      const location = child.sourceCodeLocation;
      if (options.tagElements && location && !["html", "head", "body"].includes(child.tagName)) {
        child.attrs.push({ name: TAG_ATTRIBUTE, value: `${file}:${location.startOffset}:${location.endOffset}` });
      }
      walk(child);
    }
  };
  walk(document);
  if (errors.length) return { ok: false, errors };

  let script = "";
  try {
    script = scripts
      .map((code) => transform(code, { sourceType: "script", plugins: [loopGuardPlugin({ budgetMs: options.loopBudgetMs })] }).code ?? "")
      .join("\n;\n");
  } catch (error) {
    return { ok: false, errors: [{ file, message: message(error) }] };
  }
  const markup = body ? (body as Element).childNodes.map((node) => serialize({ nodeName: "#document-fragment", childNodes: [node] } as never)).join("") : "";
  return { ok: true, screen: { kind: "html", styles, script, html: markup, links: extractLinks(source.files) } };
}

export function compileScreen(source: ScreenSource, options: Options): CompileResult {
  return source.kind === "react" ? compileReact(source, options) : compileHtml(source, options);
}
```

If the `serialize({nodeName: "#document-fragment"…})` cast fails typecheck, use parse5's `serializeOuter(node)`, which is exported from parse5 7. Prefer it: `body.childNodes.map((node) => serializeOuter(node)).join("")`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/compile.test.ts && pnpm --filter @meld/screen-runtime typecheck`
Expected: 9 PASS, typecheck clean

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/compile*.ts
git commit -m "feat(screen-runtime): compile react and html screens"
```

### Task B8: Runtime bundle

**Files:**
- Create: `packages/screen-runtime/runtime/entry.ts`
- Create: `packages/screen-runtime/scripts/build-runtime.mjs`
- Create (generated, committed): `apps/web/public/screen-runtime/runtime.js`
- Test: `packages/screen-runtime/src/runtime-bundle.test.ts`

**Interfaces:**
- Produces: a static asset at `/screen-runtime/runtime.js`, which defines `window.__orionModules` with the `SUPPORTED_MODULES` keys and includes Tailwind's browser build. The first line is a comment: `/* orion-screen-runtime <hash> */`, where the hash is SHA-256 over the pinned versions of react, react-dom, lucide-react, clsx and @tailwindcss/browser.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPPORTED_MODULES } from "./constants";
// @ts-expect-error -- plain .mjs helper shared with the build script
import { runtimeStamp } from "../scripts/build-runtime.mjs";

const bundle = readFileSync(new URL("../../../apps/web/public/screen-runtime/runtime.js", import.meta.url), "utf8");

describe("runtime bundle", () => {
  it("is built from the pinned versions", () => {
    expect(bundle.split("\n")[0]).toBe(`/* orion-screen-runtime ${runtimeStamp()} */`);
  });
  it("exposes every supported module", () => {
    for (const name of SUPPORTED_MODULES) expect(bundle).toContain(JSON.stringify(name));
  });
  it("includes tailwind", () => {
    expect(bundle).toContain("tailwindcss");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/runtime-bundle.test.ts`
Expected: FAIL with `ENOENT … runtime.js`

- [ ] **Step 3: Implement the entry and build script**

`packages/screen-runtime/runtime/entry.ts`:

```ts
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as Lucide from "lucide-react";
import clsx from "clsx";

// Every module looks like an ES module to Babel's interop helpers, so both
// `import React from "react"` and `import { useState } from "react"` work.
const esm = (namespace: object, fallback?: unknown) => ({ __esModule: true, default: fallback ?? namespace, ...namespace });

(window as unknown as { __orionModules: Record<string, unknown> }).__orionModules = {
  "react": esm(React),
  "react/jsx-runtime": esm(jsxRuntime),
  "react-dom": esm(ReactDOM),
  "react-dom/client": esm(ReactDOMClient),
  "lucide-react": esm(Lucide),
  "clsx": esm({ clsx }, clsx),
};
```

`packages/screen-runtime/scripts/build-runtime.mjs`:

```js
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8"));
const PINNED = ["react", "react-dom", "lucide-react", "clsx", "@tailwindcss/browser"];

export function runtimeStamp() {
  const versions = PINNED.map((name) => `${name}@${pkg.devDependencies[name]}`).join(",");
  return createHash("sha256").update(versions).digest("hex").slice(0, 16);
}

async function build() {
  const { build: esbuild } = await import("esbuild");
  const result = await esbuild({
    entryPoints: [resolve(here, "../runtime/entry.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const require = createRequire(import.meta.url);
  const tailwind = readFileSync(require.resolve("@tailwindcss/browser"), "utf8");
  const out = resolve(here, "../../../apps/web/public/screen-runtime/runtime.js");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `/* orion-screen-runtime ${runtimeStamp()} */\n${result.outputFiles[0].text}\n/* tailwindcss browser */\n${tailwind}\n`);
  console.log(`wrote ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
```

- [ ] **Step 4: Build and run the test**

Run: `pnpm --filter @meld/screen-runtime build:runtime && pnpm --filter @meld/screen-runtime exec vitest run src/runtime-bundle.test.ts`
Expected: `wrote …/runtime.js`, then 3 PASS. If `require.resolve("@tailwindcss/browser")` doesn't point at the browser IIFE, use the path of its `dist/index.global.js` instead (check `node_modules/@tailwindcss/browser/package.json` → `"browser"`/`"main"`).

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/runtime packages/screen-runtime/scripts packages/screen-runtime/src/runtime-bundle.test.ts apps/web/public/screen-runtime/runtime.js
git commit -m "feat(screen-runtime): vendored runtime bundle for live screens"
```

### Task B9: `assembleScreenDocument` + index

**Files:**
- Create: `packages/screen-runtime/src/document.ts`, `src/index.ts`
- Test: `packages/screen-runtime/src/document.test.ts`

**Interfaces:**
- Produces:
  - `assembleScreenDocument(screen: CompiledScreen, env: { csp: string; runtimeBundle: string }): string`
  - `inlineScript(js: string): string`, which escapes `</script`

  The index re-exports `compileScreen`, the B7 types, `assembleScreenDocument`, `parseTag`, `extractLinks`, `resolveScreenImport`, `FRAME_MESSAGE_SOURCE` and every constant in `constants.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assembleScreenDocument, inlineScript } from "./document";

const screen = { kind: "react" as const, styles: ["main{color:red}"], script: `__orionMount("App.tsx");`, html: `<div id="orion-root"></div>`, links: [] };

describe("assembleScreenDocument", () => {
  it("puts the CSP first, then runtime, bridge, loader, markup, script", () => {
    const doc = assembleScreenDocument(screen, { csp: "default-src 'none'", runtimeBundle: "/*RUNTIME*/" });
    expect(doc.startsWith(`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'">`)).toBe(true);
    const order = ["/*RUNTIME*/", "__orionReport", "__orionDefine = function", `<div id="orion-root">`, `__orionMount("App.tsx")`, "__orionReady()"]
      .map((marker) => doc.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(doc).toContain("<style>main{color:red}</style>");
  });
  it("escapes closing script tags inside code", () => {
    expect(inlineScript(`const s = "</script>";`)).toBe(`const s = "<\\/script>";`);
  });
  it("wraps the screen script so a thrown error is reported", () => {
    const doc = assembleScreenDocument(screen, { csp: "x", runtimeBundle: "" });
    expect(doc).toContain("try{");
    expect(doc).toContain("catch(error){window.__orionReport(error)}");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/screen-runtime exec vitest run src/document.test.ts`
Expected: FAIL with `Cannot find module './document'`

- [ ] **Step 3: Implement**

`src/document.ts`:

```ts
import type { CompiledScreen } from "./compile";
import { FRAME_BRIDGE_SOURCE } from "./runtime/bridge";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";

export function inlineScript(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// The CSP meta comes first so nothing runs before it. The caller supplies the
// CSP (the web app's FRAME_CSP) and the runtime bundle text.
export function assembleScreenDocument(screen: CompiledScreen, env: { csp: string; runtimeBundle: string }): string {
  const styles = screen.styles.map((css) => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`).join("");
  return [
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${escapeAttribute(env.csp)}">`,
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<style>html,body{margin:0}</style>${styles}`,
    `<script>${inlineScript(env.runtimeBundle)}</script>`,
    `<script>${inlineScript(FRAME_BRIDGE_SOURCE)}</script>`,
    `<script>${inlineScript(MODULE_LOADER_SOURCE)}</script>`,
    `<body>${screen.html}`,
    `<script>try{${inlineScript(screen.script)}\nwindow.__orionReady()}catch(error){window.__orionReport(error)}</script>`,
    `</body>`,
  ].join("");
}
```

`src/index.ts`:

```ts
export * from "./constants";
export { compileScreen, type CompileError, type CompiledScreen, type CompileResult } from "./compile";
export { assembleScreenDocument, inlineScript } from "./document";
export { extractLinks } from "./links";
export { resolveScreenImport } from "./module-graph";
export { FRAME_MESSAGE_SOURCE } from "./runtime/bridge";
export { parseTag } from "./tag-elements";
```

- [ ] **Step 4: Run the whole package**

Run: `pnpm --filter @meld/screen-runtime test && pnpm --filter @meld/screen-runtime typecheck && pnpm --filter @meld/screen-runtime lint`
Expected: every test PASS, typecheck and lint clean

- [ ] **Step 5: Commit**

```bash
git add packages/screen-runtime/src/document*.ts packages/screen-runtime/src/index.ts
git commit -m "feat(screen-runtime): assemble the live screen document"
```

---

# Track C — Orion board chrome

### Task C1: Tool model + icons

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/tools.ts`, `chrome/tool-icons.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/chrome/tools.test.ts`

**Interfaces:**
- Produces:

```ts
export type DockTool = "select" | "hand" | "frame" | "pen" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";
export const DOCK_TOOLS: readonly { tool: DockTool; label: string; shortcut: string }[];
export function excalidrawToolFor(tool: DockTool): "selection" | "hand" | "frame" | "freedraw" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";
export function dockToolFor(excalidrawType: string): DockTool | null;
export const TOOL_ICONS: Record<DockTool | "code", ComponentType<SVGProps<SVGSVGElement>>>;
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DOCK_TOOLS, dockToolFor, excalidrawToolFor } from "./tools";

describe("dock tools", () => {
  it("lists the dock in order", () => {
    expect(DOCK_TOOLS.map((entry) => entry.tool)).toEqual(["select", "hand", "frame", "pen", "rectangle", "ellipse", "arrow", "text", "image", "eraser"]);
  });
  it("maps to and from Excalidraw tool types", () => {
    for (const { tool } of DOCK_TOOLS) expect(dockToolFor(excalidrawToolFor(tool))).toBe(tool);
    expect(excalidrawToolFor("pen")).toBe("freedraw");
    expect(dockToolFor("laser")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/tools.test.ts`
Expected: FAIL with `Cannot find module './tools'`

- [ ] **Step 3: Implement**

`chrome/tools.ts`:

```ts
export type DockTool = "select" | "hand" | "frame" | "pen" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";
type ExcalidrawTool = "selection" | "hand" | "frame" | "freedraw" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";

export const DOCK_TOOLS: readonly { tool: DockTool; label: string; shortcut: string }[] = [
  { tool: "select", label: "Select", shortcut: "V" },
  { tool: "hand", label: "Hand", shortcut: "H" },
  { tool: "frame", label: "Frame", shortcut: "F" },
  { tool: "pen", label: "Pen", shortcut: "P" },
  { tool: "rectangle", label: "Rectangle", shortcut: "R" },
  { tool: "ellipse", label: "Ellipse", shortcut: "O" },
  { tool: "arrow", label: "Arrow", shortcut: "A" },
  { tool: "text", label: "Text", shortcut: "T" },
  { tool: "image", label: "Image", shortcut: "9" },
  { tool: "eraser", label: "Eraser", shortcut: "E" },
];

const TO_EXCALIDRAW: Record<DockTool, ExcalidrawTool> = {
  select: "selection", hand: "hand", frame: "frame", pen: "freedraw", rectangle: "rectangle",
  ellipse: "ellipse", arrow: "arrow", text: "text", image: "image", eraser: "eraser",
};

export function excalidrawToolFor(tool: DockTool): ExcalidrawTool {
  return TO_EXCALIDRAW[tool];
}

export function dockToolFor(excalidrawType: string): DockTool | null {
  const match = (Object.entries(TO_EXCALIDRAW) as [DockTool, ExcalidrawTool][]).find(([, type]) => type === excalidrawType);
  return match ? match[0] : null;
}
```

`chrome/tool-icons.tsx` uses stroke-only line icons that inherit `currentColor`. These are the same shapes as the approved mockup:

```tsx
import type { ComponentType, SVGProps } from "react";
import type { DockTool } from "./tools";

function lineIcon(displayName: string, paths: React.ReactNode) {
  const Icon = (props: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {paths}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

export const TOOL_ICONS: Record<DockTool | "code", ComponentType<SVGProps<SVGSVGElement>>> = {
  select: lineIcon("SelectIcon", <path d="M5 3l14 8-6 2-3 6z" />),
  hand: lineIcon("HandIcon", <path d="M8 13V5a2 2 0 0 1 4 0v6m0-1V4a2 2 0 0 1 4 0v7m0-3a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3l-3-5a2 2 0 0 1 3-2l2 2" />),
  frame: lineIcon("FrameIcon", <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />),
  pen: lineIcon("PenIcon", <path d="M4 20c4-1 5-6 8-9s6-5 8-7M14 6l4 4" />),
  rectangle: lineIcon("RectangleIcon", <rect x="4" y="5" width="16" height="14" rx="2" />),
  ellipse: lineIcon("EllipseIcon", <ellipse cx="12" cy="12" rx="8" ry="7" />),
  arrow: lineIcon("ArrowIcon", <path d="M5 19L19 5M10 5h9v9" />),
  text: lineIcon("TextIcon", <path d="M5 5h14M12 5v14M9 19h6" />),
  image: lineIcon("ImageIcon", <><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></>),
  eraser: lineIcon("EraserIcon", <path d="M7 20h11M4 15l9-9 6 6-7 7H8z" />),
  code: lineIcon("CodeIcon", <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />),
};
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/tools.test.ts`
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/chrome/tools*.ts apps/web/src/features/canvas-excalidraw/chrome/tool-icons.tsx
git commit -m "feat(canvas): dock tool model and icons"
```

### Task C2: Side dock component

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/canvas-dock.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/chrome/canvas-dock.test.tsx`

**Interfaces:**
- Consumes: C1.
- Produces: `CanvasDock({ activeTool, onSelectTool, onCode, isDisabled }: { activeTool: DockTool | null; onSelectTool: (tool: DockTool) => void; onCode?: () => void; isDisabled?: boolean })`. The Code button renders only when `onCode` is given. Stage 2 supplies it.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CanvasDock } from "./canvas-dock";

describe("CanvasDock", () => {
  it("marks the active tool and reports a new choice", async () => {
    const onSelectTool = vi.fn();
    render(<CanvasDock activeTool="select" onSelectTool={onSelectTool} />);
    expect(screen.getByRole("radio", { name: "Select" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Pen" }));
    expect(onSelectTool).toHaveBeenCalledWith("pen");
  });
  it("hides Code until it is wired", () => {
    render(<CanvasDock activeTool={null} onSelectTool={() => {}} />);
    expect(screen.queryByRole("button", { name: "Code" })).toBeNull();
  });
  it("shows Code when wired", async () => {
    const onCode = vi.fn();
    render(<CanvasDock activeTool={null} onSelectTool={() => {}} onCode={onCode} />);
    await userEvent.click(screen.getByRole("button", { name: "Code" }));
    expect(onCode).toHaveBeenCalled();
  });
});
```

If `ToggleButtonGroup` renders `role="button"` + `aria-pressed` instead of radios, change the queries to `getByRole("button", { name: "Select" })` and `toHaveAttribute("aria-pressed", "true")`. First check the group's rendered markup with `screen.debug()` once.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/canvas-dock.test.tsx`
Expected: FAIL with `Cannot find module './canvas-dock'`

- [ ] **Step 3: Implement**

```tsx
"use client";

import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton, ToggleButtonGroup } from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import { TOOL_ICONS } from "./tool-icons";
import { DOCK_TOOLS, type DockTool } from "./tools";

// Orion's tool column down the left edge of the board. It drives Excalidraw
// through the imperative API; Excalidraw's own toolbar is hidden.
export function CanvasDock({ activeTool, onSelectTool, onCode, isDisabled }: {
  activeTool: DockTool | null;
  onSelectTool: (tool: DockTool) => void;
  onCode?: () => void;
  isDisabled?: boolean;
}) {
  const CodeIcon = TOOL_ICONS.code;
  return (
    <Card
      padding={1}
      data-testid="canvas-dock"
      style={{ position: "absolute", insetInlineStart: "var(--spacing-3)", top: "50%", transform: "translateY(-50%)", zIndex: 5 }}
    >
      <VStack gap={1} align="center">
        <ToggleButtonGroup
          label="Canvas tools"
          orientation="vertical"
          size="sm"
          value={activeTool}
          isDisabled={isDisabled}
          onChange={(value) => { if (typeof value === "string") onSelectTool(value as DockTool); }}
        >
          {DOCK_TOOLS.map(({ tool, label, shortcut }) => {
            const Icon = TOOL_ICONS[tool];
            return <ToggleButton key={tool} value={tool} label={label} tooltip={`${label} · ${shortcut}`} isIconOnly icon={<Icon width="1em" height="1em" />} />;
          })}
        </ToggleButtonGroup>
        {onCode ? (
          <>
            <Divider />
            <IconButton label="Code" tooltip="Paste code or start a screen" variant="ghost" size="sm" icon={<CodeIcon width="1em" height="1em" />} onClick={onCode} isDisabled={isDisabled} />
          </>
        ) : null}
      </VStack>
    </Card>
  );
}
```

Check `Divider` and `Card` accept `style` and `data-testid` with `pnpm exec astryx component Divider` / `Card`. If `Card` doesn't forward `style`, wrap it in `VStack` with that style and keep the `Card` inside.

- [ ] **Step 4: Run the tests and the Astryx check**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/canvas-dock.test.tsx && pnpm check:astryx`
Expected: 3 PASS, Astryx check clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/chrome/canvas-dock*.tsx
git commit -m "feat(canvas): Orion side dock"
```

### Task C3: Zoom model + control

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/zoom.ts`, `chrome/zoom-control.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/chrome/zoom.test.ts`

**Interfaces:**
- Produces:
  - `type Viewport = { scrollX: number; scrollY: number; zoom: number; width: number; height: number }`
  - `zoomAroundCenter(view: Viewport, nextZoom: number): { scrollX: number; scrollY: number; zoom: number }`. The result is clamped to 0.1–30.
  - `stepZoom(zoom: number, direction: 1 | -1): number`, which multiplies or divides by 1.25.
  - `ZoomControl({ view, onZoom }: { view: Viewport; onZoom: (next: { scrollX; scrollY; zoom }) => void })`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { stepZoom, zoomAroundCenter } from "./zoom";

// Excalidraw maps scene → viewport as (scene + scroll) * zoom.
const toViewport = (scene: number, scroll: number, zoom: number) => (scene + scroll) * zoom;

describe("zoomAroundCenter", () => {
  it("keeps the scene point under the viewport centre fixed", () => {
    const view = { scrollX: 40, scrollY: -10, zoom: 1, width: 800, height: 600 };
    const next = zoomAroundCenter(view, 2);
    const centreSceneX = view.width / 2 / view.zoom - view.scrollX;
    const centreSceneY = view.height / 2 / view.zoom - view.scrollY;
    expect(toViewport(centreSceneX, next.scrollX, next.zoom)).toBeCloseTo(400);
    expect(toViewport(centreSceneY, next.scrollY, next.zoom)).toBeCloseTo(300);
  });
  it("clamps the zoom", () => {
    expect(zoomAroundCenter({ scrollX: 0, scrollY: 0, zoom: 1, width: 10, height: 10 }, 100).zoom).toBe(30);
    expect(zoomAroundCenter({ scrollX: 0, scrollY: 0, zoom: 1, width: 10, height: 10 }, 0.01).zoom).toBe(0.1);
  });
});

describe("stepZoom", () => {
  it("steps by 25%", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1.25, -1)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/zoom.test.ts`
Expected: FAIL with `Cannot find module './zoom'`

- [ ] **Step 3: Implement**

`chrome/zoom.ts`:

```ts
export type Viewport = { scrollX: number; scrollY: number; zoom: number; width: number; height: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

export function zoomAroundCenter(view: Viewport, nextZoom: number) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const halfWidth = view.width / 2;
  const halfHeight = view.height / 2;
  return {
    zoom,
    scrollX: view.scrollX + halfWidth * (1 / zoom - 1 / view.zoom),
    scrollY: view.scrollY + halfHeight * (1 / zoom - 1 / view.zoom),
  };
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return Math.round((direction === 1 ? zoom * 1.25 : zoom / 1.25) * 1000) / 1000;
}
```

`chrome/zoom-control.tsx`:

```tsx
"use client";

import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { stepZoom, zoomAroundCenter, type Viewport } from "./zoom";

const Minus = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 12h12" /></svg>;
const Plus = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M6 12h12M12 6v12" /></svg>;

export function ZoomControl({ view, onZoom }: { view: Viewport; onZoom: (next: { scrollX: number; scrollY: number; zoom: number }) => void }) {
  return (
    <Card padding={0.5} style={{ position: "absolute", insetInlineEnd: "var(--spacing-3)", bottom: "var(--spacing-3)", zIndex: 5 }}>
      <HStack gap={1} align="center">
        <IconButton label="Zoom out" variant="ghost" size="sm" icon={<Minus />} onClick={() => onZoom(zoomAroundCenter(view, stepZoom(view.zoom, -1)))} />
        <Text type="label" aria-live="polite">{Math.round(view.zoom * 100)}%</Text>
        <IconButton label="Zoom in" variant="ghost" size="sm" icon={<Plus />} onClick={() => onZoom(zoomAroundCenter(view, stepZoom(view.zoom, 1)))} />
      </HStack>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/zoom.test.ts && pnpm check:astryx`
Expected: 3 PASS, Astryx check clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/chrome/zoom*.ts apps/web/src/features/canvas-excalidraw/chrome/zoom-control.tsx
git commit -m "feat(canvas): zoom control that zooms around the centre"
```

### Task C4: Selection model

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/selection.ts`
- Test: `apps/web/src/features/canvas-excalidraw/chrome/selection.test.ts`

**Interfaces:**
- Produces:

```ts
export type SelectionKind = "shape" | "text" | "screen";
export type SelectionSummary = { kind: SelectionKind; ids: string[]; bounds: { x: number; y: number; width: number; height: number }; screenId: string | null };
export function describeSelection(elements: readonly SelectableElement[], selectedIds: Readonly<Record<string, true | boolean>>): SelectionSummary | null;
export function sceneToContainer(point: { x: number; y: number }, view: { scrollX: number; scrollY: number; zoom: number }): { x: number; y: number };
type SelectableElement = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };
```

- Rules:
  - A single selected `embeddable` whose link is an Orion screen link gives `screen`, with `screenId` from `screenIdFromLink`.
  - If every selected element is `text`, the kind is `text`.
  - Anything else is `shape`.
  - Deleted elements are ignored.
  - Bounds are the union box.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { frameLink } from "../frame-link";
import { describeSelection, sceneToContainer } from "./selection";

const rect = { id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 50 };
const label = { id: "t", type: "text", x: 0, y: 0, width: 40, height: 10 };
const screen = { id: "s", type: "embeddable", x: 200, y: 0, width: 390, height: 844, link: frameLink("ds-abc") };

describe("describeSelection", () => {
  it("returns null with nothing selected", () => {
    expect(describeSelection([rect], {})).toBeNull();
  });
  it("recognises a single screen", () => {
    expect(describeSelection([screen], { s: true })).toMatchObject({ kind: "screen", screenId: "ds-abc", ids: ["s"] });
  });
  it("recognises text-only selections", () => {
    expect(describeSelection([label], { t: true })?.kind).toBe("text");
  });
  it("treats mixed selections as shapes with a union box", () => {
    expect(describeSelection([rect, label], { r: true, t: true })).toEqual({
      kind: "shape", ids: ["r", "t"], screenId: null, bounds: { x: 0, y: 0, width: 110, height: 70 },
    });
  });
  it("ignores deleted elements", () => {
    expect(describeSelection([{ ...rect, isDeleted: true }], { r: true })).toBeNull();
  });
});

describe("sceneToContainer", () => {
  it("applies scroll then zoom", () => {
    expect(sceneToContainer({ x: 10, y: 20 }, { scrollX: 5, scrollY: -5, zoom: 2 })).toEqual({ x: 30, y: 30 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/selection.test.ts`
Expected: FAIL with `Cannot find module './selection'`

- [ ] **Step 3: Implement**

```ts
import { isFrameLink, screenIdFromLink } from "../frame-link";

type SelectableElement = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };
export type SelectionKind = "shape" | "text" | "screen";
export type SelectionSummary = { kind: SelectionKind; ids: string[]; bounds: { x: number; y: number; width: number; height: number }; screenId: string | null };

export function describeSelection(
  elements: readonly SelectableElement[],
  selectedIds: Readonly<Record<string, true | boolean>>,
): SelectionSummary | null {
  const selected = elements.filter((element) => selectedIds[element.id] && !element.isDeleted);
  if (selected.length === 0) return null;
  const left = Math.min(...selected.map((element) => element.x));
  const top = Math.min(...selected.map((element) => element.y));
  const right = Math.max(...selected.map((element) => element.x + element.width));
  const bottom = Math.max(...selected.map((element) => element.y + element.height));
  const bounds = { x: left, y: top, width: right - left, height: bottom - top };
  const ids = selected.map((element) => element.id);
  const only = selected.length === 1 ? selected[0] : null;
  if (only?.type === "embeddable" && only.link && isFrameLink(only.link)) {
    return { kind: "screen", ids, bounds, screenId: screenIdFromLink(only.link) };
  }
  const kind: SelectionKind = selected.every((element) => element.type === "text") ? "text" : "shape";
  return { kind, ids, bounds, screenId: null };
}

export function sceneToContainer(point: { x: number; y: number }, view: { scrollX: number; scrollY: number; zoom: number }) {
  return { x: (point.x + view.scrollX) * view.zoom, y: (point.y + view.scrollY) * view.zoom };
}
```

Check that `frame-link.ts` exports `frameLink`, `isFrameLink` and `screenIdFromLink` (it does, at 17 lines). If `screenIdFromLink` returns `string | null`, the type is already right.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/selection.test.ts`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/chrome/selection*.ts
git commit -m "feat(canvas): describe the current selection"
```

### Task C5: Selection pill

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/selection-pill.tsx`
- Test: `apps/web/src/features/canvas-excalidraw/chrome/selection-pill.test.tsx`

**Interfaces:**
- Consumes: C4.
- Produces:

```tsx
export type PillSwatch = { label: string; color: string };
export type ScreenAction = { label: string; onPress: () => void };
export function SelectionPill(props: {
  selection: SelectionSummary;
  view: { scrollX: number; scrollY: number; zoom: number };
  swatches: readonly PillSwatch[];
  onStroke: (color: string) => void;
  onStrokeWidth: (width: 1 | 4) => void;
  onFontSize: (size: 16 | 20 | 28) => void;
  screenActions?: readonly ScreenAction[];   // stage 2+ (Open live, Code, Add to chat)
  shapeActions?: readonly ScreenAction[];    // stage 4 (Add to chat)
}): JSX.Element | null;
```

- What it shows:
  - **shape:** colour swatches, Thin/Bold and `shapeActions`
  - **text:** colour swatches, S/M/L and `shapeActions`
  - **screen:** `screenActions` only. It returns `null` when there are none.
- Position: centred under the bounds, `var(--spacing-2)` below.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectionPill } from "./selection-pill";

const view = { scrollX: 0, scrollY: 0, zoom: 1 };
const swatches = [{ label: "Ink", color: "#111111" }, { label: "Accent", color: "#00e1f3" }];
const base = { view, swatches, onStroke: vi.fn(), onStrokeWidth: vi.fn(), onFontSize: vi.fn() };

describe("SelectionPill", () => {
  it("offers colour and stroke for shapes", async () => {
    const onStroke = vi.fn();
    const onStrokeWidth = vi.fn();
    render(<SelectionPill {...base} onStroke={onStroke} onStrokeWidth={onStrokeWidth}
      selection={{ kind: "shape", ids: ["r"], screenId: null, bounds: { x: 0, y: 0, width: 100, height: 50 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Accent" }));
    expect(onStroke).toHaveBeenCalledWith("#00e1f3");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onStrokeWidth).toHaveBeenCalledWith(4);
    expect(screen.queryByRole("button", { name: "L" })).toBeNull();
  });
  it("offers text sizes for text", async () => {
    const onFontSize = vi.fn();
    render(<SelectionPill {...base} onFontSize={onFontSize}
      selection={{ kind: "text", ids: ["t"], screenId: null, bounds: { x: 0, y: 0, width: 40, height: 10 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Large text" }));
    expect(onFontSize).toHaveBeenCalledWith(28);
  });
  it("shows only screen actions for screens and hides when there are none", async () => {
    const open = vi.fn();
    const { rerender } = render(<SelectionPill {...base} screenActions={[{ label: "Open live", onPress: open }]}
      selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 390, height: 844 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Open live" }));
    expect(open).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accent" })).toBeNull();
    rerender(<SelectionPill {...base} selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 1, height: 1 } }} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/selection-pill.test.tsx`
Expected: FAIL with `Cannot find module './selection-pill'`

- [ ] **Step 3: Implement**

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { sceneToContainer, type SelectionSummary } from "./selection";

export type PillSwatch = { label: string; color: string };
export type ScreenAction = { label: string; onPress: () => void };

function Swatch({ color }: { color: string }) {
  return <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden><circle cx="8" cy="8" r="6" fill={color} /></svg>;
}

export function SelectionPill({ selection, view, swatches, onStroke, onStrokeWidth, onFontSize, screenActions = [], shapeActions = [] }: {
  selection: SelectionSummary;
  view: { scrollX: number; scrollY: number; zoom: number };
  swatches: readonly PillSwatch[];
  onStroke: (color: string) => void;
  onStrokeWidth: (width: 1 | 4) => void;
  onFontSize: (size: 16 | 20 | 28) => void;
  screenActions?: readonly ScreenAction[];
  shapeActions?: readonly ScreenAction[];
}) {
  if (selection.kind === "screen" && screenActions.length === 0) return null;
  const anchor = sceneToContainer({ x: selection.bounds.x + selection.bounds.width / 2, y: selection.bounds.y + selection.bounds.height }, view);
  const actions = selection.kind === "screen" ? screenActions : shapeActions;
  return (
    <Card
      padding={0.5}
      data-testid="selection-pill"
      style={{
        position: "absolute", left: 0, top: 0, zIndex: 6,
        transform: `translate(calc(${anchor.x}px - 50%), calc(${anchor.y}px + var(--spacing-2)))`,
      }}
    >
      <HStack gap={1} align="center">
        {selection.kind !== "screen" ? (
          <>
            {swatches.map((swatch) => (
              <IconButton key={swatch.label} label={swatch.label} tooltip={swatch.label} variant="ghost" size="sm" icon={<Swatch color={swatch.color} />} onClick={() => onStroke(swatch.color)} />
            ))}
            <Divider orientation="vertical" />
          </>
        ) : null}
        {selection.kind === "shape" ? (
          <>
            <Button label="Thin" size="sm" variant="ghost" onClick={() => onStrokeWidth(1)} />
            <Button label="Bold" size="sm" variant="ghost" onClick={() => onStrokeWidth(4)} />
          </>
        ) : null}
        {selection.kind === "text" ? (
          <>
            <IconButton label="Small text" tooltip="Small" variant="ghost" size="sm" icon={<>S</>} onClick={() => onFontSize(16)} />
            <IconButton label="Medium text" tooltip="Medium" variant="ghost" size="sm" icon={<>M</>} onClick={() => onFontSize(20)} />
            <IconButton label="Large text" tooltip="Large" variant="ghost" size="sm" icon={<>L</>} onClick={() => onFontSize(28)} />
          </>
        ) : null}
        {actions.map((action) => (
          <Button key={action.label} label={action.label} size="sm" variant={action.label === "Add to chat" ? "primary" : "ghost"} onClick={action.onPress} />
        ))}
      </HStack>
    </Card>
  );
}
```

`left: 0, top: 0` are zero numerics, which the Astryx checker allows. The `${anchor.x}px` template has no literal digit before `px`, so it passes as well. Run `pnpm check:astryx` to confirm. If `Divider` has no `orientation` prop, drop the vertical dividers.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw/chrome/selection-pill.test.tsx && pnpm check:astryx`
Expected: 3 PASS, Astryx check clean

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw/chrome/selection-pill*.tsx
git commit -m "feat(canvas): selection pill"
```

### Task C6: Wire the chrome into the board, hide Excalidraw's UI, e2e

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/chrome/orion-board.css`
- Modify: `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx` (imports, state and the `<Excalidraw>` block, currently around lines 281–316)
- Test: `e2e/canvas-excalidraw-chrome.spec.ts`

**Interfaces:**
- Consumes: C1–C5.
- Produces: the board renders `CanvasDock`, `SelectionPill` and `ZoomControl` over Excalidraw inside a `.orion-board` wrapper. Later stages pass `onCode` / `screenActions` / `shapeActions` through new optional props on `ExcalidrawBoard`.

- [ ] **Step 1: Write the failing e2e test**

`e2e/canvas-excalidraw-chrome.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("Excalidraw's own UI is hidden and Orion's dock drives the tools", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  for (const selector of [".App-toolbar-container", ".App-menu__left", ".layer-ui__wrapper__top-right", ".HintViewer", ".layer-ui__wrapper__footer", ".main-menu-trigger"]) {
    // Hidden by CSS: the elements may exist, but none may be visible.
    const matches = page.locator(selector);
    for (let index = 0; index < (await matches.count()); index += 1) await expect(matches.nth(index)).toBeHidden();
  }
  const dock = page.getByTestId("canvas-dock");
  await expect(dock).toBeVisible();
  await dock.getByRole("radio", { name: "Rectangle" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().activeTool.type)).toBe("rectangle");
});

test("drawing a rectangle shows the pill and recolours it", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  await page.getByTestId("canvas-dock").getByRole("radio", { name: "Rectangle" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400);
  await page.mouse.up();
  const pill = page.getByTestId("selection-pill");
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Bold" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getSceneElements().at(-1)?.strokeWidth)).toBe(4);
});

test("zoom control zooms in", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().zoom.value)).toBeCloseTo(1.25);
});
```

If the dock renders buttons rather than radios (see Task C2), change `getByRole("radio", …)` to `getByRole("button", …)`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts e2e/canvas-excalidraw-chrome.spec.ts`
Expected: FAIL. `.App-toolbar-container` is visible and `canvas-dock` isn't found.

- [ ] **Step 3: Add the stylesheet**

`chrome/orion-board.css`:

```css
/* Orion draws its own chrome (dock, selection pill, zoom). Excalidraw's UI is
   hidden here, scoped to the board. Excalidraw is pinned at 0.18.1 and
   e2e/canvas-excalidraw-chrome.spec.ts fails if an upgrade renames these. */
.orion-board .App-toolbar-container,
.orion-board .App-menu_top .App-menu__left,
.orion-board .App-menu__left,
.orion-board .layer-ui__wrapper__top-right,
.orion-board .layer-ui__wrapper__footer,
.orion-board .layer-ui__wrapper__footer-left,
.orion-board .layer-ui__wrapper__footer-right,
.orion-board .App-bottom-bar,
.orion-board .HintViewer,
.orion-board .main-menu-trigger,
.orion-board .default-sidebar-trigger,
.orion-board .sidebar-trigger {
  display: none !important;
}
```

- [ ] **Step 4: Wire it into `excalidraw-board.tsx`**

Add these imports:

```ts
import "./chrome/orion-board.css";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { CanvasDock } from "./chrome/canvas-dock";
import { SelectionPill, type PillSwatch, type ScreenAction } from "./chrome/selection-pill";
import { describeSelection, type SelectionSummary } from "./chrome/selection";
import { dockToolFor, excalidrawToolFor, type DockTool } from "./chrome/tools";
import { ZoomControl } from "./chrome/zoom-control";
import type { Viewport } from "./chrome/zoom";
```

`CaptureUpdateAction` and `newElementWith` are already exported by `@excalidraw/excalidraw` and are used in `design-screen-board.ts`. Merge them into the existing `@excalidraw/excalidraw` import line rather than adding a second one.

Extend the props, and keep the existing call sites compiling:

```ts
export function ExcalidrawBoard({ boardId, access, roomId, initialBoard, initialRevision = 0, onCode, screenActionsFor, shapeActionsFor }: {
  boardId?: string; access: "edit" | "view"; roomId?: string; initialBoard?: SavedBoard; initialRevision?: number;
  onCode?: () => void;
  screenActionsFor?: (selection: SelectionSummary) => readonly ScreenAction[];
  shapeActionsFor?: (selection: SelectionSummary) => readonly ScreenAction[];
}) {
```

Add state next to the existing `selectedFrameId` state:

```ts
const [activeTool, setActiveTool] = useState<DockTool | null>("select");
const [selection, setSelection] = useState<SelectionSummary | null>(null);
const [view, setView] = useState<Viewport>({ scrollX: 0, scrollY: 0, zoom: 1, width: 0, height: 0 });
const swatches = useMemo<PillSwatch[]>(() => [
  { label: "Ink", color: token("--color-text-primary") },
  { label: "Accent", color: token("--color-text-accent") },
  { label: "Red", color: token("--color-text-red") },
  { label: "Green", color: token("--color-text-green") },
  { label: "Yellow", color: token("--color-text-yellow") },
], [token]);

const updateSelected = useCallback((change: (element: ExcalidrawElement) => ExcalidrawElement) => {
  if (!api || !selection) return;
  const ids = new Set(selection.ids);
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => (ids.has(element.id) ? change(element) : element)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}, [api, selection]);
```

Inside the existing `onChange` handler, append after the current selection logic:

```ts
setActiveTool(dockToolFor(appState.activeTool.type));
setSelection(describeSelection(elements, appState.selectedElementIds));
setView((current) => {
  const next = { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value, width: appState.width, height: appState.height };
  return current.scrollX === next.scrollX && current.scrollY === next.scrollY && current.zoom === next.zoom
    && current.width === next.width && current.height === next.height ? current : next;
});
```

Replace the `<VStack style={{ flex: 1, minHeight: 0 }} role="application" …>` block with:

```tsx
<VStack className="orion-board" style={{ flex: 1, minHeight: 0, position: "relative" }} role="application" aria-label="Board workspace">
  <Excalidraw
    theme="dark"
    UIOptions={{ canvasActions: { changeViewBackgroundColor: false, clearCanvas: false, export: false, loadScene: false, saveToActiveFile: false, toggleTheme: false, saveAsImage: false } }}
    renderTopRightUI={() => null}
    {/* …every existing prop unchanged (initialData, viewModeEnabled, excalidrawAPI, onChange, validateEmbeddable, renderEmbeddable)… */}
  />
  {api && access === "edit" ? (
    <CanvasDock
      activeTool={activeTool}
      onSelectTool={(tool) => api.setActiveTool({ type: excalidrawToolFor(tool) })}
      onCode={onCode}
    />
  ) : null}
  {api && selection && access === "edit" ? (
    <SelectionPill
      selection={selection}
      view={view}
      swatches={swatches}
      onStroke={(color) => updateSelected((element) => newElementWith(element, { strokeColor: color }))}
      onStrokeWidth={(width) => updateSelected((element) => newElementWith(element, { strokeWidth: width }))}
      onFontSize={(size) => {
        if (!api || !selection) return;
        const ids = new Set(selection.ids);
        const changed = api.getSceneElementsIncludingDeleted().map((element) =>
          ids.has(element.id) && element.type === "text" ? newElementWith(element, { fontSize: size }) : element);
        api.updateScene({ elements: restoreElements(changed, null, { refreshDimensions: true }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      }}
      screenActions={screenActionsFor?.(selection)}
      shapeActions={shapeActionsFor?.(selection)}
    />
  ) : null}
  {api ? (
    <ZoomControl view={view} onZoom={(next) => api.updateScene({ appState: { zoom: { value: next.zoom as never }, scrollX: next.scrollX, scrollY: next.scrollY } })} />
  ) : null}
</VStack>
```

The JSX comment inside the `<Excalidraw>` props isn't valid syntax. Keep every existing prop exactly as it is today, and only add `UIOptions` and `renderTopRightUI`.

Check that `VStack` forwards `className`. If it doesn't, put `className="orion-board"` on an Astryx `Box`, or on the element `VStack` renders via `as`. Check with `pnpm exec astryx component VStack`.

- [ ] **Step 5: Run the unit, type, lint and e2e checks**

Run:
```bash
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web exec vitest run src/features/canvas-excalidraw
pnpm check:astryx
pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts
```
Expected: typecheck clean, all canvas-excalidraw unit tests PASS, and the Astryx check clean. **Every** canvas-excalidraw e2e spec passes, including the three new ones. Old specs that clicked Excalidraw's own toolbar must be updated to use the dock (`getByTestId("canvas-dock")`) or `window.__orionBoard.api.setActiveTool`. Don't weaken their assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/canvas-excalidraw e2e/canvas-excalidraw-chrome.spec.ts
git commit -m "feat(canvas): replace Excalidraw's UI with Orion's dock, pill and zoom"
```

---

## Finish

- [ ] Run the full repo checks:

```bash
pnpm typecheck && pnpm lint && pnpm test:workspace && pnpm test && pnpm exec playwright test --config playwright.canvas-excalidraw.config.ts
```

Expected: all pass. If an unrelated check was already failing on `origin/main`, record it in the PR with the output, but don't fix it here.

- [ ] Mac check: run `apps/mac/scripts/preview.sh`, open a project, then open Canvas. Confirm the dock, pill and zoom appear and that Excalidraw's menus are gone. Capture a screenshot with `screencapture -l <windowid>` into `.context/` for the owner.
- [ ] Open a PR to `main`. The description must say: **"Contains migration `20261120090000_canvas_screen_source.sql` — needs schema review before merge (11 Nov rule)."**

## Self-review notes

- **Spec coverage, delivery step 1:**
  - 1a (storage and actions): A1–A2
  - 1b (compiler, loop guard, tags, runtime bundle): B1–B9
  - 1c (hide Excalidraw UI, dock, pill, zoom): C1–C6
  - Section 9's `links` storage is pulled forward into A1 and B5, so no second migration is needed later.
- **Deferred to their own plans:**
  - live host, paste dialog (stage 2)
  - source editor, Tweak and Code tabs (stage 3)
  - chat chip and revise task (stage 4)
  - edit-instead-of-duplicate, `start_design_proposal` reuse, Star placement, arrows and missing markers (stage 5)
- **Recorded deviations:** Shapes are two buttons instead of a flyout, and the form factor stays on `design_screens`.
