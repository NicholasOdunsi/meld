# Design Room Slice 3c — Flow Seeding & Unified History Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Design Room Canvas by (1) **seeding** an empty `design_screen` per Define-flow `action` node so the screens the flow implies already exist as frames, and (2) adding the **unified History right-drawer** that renders the room's conversation merged with `design_screen_events`, filtered to the selected screen.

**Architecture:** Two independent deliverables sharing the Canvas surface. **Seeding**: a pure planner turns the room's `FlowDocument` `action` nodes (minus screens that already exist) into a deterministic seed payload; a race-safe `on conflict do nothing` RPC (backed by a new partial-unique index on `(room_id, flow_node_id)`) creates the rows; a canvas effect — gated exactly like the existing flow-seed — runs it once and merges the created rows into `canvasScreens` so slice-3a reconciliation projects them as `frame` shapes. **History**: a new client-callable reader SELECTs `design_screen_events` (participant RLS already permits it); a pure merge folds those events with the room's `messages` into one chronological timeline; a pure filter narrows it to the selected screen; a right-side sibling panel (there is no `Drawer` primitive — follow `StageCoachingPanel`) renders it, kept live by a new `design_screen_events` realtime subscription mirroring `subscribeToProductionRoom`.

**Tech Stack:** Next.js App Router, tldraw 5.3.0, `@astryxdesign/core`, `@supabase/ssr` + `@supabase/supabase-js` realtime, PostgreSQL (Supabase), TypeScript 5.9.3, Zod 4.4.3, vitest, Playwright, pgTAP, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md` (History §344–357; Canvas integration / seeding §128–166; "one canvas" §87–126; data model §425–438).
**Builds on:**
- slice-1 tables: `design_screen_events` (`202608130008_design_events.sql`), `design_screens` (`202608130006_design_screens.sql`, RPC `create_design_screen(target_room_id, screen_name, node_id?, x?, y?)`), `design_screen_versions`.
- slice-1 contract: `DesignScreenEventKindSchema` (`packages/contracts/src/design-events.ts`).
- slice-3a: `reconcileScreenFrames` / `screenFrameRecord` / `screenFrameId` (`apps/web/src/features/canvas/screen-frame-reconcile.ts`); the reconcile effect + `canvasScreens` prop in `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`; `CanvasScreen` + `readRoomCanvasScreens`/`listRoomCanvasScreens` (`apps/web/src/features/design/canvas-screen-reader.ts`).
- slice-3b: `useCanvasSketchSelection(editorRef, isEditorReady)` → `{ targetScreenId, sketchShapes, frame } | null` (`apps/web/src/features/canvas/use-canvas-selection.ts`).
- existing conversation: `RoomMessage` + `listRoomMessages` (`apps/web/src/features/rooms/actions.ts`, `repository.ts`); `subscribeToProductionRoom` (`apps/web/src/features/rooms/room-message-subscription.ts`).
- existing seed pattern: `shouldSeedJourneyFlow` (`apps/web/src/features/canvas/user-flow-seed.ts`).

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TS `5.9.3`, Zod `4.4.3`, tldraw pinned exactly `5.3.0`. **Never change versions.**
- **Surface key stays `user-flows`.** The Canvas already lives on it; do not rename surfaces, files, or identifiers.
- **No new tldraw shape type.** Seeded screens are ordinary `design_screens` rows; they become canvas frames only through the existing slice-3a `screenFrameRecord` projection. Do not touch the gateway or the tldraw schema.
- **No new event writers.** Slice 3c only *reads* `design_screen_events`. The unused `message` and `generation_failed` enum values gain no writer here (that is generation-path work). The drawer renders whatever kinds occur.
- **Seeding is additive and idempotent.** A room with no `action` nodes, or whose action nodes already have screens, seeds nothing. Re-running seeding never duplicates a screen. View access never seeds. Seeding writes only `state='empty'` rows — never a version.
- `apps/web/src` obeys `check:astryx` (no raw `<div>`/`<span>`, no hex/rgb, no bare px literals, no Tailwind) — `@astryxdesign/core` primitives + `var(--color-…)`. Editor/drawer code is client-only (`"use client"`).
- Every client-callable reader/action mirrors the established shape: a Zod input guard, an `isRoomFakeEnabled()` branch that dynamic-imports from `@/features/rooms/e2e-fake`, a `.strict()`/`.passthrough()` row schema for the PostgREST result, and a safe empty/`error` fallback on any failure. RLS is the authorization boundary — never a service-role key from the browser.
- Pure engines (the seed planner, the seed gate, the history merge/filter) depend only on Zod and their inputs — no React, no tldraw, no Supabase — so they are exhaustively unit-testable. Follow the `stage-readiness.ts` / `user-flow-seed.ts` precedent.
- **Migration numbering:** the next design migration is `202608140003_*` (0001/0002 on 2026-08-14 are the unrelated, currently-untracked `user_flow_assist` migrations; leave them alone). Each Supabase migration file runs in one transaction.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/202608140003_design_screen_flow_seed.sql` | Partial-unique index on `design_screens (room_id, flow_node_id)`; `seed_design_screens_from_flow(target_room_id, nodes jsonb)` RPC (`on conflict do nothing`, returns inserted rows). |
| `supabase/tests/design_screen_flow_seed.test.sql` | pgTAP: index dedupes; RPC seeds only missing action nodes, respects `can_edit_room`, is idempotent. |
| `packages/prototype/src/screen-seed.ts` | Pure `planScreenSeeds(flow, existingFlowNodeIds)` → `ScreenSeed[]`; `SCREEN_SEED_FRAME_WIDTH`/`_GAP`/`_BASELINE_Y`; `ScreenSeedSchema`. |
| `packages/prototype/src/screen-seed.test.ts` | Exhaustive planner tests (action-only, dedupe, layout, empty). |
| `packages/prototype/src/index.ts` | Re-export `./screen-seed`. |
| `apps/web/src/features/design/seed-design-screens.ts` | `"use server"` `seedDesignScreensFromFlow(roomId, seeds)` → created `CanvasScreen[]`; fake branch. |
| `apps/web/src/features/design/seed-design-screens.test.ts` | Action tests (validation, RPC mapping, empty). |
| `apps/web/src/features/canvas/design-screen-seed.ts` | Pure `shouldSeedDesignScreens(input)` gate (mirror of `shouldSeedJourneyFlow`). |
| `apps/web/src/features/canvas/design-screen-seed.test.ts` | Gate tests. |
| `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` | Seed effect (gate → plan → action → merge created rows into effective canvas screens so reconcile projects them); mount the History drawer + toggle, pass `selectedScreenId`. |
| `packages/contracts/src/design-events.ts` | Add `DesignScreenEventSchema` (row) + `DesignScreenEvent` type (kind enum already here). |
| `packages/contracts/src/design-events.test.ts` | Row-schema parse/reject tests. |
| `apps/web/src/features/design/design-events-reader.ts` | `"use server"` `listRoomDesignEvents(roomId)` → `DesignScreenEvent[]`; fake branch. |
| `apps/web/src/features/design/design-events-reader.test.ts` | Reader tests. |
| `apps/web/src/features/design/design-history.ts` | Pure `DesignHistoryEntry` union type; `mergeDesignHistory(messages, events)`; `filterDesignHistory(entries, selectedScreenId)`. |
| `apps/web/src/features/design/design-history.test.ts` | Exhaustive merge + filter tests. |
| `apps/web/src/features/design/design-events-subscription.ts` | `subscribeToDesignEvents(roomId, onEvent)` mirroring `subscribeToProductionRoom`. |
| `apps/web/src/features/design/design-events-subscription.test.ts` | Subscription wiring test (faked supabase client). |
| `apps/web/src/features/design/components/history-drawer.tsx` | `HistoryDrawer` sibling panel: loads messages + events, subscribes live, renders entries by kind, filters by `selectedScreenId`. |
| `apps/web/src/features/design/components/history-drawer.test.tsx` | Drawer render + filter + toggle tests. |
| `apps/web/src/features/rooms/e2e-fake.ts` | Fakes: `fakeSeedDesignScreensFromFlow`, `fakeListRoomDesignEvents` (+ any seed state the fake canvas read needs). |
| `e2e/design-history-seed.spec.ts` | Seed frames appear from a flow; generate → History shows events; selecting a screen filters the drawer. |

