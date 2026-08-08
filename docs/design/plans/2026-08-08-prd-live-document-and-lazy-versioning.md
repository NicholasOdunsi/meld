# PRD Live Document and Lazy Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-save PRD versioning with a single live document that autosaves per field, and cut frozen versions lazily at the first edit after an acceptance.

**Architecture:** `prds` collapses from one-row-per-version to one-row-per-room holding the live `document`, a monotonic internal `revision`, and a settle marker. A new append-only `prd_versions` table holds frozen snapshots. Every write path calls one shared helper that snapshots the settled state before the first edit past it. The web editor loses its draft/Save/Cancel apparatus and writes each field through a debounced autosaver.

**Tech Stack:** PostgreSQL/Supabase (plpgsql `security definer` RPCs, RLS, pgTAP), Next.js App Router server actions, React 19, Zod, Vitest, Playwright, Astryx Core components.

## Global Constraints

- Spec: `docs/design/specs/2026-08-08-ai-assisted-prd-editing-design.md`.
- Astryx conventions are enforced by `pnpm check:astryx`: no raw `<div>`/`<span>` for layout, no Tailwind utilities, no raw hex colours, no hardcoded pixel values. Use `var(--color-*)`, `var(--spacing-*)`, `var(--radius-*)`.
- Every new plpgsql function is `security definer` with `set search_path = ''`, and every table reference inside it is schema-qualified (`public.prds`, `auth.users`).
- Every new function is revoked from `public, anon, authenticated, service_role` and then granted only to `authenticated`, matching `202608030001_prd_editable_versions.sql`.
- Domain errors are raised with `errcode = 'P0001'` and a snake_case message the repository maps to a typed error, matching `toTypedPrdRpcError` in `apps/web/src/features/prd/repository.ts`.
- The PRD document JSON size limit stays `262144` bytes.
- Tests live beside the code they test (`foo.ts` → `foo.test.ts`).
- Run `pnpm --filter web test`, `pnpm typecheck`, `pnpm lint`, and `pnpm check:astryx` before the final commit of each task that touches web code.

---

## File Structure

**Created**

- `supabase/migrations/202608080001_prd_live_document.sql` — the whole schema change: `prd_versions`, the `prds` collapse, data migration, and the replacement functions.
- `supabase/tests/prd_live_document.test.sql` — pgTAP for the lazy cut, permissions, and the migration invariants.
- `packages/contracts/src/prd-fields.ts` — maps a document field name to its Zod schema, derived from `PRDDocumentSchema.shape`. The single place that knows how to validate one field. It lives in contracts, not in the web app, because the connector validates a single field too (see the follow-on plan) and cannot import from `apps/web`.
- `packages/contracts/src/prd-fields.test.ts`
- `apps/web/src/features/prd/prd-autosave.ts` — framework-free per-field debounced writer with status tracking and one retry.
- `apps/web/src/features/prd/prd-autosave.test.ts`
- `apps/web/src/features/prd/components/use-prd-autosave.ts` — React binding over `prd-autosave.ts`.

**Modified**

- `apps/web/src/features/prd/schemas.ts` — `RoomPrd` gains `revision`, keeps `version`/`status` as derived values; new `PrdVersion`.
- `apps/web/src/features/prd/repository.ts` — new read/write surface.
- `apps/web/src/features/prd/queries.ts` — `getRoomPrdVersions` replaces `getRoomPrdHistory`.
- `apps/web/src/features/prd/actions.ts` — `savePrdField` and `acceptPrd` replace `savePrdVersion` and `acceptPrdVersion`.
- `apps/web/src/features/discovery/backend.ts`, `supabase-backend.ts`, `fake-backend.ts` — interface follows the repository.
- `apps/web/src/features/prd/components/prd-editor.tsx` — draft apparatus deleted, autosave added.
- `apps/web/src/features/prd/components/prd-header.tsx` — `EditorActions` and the Save/Cancel branch removed.
- `apps/web/src/features/prd/components/prd-document.tsx` — no editor ref, no dirty state, new accept copy.
- `apps/web/src/features/prd/components/prd-version-history.tsx` — reads `PrdVersion[]`.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx` — version list instead of history.
- `e2e/prd-edit-acceptance.spec.ts` — no Save button.

---

### Task 1: Schema — live document and frozen versions

**Files:**
- Create: `supabase/migrations/202608080001_prd_live_document.sql`
- Test: `supabase/tests/prd_live_document.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - table `public.prd_versions (id uuid, room_id uuid, organization_id uuid, version integer, document jsonb, settled_at timestamptz, settled_by uuid, created_at timestamptz)`
  - `public.prds` with columns `id, room_id, organization_id, document, revision integer, settled_at timestamptz, settled_by uuid, settled_revision integer, owner_id, source_task_id, created_at, updated_at` and `unique (room_id)`
  - `public.freeze_settled_prd(live public.prds) returns void`
  - `public.save_prd_field(target_room_id uuid, section_field text, next_value jsonb) returns public.prds`
  - `public.accept_prd(target_room_id uuid) returns public.prds`
  - error messages: `prd_edit_forbidden`, `prd_accept_forbidden`, `invalid_prd_document`, `unknown_prd_section`, `prd_missing`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/prd_live_document.test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'prd-live-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'prd-live-editor@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'prd-live-outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001', 'PRD Live',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (organization_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002', 'member'),
  ('20000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000003', 'member');

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'PRD Room',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002', 'edit'
);

insert into public.prds (
  id, room_id, organization_id, document, owner_id
)
values (
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '{"title":"Live","executiveSummary":"first","openQuestions":[]}'::jsonb,
  '10000000-0000-4000-8000-000000000001'
);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';

-- An edit on an unsettled document must not cut a version.
select lives_ok(
  $$select public.save_prd_field(
      '40000000-0000-4000-8000-000000000001',
      'executiveSummary',
      '"second"'::jsonb)$$,
  'an editor can save a field'
);

select is(
  (select count(*)::integer from public.prd_versions
   where room_id = '40000000-0000-4000-8000-000000000001'),
  0,
  'editing an unsettled document cuts no version'
);

