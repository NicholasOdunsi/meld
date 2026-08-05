# PRD View & Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Discovery Room produce a PRD from natural conversation and read it in a new PRD tab — a first-class `prds` table, a Notion-style read-only document view, and a natural-language → one-tap-confirm generation trigger that runs on the user's own device.

**Architecture:** A new `public.prds` table (participant-scoped RLS) is materialized by an `after update` trigger on `ai_tasks` when a `prd_generate` task completes — reusing the existing durable-task pipeline unchanged. The web app reads it through a new `features/prd/` feature (reads in `queries.ts`, writes in `actions.ts`, DB access behind `repository.ts`). The Discovery Room page gains a `TabList` strip (`?tab=` URL state) that swaps `Conversation` for a `PrdDocument`. Generation is triggered by the room-reply agent emitting an optional `proposedAction`, rendered as a confirm chip whose click creates a `prd_generate` task via a new `create_prd_generate_task` RPC.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), Supabase Postgres + RLS + pgTAP, Zod contracts (`@meld/contracts`), Astryx design system, the connector task pipeline (`apps/connector`), Playwright E2E, Vitest.

## Global Constraints

- **Node 20.19.0**, **pnpm 10.28.1** (`.nvmrc`, `package.json`). Run commands as `pnpm --filter web ...`, `pnpm --filter @meld/contracts ...`, `pnpm --filter connector ...`.
- **UI: Astryx only — no raw `<div>`/`<span>`, no hardcoded hex/px.** Use component props first, else `style`/`className` with tokens `var(--color-*|--spacing-*|--radius-*)`. `pnpm check:astryx` enforces this. Inspect any component before use: `pnpm exec astryx component <Name>`.
- **Import Astryx per-component**: `import { X } from "@astryxdesign/core/X";` (never a barrel).
- **Reads vs writes**: read-only exports live in `queries.ts` (`import "server-only"`); mutations live in `actions.ts` (`"use server"`). Never put a read export in a `"use server"` file.
- **Authorization is in the database (RLS), never only in TypeScript.** Every new table enables RLS; all writes go through `security definer` RPCs/triggers with `set search_path = ''`.
- **Migrations** are named `<YYYYMMDD><NNNN>_<slug>.sql`; the next free name today is `202608020003_...`. Bump `NNNN` for each additional migration in this plan.
- **Server Supabase client**: `const supabase = await createClient(new Headers());` from `@/lib/supabase/server`, then authenticate with `await supabase.auth.getClaims()` (prefer over `getUser()`).
- The `ai_task_kind` enum already contains `prd_generate` and `prd_revise`; `PRDDocumentSchema` already exists in `packages/contracts/src/prd.ts` and is barrel-exported. Do not recreate them.
- A task's `result_json` stores the **whole envelope** `{ kind, payload, partial }`; content is at `result_json -> 'payload'`.

---

# Phase A — PRD storage & viewing

Ships a visible, RLS-protected PRD tab. Testable end-to-end by seeding a `prds` row (directly and via the materialization trigger). No connector or generation work.

---

### Task 1: `prds` table, RLS, and materialization trigger

**Files:**
- Create: `supabase/migrations/202608020003_prds.sql`
- Create (test): `supabase/tests/prds.test.sql`

**Interfaces:**
- Produces: table `public.prds (id, room_id, organization_id, version, status, document, owner_id, source_task_id, created_at, updated_at)`; enum `public.prd_status ('draft')`; trigger `ai_tasks_materialize_prd` calling `public.materialize_prd_from_task()`. Read access: `select` for room participants only; no direct writes for `authenticated`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/prds.test.sql`. It mirrors the fixture idioms in `supabase/tests/ai_task_transitions.test.sql` (users → org → membership → `discovery_rooms` with `owner_id`; the owner is auto-enrolled as a participant by the `add_room_owner_participant` trigger). Use a `prd_generate` `ai_tasks` row created as table owner, then simulate settlement by updating it, and assert a `prds` row appears with the right version and RLS.

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- Two users, two orgs, one room owned by user A, user C is an outsider.
insert into auth.users (id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','outsider-c@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.organizations (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000001','Org A','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','Org C','10000000-0000-4000-8000-000000000003');

insert into public.memberships (organization_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','admin'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','admin');

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Room A','10000000-0000-4000-8000-000000000001');

-- A prd_generate task in the room, still running (result not yet set).
insert into public.execution_devices (id, user_id, status)
  values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active');
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Generate a PRD','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

-- No PRD exists while the task is running.
select is((select count(*)::int from public.prds), 0, 'no prd before task completes');

-- Simulate settle_ai_task completion: status -> completed, result_json = envelope.
update public.ai_tasks
set status = 'completed',
    result_json = jsonb_build_object(
      'kind','prd_generate','partial',false,
      'payload', jsonb_build_object('title','Checkout redesign','executiveSummary','x'))
where id = '60000000-0000-4000-8000-000000000001';

-- Trigger materialized exactly one draft PRD at version 1.
select is((select count(*)::int from public.prds), 1, 'trigger inserts one prd on completion');
select is((select version from public.prds limit 1), 1, 'first prd is version 1');
select is((select status::text from public.prds limit 1), 'draft', 'prd status is draft');
select is((select document ->> 'title' from public.prds limit 1), 'Checkout redesign', 'document payload stored');
select is((select owner_id from public.prds limit 1), '10000000-0000-4000-8000-000000000001'::uuid, 'owner is room owner');

-- A second completed task bumps the version.
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Regenerate','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);
update public.ai_tasks set status='completed',
  result_json = jsonb_build_object('kind','prd_generate','partial',false,
    'payload', jsonb_build_object('title','Checkout redesign v2','executiveSummary','y'))
where id = '60000000-0000-4000-8000-000000000002';
select is((select max(version) from public.prds), 2, 'second completion is version 2');

-- RLS: a signed-in participant (owner) can read; an outsider cannot.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.prds), 2, 'room participant sees both prds');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.prds), 0, 'outsider sees no prds');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/prds.test.sql`
Expected: FAIL — `relation "public.prds" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608020003_prds.sql`:

```sql
-- A generated PRD for a Discovery Room. One row per generated version; the
-- latest version is the current draft. Materialized by a trigger when a
-- prd_generate ai_task completes, so the browser never needs task result_json
-- (which RLS deliberately hides). Acceptance/immutability arrive in a later pass;
-- for now every row is status 'draft'.
create type public.prd_status as enum ('draft');

create table public.prds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  status public.prd_status not null default 'draft',
  document jsonb not null,
  owner_id uuid not null references auth.users(id),
  source_task_id uuid references public.ai_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, version),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

alter table public.prds
  add constraint prds_document_size
    check (pg_column_size(document) <= 262144);

create index prds_room_version_idx on public.prds (room_id, version desc);

-- Materialize a PRD row when a prd_generate task completes. Runs as the table
-- owner (security definer semantics of a trigger), so it can write prds while
-- authenticated callers cannot. The document is the settled envelope payload.
create function public.materialize_prd_from_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  room_owner uuid;
  next_version integer;
begin
  if new.kind <> 'prd_generate'
    or new.status <> 'completed'
    or new.result_json is null
    or old.status = 'completed'
  then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'title') <> 'string'
  then
    return new;
  end if;

  select room.owner_id into room_owner
  from public.discovery_rooms as room
  where room.id = new.room_id;

  select coalesce(max(prd.version), 0) + 1 into next_version
  from public.prds as prd
  where prd.room_id = new.room_id;

  insert into public.prds (
    room_id, organization_id, version, status, document, owner_id, source_task_id)
  values (
    new.room_id, new.organization_id, next_version, 'draft', payload,
    room_owner, new.id);

  return new;
end;
$$;

create trigger ai_tasks_materialize_prd
  after update on public.ai_tasks
  for each row
  execute function public.materialize_prd_from_task();

-- RLS: participants read; writes only via the trigger (definer). Mirrors the
-- ai_tasks grant model (select-only to authenticated).
alter table public.prds enable row level security;

revoke all on table public.prds from anon;
revoke all privileges on table public.prds from authenticated, service_role;
grant select on table public.prds to authenticated, service_role;

create policy "Room participants can view PRDs"
on public.prds
for select
to authenticated
using (public.is_room_participant(room_id));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/prds.test.sql`
Expected: `ok` for all 9, ending `# Looks like you passed`. (The file wraps itself in `begin; … rollback;`, so it leaves the dev DB untouched.)

