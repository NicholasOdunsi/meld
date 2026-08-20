# Deck Ask Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace home screen's single field search rooms, projects, and teammates by name, and — when nothing matches — offer to start an AI room seeded with what you typed.

**Architecture:** `ui/meld/console.tsx` stays presentational: it owns the field, the row list, and highlight movement, and emits `onRun(index)`. `features/home/components/workspace-console.tsx` owns what the rows *are* and what running one does. Asking calls a new `createRoomFromQuestion` server action that resolves a per-workspace **Scratch** project server-side, creates a room, and posts the question mentioning the Product Agent — the same sequence `createRoomFromBrief` already uses for file imports.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase (Postgres + RLS + pgTAP), Vitest + Testing Library (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-08-20-deck-ask-field-design.md`

## Global Constraints

- **Package manager is pnpm.** Run every command from the repo root unless a step says otherwise.
- **Unit tests:** `pnpm --filter @meld/web test -- <path>`. Vitest, `run` mode. Every React test file starts with the `// @vitest-environment jsdom` pragma on line 1.
- **Tests are colocated**, enforced by `pnpm check:test-colocation`. A test for `foo.ts` is `foo.test.ts` in the same directory. Never create a `__tests__/` or `tests/` directory under `apps/web/src`.
- **Typecheck:** `pnpm --filter @meld/web typecheck`. **Lint:** `pnpm --filter @meld/web lint`.
- **Server Actions return discriminated results, they do not throw.** Next redacts thrown error messages in production builds, so user-facing copy dies at the boundary. Follow `ProjectMutationResult` in `features/projects/actions.ts:22`.
- **Room names are `z.string().trim().min(1).max(120)`** (`features/rooms/schemas.ts:16`). Never emit a name that could exceed 120 characters.
- **The scratch project is named exactly `Scratch`.** One literal, exported once, imported everywhere.
- **The Product Agent mention literal is `@Product Agent`**, already exported as `PRODUCT_AGENT_MENTION` from `features/rooms/brief-opener.ts:5`. Never restate it.
- **Never roll back a created room or a posted message.** Inherited verbatim from `createRoomFromBrief` (`features/rooms/actions.ts:493`).
- **No Astryx components in `ui/meld/*` or the console.** That surface is the hand-rolled Meld design system with CSS modules and `--meld-*` tokens. `AGENTS.md`'s Astryx rules apply to Astryx-built surfaces, not this one.
- **Commit after every task**, with the message given in that task's final step.

---

### Task 1: Text helpers for turning a question into a room

Two pure functions, no I/O, no React. They exist as their own task because every later task depends on their exact names and output, and they can be verified in under a second.

They are split across two files to match the existing convention exactly: name-derivation lives beside the deck (`features/home/upload-seed.ts` holds `deriveRoomNameFromFiles`), opener copy lives beside the room (`features/rooms/brief-opener.ts` holds `buildBriefOpener`).

**Files:**
- Create: `apps/web/src/features/home/ask-seed.ts`
- Create: `apps/web/src/features/home/ask-seed.test.ts`
- Create: `apps/web/src/features/rooms/ask-opener.ts`
- Create: `apps/web/src/features/rooms/ask-opener.test.ts`

**Interfaces:**
- Consumes: `PRODUCT_AGENT_MENTION` from `@/features/rooms/brief-opener`
- Produces:
  - `deriveRoomNameFromQuestion(question: string): string`
  - `buildAskOpener(question: string): string`
  - `ASK_ERROR_MESSAGE: string`

`ASK_ERROR_MESSAGE` lives here rather than in `features/rooms/actions.ts`
because that file is `"use server"`, where **only async functions may be
exported**. This is why `ROOM_REPLY_RETRY_ERROR` (`actions.ts:265`) is
module-private today. Task 6's test needs the copy, so it must come from a
plain module.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/home/ask-seed.test.ts`:

```ts
import { expect, it } from "vitest";
import { deriveRoomNameFromQuestion } from "./ask-seed";

it("capitalises the first character", () => {
  expect(deriveRoomNameFromQuestion("how do refunds work")).toBe(
    "How do refunds work",
  );
});

it("strips a trailing question mark", () => {
  expect(deriveRoomNameFromQuestion("how do refunds work?")).toBe(
    "How do refunds work",
  );
});

it("strips a run of trailing question marks", () => {
  expect(deriveRoomNameFromQuestion("really???")).toBe("Really");
});

it("collapses internal whitespace", () => {
  expect(deriveRoomNameFromQuestion("how   do\n\nrefunds work")).toBe(
    "How do refunds work",
  );
});

// RoomInputSchema caps a room name at 120 characters, so anything longer
// would be rejected by the server action rather than truncated by it.
it("truncates to 120 characters on a word boundary", () => {
  const long = `${"alpha ".repeat(40)}omega`;
  const name = deriveRoomNameFromQuestion(long);

  expect(name.length).toBeLessThanOrEqual(120);
  expect(name.endsWith("alpha")).toBe(true);
});

// A single word longer than the limit has no boundary to cut on, so it is
// cut mid-word rather than returned over-length.
it("truncates a single long word without a boundary", () => {
  const name = deriveRoomNameFromQuestion("z".repeat(200));

  expect(name.length).toBe(120);
});

// The Ask row is only offered for a non-empty trimmed query, so this is a
// guard rather than a path -- but it must never return an empty string,
// which RoomInputSchema would reject.
it("falls back for input that trims to nothing", () => {
  expect(deriveRoomNameFromQuestion("   ?  ")).toBe("Untitled ask");
});
```

`apps/web/src/features/rooms/ask-opener.test.ts`:

```ts
import { expect, it } from "vitest";
import { PRODUCT_AGENT_MENTION } from "./brief-opener";
import { ASK_ERROR_MESSAGE, buildAskOpener } from "./ask-opener";

it("has failure copy that names the thing that did not happen", () => {
  expect(ASK_ERROR_MESSAGE).toBe(
    "We could not start a room. Please try again.",
  );
});

it("addresses the Product Agent and keeps the question verbatim", () => {
  const opener = buildAskOpener("How do refunds work?");

  expect(opener).toBe(`${PRODUCT_AGENT_MENTION} — How do refunds work?`);
});

it("trims the question", () => {
  expect(buildAskOpener("  hello  ")).toBe(
    `${PRODUCT_AGENT_MENTION} — hello`,
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @meld/web test -- src/features/home/ask-seed.test.ts src/features/rooms/ask-opener.test.ts
```

Expected: FAIL — `Failed to resolve import "./ask-seed"` and `"./ask-opener"`.

- [ ] **Step 3: Write the implementations**

`apps/web/src/features/home/ask-seed.ts`:

```ts
// The room name for a question typed into the deck's field, the counterpart
// to upload-seed.ts's deriveRoomNameFromFiles for dropped files. Kept out of
// the server action so the copy can be unit tested without Supabase wiring.
const MAX_ROOM_NAME_LENGTH = 120;
const FALLBACK_ROOM_NAME = "Untitled ask";

export function deriveRoomNameFromQuestion(question: string): string {
  const collapsed = question
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\?+$/, "")
    .trim();
  if (collapsed.length === 0) {
    return FALLBACK_ROOM_NAME;
  }

  const capitalised = collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
  if (capitalised.length <= MAX_ROOM_NAME_LENGTH) {
    return capitalised;
  }

  // Cut on a word boundary when there is one. A single word longer than the
  // limit has none, so it is cut mid-word -- over-length is not an option,
  // RoomInputSchema would reject it.
  const clipped = capitalised.slice(0, MAX_ROOM_NAME_LENGTH);
  const lastSpace = clipped.lastIndexOf(" ");
  return lastSpace > 0 ? clipped.slice(0, lastSpace).trimEnd() : clipped;
}
```

`apps/web/src/features/rooms/ask-opener.ts`:

```ts
// The opener createRoomFromQuestion posts on the caller's behalf when the
// deck's field is used to ask something. Sits beside brief-opener.ts, which
// does the same job for an imported brief, and reuses its mention constant
// rather than restating the literal.
import { PRODUCT_AGENT_MENTION } from "./brief-opener";

// Lives here, not in actions.ts: that file is "use server", where only async
// functions may be exported -- which is why ROOM_REPLY_RETRY_ERROR is
// module-private there. This copy needs to reach a test.
export const ASK_ERROR_MESSAGE =
  "We could not start a room. Please try again.";

export function buildAskOpener(question: string): string {
  return `${PRODUCT_AGENT_MENTION} — ${question.trim()}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/home/ask-seed.test.ts src/features/rooms/ask-opener.test.ts
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home/ask-seed.ts apps/web/src/features/home/ask-seed.test.ts apps/web/src/features/rooms/ask-opener.ts apps/web/src/features/rooms/ask-opener.test.ts
git commit -m "feat(home): derive a room name and opener from a typed question"
```

---

### Task 2: Mark one project per workspace as the scratch project

Every workspace already gets exactly one project at creation, named `Untitled project`, and the database holds an invariant that a workspace always has at least one project. This task gives that project a machine-readable identity and renames it.

**Files:**
- Create: `supabase/migrations/202608200001_project_scratch.sql`
- Create: `supabase/tests/project_scratch.test.sql`

**Interfaces:**
- Produces: `public.projects.is_scratch boolean not null default false`; unique index `projects_one_scratch_per_workspace`; `create_workspace_with_project` sets `is_scratch => true` on the project it inserts.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/project_scratch.test.sql`:

```sql
begin;
select plan(4);

select has_column(
  'public'::name, 'projects'::name, 'is_scratch'::name,
  'projects.is_scratch exists'::text
);

select has_index(
  'public'::name, 'projects'::name,
  'projects_one_scratch_per_workspace'::name,
  'one scratch project per workspace is enforced by an index'::text
);

-- Every workspace the backfill saw must have exactly one scratch project.
select is(
  (
    select count(*)::integer
    from public.workspaces as workspace
    where (
      select count(*)
      from public.projects as project
      where project.workspace_id = workspace.id
        and project.is_scratch
    ) <> 1
  ),
  0,
  'every workspace has exactly one scratch project'
);

-- The index is partial: many non-scratch projects per workspace stay legal.
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'projects_one_scratch_per_workspace'
      and indexdef like '%WHERE is_scratch%'
  ),
  1,
  'the uniqueness index is partial on is_scratch'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm supabase db reset && pnpm test:db
```

Expected: FAIL — `column "is_scratch" does not exist`.

If Supabase is not running locally, start it first with `pnpm supabase start`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/202608200001_project_scratch.sql`:

```sql
-- Questions typed into the deck's field become rooms. They need somewhere to
-- land that is not one of the user's real projects, so every workspace gets
-- exactly one "scratch" project.
--
-- No new row is created for it. Every workspace already has exactly one
-- project made by create_workspace_with_project at signup (202608110002
-- installs the "a workspace always has at least one project" invariant), and
-- that project -- "Untitled project" -- is the one being given a job here.
--
-- Column-then-backfill-then-index, following 202608120001_project_icon.sql's
-- shape: the default keeps every existing row and the RPC's explicit column
-- list valid without a rewrite.
alter table public.projects
  add column is_scratch boolean not null default false;

-- A workspace's earliest project is the one the signup RPC made.
update public.projects as project
set is_scratch = true
where project.id = (
  select earliest.id
  from public.projects as earliest
  where earliest.workspace_id = project.workspace_id
  order by earliest.created_at asc, earliest.id asc
  limit 1
);

-- Renamed only where nobody has claimed it for real work. A workspace whose
-- owner already renamed this project and filled it keeps its name and simply
-- becomes a workspace whose scratch project is called something else.
update public.projects
set name = 'Scratch'
where is_scratch
  and name = 'Untitled project';

-- After the backfill, so the index validates the backfill rather than the
-- backfill having to dodge the index.
create unique index projects_one_scratch_per_workspace
  on public.projects (workspace_id)
  where is_scratch;

-- The signup RPC inserts with an explicit column list, so without this new
-- workspaces would take the `false` default and have no scratch project at
-- all. Signature is unchanged, so this replaces in place rather than
-- drop-and-create, and no entry in scripts/check-sql-arities.mjs changes.
create or replace function public.create_workspace_with_project(
  workspace_name text,
  project_name text,
  workspace_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_workspace public.workspaces;
  created_project public.projects;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  workspace_name := btrim(workspace_name);
  project_name := btrim(project_name);
  workspace_logo_path := nullif(btrim(workspace_logo_path), '');

  if workspace_name is null
    or char_length(workspace_name) not between 1 and 120
    or project_name is null
    or char_length(project_name) not between 1 and 120
    or (
      workspace_logo_path is not null
      and (
        char_length(workspace_logo_path) > 500
        or workspace_logo_path not like current_user_id::text || '/%'
      )
    )
  then
    raise exception 'Workspace details are invalid'
      using errcode = 'P0001';
  end if;

  insert into public.workspaces (name, logo_path, created_by)
  values (workspace_name, workspace_logo_path, current_user_id)
  returning * into created_workspace;

  insert into public.projects (workspace_id, name, created_by, is_scratch)
  values (created_workspace.id, project_name, current_user_id, true)
  returning * into created_project;

  return jsonb_build_object(
    'workspace_id', created_workspace.id,
    'workspace_name', created_workspace.name,
    'workspace_logo_path', created_workspace.logo_path,
    'project_id', created_project.id,
    'project_name', created_project.name
  );
end;
$$;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm supabase db reset && pnpm test:db && pnpm test:sql
```

Expected: `project_scratch.test.sql` PASSES 4 tests, every other pgTAP file still passes, and `pnpm test:sql`'s static arity and room-SQL checks still pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608200001_project_scratch.sql supabase/tests/project_scratch.test.sql
git commit -m "feat(projects): give every workspace exactly one scratch project"
```

---

### Task 3: Carry `isScratch` through the application layer

The column exists; nothing in TypeScript can see it yet. This task makes `ProjectSummary` carry it and keeps the two fake backends honest about the invariant Task 2 just installed in the real database.

**Files:**
- Modify: `apps/web/src/features/projects/schemas.ts`
- Modify: `apps/web/src/features/projects/repository.ts`
- Modify: `apps/web/src/features/projects/repository.test.ts`
- Modify: `apps/web/src/features/workspaces/backend.ts:15`
- Modify: `apps/web/src/features/workspaces/e2e-fake.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ProjectSummary` gains `isScratch: boolean`
  - `SCRATCH_PROJECT_NAME = "Scratch"` exported from `features/projects/schemas.ts`
  - `ProjectWriteInput` gains optional `isScratch?: boolean`
  - `PROJECT_COLUMNS` includes `is_scratch`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/features/projects/repository.test.ts`, using that
file's existing `projectsQuery(data)` helper (line 9) and its module-scope
`WORKSPACE_ID` / `PROJECT_ID` / `OWNER_ID` constants. There is no
general-purpose `stubSupabase` in this file — do not add one.

```ts
it("maps is_scratch onto the summary", async () => {
  const query = projectsQuery([
    {
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      name: "Scratch",
      created_by: OWNER_ID,
      icon: "folder",
      color: "blue",
      is_scratch: true,
    },
  ]);

  const [project] = await createProjectRepository(
    query.supabase,
  ).listWorkspaceProjects(WORKSPACE_ID);

  expect(project.isScratch).toBe(true);
});

// The column is `not null default false`. This guards the read path the same
// way the existing unrecognized-icon test does -- a stub or a cached row that
// predates the column must not produce `undefined`.
it("defaults isScratch to false for a row without the column", async () => {
  const query = projectsQuery([
    {
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      name: "Checkout",
      created_by: OWNER_ID,
      icon: "folder",
      color: "blue",
    },
  ]);

  const [project] = await createProjectRepository(
    query.supabase,
  ).listWorkspaceProjects(WORKSPACE_ID);

  expect(project.isScratch).toBe(false);
});
```

**Two existing tests in this file will now fail, and both should be updated
rather than worked around:**

- `"lists mapped workspace projects"` asserts
  `query.select` was called with the exact string
  `"id,workspace_id,name,created_by,icon,color"`. Add `,is_scratch` to it.
- The same test asserts the resolved value with `toEqual`, which is exact.
  Add `isScratch: false` to the expected object.

Check `createProject`'s and `renameProject`'s tests for the same two patterns
and update them identically.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/features/projects/repository.test.ts
```

Expected: FAIL — `expected undefined to be true`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/projects/schemas.ts`, add the constant beside the other project defaults and extend the type:

```ts
// The one project every workspace has for questions typed into the deck's
// field. Created by create_workspace_with_project at signup; identified by
// projects.is_scratch, never by this name.
export const SCRATCH_PROJECT_NAME = "Scratch";
```

```ts
export type ProjectSummary = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  icon: ProjectIcon;
  color: ProjectColor;
  isScratch: boolean;
};
```

In `apps/web/src/features/projects/repository.ts`:

```ts
type ProjectRow = {
  id: string;
  workspace_id: string;
  name: string;
  created_by: string;
  icon: string;
  color: string;
  is_scratch?: boolean;
};

type ProjectWriteInput = {
  workspaceId: string;
  name: string;
  createdBy: string;
  icon?: ProjectIcon;
  color?: ProjectColor;
  isScratch?: boolean;
};

const PROJECT_COLUMNS =
  "id,workspace_id,name,created_by,icon,color,is_scratch";
```

```ts
function mapProject(row: ProjectRow): ProjectSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    createdBy: row.created_by,
    icon: toProjectIcon(row.icon),
    color: toProjectColor(row.color),
    // The column is `not null default false`; the `?? false` covers a stub or
    // an older cached row that predates it, matching how toProjectIcon and
    // toProjectColor guard the read path.
    isScratch: row.is_scratch ?? false,
  };
}
```

In `createProject`'s `.insert({...})` object, add:

```ts
          is_scratch: input.isScratch ?? false,
```

In `apps/web/src/features/workspaces/backend.ts`, replace the literal on line 15:

```ts
import { SCRATCH_PROJECT_NAME } from "@/features/projects/schemas";

// The project every new workspace starts with. It is the scratch project --
// see supabase/migrations/202608200001_project_scratch.sql.
export const DEFAULT_PROJECT_NAME = SCRATCH_PROJECT_NAME;
```

In `apps/web/src/features/workspaces/e2e-fake.ts`, every literal that builds a project must now carry `isScratch`, or the file will not typecheck. There are three seeded projects in the store's `projects` array, one project pushed in `createWorkspace`, and one built in `fakeCreateProject`:

- The seeded project for `E2E_WORKSPACE_ID` (`E2E_PROJECT_ID`): `isScratch: true`
- The seeded project for `E2E_SECOND_WORKSPACE_ID` (`E2E_PARTNER_PROJECT_ID`): `isScratch: true`
- The seeded `E2E_SECOND_PROJECT_ID`: `isScratch: false`
- The project pushed by `createWorkspace`: `isScratch: true`
- The project built by `fakeCreateProject`: `isScratch: false`

This mirrors the real invariant exactly — one scratch per workspace, created at signup, and never by `createProject`.

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/projects src/features/workspaces
pnpm --filter @meld/web typecheck
```

Expected: PASS, and typecheck clean. Typecheck is the real gate here — it is what proves every `ProjectSummary` construction site was found.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects apps/web/src/features/workspaces
git commit -m "feat(projects): carry isScratch through the project read path"
```

---

### Task 4: Resolve a workspace's scratch project server-side

The ask action must never take a project id from the browser — a client could then post an ask into any project it named. This task adds the server-side lookup, and makes it total so asking can never fail because of a data gap.

**Files:**
- Modify: `apps/web/src/features/projects/repository.ts`
- Modify: `apps/web/src/features/projects/repository.test.ts`
- Modify: `apps/web/src/features/projects/backend.ts`
- Modify: `apps/web/src/features/projects/supabase-backend.ts`
- Modify: `apps/web/src/features/projects/fake-backend.ts`
- Modify: `apps/web/src/features/workspaces/e2e-fake.ts`

**Interfaces:**
- Consumes: `SCRATCH_PROJECT_NAME`, `ProjectSummary.isScratch`, `ProjectWriteInput.isScratch` (Task 3)
- Produces:
  - `ProjectBackend.getScratchProject(workspaceId: string): Promise<ProjectSummary>`
  - `repository.getScratchProject(input: { workspaceId: string; createdBy: string }): Promise<ProjectSummary>`
  - `fakeGetScratchProject(workspaceId: string): Promise<ProjectSummary>` exported from `features/workspaces/e2e-fake.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/features/projects/repository.test.ts`. This is the
first method that both reads and writes, so it needs a stub whose `from()`
exposes `select` *and* `insert`. Add this helper beside the existing
`projectsQuery` rather than changing `projectsQuery` — other tests depend on
its exact shape.

```ts
// `from("projects")` here answers two different chains, because
// getScratchProject falls through from a lookup to an insert:
//   select -> eq -> eq -> maybeSingle
//   insert -> select -> single
function scratchQuery(found: unknown, created: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: found, error: null });
  const eqScratch = vi.fn(() => ({ maybeSingle }));
  const eqWorkspace = vi.fn(() => ({ eq: eqScratch }));
  const selectRead = vi.fn(() => ({ eq: eqWorkspace }));

  const single = vi.fn().mockResolvedValue({ data: created, error: null });
  const selectWrite = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: selectWrite }));

  const from = vi.fn(() => ({ select: selectRead, insert }));
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    insert,
    eqWorkspace,
    eqScratch,
  };
}

it("returns the workspace's scratch project", async () => {
  const query = scratchQuery(
    {
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      name: "Scratch",
      created_by: OWNER_ID,
      icon: "folder",
      color: "blue",
      is_scratch: true,
    },
    null,
  );

  const project = await createProjectRepository(
    query.supabase,
  ).getScratchProject({
    workspaceId: WORKSPACE_ID,
    createdBy: OWNER_ID,
  });

  expect(project.id).toBe(PROJECT_ID);
  expect(project.isScratch).toBe(true);
  expect(query.eqWorkspace).toHaveBeenCalledWith(
    "workspace_id",
    WORKSPACE_ID,
  );
  expect(query.eqScratch).toHaveBeenCalledWith("is_scratch", true);
  expect(query.insert).not.toHaveBeenCalled();
});

// A legacy workspace the backfill missed, or one whose scratch project was
// deleted before the guard in Task 5 existed. Asking must not fail because of
// a data gap.
it("creates a scratch project when the workspace has none", async () => {
  const query = scratchQuery(null, {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    name: SCRATCH_PROJECT_NAME,
    created_by: OWNER_ID,
    icon: "folder",
    color: "blue",
    is_scratch: true,
  });

  const project = await createProjectRepository(
    query.supabase,
  ).getScratchProject({
    workspaceId: WORKSPACE_ID,
    createdBy: OWNER_ID,
  });

  expect(project.name).toBe(SCRATCH_PROJECT_NAME);
  expect(project.isScratch).toBe(true);
  expect(query.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      workspace_id: WORKSPACE_ID,
      name: SCRATCH_PROJECT_NAME,
      is_scratch: true,
    }),
  );
});
```

Add `SCRATCH_PROJECT_NAME` to this file's imports from `./schemas`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/features/projects/repository.test.ts
```

Expected: FAIL — `repository.getScratchProject is not a function`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/projects/repository.ts`, lift the insert out of `createProject` into a module-scope helper so `getScratchProject` can reuse it without duplicating the column list or the error copy. Add above `createProjectRepository`:

```ts
async function insertProject(
  supabase: SupabaseClient,
  input: ProjectWriteInput,
): Promise<ProjectSummary> {
  const result = await supabase
    .from("projects")
    .insert({
      workspace_id: input.workspaceId,
      name: input.name,
      created_by: input.createdBy,
      icon: input.icon ?? DEFAULT_PROJECT_ICON,
      color: input.color ?? DEFAULT_PROJECT_COLOR,
      is_scratch: input.isScratch ?? false,
    })
    .select(PROJECT_COLUMNS)
    .single();
  if (result.error || !result.data) {
    throw new Error("We could not create the project.");
  }
  return mapProject(result.data as ProjectRow);
}
```

Replace `createProject`'s body in the returned object with a call to it, and add the new method:

```ts
    async createProject(input: ProjectWriteInput): Promise<ProjectSummary> {
      return insertProject(supabase, input);
    },

    // Total by design: a workspace with no scratch project gets one rather
    // than an error. The unique partial index is what keeps this from ever
    // producing a second one under a race -- a concurrent caller's insert
    // fails on the index instead of quietly duplicating.
    async getScratchProject(input: {
      workspaceId: string;
      createdBy: string;
    }): Promise<ProjectSummary> {
      const result = await supabase
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("workspace_id", input.workspaceId)
        .eq("is_scratch", true)
        .maybeSingle();
      if (result.error) {
        throw new Error("We could not load projects.");
      }
      if (result.data) {
        return mapProject(result.data as ProjectRow);
      }
      return insertProject(supabase, {
        workspaceId: input.workspaceId,
        name: SCRATCH_PROJECT_NAME,
        createdBy: input.createdBy,
        isScratch: true,
      });
    },
```

Import `SCRATCH_PROJECT_NAME` from `./schemas` at the top of the file.

In `apps/web/src/features/projects/backend.ts`, add to the `ProjectBackend` type:

```ts
  getScratchProject(workspaceId: string): Promise<ProjectSummary>;
```

In `apps/web/src/features/projects/supabase-backend.ts`, add to the returned object:

```ts
    getScratchProject(workspaceId) {
      return repository.getScratchProject({
        workspaceId,
        createdBy: user.id,
      });
    },
```

In `apps/web/src/features/workspaces/e2e-fake.ts`, add beside `listFakeWorkspaceProjects`:

```ts
export async function fakeGetScratchProject(
  workspaceId: string,
): Promise<ProjectSummary> {
  const user = await requireFakeUser();
  const store = getStore();
  const existing = store.projects.find(
    (project) => project.workspaceId === workspaceId && project.isScratch,
  );
  if (existing) {
    return existing;
  }
  const project: ProjectSummary = {
    id: randomUUID(),
    workspaceId,
    name: SCRATCH_PROJECT_NAME,
    createdBy: user.id,
    icon: DEFAULT_PROJECT_ICON,
    color: DEFAULT_PROJECT_COLOR,
    isScratch: true,
  };
  store.projects.push(project);
  return project;
}
```

Import `SCRATCH_PROJECT_NAME` from `@/features/projects/schemas` — the file already imports `DEFAULT_PROJECT_ICON` and `DEFAULT_PROJECT_COLOR` from there.

In `apps/web/src/features/projects/fake-backend.ts`, add to the returned object:

```ts
    getScratchProject(workspaceId) {
      return fakeGetScratchProject(workspaceId);
    },
```

and add `fakeGetScratchProject` to that file's existing import from `@/features/workspaces/e2e-fake`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/projects
pnpm --filter @meld/web typecheck
```

Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects apps/web/src/features/workspaces
git commit -m "feat(projects): resolve a workspace's scratch project server-side"
```

---

### Task 5: Refuse to delete the scratch project

Without this, deleting Scratch is legal, and the next ask silently recreates a fresh one — losing every question-room the user had filed there.

**Files:**
- Modify: `apps/web/src/features/projects/actions.ts`
- Modify: `apps/web/src/features/projects/actions.test.ts`
- Modify: `apps/web/src/features/projects/repository.ts`
- Modify: `apps/web/src/features/projects/fake-backend.ts`

**Interfaces:**
- Consumes: `ProjectSummary.isScratch` (Task 3)
- Produces: `DeleteProjectResult` gains `reason: "project_is_scratch"`; `ScratchProjectError` exported from `features/projects/repository.ts`

- [ ] **Step 1: Write the failing test**

Append inside the `describe("project actions", …)` block in
`apps/web/src/features/projects/actions.test.ts`. That file already mocks
`./backend` and exposes `mocks.deleteProject`, and already declares
`WORKSPACE_ID` / `PROJECT_ID` at module scope.

```ts
  it("blocks deleting the scratch project", async () => {
    // Same shape as the existing not-empty test: the backend rejects, and
    // the action translates the error into a discriminated result.
    mocks.deleteProject.mockRejectedValue(new ScratchProjectError());

    const result = await deleteProject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    });

    expect(result).toEqual({
      status: "blocked",
      reason: "project_is_scratch",
      message: SCRATCH_PROJECT_DELETE_MESSAGE,
    });
  });
```

Extend the file's existing `import { ProjectNotEmptyError } from "./repository";`
to also bring in `ScratchProjectError` and `SCRATCH_PROJECT_DELETE_MESSAGE`.

Then add a repository-level test to
`apps/web/src/features/projects/repository.test.ts`, since the guard itself
lives there:

```ts
it("refuses to delete a scratch project", async () => {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { is_scratch: true }, error: null });
  const eqWorkspace = vi.fn(() => ({ maybeSingle }));
  const eqId = vi.fn(() => ({ eq: eqWorkspace }));
  const select = vi.fn(() => ({ eq: eqId }));
  const from = vi.fn(() => ({ select }));
  const supabase = { from } as unknown as SupabaseClient;

  await expect(
    createProjectRepository(supabase).deleteProject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
    }),
  ).rejects.toBeInstanceOf(ScratchProjectError);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/features/projects/actions.test.ts
```

Expected: FAIL — `ScratchProjectError` is not exported.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/projects/repository.ts`, beside `ProjectNotEmptyError`:

```ts
export const SCRATCH_PROJECT_DELETE_MESSAGE =
  "Scratch is where your asks land, so it cannot be deleted.";

export class ScratchProjectError extends Error {
  constructor() {
    super(SCRATCH_PROJECT_DELETE_MESSAGE);
    this.name = "ScratchProjectError";
  }
}
```

In the repository's `deleteProject`, guard before the delete. Scoping the check to the same `workspace_id` matters: a project id alone is not proof of which workspace it belongs to.

```ts
    async deleteProject(input: ProjectReference): Promise<void> {
      const target = await supabase
        .from("projects")
        .select("is_scratch")
        .eq("id", input.projectId)
        .eq("workspace_id", input.workspaceId)
        .maybeSingle();
      if (target.data?.is_scratch) {
        throw new ScratchProjectError();
      }

      // ...existing delete, unchanged
    },
```

**This breaks the existing `deleteProject` tests in `repository.test.ts`**, and
they must be updated rather than worked around. `from("projects")` is now
called twice for one delete — once for the guard's `select`, once for the
`delete` — so their stubs' `from` must return an object carrying **both**
chains:

```ts
  const from = vi.fn(() => ({ select, delete: remove }));
```

where `select` is the guard chain (`eq -> eq -> maybeSingle`) resolving
`{ data: { is_scratch: false }, error: null }`, and `remove` is the file's
existing delete chain, unchanged.

In `apps/web/src/features/projects/fake-backend.ts`'s `deleteProject`, add the same guard before the rooms check so E2E behaves like production:

```ts
    async deleteProject(input) {
      const { fakeIsScratchProject } = await import(
        "@/features/workspaces/e2e-fake"
      );
      if (fakeIsScratchProject(input.workspaceId, input.projectId)) {
        throw new ScratchProjectError();
      }

      // ...existing ProjectNotEmptyError check and fakeDeleteProject call
    },
```

Add to `apps/web/src/features/workspaces/e2e-fake.ts`, beside `fakeWorkspaceHasProject`:

```ts
export function fakeIsScratchProject(
  workspaceId: string,
  projectId: string,
) {
  return getStore().projects.some(
    (project) =>
      project.id === projectId &&
      project.workspaceId === workspaceId &&
      project.isScratch,
  );
}
```

In `apps/web/src/features/projects/actions.ts`, widen the result type:

```ts
export type DeleteProjectResult =
  | { status: "deleted" }
  | {
      status: "blocked";
      reason: "project_not_empty" | "project_is_scratch";
      message: string;
    }
  | { status: "error"; message: string };
```

and add a branch to `deleteProject`'s catch, above the existing `ProjectNotEmptyError` branch:

```ts
    if (error instanceof ScratchProjectError) {
      return {
        status: "blocked",
        reason: "project_is_scratch",
        message: error.message,
      };
    }
```

Import `ScratchProjectError` alongside the existing `ProjectNotEmptyError` import.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/projects
pnpm --filter @meld/web typecheck
```

Expected: PASS. Typecheck will flag any UI that switches exhaustively on `reason` — if it does, add a case rendering `message`, which is already the copy to show.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/projects apps/web/src/features/workspaces
git commit -m "feat(projects): refuse to delete a workspace's scratch project"
```

---

### Task 6: The `createRoomFromQuestion` server action

**Files:**
- Modify: `apps/web/src/features/rooms/schemas.ts`
- Modify: `apps/web/src/features/rooms/actions.ts`
- Modify: `apps/web/src/features/rooms/actions.test.ts`

**Interfaces:**
- Consumes: `deriveRoomNameFromQuestion` (Task 1), `buildAskOpener` (Task 1), `ProjectBackend.getScratchProject` (Task 4)
- Produces:
  ```ts
  export type CreateRoomFromQuestionResult =
    | { status: "ok"; roomId: string; ready: boolean }
    | { status: "error"; message: string };

  export async function createRoomFromQuestion(input: {
    workspaceId: string;
    question: string;
  }): Promise<CreateRoomFromQuestionResult>;
  ```

- [ ] **Step 1: Write the failing test**

Read `describe("createRoomFromBrief", …)` in
`apps/web/src/features/rooms/actions.test.ts` (line 1054) first — the new
block is its sibling and shares its setup exactly.

**Three things about this file that will otherwise cost an hour:**

1. `postMessage` is a **same-module call** from `createRoomFromQuestion`, so
   it cannot be spied on. Assert on the boundary effects instead, through the
   already-mocked repository: the mock is `mocks.postHumanMessage`, not
   `mocks.postMessage`. The existing brief test says this in a comment at
   line 1159.
2. `mocks.resolveAgentReadiness` must resolve a **full** readiness object, not
   `{ ready: true }` — copy the shape from the brief test at line 1105.
3. `@/features/projects/backend` is **not mocked in this file yet.** Add it to
   the `vi.hoisted` block and a `vi.mock` beside the others.

Add to the `mocks` object at the top of the file:

```ts
  getProjectBackend: vi.fn(),
  getScratchProject: vi.fn(),
```

and beside the other `vi.mock` calls:

```ts
vi.mock("@/features/projects/backend", () => ({
  getProjectBackend: mocks.getProjectBackend,
}));
```

Then append this describe block:

```ts
describe("createRoomFromQuestion", () => {
  const SCRATCH_PROJECT_ID = "70000000-0000-4000-8000-00000000000f";
  const ASK_MESSAGE_ID = "50000000-0000-4000-8000-00000000000d";

  const scratchProject = {
    id: SCRATCH_PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Scratch",
    createdBy: "10000000-0000-4000-8000-000000000001",
    icon: "folder" as const,
    color: "blue" as const,
    isScratch: true,
  };

  const readyReadiness = {
    ready: true,
    defaultProvider: "codex",
    defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
    providers: [
      {
        provider: "codex",
        deviceId: "d0000000-0000-4000-8000-000000000000",
        deviceName: "Ada's Mac",
      },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isRoomFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      rpc: mocks.linkRpc,
    });
    mocks.getProjectBackend.mockResolvedValue({
      getScratchProject: mocks.getScratchProject,
    });
    mocks.getScratchProject.mockResolvedValue(scratchProject);
    mocks.createRoom.mockResolvedValue({ id: ROOM_ID });
    mocks.postHumanMessage.mockResolvedValue({
      id: ASK_MESSAGE_ID,
      roomId: ROOM_ID,
      clientId: "20000000-0000-4000-8000-00000000000e",
      authorId: "10000000-0000-4000-8000-000000000001",
      authorName: "Owner Example",
      body: "@Product Agent — How do refunds work?",
      createdAt: "2026-08-20T12:00:00.000Z",
      delivery: "persisted" as const,
    });
    mocks.recordFigmaReferences.mockResolvedValue(undefined);
    mocks.createRoomReplyTask.mockResolvedValue({ id: TASK_ID });
  });

  it("creates a room in the scratch project and asks the Product Agent", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue(readyReadiness);

    const result = await createRoomFromQuestion({
      workspaceId: WORKSPACE_ID,
      question: "How do refunds work?",
    });

    expect(result).toEqual({ status: "ok", roomId: ROOM_ID, ready: true });
    expect(mocks.getScratchProject).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(mocks.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        projectId: SCRATCH_PROJECT_ID,
        name: "How do refunds work",
      }),
    );
    expect(mocks.postHumanMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        mentionsProductAgent: true,
        body: `${PRODUCT_AGENT_MENTION} — How do refunds work?`,
      }),
    );
    // The sidebar's room list lives in the workspace layout; without this the
    // new room only appears after a manual refresh.
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/${WORKSPACE_ID}`,
      "layout",
    );
  });

  // The room is the deliverable. A missing provider is not an error, it is
  // the not-ready branch -- the room's own composer is the one place that
  // explains a missing provider.
  it("still creates the room and posts a plain message when no agent is ready", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue({
      ready: false,
      reason: "no_device",
    });

    const result = await createRoomFromQuestion({
      workspaceId: WORKSPACE_ID,
      question: "How do refunds work?",
    });

    expect(result).toEqual({ status: "ok", roomId: ROOM_ID, ready: false });
    expect(mocks.postHumanMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "How do refunds work?",
        mentionsProductAgent: false,
      }),
    );
    expect(mocks.createRoomReplyTask).not.toHaveBeenCalled();
  });

  // GLOBAL CONSTRAINT: a created room is never rolled back. A throw after
  // createRoom must still hand back a roomId the caller can navigate to.
  it("returns the room id even when readiness throws", async () => {
    mocks.resolveAgentReadiness.mockRejectedValue(new Error("boom"));

    const result = await createRoomFromQuestion({
      workspaceId: WORKSPACE_ID,
      question: "How do refunds work?",
    });

    expect(result).toEqual({ status: "ok", roomId: ROOM_ID, ready: false });
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
  });

  it("reports an error when the room cannot be created", async () => {
    mocks.getScratchProject.mockRejectedValue(new Error("boom"));

    const result = await createRoomFromQuestion({
      workspaceId: WORKSPACE_ID,
      question: "How do refunds work?",
    });

    expect(result).toEqual({
      status: "error",
      message: ASK_ERROR_MESSAGE,
    });
  });

  it("rejects a blank question without touching the backend", async () => {
    const result = await createRoomFromQuestion({
      workspaceId: WORKSPACE_ID,
      question: "   ",
    });

    expect(result.status).toBe("error");
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });
});
```

