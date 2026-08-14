# Design Room Slice 4b — Readiness Rewiring & Development Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Design stage is ready when there are screens **or** a Figma reference and the design has been reviewed (a review auto-invalidated when the design changes after it); moving to Development writes an immutable handoff snapshot the panel renders as a compact summary.

**Architecture:** Two new count signals + three helper signals feed the pure `computeStageChecklist` engine, whose Design case is rewritten (built-screen-or-reference, `flows_refined` absorbed, a supporting design-system item) with staleness computed from two timestamps. A new `security definer` `create_design_handoff_snapshot` RPC assembles the manifest in SQL and is called **atomically inside `set_room_stage`** on the Design→Development branch. A `getRoomDesignHandoff` reader loads the latest snapshot; the Development terminal branch of the coaching panel renders a summary from it plus a prototype link.

**Tech Stack:** Next.js App Router, PostgreSQL (Supabase), `@astryxdesign/core`, TypeScript 5.9.3, Zod 4.4.3, vitest, Playwright, pgTAP, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-14-design-room-readiness-handoff-design.md`
**Master spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md` (Stage readiness §393–415, Handoff §417–423)
**Builds on (already exists):**
- `stage-readiness.ts` — `StageReadinessSignals`, the `auto(key,label,done,detail?,required?)` / `manual(key,label,signals,detail?,required?)` helpers, `stageItems`, `computeStageChecklist`.
- `getRoomPageData` in `apps/web/src/features/rooms/supabase-backend.ts` — assembles the signals via a `Promise.all` count-query block (mirror `decisionsResult` `{count:"exact",head:true}` and `prdStatusResult` max-version select).
- `design_handoff_snapshots` table + `design_handoff_immutable` trigger + participant-SELECT RLS (`202608130009_design_references_handoffs.sql:112`). **No create RPC / no INSERT grant** — 4b adds the RPC.
- `set_room_stage(target_room_id, target_stage)` (`202608110003_room_stage.sql:34`) — generic; the `current_room` row (old stage) is captured `for update` before the update.
- `room_stage_checklist_items(room_id, item_key, checked_by, checked_at)` + `set_room_checklist_item`; `manualChecksFromKeys` folds present keys → booleans.
- `design_screens` (`name, state, current_version_id, canvas_x, deleted_at, flow_node_id`), `design_screen_versions.created_at`, `design_references.created_at`, `prds.version`, `design_system_profiles` (active-version pointer).

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TS `5.9.3`, Zod `4.4.3`. Never change versions.
- **The `design_handoff_snapshots` table + immutability trigger + RLS already exist — do NOT recreate them.** 4b adds the create RPC and the `set_room_stage` hook in one new migration.
- **The manual key stays `design_reviewed` / label "Design reviewed"** — never "Prototype reviewed" (wrong for a Figma-only room).
- **`flows_refined` and `design_assets` are removed from the Design stage**; "Screens designed" (`screens_designed`) replaces them and is the sole design-artifact required item. Other stages (discovery/define/development) are UNCHANGED.
- **Staleness lives in the pure engine.** `design_reviewed` is done only when present AND `designReviewedAt >= latestDesignRevisionAt` (or no revisions exist). Stale → `done:false`, detail "design changed since review". The checklist row is never deleted.
- **The handoff snapshot is written inside `set_room_stage`'s transaction** on `design → development` only (using the pre-update `current_room.stage`), so it is atomic, once-per-real-transition, and unskippable. No app-layer `setRoomStage` change.
- **The handoff view renders from the snapshot's `manifest_json`** (screen names/counts), never live rows — that immutability is the point.
- Migration numbering: next free is `202608140006_*`.
- pgTAP + `supabase db reset` run with the **pinned CLI** `~/.local/share/supabase/supabase` (2.109.1), NOT brew's 2.111.0. `db reset` currently applies all migrations incl. the untracked `user_flow_assist` files — leave those untouched.
- `apps/web/src` obeys `check:astryx` (root `pnpm check:astryx`). New UI uses `@astryxdesign/core` (follow `room-inspector.tsx`); do NOT add new raw-`div`/px violations to `stage-coaching-panel.tsx` (its existing ones are pre-existing/unrelated).
- Readers/actions mirror the established shape (Zod guard, `isRoomFakeEnabled()` branch, `createClient(new Headers())`, `.passthrough()` rows, safe fallback). RFC4122-valid UUIDs in fixtures (`…-4xxx-8xxx-…`).
- `pnpm --filter web test -- <pattern>` does NOT filter in this repo — use `cd apps/web && npx vitest run <file>`.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/features/rooms/stage-readiness.ts` | Extend `StageReadinessSignals` (5 fields); rewrite the `design` case + staleness. |
| `apps/web/src/features/rooms/stage-readiness.test.ts` | Exhaustive Design-checklist + staleness tests. |
| `apps/web/src/features/rooms/supabase-backend.ts` | `getRoomPageData`: new count/timestamp queries → new signals. |
| `apps/web/src/features/rooms/fake-backend.ts`, `e2e-fake.ts`, `supabase-backend.test.ts` | Produce/stub the new signal fields. |
| `supabase/migrations/202608140006_design_handoff.sql` | `create_design_handoff_snapshot` RPC + `set_room_stage` CREATE-OR-REPLACE with the design→development hook. |
| `supabase/tests/design_handoff.test.sql` | pgTAP: RPC manifest/immutability/authority + the transition hook. |
| `packages/contracts/src/design-handoff.ts` (+ test, + index re-export) | `DesignHandoffView` type + `DesignHandoffManifestSchema`. |
| `apps/web/src/features/design/design-handoff-reader.ts` (+ test) | `getRoomDesignHandoff(roomId)` — latest snapshot → view; fake branch. |
| `apps/web/src/features/rooms/components/stage-coaching-panel.tsx` | Development terminal branch: render the snapshot summary + prototype link. |
| `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` | Thread the handoff into the panel. |
| `e2e/design-handoff.spec.ts` | build → review → move → summary; edit after review → re-gate. |

---

### Task 1: New readiness signals (type + assembly)

**Files:** Modify `stage-readiness.ts` (type only), `supabase-backend.ts`, `fake-backend.ts`, `e2e-fake.ts`, `supabase-backend.test.ts`.

**Interfaces:**
- Produces: `StageReadinessSignals` gains `builtScreenCount: number`, `designReferenceCount: number`, `hasDesignProfile: boolean`, `designReviewedAt: string | null`, `latestDesignRevisionAt: string | null`. (The engine does not read them yet — Task 2 does — so the tree compiles once every producer sets them.)

- [ ] **Step 1: Extend the type** in `stage-readiness.ts` (`StageReadinessSignals`, lines ~19–31) with the five fields. Do not touch the engine yet.

- [ ] **Step 2: Write failing backend assembly tests** — in `supabase-backend.test.ts`, extend the `getRoomPageData` fixtures so the mocked Supabase client returns: built-screen count, reference count, an active-profile row, a latest-revision timestamp, and a `design_reviewed` row with `checked_at`. Assert the resulting `stageReadiness` carries the five new fields with those values.

- [ ] **Step 3: Run → fail** — `cd apps/web && npx vitest run src/features/rooms/supabase-backend.test.ts`. Expected: FAIL (fields undefined).

- [ ] **Step 4: Wire the queries** in `getRoomPageData` (`supabase-backend.ts`). In the `Promise.all` block add:
  - `builtScreenCount`: `.from("design_screens").select("id",{count:"exact",head:true}).eq("room_id",roomId).eq("state","built").is("deleted_at",null)`.
  - `designReferenceCount`: `.from("design_references").select("id",{count:"exact",head:true}).eq("room_id",roomId)`.
  - `hasDesignProfile`: existence of the workspace's active design-system profile version — read `supabase/migrations/202608130005_design_profiles.sql` for the active-pointer column and query it (`.limit(1).maybeSingle()`, `Boolean(data)`).
  - `latestDesignRevisionAt`: the max of `design_screen_versions.created_at` and `design_references.created_at` for the room — two `.select("created_at").order("created_at",{ascending:false}).limit(1).maybeSingle()` reads, take the later; null if both absent.
  - Add `checked_at` to the existing `room_stage_checklist_items` select (currently `item_key`-only); derive `designReviewedAt` = the `checked_at` where `item_key === "design_reviewed"`, else null.
  Add each to the error guard, then set the five fields in the `stageReadiness` object literal.

- [ ] **Step 5: Update the other producers** — set the five fields in `fake-backend.ts` and `e2e-fake.ts`'s `getRoomPageData` equivalents (sensible values; `e2e-fake` should derive `builtScreenCount`/`designReferenceCount`/`latestDesignRevisionAt` from its in-memory `prototypeScreens`/`designReferences`/versions so the e2e in Task 6 is coherent, and `designReviewedAt` from its checklist store).

- [ ] **Step 6: Run → pass** — `cd apps/web && npx vitest run src/features/rooms/supabase-backend.test.ts` and `npx vitest run` (full web suite compiles). Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/rooms/stage-readiness.ts apps/web/src/features/rooms/supabase-backend.ts apps/web/src/features/rooms/fake-backend.ts apps/web/src/features/rooms/e2e-fake.ts apps/web/src/features/rooms/supabase-backend.test.ts
git commit -m "feat(rooms): add built-screen/reference/profile/review-staleness readiness signals"
```