- [ ] **Step 5: Record the migration locally and commit**

Register it so the local stack matches the repo (per the local-verification setup):
```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres \
  -c "insert into supabase_migrations.schema_migrations (version, name) values ('202608020003','prds') on conflict do nothing;"
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/migrations/202608020003_prds.sql
```
Then:
```bash
git add supabase/migrations/202608020003_prds.sql supabase/tests/prds.test.sql
git commit -m "feat(db): prds table with participant RLS and task materialization trigger"
```

---

### Task 2: PRD read path (`features/prd/` repository + query + `hasPrd`)

**Files:**
- Create: `apps/web/src/features/prd/schemas.ts`
- Create: `apps/web/src/features/prd/repository.ts`
- Create: `apps/web/src/features/prd/queries.ts`
- Create (test): `apps/web/src/features/prd/repository.test.ts`
- Modify: `apps/web/src/features/discovery/backend.ts` (add `hasPrd` to `DiscoveryRoomPageData`)
- Modify: `apps/web/src/features/discovery/supabase-backend.ts` (populate `hasPrd`)
- Modify: `apps/web/src/features/discovery/fake-backend.ts` (populate `hasPrd`)

**Interfaces:**
- Consumes: `PRDDocumentSchema`, `PRDDocument` from `@meld/contracts`; `createClient` from `@/lib/supabase/server`.
- Produces:
  - `RoomPrdSchema` (Zod) and `type RoomPrd = { id: string; roomId: string; version: number; status: "draft"; document: PRDDocument; ownerId: string; createdAt: string; updatedAt: string }`.
  - `createPrdRepository(supabase): { getRoomPrd(roomId: string): Promise<RoomPrd | null>; roomHasPrd(roomId: string): Promise<boolean> }`.
  - `getRoomPrd(input: { roomId: string }): Promise<RoomPrd | null>` from `queries.ts`.
  - `DiscoveryRoomPageData` gains `hasPrd: boolean`.

- [ ] **Step 1: Write the failing repository test**

Create `apps/web/src/features/prd/repository.test.ts`. Follow the existing discovery repository test style (a fake `SupabaseClient` with a chainable query builder). Assert `getRoomPrd` returns the latest version parsed through the schema, and `null` when none.

```ts
import { describe, expect, it } from "vitest";
import { createPrdRepository } from "./repository";

function fakeSupabase(row: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => builder } as never;
}

const dbRow = {
  id: "00000000-0000-4000-8000-000000000001",
  room_id: "40000000-0000-4000-8000-000000000001",
  version: 2,
  status: "draft",
  document: { title: "Checkout redesign", executiveSummary: "", problemAndEvidence: "",
    targetUsersAndUseCases: "", goalsNonGoalsAndMetrics: "", proposedSolution: "",
    userJourneys: "", functionalRequirements: [], nonFunctionalRequirements: [],
    uxStatesAndEdgeCases: [], dependenciesAndConstraints: [], risksAndMitigations: [],
    mvpScope: { included: [], excluded: [] }, acceptanceCriteria: [], openQuestions: [],
    decisionHistory: [] },
  owner_id: "10000000-0000-4000-8000-000000000001",
  created_at: "2026-08-02T10:35:00.000Z",
  updated_at: "2026-08-02T10:35:00.000Z",
};

describe("createPrdRepository.getRoomPrd", () => {
  it("returns the latest PRD parsed through the contract", async () => {
    const repo = createPrdRepository(fakeSupabase(dbRow));
    const prd = await repo.getRoomPrd("40000000-0000-4000-8000-000000000001");
    expect(prd?.version).toBe(2);
    expect(prd?.document.title).toBe("Checkout redesign");
  });

  it("returns null when the room has no PRD", async () => {
    const repo = createPrdRepository(fakeSupabase(null));
    expect(await repo.getRoomPrd("40000000-0000-4000-8000-000000000001")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/prd/repository.test.ts`
Expected: FAIL — cannot find `./repository`.

- [ ] **Step 3: Write `schemas.ts`**

```ts
import { PRDDocumentSchema } from "@meld/contracts";
import { z } from "zod";

export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.literal("draft"),
  document: PRDDocumentSchema,
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoomPrd = z.infer<typeof RoomPrdSchema>;

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
```

- [ ] **Step 4: Write `repository.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { RoomPrdSchema, type RoomPrd } from "./schemas";

export function createPrdRepository(supabase: SupabaseClient) {
  return {
    async getRoomPrd(roomId: string): Promise<RoomPrd | null> {
      const { data, error } = await supabase
        .from("prds")
        .select(
          "id, room_id, version, status, document, owner_id, created_at, updated_at",
        )
        .eq("room_id", roomId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Could not load the PRD.");
      if (!data) return null;
      return RoomPrdSchema.parse({
        id: data.id,
        roomId: data.room_id,
        version: data.version,
        status: data.status,
        document: data.document,
        ownerId: data.owner_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    },
    async roomHasPrd(roomId: string): Promise<boolean> {
      const { count, error } = await supabase
        .from("prds")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);
      if (error) throw new Error("Could not check for a PRD.");
      return (count ?? 0) > 0;
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/prd/repository.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Write `queries.ts` (read-only, `server-only`)**

```ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createPrdRepository } from "./repository";
import { RoomPrdInputSchema, type RoomPrd } from "./schemas";

export async function getRoomPrd(input: {
  roomId: string;
}): Promise<RoomPrd | null> {
  const { roomId } = RoomPrdInputSchema.parse(input);
  const supabase = await createClient(new Headers());
  return createPrdRepository(supabase).getRoomPrd(roomId);
}
```

- [ ] **Step 7: Add `hasPrd` to the discovery page data (type + both backends)**

In `apps/web/src/features/discovery/backend.ts`, add to the `DiscoveryRoomPageData` type (after `messages`):
```ts
  hasPrd: boolean;
```
In `apps/web/src/features/discovery/supabase-backend.ts`, inside `getRoomPageData`, add a PRD-existence check to the existing `Promise.all` and return it. Import at top: `import { createPrdRepository } from "@/features/prd/repository";`. Where the function currently returns the page-data object, add `hasPrd`:
```ts
      hasPrd: await createPrdRepository(supabase).roomHasPrd(roomId),