Add `createRoomFromQuestion` to the file's existing import from `./actions`,
and add `import { PRODUCT_AGENT_MENTION } from "./brief-opener";` plus
`import { ASK_ERROR_MESSAGE } from "./ask-opener";` if they are not already
there. `TASK_ID`, `WORKSPACE_ID`, and `ROOM_ID` already exist in this file —
reuse them rather than redeclaring.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/features/rooms/actions.test.ts
```

Expected: FAIL — `createRoomFromQuestion` is not exported.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/rooms/schemas.ts`, beside `RoomInputSchema`:

```ts
// A question typed into the deck's field. No projectId: the scratch project
// is resolved server-side, because a project id from the browser would let a
// caller file an ask into any project it named.
export const AskInputSchema = z.object({
  workspaceId: z.string().uuid(),
  question: z.string().trim().min(1).max(2000),
});
```

In `apps/web/src/features/rooms/actions.ts`, add the imports:

```ts
import { deriveRoomNameFromQuestion } from "@/features/home/ask-seed";
import { getProjectBackend } from "@/features/projects/backend";
import { ASK_ERROR_MESSAGE, buildAskOpener } from "./ask-opener";
```

and add `AskInputSchema` to the existing `./schemas` import block. Then add the action.

Note there is **no `export const` here**: this file is `"use server"`, which
permits only async function exports. The error copy comes from
`./ask-opener`, a plain module. An exported `type` is fine and erased at
build — `RoomFormState` (`actions.ts:68`) is the precedent.