---

### Task 2: Rewire the Design checklist + staleness (pure engine)

**Files:** Modify `stage-readiness.ts` (the `design` case); Test: `stage-readiness.test.ts`.

**Interfaces:**
- Consumes: the five new signals (Task 1).
- Produces: the `design` stage items become `screens_designed` (auto, required), `design_reviewed` (manual, required, staleness-aware), `design_system` (auto, supporting). `flows_refined`/`design_assets` removed from the Design stage. A helper `isDesignReviewFresh(signals): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { computeStageChecklist, type StageReadinessSignals } from "./stage-readiness";

function signals(over: Partial<StageReadinessSignals> = {}): StageReadinessSignals {
  return {
    participantCount: 1, hasHumanMessage: true, hasAgentReply: true, hasPrd: true,
    prdStatus: "accepted", userFlowCount: 0, decisionCount: 0, designAssetCount: 0,
    builtScreenCount: 0, designReferenceCount: 0, hasDesignProfile: false,
    designReviewedAt: null, latestDesignRevisionAt: null,
    manualChecks: { problem_framed: false, design_reviewed: false },
    ...over,
  };
}
function designItem(s: StageReadinessSignals, key: string) {
  return computeStageChecklist("design", s).items.find((i) => i.key === key);
}

describe("design stage — screens designed", () => {
  it("is done with a built screen", () => {
    expect(designItem(signals({ builtScreenCount: 2 }), "screens_designed")?.done).toBe(true);
  });
  it("is done with a Figma reference and no screens", () => {
    expect(designItem(signals({ designReferenceCount: 1 }), "screens_designed")?.done).toBe(true);
  });
  it("is not done with neither, and is required", () => {
    const item = designItem(signals(), "screens_designed");
    expect(item?.done).toBe(false);
    expect(item?.required).toBe(true);
  });
  it("no longer includes flows_refined or design_assets", () => {
    const keys = computeStageChecklist("design", signals()).items.map((i) => i.key);
    expect(keys).not.toContain("flows_refined");
    expect(keys).not.toContain("design_assets");
  });
});

describe("design stage — design system (supporting)", () => {
  it("is not required and reflects hasDesignProfile", () => {
    const off = designItem(signals(), "design_system");
    expect(off?.required).toBe(false);
    expect(off?.done).toBe(false);
    expect(designItem(signals({ hasDesignProfile: true }), "design_system")?.done).toBe(true);
  });
});

describe("design stage — review staleness", () => {
  const reviewed = { manualChecks: { problem_framed: false, design_reviewed: true } } as const;
  it("done when reviewed and no revisions exist", () => {
    expect(designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T10:00:00.000Z" }), "design_reviewed")?.done).toBe(true);
  });
  it("done when review is at/after the latest revision", () => {
    expect(designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T12:00:00.000Z", latestDesignRevisionAt: "2026-08-14T11:00:00.000Z" }), "design_reviewed")?.done).toBe(true);
  });
  it("NOT done + 'design changed since review' when a revision is newer", () => {
    const item = designItem(signals({ ...reviewed, designReviewedAt: "2026-08-14T10:00:00.000Z", latestDesignRevisionAt: "2026-08-14T11:00:00.000Z" }), "design_reviewed");
    expect(item?.done).toBe(false);
    expect(item?.detail).toBe("design changed since review");
  });
  it("not done when never reviewed", () => {
    expect(designItem(signals(), "design_reviewed")?.done).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail** — `cd apps/web && npx vitest run src/features/rooms/stage-readiness.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — add the freshness helper and rewrite the `design` case:

```ts
function isDesignReviewFresh(signals: StageReadinessSignals): boolean {
  if (signals.designReviewedAt === null) return false;
  if (signals.latestDesignRevisionAt === null) return true;
  return signals.designReviewedAt >= signals.latestDesignRevisionAt;
}
```

```ts
    case "design": {
      const screenCount = signals.builtScreenCount + signals.designReferenceCount;
      const reviewed = signals.manualChecks.design_reviewed === true;
      const fresh = isDesignReviewFresh(signals);
      const reviewItem: ChecklistItem = {
        key: "design_reviewed", label: "Design reviewed", kind: "manual",
        done: reviewed && fresh, required: true, manualKey: "design_reviewed",
        detail: reviewed && !fresh ? "design changed since review" : null,
      };
      return [
        auto(
          "screens_designed", "Screens designed",
          screenCount > 0,
          signals.builtScreenCount > 0
            ? countDetail(signals.builtScreenCount, "screens", "")
            : signals.designReferenceCount > 0
              ? countDetail(signals.designReferenceCount, "Figma references", "")
              : "build a screen or add a Figma link",
          true,
        ),
        reviewItem,
        auto(
          "design_system", "Design system connected",
          signals.hasDesignProfile,
          signals.hasDesignProfile ? "connected" : "optional",
          false,
        ),
      ];
    }
```