```
In `apps/web/src/features/discovery/fake-backend.ts`, return `hasPrd: false` in its `getRoomPageData` result (the fake path has no PRDs unless a test seeds one — see Task 6).

- [ ] **Step 8: Verify typecheck and commit**

Run: `pnpm --filter web typecheck`
Expected: PASS (no missing-property errors on `DiscoveryRoomPageData`).
```bash
git add apps/web/src/features/prd apps/web/src/features/discovery/backend.ts \
  apps/web/src/features/discovery/supabase-backend.ts apps/web/src/features/discovery/fake-backend.ts
git commit -m "feat(prd): read path — repository, query, and hasPrd on room page data"
```

---

### Task 3: Room tab strip (`Conversation` / `PRD`, URL-driven)

**Files:**
- Create: `apps/web/src/features/prd/components/room-tab-strip.tsx`
- Create (test): `apps/web/src/features/prd/components/room-tab-strip.test.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`

**Interfaces:**
- Consumes: `hasPrd: boolean` and the resolved active tab.
- Produces: `type RoomTab = "conversation" | "prd"`; `<RoomTabStrip activeTab hasPrd basePath />` where `basePath` is `/${organizationId}/discovery/${roomId}`. Renders Astryx `TabList` + `Tab`; each `Tab` uses `href={`${basePath}?tab=…`}` so navigation is a normal link (server-resolved). `parseRoomTab(searchParam, hasPrd): RoomTab` clamps `?tab=prd` to `conversation` when no PRD exists.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/prd/components/room-tab-strip.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoomTabStrip, parseRoomTab } from "./room-tab-strip";

describe("parseRoomTab", () => {
  it("defaults to conversation", () => {
    expect(parseRoomTab(undefined, true)).toBe("conversation");
  });
  it("clamps prd to conversation when no PRD exists", () => {
    expect(parseRoomTab("prd", false)).toBe("conversation");
  });
  it("honors prd when a PRD exists", () => {
    expect(parseRoomTab("prd", true)).toBe("prd");
  });
});

describe("RoomTabStrip", () => {
  it("hides the PRD tab until a PRD exists", () => {
    const { rerender } = render(
      <RoomTabStrip activeTab="conversation" hasPrd={false} basePath="/o/discovery/r" />,
    );
    expect(screen.queryByText("PRD")).toBeNull();
    rerender(
      <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/discovery/r" />,
    );
    expect(screen.getByText("PRD")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Inspect the components, then run the test to see it fail**

Run: `pnpm exec astryx component TabList` (confirm `value`/`onChange`/`Tab` `href`, `icon`, `endContent` props).
Run: `pnpm --filter web exec vitest run src/features/prd/components/room-tab-strip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `room-tab-strip.tsx`**