```ts
export type CreateRoomFromQuestionResult =
  | { status: "ok"; roomId: string; ready: boolean }
  | { status: "error"; message: string };

/**
 * Turn a question typed on the deck into a room in the workspace's scratch
 * project, with the Product Agent asked.
 *
 * Same shape as createRoomFromBrief, for the same reason: once the room
 * exists it is the deliverable. Everything after createRoom is best-effort
 * and none of it may roll back or fail the room. A not-ready provider is not
 * an error -- the question is still posted, as a plain message, and the
 * room's own composer is the single place that explains what is missing.
 */
export async function createRoomFromQuestion(input: {
  workspaceId: string;
  question: string;
}): Promise<CreateRoomFromQuestionResult> {
  const parsed = AskInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: ASK_ERROR_MESSAGE };
  }
  const { workspaceId, question } = parsed.data;

  let roomId: string;
  try {
    const scratch = await (
      await getProjectBackend()
    ).getScratchProject(workspaceId);
    const room = await createRoom({
      workspaceId,
      projectId: scratch.id,
      name: deriveRoomNameFromQuestion(question),
    });
    roomId = room.id;
  } catch {
    return { status: "error", message: ASK_ERROR_MESSAGE };
  }

  // The sidebar's room list lives in the workspace layout, which a
  // client-side push to a nested route would otherwise reuse from cache.
  // Matches createRoomFromBrief and createRoomWithParticipants.
  revalidatePath(`/${workspaceId}`, "layout");

  // The room exists from here on and is never rolled back.
  try {
    const readiness = await getAgentReadiness();
    const isReady = readiness.ready === true;
    await postMessage({
      roomId,
      clientId: randomUUID(),
      body: isReady ? buildAskOpener(question) : question,
      mentionedUserIds: [],
      mentionsProductAgent: isReady,
    });
    return { status: "ok", roomId, ready: isReady };
  } catch {
    return { status: "ok", roomId, ready: false };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/rooms/actions.test.ts
pnpm --filter @meld/web typecheck
```

