# Design Room Slice 2c — Chat-to-Screen Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first end-to-end Design Room path in the app: a composer where a user types a prompt, a screen is created and generated against their design system, the result appears in the sandboxed viewer, and they can regenerate it or restore a previous version.

**Architecture:** Mirror the user-flow generation feature (server action → `create_*` RPC → `useRoomTaskStatus`-adopted polling hook → readback). Add the one missing generation input (an `instruction` on `create_design_screen_generate_task`) and the missing `restore_design_screen_version` RPC. Thread the workspace's active profile `token_css` into the slice-2b reader. Keep the surface minimal — a composer + the existing Prototype viewer + a version list — chat only. The multi-screen canvas board, the "Canvas" relabel, Define-flow seeding, sketch serialization, and the history drawer are **slice 3**.

**Tech Stack:** Next.js App Router, `@astryxdesign/core`, `@supabase/ssr`, Postgres/pgTAP, TypeScript 5.9.3, Zod 4.4.3, vitest, Playwright, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md`
**Convention research:** `.context/slice-1-research.md`; slice-1 RPCs in `supabase/migrations/202608130006_design_screens.sql` and `202608130010_design_task_rpcs.sql`; slice-2b reader in `apps/web/src/features/design/prototype-reader.ts`.

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TS `5.9.3`, Zod `4.4.3`. Never change versions.
- Current vocabulary: `public.rooms`, `workspace_id`, `is_workspace_member`, `is_room_participant`, `can_edit_room`. Migration naming `YYYYMMDDNNNN_...`; next sequence is `202608130011+`.
- `security definer` funcs set `search_path = ''`, then `revoke all ... from public; grant execute ... to authenticated;`.
- Web components under `apps/web/src` obey `check:astryx` (no raw `<div>`/`<span>`, no hex/rgb, no bare px, no Tailwind) — use `@astryxdesign/core` primitives and `var(--color-…)`.
- Server actions: strict Zod input; `createClient(new Headers())`; wrap RPCs in try/catch; return a discriminated `{status}` union; `console.error`-and-return-null on readback parse/RPC failure (never throw to the caller). **`created_at` columns use `z.string().datetime({ offset: true })`** — Postgres renders `+00:00`, not `Z`.
- `create_design_screen_generate_task` returns **jsonb** (`{id, roomId, …}`), not a table row — parse `data` directly as `{ id }`, no array-unwrap.
- The browser never reads `ai_tasks.result_json`; renderable screen content comes from `design_screens`/`design_screen_versions` via the slice-2b reader, gated by `is_room_participant`.
- pgTAP tasks need the local Supabase stack (`supabase db reset && supabase test db`, pinned CLI 2.109.1 per the local-setup memory). Contract/unit tasks don't.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/202608130011_design_screen_generate_instruction.sql` | Overload `create_design_screen_generate_task` with `target_instruction`; add `restore_design_screen_version`. |
| `supabase/tests/design_screen_restore.test.sql` | pgTAP: instruction stored on the task; restore appends a version + `restored` event + re-points current. |
| `apps/web/src/features/design/design-screen-generation.ts` | `"use server"`: `generateDesignScreen`, `getDesignScreenGeneration`, `restoreDesignScreenVersion`, `listRoomDesignScreens`. |
| `apps/web/src/features/design/design-screen-generation.test.ts` | Action unit tests (mocked supabase). |
| `apps/web/src/features/design/prototype-reader.ts` | Thread the active profile `token_css` into assembly. |
| `apps/web/src/features/design/prototype-reader.test.ts` | Cover token-css threading. |
| `apps/web/src/features/prd/components/room-task-status-provider.tsx` | Add `design_screen_generate` optimistic tracking + `activeDesignScreenGenerationTaskIds`. |
| `apps/web/src/features/design/use-design-screen-generation.ts` | Polling hook (adopt active task, poll readback, refresh on materialize). |
| `apps/web/src/features/design/use-design-screen-generation.test.tsx` | Hook state-machine tests. |
| `apps/web/src/features/design/components/screen-composer.tsx` | The composer (TextArea + Generate/Regenerate), version list, restore. |
| `apps/web/src/features/design/components/screen-composer.test.tsx` | Component tests. |
| `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Render the composer alongside the viewer on the Prototype surface. |
| `e2e/design-chat-to-screen.spec.ts` | Type a prompt → screen generates (fake connector) → viewer shows it → regenerate. |

---

### Task 1: RPC — instruction input + restore

**Files:**
- Create: `supabase/migrations/202608130011_design_screen_generate_instruction.sql`
- Read first: `202608130010_design_task_rpcs.sql` (the existing `create_design_screen_generate_task`), `202608130007_design_screen_promote.sql` (the CAS shape), `202608130008_design_events.sql` (`append_design_screen_event`).

**Interfaces:**
- Produces: `create_design_screen_generate_task(target_screen_id uuid, target_provider public.ai_provider, target_instruction text)` (a 3-arg overload) that stores `target_instruction` in `ai_tasks.instruction`; and `restore_design_screen_version(target_screen_id uuid, target_version_id uuid) returns public.design_screen_versions` — copies the restored version's content into a NEW version based on the current one, promotes it, appends a `'restored'` event.

- [ ] **Step 1: Write the overload + restore RPC**

Create `supabase/migrations/202608130011_design_screen_generate_instruction.sql`. Read the existing 2-arg `create_design_screen_generate_task` in `202608130010` and reproduce it as a 3-arg overload whose only difference is that it writes `target_instruction` (trimmed, ≤ 4000 chars, else the existing default instruction text) into the `ai_tasks.instruction` column instead of a static string. Keep the advisory lock, the `design_screen_generations` insert (base/profile version pinning), the `updating = true` flip, and the `generation_started` event identical. Then add restore:

```sql
create function public.restore_design_screen_version(
  target_screen_id uuid, target_version_id uuid)
