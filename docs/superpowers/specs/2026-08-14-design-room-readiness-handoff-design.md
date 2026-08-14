# Design Room slice 4b — Stage readiness rewiring & Development handoff

## Context

The second half of slice 4 of the Design Room (`docs/superpowers/specs/2026-08-13-design-room-design.md`, Stage readiness §393–415, Handoff §417–423). 4a (the Figma lane) is complete and merged into the branch. 4b is the **last** Design Room slice.

Two related pieces, one combined slice (decided in brainstorming):
1. **Readiness rewiring** — the Design-stage checklist counts a built screen **or** a Figma reference, absorbs `flows_refined`, and invalidates a stale "Design reviewed".
2. **Development handoff** — moving to Development writes an immutable `design_handoff_snapshots` row, and the Development panel renders a compact summary *from that snapshot*.

**Grounding (already exists):**
- `StageReadinessSignals` + the pure `computeStageChecklist` engine — `apps/web/src/features/rooms/stage-readiness.ts`. Signals are assembled server-side in `getRoomPageData` (`apps/web/src/features/rooms/supabase-backend.ts`, the `Promise.all` count-query block) and passed to `stage-coaching-panel.tsx`.
- `design_handoff_snapshots` table + immutability trigger (`design_handoff_immutable`) + participant-SELECT RLS — `supabase/migrations/202608130009_design_references_handoffs.sql:112`. **No create RPC exists; INSERT is granted to no role** — 4b must add a `security definer` RPC.
- `set_room_stage(target_room_id, target_stage)` RPC — `supabase/migrations/202608110003_room_stage.sql:34`. Generic: locks the room, authorizes, no-ops if already at target, updates `rooms.stage`, inserts a `room_stage_events` row. No Design→Development branch today.
- `room_stage_checklist_items` (`room_id, item_key, checked_by, checked_at`) — `supabase/migrations/202608120006_room_stage_checklist.sql`. A row exists only when confirmed; `set_room_checklist_item` toggles it. `manualChecksFromKeys` folds present-keys → booleans (no timestamp awareness today; the read selects only `item_key`).
- `design_screen_versions.created_at` (immutable) and `design_references.created_at` — the two design-revision timestamps. `prds.version` (max) is the PRD revision. `design_system_profiles` holds the active profile-version pointer.

## Goal

The Design stage is "ready to move on" when there are screens **or** a Figma reference and the design has been reviewed — and that review is invalidated automatically when the design changes after it. Moving to Development captures an immutable snapshot of exactly what was handed over, rendered as a compact summary so later edits can't retroactively rewrite the handoff.

## Decisions (from brainstorming)

1. **New auto signals** `builtScreenCount` + `designReferenceCount`; "Screens designed" is satisfied by either.
2. **`flows_refined` is absorbed** into "Screens designed" — dropped as a separate required item, so a Figma-only room isn't gated on drawing a flow.
3. **The manual key stays `design_reviewed`** ("Design reviewed") — not "Prototype reviewed" (wrong for a Figma-only room).
4. **Staleness lives in the pure engine** — signals carry `designReviewedAt` + `latestDesignRevisionAt`; the engine compares.
5. **The handoff snapshot is written atomically inside `set_room_stage`** on the `design → development` branch, via a `security definer` `create_design_handoff_snapshot` RPC that assembles the manifest in SQL.
6. **Minimal handoff view** — a compact summary rendered from the snapshot + a "Preview prototype" link. No dedicated handoff surface (that is out of v1).

## Readiness rewiring

### New signals

`StageReadinessSignals` (`stage-readiness.ts`) gains:
- `builtScreenCount: number` — `design_screens` where `state='built'` and `deleted_at is null`.
- `designReferenceCount: number` — `design_references` for the room.
- `hasDesignProfile: boolean` — an active `design_system_profiles` version exists for the workspace.
- `designReviewedAt: string | null` — the `checked_at` of the `design_reviewed` row (null when unchecked).
- `latestDesignRevisionAt: string | null` — `MAX(created_at)` across `design_screen_versions` and `design_references` for the room (null when neither exists).

All are populated in `getRoomPageData`'s count/query block (mirroring the existing `decisionsResult` `{ count: "exact", head: true }` pattern and the `prdStatusResult` max-version select), added to the error guard and the signals object literal, and mirrored in the fake/e2e backends + `supabase-backend.test.ts` fixtures. Reading `checked_at` requires adding it to the `room_stage_checklist_items` select (currently `item_key`-only).