Expected: PASS, 5 new tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms
git commit -m "feat(rooms): start a scratch room from a typed question"
```

---

### Task 7: Keyboard navigation in the console primitive

`ui/meld/console.tsx` has **no test file today**. This task adds one and the behaviour it covers. The primitive stays ignorant of rooms, projects, and asking — it moves a highlight and emits events, which is why it needs no server-action mocks.

Plain `Enter` and the send button both go through the existing `<form>`'s `onSubmit`, so `onKeyDown` deliberately does not handle plain Enter — handling it in both places would fire the action twice.

**Files:**
- Modify: `apps/web/src/ui/meld/console.tsx`
- Create: `apps/web/src/ui/meld/console.test.tsx`
- Modify: `apps/web/src/ui/meld/console-row.module.css`

**Interfaces:**
- Consumes: `MeldKeycap` from `@/ui/meld/keycap`
- Produces:
  - `MeldConsoleSearchProps` gains `rowCount?: number`, `highlightedIndex?: number`, `onHighlightChange?: (index: number) => void`, `onRunAsk?: () => void`, `onClear?: () => void`, `isBusy?: boolean`
  - `MeldConsoleSearchProps.onSubmit` is unchanged in name and signature (`() => void`)
  - `MeldConsoleRowProps` gains `shortcut?: string`

- [ ] **Step 1: Write the failing test**

`apps/web/src/ui/meld/console.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldConsoleSearch, MeldConsoleRow } from "./console";