```tsx
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Tab, TabList } from "@astryxdesign/core/TabList";

export type RoomTab = "conversation" | "prd";

export function parseRoomTab(
  raw: string | undefined,
  hasPrd: boolean,
): RoomTab {
  if (raw === "prd" && hasPrd) return "prd";
  return "conversation";
}

export function RoomTabStrip({
  activeTab,
  hasPrd,
  basePath,
}: {
  activeTab: RoomTab;
  hasPrd: boolean;
  basePath: string;
}) {
  // TabList is controlled by `value`; navigation is via each Tab's href so a
  // shared link deep-links to the right surface. onChange is a required prop but
  // the href drives the actual navigation, so it is a no-op here.
  return (
    <TabList value={activeTab} onChange={() => {}} hasDivider size="md">
      <Tab
        value="conversation"
        label="Conversation"
        href={`${basePath}?tab=conversation`}
      />
      {hasPrd ? (
        <Tab
          value="prd"
          label="PRD"
          href={`${basePath}?tab=prd`}
          endContent={<StatusDot variant="neutral" label="Draft" />}
        />
      ) : null}
    </TabList>
  );
}
```
(If `astryx component StatusDot` shows `neutral` is not a valid `variant`, use the nearest muted variant it lists — do not invent one.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/prd/components/room-tab-strip.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount the strip in the room page and read `?tab=`**

Edit `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`. Add `searchParams` to the signature and resolve the tab; render the strip at the top of `LayoutContent`, then branch between `Conversation` and the PRD view (the PRD view component lands in Task 4 — for this step render a placeholder `EmptyState` so the branch compiles and is visible):

```tsx
export default async function DiscoveryRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string; roomId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { organizationId, roomId } = await params;
  const { tab } = await searchParams;
  const data = await getDiscoveryRoomPageData({ organizationId, roomId });
  if (!data) redirect(`/${organizationId}`);

  const basePath = `/${organizationId}/discovery/${roomId}`;
  const activeTab = parseRoomTab(tab, data.hasPrd);
```
Inside `LayoutContent` (keep `padding={0}`), wrap the tab strip + surface in an Astryx `VStack` (`import { VStack } from "@astryxdesign/core/VStack";`), height-filling:
```tsx
        <VStack gap={0} width="100%" height="100%">
          <RoomTabStrip activeTab={activeTab} hasPrd={data.hasPrd} basePath={basePath} />
          {activeTab === "prd" ? (
            <EmptyState title="PRD" description="PRD document goes here." />
          ) : (
            <Conversation
              roomId={roomId}
              /* …existing props unchanged… */
            />
          )}
        </VStack>
```
Add imports: `RoomTabStrip`, `parseRoomTab` from `@/features/prd/components/room-tab-strip`, and `EmptyState` from `@astryxdesign/core/EmptyState`.

- [ ] **Step 6: Verify, screenshot the tab, and commit**

Run: `pnpm --filter web typecheck && pnpm check:astryx apps/web/src/features/prd`
Expected: PASS, no raw-div violations.
Manually confirm at `http://localhost:3000/<org>/discovery/<room>?tab=conversation` the strip renders and the PRD tab is hidden (no PRD yet).
```bash
git add apps/web/src/features/prd/components/room-tab-strip.tsx \
  apps/web/src/features/prd/components/room-tab-strip.test.tsx \
  "apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx"
git commit -m "feat(prd): room tab strip with URL-driven Conversation/PRD switch"
```

---

### Task 4: PRD document view (header, outline, section renderers, citations)

**Files:**
- Create: `apps/web/src/features/prd/components/prd-document.tsx`
- Create: `apps/web/src/features/prd/components/prd-header.tsx`
- Create: `apps/web/src/features/prd/prd-sections.ts` (section metadata: id, label, kind)
- Create (test): `apps/web/src/features/prd/prd-sections.test.ts`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx` (fetch + render `PrdDocument`)

**Interfaces:**
- Consumes: `RoomPrd`, `getRoomPrd` (Task 2); the room owner name from `DiscoveryRoomPageData.participants`.
- Produces: `PRD_SECTIONS: { id: string; label: string; field: keyof PRDDocument; kind: "prose" | "list" | "mvp" | "risks" | "decisions" }[]`; `<PrdDocument prd ownerName basePath />` rendering an Astryx `Outline` (jump-nav) + one scrolling document. Decision citations link to `${basePath}?tab=conversation#message-<id>`.

- [ ] **Step 1: Write the failing section-metadata test**

Create `apps/web/src/features/prd/prd-sections.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PRD_SECTIONS } from "./prd-sections";

describe("PRD_SECTIONS", () => {
  it("covers every PRDDocument content field exactly once", () => {
    const fields = PRD_SECTIONS.map((s) => s.field);
    expect(new Set(fields).size).toBe(fields.length);
    // title is the page heading, not a body section.
    expect(fields).not.toContain("title");
    expect(fields).toEqual(
      expect.arrayContaining([
        "executiveSummary", "problemAndEvidence", "functionalRequirements",
        "mvpScope", "risksAndMitigations", "decisionHistory",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/prd/prd-sections.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `prd-sections.ts`**

```ts
import type { PRDDocument } from "@meld/contracts";

export type PrdSectionKind = "prose" | "list" | "mvp" | "risks" | "decisions";

export const PRD_SECTIONS: {
  id: string;
  label: string;
  field: keyof PRDDocument;
  kind: PrdSectionKind;
}[] = [
  { id: "executive-summary", label: "Executive summary", field: "executiveSummary", kind: "prose" },
  { id: "problem-evidence", label: "Problem & evidence", field: "problemAndEvidence", kind: "prose" },
  { id: "target-users", label: "Target users", field: "targetUsersAndUseCases", kind: "prose" },
  { id: "goals-metrics", label: "Goals & metrics", field: "goalsNonGoalsAndMetrics", kind: "prose" },
  { id: "proposed-solution", label: "Proposed solution", field: "proposedSolution", kind: "prose" },
  { id: "user-journeys", label: "User journeys", field: "userJourneys", kind: "prose" },
  { id: "functional-requirements", label: "Functional requirements", field: "functionalRequirements", kind: "list" },
  { id: "nonfunctional-requirements", label: "Non-functional requirements", field: "nonFunctionalRequirements", kind: "list" },
  { id: "ux-states", label: "UX states & edge cases", field: "uxStatesAndEdgeCases", kind: "list" },
  { id: "dependencies", label: "Dependencies & constraints", field: "dependenciesAndConstraints", kind: "list" },
  { id: "mvp-scope", label: "MVP scope", field: "mvpScope", kind: "mvp" },
  { id: "risks", label: "Risks & mitigations", field: "risksAndMitigations", kind: "risks" },
  { id: "acceptance-criteria", label: "Acceptance criteria", field: "acceptanceCriteria", kind: "list" },
  { id: "open-questions", label: "Open questions", field: "openQuestions", kind: "list" },
  { id: "decision-history", label: "Decision history", field: "decisionHistory", kind: "decisions" },
];
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/prd/prd-sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `prd-header.tsx` (Notion-style properties)**

Inspect first: `pnpm exec astryx component Heading` and `pnpm exec astryx component Text`. Build the title + property rows with `VStack`/`HStack`/`Text`/`Heading`/`StatusDot`/`Token` (no raw divs, tokens only):
```tsx
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { RoomPrd } from "../schemas";

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <HStack gap={3} align="center">
      <Text type="label" color="secondary" style={{ minWidth: "var(--spacing-32)" }}>
        {label}
      </Text>
      {children}
    </HStack>
  );
}

export function PrdHeader({ prd, ownerName }: { prd: RoomPrd; ownerName: string }) {
  return (
    <VStack gap={3} width="100%">
      <Heading level={1}>{prd.document.title}</Heading>
      <VStack gap={2}>
        <Property label="Owner"><Text>{ownerName}</Text></Property>
        <Property label="Version"><Token label={`v${prd.version}`} /></Property>
        <Property label="Status"><StatusDot variant="neutral" label="Draft" /></Property>
        <Property label="Created"><Text color="secondary">{new Date(prd.createdAt).toLocaleString()}</Text></Property>
      </VStack>
    </VStack>
  );
}
```
(Replace `--spacing-32` / `variant="neutral"` with real token/variant names if `astryx docs tokens` / `astryx component StatusDot` show different ones. `new Date(...).toLocaleString()` is acceptable here — it is display-only, not workflow logic.)

- [ ] **Step 6: Write `prd-document.tsx` (outline + sections)**

Inspect: `pnpm exec astryx component Outline`, `pnpm exec astryx component List`, `pnpm exec astryx component Markdown`. Implement one scrolling document with a sticky `Outline` built from `PRD_SECTIONS`, and a renderer per `kind`. Each section wrapper carries `id={section.id}` (via an Astryx element that accepts `id`, e.g. `VStack`) so the outline anchors resolve. Prose → `Markdown`; list → `List`/`ListItem`; mvp → two `List`s (Included/Excluded); risks → `List` of risk/mitigation; decisions → each decision with a `Token`/link citation to `${basePath}?tab=conversation#message-<id>`.

```tsx
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Outline } from "@astryxdesign/core/Outline";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import type { PRDDocument } from "@meld/contracts";
import { PRD_SECTIONS } from "../prd-sections";
import { PrdHeader } from "./prd-header";
import type { RoomPrd } from "../schemas";

function SectionBody({
  kind, value, basePath,
}: { kind: string; value: unknown; basePath: string }) {
  if (kind === "prose") {
    return <Markdown density="compact" contentWidth="100%">{String(value ?? "")}</Markdown>;
  }
  if (kind === "list") {
    return (
      <List density="compact" listStyle="disc">
        {(value as string[]).map((item, i) => <ListItem key={i} label={item} />)}
      </List>
    );
  }
  if (kind === "mvp") {
    const scope = value as PRDDocument["mvpScope"];
    return (
      <HStack gap={4} width="100%" align="start">
        <List density="compact" listStyle="disc" header={<Text type="label">Included</Text>}>
          {scope.included.map((item, i) => <ListItem key={i} label={item} />)}
        </List>
        <List density="compact" listStyle="disc" header={<Text type="label">Excluded</Text>}>
          {scope.excluded.map((item, i) => <ListItem key={i} label={item} />)}
        </List>
      </HStack>
    );
  }
  if (kind === "risks") {
    const risks = value as PRDDocument["risksAndMitigations"];
    return (
      <List density="compact">
        {risks.map((r, i) => <ListItem key={i} label={r.risk} description={r.mitigation} />)}
      </List>
    );
  }
  // decisions
  const decisions = value as PRDDocument["decisionHistory"];
  return (
    <VStack gap={3} width="100%">
      {decisions.map((d, i) => (
        <VStack key={i} gap={1}>
          <Text type="label">{d.decision}</Text>
          <Text color="secondary">{d.rationale}</Text>
          <HStack gap={2}>
            {d.sourceMessageIds.map((id) => (
              <Token key={id} label="source" href={`${basePath}?tab=conversation#message-${id}`} />
            ))}
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

export function PrdDocument({
  prd, ownerName, basePath,
}: { prd: RoomPrd; ownerName: string; basePath: string }) {
  const outlineItems = PRD_SECTIONS.map((s) => ({ id: s.id, label: s.label, level: 1 as const }));
  return (
    <HStack gap={0} width="100%" height="100%" align="start">
      <Outline items={outlineItems} label="On this page" />
      <VStack gap={5} width="100%" style={{ padding: "var(--spacing-5)", overflowY: "auto" }}>
        <PrdHeader prd={prd} ownerName={ownerName} />
        {PRD_SECTIONS.map((s) => (
          <VStack key={s.id} id={s.id} gap={2} width="100%">
            <Text type="label">{s.label}</Text>
            <SectionBody kind={s.kind} value={prd.document[s.field]} basePath={basePath} />
          </VStack>
        ))}
      </VStack>
    </HStack>
  );
}
```
(Confirm `Outline`, `List`, `Token`, `VStack` accept `id`/the props used; adjust prop names to whatever `astryx component <Name>` reports. Do not hand-roll CSS beyond token-based `style`.)

- [ ] **Step 7: Fetch and render `PrdDocument` in the room page**

In `page.tsx`, when `activeTab === "prd"`, replace the Task 3 placeholder `EmptyState` with a fetched document. Add:
```tsx
  const prd = activeTab === "prd" ? await getRoomPrd({ roomId }) : null;
  const ownerName =
    data.participants.find((p) => p.id === data.room.ownerId)?.name ?? "Unknown";
