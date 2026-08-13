# Design Room Slice 1 — Data & Contracts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the entire durable persistence layer and contracts for the Design Room — seven tables with RLS, versioned profiles and screens with retain-loser compare-and-swap promotion, an events feed, a workspace-scoped storage bucket, and the two new AI task kinds' database RPCs — with nothing wired into the connector or the app yet.

**Architecture:** Postgres migrations following the existing task-kind + RLS conventions (ref: `202608100001_user_flow_generation.sql`), a new FK-pointer compare-and-swap that *retains* the losing generation as a stale candidate (deviating from PRD's raise-on-conflict), and Zod contract schemas plus a pure deterministic token-CSS compiler. Everything is tested by pgTAP (`supabase test db`) and vitest contract/unit tests — no app UI, no connector generation, no gateway change (the gateway is kind-agnostic).

**Tech Stack:** Postgres/Supabase, pgTAP, TypeScript 5.9.3, Zod 4.4.3, vitest, pnpm 10.28.1, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md`
**Convention research (read for context):** `.context/slice-1-research.md`
**Slice-0 findings this builds on:** `docs/design/reports/2026-08-13-design-room-slice-0-findings.md`

## Global Constraints

- Node `>=22.23.2` (pgTAP/`node:sqlite`-adjacent tooling assumes it), pnpm `10.28.1`, TypeScript `5.9.3`, Zod `4.4.3`. Never change versions.
- **Current schema vocabulary (post-rename `202608110001`): use `public.rooms`, `workspace_id`, `is_workspace_member(uuid)`, `is_workspace_admin(uuid)`, `is_room_participant(uuid)`, `can_edit_room(uuid)`. Never use `organization_*`, `is_org_member`, or `discovery_rooms`.**
- Migration filenames: `YYYYMMDDNNNN_snake_case.sql`. This slice uses the `20260813NNNN` sequence starting at `0004` (latest existing today is `202608130003`).
- Every `security definer` function sets `search_path = ''` and is immediately followed by `revoke all on function ... from public;` then `grant execute on function ... to authenticated;` (or `to service_role;` where noted).
- Every new table: `enable row level security`, `revoke all ... from anon`, then grant the **minimal** verb set to `authenticated` — full CRUD only when users write it directly; **`select`-only when a trigger/RPC materializes it** (all `*_versions`, `*_events`, `*_snapshots`, and the two `*_generations` tracking tables are select-only + SECURITY-DEFINER writes, no insert/update/delete policy).
- Policy naming: `"<Actor> can <verb> <object>"`, sentence case; one policy per `for select|insert|update|delete`, never `for all`.
- Size caps, copied from the spec and `packages/contracts/src/ai.ts`: `MAX_RESULT_BYTES = 256*1024`, `MAX_HYDRATED_CONTEXT_BYTES = 512*1024`. Every feature table storing a task payload re-checks `pg_column_size(<jsonb col>) <= 262144`. The design profile serialized whole is `<= 65536` bytes.
- **Compare-and-swap promotion retains the loser.** On CAS failure (`current_version_id is distinct from base_version_id`), the losing version row stays as a queryable stale candidate and an event is recorded — it is **never** deleted and the RPC **never** raises. This deviates from `save_prd_version`'s `raise exception 'prd_version_conflict'`; do not copy that behavior.
- The browser never reads `ai_tasks.result_json` directly — results are materialized into narrow per-feature tables read through `get_*` SECURITY DEFINER RPCs gated by `is_room_participant` / `is_workspace_member`.
- **Enum parity:** any migration that adds an enum value matching a `@meld/contracts` Zod enum must be registered in `scripts/check-contract-enum-parity.mjs`'s `ENUM_MIGRATIONS`, in filename order, and its SQL values must exactly equal the contract enum's `.options`.
- pgTAP tasks require the local Supabase stack running (Docker/colima up — see `.context`/memory `meld-local-setup`). Run them with `supabase db reset && supabase test db`. Contract/unit (vitest) tasks need no database.
- No connector, gateway, or `apps/web` runtime code in this slice. (Contracts and pure functions only on the TypeScript side.)

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/contracts/src/design-profile.ts` | Zod: `DesignProfileSchema` (validated profile data) + `DesignProfileDistillResultSchema` (`{profile, tokenCss}`) + byte limits. |
| `packages/contracts/src/design-events.ts` | Zod: `DesignScreenEventKindSchema` enum (mirrors the SQL `design_event_kind`). |
| `packages/contracts/src/index.ts` | Re-export the two new modules. |
| `packages/prototype/src/token-css.ts` | Pure deterministic `compileTokenCss(profile)` → CSS custom properties. |
| `scripts/check-contract-enum-parity.mjs` | Register the two new enum migrations. |
| `supabase/migrations/202608130004_design_task_kinds.sql` | `alter type ai_task_kind add value` ×2 (own file, before use). |
| `supabase/migrations/202608130005_design_profiles.sql` | `design_system_profiles` + `_profile_versions` + RLS + workspace storage bucket + `storage_workspace_id`. |
| `supabase/migrations/202608130006_design_screens.sql` | `design_screen_state` enum, `design_screens` + `design_screen_versions` + immutability trigger + RLS. |
| `supabase/migrations/202608130007_design_screen_promote.sql` | `promote_design_screen_version` retain-loser CAS RPC. |
| `supabase/migrations/202608130008_design_events.sql` | `design_event_kind` enum, `design_screen_events` + `append_design_screen_event` + RLS. |
| `supabase/migrations/202608130009_design_references_handoffs.sql` | `design_references` + `design_handoff_snapshots` + RLS. |
| `supabase/migrations/202608130010_design_task_rpcs.sql` | `design_*_generations` tracking tables, `create_*_task` RPCs, materialize triggers, `get_*` RPCs, hydration extension. |
| `supabase/tests/design_profiles.test.sql` | pgTAP: profile/version RLS + storage + active-pointer. |
| `supabase/tests/design_screens.test.sql` | pgTAP: screen/version RLS, immutability, CAS retain-loser concurrency. |
| `supabase/tests/design_task_rpcs.test.sql` | pgTAP: create/materialize/get RPC matrix + events. |

**Dependency order:** contracts (Tasks 1–3) are independent of SQL; migrations are strictly ordered 4→10 (each uses the prior's types/tables). pgTAP tasks follow their migrations.

---

### Task 1: Design profile contract + token-CSS compiler

**Files:**
- Create: `packages/contracts/src/design-profile.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/design-profile.test.ts`
- Create: `packages/prototype/src/token-css.ts`
- Modify: `packages/prototype/src/index.ts`
- Test: `packages/prototype/src/token-css.test.ts`

**Interfaces:**
- Produces (contracts): `DesignProfileSchema`, `DesignProfileDistillResultSchema`, types `DesignProfile` / `DesignProfileDistillResult`, and constants `MAX_PROFILE_BYTES` (65536), `MAX_PROFILE_COLORS` (64), `MAX_PROFILE_TYPE_STEPS` (16), `MAX_PROFILE_SPACING_STEPS` (16), `MAX_PROFILE_RADII` (12), `MAX_PROFILE_COMPONENTS` (80), `MAX_COMPONENT_RULE_BYTES` (2048).
- Produces (prototype): `compileTokenCss(profile: DesignProfile): string`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/contracts/src/design-profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DesignProfileSchema,
  DesignProfileDistillResultSchema,
  MAX_PROFILE_BYTES,
  MAX_PROFILE_COLORS,
  MAX_PROFILE_COMPONENTS,
} from "./design-profile";

function validProfile() {
  return {
    colors: [{ name: "primary", value: "#2f6feb" }, { name: "text", value: "#e6edf3" }],
    typeScale: [{ name: "body", px: 16 }, { name: "h1", px: 26 }],
    spacing: [{ name: "sm", px: 8 }, { name: "md", px: 14 }],
    radii: [{ name: "md", px: 14 }],
    components: [{ name: "button", rules: "solid primary bg, 14px radius, 15px pad" }],
  };
}

describe("DesignProfileSchema", () => {
  it("accepts a minimal profile", () => {
    expect(DesignProfileSchema.parse(validProfile()).colors).toHaveLength(2);
  });

  it("rejects a non-CSS colour value", () => {
    const p = validProfile();
    p.colors[0].value = "not a colour";
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("rejects duplicate colour names", () => {
    const p = validProfile();
    p.colors.push({ name: "primary", value: "#000000" });
    expect(() => DesignProfileSchema.parse(p)).toThrow("Duplicate colour name");
  });

  it("enforces the colour count cap", () => {
    const p = validProfile();
    p.colors = Array.from({ length: MAX_PROFILE_COLORS + 1 }, (_, i) => ({ name: `c${i}`, value: "#000000" }));
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("enforces the component count cap", () => {
    const p = validProfile();
    p.components = Array.from({ length: MAX_PROFILE_COMPONENTS + 1 }, (_, i) => ({ name: `k${i}`, rules: "x" }));
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("rejects a whole profile past the byte cap", () => {
    const p = validProfile();
    p.components = [{ name: "big", rules: "x".repeat(MAX_PROFILE_BYTES) }];
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });
});

describe("DesignProfileDistillResultSchema", () => {
  it("wraps a profile with its compiled token css", () => {
    const parsed = DesignProfileDistillResultSchema.parse({
      profile: validProfile(),
      tokenCss: ":root{--ds-color-primary:#2f6feb}",
    });
    expect(parsed.tokenCss).toContain("--ds-color-primary");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts test design-profile`
Expected: FAIL — `Cannot find module './design-profile'`.

- [ ] **Step 3: Implement the contract**

Create `packages/contracts/src/design-profile.ts`:

```ts
import { z } from "zod";

export const MAX_PROFILE_BYTES = 65536;
export const MAX_PROFILE_COLORS = 64;
export const MAX_PROFILE_TYPE_STEPS = 16;
export const MAX_PROFILE_SPACING_STEPS = 16;
export const MAX_PROFILE_RADII = 12;
export const MAX_PROFILE_COMPONENTS = 80;
export const MAX_COMPONENT_RULE_BYTES = 2048;

const encoder = new TextEncoder();
const byteLength = (v: string) => encoder.encode(v).length;

// A token identifier that is safe to interpolate into a CSS custom-property
// name: lowercase, no separators that could break out of `--ds-…`.
const TokenName = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9-]{0,39}$/, "token name must be kebab-case");

// A permissive CSS colour: hex, rg[b]a(), hsl[a](), or a bare CSS keyword.
const CssColor = z
  .string()
  .trim()
  .regex(
    /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s/]+\)|hsla?\([0-9.,%\s/]+\)|[a-zA-Z]+)$/,
    "must be a CSS colour",
  );

const NamedPx = z
  .object({ name: TokenName, px: z.number().int().min(0).max(4096) })
  .strict();

function uniqueNames(field: string) {
  return (items: { name: string }[], ctx: z.RefinementCtx) => {
    const seen = new Set<string>();
    for (const [i, item] of items.entries()) {
      if (seen.has(item.name)) {
        ctx.addIssue({ code: "custom", message: `Duplicate ${field} name: ${item.name}`, path: [i, "name"] });
      }
      seen.add(item.name);
    }
  };
}

export const DesignProfileSchema = z
  .object({
    colors: z
      .array(z.object({ name: TokenName, value: CssColor }).strict())
      .max(MAX_PROFILE_COLORS)
      .superRefine(uniqueNames("colour")),
    typeScale: z.array(NamedPx).max(MAX_PROFILE_TYPE_STEPS).superRefine(uniqueNames("type step")),
    spacing: z.array(NamedPx).max(MAX_PROFILE_SPACING_STEPS).superRefine(uniqueNames("spacing step")),
    radii: z.array(NamedPx).max(MAX_PROFILE_RADII).superRefine(uniqueNames("radius")),
    components: z
      .array(
        z
          .object({
            name: TokenName,
            rules: z.string().trim().min(1).refine((v) => byteLength(v) <= MAX_COMPONENT_RULE_BYTES, {
              message: `component rules exceed ${MAX_COMPONENT_RULE_BYTES} bytes`,
            }),
          })
          .strict(),
      )
      .max(MAX_PROFILE_COMPONENTS)
      .superRefine(uniqueNames("component")),
  })
  .strict()
  .refine((p) => byteLength(JSON.stringify(p)) <= MAX_PROFILE_BYTES, {
    message: `profile exceeds ${MAX_PROFILE_BYTES} bytes`,
  });
export type DesignProfile = z.infer<typeof DesignProfileSchema>;

// What the connector returns for a design_profile_distill task: the validated
// profile DATA plus the token CSS *Meld* compiled from it (never the model).
export const DesignProfileDistillResultSchema = z
  .object({
    profile: DesignProfileSchema,
    tokenCss: z.string().max(MAX_PROFILE_BYTES),
  })
  .strict();
export type DesignProfileDistillResult = z.infer<typeof DesignProfileDistillResultSchema>;
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from "./design-profile";
```

- [ ] **Step 4: Run the contract test**

Run: `pnpm --filter @meld/contracts test design-profile && pnpm --filter @meld/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Write the failing token-CSS test**

Create `packages/prototype/src/token-css.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileTokenCss } from "./token-css";

const profile = {
  colors: [{ name: "primary", value: "#2f6feb" }, { name: "text", value: "#e6edf3" }],
  typeScale: [{ name: "body", px: 16 }],
  spacing: [{ name: "md", px: 14 }],
  radii: [{ name: "md", px: 14 }],
  components: [{ name: "button", rules: "solid" }],
};

describe("compileTokenCss", () => {
  it("emits kebab custom properties under :root", () => {
    const css = compileTokenCss(profile);
    expect(css).toContain(":root {");
    expect(css).toContain("--ds-color-primary: #2f6feb;");
    expect(css).toContain("--ds-font-body: 16px;");
    expect(css).toContain("--ds-space-md: 14px;");
    expect(css).toContain("--ds-radius-md: 14px;");
  });

  it("is deterministic for identical input", () => {
    expect(compileTokenCss(profile)).toBe(compileTokenCss(profile));
  });

  it("does not emit component rules (they are guidance for the model, not CSS)", () => {
    expect(compileTokenCss(profile)).not.toContain("solid");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @meld/prototype test token-css`
Expected: FAIL — `Cannot find module './token-css'`.

- [ ] **Step 7: Implement the compiler**

Create `packages/prototype/src/token-css.ts`:

```ts
import type { DesignProfile } from "@meld/contracts";

// Deterministically compile validated profile DATA into CSS custom properties.
// The model never writes this — Meld does — so it is a pure function of the
// profile. Component `rules` are model guidance, not CSS, and are not emitted.
export function compileTokenCss(profile: DesignProfile): string {
  const lines: string[] = [];
  for (const c of profile.colors) lines.push(`  --ds-color-${c.name}: ${c.value};`);
  for (const t of profile.typeScale) lines.push(`  --ds-font-${t.name}: ${t.px}px;`);
  for (const s of profile.spacing) lines.push(`  --ds-space-${s.name}: ${s.px}px;`);
  for (const r of profile.radii) lines.push(`  --ds-radius-${r.name}: ${r.px}px;`);
  return `:root {\n${lines.join("\n")}\n}`;
}
```

Append to `packages/prototype/src/index.ts`:

```ts
export * from "./token-css";
```

- [ ] **Step 8: Run everything**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck && pnpm --filter @meld/prototype lint && pnpm --filter @meld/contracts test && pnpm --filter @meld/contracts typecheck`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/design-profile.ts packages/contracts/src/design-profile.test.ts \
        packages/contracts/src/index.ts packages/prototype/src/token-css.ts \
        packages/prototype/src/token-css.test.ts packages/prototype/src/index.ts
git commit -m "feat(contracts): design profile schema + deterministic token-css compiler"
```

---

### Task 2: Design event-kind contract enum

**Files:**
- Create: `packages/contracts/src/design-events.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/design-events.test.ts`

**Interfaces:**
- Produces: `DesignScreenEventKindSchema` (z.enum), type `DesignScreenEventKind`. The value list is the single source of truth the SQL `design_event_kind` enum (Task 6) and the enum-parity check (Task 3) must match exactly.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/design-events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DesignScreenEventKindSchema } from "./design-events";

describe("DesignScreenEventKindSchema", () => {
  it("lists exactly the seven event kinds in order", () => {
    expect(DesignScreenEventKindSchema.options).toEqual([
      "message",
      "generation_started",
      "version_created",
      "version_promoted",
      "generation_failed",
      "restored",
      "stale_candidate",
    ]);
  });

  it("rejects an unknown kind", () => {
    expect(() => DesignScreenEventKindSchema.parse("exploded")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts test design-events`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/contracts/src/design-events.ts`:

```ts
import { z } from "zod";

// The unified history feed's event kinds. Order is load-bearing: the SQL
// `design_event_kind` enum and the enum-parity check assert this exact list.
export const DesignScreenEventKindSchema = z.enum([
  "message",
  "generation_started",
  "version_created",
  "version_promoted",
  "generation_failed",
  "restored",
  "stale_candidate",
]);
export type DesignScreenEventKind = z.infer<typeof DesignScreenEventKindSchema>;
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from "./design-events";
```

- [ ] **Step 4: Run**

Run: `pnpm --filter @meld/contracts test design-events && pnpm --filter @meld/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/design-events.ts packages/contracts/src/design-events.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): design screen event-kind enum"
```

---

### Task 3: Extend AITaskKindSchema + register enum parity

**Files:**
- Modify: `packages/contracts/src/ai.ts` (the `AITaskKindSchema` enum, lines ~82–91)
- Test: `packages/contracts/src/ai.test.ts` (add cases)
- Modify: `scripts/check-contract-enum-parity.mjs`

**Interfaces:**
- Produces: `AITaskKindSchema` now includes `"design_profile_distill"` and `"design_screen_generate"`. Every later SQL enum-add migration for these kinds must be registered in `ENUM_MIGRATIONS`.

- [ ] **Step 1: Write the failing test**

Add to `packages/contracts/src/ai.test.ts` (inside the existing describe for task kinds, or a new one):

```ts
import { AITaskKindSchema } from "./ai";
import { describe, expect, it } from "vitest";

describe("AITaskKindSchema design kinds", () => {
  it("includes both design task kinds", () => {
    expect(AITaskKindSchema.options).toContain("design_profile_distill");
    expect(AITaskKindSchema.options).toContain("design_screen_generate");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts test -- ai.test`
Expected: FAIL — options do not contain the new kinds.

- [ ] **Step 3: Add the enum values**

In `packages/contracts/src/ai.ts`, extend `AITaskKindSchema` so its array ends:

```ts
export const AITaskKindSchema = z.enum([
  "room_reply",
  "prd_generate",
  "prd_revise",
  "prd_section_revise",
  "prd_section_assist",
  "stage_readiness",
  "user_flow_generate",
  "design_profile_distill",
  "design_screen_generate",
]);
```

- [ ] **Step 4: Run the contract test**

Run: `pnpm --filter @meld/contracts test -- ai.test && pnpm --filter @meld/contracts typecheck`
Expected: PASS.

- [ ] **Step 5: Register the enum migrations for parity**

In `scripts/check-contract-enum-parity.mjs`, add a const near the other `*_MIGRATION` consts:

```js
export const DESIGN_TASK_KINDS_MIGRATION =
  "supabase/migrations/202608130004_design_task_kinds.sql";
```

and push it into the `ENUM_MIGRATIONS` array **in filename order** (after the latest existing entry). This file does not exist until Task 4; that is fine — Step 6 runs after Task 4. If you are executing strictly in order, complete Task 4 before Step 6 here, or temporarily expect Step 6 to fail until the migration lands.

- [ ] **Step 6: Verify parity once Task 4 exists**

Run (after Task 4's migration file exists): `pnpm test:contract-enums && pnpm check:contract-enums`
Expected: PASS — the SQL `ai_task_kind` values equal `AITaskKindSchema.options`.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/ai.ts packages/contracts/src/ai.test.ts scripts/check-contract-enum-parity.mjs
git commit -m "feat(contracts): add design_profile_distill and design_screen_generate task kinds"
```

---

### Task 4: Enum-add migration for the two design task kinds

**Files:**
- Create: `supabase/migrations/202608130004_design_task_kinds.sql`

**Interfaces:**
- Produces: the `ai_task_kind` enum gains `design_profile_distill` and `design_screen_generate`. Must be its own migration committed before any migration that *uses* these values (Postgres forbids using a freshly-added enum value in the same transaction that adds it).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130004_design_task_kinds.sql`:

```sql
-- Add the two Design Room task kinds. Own migration, before any use: Postgres
-- forbids using a new enum value in the same transaction that adds it.
alter type public.ai_task_kind add value if not exists 'design_profile_distill';
alter type public.ai_task_kind add value if not exists 'design_screen_generate';
```

- [ ] **Step 2: Verify it parses and passes enum parity**

Run:
```bash
pnpm check:sql-rooms
pnpm check:contract-enums
```
Expected: both PASS. (`check:contract-enums` now sees the migration registered in Task 3 and matches it against `AITaskKindSchema.options`.)

- [ ] **Step 3: Apply against a fresh database to confirm it runs**

Run: `supabase db reset`
Expected: completes with no error; the migration applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202608130004_design_task_kinds.sql
git commit -m "feat(db): add design task kinds to ai_task_kind enum"
```

---

### Task 5: Profiles, profile-versions, and the workspace design-system bucket

**Files:**
- Create: `supabase/migrations/202608130005_design_profiles.sql`

**Interfaces:**
- Produces tables `public.design_system_profiles` (workspace-scoped, holds `active_version_id`) and `public.design_system_profile_versions` (immutable). Produces `public.storage_workspace_id(text) returns uuid` and a private `design-system` storage bucket. Produces `public.set_active_design_profile_version(target_version_id uuid) returns void`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130005_design_profiles.sql`:

```sql
-- Workspace-scoped design-system profile: one row per workspace, pointing at
-- the active immutable version. Profile DATA is validated in the contract; the
-- token CSS is compiled deterministically by Meld (never the model).

create table public.design_system_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  active_version_id uuid,           -- FK added after the versions table exists
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.design_system_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_json jsonb not null,
  token_css text not null,
  source_object_path text,          -- storage path of the uploaded source doc, if any
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_profile_version_size check (pg_column_size(profile_json) <= 262144)
);

alter table public.design_system_profiles
  add constraint design_system_profiles_active_version_fkey
  foreign key (active_version_id) references public.design_system_profile_versions(id);

create index design_profile_versions_workspace on public.design_system_profile_versions(workspace_id, created_at);

-- Immutable versions: block any UPDATE/DELETE of a version row.
create function public.protect_design_profile_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'design_profile_version_immutable' using errcode = 'P0001';
  return null;
end; $$;

create trigger design_profile_version_immutable
before update or delete on public.design_system_profile_versions
for each row execute function public.protect_design_profile_version();

-- RLS: profiles are readable by workspace members; the pointer is set via RPC.
alter table public.design_system_profiles enable row level security;
revoke all on table public.design_system_profiles from anon;
grant select on table public.design_system_profiles to authenticated;
create policy "Members can view design profile"
on public.design_system_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.design_system_profile_versions enable row level security;
revoke all on table public.design_system_profile_versions from anon;
grant select on table public.design_system_profile_versions to authenticated;
create policy "Members can view design profile versions"
on public.design_system_profile_versions for select to authenticated
using (public.is_workspace_member(workspace_id));

-- Promote a version to active. Workspace membership required; the version must
-- belong to the caller's workspace.
create function public.set_active_design_profile_version(target_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_workspace uuid;
begin
  select workspace_id into target_workspace
  from public.design_system_profile_versions where id = target_version_id;

  if target_workspace is null then
    raise exception 'design_profile_version_not_found' using errcode = 'P0001';
  end if;
  if not public.is_workspace_member(target_workspace) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  insert into public.design_system_profiles as p (workspace_id, active_version_id, updated_at)
  values (target_workspace, target_version_id, now())
  on conflict (workspace_id) do update
    set active_version_id = excluded.active_version_id, updated_at = now();
end; $$;

revoke all on function public.set_active_design_profile_version(uuid) from public;
grant execute on function public.set_active_design_profile_version(uuid) to authenticated;

-- Parse the workspace id from a storage object path "<workspace_uuid>/...".
-- Immutable + defensive: reject anything that isn't a uuid-prefixed path or
-- that contains traversal segments.
create function public.storage_workspace_id(object_name text) returns uuid
language plpgsql immutable security definer set search_path = '' as $$
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/].*$'
    or object_name ~ '(^|/)\.\.?(/|$)'
  then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end; $$;

revoke all on function public.storage_workspace_id(text) from public;
grant execute on function public.storage_workspace_id(text) to authenticated;

-- Private workspace-scoped bucket for uploaded design-system source docs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('design-system', 'design-system', false, 10485760,
  array['text/plain','text/markdown','application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can read design-system objects"
on storage.objects for select to authenticated
using (bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name)));

create policy "Members can upload design-system objects"
on storage.objects for insert to authenticated
with check (bucket_id = 'design-system'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_workspace_id(name)));

create policy "Members can update design-system objects"
on storage.objects for update to authenticated
using (bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name)))
with check (bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name)));

create policy "Members can delete design-system objects"
on storage.objects for delete to authenticated
using (bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name)));
```

- [ ] **Step 2: Parse + apply**

Run:
```bash
pnpm check:sql-rooms
supabase db reset
```
Expected: parses; applies cleanly on a fresh DB.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608130005_design_profiles.sql
git commit -m "feat(db): design profile tables, active-version RPC, workspace source bucket"
```

---

### Task 6: Screens, screen-versions, immutability, and RLS

**Files:**
- Create: `supabase/migrations/202608130006_design_screens.sql`

**Interfaces:**
- Produces enum `public.design_screen_state` (`'empty','built'`), tables `public.design_screens` (room-scoped; `state`, `updating`, `current_version_id`, `flow_node_id`, `canvas_x/y`, `deleted_at`) and `public.design_screen_versions` (immutable: `markup/styles/script/actions_json`, `base_version_id`, `profile_version_id`, `originating_task_id`, `promoted`). Produces `public.create_design_screen(...)`, `public.insert_design_screen_version(...)` used by later tasks.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130006_design_screens.sql`:

```sql
create type public.design_screen_state as enum ('empty', 'built');

create table public.design_screens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  flow_node_id text,                                  -- the Define flow node, if seeded
  state public.design_screen_state not null default 'empty',
  updating boolean not null default false,            -- "built, with an update running"
  current_version_id uuid,                            -- FK added after versions table
  canvas_x double precision not null default 0,
  canvas_y double precision not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.design_screen_versions (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  markup text not null,
  styles text not null,
  script text,
  actions_json jsonb not null,
  base_version_id uuid references public.design_screen_versions(id),
  profile_version_id uuid references public.design_system_profile_versions(id),
  originating_task_id uuid,                            -- FK to ai_tasks added in Task 10's tables
  promoted boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_screen_version_markup_size check (pg_column_size(markup) <= 98304),
  constraint design_screen_version_styles_size check (pg_column_size(styles) <= 32768),
  constraint design_screen_version_script_size check (script is null or pg_column_size(script) <= 32768),
  constraint design_screen_version_actions_size check (pg_column_size(actions_json) <= 16384)
);

alter table public.design_screens
  add constraint design_screens_current_version_fkey
  foreign key (current_version_id) references public.design_screen_versions(id);

create index design_screens_room on public.design_screens(room_id) where deleted_at is null;
create index design_screen_versions_screen on public.design_screen_versions(screen_id, created_at);

-- Versions are immutable except the single `promoted` flag flip (set true when a
-- version becomes current, false is never restored). Block content mutation and
-- all deletes.
create function public.protect_design_screen_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'design_screen_version_immutable' using errcode = 'P0001';
  end if;
  if new.markup is distinct from old.markup
     or new.styles is distinct from old.styles
     or new.script is distinct from old.script
     or new.actions_json is distinct from old.actions_json
     or new.screen_id is distinct from old.screen_id
     or new.base_version_id is distinct from old.base_version_id
     or new.created_at is distinct from old.created_at then
    raise exception 'design_screen_version_immutable' using errcode = 'P0001';
  end if;
  return new;
end; $$;

create trigger design_screen_version_immutable
before update or delete on public.design_screen_versions
for each row execute function public.protect_design_screen_version();

-- RLS. Screens are directly created/soft-deleted by editors; versions are
-- materialized by RPC/trigger only (select-only, no write policy).
alter table public.design_screens enable row level security;
revoke all on table public.design_screens from anon;
grant select on table public.design_screens to authenticated;
create policy "Participants can view screens"
on public.design_screens for select to authenticated
using (public.is_room_participant(room_id));

alter table public.design_screen_versions enable row level security;
revoke all on table public.design_screen_versions from anon;
grant select on table public.design_screen_versions to authenticated;
create policy "Participants can view screen versions"
on public.design_screen_versions for select to authenticated
using (public.is_room_participant(room_id));

-- Create an empty screen (used by the composer in slice 2 and by flow seeding).
create function public.create_design_screen(
  target_room_id uuid, screen_name text, node_id text default null,
  x double precision default 0, y double precision default 0)
returns public.design_screens language plpgsql security definer set search_path = '' as $$
declare
  target_workspace uuid;
  created public.design_screens;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select room.workspace_id into target_workspace from public.rooms as room where room.id = target_room_id;

  insert into public.design_screens (room_id, workspace_id, name, flow_node_id, canvas_x, canvas_y, created_by)
  values (target_room_id, target_workspace, screen_name, node_id, x, y, auth.uid())
  returning * into created;
  return created;
end; $$;

revoke all on function public.create_design_screen(uuid, text, text, double precision, double precision) from public;
grant execute on function public.create_design_screen(uuid, text, text, double precision, double precision) to authenticated;
```

- [ ] **Step 2: Parse + apply**

Run:
```bash
pnpm check:sql-rooms
supabase db reset
```
Expected: parses; applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608130006_design_screens.sql
git commit -m "feat(db): design screens + immutable versions + create_design_screen"
```

---

### Task 7: Retain-loser compare-and-swap promotion

**Files:**
- Create: `supabase/migrations/202608130007_design_screen_promote.sql`

**Interfaces:**
- Produces `public.insert_and_promote_screen_version(...) returns public.design_screen_versions` — inserts an immutable version and attempts CAS promotion of `design_screens.current_version_id`. On CAS success it flips `state='built'`, `updating=false`, `promoted=true`. On CAS loss (base moved) it **retains** the new row as a stale candidate (`promoted=false`), never raising. Emits nothing here (events are Task 8); returns the inserted version so the caller records the outcome.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130007_design_screen_promote.sql`:

```sql
-- Insert an immutable screen version and attempt to promote it via
-- compare-and-swap on design_screens.current_version_id. Unlike the PRD
-- version flow (which RAISES on conflict), a lost CAS here RETAINS the new
-- row as a stale candidate and returns normally — the design spec requires the
-- losing generation to be kept, not rejected.
create function public.insert_and_promote_screen_version(
  target_screen_id uuid,
  new_markup text,
  new_styles text,
  new_script text,
  new_actions jsonb,
  base_version uuid,
  profile_version uuid,
  task_id uuid,
  author uuid)
returns public.design_screen_versions
language plpgsql security definer set search_path = '' as $$
declare
  screen public.design_screens;
  inserted public.design_screen_versions;
  promoted_count integer;
begin
  -- Lock the parent screen so concurrent generations serialise on the CAS.
  select * into screen from public.design_screens where id = target_screen_id for update;
  if screen.id is null then
    raise exception 'design_screen_not_found' using errcode = 'P0001';
  end if;

  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    base_version_id, profile_version_id, originating_task_id, created_by)
  values (
    target_screen_id, screen.room_id, new_markup, new_styles, new_script, new_actions,
    base_version, profile_version, task_id, author)
  returning * into inserted;

  -- CAS: promote only if the base we branched from is still current.
  update public.design_screens
     set current_version_id = inserted.id,
         state = 'built',
         updating = false,
         updated_at = now()
   where id = target_screen_id
     and current_version_id is not distinct from base_version;

  get diagnostics promoted_count = row_count;

  if promoted_count > 0 then
    update public.design_screen_versions set promoted = true where id = inserted.id;
    inserted.promoted := true;
  else
    -- Base moved on: keep the row as a stale candidate, clear the updating flag
    -- (the in-flight generation finished, even though it did not win).
    update public.design_screens set updating = false, updated_at = now()
     where id = target_screen_id;
  end if;

  return inserted;
end; $$;

revoke all on function public.insert_and_promote_screen_version(uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid) from public;
grant execute on function public.insert_and_promote_screen_version(uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid) to service_role;
```

Note: this RPC is granted to `service_role` only — it is called by the materialize trigger (SECURITY DEFINER, runs as owner) in Task 10, never by the browser.

- [ ] **Step 2: Parse + apply**

Run:
```bash
pnpm check:sql-rooms
supabase db reset
```
Expected: parses; applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608130007_design_screen_promote.sql
git commit -m "feat(db): retain-loser CAS promotion for screen versions"
```

---

### Task 8: Events feed table + append helper

**Files:**
- Create: `supabase/migrations/202608130008_design_events.sql`

**Interfaces:**
- Produces enum `public.design_event_kind` (exactly the seven values from `DesignScreenEventKindSchema`), table `public.design_screen_events` (append-only, room-scoped), and `public.append_design_screen_event(...) returns uuid` (service_role).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130008_design_events.sql`:

```sql
-- The unified history feed. Values MUST equal DesignScreenEventKindSchema.options
-- (packages/contracts/src/design-events.ts), in this order.
create type public.design_event_kind as enum (
  'message',
  'generation_started',
  'version_created',
  'version_promoted',
  'generation_failed',
  'restored',
  'stale_candidate'
);

create table public.design_screen_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  screen_id uuid references public.design_screens(id) on delete cascade,
  kind public.design_event_kind not null,
  message_id uuid,
  task_id uuid,
  version_id uuid references public.design_screen_versions(id) on delete set null,
  actor uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index design_screen_events_room on public.design_screen_events(room_id, created_at);
create index design_screen_events_screen on public.design_screen_events(screen_id, created_at);

alter table public.design_screen_events enable row level security;
revoke all on table public.design_screen_events from anon;
grant select on table public.design_screen_events to authenticated;
create policy "Participants can view design events"
on public.design_screen_events for select to authenticated
using (public.is_room_participant(room_id));

create function public.append_design_screen_event(
  target_room_id uuid, target_screen_id uuid, event_kind public.design_event_kind,
  msg_id uuid default null, task_id uuid default null, ver_id uuid default null, actor_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inserted uuid;
begin
  insert into public.design_screen_events (room_id, screen_id, kind, message_id, task_id, version_id, actor)
  values (target_room_id, target_screen_id, event_kind, msg_id, task_id, ver_id, actor_id)
  returning id into inserted;
  return inserted;
end; $$;

revoke all on function public.append_design_screen_event(uuid, uuid, public.design_event_kind, uuid, uuid, uuid, uuid) from public;
grant execute on function public.append_design_screen_event(uuid, uuid, public.design_event_kind, uuid, uuid, uuid, uuid) to service_role;
```

- [ ] **Step 2: Register enum parity**

In `scripts/check-contract-enum-parity.mjs`, add:

```js
export const DESIGN_EVENTS_MIGRATION =
  "supabase/migrations/202608130008_design_events.sql";
```

and push it into `ENUM_MIGRATIONS` after the Task-4 entry. This requires the contract enum name to match: the parity script maps SQL enum `design_event_kind` to the contract Zod export whose `.options` equal it. Confirm the script's contract-loader picks up `DesignScreenEventKindSchema`; if the loader maps by a name table, add `design_event_kind -> DesignScreenEventKindSchema` there following the existing `ai_task_kind -> AITaskKindSchema` mapping.

- [ ] **Step 3: Parse, parity, apply**

Run:
```bash
pnpm check:sql-rooms
pnpm check:contract-enums
supabase db reset
```
Expected: all PASS; applies cleanly.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202608130008_design_events.sql scripts/check-contract-enum-parity.mjs
git commit -m "feat(db): design screen events feed + append helper"
```

---

### Task 9: References + handoff snapshots

**Files:**
- Create: `supabase/migrations/202608130009_design_references_handoffs.sql`

**Interfaces:**
- Produces `public.design_references` (room-scoped Figma links, directly written by editors) and `public.design_handoff_snapshots` (immutable, materialized by RPC in a later slice — select-only here). Produces `public.add_design_reference(...)` and `public.delete_design_reference(...)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/202608130009_design_references_handoffs.sql`:

```sql
-- Room-scoped Figma references (oEmbed cards). Editors write these directly.
create table public.design_references (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  normalized_url text not null,
  title text,
  thumbnail_ref text,
  oembed_status text not null default 'pending',
  fetched_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (room_id, normalized_url),
  constraint design_reference_url_len check (char_length(normalized_url) between 1 and 2048)
);

create index design_references_room on public.design_references(room_id, created_at);

alter table public.design_references enable row level security;
revoke all on table public.design_references from anon;
grant select on table public.design_references to authenticated;
create policy "Participants can view references"
on public.design_references for select to authenticated
using (public.is_room_participant(room_id));

create function public.add_design_reference(
  target_room_id uuid, url text, ref_title text default null,
  thumb text default null, status text default 'pending')
returns public.design_references language plpgsql security definer set search_path = '' as $$
declare created public.design_references;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  insert into public.design_references (room_id, normalized_url, title, thumbnail_ref, oembed_status, fetched_at, created_by)
  values (target_room_id, url, ref_title, thumb, status, case when status = 'ok' then now() else null end, auth.uid())
  on conflict (room_id, normalized_url) do update
    set title = excluded.title, thumbnail_ref = excluded.thumbnail_ref,
        oembed_status = excluded.oembed_status, fetched_at = excluded.fetched_at
  returning * into created;
  return created;
end; $$;

revoke all on function public.add_design_reference(uuid, text, text, text, text) from public;
grant execute on function public.add_design_reference(uuid, text, text, text, text) to authenticated;

create function public.delete_design_reference(target_reference_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare ref_room uuid;
begin
  select room_id into ref_room from public.design_references where id = target_reference_id;
  if ref_room is null or not public.can_edit_room(ref_room) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.design_references where id = target_reference_id;
end; $$;

revoke all on function public.delete_design_reference(uuid) from public;
grant execute on function public.delete_design_reference(uuid) to authenticated;

-- Immutable Development handoff snapshot. Written by an RPC in a later slice;
-- select-only here, no write policy.
create table public.design_handoff_snapshots (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  manifest_json jsonb not null,
  start_screen_id uuid,
  profile_version_id uuid references public.design_system_profile_versions(id),
  prd_revision integer,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_handoff_manifest_size check (pg_column_size(manifest_json) <= 262144)
);

create index design_handoff_room on public.design_handoff_snapshots(room_id, created_at);

create function public.protect_design_handoff() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'design_handoff_immutable' using errcode = 'P0001';
  return null;
end; $$;

create trigger design_handoff_immutable
before update or delete on public.design_handoff_snapshots
for each row execute function public.protect_design_handoff();

alter table public.design_handoff_snapshots enable row level security;
revoke all on table public.design_handoff_snapshots from anon;
grant select on table public.design_handoff_snapshots to authenticated;
create policy "Participants can view handoffs"
on public.design_handoff_snapshots for select to authenticated
using (public.is_room_participant(room_id));
```

- [ ] **Step 2: Parse + apply**

Run:
```bash
pnpm check:sql-rooms
supabase db reset
```
Expected: parses; applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608130009_design_references_handoffs.sql
git commit -m "feat(db): design references + immutable handoff snapshots"
```

---

### Task 10: Task RPCs — tracking tables, create, materialize, get, hydration

**Files:**
- Create: `supabase/migrations/202608130010_design_task_rpcs.sql`

**Interfaces:**
- Produces tracking tables `public.design_profile_distills` and `public.design_screen_generations` (task_id PK → `ai_tasks`, carry the base version / target screen), the two `create_*_task` RPCs, the two `materialize_*` AFTER-UPDATE triggers on `ai_tasks`, the two `get_*` reader RPCs, and the hydration wrap for `design_screen_generate`.

Design notes the implementer needs:
- The `create_*_task` RPCs follow `create_user_flow_generate_task` (`202608100001_user_flow_generation.sql:27–177`): auth + edit check, `pg_advisory_xact_lock`, resolve default device/provider, build the frozen 4-array manifest, `insert into ai_tasks (..., '<kind>', 'queued', ...)`, `on conflict` idempotent re-return. **Copy that structure** — it is long; read it in the reference migration and adapt the kind, the tracking-row insert, and (for screen generate) recording `base_version_id = screen.current_version_id` and flipping `design_screens.updating = true`.
- The materialize triggers follow `materialize_user_flow_generation` (`202608100001:184–216`) but for `design_screen_generate` they call `insert_and_promote_screen_version` (Task 7) instead of a plain insert, then `append_design_screen_event` (Task 8) with `version_promoted` or `stale_candidate` based on the returned `promoted` flag; for `design_profile_distill` they insert a profile version and call `set_active_design_profile_version`.
- The hydration wrap follows `202608100002_user_flow_generation_recovery.sql:53–128`: rename the base `hydrate_authorized_room_context` to `_pre_design`, define a new one that calls it and, when `kind = 'design_screen_generate'`, merges the active profile version + the target screen's current version + the screen's actions into the context via `jsonb_set`, then re-checks the 512 KiB cap and `settle_ai_task(..., 'fail', ...)` if exceeded.

Because this migration is large and closely templated on two existing migrations, the steps below give the tracking tables and the `get_*` readers in full (they have no existing template of the exact shape) and direct you to adapt the create/materialize/hydration pieces from the cited references with the specific deltas listed.

- [ ] **Step 1: Write the tracking tables + get readers (full)**

Begin `supabase/migrations/202608130010_design_task_rpcs.sql` with:

```sql
-- Request-tracking rows: one per task, created by create_*_task, read by the
-- materialize trigger. They carry what the trigger needs that isn't in the
-- result payload (the base version we branched from, the target screen).
create table public.design_profile_distills (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_object_path text,
  created_at timestamptz not null default now()
);

create table public.design_screen_generations (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  base_version_id uuid references public.design_screen_versions(id),
  profile_version_id uuid references public.design_system_profile_versions(id),
  created_at timestamptz not null default now()
);

alter table public.design_profile_distills enable row level security;
revoke all on table public.design_profile_distills from anon;
grant select on table public.design_profile_distills to authenticated;
create policy "Members can view profile distills"
on public.design_profile_distills for select to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.design_screen_generations enable row level security;
revoke all on table public.design_screen_generations from anon;
grant select on table public.design_screen_generations to authenticated;
create policy "Participants can view screen generations"
on public.design_screen_generations for select to authenticated
using (public.is_room_participant(room_id));

-- Now the design_screen_versions.originating_task_id FK can point at ai_tasks.
alter table public.design_screen_versions
  add constraint design_screen_version_task_fkey
  foreign key (originating_task_id) references public.ai_tasks(id) on delete set null;

-- Readers: return the materialized result only to authorized members. The
-- browser never selects ai_tasks.result_json.
create function public.get_design_screen_generation(target_task_id uuid)
returns table (task_id uuid, screen_id uuid, version_id uuid, promoted boolean)
language sql stable security definer set search_path = '' as $$
  select g.task_id, g.screen_id, v.id, v.promoted
  from public.design_screen_generations g
  left join public.design_screen_versions v on v.originating_task_id = g.task_id
  where g.task_id = target_task_id
    and public.is_room_participant(g.room_id);
$$;

revoke all on function public.get_design_screen_generation(uuid) from public;
grant execute on function public.get_design_screen_generation(uuid) to authenticated;

create function public.get_design_profile_distillation(target_task_id uuid)
returns table (task_id uuid, version_id uuid, is_active boolean)
language sql stable security definer set search_path = '' as $$
  select d.task_id, ver.id,
         (ver.id = prof.active_version_id) as is_active
  from public.design_profile_distills d
  left join public.design_system_profile_versions ver
    on ver.workspace_id = d.workspace_id
   and ver.created_at >= d.created_at
  left join public.design_system_profiles prof on prof.workspace_id = d.workspace_id
  where d.task_id = target_task_id
    and public.is_workspace_member(d.workspace_id)
  order by ver.created_at asc
  limit 1;
$$;

revoke all on function public.get_design_profile_distillation(uuid) from public;
grant execute on function public.get_design_profile_distillation(uuid) to authenticated;
```

- [ ] **Step 2: Add the create RPCs (adapt from reference)**

Read `supabase/migrations/202608100001_user_flow_generation.sql:27–182` (`create_user_flow_generate_task` + its grants). Append to the Task-10 migration two functions modelled on it:

- `create_design_profile_distill_task(target_room_id uuid, target_provider public.ai_provider, source_object_path text default null)` — auth + `can_edit_room`, advisory lock keyed on `hashtextextended('design_profile_distill:' || target_room_id::text, 0)`, resolve device/provider, build the frozen manifest, `insert into ai_tasks (..., 'design_profile_distill', 'queued', ...)`, then `insert into public.design_profile_distills (task_id, workspace_id, room_id, source_object_path) values (...)`. Return the task row (same row shape the reference returns).
- `create_design_screen_generate_task(target_screen_id uuid, target_provider public.ai_provider)` — resolve the screen (`select ... for update`), assert `can_edit_room(screen.room_id)`, advisory lock keyed on the screen id, resolve device/provider, build the manifest, `insert into ai_tasks (..., 'design_screen_generate', 'queued', ...)`, then `insert into public.design_screen_generations (task_id, screen_id, room_id, base_version_id, profile_version_id)` with `base_version_id = screen.current_version_id` and `profile_version_id = (select active_version_id from public.design_system_profiles where workspace_id = screen.workspace_id)`, and `update public.design_screens set updating = true where id = target_screen_id`. Also `append_design_screen_event(screen.room_id, target_screen_id, 'generation_started', null, task_id, null, auth.uid())`.

Both get `revoke all ... from public; grant execute ... to authenticated;`.

Exact deltas to preserve from the reference: the `pg_advisory_xact_lock` idempotency guard, the `exception when unique_violation` fallback re-returning the already-active task, and the device/provider connection validation. Do not invent new validation — mirror the reference's.

- [ ] **Step 3: Add the materialize triggers (adapt from reference)**

Read `materialize_user_flow_generation` (`202608100001:184–216`). Append:

```sql
create function public.materialize_design_profile_distill() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  d public.design_profile_distills;
  new_version uuid;
begin
  if new.kind <> 'design_profile_distill' or new.status <> 'completed'
     or new.result_json is null or (new.result_json ->> 'partial')::boolean is true then
    return new;
  end if;
  select * into d from public.design_profile_distills where task_id = new.id;
  if d.task_id is null then return new; end if;

  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload -> 'profile') <> 'object' or jsonb_typeof(payload -> 'tokenCss') <> 'string' then
    return new;
  end if;

  insert into public.design_system_profile_versions (workspace_id, profile_json, token_css, source_object_path, created_by)
  values (d.workspace_id, payload -> 'profile', payload ->> 'tokenCss', d.source_object_path, new.initiating_user_id)
  returning id into new_version;

  insert into public.design_system_profiles as p (workspace_id, active_version_id, updated_at)
  values (d.workspace_id, new_version, now())
  on conflict (workspace_id) do update set active_version_id = excluded.active_version_id, updated_at = now();
  return new;
end; $$;

create trigger ai_tasks_materialize_design_profile_distill
after update on public.ai_tasks
for each row execute function public.materialize_design_profile_distill();

create function public.materialize_design_screen_generate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
  g public.design_screen_generations;
  ver public.design_screen_versions;
begin
  if new.kind <> 'design_screen_generate' or new.status <> 'completed'
     or new.result_json is null or (new.result_json ->> 'partial')::boolean is true then
    return new;
  end if;
  select * into g from public.design_screen_generations where task_id = new.id;
  if g.task_id is null then return new; end if;
  -- Idempotent: a version already materialized for this task means done.
  if exists (select 1 from public.design_screen_versions where originating_task_id = new.id) then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if jsonb_typeof(payload -> 'markup') <> 'string' or jsonb_typeof(payload -> 'actions') <> 'array' then
    return new;
  end if;

  ver := public.insert_and_promote_screen_version(
    g.screen_id,
    payload ->> 'markup',
    coalesce(payload ->> 'styles', ''),
    payload ->> 'script',
    payload -> 'actions',
    g.base_version_id,
    g.profile_version_id,
    new.id,
    new.initiating_user_id);

  perform public.append_design_screen_event(
    g.room_id, g.screen_id, 'version_created', null, new.id, ver.id, new.initiating_user_id);
  perform public.append_design_screen_event(
    g.room_id, g.screen_id,
    (case when ver.promoted then 'version_promoted' else 'stale_candidate' end)::public.design_event_kind,
    null, new.id, ver.id, new.initiating_user_id);
  return new;
end; $$;

create trigger ai_tasks_materialize_design_screen_generate
after update on public.ai_tasks
for each row execute function public.materialize_design_screen_generate();
```

- [ ] **Step 4: Add the hydration wrap for screen generation (adapt from reference)**

Read `202608100002_user_flow_generation_recovery.sql:53–128`. Append a wrap that renames the current `hydrate_authorized_room_context(uuid, uuid)` to `hydrate_authorized_room_context_pre_design(uuid, uuid)` (revoke all, grant to `service_role`), then defines a new `hydrate_authorized_room_context(target_task_id uuid, target_attempt_id uuid)` that calls the `_pre_design` base and, only when `hydrated_result #>> '{context,kind}' = 'design_screen_generate'`, merges via `jsonb_set`: the active `token_css` + `profile_json` for the room's workspace, and the target screen's current version `markup/styles/actions_json` and `flow_node_id`, then re-checks `octet_length(hydrated_context::text) > 524288` and calls `settle_ai_task(target_task_id, target_attempt_id, 'fail', 'unknown', 'Hydrated AI task context exceeds 512 KiB.', null, false)` on overflow. Keep the base behavior untouched for every other kind (return the base result unchanged).

- [ ] **Step 5: Parse, arity, apply**

Run:
```bash
pnpm check:sql-rooms
pnpm check:sql-arities
supabase db reset
```
Expected: all PASS; applies cleanly. If `check:sql-arities` complains about a new multi-file function, add its `{ functionName, arity, files }` entry to `scripts/check-sql-arities.mjs` per that script's convention.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/202608130010_design_task_rpcs.sql scripts/check-sql-arities.mjs
git commit -m "feat(db): design task RPCs — create, materialize, get, hydration"
```

---

### Task 11: pgTAP — profiles, screens/CAS, task RPCs

**Files:**
- Create: `supabase/tests/design_profiles.test.sql`
- Create: `supabase/tests/design_screens.test.sql`
- Create: `supabase/tests/design_task_rpcs.test.sql`

**Interfaces:** none produced; this task proves the migrations.

Follow the pgTAP structure from `supabase/tests/room_stage_checklist.test.sql` and `supabase/tests/tenant_isolation.test.sql`: `begin; create extension pgtap; select plan(N);` then schema assertions, a fixture matrix (two workspaces, each with an owner + editor + viewer participant and a cross-tenant user), role switching via `set local role authenticated` + `set_config('request.jwt.claim.sub', …, true)`, behavior assertions, `select * from finish(); rollback;`.

- [ ] **Step 1: Write `design_profiles.test.sql`**

Cover: `has_table` for both profile tables; `ok(not has_table_privilege('authenticated','public.design_system_profile_versions','INSERT'))`; a non-member cannot `select` a version (`is_empty`); `set_active_design_profile_version` by a member succeeds (`lives_ok`) and by a non-member throws `P0001` (`throws_ok`); the immutability trigger rejects an `update`/`delete` of a version (`throws_ok 'P0001'`).

- [ ] **Step 2: Write `design_screens.test.sql` — including the CAS matrix**

Cover: screen + version schema; version immutability trigger; RLS select gated by participation and cross-tenant denial (`is_empty`). Then the retain-loser CAS behaviour without needing two live sessions — simulate the race by calling the promote function twice against the same `base_version`:

```sql
-- Seed a screen with an initial version V0 as current.
-- Generation A branches from V0, Generation B also branches from V0.
-- A promotes first (base = V0 = current) -> promoted true, current = A.
select is( (public.insert_and_promote_screen_version(:'screen', 'A','','',
  '[]'::jsonb, :'v0', null, null, :'user')).promoted, true, 'first CAS wins');
-- B promotes second (base = V0, but current is now A) -> retained, not promoted.
select is( (public.insert_and_promote_screen_version(:'screen', 'B','','',
  '[]'::jsonb, :'v0', null, null, :'user')).promoted, false, 'stale base is retained, not promoted');
-- B's row still exists (retained), current is still A, no exception raised.
select is( (select count(*) from public.design_screen_versions where screen_id = :'screen'), 3::bigint,
  'losing version retained as a stale candidate');
select is( (select current_version_id from public.design_screens where id = :'screen'),
  (select id from public.design_screen_versions where markup = 'A'), 'current stays the winner');
```

(Bind `:'screen'`, `:'v0'`, `:'user'` from fixture inserts using `\gset` or `set_config`-driven selects, per the reference tests' variable-binding style.)

- [ ] **Step 3: Write `design_task_rpcs.test.sql`**

Cover: `create_design_screen_generate_task` by an editor flips `design_screens.updating = true` and inserts a `design_screen_generations` row and a `generation_started` event; by a viewer throws `P0001`; the idempotency guard re-returns the same task on a second call. Simulate a completed task by updating `ai_tasks` to `status='completed'` with a valid `result_json` payload and assert the materialize trigger inserted a promoted version, appended `version_created` + `version_promoted` events, and that `get_design_screen_generation` returns the version to a participant and nothing to a cross-tenant user. Mirror for `create_design_profile_distill_task` + `materialize_design_profile_distill` + `set_active` + `get_design_profile_distillation`.

- [ ] **Step 4: Run the full pgTAP suite**

Run: `supabase db reset && supabase test db`
Expected: all three new files pass alongside the existing suite. If a fixture is missing a not-null column, the failure names it — add it; do not weaken an assertion.

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/design_profiles.test.sql supabase/tests/design_screens.test.sql supabase/tests/design_task_rpcs.test.sql
git commit -m "test(db): pgTAP for design profiles, screens/CAS, and task RPCs"
```

---

## Definition of done

- `pnpm --filter @meld/contracts test`, `pnpm --filter @meld/prototype test`, and both packages' `typecheck`/`lint` pass.
- `pnpm check:sql-rooms`, `pnpm check:contract-enums`, `pnpm check:sql-arities` pass.
- `supabase db reset && supabase test db` passes with the three new pgTAP files, proving RLS (participant/member/cross-tenant), version immutability, retain-loser CAS, and the create/materialize/get task RPCs.
- No `apps/*` runtime code changed; the gateway is untouched (kind-agnostic).

Slice 2 (connector prompt modules + `TASK_CONFIG` + provider-adapter validation, the composer/generation UI, the sandboxed viewer, and the spike's security hardening — per-screen route namespacing, `script-src-attr 'none'`, wiring `findScreenSafetyViolations` as a gate, and the self-navigation escape-matrix case) builds directly on these RPCs and contracts.
```