afterEach(cleanup);

function renderSearch(
  props: Partial<Parameters<typeof MeldConsoleSearch>[0]> = {},
) {
  return render(
    <MeldConsoleSearch
      value="check"
      onValueChange={vi.fn()}
      rowCount={3}
      highlightedIndex={0}
      onHighlightChange={vi.fn()}
      onSubmit={vi.fn()}
      onRunAsk={vi.fn()}
      onClear={vi.fn()}
      {...props}
    />,
  );
}

it("moves the highlight down", async () => {
  const onHighlightChange = vi.fn();
  renderSearch({ highlightedIndex: 0, onHighlightChange });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{ArrowDown}");

  expect(onHighlightChange).toHaveBeenCalledWith(1);
});

it("moves the highlight up", async () => {
  const onHighlightChange = vi.fn();
  renderSearch({ highlightedIndex: 2, onHighlightChange });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{ArrowUp}");

  expect(onHighlightChange).toHaveBeenCalledWith(1);
});

it("does not move past the last row", async () => {
  const onHighlightChange = vi.fn();
  renderSearch({ rowCount: 3, highlightedIndex: 2, onHighlightChange });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{ArrowDown}");

  expect(onHighlightChange).toHaveBeenCalledWith(2);
});

it("does not move past the first row", async () => {
  const onHighlightChange = vi.fn();
  renderSearch({ highlightedIndex: 0, onHighlightChange });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{ArrowUp}");

  expect(onHighlightChange).toHaveBeenCalledWith(0);
});