---

# PART A — Flow → screen seeding

### Task 1: Idempotency migration + seed RPC

**Files:**
- Create: `supabase/migrations/202608140003_design_screen_flow_seed.sql`
- Test: `supabase/tests/design_screen_flow_seed.test.sql`

**Interfaces:**
- Produces (SQL): partial unique index `design_screens_room_flow_node` on `(room_id, flow_node_id) where deleted_at is null and flow_node_id is not null`; RPC `public.seed_design_screens_from_flow(target_room_id uuid, nodes jsonb) returns setof public.design_screens`. `nodes` is a JSON array of `{ node_id: text, name: text, x: number, y: number }`. Returns only the rows it actually inserted (conflicts skipped).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/design_screen_flow_seed.test.sql` following the existing `supabase/tests/design_task_rpcs.test.sql` harness (same `begin; select plan(N); … select * from finish(); rollback;` shape, same helper for seeding an org/workspace/room/editor and calling `set local role`).

```sql
begin;
select plan(6);

-- Fixtures: an org, workspace, a design-stage room, and an editor membership.
-- (Reuse the helper block from design_task_rpcs.test.sql verbatim.)
-- … sets: gv_room uuid, gv_editor uuid (auth.uid()), gv_nonmember uuid

-- 1. Partial unique index exists.
select has_index(
  'public', 'design_screens', 'design_screens_room_flow_node',
  'partial unique index on (room_id, flow_node_id)'
);