returns public.design_screen_versions
language plpgsql security definer set search_path = '' as $$
declare
  screen public.design_screens;
  source public.design_screen_versions;
  restored public.design_screen_versions;
begin
  select * into screen from public.design_screens where id = target_screen_id for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into source from public.design_screen_versions
    where id = target_version_id and screen_id = target_screen_id;
  if source.id is null then
    raise exception 'design_screen_version_not_found' using errcode = 'P0001';
  end if;

  -- Restore = append a NEW version copied from the source, based on current,
  -- and promote it. History stays append-only; the pointer never rewinds.
  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    base_version_id, profile_version_id, created_by, promoted)
  values (
    target_screen_id, screen.room_id, source.markup, source.styles, source.script, source.actions_json,
    screen.current_version_id, source.profile_version_id, auth.uid(), true)
  returning * into restored;

  update public.design_screens
     set current_version_id = restored.id, state = 'built', updated_at = now()
   where id = target_screen_id;

  perform public.append_design_screen_event(
    screen.room_id, target_screen_id, 'restored', null, null, restored.id, auth.uid());
  return restored;
end; $$;

revoke all on function public.restore_design_screen_version(uuid, uuid) from public;
grant execute on function public.restore_design_screen_version(uuid, uuid) to authenticated;
```

Add the 3-arg `create_design_screen_generate_task` grants too. Note: adding an overload means the enum-parity/arity guards see two arities for the same name — if `check:sql-arities` pins `create_design_screen_generate_task`, update its entry to allow the overload per that script's documented drop/create/overload exception.

- [ ] **Step 2: Parse + apply**

Run: `pnpm check:sql-rooms && pnpm check:sql-arities && supabase db reset`
Expected: parses, arity guard passes, applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/202608130011_design_screen_generate_instruction.sql scripts/check-sql-arities.mjs
git commit -m "feat(db): design screen generation instruction + restore RPC"
```

---

### Task 2: pgTAP for instruction + restore

**Files:**
- Create: `supabase/tests/design_screen_restore.test.sql`

- [ ] **Step 1: Write the test**

Following `supabase/tests/design_task_rpcs.test.sql` fixtures: an editor calls the 3-arg `create_design_screen_generate_task(screen, provider, 'make a login screen')` and the created `ai_tasks.instruction` equals `'make a login screen'` (`is`). Seed a screen with two versions V0 (current) and V1; an editor `restore_design_screen_version(screen, V0)` creates a third version whose markup equals V0's, re-points `current_version_id` to it, and appends a `'restored'` event (`is` on a `count`); a viewer calling restore throws `P0001`; restoring a version from another screen throws `design_screen_version_not_found`.

- [ ] **Step 2: Run**