it("runs the highlighted row on Enter", async () => {
  const onSubmit = vi.fn();
  const onRunAsk = vi.fn();
  renderSearch({ onSubmit, onRunAsk });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Enter}");

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onRunAsk).not.toHaveBeenCalled();
});

it("asks on Meta+Enter regardless of the highlight", async () => {
  const onSubmit = vi.fn();
  const onRunAsk = vi.fn();
  renderSearch({ highlightedIndex: 2, onSubmit, onRunAsk });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

  expect(onRunAsk).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

it("asks on Control+Enter for keyboards without a Meta key", async () => {
  const onRunAsk = vi.fn();
  renderSearch({ onRunAsk });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Control>}{Enter}{/Control}");

  expect(onRunAsk).toHaveBeenCalledTimes(1);
});

it("clears on Escape", async () => {
  const onClear = vi.fn();
  renderSearch({ onClear });

  await userEvent.click(screen.getByRole("textbox"));
  await userEvent.keyboard("{Escape}");

  expect(onClear).toHaveBeenCalledTimes(1);
});

it("disables the field while busy", () => {
  renderSearch({ isBusy: true });

  expect(screen.getByRole("textbox")).toBeDisabled();
});

it("prints a row's shortcut", () => {
  render(<MeldConsoleRow name="Ask" shortcut="⌘↵" onToggle={vi.fn()} />);

  expect(screen.getByText("⌘↵")).toBeVisible();
});

it("marks the highlighted row as selected", () => {
  render(<MeldConsoleRow name="Ask" isSelected onToggle={vi.fn()} />);

  expect(screen.getByRole("button")).toHaveAttribute(
    "data-selected",
    "true",
  );
});
```

If `toBeDisabled` / `toBeVisible` / `toHaveAttribute` are unavailable, this repo does not load `@testing-library/jest-dom`. Check a neighbouring test (e.g. `apps/web/src/ui/meld/text-input.test.tsx`) and match whatever assertion style it uses instead — do not add a new dependency.

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/ui/meld/console.test.tsx
```

Expected: FAIL — `onHighlightChange` never called; `shortcut` not rendered.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/ui/meld/console.tsx`, extend the props and add the key handler:

```tsx
export type MeldConsoleSearchProps = {
  placeholder?: string;
  id?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onFocusChange?: (isFocused: boolean) => void;
  /** Runs the highlighted row. Fired by Enter and by the send button. */
  onSubmit?: () => void;
  /** How many runnable rows the panel is showing. Bounds the highlight. */
  rowCount?: number;
  /** The highlighted row, owned by the caller so it can render the row too. */
  highlightedIndex?: number;
  onHighlightChange?: (index: number) => void;
  /** Ask, whatever is highlighted. Bound to ⌘↵ / Ctrl+↵. */
  onRunAsk?: () => void;
  /** Escape. */
  onClear?: () => void;
  /** An action is in flight: the field is disabled. */
  isBusy?: boolean;
  /** The results/actions panel, rendered under the field while typing. */
  children?: ReactNode;
};
```

```tsx
export function MeldConsoleSearch({
  placeholder = "Search projects, rooms, people…",
  id,
  value,
  onValueChange,
  onFocusChange,
  onSubmit,
  rowCount = 0,
  highlightedIndex = 0,
  onHighlightChange,
  onRunAsk,
  onClear,
  isBusy = false,
  children,
}: MeldConsoleSearchProps) {
  const hasQuery = (value ?? "").trim().length > 0;

  // Plain Enter is deliberately absent: the form's onSubmit already handles
  // it, and the send button, through one path. Handling it here too would
  // run the highlighted row twice.
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClear?.();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onRunAsk?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onHighlightChange?.(Math.min(highlightedIndex + 1, Math.max(rowCount - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onHighlightChange?.(Math.max(highlightedIndex - 1, 0));
    }
  }

  return (
    <div className={styles.searchWrap}>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <span className={styles.brand}>meld</span>
        <input
          id={id}
          className={styles.searchInput}
          placeholder={placeholder}
          aria-label="Search, create, or ask"
          value={value}
          disabled={isBusy}
          onChange={(event) => onValueChange?.(event.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label="Send"
          disabled={!hasQuery || isBusy}
        >
          <PixelArrowUp aria-hidden />
        </button>
      </form>
      {children}
    </div>
  );
}
```

Add `import type { KeyboardEvent, ReactNode } from "react";` — the file currently imports only `ReactNode` — and use `KeyboardEvent<HTMLInputElement>` rather than `React.KeyboardEvent<...>` to match the file's existing import style.

For `MeldConsoleRow`, add `shortcut?: string` to the props and render it after `stage`/`trailing` in `body`:

```tsx
      {shortcut ? (
        <span className={styles.shortcut}>
          <MeldKeycap>{shortcut}</MeldKeycap>
        </span>
      ) : null}
```

with `import { MeldKeycap } from "./keycap";` at the top.

Add to `apps/web/src/ui/meld/console-row.module.css`, beside the existing `.stage` and `.trailing` rules — match their exact declaration style rather than copying this verbatim if they differ:

```css
/* The row's own shortcut, pushed to the end like `.trailing`. Quiet: it is a
 * hint for people who already know the row, not a label for the row. */
.shortcut {
  margin-inline-start: auto;
  flex: none;
  opacity: 0.6;
}
```

`isSelected` and its `data-selected` attribute already exist on the row and need no change — add a `[data-selected="true"]` rule beside the existing `.row:hover` rule using the same background token, so the highlight and hover read identically.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/ui/meld/console.test.tsx
pnpm --filter @meld/web typecheck
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/ui/meld
git commit -m "feat(ui): keyboard navigation and row shortcuts in the console"
```

---

### Task 8: Wire the console — rows, highlight, and asking

The last task, and the one a reviewer should look hardest at: it is where the whole interaction becomes real. `workspace-console.tsx` has **no test file today** — `deck.test.tsx` was deleted on this branch and nothing replaced it.

This task also remounts `DeckShortcuts`. It already implements `⌘K` (focus `#deck-prompt`, still the console input's id) and `⌘N` (new project), but nothing has imported it since the console replaced the old deck, so both bindings are currently dead.

**Files:**
- Modify: `apps/web/src/features/home/components/workspace-console.tsx`
- Create: `apps/web/src/features/home/components/workspace-console.test.tsx`

**Interfaces:**
- Consumes: `createRoomFromQuestion` + `CreateRoomFromQuestionResult` (Task 6); `MeldConsoleSearch`'s new props and `MeldConsoleRow.shortcut` (Task 7); `DeckShortcuts` from `./deck-shortcuts`
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/home/components/workspace-console.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// WorkspaceConsole mounts CreateProjectDialog and CreateRoomDialog, both of
// which read useRouter() on every render and reach a "use server" module --
// mocked the same way project-column.test.tsx does it.
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  listRoomInviteCandidates: vi.fn(),
  createRoomWithParticipants: vi.fn(),
  createRoomFromQuestion: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/rooms/actions", () => ({
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
  createRoomWithParticipants: mocks.createRoomWithParticipants,
  createRoomFromQuestion: mocks.createRoomFromQuestion,
}));

import {
  WorkspaceConsole,
  type ConsoleProject,
  type ConsoleTeammate,
} from "./workspace-console";

const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const PROJECTS: ConsoleProject[] = [
  {
    id: "project-1",
    name: "Checkout",
    icon: "folder",
    color: "blue",
    updatedAt: "2026-08-20T10:00:00.000Z",
    rooms: [
      {
        id: "room-1",
        name: "Checkout flow",
        stage: "Discovery",
        stageKey: "discovery",
      },
    ],
  },
];

const TEAMMATES: ConsoleTeammate[] = [
  {
    id: "design",
    name: "design-agent",
    status: "ready",
    sprite: "purple-pocket",
  },
];

function renderConsole() {
  return render(
    <WorkspaceConsole
      workspaceId={WORKSPACE_ID}
      workspaceName="Meld"
      workspaceLogoUrl={null}
      workspaces={[]}
      projects={PROJECTS}
      teammates={TEAMMATES}
      printedOn={new Date("2026-08-20T12:00:00.000Z")}
    />,
  );
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.listRoomInviteCandidates.mockReset();
  mocks.createRoomWithParticipants.mockReset();
  mocks.createRoomFromQuestion.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([]);
  mocks.createRoomFromQuestion.mockResolvedValue({
    status: "ok",
    roomId: "room-9",
    ready: true,
  });
});

afterEach(cleanup);

it("offers to ask even when nothing matches", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "how do refunds work",
  );

  expect(
    screen.getByRole("button", { name: /“how do refunds work” — ask/i }),
  ).toBeVisible();
});