`designAssetCount` remains (still used for the Development summary's "Design assets" line and unaffected consumers).

### The Design-stage checklist (pure engine)

- **"Screens designed"** (auto, **required**): done when `builtScreenCount > 0 || designReferenceCount > 0`. Detail reflects the count ("2 screens", "1 Figma reference", or "none yet"). This **replaces** the current design-stage reliance on `designAssetCount`/`userFlowCount` and **absorbs `flows_refined`** — the separate `flows_refined` required item is removed from the Design stage.
- **"Design reviewed"** (manual, **required**, key `design_reviewed`): done when the row is present **and** not stale (see below).
- **"Design system connected"** (auto, **supporting / not required**): done when `hasDesignProfile`. Never gates the move.

### Staleness

`design_reviewed` is treated as **not done when `designReviewedAt` is older than `latestDesignRevisionAt`** (a screen version or a design reference created after the review). The pure rule:

```
reviewed = manualChecks.design_reviewed === true
fresh    = designReviewedAt !== null
           && (latestDesignRevisionAt === null || designReviewedAt >= latestDesignRevisionAt)
done     = reviewed && fresh
```

When `reviewed` but not `fresh`, the item renders `done: false` with detail **"design changed since review"**. The checklist row is never deleted, so re-confirming is one tap. This comparison stays inside `stage-readiness.ts` (given the two timestamps as signals) so it is exhaustively unit-testable, matching the file's pure-function design.

## Development handoff

### The snapshot RPC

A new migration adds `create_design_handoff_snapshot(target_room_id uuid) returns public.design_handoff_snapshots`, `security definer`, `set search_path = ''`, gated on `can_edit_room` (mirroring `add_design_reference`). It assembles and inserts one row:

- `manifest_json` — `jsonb_build_object('screens', jsonb_agg(...))` over the room's built screens: `{ screenId, name, currentVersionId }` for each `design_screens` with `state='built'`, `deleted_at is null`, ordered by `canvas_x`. Bounded well inside the table's 256 KiB `manifest_json` check.
- `start_screen_id` — the earliest built screen (by `canvas_x`, matching `prototype-reader.ts`'s current start-screen behavior), or null if none. Binding the start to the flow's start node (which would require parsing the PRD's `userJourneys` JSON in SQL) is a deliberate follow-up, not v1 — the prototype viewer already applies its own start logic.
- `profile_version_id` — the workspace's active design-system profile version (null if none).
- `prd_revision` — `max(version)` from `prds` for the room (null if none).
- `workspace_id` — resolved from the room; `created_by = auth.uid()`.

### Atomic write on the transition

`set_room_stage` gains a branch: after the stage `update` and the `room_stage_events` insert, **if `current_room.stage = 'design'` and `target_stage = 'development'`**, call `create_design_handoff_snapshot(target_room_id)` in the same transaction. Because `set_room_stage` already no-ops when the room is already at the target, the snapshot is written exactly once per real Design→Development transition; re-entering Development later (after a Back-to-Design) writes a fresh snapshot capturing the then-current state. The handoff view always renders the **latest** snapshot.

> The write lives in the DB RPC (not the app layer) so it is transactional with the stage change, cannot be skipped by a client, and keeps manifest-assembly logic in one place. No app-layer change to `setRoomStage` is required.

### The handoff view

- A `getRoomDesignHandoff(roomId): Promise<DesignHandoffView | null>` reader loads the latest `design_handoff_snapshots` row (RLS-gated), shaping `manifest_json` + `start_screen_id` + `profile_version_id` + `prd_revision` + `created_at` into a typed view. Threaded through `getRoomPageData` → `page.tsx` → the panel.
- The **Development terminal branch** of `stage-coaching-panel.tsx` renders a compact summary **from the snapshot**: "N screens handed off · start: `<name>` · design system `<profile label or "neutral default">` · PRD rev N · `<timestamp>`", plus a **"Preview prototype"** link (routes to the existing prototype viewer, `?tab=prototype`). Screen names come from the manifest, not live rows — later edits cannot change what the handoff shows. If no snapshot exists yet (e.g. a room that predates 4b), the panel falls back to today's read-only summary.
- Astryx-clean (`stage-coaching-panel.tsx` already has pre-existing raw-`div` violations; do **not** add new ones — use `@astryxdesign/core` primitives for the new summary rows, following `room-inspector.tsx`).

## Testing

- **Pure engine, exhaustively** (`stage-readiness.test.ts`): "Screens designed" done via built screen only / reference only / both / neither; `flows_refined` no longer a required Design item; "Design system connected" supporting and non-gating; the staleness matrix — fresh review, stale review ("design changed since review", not done), never reviewed, no design revisions (fresh by default).
- **pgTAP:** `create_design_handoff_snapshot` — manifest shape (built screens only, ordered), start-screen resolution (earliest built screen vs null), `prd_revision`/`profile_version_id` capture, `can_edit_room` gate, immutability (update/delete raises). And `set_room_stage`: a Design→Development move writes exactly one snapshot atomically; other transitions (e.g. discovery→define, or development→design) write none; a no-op re-move writes none.
- **Signal assembly:** `getRoomPageData` count/timestamp queries covered by the `supabase-backend.test.ts` fixtures (built-screen count, reference count, latest-revision MAX, `checked_at`).
- **e2e** (fake path): build a screen → mark "Design reviewed" → move to Development → the handoff summary shows the manifest + prototype link; then (in a Design-stage variant) edit/regenerate a screen after review → "design changed since review" reappears and the move re-gates.

## Scope

**In v1 (4b):** the two new count signals + `hasDesignProfile` + the two staleness timestamps; the rewired Design checklist (built-or-reference, flows_refined absorbed, supporting design-system item); staleness invalidation; the `create_design_handoff_snapshot` RPC wired atomically into `set_room_stage`; the handoff loader + compact snapshot summary + prototype link.

**Deliberately not in 4b:** a dedicated handoff surface / manifest gallery (brainstorm option B); handoff diffing or re-handoff comparison; any change to the prototype viewer itself; Figma-reference realtime; the design-system-profile authoring UI (a separate concern — 4b only *reads* whether an active profile exists).

## Plan note

One implementation plan. Likely task shape: the new signals + `getRoomPageData` wiring → the pure Design-checklist rewrite + staleness (engine + tests) → the `create_design_handoff_snapshot` RPC + pgTAP → the `set_room_stage` atomic hook + pgTAP → the `getRoomDesignHandoff` reader + fake → the Development panel summary + prototype link → e2e. This closes the Design Room feature.