```
and render:
```tsx
          {activeTab === "prd" && prd ? (
            <PrdDocument prd={prd} ownerName={ownerName} basePath={basePath} />
          ) : activeTab === "prd" ? (
            <EmptyState title="No PRD yet" description="Ask the agent to draft one." />
          ) : (
            <Conversation /* …unchanged… */ />
          )}
```
Add imports: `getRoomPrd` from `@/features/prd/queries`, `PrdDocument` from `@/features/prd/components/prd-document`. (Confirm the participant view type exposes `id`/`name`; adjust the `.find` key to the real field.)

- [ ] **Step 8: Verify and commit**

Run: `pnpm --filter web exec vitest run src/features/prd && pnpm --filter web typecheck && pnpm check:astryx apps/web/src/features/prd`
Expected: PASS on all.
```bash
git add apps/web/src/features/prd "apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx"
git commit -m "feat(prd): read-only PRD document view with outline, sections, and citations"
```

---

### Task 5: E2E — view a seeded PRD

**Files:**
- Modify: `apps/web/src/features/discovery/fake-backend.ts` (seed a PRD when an env flag is set)
- Create (test): `e2e/prd-view.spec.ts`

**Interfaces:**
- Consumes: the fake-backend gate `MELD_E2E_FAKE_DISCOVERY` (already used by the app). Add a fake PRD keyed to the fake room so `hasPrd` is true and `getRoomPrd` returns it. Because `getRoomPrd` reads Supabase directly, route the PRD read through the discovery backend abstraction in the fake path, OR expose a fake `getRoomPrd`. Simplest: add `getRoomPrd` to the `DiscoveryBackend` interface and call the backend from `queries.ts` instead of the repository directly when the fake gate is on (mirrors how discovery reads already branch on `getDiscoveryBackend()`).

- [ ] **Step 1: Route the PRD read through the backend and seed the fake**

Add to the `DiscoveryBackend` type in `backend.ts`: `getRoomPrd(input: { roomId: string }): Promise<RoomPrd | null>;`. Implement it in `supabase-backend.ts` (delegate to `createPrdRepository(supabase).getRoomPrd`) and in `fake-backend.ts` (return a canned `RoomPrd` with `hasPrd: true` for the fake room). Update `features/prd/queries.ts:getRoomPrd` to call `getDiscoveryBackend()` when the fake gate is enabled — reuse the existing `isDiscoveryFakeEnabled()` helper the discovery actions already use.

- [ ] **Step 2: Write the failing E2E**

Create `e2e/prd-view.spec.ts` (follow the auth-cookie + fake-workspace pattern in existing `e2e/*.spec.ts`):
```ts
import { expect, test } from "@playwright/test";

test("a room with a PRD shows the PRD tab and renders the document", async ({ page }) => {
  await page.goto("/e2e-org/discovery/e2e-room?tab=conversation");
  await expect(page.getByRole("tab", { name: "PRD" })).toBeVisible();
  await page.getByRole("tab", { name: "PRD" }).click();
  await expect(page).toHaveURL(/tab=prd/);
  await expect(page.getByRole("heading", { name: "Checkout redesign" })).toBeVisible();
  await expect(page.getByText("Executive summary")).toBeVisible();
});
```
(Use the real fake org/room slugs the other specs use; adjust selectors to the real accessible names once `astryx component TabList` confirms whether `Tab` exposes `role="tab"`.)

- [ ] **Step 3: Run to verify it fails, then passes**

Run: `pnpm --filter web exec playwright test e2e/prd-view.spec.ts`
Expected: FAIL first (no fake PRD), PASS after Step 1 seeding is wired.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/features/discovery/backend.ts apps/web/src/features/discovery/supabase-backend.ts \
  apps/web/src/features/discovery/fake-backend.ts apps/web/src/features/prd/queries.ts e2e/prd-view.spec.ts
git commit -m "test(prd): e2e viewing a seeded PRD through the fake backend"
```

---

# Phase B — PRD generation trigger & connector

Adds the human-facing generation flow: natural-language intent → confirm chip → `prd_generate` task on the user's device → the Phase-A trigger materializes the PRD → the tab appears.

---

### Task 6: `create_prd_generate_task` RPC

**Files:**
- Create: `supabase/migrations/202608020004_create_prd_generate_task.sql`
- Create (test): `supabase/tests/create_prd_generate_task.test.sql`

**Interfaces:**
- Produces: `public.create_prd_generate_task(target_room_id uuid, target_provider public.ai_provider default null) returns jsonb`, granted to `authenticated`. Resolves the caller's default device/provider exactly like `create_room_reply_task`, freezes the room manifest, inserts a `prd_generate` `ai_tasks` row with a fixed instruction, returns the task as camelCase JSON.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/create_prd_generate_task.test.sql` modeled on `ai_task_transitions.test.sql`. Seed org/user/membership/room (owner auto-participant), a saved default device + provider in `ai_user_preferences`, an active `execution_devices` row, and a matching `installed/authenticated/supported` `provider_connections` row. Then:
```sql
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$ select public.create_prd_generate_task('40000000-0000-4000-8000-000000000001') $$,
  'participant with a ready device can start PRD generation');

select is(
  (select kind::text from public.ai_tasks where room_id = '40000000-0000-4000-8000-000000000001'),
  'prd_generate', 'creates a prd_generate task');

-- Non-participant is rejected with the app error code.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.create_prd_generate_task('40000000-0000-4000-8000-000000000001') $$,
  'P0001', null, 'non-participant cannot start PRD generation');
```
Wrap in `begin; … select plan(3); … select * from finish(); rollback;`. (Copy the exact `ai_user_preferences` / `provider_connections` insert column lists from `ai_task_transitions.test.sql`, which already seeds a runnable device for `create_room_reply_task`.)

- [ ] **Step 2: Run to verify it fails**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/create_prd_generate_task.test.sql`
Expected: FAIL — `function public.create_prd_generate_task(uuid) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608020004_create_prd_generate_task.sql`. It is `create_room_reply_task` with the source-message binding removed and the room passed directly. Copy the device-resolution block (default device + provider from `ai_user_preferences`, active-device check, provider-connection check) and the manifest-freeze block verbatim from `202607290002_room_agent_messages.sql:195-269`, then insert with `kind = 'prd_generate'` and a fixed instruction:

```sql
create function public.create_prd_generate_task(
  target_room_id uuid,
  target_provider public.ai_provider default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_organization_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_prd_generate_request' using errcode = 'P0001';
  end if;

  select room.organization_id into target_organization_id
  from public.discovery_rooms as room
  where room.id = target_room_id;

  if target_organization_id is null
    or not public.is_room_participant(target_room_id)
  then
    raise exception 'invalid_prd_generate_request' using errcode = 'P0001';
  end if;

  -- Device/provider resolution — identical to create_room_reply_task.
  select preference.default_device_id,
         coalesce(target_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if resolved_device_id is null or resolved_provider is null then
    raise exception 'invalid_prd_generate_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.execution_devices as device
    where device.id = resolved_device_id and device.user_id = caller_id
      and device.status = 'active' and device.revoked_at is null
  ) then
    raise exception 'invalid_prd_generate_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.provider_connections as connection
    where connection.device_id = resolved_device_id
      and connection.user_id = caller_id
      and connection.provider = resolved_provider
      and connection.installation = 'installed'
      and connection.authentication = 'authenticated'
      and connection.compatibility = 'supported'
  ) then
    raise exception 'invalid_prd_generate_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id),'[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id),'[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id),'[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id),'[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id)
  );

  insert into public.ai_tasks (
    initiating_user_id, organization_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision)
  values (
    caller_id, target_organization_id, target_room_id, resolved_device_id,
    resolved_provider, 'prd_generate', 'queued',
    'Draft a full PRD from this room''s conversation, evidence, and decisions.',
    frozen_manifest, 0)
  returning * into result_task;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_prd_generate_task(uuid, public.ai_provider) from public;
revoke all on function public.create_prd_generate_task(uuid, public.ai_provider)
  from anon, authenticated, service_role;
grant execute on function public.create_prd_generate_task(uuid, public.ai_provider)
  to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/create_prd_generate_task.test.sql`
Expected: `ok 1..3`, passed.

- [ ] **Step 5: Register locally and commit**
```bash
docker exec -i supabase_db_meld psql -U postgres -d postgres \
  -c "insert into supabase_migrations.schema_migrations (version, name) values ('202608020004','create_prd_generate_task') on conflict do nothing;"
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/migrations/202608020004_create_prd_generate_task.sql
git add supabase/migrations/202608020004_create_prd_generate_task.sql supabase/tests/create_prd_generate_task.test.sql
git commit -m "feat(db): create_prd_generate_task RPC mirroring room-reply device resolution"
```

---

### Task 7: `proposedAction` on the room-reply reply (contract + message column + settle persistence)

**Files:**
- Modify: `packages/contracts/src/ai.ts` (add optional `proposedAction` to `RoomReplyResultSchema`)
- Create (test): `packages/contracts/src/ai.test.ts` (or extend the existing contracts test)
- Create: `supabase/migrations/202608020005_message_proposed_action.sql`
- Create (test): `supabase/tests/message_proposed_action.test.sql`
- Modify: `apps/web/src/features/discovery/*` (surface `proposedAction` on `DiscoveryMessage`)

**Interfaces:**
- Produces:
  - `RoomReplyResultSchema` gains `proposedAction: z.object({ kind: z.literal("prd_generate") }).nullable().optional()`.
  - `public.messages.proposed_action jsonb null` column; `settle_ai_task` persists `reply_payload -> 'proposedAction'` onto the inserted agent message.
  - `DiscoveryMessage` gains `proposedAction: { kind: "prd_generate" } | null`.

- [ ] **Step 1: Write the failing contract test**

In `packages/contracts/src/ai.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { RoomReplyResultSchema } from "./ai";

const base = {
  response: "Sure.", citedMessageIds: [], citedEvidenceIds: [],
  assumptions: [], suggestedNextQuestions: [],
};

describe("RoomReplyResultSchema.proposedAction", () => {
  it("accepts a reply with no proposedAction (back-compat)", () => {
    expect(RoomReplyResultSchema.parse(base).proposedAction ?? null).toBeNull();
  });
  it("accepts a prd_generate proposal", () => {
    const parsed = RoomReplyResultSchema.parse({ ...base, proposedAction: { kind: "prd_generate" } });
    expect(parsed.proposedAction?.kind).toBe("prd_generate");
  });
  it("rejects an unknown action kind", () => {
    expect(() => RoomReplyResultSchema.parse({ ...base, proposedAction: { kind: "delete_room" } })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts exec vitest run src/ai.test.ts`
Expected: FAIL — proposedAction not defined.

- [ ] **Step 3: Extend `RoomReplyResultSchema`**

In `packages/contracts/src/ai.ts`, add the field to the object (kept optional/nullable so every existing reply still parses):
```ts
  proposedAction: z
    .object({ kind: z.literal("prd_generate") })
    .nullable()
    .optional(),
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/contracts exec vitest run src/ai.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing message-column pgTAP**

Create `supabase/tests/message_proposed_action.test.sql`: after a `room_reply` task settles `complete` with a payload containing `proposedAction: { kind: "prd_generate" }`, the inserted agent message row has `proposed_action ->> 'kind' = 'prd_generate'`. Reuse the room-reply settlement fixture from `ai_task_transitions.test.sql` (device → task → attempt → `settle_ai_task(...)`), adding `proposedAction` to the payload object. Assert with `is((select proposed_action ->> 'kind' from public.messages where author_type = 'product_agent' …), 'prd_generate', …)`.

- [ ] **Step 6: Run to verify it fails**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/message_proposed_action.test.sql`
Expected: FAIL — column `proposed_action` does not exist.

- [ ] **Step 7: Write the migration**

Create `supabase/migrations/202608020005_message_proposed_action.sql`. Add the column, then `create or replace function public.settle_ai_task(...)` re-declaring the full current body (copy it verbatim from `202607290002_room_agent_messages.sql:638` onward) with two changes: (a) add a local `reply_proposed_action jsonb;`, set it from `reply_payload -> 'proposedAction'` inside the validated room-reply branch (only when `jsonb_typeof(...) in ('object')` and its `->>'kind' = 'prd_generate'`, else `null`), and (b) add `proposed_action` to the agent `insert into public.messages (...)` column list and `values (... reply_proposed_action ...)`.

```sql
alter table public.messages
  add column proposed_action jsonb;

-- Re-create settle_ai_task to persist a validated proposedAction onto the agent
-- message. Body is the current function verbatim plus the two marked additions.
-- (Copy 202607290002_room_agent_messages.sql:638-END, then apply the changes.)
```
> Implementer note: this is a hot-path function. Copy the existing body exactly, add only the `reply_proposed_action` extraction and the two insert-list additions, and change nothing else (lock order, fingerprint, status mapping, citation-subset check all stay byte-for-byte).

- [ ] **Step 8: Run to verify it passes; run the room-reply regression**

Run: `docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/message_proposed_action.test.sql`
Expected: PASS.
Run the existing settlement suite to prove no regression: apply the truncate-prepend and run `supabase/tests/ai_task_transitions.test.sql` (expected 240 tests green, per the recorded baseline).

- [ ] **Step 9: Surface `proposedAction` on `DiscoveryMessage`**

In the discovery message type + its row mapper (where `assumptions`/`suggestedNextQuestions` are mapped from the agent message row), add `proposedAction: row.proposed_action ?? null` typed as `{ kind: "prd_generate" } | null`. Update the fake message factory to default it to `null`.

- [ ] **Step 10: Verify and commit**

Run: `pnpm --filter @meld/contracts exec vitest run && pnpm --filter web typecheck`
```bash
git add packages/contracts/src/ai.ts packages/contracts/src/ai.test.ts \
  supabase/migrations/202608020005_message_proposed_action.sql \
  supabase/tests/message_proposed_action.test.sql apps/web/src/features/discovery
git commit -m "feat(prd): agent can propose prd_generate; persisted on the reply message"
```

---

### Task 8: Connector — emit `proposedAction` and execute `prd_generate`

**Files:**
- Modify: `apps/connector/src/tasks/product-agent-prompt.ts` (intent line + response schema `proposedAction`)
- Create: `apps/connector/src/tasks/prd-generate-prompt.ts` (system prompt + response schema)
- Modify: `apps/connector/src/tasks/task-executor.ts` (per-kind config; add `prd_generate`)
- Modify: `apps/connector/src/transport/gateway-client.ts` (widen `RoomReplyEnvelope.kind` to a union)
- Create (test): `apps/connector/src/tasks/task-executor.test.ts` (extend if it exists)

**Interfaces:**
- Consumes: `AIContextPackage`, `PRDDocumentSchema` from `@meld/contracts`; `RoomReplyResultSchema`.
- Produces: `EXECUTABLE_KINDS` includes `"prd_generate"`; a `TASK_CONFIG[kind] = { systemPrompt, responseSchema, resultSchema, envelopeKind }`; the executor returns `{ kind: "prd_generate", payload: PRDDocument, partial: false }`.

- [ ] **Step 1: Add `proposedAction` to the room-reply schema + prompt (intent detection)**

In `product-agent-prompt.ts`: add an optional `proposedAction` property to `ROOM_REPLY_RESPONSE_SCHEMA` (object with `kind` enum `["prd_generate"]`), NOT in `required`. Append one line to `PRODUCT_AGENT_SYSTEM_PROMPT` ground rules:
```
- When the team clearly wants to turn the discussion into a PRD, set proposedAction to { "kind": "prd_generate" } so the app can offer to generate it. Otherwise omit it. Do not generate the PRD yourself.
```
Bump `PRODUCT_AGENT_PROMPT_VERSION` to `"room-reply-v3"`.

- [ ] **Step 2: Write the `prd_generate` prompt + schema**

Create `apps/connector/src/tasks/prd-generate-prompt.ts`: a `PRD_GENERATE_SYSTEM_PROMPT` instructing a single coherent PRD from the supplied room context (reuse the untrusted-data + respond-only-from-context ground rules verbatim from the room-reply prompt), and a `PRD_GENERATE_RESPONSE_SCHEMA` (closed JSON schema mirroring `PRDDocumentSchema`'s shape: the prose string fields, the string arrays, `mvpScope`, `risksAndMitigations`, `decisionHistory`). Export `PRD_GENERATE_PROMPT_VERSION = "prd-generate-v1"`.

- [ ] **Step 3: Write the failing executor test**

In `apps/connector/src/tasks/task-executor.test.ts`, assert that a `prd_generate` payload (a context package with `kind: "prd_generate"`) is accepted (not rejected by `EXECUTABLE_KINDS`) and that a stubbed adapter returning a valid `PRDDocument` yields an envelope `{ kind: "prd_generate", partial: false }` whose `payload.title` round-trips. (Follow the existing room-reply executor test's adapter-stub pattern.)

- [ ] **Step 4: Run to verify it fails**

Run: `pnpm --filter connector exec vitest run src/tasks/task-executor.test.ts`
Expected: FAIL — connector rejects the kind / no PRD branch.

- [ ] **Step 5: Refactor `task-executor.ts` to a per-kind config**

Replace the four hardcoded room-reply points (`EXECUTABLE_KINDS`, workspace `responseSchema`, adapter `systemPrompt`, completion `RoomReplyResultSchema.parse` + envelope `kind`) with a lookup keyed by `context.kind`:
```ts
const TASK_CONFIG = {
  room_reply: {
    systemPrompt: PRODUCT_AGENT_SYSTEM_PROMPT,
    responseSchema: ROOM_REPLY_RESPONSE_SCHEMA,
    parseResult: (r: unknown) => RoomReplyResultSchema.parse(r),
    envelopeKind: "room_reply" as const,
  },
  prd_generate: {
    systemPrompt: PRD_GENERATE_SYSTEM_PROMPT,
    responseSchema: PRD_GENERATE_RESPONSE_SCHEMA,
    parseResult: (r: unknown) => PRDDocumentSchema.parse(r),
    envelopeKind: "prd_generate" as const,
  },
} as const;
const EXECUTABLE_KINDS = new Set(Object.keys(TASK_CONFIG));
```
Select `const config = TASK_CONFIG[context.kind]` after the guard, use `config.systemPrompt`/`config.responseSchema`/`config.parseResult`, and return `{ kind: config.envelopeKind, payload, partial: false }`. Widen the `RoomReplyEnvelope` return type (executor + `gateway-client.ts:86`) to `{ kind: "room_reply" | "prd_generate"; payload: unknown; partial: false }` (rename to `TaskResultEnvelope` if clearer). Also thread the correct `buildProductAgentInput` vs a PRD input builder — for `prd_generate` the same context stripping applies (reuse `buildProductAgentInput`, which is kind-agnostic and already sets `kind`).

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter connector exec vitest run src/tasks/task-executor.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

Run: `pnpm --filter connector typecheck && pnpm --filter connector exec vitest run`
```bash
git add apps/connector/src/tasks apps/connector/src/transport/gateway-client.ts
git commit -m "feat(connector): emit prd_generate proposals and execute prd_generate tasks"
```

---

### Task 9: `generatePrd` action + confirm chip + generating state

**Files:**
- Create: `apps/web/src/features/prd/actions.ts` (`generatePrd`)
- Create: `apps/web/src/features/prd/create-prd-generate-task.ts` (RPC wrapper)
- Create: `apps/web/src/features/prd/e2e-fake.ts` (fake generate for E2E)
- Modify: `apps/web/src/features/discovery/components/conversation.tsx` (render the chip in `ProductAgentContent`)
- Modify: `apps/web/src/features/prd/components/prd-document.tsx` (generating state)
- Modify: `apps/web/src/features/ai/room-task-status.ts` + `list_room_ai_task_statuses` RPC (add `kind`)
- Create (test): `apps/web/src/features/prd/actions.test.ts`

**Interfaces:**
- Consumes: `create_prd_generate_task` RPC (Task 6); `RoomTaskStatusPoller` (`features/ai`); `proposedAction` on `DiscoveryMessage` (Task 7).
- Produces:
  - `generatePrd(input: { roomId: string; provider?: Provider }): Promise<{ status: "queued"; taskId: string } | { status: "error"; message: string }>`.
  - `list_room_ai_task_statuses` return table + `RoomTaskStatus` gain `kind: AITaskKind`.
  - `ProductAgentContent` renders a "Generate PRD" chip when `message.proposedAction?.kind === "prd_generate"` and no PRD exists yet.

- [ ] **Step 1: Add `kind` to the status projection (migration + type)**

Create `supabase/migrations/202608020006_room_task_status_kind.sql`: `create or replace function public.list_room_ai_task_statuses(...)` copying the current body but adding `kind public.ai_task_kind` to the `returns table (...)` and `task.kind` to the projected `select`. In `apps/web/src/features/ai/room-task-status.ts`, add `kind: AITaskKind` to `RoomTaskStatus`, `RoomTaskStatusRow` (`kind`), and `mapRoomTaskStatusRow`. Register the migration locally.

- [ ] **Step 2: Write the failing action test**

`apps/web/src/features/prd/actions.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./create-prd-generate-task", () => ({
  createPrdGenerateTask: vi.fn(async () => ({ id: "task-1", status: "queued" })),
}));

import { generatePrd } from "./actions";

describe("generatePrd", () => {
  it("queues a task and returns its id", async () => {
    const result = await generatePrd({ roomId: "40000000-0000-4000-8000-000000000001" });
    expect(result).toEqual({ status: "queued", taskId: "task-1" });
  });
  it("rejects an invalid roomId", async () => {
    const result = await generatePrd({ roomId: "not-a-uuid" });
    expect(result.status).toBe("error");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter web exec vitest run src/features/prd/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the RPC wrapper and action**

`create-prd-generate-task.ts`:
```ts
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Provider } from "@meld/contracts";

export async function createPrdGenerateTask(input: { roomId: string; provider?: Provider }) {
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("create_prd_generate_task", {
    target_room_id: input.roomId,
    target_provider: input.provider ?? null,
  });
  if (error || !data) throw new Error("Could not start PRD generation.");
  return data as { id: string; status: string };
}
```
`actions.ts`:
```ts
"use server";
import { z } from "zod";
import { isDiscoveryFakeEnabled } from "@/features/discovery/backend";
import { createPrdGenerateTask } from "./create-prd-generate-task";

const GeneratePrdInputSchema = z.object({
  roomId: z.string().uuid(),
  provider: z.enum(["codex", "claude"]).optional(),
});

export async function generatePrd(input: {
  roomId: string;
  provider?: "codex" | "claude";
}): Promise<
  { status: "queued"; taskId: string } | { status: "error"; message: string }
> {
  const parsed = GeneratePrdInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    const task = isDiscoveryFakeEnabled()
      ? await (await import("./e2e-fake")).fakeGeneratePrd(parsed.data)
      : await createPrdGenerateTask(parsed.data);
    return { status: "queued", taskId: task.id };
  } catch {
    return { status: "error", message: "Could not start PRD generation." };
  }
}
```
(Confirm `isDiscoveryFakeEnabled` is exported where the discovery actions import it; if it lives elsewhere, import from that module.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter web exec vitest run src/features/prd/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Render the confirm chip in `ProductAgentContent`**

In `conversation.tsx`, thread an `onGeneratePrd` callback (mirroring `onFillQuestion`) down to `ProductAgentContent`, and add a conditional block inside its `VStack`, after the follow-up questions:
```tsx
{message.proposedAction?.kind === "prd_generate" ? (
  <HStack gap={2} align="center">
    <Button
      variant="primary"
      label="Generate PRD"
      onClick={() => onGeneratePrd()}
    />
    <Text type="supporting" color="secondary">Runs on your Codex · ~30–60s</Text>
  </HStack>
) : null}
```
Wire `onGeneratePrd` at the render site to call the `generatePrd` action, then `pollerRef.current?.notifyQueued()` on `{ status: "queued" }` (the same poller the composer already nudges after `postMessage`) and `setError` on `{ status: "error" }`. Import `Button` from `@astryxdesign/core/Button`, `HStack`, `Text`.

- [ ] **Step 7: Generating state in the PRD tab**

In the room page, when `activeTab === "prd"` and there is no PRD yet but the poller shows an active `prd_generate` task, render a generating view instead of the empty state. Simplest server-side approximation: pass the room's task statuses (already available via the poller on the client) — render a `PrdGenerating` component (a `VStack` with a pulsing `StatusDot` label "Drafting your PRD…" and a few skeleton `Card`/`Divider` blocks) as a client component subscribed to the poller. Gate: show it when any status has `kind === "prd_generate"` and a non-terminal status. When the task settles and the trigger materializes the PRD, the page revalidates and shows `PrdDocument`. Add `revalidatePath(basePath, "page")` inside `generatePrd`'s success path is NOT enough (generation is async); rely on the existing poller → on terminal status, call `router.refresh()` client-side to re-fetch the now-present PRD.

- [ ] **Step 8: Verify and commit**

Run: `pnpm --filter web exec vitest run src/features/prd && pnpm --filter web typecheck && pnpm check:astryx apps/web/src/features/prd apps/web/src/features/discovery`
```bash
git add supabase/migrations/202608020006_room_task_status_kind.sql apps/web/src/features/prd \
  apps/web/src/features/ai/room-task-status.ts apps/web/src/features/discovery/components/conversation.tsx
git commit -m "feat(prd): generate action, confirm chip, and in-tab generating state"
```

---

### Task 10: E2E — full ask → confirm → generate → view

**Files:**
- Modify: `apps/web/src/features/prd/e2e-fake.ts` (fake generate inserts a fake PRD + flips `hasPrd`)
- Create (test): `e2e/prd-generate.spec.ts`

**Interfaces:**
- Consumes: the fake gate; a fake agent reply carrying `proposedAction: { kind: "prd_generate" }`.

- [ ] **Step 1: Make the fake path produce a proposal and a PRD**

Extend the discovery fake so an agent reply to a "make a prd" message carries `proposedAction: { kind: "prd_generate" }`, and `fakeGeneratePrd` seeds the fake room's PRD so a subsequent load has `hasPrd: true` and `getRoomPrd` returns it.

- [ ] **Step 2: Write the failing E2E**
```ts
import { expect, test } from "@playwright/test";

test("ask → confirm → generate → PRD tab renders", async ({ page }) => {
  await page.goto("/e2e-org/discovery/e2e-room-empty?tab=conversation");
  await expect(page.getByRole("tab", { name: "PRD" })).toHaveCount(0);
  // A seeded agent reply shows the proposal chip.
  await page.getByRole("button", { name: "Generate PRD" }).click();
  await expect(page.getByRole("tab", { name: "PRD" })).toBeVisible();
  await page.getByRole("tab", { name: "PRD" }).click();
  await expect(page.getByRole("heading", { name: /./ })).toBeVisible();
});
```

- [ ] **Step 3: Run to verify it fails, then passes**

Run: `pnpm --filter web exec playwright test e2e/prd-generate.spec.ts`
Expected: FAIL first, PASS after Step 1.

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/features/prd/e2e-fake.ts e2e/prd-generate.spec.ts
git commit -m "test(prd): e2e for the natural-language generate-and-view flow"
```

---

## Final verification

- [ ] `pnpm typecheck`
- [ ] `pnpm --filter web exec vitest run && pnpm --filter @meld/contracts exec vitest run && pnpm --filter connector exec vitest run`
- [ ] `pnpm check:astryx apps/web/src`
- [ ] pgTAP (truncate-prepend on the populated dev DB, or an empty DB): run `prds.test.sql`, `create_prd_generate_task.test.sql`, `message_proposed_action.test.sql`, and the `ai_task_transitions.test.sql` regression. New tests green; baseline unchanged.
- [ ] `pnpm --filter web exec playwright test e2e/prd-view.spec.ts e2e/prd-generate.spec.ts`
- [ ] `pnpm lint && pnpm build`

## Deferred to the acceptance/versioning pass (do NOT build here)

- PRD **acceptance** (`prd_status` gains `accepted`/`superseded`; `Accept PRD` wired), immutability, and the version **dropdown** selecting older versions.
- Human/AI **editing** and the per-section "revise" action (`prd_revise`).
- The **Prototype** tab's contents.
- The `Accept PRD` / `Ask agent to revise` / per-section `revise` controls render but stay inert.