it("offers to ask even when something matches", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "checkout",
  );

  expect(
    screen.getByRole("button", { name: /“checkout” — ask/i }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /checkout flow/i })).toBeVisible();
});

it("searches teammates by name", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "design",
  );

  expect(screen.getByRole("link", { name: /design-agent/i })).toBeVisible();
});

it("Enter opens the top match when the query matched", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "checkout{Enter}",
  );

  expect(mocks.createRoomFromQuestion).not.toHaveBeenCalled();
  expect(mocks.push).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}/rooms/room-1`,
  );
});

it("Enter asks when the query matched nothing", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "how do refunds work{Enter}",
  );

  expect(mocks.createRoomFromQuestion).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    question: "how do refunds work",
  });
  expect(mocks.push).toHaveBeenCalledWith(`/${WORKSPACE_ID}/rooms/room-9`);
});

it("Meta+Enter asks even when the query matched", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "checkout",
  );
  await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

  expect(mocks.createRoomFromQuestion).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    question: "checkout",
  });
});

it("surfaces an error and re-enables the field when asking fails", async () => {
  mocks.createRoomFromQuestion.mockResolvedValue({
    status: "error",
    message: "We could not start a room. Please try again.",
  });
  renderConsole();

  const field = screen.getByRole("textbox", {
    name: /search, create, or ask/i,
  });
  await userEvent.type(field, "how do refunds work{Enter}");

  expect(
    await screen.findByText(/we could not start a room/i),
  ).toBeVisible();
  expect(field).not.toBeDisabled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("Escape clears the query", async () => {
  renderConsole();

  const field = screen.getByRole("textbox", {
    name: /search, create, or ask/i,
  });
  await userEvent.type(field, "checkout");
  await userEvent.keyboard("{Escape}");

  expect(field).toHaveValue("");
});

// Replaced by the Ask row, which does the same job without a dialog.
it("no longer offers a start-a-room action row", async () => {
  renderConsole();

  await userEvent.type(
    screen.getByRole("textbox", { name: /search, create, or ask/i }),
    "checkout",
  );

  expect(
    screen.queryByRole("button", { name: /start a room about/i }),
  ).toBeNull();
});

// DeckShortcuts already implements this and already targets #deck-prompt;
// nothing had imported it since the console replaced the old deck.
it("focuses the field on Meta+K", async () => {
  renderConsole();

  await userEvent.keyboard("{Meta>}k{/Meta}");

  expect(screen.getByRole("textbox", { name: /search, create, or ask/i }))
    .toHaveFocus();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @meld/web test -- src/features/home/components/workspace-console.test.tsx
```

Expected: FAIL — no Ask row exists.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/features/home/components/workspace-console.tsx`:

Add imports:

```tsx
import { createRoomFromQuestion } from "@/features/rooms/actions";
import { DeckShortcuts } from "./deck-shortcuts";
```

Add a row-descriptor type above the component, so an index unambiguously identifies a row and `run` cannot drift from what is rendered:

```tsx
// Every runnable row in the results panel, in render order. The highlight is
// an index into this list, which is why it is built once and both rendered
// and dispatched from -- two parallel lists would drift.
type ConsoleAction =
  | { kind: "ask" }
  | { kind: "room"; roomId: string }
  | { kind: "project"; projectId: string }
  | { kind: "teammate" }
  | { kind: "create-project" };