Run: `supabase db reset && supabase test db`
Expected: the new file passes with the suite.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/design_screen_restore.test.sql
git commit -m "test(db): design screen instruction + restore pgTAP"
```

---

### Task 3: Server actions

**Files:**
- Create: `apps/web/src/features/design/design-screen-generation.ts`
- Test: `apps/web/src/features/design/design-screen-generation.test.ts`

**Interfaces:**
- Produces: `generateDesignScreen(input)` (creates a screen if `screenId` absent, then fires the task), `getDesignScreenGeneration(taskId)`, `restoreDesignScreenVersion(input)`, `listRoomDesignScreens(roomId)`. Return-type unions mirror the user-flow action.

- [ ] **Step 1: Write the failing test**

Create `design-screen-generation.test.ts` mirroring `user-flow-generation.test.ts`'s supabase mock. Assert: `generateDesignScreen({ roomId, instruction })` with no `screenId` calls `create_design_screen` then `create_design_screen_generate_task` (3-arg) and returns `{ status: "queued", taskId, screenId }`; with a `screenId` it skips creation; `getDesignScreenGeneration` returns `{ taskId, screenId, versionId, promoted }` or null; `restoreDesignScreenVersion` returns `{ status: "restored", versionId }`; `listRoomDesignScreens` returns the screen rows.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- design-screen-generation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/features/design/design-screen-generation.ts`:

```ts
"use server";
import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const GenerateInput = z.object({
  roomId: z.string().uuid(),
  screenId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  instruction: z.string().trim().min(1).max(4000),
  provider: ProviderSchema.optional(),
}).strict();

export type GenerateDesignScreenResult =
  | { status: "queued"; taskId: string; screenId: string }
  | { status: "error"; message: string };

const GENERATION_ERROR = "We could not start screen generation.";
const ScreenRow = z.object({ id: z.string().uuid() }).passthrough();
const TaskRow = z.object({ id: z.string().uuid() }).passthrough();

export async function generateDesignScreen(
  input: z.input<typeof GenerateInput>,
): Promise<GenerateDesignScreenResult> {
  const parsed = GenerateInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: GENERATION_ERROR };
  try {
    const supabase = await createClient(new Headers());
    let screenId = parsed.data.screenId;
    if (!screenId) {
      const { data, error } = await supabase.rpc("create_design_screen", {
        target_room_id: parsed.data.roomId,
        screen_name: parsed.data.name ?? "Screen",
      });
      const screen = ScreenRow.safeParse(Array.isArray(data) ? data[0] : data);
      if (error || !screen.success) return { status: "error", message: GENERATION_ERROR };
      screenId = screen.data.id;
    }
    const { data, error } = await supabase.rpc("create_design_screen_generate_task", {
      target_screen_id: screenId,
      target_provider: parsed.data.provider ?? null,
      target_instruction: parsed.data.instruction,
    });
    const task = TaskRow.safeParse(data); // jsonb object, not a row array
    if (error || !task.success) return { status: "error", message: GENERATION_ERROR };
    return { status: "queued", taskId: task.data.id, screenId };
  } catch {
    return { status: "error", message: GENERATION_ERROR };
  }
}

const GenRow = z.object({
  task_id: z.string().uuid(),
  screen_id: z.string().uuid(),
  version_id: z.string().uuid().nullable(),
  promoted: z.boolean(),
}).strict();
export type DesignScreenGeneration = {
  taskId: string; screenId: string; versionId: string | null; promoted: boolean;
};

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getDesignScreenGeneration(
  taskId: string,
): Promise<DesignScreenGeneration | null> {
  const id = z.string().uuid().safeParse(taskId);
  if (!id.success) return null;
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("get_design_screen_generation", { target_task_id: id.data });
    if (error) { console.error("getDesignScreenGeneration RPC error", { taskId, error }); return null; }
    const rows = z.array(GenRow).safeParse(asRows(data));
    if (!rows.success) { console.error("getDesignScreenGeneration parse failed", { taskId, data }); return null; }
    const row = rows.data[0];
    return row ? { taskId: row.task_id, screenId: row.screen_id, versionId: row.version_id, promoted: row.promoted } : null;
  } catch (thrown) { console.error("getDesignScreenGeneration threw", { taskId, thrown }); return null; }
}

const RestoreInput = z.object({ screenId: z.string().uuid(), versionId: z.string().uuid() }).strict();
export type RestoreResult = { status: "restored"; versionId: string } | { status: "error"; message: string };

export async function restoreDesignScreenVersion(
  input: z.input<typeof RestoreInput>,
): Promise<RestoreResult> {
  const parsed = RestoreInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Could not restore." };
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("restore_design_screen_version", {
      target_screen_id: parsed.data.screenId, target_version_id: parsed.data.versionId,
    });
    const row = ScreenRow.safeParse(Array.isArray(data) ? data[0] : data);
    if (error || !row.success) return { status: "error", message: "Could not restore." };
    return { status: "restored", versionId: row.data.id };
  } catch { return { status: "error", message: "Could not restore." }; }
}

const ScreenListRow = z.object({
  id: z.string().uuid(), name: z.string(), state: z.enum(["empty", "built"]),
  updating: z.boolean(), current_version_id: z.string().uuid().nullable(),
}).strict();
export type RoomDesignScreen = z.infer<typeof ScreenListRow>;

export async function listRoomDesignScreens(roomId: string): Promise<RoomDesignScreen[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screens")
      .select("id,name,state,updating,current_version_id")
      .eq("room_id", id.data).is("deleted_at", null).order("canvas_x", { ascending: true });
    if (error) { console.error("listRoomDesignScreens error", { roomId, error }); return []; }
    const rows = z.array(ScreenListRow).safeParse(data ?? []);
    return rows.success ? rows.data : [];
  } catch (thrown) { console.error("listRoomDesignScreens threw", { roomId, thrown }); return []; }
}
```