-- 2. As the editor, seeding two action nodes creates two rows.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', gv_editor)::text, true);
select is(
  (select count(*)::int from public.seed_design_screens_from_flow(
    gv_room,
    '[{"node_id":"pick_plan","name":"Pick plan","x":0,"y":1200},
      {"node_id":"checkout","name":"Checkout","x":470,"y":1200}]'::jsonb)),
  2, 'seeds two action-node screens'
);

-- 3. Rows landed with flow_node_id, name, position, empty state.
select is(
  (select flow_node_id from public.design_screens
     where room_id = gv_room and flow_node_id = 'pick_plan'),
  'pick_plan', 'seeded row carries flow_node_id'
);
select is(
  (select state::text from public.design_screens where flow_node_id = 'checkout'),
  'empty', 'seeded screen starts empty'
);

-- 4. Idempotent: re-seeding the same nodes inserts nothing.
select is(
  (select count(*)::int from public.seed_design_screens_from_flow(
    gv_room,
    '[{"node_id":"pick_plan","name":"Pick plan","x":0,"y":1200}]'::jsonb)),
  0, 're-seeding an existing flow_node is a no-op'
);

-- 5. A non-editor cannot seed.
select set_config('request.jwt.claims', json_build_object('sub', gv_nonmember)::text, true);
select throws_ok(
  $$ select public.seed_design_screens_from_flow(
       (select id from public.design_screens where flow_node_id = 'pick_plan' limit 0),
       '[]'::jsonb) $$
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run → fail**

Run: `supabase test db` (or the repo's pgTAP runner, e.g. `pnpm --filter @meld/db test` — check `package.json` scripts; the slice-1/2 tasks used `supabase test db`).
Expected: FAIL — index and function do not exist.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/202608140003_design_screen_flow_seed.sql`:

```sql
-- Flow seeding turns Define-flow `action` nodes into empty screen rows. A screen
-- is unique per (room, flow_node_id) among live rows so seeding is idempotent and
-- multiplayer-safe: two designers opening the Canvas at once cannot double-create
-- a node's screen. Composer-created screens have a null flow_node_id and are
-- excluded from the constraint (many un-flow-bound screens per room are fine).
create unique index design_screens_room_flow_node
  on public.design_screens (room_id, flow_node_id)
  where deleted_at is null and flow_node_id is not null;

-- Seed the screens implied by a flow's action nodes in one round-trip. RETURNING
-- on `on conflict do nothing` yields only the rows actually inserted, so the
-- caller learns exactly which new screens to project onto the canvas. Editor
-- authority and workspace resolution match create_design_screen.
create function public.seed_design_screens_from_flow(
  target_room_id uuid,
  nodes jsonb
)
returns setof public.design_screens
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  if not public.can_edit_room(target_room_id) then
    raise exception 'not authorized to edit room %', target_room_id
      using errcode = '42501';
  end if;

  select workspace_id into ws_id
    from public.rooms where id = target_room_id;
  if ws_id is null then
    raise exception 'room % not found', target_room_id using errcode = 'P0002';
  end if;

  return query
  insert into public.design_screens
    (room_id, workspace_id, name, flow_node_id, canvas_x, canvas_y, created_by)
  select
    target_room_id, ws_id,
    left(btrim(n.name), 120), n.node_id, n.x, n.y, auth.uid()
  from jsonb_to_recordset(nodes)
    as n(node_id text, name text, x double precision, y double precision)
  where n.node_id is not null and btrim(n.name) <> ''
  on conflict (room_id, flow_node_id)
    where deleted_at is null and flow_node_id is not null
    do nothing
  returning *;
end;
$$;

revoke all on function public.seed_design_screens_from_flow(uuid, jsonb)
  from public, anon;
grant execute on function public.seed_design_screens_from_flow(uuid, jsonb)
  to authenticated;
```

> Verify `can_edit_room(uuid)` is the exact predicate `create_design_screen` uses (grep `202608130006_design_screens.sql`); reuse whichever authority function it calls so seeding and single-create agree.

- [ ] **Step 4: Run → pass**

Run: `supabase test db`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608140003_design_screen_flow_seed.sql supabase/tests/design_screen_flow_seed.test.sql
git commit -m "feat(design): idempotent flow-node screen seeding RPC + partial unique index"
```

---

### Task 2: Pure seed planner

**Files:**
- Create: `packages/prototype/src/screen-seed.ts` + `packages/prototype/src/screen-seed.test.ts`
- Modify: `packages/prototype/src/index.ts` (add `export * from "./screen-seed";`)

**Interfaces:**
- Consumes: `FlowDocument` / `FlowNode` from `@meld/contracts` (`node.kind === "action"`, `node.id`, `node.label`).
- Produces:
  - `type ScreenSeed = { nodeId: string; name: string; x: number; y: number }`
  - `const ScreenSeedSchema: z.ZodType<ScreenSeed>` (`.strict()`)
  - `const SCREEN_SEED_FRAME_WIDTH = 390` (matches `screenFrameRecord`'s frame width), `SCREEN_SEED_GAP = 80`, `SCREEN_SEED_BASELINE_Y = 1200`.
  - `function planScreenSeeds(flow: FlowDocument | null, existingFlowNodeIds: readonly string[]): ScreenSeed[]` — deterministic; one seed per `action` node whose `id` is not in `existingFlowNodeIds`, laid out left-to-right in flow order at `x = index * (SCREEN_SEED_FRAME_WIDTH + SCREEN_SEED_GAP)`, `y = SCREEN_SEED_BASELINE_Y`, `name = node.label`. Returns `[]` for `null` flow or no unseeded action nodes.

> `index` is the position **among the seeds being produced** (0-based over the filtered list), so a partially-seeded flow still lays its new screens out in a clean row. Positions are a deterministic first pass; aligning each screen under its flow node is a documented follow-up, not slice 3c.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { planScreenSeeds, SCREEN_SEED_FRAME_WIDTH, SCREEN_SEED_GAP, SCREEN_SEED_BASELINE_Y } from "./screen-seed";
import type { FlowDocument } from "@meld/contracts";

function flow(nodes: Array<{ id: string; kind: string; label: string }>): FlowDocument {
  return {
    title: "T", summary: "S",
    nodes: nodes.map((n) => ({ ...n, detail: null })),
    edges: [], openQuestions: [],
  } as unknown as FlowDocument;
}

describe("planScreenSeeds", () => {
  it("emits one seed per action node, in flow order, laid out in a row", () => {
    const out = planScreenSeeds(
      flow([
        { id: "start", kind: "start", label: "Start" },
        { id: "pick_plan", kind: "action", label: "Pick plan" },
        { id: "route", kind: "decision", label: "Route" },
        { id: "checkout", kind: "action", label: "Checkout" },
      ]),
      [],
    );
    expect(out).toEqual([
      { nodeId: "pick_plan", name: "Pick plan", x: 0, y: SCREEN_SEED_BASELINE_Y },
      { nodeId: "checkout", name: "Checkout", x: SCREEN_SEED_FRAME_WIDTH + SCREEN_SEED_GAP, y: SCREEN_SEED_BASELINE_Y },
    ]);
  });

  it("skips action nodes that already have a screen", () => {
    const out = planScreenSeeds(
      flow([
        { id: "pick_plan", kind: "action", label: "Pick plan" },
        { id: "checkout", kind: "action", label: "Checkout" },
      ]),
      ["pick_plan"],
    );
    expect(out).toEqual([{ nodeId: "checkout", name: "Checkout", x: 0, y: SCREEN_SEED_BASELINE_Y }]);
  });

  it("returns [] for a null flow", () => {
    expect(planScreenSeeds(null, [])).toEqual([]);
  });

  it("returns [] when every action node is already seeded", () => {
    const out = planScreenSeeds(flow([{ id: "a", kind: "action", label: "A" }]), ["a"]);
    expect(out).toEqual([]);
  });

  it("ignores non-action nodes entirely (system/decision/start/end)", () => {
    const out = planScreenSeeds(
      flow([
        { id: "s", kind: "system", label: "S" },
        { id: "d", kind: "decision", label: "D" },
        { id: "e", kind: "end", label: "E" },
      ]),
      [],
    );
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @meld/prototype test -- screen-seed`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { z } from "zod";
import type { FlowDocument } from "@meld/contracts";

export const SCREEN_SEED_FRAME_WIDTH = 390;
export const SCREEN_SEED_GAP = 80;
export const SCREEN_SEED_BASELINE_Y = 1200;

export const ScreenSeedSchema = z
  .object({
    nodeId: z.string(),
    name: z.string(),
    x: z.number(),
    y: z.number(),
  })
  .strict();
export type ScreenSeed = z.infer<typeof ScreenSeedSchema>;

// One empty screen per Define-flow `action` node that has no screen yet. Logic
// nodes (system/decision) and terminals (start/end) are not screens. Deterministic
// so the same flow + existing set always seeds the same rows at the same spots.
export function planScreenSeeds(
  flow: FlowDocument | null,
  existingFlowNodeIds: readonly string[],
): ScreenSeed[] {
  if (!flow) return [];
  const existing = new Set(existingFlowNodeIds);
  const unseeded = flow.nodes.filter(
    (node) => node.kind === "action" && !existing.has(node.id),
  );
  return unseeded.map((node, index) => ({
    nodeId: node.id,
    name: node.label,
    x: index * (SCREEN_SEED_FRAME_WIDTH + SCREEN_SEED_GAP),
    y: SCREEN_SEED_BASELINE_Y,
  }));
}
```

Add to `packages/prototype/src/index.ts`: `export * from "./screen-seed";`

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @meld/prototype test -- screen-seed`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/screen-seed.ts packages/prototype/src/screen-seed.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): pure planScreenSeeds — action nodes to seed payload"
```

---

### Task 3: Seed server action

**Files:**
- Create: `apps/web/src/features/design/seed-design-screens.ts` + `apps/web/src/features/design/seed-design-screens.test.ts`
- Modify: `apps/web/src/features/rooms/e2e-fake.ts` (add `fakeSeedDesignScreensFromFlow`)

**Interfaces:**
- Consumes: `ScreenSeed`, `ScreenSeedSchema` (Task 2); `CanvasScreen` (`canvas-screen-reader.ts`); the RPC from Task 1.
- Produces: `async function seedDesignScreensFromFlow(input: { roomId: string; seeds: ScreenSeed[] }): Promise<CanvasScreen[]>` — returns the **created** screens as `CanvasScreen` (state `"empty"`, `preview: null`, positions and `flowNodeId` echoed from the inserted rows). Empty `seeds` → `[]` with no RPC call. Any failure → `[]` (seeding is best-effort; the flow diagram still renders).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { seedDesignScreensFromFlow } from "./seed-design-screens";

const ROOM = "11111111-1111-1111-1111-111111111111";
const SCREEN = "22222222-2222-2222-2222-222222222222";

beforeEach(() => { rpc.mockReset(); });

describe("seedDesignScreensFromFlow", () => {
  it("returns [] and skips the RPC when there are no seeds", async () => {
    expect(await seedDesignScreensFromFlow({ roomId: ROOM, seeds: [] })).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps inserted rows to CanvasScreen", async () => {
    rpc.mockResolvedValue({
      data: [{ id: SCREEN, name: "Pick plan", flow_node_id: "pick_plan", canvas_x: 0, canvas_y: 1200, state: "empty" }],
      error: null,
    });
    const out = await seedDesignScreensFromFlow({
      roomId: ROOM,
      seeds: [{ nodeId: "pick_plan", name: "Pick plan", x: 0, y: 1200 }],
    });
    expect(rpc).toHaveBeenCalledWith("seed_design_screens_from_flow", {
      target_room_id: ROOM,
      nodes: [{ node_id: "pick_plan", name: "Pick plan", x: 0, y: 1200 }],
    });
    expect(out).toEqual([
      { id: SCREEN, name: "Pick plan", canvasX: 0, canvasY: 1200, flowNodeId: "pick_plan", state: "empty", preview: null },
    ]);
  });

  it("returns [] on RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
    expect(await seedDesignScreensFromFlow({ roomId: ROOM, seeds: [{ nodeId: "a", name: "A", x: 0, y: 0 }] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- seed-design-screens`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
"use server";
import { ScreenSeedSchema, type ScreenSeed } from "@meld/prototype";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import type { CanvasScreen } from "./canvas-screen-reader";

const SeedInput = z
  .object({ roomId: z.string().uuid(), seeds: z.array(ScreenSeedSchema) })
  .strict();

const InsertedRow = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    flow_node_id: z.string().nullable(),
    canvas_x: z.number(),
    canvas_y: z.number(),
    state: z.enum(["empty", "built"]),
  })
  .passthrough();

export async function seedDesignScreensFromFlow(
  input: z.input<typeof SeedInput>,
): Promise<CanvasScreen[]> {
  const parsed = SeedInput.safeParse(input);
  if (!parsed.success || parsed.data.seeds.length === 0) return [];
  const seeds = parsed.data.seeds;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeSeedDesignScreensFromFlow } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeSeedDesignScreensFromFlow(parsed.data.roomId, seeds);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("seed_design_screens_from_flow", {
      target_room_id: parsed.data.roomId,
      nodes: seeds.map((s: ScreenSeed) => ({ node_id: s.nodeId, name: s.name, x: s.x, y: s.y })),
    });
    if (error) {
      console.error("seedDesignScreensFromFlow RPC error", { error });
      return [];
    }
    const rows = z.array(InsertedRow).safeParse(Array.isArray(data) ? data : []);
    if (!rows.success) return [];
    return rows.data.map((row): CanvasScreen => ({
      id: row.id,
      name: row.name,
      canvasX: row.canvas_x,
      canvasY: row.canvas_y,
      flowNodeId: row.flow_node_id,
      state: row.state,
      preview: null,
    }));
  } catch (thrown) {
    console.error("seedDesignScreensFromFlow threw", { thrown });
    return [];
  }
}
```

Add to `apps/web/src/features/rooms/e2e-fake.ts` (near the other `fake…DesignScreen…` helpers), returning `CanvasScreen[]` from the in-memory fake store — assign a deterministic uuid per `nodeId` and record the seeded rows so `fakeListRoomCanvasScreens` and `fakeListRoomDesignEvents` stay consistent:

```ts
export async function fakeSeedDesignScreensFromFlow(
  roomId: string,
  seeds: { nodeId: string; name: string; x: number; y: number }[],
): Promise<CanvasScreen[]> {
  // Mirror the RPC: create only for flow_node_ids not already present.
  return seeds
    .filter((s) => !fakeCanvasScreens(roomId).some((c) => c.flowNodeId === s.nodeId))
    .map((s) => fakeAddCanvasScreen(roomId, {
      name: s.name, canvasX: s.x, canvasY: s.y, flowNodeId: s.nodeId, state: "empty", preview: null,
    }));
}
```

> Match the exact fake-store helpers already in `e2e-fake.ts` (grep for the existing `fakeListRoomCanvasScreens` / `fakeGenerateDesignScreen` state); the snippet above names them illustratively — reuse the real accessors so the e2e canvas read reflects seeded rows.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- seed-design-screens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/seed-design-screens.ts apps/web/src/features/design/seed-design-screens.test.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(web): seedDesignScreensFromFlow action + e2e fake"
```

---

### Task 4: Wire seeding into the Canvas

**Files:**
- Create: `apps/web/src/features/canvas/design-screen-seed.ts` + `apps/web/src/features/canvas/design-screen-seed.test.ts`
- Modify: `apps/web/src/features/canvas/user-flow-trial-canvas.tsx`

**Interfaces:**
- Produces: `function shouldSeedDesignScreens(input: { hasUnseededActionNodes: boolean; access: "edit" | "view"; storeStatus: string; hasSeeded: boolean }): boolean` — true only when there is an action node without a screen, the viewer can edit, the store is `"synced-remote"`, and seeding has not already run. (Deliberately mirrors `shouldSeedJourneyFlow`; there is no `canvasIsEmpty` guard — seeding adds rows to a canvas that may already hold the flow.)
- Consumes in the canvas: `planScreenSeeds` (Task 2), `seedDesignScreensFromFlow` (Task 3), the existing `canvasScreens` prop, `seedFlow` prop, `store.status`, `effectiveAccess`.

- [ ] **Step 1: Write the failing gate test**

```ts
import { describe, expect, it } from "vitest";
import { shouldSeedDesignScreens } from "./design-screen-seed";

const base = { hasUnseededActionNodes: true, access: "edit" as const, storeStatus: "synced-remote", hasSeeded: false };

describe("shouldSeedDesignScreens", () => {
  it("seeds when action nodes lack screens, editor, synced-remote, not yet seeded", () => {
    expect(shouldSeedDesignScreens(base)).toBe(true);
  });
  it("does not seed when nothing is unseeded", () => {
    expect(shouldSeedDesignScreens({ ...base, hasUnseededActionNodes: false })).toBe(false);
  });
  it("does not seed for viewers", () => {
    expect(shouldSeedDesignScreens({ ...base, access: "view" })).toBe(false);
  });
  it("waits for synced-remote", () => {
    expect(shouldSeedDesignScreens({ ...base, storeStatus: "synced-local" })).toBe(false);
  });
  it("is one-shot", () => {
    expect(shouldSeedDesignScreens({ ...base, hasSeeded: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- design-screen-seed`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the gate**

```ts
// Whether the Canvas should seed empty screens from the Define flow's action
// nodes. Mirrors shouldSeedJourneyFlow's guards, minus canvasIsEmpty: seeded
// screens are additive to a canvas that may already hold the flow diagram.
export function shouldSeedDesignScreens(input: {
  hasUnseededActionNodes: boolean;
  access: "edit" | "view";
  storeStatus: string;
  hasSeeded: boolean;
}): boolean {
  return (
    input.hasUnseededActionNodes &&
    input.access === "edit" &&
    input.storeStatus === "synced-remote" &&
    !input.hasSeeded
  );
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- design-screen-seed`
Expected: PASS.

- [ ] **Step 5: Wire the effect into `user-flow-trial-canvas.tsx`**

Add imports:
```ts
import { planScreenSeeds } from "@meld/prototype";
import { seedDesignScreensFromFlow } from "@/features/design/seed-design-screens";
import { shouldSeedDesignScreens } from "./design-screen-seed";
```

Add state + a merge so seeded rows flow into the existing reconcile without a server refetch. Replace the direct uses of the `canvasScreens` prop in the `CanvasScreenLayer` memo, `canvasScreensKey` memo, and reconcile effect with `effectiveCanvasScreens`:

```ts
const [seededScreens, setSeededScreens] = useState<CanvasScreen[]>([]);
const seededScreenSeedRef = useRef(false);
// The server prop is authoritative; freshly-seeded rows layer on top until the
// next server read. Dedupe by id so a later server read that includes the seeds
// supersedes the local copies.
const effectiveCanvasScreens = useMemo(() => {
  const byId = new Map<string, CanvasScreen>();
  for (const screen of canvasScreens) byId.set(screen.id, screen);
  for (const screen of seededScreens) if (!byId.has(screen.id)) byId.set(screen.id, screen);
  return Array.from(byId.values());
}, [canvasScreens, seededScreens]);
```

Point `CanvasScreenLayer` (line ~171), `canvasScreensKey` (line ~320), and the reconcile effect's `canvasScreens` reads (lines ~371–387) at `effectiveCanvasScreens`.

Add the seed effect after the flow-seed effect (~line 318):

```ts
// Seed empty screens from the Define flow's action nodes once, after remote
// sync, for editors. planScreenSeeds diffs the flow's action nodes against the
// screens that already exist; the returned rows merge into effectiveCanvasScreens
// so the existing reconcile projects them as frames. One-shot; idempotent at the
// DB level too (partial unique index).
useEffect(() => {
  if (seededScreenSeedRef.current) return;
  const existingFlowNodeIds = effectiveCanvasScreens.flatMap((s) =>
    s.flowNodeId ? [s.flowNodeId] : [],
  );
  const seeds = planScreenSeeds(seedFlow, existingFlowNodeIds);
  if (
    !shouldSeedDesignScreens({
      hasUnseededActionNodes: seeds.length > 0,
      access: effectiveAccess,
      storeStatus: store.status,
      hasSeeded: seededScreenSeedRef.current,
    })
  ) {
    return;
  }
  seededScreenSeedRef.current = true;
  void seedDesignScreensFromFlow({ roomId, seeds }).then((created) => {
    if (created.length > 0) setSeededScreens((prev) => [...prev, ...created]);
  });
}, [seedFlow, effectiveAccess, store.status, effectiveCanvasScreens, roomId]);
```

- [ ] **Step 6: Add a component test asserting the effect calls the action**

In `apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx` (already mocks `useSync` → `{ status: "synced-remote" }`), add a case: mock `seedDesignScreensFromFlow`, render with `access="edit"`, a `seedFlow` containing one `action` node and `canvasScreens=[]`, and assert `seedDesignScreensFromFlow` is called once with a single seed; render again with the action node already in `canvasScreens.flowNodeId` and assert it is **not** called.

```ts
vi.mock("@/features/design/seed-design-screens", () => ({
  seedDesignScreensFromFlow: vi.fn(async () => []),
}));
// … then in a test: expect(seedDesignScreensFromFlow).toHaveBeenCalledTimes(1);
```

- [ ] **Step 7: Run → pass**

Run: `pnpm --filter web test -- user-flow-trial-canvas design-screen-seed`
Expected: PASS. Then `pnpm --filter web check:astryx`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/canvas/design-screen-seed.ts apps/web/src/features/canvas/design-screen-seed.test.ts apps/web/src/features/canvas/user-flow-trial-canvas.tsx apps/web/src/features/canvas/user-flow-trial-canvas.test.tsx
git commit -m "feat(web): seed design screens from flow action nodes on the Canvas"
```

---

# PART B — Unified history drawer

### Task 5: Event row contract

**Files:**
- Modify: `packages/contracts/src/design-events.ts`
- Test: `packages/contracts/src/design-events.test.ts`

**Interfaces:**
- Consumes: `DesignScreenEventKindSchema` (already in the file).
- Produces:
  - `const DesignScreenEventSchema` (`.strict()`): `{ id: string(uuid); roomId: string(uuid); screenId: string(uuid) | null; kind: DesignScreenEventKind; messageId: string(uuid) | null; taskId: string(uuid) | null; versionId: string(uuid) | null; actor: string(uuid) | null; createdAt: string(datetime) }`.
  - `type DesignScreenEvent = z.infer<typeof DesignScreenEventSchema>`.

- [ ] **Step 1: Write the failing test**

Append to `packages/contracts/src/design-events.test.ts`:

```ts
import { DesignScreenEventSchema } from "./design-events";

describe("DesignScreenEventSchema", () => {
  const base = {
    id: "11111111-1111-1111-1111-111111111111",
    roomId: "22222222-2222-2222-2222-222222222222",
    screenId: null,
    kind: "generation_started",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:00:00.000Z",
  };
  it("parses a well-formed event", () => {
    expect(DesignScreenEventSchema.parse(base).kind).toBe("generation_started");
  });
  it("accepts a screen-scoped event", () => {
    expect(DesignScreenEventSchema.parse({ ...base, screenId: "33333333-3333-3333-3333-333333333333" }).screenId)
      .toBe("33333333-3333-3333-3333-333333333333");
  });
  it("rejects an unknown kind", () => {
    expect(DesignScreenEventSchema.safeParse({ ...base, kind: "nope" }).success).toBe(false);
  });
  it("rejects extra keys", () => {
    expect(DesignScreenEventSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @meld/contracts test -- design-events`
Expected: FAIL — `DesignScreenEventSchema` not exported.

- [ ] **Step 3: Implement**

Append to `packages/contracts/src/design-events.ts`:

```ts
export const DesignScreenEventSchema = z
  .object({
    id: z.string().uuid(),
    roomId: z.string().uuid(),
    screenId: z.string().uuid().nullable(),
    kind: DesignScreenEventKindSchema,
    messageId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    actor: z.string().uuid().nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DesignScreenEvent = z.infer<typeof DesignScreenEventSchema>;
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @meld/contracts test -- design-events`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/design-events.ts packages/contracts/src/design-events.test.ts
git commit -m "feat(contracts): DesignScreenEvent row schema"
```

---

### Task 6: Design events reader

**Files:**
- Create: `apps/web/src/features/design/design-events-reader.ts` + `apps/web/src/features/design/design-events-reader.test.ts`
- Modify: `apps/web/src/features/rooms/e2e-fake.ts` (add `fakeListRoomDesignEvents`)

**Interfaces:**
- Consumes: `DesignScreenEvent`, `DesignScreenEventSchema` (Task 5).
- Produces: `async function listRoomDesignEvents(roomId: string): Promise<DesignScreenEvent[]>` — SELECTs `design_screen_events` filtered by `room_id`, ordered `created_at asc` (the `(room_id, created_at)` index serves this), mapped snake→camel, RLS-authorized. Bad input or failure → `[]`. Fake branch delegates to `fakeListRoomDesignEvents`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from })) }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { listRoomDesignEvents } from "./design-events-reader";

const ROOM = "11111111-1111-1111-1111-111111111111";
beforeEach(() => { order.mockReset(); eq.mockClear(); select.mockClear(); from.mockClear(); });

describe("listRoomDesignEvents", () => {
  it("maps rows snake→camel", async () => {
    order.mockResolvedValue({
      data: [{
        id: "22222222-2222-2222-2222-222222222222", room_id: ROOM, screen_id: null,
        kind: "generation_started", message_id: null, task_id: null, version_id: null,
        actor: null, created_at: "2026-08-14T10:00:00.000Z",
      }],
      error: null,
    });
    const out = await listRoomDesignEvents(ROOM);
    expect(from).toHaveBeenCalledWith("design_screen_events");
    expect(out).toEqual([{
      id: "22222222-2222-2222-2222-222222222222", roomId: ROOM, screenId: null,
      kind: "generation_started", messageId: null, taskId: null, versionId: null,
      actor: null, createdAt: "2026-08-14T10:00:00.000Z",
    }]);
  });
  it("returns [] on a bad room id", async () => {
    expect(await listRoomDesignEvents("nope")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns [] on error", async () => {
    order.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await listRoomDesignEvents(ROOM)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- design-events-reader`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
"use server";
import { DesignScreenEventSchema, type DesignScreenEvent } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const EventRow = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    screen_id: z.string().uuid().nullable(),
    kind: z.string(),
    message_id: z.string().uuid().nullable(),
    task_id: z.string().uuid().nullable(),
    version_id: z.string().uuid().nullable(),
    actor: z.string().uuid().nullable(),
    created_at: z.string(),
  })
  .passthrough();

export async function listRoomDesignEvents(
  roomId: string,
): Promise<DesignScreenEvent[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignEvents } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeListRoomDesignEvents(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screen_events")
      .select("id,room_id,screen_id,kind,message_id,task_id,version_id,actor,created_at")
      .eq("room_id", id.data)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("listRoomDesignEvents error", { roomId, error });
      return [];
    }
    const rows = z.array(EventRow).safeParse(data ?? []);
    if (!rows.success) return [];
    return rows.data.flatMap((row) => {
      const parsed = DesignScreenEventSchema.safeParse({
        id: row.id,
        roomId: row.room_id,
        screenId: row.screen_id,
        kind: row.kind,
        messageId: row.message_id,
        taskId: row.task_id,
        versionId: row.version_id,
        actor: row.actor,
        createdAt: row.created_at,
      });
      return parsed.success ? [parsed.data] : [];
    });
  } catch (thrown) {
    console.error("listRoomDesignEvents threw", { roomId, thrown });
    return [];
  }
}
```

Add `fakeListRoomDesignEvents(roomId): Promise<DesignScreenEvent[]>` to `e2e-fake.ts`, reading whatever generation events the fake generation path records (or an empty list if the fake path records none — the e2e in Task 10 drives at least one generation, so wire the fake to append a `generation_started` + `version_created` event when `fakeGenerateDesignScreen` runs).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- design-events-reader`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/design-events-reader.ts apps/web/src/features/design/design-events-reader.test.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(web): listRoomDesignEvents reader + e2e fake"
```

---

### Task 7: Pure history merge + filter

**Files:**
- Create: `apps/web/src/features/design/design-history.ts` + `apps/web/src/features/design/design-history.test.ts`

**Interfaces:**
- Consumes: `RoomMessage` (`@/features/rooms/repository`); `DesignScreenEvent` (`@meld/contracts`).
- Produces:
  - `type DesignHistoryEntry = { type: "message"; id: string; createdAt: string; message: RoomMessage } | { type: "event"; id: string; createdAt: string; event: DesignScreenEvent }`.
  - `function mergeDesignHistory(messages: RoomMessage[], events: DesignScreenEvent[]): DesignHistoryEntry[]` — one list, ascending by `createdAt`, ties broken by `id` (stable, deterministic).
  - `function filterDesignHistory(entries: DesignHistoryEntry[], selectedScreenId: string | null): DesignHistoryEntry[]` — `null` → all entries unchanged; a screen id → only `event` entries whose `event.screenId === selectedScreenId` (room-level messages are not screen-scoped, so a screen filter shows that screen's design-event timeline).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mergeDesignHistory, filterDesignHistory } from "./design-history";
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

function msg(id: string, createdAt: string): RoomMessage {
  return { id, createdAt } as unknown as RoomMessage;
}
function evt(id: string, createdAt: string, screenId: string | null): DesignScreenEvent {
  return {
    id, roomId: "r", screenId, kind: "version_created",
    messageId: null, taskId: null, versionId: null, actor: null, createdAt,
  } as unknown as DesignScreenEvent;
}

describe("mergeDesignHistory", () => {
  it("interleaves messages and events by createdAt", () => {
    const out = mergeDesignHistory(
      [msg("m1", "2026-08-14T10:00:00.000Z"), msg("m2", "2026-08-14T10:02:00.000Z")],
      [evt("e1", "2026-08-14T10:01:00.000Z", "s1")],
    );
    expect(out.map((e) => e.id)).toEqual(["m1", "e1", "m2"]);
    expect(out[0].type).toBe("message");
    expect(out[1].type).toBe("event");
  });
  it("breaks createdAt ties by id deterministically", () => {
    const out = mergeDesignHistory([msg("b", "2026-08-14T10:00:00.000Z")], [evt("a", "2026-08-14T10:00:00.000Z", null)]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("filterDesignHistory", () => {
  const merged = mergeDesignHistory(
    [msg("m1", "2026-08-14T10:00:00.000Z")],
    [evt("e1", "2026-08-14T10:01:00.000Z", "s1"), evt("e2", "2026-08-14T10:02:00.000Z", "s2")],
  );
  it("returns everything when nothing is selected", () => {
    expect(filterDesignHistory(merged, null).map((e) => e.id)).toEqual(["m1", "e1", "e2"]);
  });
  it("keeps only the selected screen's events when a screen is selected", () => {
    expect(filterDesignHistory(merged, "s1").map((e) => e.id)).toEqual(["e1"]);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- design-history`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

export type DesignHistoryEntry =
  | { type: "message"; id: string; createdAt: string; message: RoomMessage }
  | { type: "event"; id: string; createdAt: string; event: DesignScreenEvent };

// The Canvas history feed: the room conversation unified with design events, one
// chronological list. Deterministic (createdAt then id) so renders are stable.
export function mergeDesignHistory(
  messages: RoomMessage[],
  events: DesignScreenEvent[],
): DesignHistoryEntry[] {
  const entries: DesignHistoryEntry[] = [
    ...messages.map((message): DesignHistoryEntry => ({
      type: "message", id: message.id, createdAt: message.createdAt, message,
    })),
    ...events.map((event): DesignHistoryEntry => ({
      type: "event", id: event.id, createdAt: event.createdAt, event,
    })),
  ];
  return entries.sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      : a.createdAt < b.createdAt ? -1 : 1,
  );
}

// Deselected shows the whole feed. With a screen selected the drawer filters to
// that screen -- its design-event timeline (the deterministic per-screen source
// the events table exists to provide). Room-level messages are not screen-scoped,
// so they fall away under a screen filter.
export function filterDesignHistory(
  entries: DesignHistoryEntry[],
  selectedScreenId: string | null,
): DesignHistoryEntry[] {
  if (selectedScreenId === null) return entries;
  return entries.filter(
    (entry) => entry.type === "event" && entry.event.screenId === selectedScreenId,
  );
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- design-history`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/design-history.ts apps/web/src/features/design/design-history.test.ts
git commit -m "feat(web): pure design-history merge + per-screen filter"
```

---

### Task 8: History drawer component

**Files:**
- Create: `apps/web/src/features/design/components/history-drawer.tsx` + `apps/web/src/features/design/components/history-drawer.test.tsx`

**Interfaces:**
- Consumes: `listRoomMessages` (`@/features/rooms/actions`), `listRoomDesignEvents` (Task 6), `mergeDesignHistory`/`filterDesignHistory`/`DesignHistoryEntry` (Task 7), `RoomMessage`.
- Produces: `function HistoryDrawer(props: { roomId: string; selectedScreenId: string | null; open: boolean; onClose: () => void; loadMessages?: (roomId: string) => Promise<RoomMessage[]>; loadEvents?: (roomId: string) => Promise<DesignScreenEvent[]> }): JSX.Element | null`. The two loaders are dependency-injected with real defaults (the `Conversation` component's testability convention) so the component test needs no network. Renders `null` when `open` is false.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HistoryDrawer } from "./history-drawer";
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

const ROOM = "11111111-1111-1111-1111-111111111111";
const messages = [{ id: "m1", body: "Build a pick-plan screen", authorType: "human", createdAt: "2026-08-14T10:00:00.000Z" }] as unknown as RoomMessage[];
const events = [
  { id: "e1", roomId: ROOM, screenId: "s1", kind: "generation_started", messageId: null, taskId: null, versionId: null, actor: null, createdAt: "2026-08-14T10:01:00.000Z" },
  { id: "e2", roomId: ROOM, screenId: "s2", kind: "version_created", messageId: null, taskId: null, versionId: null, actor: null, createdAt: "2026-08-14T10:02:00.000Z" },
] as unknown as DesignScreenEvent[];

const load = { loadMessages: vi.fn(async () => messages), loadEvents: vi.fn(async () => events) };

describe("HistoryDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<HistoryDrawer roomId={ROOM} selectedScreenId={null} open={false} onClose={() => {}} {...load} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows the unified feed when nothing is selected", async () => {
    render(<HistoryDrawer roomId={ROOM} selectedScreenId={null} open onClose={() => {}} {...load} />);
    await waitFor(() => expect(screen.getByText("Build a pick-plan screen")).toBeInTheDocument());
    expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument();
    expect(screen.getByTestId("history-entry-e2")).toBeInTheDocument();
  });
  it("filters to the selected screen's events", async () => {
    render(<HistoryDrawer roomId={ROOM} selectedScreenId="s1" open onClose={() => {}} {...load} />);
    await waitFor(() => expect(screen.getByTestId("history-entry-e1")).toBeInTheDocument());
    expect(screen.queryByTestId("history-entry-e2")).not.toBeInTheDocument();
    expect(screen.queryByText("Build a pick-plan screen")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- history-drawer`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Build the panel from `@astryxdesign/core` primitives only (`VStack`/`HStack`/`Heading`/`Text`/`Card`/`Divider`/`Button`/`Icon`), following `stage-coaching-panel.tsx` and `room-inspector.tsx`. Fixed-width right column (`const DRAWER_WIDTH = 340`). Load both sources in an effect on `open`; hold `messages`/`events` state; compute `filterDesignHistory(mergeDesignHistory(messages, events), selectedScreenId)` with `useMemo`. Render each entry:
- `type === "message"`: author + body (reuse the plainest existing message row primitives; a `Text` body is sufficient for slice 3c — do not import the full `Conversation` bubble).
- `type === "event"`: a one-line label per `kind` via a pure `designEventLabel(kind)` local map (`generation_started → "Generating…"`, `version_created → "New version"`, `version_promoted → "Promoted"`, `generation_failed → "Generation failed"`, `restored → "Restored a version"`, `stale_candidate → "Kept as a stale candidate"`, `message → "Message"`), timestamped.

Each row gets `data-testid={`history-entry-${entry.id}`}`. A header row shows "History" + a close `Button` (`onClose`) and, when `selectedScreenId` is set, a "Showing one screen" affordance. Comply with `check:astryx` (no bare px in source — put `DRAWER_WIDTH` numbers in a style object, not literal `px` strings).

```tsx
const DESIGN_EVENT_LABEL: Record<DesignScreenEventKind, string> = {
  message: "Message",
  generation_started: "Generating…",
  version_created: "New version",
  version_promoted: "Promoted",
  generation_failed: "Generation failed",
  restored: "Restored a version",
  stale_candidate: "Kept as a stale candidate",
};
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- history-drawer` then `pnpm --filter web check:astryx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/components/history-drawer.tsx apps/web/src/features/design/components/history-drawer.test.tsx
git commit -m "feat(web): unified History drawer — conversation + design events, screen-filtered"
```

---

### Task 9: Live design-events subscription + Canvas wiring

**Files:**
- Create: `apps/web/src/features/design/design-events-subscription.ts` + `apps/web/src/features/design/design-events-subscription.test.ts`
- Modify: `apps/web/src/features/design/components/history-drawer.tsx` (subscribe live), `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` (mount the drawer + toggle)

**Interfaces:**
- Produces: `function subscribeToDesignEvents(roomId: string, onEvent: (event: DesignScreenEvent) => void): () => void` — mirrors `subscribeToProductionRoom`: `await supabase.realtime.setAuth()`, then a `postgres_changes` INSERT listener on `public.design_screen_events`, `filter: room_id=eq.${roomId}`, on a dedicated topic `design-events:${roomId}`; on each `SUBSCRIBED` handshake re-list via `listRoomDesignEvents` for self-healing. Returns an unsubscribe teardown. Maps the raw INSERT row snake→camel through `DesignScreenEventSchema` (drop rows that fail to parse).

- [ ] **Step 1: Write the failing subscription test**

Mirror the approach used to test the message subscription (fake `@/lib/supabase/client` returning a channel stub whose `.on(...).subscribe(cb)` captures the handler; assert the INSERT config table/filter/topic; drive an INSERT event and assert `onEvent` gets the camel-mapped `DesignScreenEvent`; assert teardown calls `removeChannel`).

```ts
// asserts: channel topic `design-events:${ROOM}`, table "design_screen_events",
// filter `room_id=eq.${ROOM}`, event "INSERT"; a raw snake_case row is delivered
// to onEvent as a parsed DesignScreenEvent; the teardown removes the channel.
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web test -- design-events-subscription`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `subscribeToDesignEvents`**

Copy `room-message-subscription.ts`'s structure exactly (the `active` flag, `setAuth()` await, `recover()` on `SUBSCRIBED`, `removeChannel` teardown, dedicated topic) with the events table/filter and a `DesignScreenEventSchema` mapping of `event.new`.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter web test -- design-events-subscription`
Expected: PASS.

- [ ] **Step 5: Wire live updates into the drawer**

In `history-drawer.tsx`, when `open`, subscribe to `subscribeToDesignEvents(roomId, onEvent)` and to the room's messages (reuse the existing `subscribeToProductionRoom`, or the `roomSubscription` prop convention `Conversation` uses). Merge each event/message into state deduped by `id` (a `reconcile`-style upsert). Tear down on close/unmount. Keep both subscriptions dependency-injectable (`subscribeEvents?` / `subscribeMessages?` props defaulting to the real ones) so the Task 8 tests stay offline. Extend `history-drawer.test.tsx` with a case that drives a subscribed event and asserts it appears.

- [ ] **Step 6: Mount the drawer on the Canvas**

In `user-flow-trial-canvas.tsx`, add local `const [historyOpen, setHistoryOpen] = useState(false)`, a "History" toggle control (a `Button` in the existing canvas control cluster — see where ▶ Preview / composer mount), and render `<HistoryDrawer roomId={roomId} selectedScreenId={sketchSelection?.targetScreenId ?? null} open={historyOpen} onClose={() => setHistoryOpen(false)} />` as a sibling of `<Tldraw>` inside the canvas container (right column). `sketchSelection` already exists (line 124). Ensure the drawer overlays without breaking the tldraw layout (position it in the flex/grid container the canvas root uses).

- [ ] **Step 7: Run → pass**

Run: `pnpm --filter web test -- history-drawer design-events-subscription user-flow-trial-canvas` then `pnpm --filter web check:astryx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/design/design-events-subscription.ts apps/web/src/features/design/design-events-subscription.test.ts apps/web/src/features/design/components/history-drawer.tsx apps/web/src/features/design/components/history-drawer.test.tsx apps/web/src/features/canvas/user-flow-trial-canvas.tsx
git commit -m "feat(web): live design-events subscription + mount History drawer on the Canvas"
```

---

### Task 10: End-to-end — seeding + history

**Files:**
- Create: `e2e/design-history-seed.spec.ts`

**Interfaces:** none produced. Drives the real UI through the fake gateway/provider, following `e2e/design-sketch-generate.spec.ts` and `e2e/design-canvas.spec.ts` (same fixture harness, `isRoomFakeEnabled` path, `data-testid` selectors).

- [ ] **Step 1: Write the failing e2e**

```ts
import { test, expect } from "@playwright/test";
// Reuse the design-room fixture helpers (seed a design-stage room whose PRD
// carries a userJourneys flow with >= 1 action node), as in design-canvas.spec.ts.

test("flow action nodes seed screen frames on the Canvas", async ({ page }) => {
  // open the room's Canvas tab (?tab=user-flows) as an editor
  // expect a frame projecting the seeded screen (by name = the action node label)
  await expect(page.getByText("Pick plan")).toBeVisible();
});

test("History drawer shows generation events and filters to the selected screen", async ({ page }) => {
  // open Canvas; open the composer; generate a screen; wait for it to build
  // open History -> a generation event row is visible
  await page.getByRole("button", { name: /history/i }).click();
  await expect(page.getByText(/New version|Generating/i)).toBeVisible();
  // select the screen frame -> the drawer filters to its events (conversation drops)
  // select empty space -> the conversation message reappears
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter web e2e -- design-history-seed` (or the repo's Playwright invocation used by `design-sketch-generate.spec.ts`).
Expected: FAIL — behavior not wired end to end / selectors missing.

- [ ] **Step 3: Make it pass**

Ensure the fake path (`e2e-fake.ts`) records generation events so `fakeListRoomDesignEvents` returns them, that the seed action's fake creates canvas screens the fake canvas read surfaces, and that the drawer's `data-testid`s and the History toggle match the spec's selectors. Fix any wiring gaps surfaced (e.g. selection→filter reactivity — reuse the slice-3b `editorReady`-dep pattern that made selection reactive).

- [ ] **Step 4: Run → pass**

Run: the same Playwright command.
Expected: PASS.

- [ ] **Step 5: Full-suite gate + commit**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/contracts test && pnpm --filter web test && pnpm --filter web check:astryx && supabase test db`
Expected: all PASS.

```bash
git add e2e/design-history-seed.spec.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "test(e2e): flow seeding projects frames; History shows and filters design events"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| History — right drawer; conversation unified with design events (§124–126, §344–357) | 5–9 |
| With a screen selected it filters to that screen; deselected shows everything (§124–126) | 7 (pure), 8–9 (UI) |
| `design_screen_events` is the deterministic per-screen source (§346) | 6 (reader), 7 (filter) |
| The Define flow seeds which screens exist (§50 decision 4, §491 plan-split) | 1–4 |
| Action nodes → screens 1:1; system/decision produce no screen (§244–245) | 2 (`planScreenSeeds`) |
| Screen row authoritative; frame is a recoverable projection (§128–166) | 4 (seed → reconcile projects) |
| Idempotent / multiplayer-safe seeding (implied by authoritative-row model) | 1 (index + `on conflict`), 2 (diff), 4 (one-shot gate) |
| RLS/tenant isolation + pgTAP for new SQL (§440–441) | 1 |

Deliberately **out of slice 3c** (documented boundaries, not gaps): the ▶ Preview control and per-screen ▶ (slice 3a); the composer's selection-awareness (slice 3b); Figma cards, readiness staleness, handoff snapshot (slice 4); writers for the `message`/`generation_failed` event kinds; aligning seeded screens under their flow nodes (positions are a deterministic row — a noted follow-up).

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The two spots that reference existing-but-unread code — the `e2e-fake.ts` fake-store accessors (Task 3/6) and the exact canvas control-cluster location for the History toggle (Task 9 Step 6) — are flagged with a grep instruction rather than invented signatures, because they must match code the implementer will open. Every pure engine, contract, reader, and action carries complete code.

**3. Type consistency:** `ScreenSeed`/`ScreenSeedSchema` (Task 2) are consumed unchanged by Task 3's `SeedInput` and the canvas effect (Task 4). `seedDesignScreensFromFlow` returns `CanvasScreen[]` (canvas-screen-reader's exact type), which merges into `effectiveCanvasScreens` and feeds `reconcileScreenFrames`/`screenFrameRecord` unchanged. `DesignScreenEvent`/`DesignScreenEventSchema` (Task 5) are the single event type used by the reader (6), the pure history (7), the drawer (8), and the subscription (9). `DesignHistoryEntry` is defined once (7) and consumed by 8. `shouldSeedDesignScreens` (4) mirrors `shouldSeedJourneyFlow`'s shape.

---

## Execution note

Both parts land behind the existing Canvas surface with no schema-shape or gateway change; Part A (Tasks 1–4) and Part B (Tasks 5–9) are independent and could be executed in either order, with Task 10 last. Part B Task 5 (contract) is the only cross-package prerequisite within Part B.