```

Replace the existing `submit` and add the state around it:

```tsx
  const [movedIndex, setMovedIndex] = useState<number | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const matchingTeammates = trimmed
    ? teammates.filter((teammate) =>
        teammate.name.toLowerCase().includes(needle),
      )
    : [];

  const actions: ConsoleAction[] = [
    { kind: "ask" },
    ...matchingRooms.map(({ room }) => ({
      kind: "room" as const,
      roomId: room.id,
    })),
    ...matchingProjects.map((project) => ({
      kind: "project" as const,
      projectId: project.id,
    })),
    ...matchingTeammates.map(() => ({ kind: "teammate" as const })),
    { kind: "create-project" },
  ];

  // Ask is index 0, so the first match is index 1. Defaulting to it means
  // Enter opens what you were looking for; with nothing to open, the default
  // falls back to Ask. `movedIndex` is only consulted once you have actually
  // pressed an arrow, so the default keeps tracking the matches as you type.
  const hasMatches =
    matchingRooms.length + matchingProjects.length + matchingTeammates.length >
    0;
  const defaultIndex = hasMatches ? 1 : 0;
  const highlightedIndex = Math.min(
    movedIndex ?? defaultIndex,
    actions.length - 1,
  );

  async function ask() {
    if (!trimmed || isAsking) return;
    setIsAsking(true);
    setAskError(null);
    const result = await createRoomFromQuestion({
      workspaceId,
      question: trimmed,
    });
    if (result.status === "error") {
      setAskError(result.message);
      setIsAsking(false);
      return;
    }
    // Deliberately stays disabled through the navigation: the room is real
    // and a second Enter here would file a duplicate.
    router.push(`/${workspaceId}/rooms/${result.roomId}`);
  }

  function run(index: number) {
    const action = actions[index];
    if (!action) return;
    switch (action.kind) {
      case "ask":
        void ask();
        return;
      case "room":
        router.push(`/${workspaceId}/rooms/${action.roomId}`);
        return;
      case "project":
        setOpenProjectId(action.projectId);
        setQuery("");
        setMovedIndex(null);
        return;
      case "teammate":
        router.push(`/${workspaceId}/settings/members`);
        return;
      case "create-project":
        setIsCreateProjectOpen(true);
    }
  }
```

Wire the search element:

```tsx
      <MeldConsoleSearch
        id="deck-prompt"
        placeholder={placeholder}
        value={query}
        onValueChange={(next) => {
          setQuery(next);
          setMovedIndex(null);
          setAskError(null);
        }}
        onFocusChange={setIsFocused}
        rowCount={actions.length}
        highlightedIndex={highlightedIndex}
        onHighlightChange={setMovedIndex}
        onSubmit={() => run(highlightedIndex)}
        onRunAsk={() => void ask()}
        onClear={() => {
          setQuery("");
          setMovedIndex(null);
          setAskError(null);
        }}
        isBusy={isAsking}
      >
```

Inside the `trimmed ? <MeldConsoleResults>` block, the Ask row goes **first**, before the room rows:

```tsx
            <MeldConsoleRow
              isAction
              name={
                isAsking
                  ? "Starting a room…"
                  : `“${trimmed}” — Ask`
              }
              shortcut="⌘↵"
              isSelected={highlightedIndex === 0}
              onToggle={() => void ask()}
            />
```

Give every other row in the panel its `isSelected={highlightedIndex === n}`, where `n` is that row's position in `actions`. Compute the group offsets once, next to `actions`, rather than inlining arithmetic at each call site:

```tsx
  const roomOffset = 1;
  const projectOffset = roomOffset + matchingRooms.length;
  const teammateOffset = projectOffset + matchingProjects.length;
  const createProjectIndex = teammateOffset + matchingTeammates.length;
```

Add the teammate rows after the project rows and before `+ Create project`, each linking to the members page so a highlighted teammate row has somewhere real to go:

```tsx
            {matchingTeammates.map((teammate, position) => (
              <MeldConsoleRow
                key={teammate.id}
                icon={
                  <MeldConsoleSprite>
                    <MeldAgent sprite={teammate.sprite} appearance="head" />
                  </MeldConsoleSprite>
                }
                name={teammate.name}
                meta={teammate.status}
                href={`/${workspaceId}/settings/members`}
                isSelected={highlightedIndex === teammateOffset + position}
              />
            ))}
```

Delete the `+ Start a room about “…”` row entirely — the Ask row replaces it.

Render the error under the panel, inside the same `MeldConsoleResults`, after the create-project row:

```tsx
            {askError ? (
              <MeldConsoleRow isAction name={askError} />
            ) : null}
```

Finally, mount the shortcuts inside `<MeldConsole>`, above `MeldWorkspaceBar`:

```tsx
      <DeckShortcuts onNewProject={() => setIsCreateProjectOpen(true)} />
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @meld/web test -- src/features/home
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/home
git commit -m "feat(home): ask from the deck's field"
```

---

### Task 9: End-to-end coverage

Proves the whole path against a running app: type a question, land in a room in the scratch project with the question posted.

**Files:**
- Create: `e2e/deck-ask.spec.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing spec**

Read `e2e/deck.spec.ts` first and copy its `authenticate`, `requireBaseURL`, and `openDeck` helpers verbatim — the repo's convention is that each spec pins the fake's contract independently rather than sharing a fixture module. Then:

```ts
test("a question typed on the deck starts a room", async ({ page }) => {
  await openDeck(page);

  const field = page.getByRole("textbox", {
    name: /search, create, or ask/i,
  });
  await field.fill("how do refunds work");

  await expect(
    page.getByRole("button", { name: /“how do refunds work” — ask/i }),
  ).toBeVisible();

  await field.press("Enter");

  await expect(page).toHaveURL(/\/rooms\/[0-9a-f-]+$/);
  await expect(page.getByText("how do refunds work")).toBeVisible();
});

test("Meta+Enter asks even when the query matches a room", async ({
  page,
}) => {
  await openDeck(page);

  const field = page.getByRole("textbox", {
    name: /search, create, or ask/i,
  });
  // A substring of a seeded room name, so the query definitely matches.
  await field.fill("Meld");
  await expect(page.getByRole("link", { name: /Meld/i }).first()).toBeVisible();

  await field.press("Meta+Enter");

  await expect(page).toHaveURL(/\/rooms\/[0-9a-f-]+$/);
});
```

- [ ] **Step 2: Run the spec to verify it fails**

```bash
pnpm test:e2e -- deck-ask.spec.ts
```

Expected: FAIL if run before Tasks 1–8; PASS after. If it fails after, the most likely cause is the E2E fake — `createRoomFromQuestion` calls `getProjectBackend().getScratchProject`, which under the fake resolves through `fakeGetScratchProject` (Task 4), and `postMessage`, which resolves through `rooms/e2e-fake.ts`. Check that the seeded workspace has a project with `isScratch: true`.

- [ ] **Step 3: Run the whole suite**

```bash
pnpm test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm test:e2e
```

Expected: all green. `pnpm test` includes `check:test-colocation`, which will fail if any test file from this plan landed outside its source file's directory.

- [ ] **Step 4: Commit**

```bash
git add e2e/deck-ask.spec.ts
git commit -m "test(e2e): cover asking from the deck's field"
```

---

## Notes for the reviewer

Three decisions in this plan that a reviewer should confirm rather than assume:

1. **Teammate rows link to `settings/members`.** The spec says teammates become searchable, but there is no per-teammate page to open. Sending them to the members page keeps every row in the panel runnable, which is what lets the highlight be a simple contiguous index. The alternative — non-runnable rows the highlight has to skip — costs more machinery than the feature is worth.

2. **`Enter` opens the top match; only `⌘↵` always asks.** Dia makes row 1 the default action. Here row 1 is Ask, but the default highlight starts on the first *match* when there is one. This is in the spec, and it is the one place the implementation is not a literal copy of the reference.

3. **`DeckShortcuts` is remounted, not rewritten.** `⌘K` and `⌘N` are currently dead code on this branch. Task 8 mounts the existing component. Five other components orphaned by the same refactor (`DeckPrompt`, `StartingPoints`, `NeedsAttention`, `PendingTicket`, `ProjectColumn`) are left alone — see the spec's "Flagged, not fixed here".