(Build `reviewItem` inline rather than via `manual()` because the staleness override needs a computed `done`/`detail` the generic helper doesn't express.)

- [ ] **Step 4: Run → pass** — the vitest command above. Then `cd apps/web && npx vitest run` (full suite — confirm no other stage regressed).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms/stage-readiness.ts apps/web/src/features/rooms/stage-readiness.test.ts
git commit -m "feat(rooms): Design readiness — screens-or-reference, absorb flows_refined, review staleness"
```

---

### Task 3: Handoff snapshot RPC + atomic transition hook

**Files:** Create `supabase/migrations/202608140006_design_handoff.sql`; Test: `supabase/tests/design_handoff.test.sql`.

**Interfaces:**
- Produces (SQL): `create_design_handoff_snapshot(target_room_id uuid) returns public.design_handoff_snapshots` (`security definer`, `can_edit_room`-gated); and a `set_room_stage` CREATE-OR-REPLACE that calls it inside the transaction on `design → development`.

- [ ] **Step 1: Write the failing pgTAP** (`design_handoff.test.sql`, mirror `design_task_rpcs.test.sql`'s harness):
  - As an editor, `create_design_handoff_snapshot(room)` inserts one row; `manifest_json -> 'screens'` has exactly the built screens (not empty/soft-deleted), each with `screenId`/`name`/`currentVersionId`.
  - `start_screen_id` = the earliest built screen (lowest `canvas_x`); `prd_revision` = max PRD version; `profile_version_id` = the active profile version (or null).
  - A non-editor call raises.
  - `update`/`delete` on the row raises `design_handoff_immutable`.
  - `set_room_stage(room,'development')` from `design` inserts exactly one snapshot; `set_room_stage` for a non-design→development transition (e.g. `discovery`→`define`) inserts none; a no-op re-move inserts none.

- [ ] **Step 2: Run → fail** — `~/.local/share/supabase/supabase test db`. Expected: FAIL.

- [ ] **Step 3: Write the migration.** First read `202608130005_design_profiles.sql` for the active-profile-version pointer and `202608130006_design_screens.sql` for the exact `design_screens` columns. Then:

```sql
create function public.create_design_handoff_snapshot(target_room_id uuid)
returns public.design_handoff_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
  snapshot public.design_handoff_snapshots;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select workspace_id into ws_id from public.rooms where id = target_room_id;

  insert into public.design_handoff_snapshots
    (room_id, workspace_id, manifest_json, start_screen_id, profile_version_id, prd_revision, created_by)
  values (
    target_room_id, ws_id,
    jsonb_build_object('screens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'screenId', s.id, 'name', s.name, 'currentVersionId', s.current_version_id)
             order by s.canvas_x)
      from public.design_screens s
      where s.room_id = target_room_id and s.state = 'built' and s.deleted_at is null
    ), '[]'::jsonb)),
    (select s.id from public.design_screens s
       where s.room_id = target_room_id and s.state = 'built' and s.deleted_at is null
       order by s.canvas_x limit 1),
    -- active profile version pointer for the workspace (adapt to the real column):
    (select <active_version_id> from public.design_system_profiles p where p.workspace_id = ws_id),
    (select max(version) from public.prds where room_id = target_room_id),
    auth.uid()
  )
  returning * into snapshot;
  return snapshot;