- [ ] **Step 4: Run**

Run: `pnpm --filter web test -- design-screen-generation && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/design-screen-generation.ts apps/web/src/features/design/design-screen-generation.test.ts
git commit -m "feat(web): design screen generation server actions"
```

---

### Task 4: Thread active profile token CSS into the viewer

**Files:**
- Modify: `apps/web/src/features/design/prototype-reader.ts`
- Test: `apps/web/src/features/design/prototype-reader.test.ts`

**Interfaces:**
- Produces: `getRoomPrototype` reads the workspace's active `design_system_profile_versions.token_css` and passes it to `assembleValidatedPrototype` instead of `""`.

- [ ] **Step 1: Write the failing test**

Add to `prototype-reader.test.ts` a case: when `design_system_profiles.active_version_id` points at a version whose `token_css` is `:root{--ds-color-primary:#2f6feb}`, the assembled html contains `--ds-color-primary`; when no active profile exists, assembly still succeeds with empty token CSS.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- prototype-reader`
Expected: FAIL — token CSS is still hardcoded empty.

- [ ] **Step 3: Implement**

In `getRoomPrototype`, after resolving screens, read the active token CSS (workspace-scoped RLS, so use `workspaceId`):

```ts
  let tokenCss = "";
  const profileResult = await supabase
    .from("design_system_profiles").select("active_version_id")
    .eq("workspace_id", ids.data.workspaceId).maybeSingle();
  const activeId = z.object({ active_version_id: z.string().uuid().nullable() }).strict()
    .safeParse(profileResult.data ?? { active_version_id: null });
  if (activeId.success && activeId.data.active_version_id) {
    const cssResult = await supabase
      .from("design_system_profile_versions").select("token_css")
      .eq("id", activeId.data.active_version_id).maybeSingle();
    const css = z.object({ token_css: z.string() }).strict().safeParse(cssResult.data ?? null);
    if (css.success) tokenCss = css.data.token_css;
  }