select is(
  (select revision from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'saving a field bumps the revision'
);

select is(
  (select document ->> 'executiveSummary' from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  'second',
  'saving a field replaces only that field'
);

select is(
  (select document ->> 'title' from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  'Live',
  'saving a field leaves other fields untouched'
);

select throws_ok(
  $$select public.save_prd_field(
      '40000000-0000-4000-8000-000000000001',
      'notASection',
      '"x"'::jsonb)$$,
  'P0001',
  'unknown_prd_section',
  'an unknown section is rejected'
);

-- Only the room owner or an org admin may accept.
select throws_ok(
  $$select public.accept_prd('40000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'prd_accept_forbidden',
  'an editor cannot accept'
);

set local request.jwt.claims to
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.accept_prd('40000000-0000-4000-8000-000000000001')$$,
  'the room owner can accept'
);

select is(
  (select settled_revision from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'accepting settles at the current revision'
);

select is(
  (select count(*)::integer from public.prd_versions
   where room_id = '40000000-0000-4000-8000-000000000001'),
  0,
  'accepting alone cuts no version'
);

-- The first edit past a settled state freezes it, exactly once.
set local request.jwt.claims to
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';

select public.save_prd_field(
  '40000000-0000-4000-8000-000000000001', 'executiveSummary', '"third"'::jsonb);
select public.save_prd_field(
  '40000000-0000-4000-8000-000000000001', 'executiveSummary', '"fourth"'::jsonb);

select is(
  (select count(*)::integer from public.prd_versions
   where room_id = '40000000-0000-4000-8000-000000000001'),
  1,
  'the lazy cut fires once, not once per edit'
);

select is(
  (select document ->> 'executiveSummary' from public.prd_versions
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 1),
  'second',
  'the frozen snapshot holds the settled bytes, not the later edit'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `supabase db reset && supabase test db`
Expected: FAIL — `function public.save_prd_field(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608080001_prd_live_document.sql`:

```sql
-- A PRD is one live document per room, not a stack of saved versions. Editing
-- writes in place; a version is frozen only when someone first edits past a
-- state that was accepted. See
-- docs/design/specs/2026-08-08-ai-assisted-prd-editing-design.md.

-- The immutability trigger guarded the old status column and has nothing left
-- to protect: acceptance no longer freezes the live row.
drop trigger if exists protect_accepted_prd on public.prds;
drop function if exists public.protect_accepted_prd();
drop function if exists public.save_prd_version(uuid, integer, jsonb);
drop function if exists public.accept_prd_version(uuid);

create table public.prd_versions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  document jsonb not null,
  settled_at timestamptz not null,
  settled_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (room_id, version),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

create index prd_versions_room_version_idx
  on public.prd_versions (room_id, version desc);

-- Every version below the latest becomes a frozen snapshot. The latest row
-- stays as the live document, so a room that had v1..v3 keeps v3's bytes live
-- and files v1, v2 -- and its displayed number stays 3, because the live
-- document always reads as count(prd_versions) + 1.
insert into public.prd_versions (
  room_id, organization_id, version, document, settled_at, settled_by
)
select
  prd.room_id, prd.organization_id, prd.version, prd.document,
  coalesce(prd.accepted_at, prd.updated_at),
  coalesce(prd.accepted_by, prd.created_by)
from public.prds as prd
where prd.version < (
  select max(latest.version) from public.prds as latest
  where latest.room_id = prd.room_id
);

delete from public.prds as prd
where prd.version < (
  select max(latest.version) from public.prds as latest
  where latest.room_id = prd.room_id
);

alter table public.prds
  add column revision integer not null default 0,
  add column settled_at timestamptz,
  add column settled_by uuid references auth.users(id),
  add column settled_revision integer;

-- A latest row that was already accepted starts settled, so it reads as
-- accepted and its next edit cuts the first lazy snapshot.
update public.prds
set settled_at = accepted_at,
    settled_by = accepted_by,
    settled_revision = revision
where status = 'accepted';

alter table public.prds
  drop column version,
  drop column status,
  drop column accepted_at,
  drop column accepted_by;

drop index if exists public.prds_room_version_idx;
alter table public.prds add constraint prds_one_per_room unique (room_id);

-- Freeze the settled state, if there is one and nothing has moved past it yet.
-- Every write path calls this before it writes, which is what makes the cut
-- lazy: the snapshot is taken when someone moves on, never at acceptance.
create function public.freeze_settled_prd(live public.prds)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if live.settled_revision is null
    or live.revision is distinct from live.settled_revision
  then
    return;
  end if;

  select coalesce(max(frozen.version), 0) + 1 into next_version
  from public.prd_versions as frozen
  where frozen.room_id = live.room_id;

  insert into public.prd_versions (
    room_id, organization_id, version, document, settled_at, settled_by
  )
  values (
    live.room_id, live.organization_id, next_version, live.document,
    live.settled_at, live.settled_by
  );
end;
$$;

-- Write one section of the live document. Field-level granularity is what makes
-- autosave safe for concurrent editors: two people in different sections never
-- collide. Two people in the same section is deliberately last-write-wins.
-- The value's shape is validated by the caller against that field's Zod schema;
-- this function guards identity (is it a real section?) and size.
create function public.save_prd_field(
  target_room_id uuid,
  section_field text,
  next_value jsonb
)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  live public.prds%rowtype;
  next_document jsonb;
  saved public.prds%rowtype;
begin
  if caller_id is null or not public.can_edit_room(target_room_id) then
    raise exception 'prd_edit_forbidden' using errcode = 'P0001';
  end if;

  select prd.* into live
  from public.prds as prd
  where prd.room_id = target_room_id
  for update;

  if live.id is null then
    raise exception 'prd_missing' using errcode = 'P0001';
  end if;

  -- The live document is the authority on what a section is: a key it does not
  -- already carry is not a section, so no field list has to be duplicated here.
  if section_field is null
    or section_field = 'title' and jsonb_typeof(next_value) <> 'string'
    or not (live.document ? section_field)
  then
    raise exception 'unknown_prd_section' using errcode = 'P0001';
  end if;

  if next_value is null then
    raise exception 'invalid_prd_document' using errcode = 'P0001';
  end if;

  next_document := jsonb_set(
    live.document, array[section_field], next_value, false);

  if pg_catalog.pg_column_size(next_document) > 262144 then
    raise exception 'invalid_prd_document' using errcode = 'P0001';
  end if;

  perform public.freeze_settled_prd(live);

  update public.prds as prd
  set document = next_document,
      revision = prd.revision + 1,
      updated_at = now()
  where prd.id = live.id
  returning * into saved;

  return saved;
end;
$$;

-- Acceptance records that this state is the decision. It does not lock the
-- document and it does not create a version; the snapshot is cut later, by
-- whoever edits past it.
create function public.accept_prd(target_room_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  live public.prds%rowtype;
  room_owner_id uuid;
  accepted public.prds%rowtype;
begin
  if caller_id is null then
    raise exception 'prd_accept_forbidden' using errcode = 'P0001';
  end if;

  select prd.* into live
  from public.prds as prd
  where prd.room_id = target_room_id
  for update;

  if live.id is null then
    raise exception 'prd_missing' using errcode = 'P0001';
  end if;

  select room.owner_id into room_owner_id
  from public.discovery_rooms as room
  where room.id = live.room_id;

  if caller_id <> room_owner_id
    and not public.is_org_admin(live.organization_id)
  then
    raise exception 'prd_accept_forbidden' using errcode = 'P0001';
  end if;

  if live.settled_revision is not distinct from live.revision then
    return live;
  end if;

  update public.prds as prd
  set settled_at = now(),
      settled_by = caller_id,
      settled_revision = prd.revision
  where prd.id = live.id
  returning * into accepted;

  return accepted;
end;
$$;

-- A completed prd_generate creates the live document; a completed prd_revise
-- replaces it, which is an edit and therefore cuts a lazy version first.
create or replace function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_owner uuid;
  live public.prds%rowtype;
begin
  if new.kind not in ('prd_generate', 'prd_revise')
    or new.status <> 'completed'
    or new.result_json is null
  then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
  then
    return new;
  end if;

  if exists (
    select 1 from public.prds as prd where prd.source_task_id = new.id
  ) then
    return new;
  end if;

  perform 1 from public.discovery_rooms where id = new.room_id for update;

  select prd.* into live
  from public.prds as prd
  where prd.room_id = new.room_id
  for update;

  if live.id is null then
    select room.owner_id into room_owner
    from public.discovery_rooms as room
    where room.id = new.room_id;

    insert into public.prds (
      room_id, organization_id, document, owner_id, source_task_id
    )
    values (
      new.room_id, new.organization_id, payload, room_owner, new.id
    );
    return new;
  end if;

  perform public.freeze_settled_prd(live);

  update public.prds as prd
  set document = payload,
      revision = prd.revision + 1,
      source_task_id = new.id,
      updated_at = now()
  where prd.id = live.id;

  return new;
end;
$$;

alter table public.prd_versions enable row level security;

revoke all on table public.prd_versions from anon;
revoke all privileges on table public.prd_versions
  from authenticated, service_role;
grant select on table public.prd_versions to authenticated, service_role;

create policy "Room participants can view PRD versions"
on public.prd_versions
for select
to authenticated
using (public.is_room_participant(room_id));

revoke all on function public.freeze_settled_prd(public.prds) from public;
revoke all on function public.freeze_settled_prd(public.prds)
  from anon, authenticated, service_role;

revoke all on function public.save_prd_field(uuid, text, jsonb) from public;
revoke all on function public.save_prd_field(uuid, text, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.save_prd_field(uuid, text, jsonb)
  to authenticated;

revoke all on function public.accept_prd(uuid) from public;
revoke all on function public.accept_prd(uuid)
  from anon, authenticated, service_role;
grant execute on function public.accept_prd(uuid) to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `supabase db reset && supabase test db`
Expected: PASS — 12 assertions in `prd_live_document.test.sql`, and every pre-existing suite still green.

Note: `supabase/tests/create_prd_revise_task.test.sql` inserts into `public.prds` with `version`/`status`. Update those inserts to the new column set (drop `version` and `status`) as part of this step, and re-run.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608080001_prd_live_document.sql supabase/tests/
git commit -m "feat(prd): collapse prds to a live document with lazily frozen versions"
```

---

### Task 2: Per-field validation schemas

**Files:**
- Create: `packages/contracts/src/prd-fields.ts`
- Modify: `packages/contracts/src/index.ts` (re-export)
- Test: `packages/contracts/src/prd-fields.test.ts`

**Interfaces:**
- Consumes: `PRDDocumentSchema`, `PRDDocument` from `./prd`.
- Produces:
  - `type PrdFieldName = keyof PRDDocument`
  - `PRD_FIELD_NAMES: readonly PrdFieldName[]`
  - `isPrdFieldName(value: string): value is PrdFieldName`
  - `parsePrdFieldValue(field: PrdFieldName, value: unknown): { ok: true; value: unknown } | { ok: false }`

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/prd-fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PRDDocumentSchema } from "./prd";
import {
  PRD_FIELD_NAMES,
  isPrdFieldName,
  parsePrdFieldValue,
} from "./prd-fields";

describe("prd field schemas", () => {
  it("names every field the document schema carries", () => {
    expect([...PRD_FIELD_NAMES].sort()).toEqual(
      Object.keys(PRDDocumentSchema.shape).sort(),
    );
  });

  it("accepts the title and a section field", () => {
    expect(isPrdFieldName("title")).toBe(true);
    expect(isPrdFieldName("risksAndMitigations")).toBe(true);
  });

  it("rejects a name that is not a document field", () => {
    expect(isPrdFieldName("notASection")).toBe(false);
  });

  it("parses a valid prose value", () => {
    expect(parsePrdFieldValue("executiveSummary", "hello")).toEqual({
      ok: true,
      value: "hello",
    });
  });

  it("rejects a value of the wrong shape for its field", () => {
    expect(parsePrdFieldValue("functionalRequirements", "not a list")).toEqual({
      ok: false,
    });
  });

  it("parses a compound row value", () => {
    const rows = [{ risk: "downtime", mitigation: "queue" }];
    expect(parsePrdFieldValue("risksAndMitigations", rows)).toEqual({
      ok: true,
      value: rows,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --filter @meld/contracts -- prd-fields`
Expected: FAIL — cannot resolve `./prd-fields`.

- [ ] **Step 3: Write the implementation**

Create `packages/contracts/src/prd-fields.ts`:

```ts
import type { PRDDocument } from "./prd";
import { PRDDocumentSchema } from "./prd";

// One field of the document, validated on its own.
//
// Autosave writes a single field, and so does an agent section revision, so
// neither has a whole document to hand to PRDDocumentSchema. The per-field
// schema is the one that document schema already carries, so nothing is
// restated here and the two can never drift.
//
// This lives in contracts rather than in the web app because the connector
// validates a single field too, and cannot import from apps/web.
export type PrdFieldName = keyof PRDDocument;

const FIELD_SHAPE = PRDDocumentSchema.shape;

export const PRD_FIELD_NAMES = Object.keys(
  FIELD_SHAPE,
) as readonly PrdFieldName[];

export function isPrdFieldName(value: string): value is PrdFieldName {
  return Object.hasOwn(FIELD_SHAPE, value);
}

export function parsePrdFieldValue(
  field: PrdFieldName,
  value: unknown,
): { ok: true; value: unknown } | { ok: false } {
  const result = FIELD_SHAPE[field].safeParse(value);
  return result.success ? { ok: true, value: result.data } : { ok: false };
}
```

Add `export * from "./prd-fields";` to `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test --filter @meld/contracts -- prd-fields`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck
git add packages/contracts/src
git commit -m "feat(contracts): validate one PRD document field at a time"
```

---

### Task 3: Repository, queries, and server actions

**Files:**
- Modify: `apps/web/src/features/prd/schemas.ts`
- Modify: `apps/web/src/features/prd/repository.ts`
- Modify: `apps/web/src/features/prd/queries.ts`
- Modify: `apps/web/src/features/prd/actions.ts`
- Modify: `apps/web/src/features/discovery/backend.ts`, `supabase-backend.ts`, `fake-backend.ts`
- Test: `apps/web/src/features/prd/repository.test.ts`, `apps/web/src/features/prd/actions.test.ts`

**Interfaces:**
- Consumes: `save_prd_field`, `accept_prd` (Task 1); `isPrdFieldName`, `parsePrdFieldValue` from `@meld/contracts` (Task 2).
- Produces:
  - `RoomPrd = { id, roomId, document, revision, version, status: "draft" | "accepted", settledAt: string | null, settledBy: string | null, ownerId, createdAt, updatedAt }`
  - `PrdVersion = { id, roomId, version, document, settledAt, settledBy }`
  - `getRoomPrd(roomId): Promise<RoomPrd | null>`
  - `getRoomPrdVersions(roomId): Promise<PrdVersion[]>`
  - `savePrdField(input: { roomId: string; field: string; value: unknown }): Promise<SavePrdFieldResult>` where `SavePrdFieldResult = { status: "saved"; prd: RoomPrd } | { status: "error"; message: string }`
  - `acceptPrd(input: { roomId: string }): Promise<AcceptPrdResult>` where `AcceptPrdResult = { status: "accepted"; prd: RoomPrd } | { status: "error"; message: string }`

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/features/prd/repository.test.ts`:

```ts
it("derives the version from the frozen snapshot count", async () => {
  const supabase = createStubSupabase({
    prdRow: {
      id: "11111111-1111-4111-8111-111111111111",
      room_id: "22222222-2222-4222-8222-222222222222",
      document: { title: "Live" },
      revision: 4,
      settled_at: null,
      settled_by: null,
      settled_revision: null,
      owner_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-08-08T00:00:00.000Z",
      updated_at: "2026-08-08T00:00:00.000Z",
    },
    versionCount: 2,
  });

  const prd = await createPrdRepository(supabase).getRoomPrd(
    "22222222-2222-4222-8222-222222222222",
  );

  expect(prd?.version).toBe(3);
  expect(prd?.status).toBe("draft");
});

it("reads as accepted while the revision matches the settled revision", async () => {
  const supabase = createStubSupabase({
    prdRow: {
      id: "11111111-1111-4111-8111-111111111111",
      room_id: "22222222-2222-4222-8222-222222222222",
      document: { title: "Live" },
      revision: 4,
      settled_at: "2026-08-08T00:00:00.000Z",
      settled_by: "33333333-3333-4333-8333-333333333333",
      settled_revision: 4,
      owner_id: "33333333-3333-4333-8333-333333333333",
      created_at: "2026-08-08T00:00:00.000Z",
      updated_at: "2026-08-08T00:00:00.000Z",
    },
    versionCount: 0,
  });

  const prd = await createPrdRepository(supabase).getRoomPrd(
    "22222222-2222-4222-8222-222222222222",
  );

  expect(prd?.status).toBe("accepted");
});
```

Add to `apps/web/src/features/prd/actions.test.ts`:

```ts
it("rejects a field name that is not part of the document", async () => {
  const result = await savePrdField({
    roomId: "22222222-2222-4222-8222-222222222222",
    field: "notASection",
    value: "x",
  });
  expect(result).toEqual({ status: "error", message: "Invalid request." });
});

it("rejects a value whose shape does not match its field", async () => {
  const result = await savePrdField({
    roomId: "22222222-2222-4222-8222-222222222222",
    field: "functionalRequirements",
    value: "not a list",
  });
  expect(result).toEqual({ status: "error", message: "Invalid request." });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter web test -- prd/repository prd/actions`
Expected: FAIL — `savePrdField` is not exported; `version` is `undefined`.

- [ ] **Step 3: Write the implementation**

Replace the version-oriented parts of `apps/web/src/features/prd/schemas.ts`:

```ts
import { PRDDocumentSchema } from "@meld/contracts";
import { z } from "zod";

// The live document. `version` and `status` are derived, not stored: the
// version a reader sees is always one past the frozen snapshot count, and a
// document reads as accepted exactly while nothing has moved past its settle
// point.
export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  document: PRDDocumentSchema,
  revision: z.number().int().nonnegative(),
  version: z.number().int().min(1),
  status: z.enum(["draft", "accepted"]),
  settledAt: z.string().nullable(),
  settledBy: z.string().uuid().nullable(),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoomPrd = z.infer<typeof RoomPrdSchema>;

export const PrdVersionSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  document: PRDDocumentSchema,
  settledAt: z.string(),
  settledBy: z.string().uuid(),
});

export type PrdVersion = z.infer<typeof PrdVersionSchema>;

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
```

In `apps/web/src/features/prd/repository.ts`, replace `PRD_COLUMNS`, `PrdRow`, `toRoomPrd`, and the three write methods:

```ts
const PRD_COLUMNS =
  "id, room_id, document, revision, settled_at, settled_by, settled_revision, owner_id, created_at, updated_at";

const PRD_VERSION_COLUMNS =
  "id, room_id, version, document, settled_at, settled_by";

type PrdRow = {
  id: string;
  room_id: string;
  document: PRDDocument;
  revision: number;
  settled_at: string | null;
  settled_by: string | null;
  settled_revision: number | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

type PrdVersionRow = {
  id: string;
  room_id: string;
  version: number;
  document: PRDDocument;
  settled_at: string;
  settled_by: string;
};

export class PrdMissingError extends Error {
  constructor() {
    super("This room has no PRD.");
    this.name = "PrdMissingError";
  }
}

export class UnknownPrdSectionError extends Error {
  constructor() {
    super("That is not a PRD section.");
    this.name = "UnknownPrdSectionError";
  }
}

function toRoomPrd(row: PrdRow, frozenCount: number): RoomPrd {
  return RoomPrdSchema.parse({
    id: row.id,
    roomId: row.room_id,
    document: row.document,
    revision: row.revision,
    version: frozenCount + 1,
    status:
      row.settled_revision !== null && row.settled_revision === row.revision
        ? "accepted"
        : "draft",
    settledAt: row.settled_at,
    settledBy: row.settled_by,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toPrdVersion(row: PrdVersionRow): PrdVersion {
  return PrdVersionSchema.parse({
    id: row.id,
    roomId: row.room_id,
    version: row.version,
    document: row.document,
    settledAt: row.settled_at,
    settledBy: row.settled_by,
  });
}
```

Extend `toTypedPrdRpcError` with the two new messages:

```ts
    case "prd_missing":
      return new PrdMissingError();
    case "unknown_prd_section":
      return new UnknownPrdSectionError();
```

Replace the repository methods:

```ts
export function createPrdRepository(supabase: SupabaseClient) {
  async function frozenVersionCount(roomId: string): Promise<number> {
    const { count, error } = await supabase
      .from("prd_versions")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId);
    if (error) throw new Error("Could not load the PRD versions.");
    return count ?? 0;
  }

  const repository = {
    async getRoomPrd(roomId: string): Promise<RoomPrd | null> {
      const { data, error } = await supabase
        .from("prds")
        .select(PRD_COLUMNS)
        .eq("room_id", roomId)
        .maybeSingle();
      if (error) throw new Error("Could not load the PRD.");
      if (!data) return null;
      return toRoomPrd(data as PrdRow, await frozenVersionCount(roomId));
    },
    async getRoomPrdVersions(roomId: string): Promise<PrdVersion[]> {
      const { data, error } = await supabase
        .from("prd_versions")
        .select(PRD_VERSION_COLUMNS)
        .eq("room_id", roomId)
        .order("version", { ascending: false });
      if (error) throw new Error("Could not load the PRD versions.");
      return (data ?? []).map((row) => toPrdVersion(row as PrdVersionRow));
    },
    async roomHasPrd(roomId: string): Promise<boolean> {
      const { count, error } = await supabase
        .from("prds")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);
      if (error) throw new Error("Could not check for a PRD.");
      return (count ?? 0) > 0;
    },
    async saveRoomPrdField(input: {
      roomId: string;
      field: string;
      value: unknown;
    }): Promise<RoomPrd> {
      const { data, error } = await supabase.rpc("save_prd_field", {
        target_room_id: input.roomId,
        section_field: input.field,
        next_value: input.value,
      });
      if (error) {
        throw toTypedPrdRpcError(error) ?? new Error("Could not save the PRD.");
      }
      if (!data) throw new Error("Could not save the PRD.");
      return toRoomPrd(
        data as PrdRow,
        await frozenVersionCount(input.roomId),
      );
    },
    async acceptRoomPrd(input: { roomId: string }): Promise<RoomPrd> {
      const { data, error } = await supabase.rpc("accept_prd", {
        target_room_id: input.roomId,
      });
      if (error) {
        throw (
          toTypedPrdRpcError(error) ?? new Error("Could not accept the PRD.")
        );
      }
      if (!data) throw new Error("Could not accept the PRD.");
      return toRoomPrd(
        data as PrdRow,
        await frozenVersionCount(input.roomId),
      );
    },
  };

  return repository;
}
```

Delete `PrdVersionConflictError` and `PrdAlreadyAcceptedError` and their `toTypedPrdRpcError` cases — there is no base version to conflict with, and acceptance is repeatable.

In `apps/web/src/features/prd/actions.ts`, replace `savePrdVersion` and `acceptPrdVersion`:

```ts
const SavePrdFieldInputSchema = z
  .object({
    roomId: z.string().uuid(),
    field: z.string(),
    value: z.unknown(),
  })
  .strict();

const AcceptPrdInputSchema = z.object({ roomId: z.string().uuid() }).strict();

export type SavePrdFieldResult =
  | { status: "saved"; prd: RoomPrd }
  | { status: "error"; message: string };

export type AcceptPrdResult =
  | { status: "accepted"; prd: RoomPrd }
  | { status: "error"; message: string };

export async function savePrdField(input: {
  roomId: string;
  field: string;
  value: unknown;
}): Promise<SavePrdFieldResult> {
  const parsed = SavePrdFieldInputSchema.safeParse(input);
  if (!parsed.success || !isPrdFieldName(parsed.data.field)) {
    return { status: "error", message: "Invalid request." };
  }

  const value = parsePrdFieldValue(parsed.data.field, parsed.data.value);
  if (!value.ok) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const prd = await (await getDiscoveryBackend()).saveRoomPrdField({
      roomId: parsed.data.roomId,
      field: parsed.data.field,
      value: value.value,
    });
    return { status: "saved", prd };
  } catch (error) {
    if (error instanceof PrdEditForbiddenError) {
      return {
        status: "error",
        message: "You do not have permission to edit this PRD.",
      };
    }
    return { status: "error", message: "Could not save the PRD." };
  }
}

export async function acceptPrd(input: {
  roomId: string;
}): Promise<AcceptPrdResult> {
  const parsed = AcceptPrdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const prd = await (await getDiscoveryBackend()).acceptRoomPrd(parsed.data);
    return { status: "accepted", prd };
  } catch (error) {
    if (error instanceof PrdAcceptForbiddenError) {
      return {
        status: "error",
        message: "You do not have permission to accept this PRD.",
      };
    }
    return { status: "error", message: "Could not accept the PRD." };
  }
}
```

In `apps/web/src/features/prd/queries.ts`, rename `getRoomPrdHistory` to `getRoomPrdVersions` returning `PrdVersion[]` and delegating to the backend's `getRoomPrdVersions`.

In `apps/web/src/features/discovery/backend.ts`, change the three PRD entries on `DiscoveryBackend`:

```ts
  getRoomPrd(input: { roomId: string }): Promise<RoomPrd | null>;
  getRoomPrdVersions(input: { roomId: string }): Promise<PrdVersion[]>;
  saveRoomPrdField(input: {
    roomId: string;
    field: string;
    value: unknown;
  }): Promise<RoomPrd>;
  acceptRoomPrd(input: { roomId: string }): Promise<RoomPrd>;
```

Mirror those signatures in `supabase-backend.ts` (delegating to the repository) and in `fake-backend.ts` (an in-memory live document plus a frozen array, applying the same lazy-cut rule so E2E exercises the real behaviour).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- prd/`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add apps/web/src/features/prd apps/web/src/features/discovery
git commit -m "feat(prd): read and write the live document per field"
```

---

### Task 4: The autosaver

**Files:**
- Create: `apps/web/src/features/prd/prd-autosave.ts`
- Test: `apps/web/src/features/prd/prd-autosave.test.ts`

**Interfaces:**
- Consumes: nothing (framework-free by design, so it can be tested with fake timers and no DOM).
- Produces:
  - `type FieldSaveState = "idle" | "saving" | "saved" | "error"`
  - `createPrdAutosaver(options: { write: (field: string, value: unknown) => Promise<boolean>; onStateChange: (field: string, state: FieldSaveState) => void; delayMs?: number }): { queue(field: string, value: unknown): void; flush(): Promise<void>; retry(field: string): void; dispose(): void }`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/prd/prd-autosave.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrdAutosaver, type FieldSaveState } from "./prd-autosave";

describe("prd autosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid edits to one write per field", async () => {
    const write = vi.fn(async () => true);
    const saver = createPrdAutosaver({ write, onStateChange: () => {}, delayMs: 500 });

    saver.queue("executiveSummary", "a");
    saver.queue("executiveSummary", "ab");
    saver.queue("executiveSummary", "abc");
    await vi.advanceTimersByTimeAsync(500);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("executiveSummary", "abc");
  });

  it("keeps separate fields on separate timers", async () => {
    const write = vi.fn(async () => true);
    const saver = createPrdAutosaver({ write, onStateChange: () => {}, delayMs: 500 });

    saver.queue("executiveSummary", "a");
    saver.queue("openQuestions", ["b"]);
    await vi.advanceTimersByTimeAsync(500);

    expect(write).toHaveBeenCalledTimes(2);
  });

  it("reports saving then saved", async () => {
    const states: [string, FieldSaveState][] = [];
    const saver = createPrdAutosaver({
      write: async () => true,
      onStateChange: (field, state) => states.push([field, state]),
      delayMs: 500,
    });

    saver.queue("executiveSummary", "a");
    await vi.advanceTimersByTimeAsync(500);

    expect(states).toEqual([
      ["executiveSummary", "saving"],
      ["executiveSummary", "saved"],
    ]);
  });

  it("reports error when the write fails, and keeps the value for retry", async () => {
    const write = vi
      .fn<(field: string, value: unknown) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const states: [string, FieldSaveState][] = [];
    const saver = createPrdAutosaver({
      write,
      onStateChange: (field, state) => states.push([field, state]),
      delayMs: 500,
    });

    saver.queue("executiveSummary", "a");
    await vi.advanceTimersByTimeAsync(500);
    expect(states.at(-1)).toEqual(["executiveSummary", "error"]);

    saver.retry("executiveSummary");
    await vi.advanceTimersByTimeAsync(0);

    expect(write).toHaveBeenLastCalledWith("executiveSummary", "a");
    expect(states.at(-1)).toEqual(["executiveSummary", "saved"]);
  });

  it("does not overlap writes to the same field", async () => {
    let resolveFirst: ((ok: boolean) => void) | null = null;
    const write = vi
      .fn<(field: string, value: unknown) => Promise<boolean>>()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValue(true);
    const saver = createPrdAutosaver({ write, onStateChange: () => {}, delayMs: 500 });

    saver.queue("executiveSummary", "a");
    await vi.advanceTimersByTimeAsync(500);
    saver.queue("executiveSummary", "b");
    await vi.advanceTimersByTimeAsync(500);
    expect(write).toHaveBeenCalledTimes(1);

    resolveFirst?.(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith("executiveSummary", "b");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- prd-autosave`
Expected: FAIL — cannot resolve `./prd-autosave`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/prd/prd-autosave.ts`:

```ts
// Per-field debounced writer for the live PRD document.
//
// There is no Save button, so this is the only thing standing between a
// keystroke and the database -- and the only thing that keeps a failed write
// from silently losing text. It therefore never drops a pending value: a field
// that fails keeps its value so `retry` can send exactly what the user typed.
//
// Framework-free on purpose: the interesting behaviour is timing and
// sequencing, which is far easier to prove with fake timers than through a
// component.

export type FieldSaveState = "idle" | "saving" | "saved" | "error";

const DEFAULT_DELAY_MS = 600;

type PendingField = {
  timer: ReturnType<typeof setTimeout> | null;
  value: unknown;
  hasPending: boolean;
  isWriting: boolean;
};

export function createPrdAutosaver({
  write,
  onStateChange,
  delayMs = DEFAULT_DELAY_MS,
}: {
  // Resolves true when the value reached the server.
  write: (field: string, value: unknown) => Promise<boolean>;
  onStateChange: (field: string, state: FieldSaveState) => void;
  delayMs?: number;
}) {
  const fields = new Map<string, PendingField>();

  function slot(field: string): PendingField {
    const existing = fields.get(field);
    if (existing) return existing;
    const created: PendingField = {
      timer: null,
      value: undefined,
      hasPending: false,
      isWriting: false,
    };
    fields.set(field, created);
    return created;
  }

  async function run(field: string): Promise<void> {
    const pending = slot(field);
    // One write per field at a time. A newer value queued mid-flight is sent
    // when this one settles, so writes can never land out of order.
    if (pending.isWriting || !pending.hasPending) return;
    pending.isWriting = true;
    pending.hasPending = false;
    const value = pending.value;
    onStateChange(field, "saving");
    let ok = false;
    try {
      ok = await write(field, value);
    } catch {
      ok = false;
    }
    pending.isWriting = false;
    if (ok) {
      onStateChange(field, "saved");
    } else {
      // Keep the value: `retry` must resend what the user typed, and the
      // input must never be reconciled back to server state after a failure.
      pending.hasPending = true;
      pending.value = value;
      onStateChange(field, "error");
      return;
    }
    if (pending.hasPending) void run(field);
  }

  return {
    queue(field: string, value: unknown) {
      const pending = slot(field);
      pending.value = value;
      pending.hasPending = true;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        pending.timer = null;
        void run(field);
      }, delayMs);
    },
    retry(field: string) {
      const pending = fields.get(field);
      if (!pending) return;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;
      void run(field);
    },
    async flush() {
      for (const [field, pending] of fields) {
        if (pending.timer) {
          clearTimeout(pending.timer);
          pending.timer = null;
        }
        await run(field);
      }
    },
    dispose() {
      for (const pending of fields.values()) {
        if (pending.timer) clearTimeout(pending.timer);
      }
      fields.clear();
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test -- prd-autosave`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/prd/prd-autosave.ts apps/web/src/features/prd/prd-autosave.test.ts
git commit -m "feat(prd): debounced per-field autosaver"
```

---

### Task 5: Editor autosaves; Save and Cancel are removed

**Files:**
- Create: `apps/web/src/features/prd/components/use-prd-autosave.ts`
- Modify: `apps/web/src/features/prd/components/prd-editor.tsx`
- Modify: `apps/web/src/features/prd/components/prd-header.tsx`
- Modify: `apps/web/src/features/prd/components/prd-document.tsx`
- Test: `apps/web/src/features/prd/components/prd-editor.test.tsx`

**Interfaces:**
- Consumes: `createPrdAutosaver`, `FieldSaveState` (Task 4); `savePrdField` (Task 3).
- Produces:
  - `usePrdAutosave(roomId: string): { save(field: string, value: unknown): void; retry(field: string): void; stateFor(field: string): FieldSaveState }`
  - `PrdEditor` props become `{ prd: RoomPrd; canEdit: boolean; onDocumentChange: (document: PRDDocument) => void }` — no `ref`, no `onSaved`, no `onCancel`, no `onDirtyChange`, no `onSavingChange`, no `onReviewLatest`.
  - `PrdHeaderActions` props become `{ status, canEdit, canAccept, isEditing, onEdit, onDone, onHistory, onAccept, onCopyDocument, onExport }`.

- [ ] **Step 1: Write the failing test**

Replace the save/cancel/conflict cases in `apps/web/src/features/prd/components/prd-editor.test.tsx` with:

```tsx
it("autosaves an edited field without any save button", async () => {
  const savePrdField = vi.fn(async () => ({ status: "saved" as const, prd }));
  vi.mocked(actions.savePrdField).mockImplementation(savePrdField);

  render(<PrdEditor prd={prd} canEdit onDocumentChange={() => {}} />);

  await userEvent.type(
    screen.getByLabelText("Executive summary"),
    " and more",
  );

  expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();

  await waitFor(() =>
    expect(savePrdField).toHaveBeenCalledWith({
      roomId: prd.roomId,
      field: "executiveSummary",
      value: expect.stringContaining("and more"),
    }),
  );
});

it("keeps the typed value and offers a retry when the save fails", async () => {
  vi.mocked(actions.savePrdField).mockResolvedValue({
    status: "error",
    message: "Could not save the PRD.",
  });

  render(<PrdEditor prd={prd} canEdit onDocumentChange={() => {}} />);

  const field = screen.getByLabelText("Executive summary");
  await userEvent.type(field, " and more");

  await screen.findByText("Not saved");
  expect(field).toHaveValue(expect.stringContaining("and more"));
  expect(screen.getByRole("button", { name: "Retry saving Executive summary" }))
    .toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- prd-editor`
Expected: FAIL — `PrdEditor` still requires `initialPrd`/`onSaved`, and renders a Save button.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/features/prd/components/use-prd-autosave.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { savePrdField } from "../actions";
import {
  createPrdAutosaver,
  type FieldSaveState,
} from "../prd-autosave";

export function usePrdAutosave(roomId: string) {
  const [states, setStates] = useState<Record<string, FieldSaveState>>({});

  const autosaver = useMemo(
    () =>
      createPrdAutosaver({
        write: async (field, value) => {
          const result = await savePrdField({ roomId, field, value });
          return result.status === "saved";
        },
        onStateChange: (field, state) =>
          setStates((current) => ({ ...current, [field]: state })),
      }),
    [roomId],
  );

  useEffect(() => () => autosaver.dispose(), [autosaver]);

  return {
    save: useCallback(
      (field: string, value: unknown) => autosaver.queue(field, value),
      [autosaver],
    ),
    retry: useCallback(
      (field: string) => autosaver.retry(field),
      [autosaver],
    ),
    stateFor: useCallback(
      (field: string): FieldSaveState => states[field] ?? "idle",
      [states],
    ),
  };
}
```

In `prd-editor.tsx`:

1. Delete `cloneDocument`, `isDirty`, `resetDraft`, `handleCancel`, `handleSave`, `useImperativeHandle`, `PrdEditorHandle`, `EditorActions`, `saveError`, `conflictVersion`, `isSaving`, and the `onDirtyChange` / `onSavingChange` effects.
2. Keep `draft` as local state — it is now the optimistic mirror of the live document, not a staged copy — and route every `setDraft` through one helper that also queues the save:

```tsx
const autosave = usePrdAutosave(prd.roomId);

function updateField<K extends keyof PRDDocument>(
  field: K,
  value: PRDDocument[K],
) {
  setDraft((current) => {
    const next = { ...current, [field]: value };
    onDocumentChange(next);
    return next;
  });
  autosave.save(field, value);
}
```

3. Replace every inline `setDraft((current) => ({ ...current, [section.field]: nextValue }))` with `updateField(section.field, nextValue)`. For `mvpScope`, compute the whole scope object and call `updateField("mvpScope", nextScope)` — the field is the unit of a write, so both halves go together.
4. Render the per-field status beside each section heading:

```tsx
{autosave.stateFor(section.field) === "error" ? (
  <HStack gap={2} vAlign="center">
    <Text color="secondary">Not saved</Text>
    <Button
      label={`Retry saving ${section.label}`}
      variant="ghost"
      size="sm"
      onClick={() => autosave.retry(section.field)}
    />
  </HStack>
) : null}
```

5. Delete the `EditorActions` element at the end of the component.

In `prd-header.tsx`, delete the `isEditing` branch that renders Cancel / Save changes and the `isDirty` token, and replace with a single toggle:

```tsx
{isEditing ? (
  <Button label="Done" variant="secondary" onClick={onDone} />
) : (
  <>
    {canEdit ? (
      <Button
        label="Edit"
        variant="ghost"
        icon={<EditIcon pack="basic" size="sm" />}
        onClick={onEdit}
      />
    ) : null}
    {canAccept && status === "draft" ? (
      <Button label="Accept version" variant="primary" onClick={onAccept} />
    ) : null}
  </>
)}
```

In `prd-document.tsx`, delete `editorRef`, `isDirty`, `isSaving`, `handleSaved`, and the `PrdEditor` props that no longer exist; pass `onDocumentChange` to keep `currentPrd.document` in sync for the outline and the read view.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- prd-editor prd-document`
Expected: PASS.

- [ ] **Step 5: Check conventions and commit**

```bash
pnpm --filter web test && pnpm typecheck && pnpm lint && pnpm check:astryx
git add apps/web/src/features/prd/components
git commit -m "feat(prd): autosave the document and drop save/cancel"
```

---

### Task 6: Acceptance no longer locks the document

**Files:**
- Modify: `apps/web/src/features/prd/components/prd-document.tsx`
- Modify: `apps/web/src/features/prd/components/prd-header.tsx`
- Modify: `apps/web/src/features/prd/components/prd-version-history.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Test: `apps/web/src/features/prd/components/prd-version-history.test.tsx`

**Interfaces:**
- Consumes: `acceptPrd` (Task 3), `PrdVersion` (Task 3).
- Produces: `PrdVersionHistory` props become `{ versions: PrdVersion[]; currentPrd: RoomPrd; isOpen: boolean; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/features/prd/components/prd-version-history.test.tsx`:

```tsx
it("shows the live document above the frozen versions", () => {
  render(
    <PrdVersionHistory
      currentPrd={{ ...prd, version: 3, status: "accepted" }}
      versions={[
        { id: "v2", roomId: prd.roomId, version: 2, document: prd.document,
          settledAt: "2026-08-07T00:00:00.000Z", settledBy: prd.ownerId },
        { id: "v1", roomId: prd.roomId, version: 1, document: prd.document,
          settledAt: "2026-08-06T00:00:00.000Z", settledBy: prd.ownerId },
      ]}
      isOpen
      onOpenChange={() => {}}
    />,
  );

  expect(screen.getByText("v3")).toBeVisible();
  expect(screen.getByText("Current")).toBeVisible();
  expect(screen.getByText("v2")).toBeVisible();
  expect(screen.getByText("v1")).toBeVisible();
});

it("shows only the live document when nothing has been frozen yet", () => {
  render(
    <PrdVersionHistory
      currentPrd={{ ...prd, version: 1, status: "draft" }}
      versions={[]}
      isOpen
      onOpenChange={() => {}}
    />,
  );

  expect(screen.getByText("v1")).toBeVisible();
  expect(screen.getByText("No earlier versions yet.")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test -- prd-version-history`
Expected: FAIL — the component still takes `history: RoomPrd[]`.

- [ ] **Step 3: Write the implementation**

`prd-version-history.tsx`: take `versions: PrdVersion[]`, render the live document first with a `Current` token and its derived `version`, then each frozen version newest-first with its `settledAt`. When `versions` is empty, render `No earlier versions yet.`

`prd-document.tsx`:
- Replace `history`/`currentHistory`/`mergePrdHistory` with `versions: PrdVersion[]`.
- Delete `lastAcceptedVersion` — status is now on the live document itself.
- Point `handleAccept` at `acceptPrd({ roomId: currentPrd.roomId })`, and let it succeed whatever the status; on success set `currentPrd` from the result.
- Update the dialog copy so it no longer claims irreversibility:

```tsx
<DialogHeader
  title={`Accept v${currentPrd.version}?`}
  subtitle="This records the current state as the decision. You can keep editing afterwards; the next edit starts a new version."
/>
```

`page.tsx`: call `getRoomPrdVersions({ roomId })` and pass `versions` instead of `history`; drop `history[0]` and read the live document with `getRoomPrd({ roomId })`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter web test -- prd/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm check:astryx
git add apps/web/src/features/prd apps/web/src/app
git commit -m "feat(prd): acceptance records a decision without locking the document"
```

---

### Task 7: End-to-end proof

**Files:**
- Modify: `e2e/prd-edit-acceptance.spec.ts`
- Modify: `apps/web/src/features/discovery/fake-backend.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: no new exports.

- [ ] **Step 1: Write the failing E2E test**

Replace the save-driven flow in `e2e/prd-edit-acceptance.spec.ts` with:

```ts
test("edits autosave, and a version is frozen only after acceptance", async ({
  page,
}) => {
  await openPrdTab(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Executive summary")
    .fill("A sharper summary");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("A sharper summary")).toBeVisible();

  // Nothing frozen yet: editing alone never creates a version.
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  await expect(page.getByText("No earlier versions yet.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Accept version" }).click();
  await page.getByRole("button", { name: "Confirm acceptance" }).click();
  await expect(page.getByText("Accepted")).toBeVisible();

  // Still editable after acceptance, and that edit cuts the version.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Executive summary").fill("Sharper still");
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  await expect(page.getByText("v1")).toBeVisible();
  await expect(page.getByText("v2")).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec playwright test e2e/prd-edit-acceptance.spec.ts`
Expected: FAIL — the fake backend still versions on every save.

- [ ] **Step 3: Update the fake backend**

In `fake-backend.ts`, hold one live document per room plus a `frozen: PrdVersion[]` array, and implement `saveRoomPrdField` and `acceptRoomPrd` with the same lazy-cut rule as the migration: freeze before a write when `settledRevision === revision`, then apply. The fake must reproduce the rule, not approximate it — this spec is the only place the whole flow is exercised.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec playwright test e2e/prd-edit-acceptance.spec.ts`
Expected: PASS.

- [ ] **Step 5: Full verification and commit**

```bash
supabase db reset && supabase test db
pnpm --filter web test && pnpm typecheck && pnpm lint && pnpm check:astryx && pnpm build
git add e2e apps/web/src/features/discovery
git commit -m "test(prd): prove autosave and lazy versioning end to end"
```

---

## Follow-on

Section-scoped agent edits build on this and are planned separately in
`docs/design/plans/2026-08-08-prd-section-scoped-agent-edits.md`. Do not start
it until this plan's Task 7 is green: proposals apply by splicing one field into
the live document, which does not exist until Task 1 lands.