end;
$$;

revoke all on function public.create_design_handoff_snapshot(uuid) from public, anon;
grant execute on function public.create_design_handoff_snapshot(uuid) to authenticated;
```

Then CREATE OR REPLACE `set_room_stage` based on its installed definition (read `202608110003_room_stage.sql:34`), adding — after the `room_stage_events` insert and before `return target_stage` — :

```sql
  if current_room.stage = 'design' and target_stage = 'development' then
    perform public.create_design_handoff_snapshot(current_room.id);
  end if;
```

`current_room.stage` is the pre-update stage (captured `for update`), so this fires only on a real Design→Development move; `set_room_stage`'s existing early-return on `stage = target_stage` prevents a no-op re-write. Keep the function's existing `security definer`/`search_path`/grants identical.

- [ ] **Step 4: Run → pass** — `~/.local/share/supabase/supabase test db`. Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608140006_design_handoff.sql supabase/tests/design_handoff.test.sql
git commit -m "feat(design): create_design_handoff_snapshot RPC + atomic write on Design->Development"
```

---

### Task 4: Handoff contract + reader

**Files:** Create `packages/contracts/src/design-handoff.ts` (+ test), modify `packages/contracts/src/index.ts`; create `apps/web/src/features/design/design-handoff-reader.ts` (+ test); modify `e2e-fake.ts`.

**Interfaces:**
- Produces (`@meld/contracts`): `DesignHandoffManifestSchema` (`{ screens: { screenId: uuid; name: string; currentVersionId: uuid | null }[] }`); `type DesignHandoffView = { id: string; manifest: { screens: [...] }; startScreenId: string | null; profileVersionId: string | null; prdRevision: number | null; createdAt: string }`.
- Produces (web): `getRoomDesignHandoff(roomId): Promise<DesignHandoffView | null>` — latest `design_handoff_snapshots` row (`.order("created_at",{ascending:false}).limit(1).maybeSingle()`), parsed; fake branch `fakeGetRoomDesignHandoff`.

- [ ] **Step 1: Contract test** (parse a manifest; reject a bad screen entry) → **Step 2: fail** (`cd packages/contracts && npx vitest run src/design-handoff.test.ts`) → **Step 3: implement** contract + index re-export.

- [ ] **Step 4: Reader test** — mock `from("design_handoff_snapshots").select().eq().order().limit().maybeSingle()`; assert snake→camel + manifest parse; null when no row; bad roomId → null. → **Step 5: fail** → **Step 6: implement** the reader (mirror `design-events-reader.ts`'s guard/fake/fallback shape) + `fakeGetRoomDesignHandoff` reading a `store.designHandoffs` array (add to the store; the Task-3 e2e path / a fake `set_room_stage`-to-development should push one — coordinate with Task 6's fake).

- [ ] **Step 7: pass** (`cd apps/web && npx vitest run src/features/design/design-handoff-reader.test.ts`) → **Step 8: commit**

```bash
git add packages/contracts/src/design-handoff.ts packages/contracts/src/design-handoff.test.ts packages/contracts/src/index.ts apps/web/src/features/design/design-handoff-reader.ts apps/web/src/features/design/design-handoff-reader.test.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(design): DesignHandoff contract + getRoomDesignHandoff reader"
```

---

### Task 5: Development panel handoff summary

**Files:** Modify `stage-coaching-panel.tsx`, `page.tsx`, and `getRoomPageData` (`supabase-backend.ts` + fakes) to thread the handoff.

**Interfaces:**
- Consumes: `getRoomDesignHandoff` / `DesignHandoffView` (Task 4).
- Produces: the panel's Development (`isTerminal`) branch renders a summary from the snapshot + a "Preview prototype" link.

- [ ] **Step 1:** Thread `designHandoff: DesignHandoffView | null` through `getRoomPageData` (call `getRoomDesignHandoff(roomId)` in the `Promise.all`; add to the returned object + the fakes), pass from `page.tsx` to the panel as a prop.