```

and pass `tokenCss` into `assembleValidatedPrototype({ screens, startScreenId: screens[0].id, tokenCss })`.

- [ ] **Step 4: Run**

Run: `pnpm --filter web test -- prototype-reader && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/prototype-reader.ts apps/web/src/features/design/prototype-reader.test.ts
git commit -m "feat(web): thread active profile token css into the prototype viewer"
```

---

### Task 5: Room task-status provider — track design_screen_generate

**Files:**
- Modify: `apps/web/src/features/prd/components/room-task-status-provider.tsx`
- Test: `apps/web/src/features/prd/components/room-task-status-provider.test.tsx`

**Interfaces:**
- Produces: the context exposes `activeDesignScreenGenerationTaskIds: string[]` and `notifyQueued` accepts `{ kind: "design_screen_generate", taskId }`.

- [ ] **Step 1: Write the failing test**

Add a case mirroring the existing `user_flow_generate` provider test: after `notifyQueued({ kind: "design_screen_generate", taskId })`, `activeDesignScreenGenerationTaskIds` contains that id; once a poll returns a terminal status for it, it clears.

- [ ] **Step 2–3: Implement (mirror the user_flow lines exactly)**

Add, mirroring `optimisticUserFlowTaskIds` (`room-task-status-provider.tsx:104-106`, `:122-128`, `:202-209`, `:247-255`, `:259-270`, `:293-321`): `optimisticDesignScreenTaskIds` state, a `DESIGN_SCREEN_OPTIMISTIC_GRACE_MS = 10_000`, the clear-on-poll branch (`task.kind === "design_screen_generate"`), the grace-expiry effect, the `notifyQueued` branch, the `activeDesignScreenGenerationTaskIds` memo, and the context type + value entries. Keep every constant and structure identical to the user-flow originals.

- [ ] **Step 4: Run**

Run: `pnpm --filter web test -- room-task-status-provider && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/prd/components/room-task-status-provider.tsx apps/web/src/features/prd/components/room-task-status-provider.test.tsx
git commit -m "feat(web): track design_screen_generate in the room task-status provider"
```

---

### Task 6: The generation hook

**Files:**
- Create: `apps/web/src/features/design/use-design-screen-generation.ts`
- Test: `apps/web/src/features/design/use-design-screen-generation.test.tsx`

**Interfaces:**
- Produces: `useDesignScreenGeneration({ roomId, access, onScreenReady }): { status; start(input); }` where `start({ screenId?, name?, instruction })` fires `generateDesignScreen`, polls `getDesignScreenGeneration` until `versionId` is non-null, then calls `onScreenReady()` (which the page uses to `router.refresh()` the viewer + screen list).

- [ ] **Step 1: Write the failing test**

Create `use-design-screen-generation.test.tsx` mirroring `use-user-flow-generation.test.tsx`: mock the server actions and `useRoomTaskStatus`; assert `start` flips status `queued → running`, the poll calls `getDesignScreenGeneration`, and when it returns a `versionId` the status becomes `completed` after `onScreenReady` resolves; a terminal non-completed room-status short-circuits to `failed`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- use-design-screen-generation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Model it on `use-user-flow-generation.ts` (`POLL_INTERVAL_MS = 2_000`, `MAX_POLL_ATTEMPTS = 300`, a `deliver()` that dedupes on `taskId` via a `Set` ref and only flips to `completed` after `onScreenReady` resolves, adoption via `roomTaskStatus.activeDesignScreenGenerationTaskIds[0]`, `start()` calling `generateDesignScreen` then `roomTaskStatus?.notifyQueued({ kind: "design_screen_generate", taskId })`). The one difference from user-flow: the readback resolves when `getDesignScreenGeneration(taskId)?.versionId` is non-null (a version materialized), and `onScreenReady` takes no document argument (the viewer re-reads content itself).

- [ ] **Step 4: Run**

Run: `pnpm --filter web test -- use-design-screen-generation && pnpm --filter web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/use-design-screen-generation.ts apps/web/src/features/design/use-design-screen-generation.test.tsx
git commit -m "feat(web): design screen generation polling hook"
```

---

### Task 7: The composer component

**Files:**
- Create: `apps/web/src/features/design/components/screen-composer.tsx`
- Test: `apps/web/src/features/design/components/screen-composer.test.tsx`

**Interfaces:**
- Produces: `ScreenComposer({ roomId, access, screens })` — a client component owning `useDesignScreenGeneration`. Renders a `TextArea` + Generate button (disabled while generating), a per-screen state line for the active screen (empty / building / built), and — when a built screen exists — a Regenerate button and a version list with Restore.

- [ ] **Step 1: Write the failing test**

Create `screen-composer.test.tsx` (React Testing Library, `"use client"` component): typing an instruction and clicking Generate calls the hook's `start` with that instruction; `access === "view"` renders read-only (no composer input); while `status` is `running` the button shows a loading state.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- screen-composer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `screen-composer.tsx` using `@astryxdesign/core` primitives (`VStack`, `HStack`, `TextArea`, `Button`, `Text`, `Spinner`, `StatusDot`) — mirror `user-flow-generation-controls.tsx`'s structure (early `null` for `view` access; `isGenerating = status === "queued" || status === "running"`; primary button `isLoading`/`isDisabled`). The `onScreenReady` passed to the hook calls `router.refresh()` (`next/navigation`) so the server-rendered viewer + screen list re-read. Restore buttons call `restoreDesignScreenVersion` then `router.refresh()`. No raw `<div>`/`<span>`, no px/hex.

- [ ] **Step 4: Run + astryx**

Run: `pnpm --filter web test -- screen-composer && pnpm --filter web typecheck && pnpm check:astryx`
Expected: PASS (astryx clean aside from the pre-existing untracked `stage-coaching-panel.tsx`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/screen-composer.tsx apps/web/src/features/design/components/screen-composer.test.tsx
git commit -m "feat(web): screen composer with generate, regenerate, restore"
```

