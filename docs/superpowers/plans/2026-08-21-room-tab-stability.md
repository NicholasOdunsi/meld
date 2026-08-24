# Room Tab Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan inline task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Room tab create/close operations converge cleanly across optimistic state and realtime while enforcing Overview plus five work tabs.

**Architecture:** A shared work-tab limit is enforced in the client, fake backend, and a serialized PostgreSQL insert trigger. Client tab state upserts by ID and filters pending closes until realtime confirms deletion, so event order cannot duplicate or resurrect tabs.

**Tech Stack:** React, Next.js Server Actions, Supabase Realtime/PostgreSQL, Vitest.

## Global Constraints

- Overview is pinned and does not count toward the five work tabs.
- The temporary Conversation tab does not count toward the limit.
- Keep the current development server in use.
- Run only focused tests, the Astryx convention check, and diff validation.

---

### Task 1: Define and enforce the authoritative work-tab limit

**Files:**
- Create: `apps/web/src/features/rooms/room-tab-limit.ts`
- Create: `supabase/migrations/202608210001_room_tab_limit.sql`
- Modify: `apps/web/src/features/rooms/fake-backend.ts`
- Test: `apps/web/src/features/rooms/fake-backend.test.ts`

**Interfaces:**
- Produces: `MAX_ROOM_WORK_TABS = 5`.
- Produces: PostgreSQL trigger `room_tab_limit` that serializes inserts per Room, assigns the next position, and rejects a sixth row.

- [ ] Add `MAX_ROOM_WORK_TABS` and focused fake-backend coverage that the sixth create rejects without changing the existing five rows.
- [ ] Apply the constant in `createFakeRoomBackend().createRoomTab` before pushing a new tab.
- [ ] Add the PostgreSQL trigger using `pg_advisory_xact_lock(hashtextextended(room_id::text, 0))`, `count(*)`, and `max(position) + 1` in one transaction.

### Task 2: Make client tab mutations order-independent

**Files:**
- Modify: `apps/web/src/features/rooms/components/room-plane.tsx`
- Test: `apps/web/src/features/rooms/components/room-plane.test.tsx`

**Interfaces:**
- Consumes: `MAX_ROOM_WORK_TABS`.
- Produces: ID-based tab upsert for create responses and a pending-close ID set filtering realtime snapshots.

- [ ] Add a focused create test where the same tab is already present and assert one rendered tab after the create response.
- [ ] Replace create-response append operations with an ID-based upsert sorted by `position` then `id`.
- [ ] Mark a tab pending before optimistic close, filter realtime tabs by that set, clear confirmed IDs after realtime deletion, and restore visibility on close failure.
- [ ] Hide the add button and refuse new-tab and pop-out creation once five stored work tabs are present.
- [ ] Add focused tests for the hidden add button and blocked pop-out at five work tabs.

### Task 3: Make failed deletes observable

**Files:**
- Modify: `apps/web/src/features/rooms/room-tabs-repository.ts`
- Modify: `apps/web/src/features/rooms/fake-backend.ts`

**Interfaces:**
- Produces: `closeRoomTab` rejects when no tab row was deleted, allowing the client pending-close marker to roll back.

- [ ] Return deleted IDs from the Supabase delete and throw when the result is empty.
- [ ] Make the fake backend throw when no matching tab exists.

### Task 4: Focused verification

**Files:**
- No additional files.

- [ ] Run the Room plane and fake backend test files only with Node 22.
- [ ] Run `pnpm run check:astryx` and `git diff --check` for touched files.
- [ ] Apply the new local Supabase migration without resetting data.