- [ ] **Step 2: Write the failing component test** — `stage-coaching-panel.test.tsx` (or the existing panel test): with `stage="development"` and a `designHandoff` prop (2 screens, start name, profile label, PRD rev, timestamp), assert the summary line renders "2 screens handed off", the start-screen name, "PRD rev N", and a "Preview prototype" control; with `designHandoff={null}`, the pre-existing read-only summary still renders (fallback).

- [ ] **Step 3: Run → fail**, then **Step 4: implement** — in the `isTerminal` branch, when `designHandoff` is present render a compact summary from it (screen count from `manifest.screens.length`, start screen name looked up in the manifest by `startScreenId`, `profileVersionId` → a label or "neutral default", `prdRevision`, `createdAt` via the existing timestamp primitive) and a "Preview prototype" `Button`/link routing to `?tab=prototype` (reuse the panel's existing router usage). Astryx-clean primitives; do not add raw-`div`/px. Keep the existing summary as the `null` fallback.

- [ ] **Step 5: Run → pass** — `cd apps/web && npx vitest run src/features/rooms/components/stage-coaching-panel.test.tsx` + `pnpm check:astryx` (no new violations for the panel).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/rooms/components/stage-coaching-panel.tsx apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx apps/web/src/features/rooms/supabase-backend.ts apps/web/src/features/rooms/fake-backend.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(rooms): render the Development handoff summary from the snapshot"
```

---

### Task 6: End-to-end

**Files:** Create `e2e/design-handoff.spec.ts`.

**Interfaces:** none. Fake path, mirroring the existing design e2e harness.

- [ ] **Step 1: Write the failing e2e** — in a Design-stage room: build a screen (fake generate) → mark "Design reviewed" (the checklist toggle) → the Design checklist is fully ready → move to Development → the panel shows the handoff summary (screen count + "Preview prototype"). Then, in a Design-stage variant: after marking reviewed, regenerate/edit a screen → the "Design reviewed" item shows "design changed since review" and the stage re-gates.

- [ ] **Step 2: Run → fail** — the Playwright command the existing design specs use.

- [ ] **Step 3: Make it pass** — ensure the fake `set_room_stage`→development pushes a `design_handoff_snapshot` into `store.designHandoffs` (so `fakeGetRoomDesignHandoff` returns it) and that the fake `latestDesignRevisionAt`/`designReviewedAt` reflect the fake generate + checklist toggle so staleness re-gates. Fix any gap surgically.

- [ ] **Step 4: pass**, then **Step 5: full gate + commit** — `~/.local/share/supabase/supabase test db` · `cd apps/web && npx vitest run` · `cd packages/contracts && npx vitest run` · `pnpm check:astryx` · the Playwright command. Then:

```bash
git add e2e/design-handoff.spec.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "test(e2e): Design readiness re-gates on edit; handoff summary after Development move"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `builtScreenCount` / `designReferenceCount` signals | 1 |
| "Screens designed" = built screen OR reference | 2 |
| `flows_refined` absorbed | 2 |
| "Design system connected" supporting (`hasDesignProfile`) | 1, 2 |
| Manual key stays `design_reviewed` | 2 |
| Staleness ("design changed since review"), pure engine | 1 (timestamps), 2 (compare) |
| `create_design_handoff_snapshot` RPC (manifest, start, profile, prd_revision) | 3 |
| Atomic write inside `set_room_stage` on design→development | 3 |
| Immutable; renders from snapshot | 3 (trigger exists), 4/5 (reader+view) |
| Reuse existing table (no recreate) | 3 |
| Compact summary + prototype link | 5 |
| e2e | 6 |

Out of 4b (documented): the dedicated handoff surface (option B); flow-start binding of `start_screen_id` (earliest built screen used); handoff diffing; profile-authoring UI.

**2. Placeholder scan:** No "TBD"/"handle edge cases". The one intentional `<active_version_id>` / "adapt to the real column" marker (Task 3) and the `202608130005`/`202608130006` read instructions are grep-directives for schema the implementer must open, not invented signatures — flagged as such.

**3. Type consistency:** the five signal fields added in Task 1 are exactly those read by Task 2's engine and asserted in its tests. `DesignHandoffView`/`DesignHandoffManifestSchema` (Task 4) are consumed unchanged by Task 5. `create_design_handoff_snapshot` (Task 3) is the single insert path used by the `set_room_stage` hook and the fake in Tasks 4/6. Item keys (`screens_designed`, `design_reviewed`, `design_system`) are identical across Task 2's engine + tests and Task 6's e2e.