---

### Task 8: Mount the composer on the Prototype surface + e2e

**Files:**
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Create: `e2e/design-chat-to-screen.spec.ts`

**Interfaces:**
- Produces: the Prototype surface renders `ScreenComposer` above/beside `PrototypeViewer`, with the screen list from `listRoomDesignScreens`. (The surface already appears once a screen is built — for the empty-room first-generation case, also surface the composer when the room is in the `design` stage; reuse the slice-2b `hasBuiltDesignScreen` plumbing, extended to `hasDesignScreen`/stage so the composer is reachable before the first screen exists.)

- [ ] **Step 1: Wire the page**

In `page.tsx`, for the prototype surface, load `listRoomDesignScreens(roomId)` alongside `getRoomPrototype(...)`, and render `<ScreenComposer roomId screens access />` with the `<PrototypeViewer .../>`. Ensure the surface is reachable before any screen is built: extend the surface-availability gate (slice-2b `hasBuiltDesignScreen`) so the Prototype surface also appears when the room stage is `design` or later (mirror the spec's "Canvas appears when hasUserFlow || hasDesignScreen || stage ≥ design"). Update the backend `RoomSurfaceState` computation + fake accordingly.

- [ ] **Step 2: Web suite + checks**

Run: `pnpm --filter web test && pnpm --filter web typecheck && pnpm check:astryx && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 3: Write the e2e**

Create `e2e/design-chat-to-screen.spec.ts` (cookie-auth like `design-prototype.spec.ts`, driven against the fake connector the other AI e2e specs use). Seed a room in the `design` stage with an active design profile. Type an instruction in the composer, submit, and — with the fake connector returning a valid `DesignScreenPayload` — assert the screen materializes (poll for the built state) and the Prototype viewer's iframe renders the generated markup. Then click Regenerate and assert a second version is produced.

- [ ] **Step 4: Run the e2e**

Run: `MELD_E2E_PORT=3987 pnpm exec playwright test e2e/design-chat-to-screen.spec.ts` (use a free port; 3000 may be occupied). Expected: PASS. This depends on the fake-connector harness the existing AI e2e specs rely on — if that harness cannot drive `design_screen_generate`, extend it the same way slice-2a extended the connector integration fakes, and note it.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx" \
        apps/web/src/features/rooms/surfaces.ts apps/web/src/features/rooms/surfaces.test.ts \
        apps/web/src/features/rooms/supabase-backend.ts apps/web/src/features/rooms/fake-backend.ts \
        e2e/design-chat-to-screen.spec.ts
git commit -m "feat(web): chat-to-screen composer surface + end-to-end test"
```

---

## Definition of done

- `supabase db reset && supabase test db` passes including instruction-stored and restore pgTAP.
- `pnpm --filter web test`, `typecheck`, `lint`, `check:astryx` pass.
- End to end (fake connector): typing a prompt creates + generates a screen, the sandboxed viewer shows it, Regenerate produces a new version, and Restore re-points to a prior version.
- No connector/gateway change (slice 2a already executes `design_screen_generate`); the only DB change is the additive instruction overload + restore RPC.

**Explicitly deferred to slice 3** (the real canvas): the `user-flows` → "Canvas" relabel, the multi-screen board/canvas with tldraw screen frames + reconciliation, Define-flow seeding of screens, sketch → layout serialization, the selection-aware composer, and the unified history drawer. Slice 4: Figma references + the immutable Development handoff.
```
