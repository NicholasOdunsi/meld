# Rendered Screens, Automatic Design, Working State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Orion Mac app, a design request is understood automatically (after one short question), the built screen shows as a live-looking card in the chat and on the Canvas, a line shows what Orion is doing, and existing screens appear on the Canvas and in chat.

**Architecture:** The Product Agent proposes a new `design_screen` action; the web bridge (`NativeStreamBridge`) starts the existing `generateDesignScreen` and answers the proposal. The bridge also adds `screens` and `activity` to the stream snapshot and sends each built screen's sandboxed HTML once as its own `screen` message. The Mac renders that HTML offscreen once, caches a PNG per `(screenId, versionId)`, and shows it in a chat card. The Canvas adds a frame (`ds-<screenId>`) for any built design screen that is missing and can focus it.

**Tech Stack:** Next.js/TypeScript + vitest (apps/web), Excalidraw, Supabase Postgres + pgTAP, the connector prompt (apps/connector), SwiftUI/AppKit/WebKit + Swift Testing (apps/mac).

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-15-rendered-screens-design.md`:

- Screen card in chat is a **non-interactive** thumbnail: rendered once in a hidden, **script-disabled** web view; phone screens are 390x844.
- A vague design request gets **exactly one short question** before building; `@Design Agent` skips it.
- Design intent is detected by the **Product Agent** (no separate classifier, no manual toggle).
- Old screens are **only added**: nothing in the database is changed, moved, or deleted.
- Database changes are **additive**; the deploy's migration guard (`scripts/orion-online/migration-guard.mjs`) must pass.
- v1: each design request builds a **new** screen (`screenId` is always `null` from the agent); cards appear in the **main chat only**.
- Environment: Node `22.23.2` (`export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`); web commands run in `apps/web`; Swift commands run in `apps/mac`. Swift code follows the `swiftui-pro` skill.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261115130000_design_screen_proposed_action.sql` (new) | Accept the `design_screen` proposal shape |
| `supabase/tests/room_design_screen_proposed_action.test.sql` (new) | pgTAP for the shape check |
| `packages/contracts/src/rooms.ts` | `design_screen` in `RoomProposedActionSchema` |
| `apps/web/src/features/activity/describe.ts`, `apps/web/src/features/rooms/components/conversation.tsx` | Exhaustive handling of the new kind |
| `apps/connector/src/tasks/product-agent-prompt.ts` | Prompt rule + response schema for `design_screen` |
| `apps/web/src/features/native/screen-feed.ts` (new, server action) | Read `design_screens` for the stream |
| `apps/web/src/features/native/bridge.ts` | Wire types: `StreamScreen`, `StreamActivity`, `screen` message |
| `apps/web/src/features/native/stream-activity.ts` (new) | Pure `deriveActivity` |
| `apps/web/src/features/native/stream-snapshot.ts` | Add `screens` and `activity` to the snapshot |
| `apps/web/src/features/native/native-stream-bridge.tsx` | Run `design_screen` actions, `@Design Agent`, post `screen` documents |
| `apps/web/src/features/canvas-excalidraw/design-screen-board.ts` (new) | Add/find/focus design screens on the board |
| `apps/web/src/features/canvas-excalidraw/load-screen.ts`, `excalidraw-board.tsx` | Server action for built ids; `focusScreen` + backfill |
| `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift` (+ new `StreamScreen.swift`) | Decode `screens`, `activity`; timeline |
| `apps/mac/Sources/OrionAppCore/BridgeMessage.swift` | `.screenDocument` |
| `apps/mac/Sources/Orion/Project/ActivityLine.swift` (new) | The "working" line |
| `apps/mac/Sources/Orion/Project/ScreenCard.swift`, `ScreenCardStore.swift`, `ScreenSnapshotter.swift` (new) | Card, cache, offscreen render |
| `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `Frame/FrameModel.swift`, `Bridge/NativeBridge.swift`, `App/AppDelegate.swift` | Wiring, `openScreenInCanvas` |

---

### Task 1: Database accepts `design_screen`

**Files:**
- Create: `supabase/migrations/20261115130000_design_screen_proposed_action.sql`
- Create: `supabase/tests/room_design_screen_proposed_action.test.sql`

**Interfaces:**
- Produces: `public.room_proposed_action_shape_ok(jsonb)` also returns true for `{"kind":"design_screen","instruction":<1..4000 chars>,"name":<null | 1..80 chars>,"screenId":<null | uuid>}` with exactly those four keys.

- [ ] **Step 1: Write the failing test** — create `supabase/tests/room_design_screen_proposed_action.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"A fintech balance screen","name":null,"screenId":null}'::jsonb),
  'design_screen with null name and screenId is accepted');
select ok(public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"Update it","name":"Balance","screenId":"11111111-1111-4111-8111-111111111111"}'::jsonb),
  'design_screen with a name and an existing screen id is accepted');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x","name":null,"screenId":null,"extra":1}'::jsonb),
  'an extra key is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"   ","name":null,"screenId":null}'::jsonb),
  'a blank instruction is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x","name":null,"screenId":"not-a-uuid"}'::jsonb),
  'a malformed screen id is rejected');
select ok(not public.room_proposed_action_shape_ok(
  '{"kind":"design_screen","instruction":"x"}'::jsonb),
  'missing name and screenId keys are rejected');
select ok(public.room_proposed_action_shape_ok('{"kind":"prd_generate"}'::jsonb),
  'prd_generate still accepted');
select ok(not public.room_proposed_action_shape_ok('{"kind":"task_create"}'::jsonb),
  'unknown kinds are still rejected');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it against a scratch DB and watch it fail**

Use the branch-pure scratch recipe (memory `meld-local-setup` point 15), or if `scratch_t` still exists from earlier work:

```bash
docker exec -i supabase_db_meld psql -h 127.0.0.1 -U supabase_admin -d scratch_t < supabase/tests/room_design_screen_proposed_action.test.sql 2>&1 | grep -E "^ (not )?ok|Looks like"
```

Expected: tests 1 and 2 are `not ok` (current function rejects `design_screen`).

- [ ] **Step 3: Write the migration** — create `supabase/migrations/20261115130000_design_screen_proposed_action.sql`. It re-declares the function from `202608110008_room_proposal_contract.sql` unchanged, plus one new `or` branch:

```sql
-- Let the Product Agent propose building a screen. A strict superset of the
-- previous rule: every shape accepted before is still accepted. The CHECK
-- constraint on public.messages and settlement_room_proposed_action both call
-- this function, so nothing else needs to change.
create or replace function public.room_proposed_action_shape_ok(target_action jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    target_action in (
      '{"kind":"prd_generate"}'::jsonb,
      '{"kind":"prd_revise"}'::jsonb,
      '{"kind":"user_flow_generate"}'::jsonb
    )
    or (
      target_action = jsonb_build_object(
        'kind', 'decision_capture',
        'summary', target_action -> 'summary',
        'sourceMessageId', target_action -> 'sourceMessageId'
      )
      and jsonb_typeof(target_action -> 'summary') = 'string'
      and char_length(
        regexp_replace(
          target_action ->> 'summary',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 5000
      and (
        jsonb_typeof(target_action -> 'sourceMessageId') = 'null'
        or (
          jsonb_typeof(target_action -> 'sourceMessageId') = 'string'
          and (target_action ->> 'sourceMessageId') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    )
    or (
      target_action = jsonb_build_object(
        'kind', 'design_screen',
        'instruction', target_action -> 'instruction',
        'name', target_action -> 'name',
        'screenId', target_action -> 'screenId'
      )
      and jsonb_typeof(target_action -> 'instruction') = 'string'
      and char_length(
        regexp_replace(
          target_action ->> 'instruction',
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 4000
      and (
        jsonb_typeof(target_action -> 'name') = 'null'
        or (
          jsonb_typeof(target_action -> 'name') = 'string'
          and char_length(
            regexp_replace(
              target_action ->> 'name',
              '^[[:space:]]+|[[:space:]]+$',
              '',
              'g'
            )
          ) between 1 and 80
        )
      )
      and (
        jsonb_typeof(target_action -> 'screenId') = 'null'
        or (
          jsonb_typeof(target_action -> 'screenId') = 'string'
          and (target_action ->> 'screenId') ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    ),
    false
  );
$$;
```

(The "missing keys" case works because `jsonb_build_object('name', target_action -> 'name')` yields `null` for an absent key, so the equality with the input fails.)

- [ ] **Step 4: Apply and run the test** — apply the new migration to the scratch DB, then re-run Step 2's command:

```bash
docker exec -i supabase_db_meld psql -U postgres -d scratch_t -q -v ON_ERROR_STOP=1 < supabase/migrations/20261115130000_design_screen_proposed_action.sql
docker exec -i supabase_db_meld psql -h 127.0.0.1 -U supabase_admin -d scratch_t < supabase/tests/room_design_screen_proposed_action.test.sql 2>&1 | grep -E "^ (not )?ok|Looks like"
```

Expected: eight `ok` lines.

- [ ] **Step 5: Migration guard and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
node scripts/orion-online/migration-guard.mjs supabase/migrations/20261115130000_design_screen_proposed_action.sql && echo guard-ok
pnpm test:sql
git add supabase && git commit -m "feat(db): accept the design_screen proposal shape" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: `guard-ok`, `test:sql` exits 0.

---

### Task 2: Contract and web handling of the new kind

**Files:**
- Modify: `packages/contracts/src/rooms.ts:34-45`
- Test: `packages/contracts/src/rooms.test.ts`
- Modify: `apps/web/src/features/activity/describe.ts:11-16`
- Modify: `apps/web/src/features/rooms/components/conversation.tsx` (`isProposalOffered`, ~line 125) and any `RoomProposalAction` switch that `pnpm typecheck` flags

**Interfaces:**
- Produces: `RoomProposedAction` includes `{ kind: "design_screen"; instruction: string; name: string | null; screenId: string | null }`.

- [ ] **Step 1: Write the failing test** — add to `packages/contracts/src/rooms.test.ts` (inside the existing top-level `describe`, or a new one if none wraps the file):

```ts
import { RoomProposedActionSchema } from "./rooms";

describe("design_screen proposed action", () => {
  it("accepts a brief with null name and screen id", () => {
    const parsed = RoomProposedActionSchema.parse({
      kind: "design_screen",
      instruction: "  A fintech balance screen  ",
      name: null,
      screenId: null,
    });
    expect(parsed).toEqual({
      kind: "design_screen",
      instruction: "A fintech balance screen",
      name: null,
      screenId: null,
    });
  });

  it("rejects an empty brief, extra keys and a bad screen id", () => {
    const base = { kind: "design_screen", instruction: "x", name: null, screenId: null };
    expect(RoomProposedActionSchema.safeParse({ ...base, instruction: "  " }).success).toBe(false);
    expect(RoomProposedActionSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(RoomProposedActionSchema.safeParse({ ...base, screenId: "nope" }).success).toBe(false);
  });
});
```

If `RoomProposedActionSchema`/`describe`/`expect`/`it` are already imported at the top of the file, do not duplicate the imports.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd packages/contracts && pnpm exec vitest run src/rooms.test.ts`
Expected: FAIL (invalid discriminator `design_screen`).

- [ ] **Step 3: Add the schema branch** — in `packages/contracts/src/rooms.ts`, add as the last member of the discriminated union (after `decision_capture`):

```ts
  z
    .object({
      kind: z.literal("design_screen"),
      instruction: z.string().trim().min(1).max(4_000),
      name: z.string().trim().min(1).max(80).nullable(),
      screenId: z.string().uuid().nullable(),
    })
    .strict(),
```

- [ ] **Step 4: Run the test, then typecheck to find every exhaustive spot**

```bash
cd packages/contracts && pnpm exec vitest run src/rooms.test.ts
cd ../.. && pnpm typecheck 2>&1 | tail -30
```

Expected: contracts test passes; typecheck reports errors at the places that index by proposal kind.

- [ ] **Step 5: Fix each flagged place** — these behaviours:
  - `apps/web/src/features/activity/describe.ts` titles map: add `design_screen: "Design a screen?"`.
  - `apps/web/src/features/rooms/components/conversation.tsx` `isProposalOffered`: add `case "design_screen": return false;` (the browser shows no card; the Mac app runs it automatically).
  - Any `RoomProposalAction` / label switch flagged by the compiler: for `design_screen` return `null` (render nothing).

Re-run `pnpm typecheck` until clean, then `cd apps/web && pnpm exec vitest run src/features/activity src/features/rooms` and expect all pass.

- [ ] **Step 6: Commit**

```bash
git add packages apps/web && git commit -m "feat(contracts): design_screen proposed action" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Product Agent learns to propose a design

**Files:**
- Modify: `apps/connector/src/tasks/product-agent-prompt.ts` (prompt text near line 26, response schema near line 250, `PRODUCT_AGENT_PROMPT_VERSION` line 7)
- Test: `apps/connector/src/tasks/product-agent-prompt.test.ts`

**Interfaces:**
- Consumes: `RoomProposedActionSchema` from Task 2.
- Produces: the prompt rule and `proposedAction` schema branch for `design_screen`.

- [ ] **Step 1: Write the failing tests** — add inside the existing `describe` in `product-agent-prompt.test.ts`:

```ts
  it("tells the agent when to propose a design and to ask only one question first", () => {
    expect(PRODUCT_AGENT_SYSTEM_PROMPT).toContain('"kind": "design_screen"');
    expect(PRODUCT_AGENT_SYSTEM_PROMPT).toContain("ONE short question");
  });

  it("allows a design_screen proposedAction in both response schemas", () => {
    for (const schema of [ROOM_REPLY_RESPONSE_SCHEMA_STRICT, ROOM_REPLY_RESPONSE_SCHEMA_LENIENT]) {
      expect(JSON.stringify(schema)).toContain("design_screen");
    }
  });

  it("validates a design_screen result with the shared contract", () => {
    const parsed = RoomProposedActionSchema.safeParse({
      kind: "design_screen",
      instruction: "A fintech balance screen",
      name: "Balance",
      screenId: null,
    });
    expect(parsed.success).toBe(true);
  });
```

Add `RoomProposedActionSchema` to the existing `@meld/contracts` import list at the top of the file. If a test in this file asserts the exact `PRODUCT_AGENT_PROMPT_VERSION` value, update that expectation to `"room-reply-v8"` in Step 3.

- [ ] **Step 2: Run and watch fail**

Run: `cd apps/connector && pnpm exec vitest run src/tasks/product-agent-prompt.test.ts`
Expected: the first two new tests FAIL.

- [ ] **Step 3: Implement**

In `product-agent-prompt.ts`:
1. Change `PRODUCT_AGENT_PROMPT_VERSION` to `"room-reply-v8"`.
2. In the system prompt, directly after the `user_flow_generate` bullet, add this bullet (inside the template literal, matching the neighbouring bullets' style):

```
- When the person wants a screen designed (a new screen, or a redesign they describe), set proposedAction to { "kind": "design_screen", "instruction": "<a clear brief for a designer: purpose, who it is for, key content, tone>", "name": "<short screen name>" or null, "screenId": null }. If the request is too thin to build from (for example just "design a mobile screen"), do NOT propose yet: ask ONE short question about what the screen should help someone do, send proposedAction null, and propose on the next turn once they answer. Never ask more than one question before proposing. Do not use design_screen for opinions about design, PRD wording, or user-flow mapping.
```

3. In the response schema's `proposedAction.anyOf` list, add this branch immediately before `{ type: "null" }`:

```ts
      {
        type: "object",
        additionalProperties: false,
        required: ["kind", "instruction", "name", "screenId"],
        properties: {
          kind: { type: "string", enum: ["design_screen"] },
          instruction: { type: "string", minLength: 1, maxLength: 4000 },
          name: { anyOf: [{ type: "string" }, { type: "null" }] },
          screenId: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
```

- [ ] **Step 4: Run the connector tests**

Run: `cd apps/connector && pnpm exec vitest run src/tasks`
Expected: all pass (including the strict/lenient schema tests that already exist).

- [ ] **Step 5: Commit**

```bash
git add apps/connector && git commit -m "feat(connector): Product Agent can propose designing a screen" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire types, screen feed and activity (web)

**Files:**
- Modify: `apps/web/src/features/native/bridge.ts` (types)
- Create: `apps/web/src/features/native/screen-feed.ts`
- Create: `apps/web/src/features/native/stream-activity.ts`
- Test: `apps/web/src/features/native/stream-activity.test.ts`
- Modify: `apps/web/src/features/native/stream-snapshot.ts`
- Test: `apps/web/src/features/native/stream-snapshot.test.ts`

**Interfaces:**
- Produces (in `bridge.ts`):

```ts
export type StreamScreen = {
  id: string; name: string; state: "building" | "built" | "failed";
  versionId: string | null; formFactor: "mobile" | "tablet" | "desktop";
  createdAt: string; updating: boolean;
};
export type StreamActivityPhase =
  "reading" | "replying" | "designing" | "offline" | "needs_signin" | "limit_reached" | "failed";
export type StreamActivity = {
  taskId: string; starId: string | null; phase: StreamActivityPhase; screenName: string | null;
};
export type ScreenDocumentMessage = {
  v: 1; type: "screen"; roomId: string; screenId: string; versionId: string;
  formFactor: StreamScreen["formFactor"]; html: string;
};
```
  and `StreamSnapshot` gains `screens: StreamScreen[]` and `activity: StreamActivity[]`.
- Produces (in `screen-feed.ts`): `export type ScreenFeedRow = { id: string; name: string; state: "empty" | "built"; updating: boolean; currentVersionId: string | null; formFactor: StreamScreen["formFactor"]; createdAt: string }` and `export async function listRoomScreenFeed(roomId: string): Promise<ScreenFeedRow[]>`.
- Produces (in `stream-activity.ts`): `export function deriveActivity(tasks: RoomTaskStatus[], stars: { id: string; followupMessageIds: string[] }[], screens: StreamScreen[]): StreamActivity[]`.
- Produces (in `stream-snapshot.ts`): `StreamSnapshotInput.screenRows?: ScreenFeedRow[]`; the built snapshot has `screens` and `activity`.

- [ ] **Step 1: Add the wire types** — append the four types above to `bridge.ts`, add `screens: StreamScreen[]; activity: StreamActivity[];` to the `StreamSnapshot` type (after `artifacts`), and add `ScreenDocumentMessage` to the exported union of messages the page can post (find the existing `BridgeMessage`-style union in that file and add it).

- [ ] **Step 2: Write the failing activity tests** — create `apps/web/src/features/native/stream-activity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { StreamScreen } from "./bridge";
import { deriveActivity } from "./stream-activity";

function task(overrides: Partial<RoomTaskStatus>): RoomTaskStatus {
  return {
    taskId: "t1", sourceMessageId: "m1", initiatingUserId: "u1", provider: "codex",
    kind: "room_reply", agentKind: "product", status: "queued",
    createdAt: "2026-11-15T10:00:00.000Z", updatedAt: "2026-11-15T10:00:00.000Z",
    ...overrides,
  };
}
const noStars: { id: string; followupMessageIds: string[] }[] = [];
const noScreens: StreamScreen[] = [];

describe("deriveActivity", () => {
  it("maps queued, running and offline room replies", () => {
    expect(deriveActivity([task({ status: "queued" })], noStars, noScreens)[0].phase).toBe("reading");
    expect(deriveActivity([task({ status: "running" })], noStars, noScreens)[0].phase).toBe("replying");
    expect(deriveActivity([task({ status: "waiting_for_device" })], noStars, noScreens)[0].phase).toBe("offline");
  });

  it("maps design tasks to designing with the building screen's name", () => {
    const building: StreamScreen = {
      id: "s1", name: "Balance", state: "building", versionId: null, formFactor: "mobile",
      createdAt: "2026-11-15T10:00:00.000Z", updating: false,
    };
    const [activity] = deriveActivity([task({ kind: "design_screen_generate", status: "running" })], noStars, [building]);
    expect(activity).toMatchObject({ phase: "designing", screenName: "Balance" });
  });

  it("maps sign-in, limit and failure, but only the latest failure", () => {
    expect(deriveActivity([task({ status: "needs_reauthentication" })], noStars, noScreens)[0].phase).toBe("needs_signin");
    expect(deriveActivity([task({ status: "usage_limit_reached" })], noStars, noScreens)[0].phase).toBe("limit_reached");
    const older = task({ taskId: "old", status: "failed", createdAt: "2026-11-15T09:00:00.000Z" });
    const latest = task({ taskId: "new", status: "failed", createdAt: "2026-11-15T10:00:00.000Z" });
    expect(deriveActivity([older, latest], noStars, noScreens).map((a) => a.taskId)).toEqual(["new"]);
  });

  it("ignores finished tasks and files follow-up tasks under their Star", () => {
    expect(deriveActivity([task({ status: "completed" })], noStars, noScreens)).toEqual([]);
    const stars = [{ id: "star1", followupMessageIds: ["m2"] }];
    const [activity] = deriveActivity([task({ taskId: "t2", sourceMessageId: "m2", status: "running" })], stars, noScreens);
    expect(activity.starId).toBe("star1");
  });
});
```

- [ ] **Step 3: Run and watch fail**

Run: `cd apps/web && pnpm exec vitest run src/features/native/stream-activity.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `stream-activity.ts`**

```ts
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import type { StreamActivity, StreamActivityPhase, StreamScreen } from "./bridge";

function phaseFor(task: RoomTaskStatus, isLatest: boolean): StreamActivityPhase | null {
  const design = task.kind === "design_screen_generate";
  switch (task.status) {
    case "queued":
    case "ready_to_run":
      return design ? "designing" : "reading";
    case "running":
      return design ? "designing" : "replying";
    case "waiting_for_device":
      return "offline";
    case "needs_reauthentication":
      return "needs_signin";
    case "usage_limit_reached":
      return "limit_reached";
    case "failed":
      return isLatest ? "failed" : null;
    default:
      return null;
  }
}

export function deriveActivity(
  tasks: RoomTaskStatus[],
  stars: { id: string; followupMessageIds: string[] }[],
  screens: StreamScreen[],
): StreamActivity[] {
  const starByFollowup = new Map<string, string>();
  for (const star of stars) {
    for (const id of star.followupMessageIds) starByFollowup.set(id, star.id);
  }
  const buildingName = screens.find((screen) => screen.state === "building")?.name ?? null;
  const latest = [...tasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const activity: StreamActivity[] = [];
  for (const task of tasks) {
    const phase = phaseFor(task, task === latest);
    if (!phase) continue;
    activity.push({
      taskId: task.taskId,
      starId: task.sourceMessageId ? (starByFollowup.get(task.sourceMessageId) ?? null) : null,
      phase,
      screenName: task.kind === "design_screen_generate" ? buildingName : null,
    });
  }
  return activity;
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm exec vitest run src/features/native/stream-activity.test.ts`

- [ ] **Step 6: Create the screen feed server action** — `apps/web/src/features/native/screen-feed.ts`:

```ts
"use server";

import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

export type ScreenFeedRow = {
  id: string;
  name: string;
  state: "empty" | "built";
  updating: boolean;
  currentVersionId: string | null;
  formFactor: "mobile" | "tablet" | "desktop";
  createdAt: string;
};

const Row = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: z.enum(["empty", "built"]),
  updating: z.boolean(),
  current_version_id: z.string().uuid().nullable(),
  form_factor: z.enum(["mobile", "tablet", "desktop"]),
  created_at: z.string(),
});

export async function listRoomScreenFeed(roomId: string): Promise<ScreenFeedRow[]> {
  if (!z.string().uuid().safeParse(roomId).success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignScreens } = await import("@/features/rooms/e2e-fake");
      const rows = await fakeListRoomDesignScreens(roomId);
      return rows.map((row) => ({
        id: row.id, name: row.name, state: row.state, updating: row.updating,
        currentVersionId: row.current_version_id, formFactor: "mobile" as const,
        createdAt: new Date(0).toISOString(),
      }));
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screens")
      .select("id,name,state,updating,current_version_id,form_factor,created_at")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) return [];
    const parsed = z.array(Row).safeParse(data ?? []);
    if (!parsed.success) return [];
    return parsed.data.map((row) => ({
      id: row.id, name: row.name, state: row.state, updating: row.updating,
      currentVersionId: row.current_version_id, formFactor: row.form_factor,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 7: Write the failing snapshot tests** — add to `stream-snapshot.test.ts` (reuse its existing `base`, `task`, `message` helpers):

```ts
  it("reports screens with their state and the activity of running tasks", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      taskStatuses: [task({ taskId: "d1", kind: "design_screen_generate", status: "running", sourceMessageId: null })],
      screenRows: [
        { id: "s1", name: "Balance", state: "built", updating: false, currentVersionId: "v1", formFactor: "mobile", createdAt: "2026-11-15T10:00:00.000Z" },
        { id: "s2", name: "Card", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:05:00.000Z" },
      ],
    });
    expect(snapshot.screens.map((screen) => [screen.id, screen.state, screen.versionId])).toEqual([
      ["s1", "built", "v1"],
      ["s2", "building", null],
    ]);
    expect(snapshot.activity).toEqual([
      { taskId: "d1", starId: null, phase: "designing", screenName: "Card" },
    ]);
  });

  it("marks an unbuilt screen failed when the latest design task failed", () => {
    const snapshot = buildStreamSnapshot({
      ...base,
      taskStatuses: [task({ taskId: "d1", kind: "design_screen_generate", status: "failed", sourceMessageId: null })],
      screenRows: [
        { id: "s2", name: "Card", state: "empty", updating: false, currentVersionId: null, formFactor: "mobile", createdAt: "2026-11-15T10:05:00.000Z" },
      ],
    });
    expect(snapshot.screens[0].state).toBe("failed");
  });
```

- [ ] **Step 8: Run and watch fail** — `pnpm exec vitest run src/features/native/stream-snapshot.test.ts` → the two new tests FAIL (`screens` undefined).

- [ ] **Step 9: Implement in `stream-snapshot.ts`**
  1. Import `ScreenFeedRow` from `./screen-feed` and `deriveActivity` from `./stream-activity`, and `StreamScreen` from `./bridge`.
  2. Add `screenRows?: ScreenFeedRow[];` to `StreamSnapshotInput`.
  3. Before the `return` that builds the snapshot object, compute:

```ts
  const latestDesignTask = [...input.taskStatuses]
    .filter((task) => task.kind === "design_screen_generate")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const designFailed = latestDesignTask?.status === "failed" || latestDesignTask?.status === "cancelled";
  const screens: StreamScreen[] = (input.screenRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    state: row.state === "built" ? "built" : designFailed ? "failed" : "building",
    versionId: row.currentVersionId,
    formFactor: row.formFactor,
    createdAt: row.createdAt,
    updating: row.updating,
  }));
  const activity = deriveActivity(input.taskStatuses, stars, screens);
```

  4. Add `screens, activity,` to the returned snapshot object.

- [ ] **Step 10: Run the native tests and typecheck**

Run: `pnpm exec vitest run src/features/native && pnpm typecheck`
Expected: all pass (other tests that build a snapshot still pass because `screenRows` is optional and `screens`/`activity` default to empty arrays).

- [ ] **Step 11: Commit**

```bash
git add apps/web && git commit -m "feat(native): screens and activity in the stream snapshot" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The bridge runs design requests and sends screen documents

**Files:**
- Modify: `apps/web/src/features/native/native-stream-bridge.tsx`
- Test: `apps/web/src/features/native/native-stream-bridge.test.tsx`
- Create: `apps/web/src/features/native/design-intent.ts` and `design-intent.test.ts`

**Interfaces:**
- Consumes: `listRoomScreenFeed` (Task 4), `generateDesignScreen` (`@/features/design/design-screen-generation`), `dismissMessageProposal` (`@/features/rooms/proposals`), `loadRoomScreen` (`@/features/canvas-excalidraw/load-screen`), `buildFramePreviewDoc` (`@/features/canvas/screen-preview-doc`), `previewTheme`/`previewChromeCss` (`@/features/canvas-next/preview-theme`).
- Produces: `parseDesignMention(body: string): string | null` (returns the brief without the leading `@Design Agent`, or `null` when the body does not start with the mention).

- [ ] **Step 1: Write the failing test for the mention** — `design-intent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDesignMention } from "./design-intent";

describe("parseDesignMention", () => {
  it("returns the brief after a leading @Design Agent", () => {
    expect(parseDesignMention("@Design Agent a login screen")).toBe("a login screen");
    expect(parseDesignMention("  @design agent: a login screen ")).toBe("a login screen");
  });
  it("returns null without the mention, or with an empty brief", () => {
    expect(parseDesignMention("design a login screen")).toBeNull();
    expect(parseDesignMention("@Design Agent   ")).toBeNull();
  });
});
```

Run: `pnpm exec vitest run src/features/native/design-intent.test.ts` → FAIL. Then create `design-intent.ts`:

```ts
const MENTION = /^\s*@design agent\b[\s:,-]*/i;

export function parseDesignMention(body: string): string | null {
  if (!MENTION.test(body)) return null;
  const brief = body.replace(MENTION, "").trim();
  return brief.length > 0 ? brief : null;
}
```

Re-run → PASS.

- [ ] **Step 2: Write the failing bridge tests** — in `native-stream-bridge.test.tsx`, extend the `vi.hoisted` mocks object with `generateDesignScreen`, `dismissMessageProposal`, `listRoomScreenFeed`, `loadRoomScreen`, and register `vi.mock` entries for `@/features/design/design-screen-generation` (`generateDesignScreen`), `@/features/rooms/proposals` (`dismissMessageProposal`), `./screen-feed` (`listRoomScreenFeed`), `@/features/canvas-excalidraw/load-screen` (`loadRoomScreen`), and `@/features/canvas/screen-preview-doc` (`buildFramePreviewDoc: () => "<html>doc</html>"`). Follow the file's existing mock pattern (see how `postMessage` and `listRoomStarMetadata` are mocked). Default in `beforeEach`: `mocks.listRoomScreenFeed.mockResolvedValue([])`, `mocks.generateDesignScreen.mockResolvedValue({ status: "queued", taskId: "d1", screenId: "s1" })`, `mocks.dismissMessageProposal.mockResolvedValue({})`. Then add:

```ts
  it("starts the design when the Product Agent proposes one, once, and answers the proposal", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    const reply = message({
      id: "m9", clientId: "c9", authorType: "product_agent", authorId: null, aiTaskId: "t1",
      body: "On it.", createdAt: new Date().toISOString(),
      proposedAction: { kind: "design_screen", instruction: "A fintech balance screen", name: "Balance", screenId: null },
    });
    await act(async () => { mocks.onMessage?.(reply); });
    await act(async () => { mocks.onMessage?.(reply); });
    expect(mocks.generateDesignScreen).toHaveBeenCalledTimes(1);
    expect(mocks.generateDesignScreen).toHaveBeenCalledWith({
      roomId: "r1", name: "Balance", instruction: "A fintech balance screen",
    });
    expect(mocks.dismissMessageProposal).toHaveBeenCalledWith("m9");
  });

  it("does not rebuild a proposal that was already in the room when the page loaded", async () => {
    const old = message({
      id: "m8", authorType: "product_agent", authorId: null, aiTaskId: "t1",
      proposedAction: { kind: "design_screen", instruction: "Old", name: null, screenId: null },
    });
    render(<NativeStreamBridge {...props} initialMessages={[old]} />);
    await act(async () => {});
    expect(mocks.generateDesignScreen).not.toHaveBeenCalled();
  });

  it("builds straight away for a typed @Design Agent without posting a message", async () => {
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    let result: unknown;
    await act(async () => {
      result = await (window as TestWindow).__orionStream!.post({ roomId: "r1", body: "@Design Agent a login screen" });
    });
    expect(result).toEqual({ status: "ok" });
    expect(mocks.generateDesignScreen).toHaveBeenCalledWith({ roomId: "r1", instruction: "a login screen" });
    expect(mocks.postMessage).not.toHaveBeenCalled();
  });

  it("sends each built screen's document once per version", async () => {
    mocks.listRoomScreenFeed.mockResolvedValue([
      { id: "s1", name: "Balance", state: "built", updating: false, currentVersionId: "v1", formFactor: "mobile", createdAt: "2026-11-15T10:00:00.000Z" },
    ]);
    mocks.loadRoomScreen.mockResolvedValue({ id: "s1", name: "Balance", state: "built" });
    render(<NativeStreamBridge {...props} />);
    await act(async () => {});
    await act(async () => {});
    const docs = nativePost.mock.calls.map((call) => call[0]).filter((m) => m.type === "screen");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ v: 1, roomId: "r1", screenId: "s1", versionId: "v1", formFactor: "mobile", html: "<html>doc</html>" });
  });
```

Run: `pnpm exec vitest run src/features/native/native-stream-bridge.test.tsx` → the four new tests FAIL.

- [ ] **Step 3: Implement in `native-stream-bridge.tsx`**
  1. Imports:

```ts
import { generateDesignScreen } from "@/features/design/design-screen-generation";
import { dismissMessageProposal } from "@/features/rooms/proposals";
import { loadRoomScreen } from "@/features/canvas-excalidraw/load-screen";
import { buildFramePreviewDoc } from "@/features/canvas/screen-preview-doc";
import { previewChromeCss, previewTheme } from "@/features/canvas-next/preview-theme";
import { parseDesignMention } from "./design-intent";
import { listRoomScreenFeed, type ScreenFeedRow } from "./screen-feed";
```

  2. State and refs next to the existing state: `const [screenRows, setScreenRows] = useState<ScreenFeedRow[]>([]);`, `const handledDesignRef = useRef(new Set(initialMessages.map((m) => m.id)));`, `const postedDocsRef = useRef(new Set<string>());`.
  3. A `refreshScreens` callback (same shape as `refreshStars`): `try { setScreenRows(await listRoomScreenFeed(roomId)); } catch {}`. Call it once on mount (inside an effect) and add `void refreshScreens();` to the poller's `onStatuses` handler right next to `void refreshStars();`, and after a successful `generateDesignScreen`.
  4. Pass `screenRows` to `buildStreamSnapshot({ ... })` and add it to the `useMemo` dependency list.
  5. Effect that runs the Product Agent's proposals:

```ts
  useEffect(() => {
    for (const message of messages) {
      const action = message.proposedAction;
      if (!action || action.kind !== "design_screen") continue;
      if (handledDesignRef.current.has(message.id)) continue;
      handledDesignRef.current.add(message.id);
      void (async () => {
        const result = await generateDesignScreen({
          roomId,
          ...(action.name ? { name: action.name } : {}),
          instruction: action.instruction,
        });
        if (result.status === "queued") {
          void refreshScreens();
          pollerRef.current?.notifyQueued();
          await dismissMessageProposal(message.id).catch(() => {});
        }
      })();
    }
  }, [messages, roomId, refreshScreens]);
```

  6. Effect that sends documents:

```ts
  useEffect(() => {
    for (const screen of snapshot.screens) {
      if (screen.state !== "built" || !screen.versionId) continue;
      const key = `${screen.id}:${screen.versionId}`;
      if (postedDocsRef.current.has(key)) continue;
      postedDocsRef.current.add(key);
      void (async () => {
        try {
          const loaded = await loadRoomScreen(roomId, screen.id);
          if (!loaded) throw new Error("missing");
          const html = buildFramePreviewDoc(loaded, previewTheme(getComputedStyle(document.body)), previewChromeCss);
          if (!html) throw new Error("no preview");
          postToNative({ v: 1, type: "screen", roomId, screenId: screen.id, versionId: screen.versionId!, formFactor: screen.formFactor, html });
        } catch {
          postedDocsRef.current.delete(key); // try again on the next snapshot
        }
      })();
    }
  }, [snapshot.screens, roomId]);
```

  7. In the `post` handler, before the existing `postMessage` call (after the empty-body/room guard):

```ts
        const designBrief = parseDesignMention(body);
        if (designBrief) {
          const built = await generateDesignScreen({ roomId, instruction: designBrief });
          if (built.status !== "queued") return { status: "error", message: built.message };
          void refreshScreens();
          pollerRef.current?.notifyQueued();
          return { status: "ok" };
        }
```

- [ ] **Step 3b: Check types** — `postToNative` must accept the `screen` message; if its parameter type is the old union, widen it to include `ScreenDocumentMessage` from `bridge.ts`.

- [ ] **Step 4: Run the tests**

Run: `pnpm exec vitest run src/features/native && pnpm typecheck && pnpm exec eslint src/features/native --quiet`
Expected: all pass, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(native): start designs from the Product Agent, send screen documents" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mac decodes screens, activity and screen documents

**Files:**
- Create: `apps/mac/Sources/OrionAppCore/Stream/StreamScreen.swift`
- Modify: `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift`
- Modify: `apps/mac/Sources/OrionAppCore/BridgeMessage.swift`
- Test: `apps/mac/Tests/OrionAppCoreTests/StreamSnapshotTests.swift`, `BridgeMessageTests.swift`

**Interfaces:**
- Produces (OrionAppCore, all `public`):
  - `struct StreamScreen: Identifiable, Equatable, Sendable { enum State: String { case building, built, failed }; id, name, state, versionID: String?, formFactor: String, createdAt: Date, updating: Bool; var cacheKey: String?; var pixelSize: CGSize }`
  - `struct StreamActivity: Identifiable, Equatable, Sendable { enum Phase: String { reading, replying, designing, offline, needs_signin, limit_reached, failed }; taskID, starID: String?, phase, screenName: String?; func line() -> String; var id: String }`
  - `enum StreamTimelineItem: Identifiable, Equatable, Sendable { case message(StreamMessage), screen(StreamScreen); var id: String; var date: Date }`
  - `StreamSnapshot.screens: [StreamScreen]`, `.activity: [StreamActivity]`, `var mainChatTimeline: [StreamTimelineItem]`, `func activity(forStar starID: String?) -> StreamActivity?`
  - `BridgeMessage.screenDocument(ScreenDocument)` with `struct ScreenDocument: Equatable, Sendable { roomID, screenID, versionID, formFactor, html: String; var cacheKey: String }`

- [ ] **Step 1: Write the failing tests** — add to `StreamSnapshotTests.swift` (use its existing helper that builds a snapshot dictionary; if it has a `base` fields helper reuse it, otherwise build the minimal dictionary shown):

```swift
    @Test func decodesScreensAndActivity() throws {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": [["id": "m1", "authorName": "Ada", "authorKind": "human", "text": "design it",
                          "createdAt": "2026-11-15T10:00:00.000Z"]],
            "screens": [
                ["id": "s1", "name": "Balance", "state": "built", "versionId": "v1", "formFactor": "mobile",
                 "createdAt": "2026-11-15T10:05:00.000Z", "updating": false],
                ["id": "s2", "name": "Card", "state": "building", "versionId": NSNull(), "formFactor": "desktop",
                 "createdAt": "2026-11-15T10:06:00.000Z", "updating": false],
            ],
            "activity": [
                ["taskId": "t1", "starId": NSNull(), "phase": "designing", "screenName": "Card"],
                ["taskId": "t2", "starId": "star1", "phase": "offline", "screenName": NSNull()],
            ],
        ]
        let snapshot = try #require(StreamSnapshot.decode(fields))
        #expect(snapshot.screens.map(\.id) == ["s1", "s2"])
        #expect(snapshot.screens[0].cacheKey == "s1-v1")
        #expect(snapshot.screens[1].cacheKey == nil)
        #expect(snapshot.screens[0].pixelSize == CGSize(width: 390, height: 844))
        #expect(snapshot.screens[1].pixelSize == CGSize(width: 1280, height: 800))
        #expect(snapshot.activity(forStar: nil)?.line() == "Designing Card…")
        #expect(snapshot.activity(forStar: "star1")?.line() == "Your Mac is offline. Orion will answer when it's back.")
        #expect(snapshot.mainChatTimeline.map(\.id) == ["message:m1", "screen:s1", "screen:s2"])
    }

    @Test func activityLinesReadPlainly() {
        func line(_ phase: StreamActivity.Phase, name: String? = nil) -> String {
            StreamActivity(taskID: "t", starID: nil, phase: phase, screenName: name).line()
        }
        #expect(line(.reading) == "Orion is reading…")
        #expect(line(.replying) == "Orion is replying…")
        #expect(line(.designing) == "Designing the screen…")
        #expect(line(.needs_signin) == "Sign in to your AI tool on your Mac so Orion can answer.")
        #expect(line(.limit_reached) == "Your AI tool hit its usage limit.")
        #expect(line(.failed) == "Orion couldn't answer.")
    }
```

and to `BridgeMessageTests.swift`:

```swift
    @Test func decodesAScreenDocument() {
        let message = BridgeMessage.decode([
            "v": 1, "type": "screen", "roomId": "r1", "screenId": "s1", "versionId": "v1",
            "formFactor": "mobile", "html": "<html></html>",
        ])
        #expect(message == .screenDocument(ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v1",
                                                           formFactor: "mobile", html: "<html></html>")))
        #expect(BridgeMessage.decode(["v": 1, "type": "screen", "roomId": "r1"]) == nil)
    }
```

- [ ] **Step 2: Run and watch fail** — `cd apps/mac && swift test --filter "StreamSnapshotTests|BridgeMessageTests" 2>&1 | tail -15` → compile errors (types missing).

- [ ] **Step 3: Create `StreamScreen.swift`**

```swift
import CoreGraphics
import Foundation

public struct StreamScreen: Identifiable, Equatable, Sendable {
    public enum State: String, Sendable { case building, built, failed }
    public let id: String
    public let name: String
    public let state: State
    public let versionID: String?
    public let formFactor: String
    public let createdAt: Date
    public let updating: Bool

    public init(id: String, name: String, state: State, versionID: String?, formFactor: String,
                createdAt: Date, updating: Bool) {
        self.id = id; self.name = name; self.state = state; self.versionID = versionID
        self.formFactor = formFactor; self.createdAt = createdAt; self.updating = updating
    }

    /// What the picture cache is keyed by: a new version is a new picture.
    public var cacheKey: String? { versionID.map { "\(id)-\($0)" } }

    /// The size the screen is drawn at before it is scaled into a card.
    public var pixelSize: CGSize { Self.pixelSize(formFactor: formFactor) }

    public static func pixelSize(formFactor: String) -> CGSize {
        switch formFactor {
        case "mobile": CGSize(width: 390, height: 844)
        case "tablet": CGSize(width: 820, height: 1180)
        default: CGSize(width: 1280, height: 800)
        }
    }
}

public struct StreamActivity: Identifiable, Equatable, Sendable {
    public enum Phase: String, Sendable {
        case reading, replying, designing, offline, needs_signin, limit_reached, failed
    }
    public let taskID: String
    public let starID: String?
    public let phase: Phase
    public let screenName: String?
    public var id: String { taskID }

    public init(taskID: String, starID: String?, phase: Phase, screenName: String?) {
        self.taskID = taskID; self.starID = starID; self.phase = phase; self.screenName = screenName
    }

    /// The one line shown above the composer.
    public func line() -> String {
        switch phase {
        case .reading: "Orion is reading…"
        case .replying: "Orion is replying…"
        case .designing: screenName.map { "Designing \($0)…" } ?? "Designing the screen…"
        case .offline: "Your Mac is offline. Orion will answer when it's back."
        case .needs_signin: "Sign in to your AI tool on your Mac so Orion can answer."
        case .limit_reached: "Your AI tool hit its usage limit."
        case .failed: "Orion couldn't answer."
        }
    }
}

public enum StreamTimelineItem: Identifiable, Equatable, Sendable {
    case message(StreamMessage)
    case screen(StreamScreen)

    public var id: String {
        switch self {
        case .message(let message): "message:\(message.id)"
        case .screen(let screen): "screen:\(screen.id)"
        }
    }
    public var date: Date {
        switch self {
        case .message(let message): message.createdAt
        case .screen(let screen): screen.createdAt
        }
    }
}

public struct ScreenDocument: Equatable, Sendable {
    public let roomID: String
    public let screenID: String
    public let versionID: String
    public let formFactor: String
    public let html: String
    public var cacheKey: String { "\(screenID)-\(versionID)" }

    public init(roomID: String, screenID: String, versionID: String, formFactor: String, html: String) {
        self.roomID = roomID; self.screenID = screenID; self.versionID = versionID
        self.formFactor = formFactor; self.html = html
    }
}
```

- [ ] **Step 4: Extend `StreamSnapshot.swift`** — add the stored properties `public let screens: [StreamScreen]` and `public let activity: [StreamActivity]` (after `artifacts`), decode them in `decode(_:)` (before the final `return Self(...)`) and pass them in:

```swift
        let screens = (fields["screens"] as? [[String: Any]] ?? []).compactMap { row -> StreamScreen? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let name = row["name"] as? String,
                  let stateText = row["state"] as? String, let state = StreamScreen.State(rawValue: stateText),
                  let dateText = row["createdAt"] as? String,
                  let date = fractional.date(from: dateText) ?? plain.date(from: dateText) else { return nil }
            return StreamScreen(id: id, name: name, state: state, versionID: row["versionId"] as? String,
                                formFactor: row["formFactor"] as? String ?? "mobile", createdAt: date,
                                updating: row["updating"] as? Bool ?? false)
        }.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        let activity = (fields["activity"] as? [[String: Any]] ?? []).compactMap { row -> StreamActivity? in
            guard let taskID = row["taskId"] as? String, !taskID.isEmpty,
                  let phaseText = row["phase"] as? String, let phase = StreamActivity.Phase(rawValue: phaseText) else { return nil }
            return StreamActivity(taskID: taskID, starID: row["starId"] as? String, phase: phase,
                                  screenName: row["screenName"] as? String)
        }
```

  and add two members to the type:

```swift
    /// Messages and built/building screens in time order, for the main chat.
    public var mainChatTimeline: [StreamTimelineItem] {
        let items = mainChatMessages.map(StreamTimelineItem.message) + screens.map(StreamTimelineItem.screen)
        return items.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }

    /// The task to show the working line for: the main chat's (`starID == nil`)
    /// or one Star's (a follow-up, or the Star's own first reply task).
    public func activity(forStar starID: String?) -> StreamActivity? {
        guard let starID else { return activity.first { $0.starID == nil } }
        return activity.first { $0.starID == starID || $0.taskID == starID }
    }
```

  (`mainChatMessages` already exists in `StarThread.swift`.)

- [ ] **Step 5: Extend `BridgeMessage.swift`** — add `case screenDocument(ScreenDocument)` and in `decode`'s switch:

```swift
        case "screen":
            guard let roomID = nonEmpty(fields["roomId"]), let screenID = nonEmpty(fields["screenId"]),
                  let versionID = nonEmpty(fields["versionId"]), let html = nonEmpty(fields["html"]) else { return nil }
            return .screenDocument(ScreenDocument(roomID: roomID, screenID: screenID, versionID: versionID,
                                                  formFactor: fields["formFactor"] as? String ?? "mobile", html: html))
```

- [ ] **Step 6: Run the Mac tests** — `cd apps/mac && swift build 2>&1 | grep -E "error|Build"; swift test 2>&1 | tail -4`. Expected: build complete; all tests pass (existing exhaustive `switch` statements over `BridgeMessage` in the app target will need a `.screenDocument` arm — add `case .screenDocument: break` where the compiler reports it, Task 7 wires the real handler).

- [ ] **Step 7: Commit**

```bash
git add apps/mac && git commit -m "feat(mac): decode screens, activity and screen documents" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The screen card, picture cache and wiring

**Files:**
- Create: `apps/mac/Sources/Orion/Project/ScreenSnapshotter.swift`, `ScreenCardStore.swift`, `ScreenCard.swift`
- Modify: `apps/mac/Sources/Orion/Bridge/NativeBridge.swift`, `App/AppDelegate.swift`, `Frame/FrameModel.swift`, `Project/ProjectScreen.swift`
- Test: `apps/mac/Tests/OrionTests/ScreenCardStoreTests.swift` (new), `FrameModelTests.swift`

**Interfaces:**
- Consumes: `ScreenDocument`, `StreamScreen`, `StreamTimelineItem` (Task 6).
- Produces: `ScreenCardStore` (`@MainActor @Observable`): `init(directory: URL)`, `func image(for screen: StreamScreen) -> NSImage?`, `func receive(_ document: ScreenDocument) async`, `static let shared`. `FrameModel.canvasScreenID: String?` (private(set)) and `func openScreenInCanvas(_ id: String)`.

- [ ] **Step 1: Write the failing FrameModel tests** — add to `FrameModelTests.swift`:

```swift
    @Test func openingAScreenFromTheChatOpensCanvasFocusedOnIt() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.openScreenInCanvas("s1")
        #expect(model.projectPanel == .canvas)
        #expect(model.canvasScreenID == "s1")
        #expect(model.canvasStarID == nil)
        model.showProjectCanvas()
        #expect(model.canvasScreenID == nil)
        model.openScreenInCanvas("s2")
        model.togglePanel(.canvas)
        #expect(model.projectPanel == nil)
        #expect(model.canvasScreenID == nil)
    }
```

- [ ] **Step 2: Implement `canvasScreenID` in `FrameModel.swift`**
  - Next to `private(set) var canvasStarID: String?` add `private(set) var canvasScreenID: String?`.
  - In `togglePanel`, right after `canvasStarID = next == .canvas ? enteringCanvasFromStar : nil`, add `canvasScreenID = nil`.
  - In `openStar`, in the `if projectPanel == .canvas { canvasStarID = id; return }` branch set `canvasScreenID = nil` before returning.
  - In `showProjectCanvas()` add `canvasScreenID = nil`.
  - Clear it wherever `canvasStarID = nil` is set (project switch/room switch in `update`, sign-out reset).
  - Add:

```swift
    /// A screen card in the chat: open the Canvas and zoom to that screen.
    func openScreenInCanvas(_ id: String) {
        if projectPanel != .canvas { togglePanel(.canvas) }
        canvasStarID = nil
        canvasScreenID = id
    }
```

  Run `swift test --filter FrameModelTests` → PASS (including the new test).

- [ ] **Step 3: Create `ScreenSnapshotter.swift`**

```swift
import AppKit
import WebKit

/// Draws a screen's HTML once, offscreen, with scripts off, and returns a picture.
@MainActor
enum ScreenSnapshotter {
    static func render(html: String, size: CGSize) async -> NSImage? {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        let view = WKWebView(frame: CGRect(origin: .zero, size: size), configuration: configuration)
        // A web view that is not in a window can come back blank, so give it a
        // borderless window parked far offscreen.
        let window = NSWindow(contentRect: CGRect(x: -30_000, y: -30_000, width: size.width, height: size.height),
                              styleMask: .borderless, backing: .buffered, defer: false)
        window.contentView = view
        window.orderBack(nil)
        defer { window.close() }

        let waiter = LoadWaiter()
        view.navigationDelegate = waiter
        view.loadHTMLString(html, baseURL: nil)
        guard await waiter.finished(timeout: .seconds(10)) else { return nil }
        let snapshot = WKSnapshotConfiguration()
        snapshot.rect = CGRect(origin: .zero, size: size)
        return try? await view.takeSnapshot(configuration: snapshot)
    }
}

@MainActor
private final class LoadWaiter: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Bool, Never>?

    func finished(timeout: Duration) async -> Bool {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            Task { [weak self] in
                try? await Task.sleep(for: timeout)
                self?.resume(false)
            }
        }
    }

    private func resume(_ value: Bool) {
        continuation?.resume(returning: value)
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { resume(true) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { resume(false) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { resume(false) }
}
```

- [ ] **Step 4: Write the failing store test** — `ScreenCardStoreTests.swift`:

```swift
import AppKit
import OrionAppCore
import Testing
@testable import Orion

@MainActor
struct ScreenCardStoreTests {
    private func tempDirectory() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("screen-cards-\(UUID().uuidString)")
    }
    private func screen(version: String?) -> StreamScreen {
        StreamScreen(id: "s1", name: "Balance", state: .built, versionID: version, formFactor: "mobile",
                     createdAt: Date(), updating: false)
    }
    private func solidImage() -> NSImage {
        let image = NSImage(size: NSSize(width: 4, height: 4))
        image.lockFocus(); NSColor.red.setFill(); NSRect(x: 0, y: 0, width: 4, height: 4).fill(); image.unlockFocus()
        return image
    }

    @Test func rendersOncePerVersionAndKeepsThePictureOnDisk() async {
        var renders = 0
        let directory = tempDirectory()
        let store = ScreenCardStore(directory: directory) { _, _ in renders += 1; return self.solidImage() }
        let document = ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v1", formFactor: "mobile", html: "<html></html>")
        await store.receive(document)
        await store.receive(document)
        #expect(renders == 1)
        #expect(store.image(for: screen(version: "v1")) != nil)
        // A new store (a relaunch) finds the picture on disk without rendering.
        let relaunched = ScreenCardStore(directory: directory) { _, _ in renders += 1; return nil }
        #expect(relaunched.image(for: screen(version: "v1")) != nil)
        #expect(renders == 1)
    }

    @Test func aNewVersionRendersAgain() async {
        var renders = 0
        let store = ScreenCardStore(directory: tempDirectory()) { _, _ in renders += 1; return self.solidImage() }
        await store.receive(ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v1", formFactor: "mobile", html: "a"))
        await store.receive(ScreenDocument(roomID: "r1", screenID: "s1", versionID: "v2", formFactor: "mobile", html: "b"))
        #expect(renders == 2)
        #expect(store.image(for: screen(version: "v2")) != nil)
        #expect(store.image(for: screen(version: nil)) == nil)
    }
}
```

Run: `swift test --filter ScreenCardStoreTests` → FAIL (type missing).

- [ ] **Step 5: Create `ScreenCardStore.swift`**

```swift
import AppKit
import Observation
import OrionAppCore

/// Pictures of built screens, one per (screen, version). Drawn once from the
/// document the website sends, then kept in memory and on disk.
@MainActor
@Observable
final class ScreenCardStore {
    typealias Renderer = @MainActor (_ html: String, _ size: CGSize) async -> NSImage?

    static let shared = ScreenCardStore(
        directory: FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "Orion")
            .appendingPathComponent("ScreenCards"),
        renderer: { html, size in await ScreenSnapshotter.render(html: html, size: size) }
    )

    private(set) var images: [String: NSImage] = [:]
    // Pictures read back from disk. Not observed: `image(for:)` runs while a
    // view is being drawn, and changing observed state there is not allowed.
    @ObservationIgnored private var diskImages: [String: NSImage] = [:]
    private var inFlight: Set<String> = []
    private let directory: URL
    private let renderer: Renderer

    init(directory: URL, renderer: @escaping Renderer) {
        self.directory = directory
        self.renderer = renderer
    }

    func image(for screen: StreamScreen) -> NSImage? {
        guard let key = screen.cacheKey else { return nil }
        if let image = images[key] ?? diskImages[key] { return image }
        if let image = NSImage(contentsOf: file(for: key)) {
            diskImages[key] = image
            return image
        }
        return nil
    }

    func receive(_ document: ScreenDocument) async {
        let key = document.cacheKey
        guard images[key] == nil, !inFlight.contains(key) else { return }
        if let image = diskImages[key] ?? NSImage(contentsOf: file(for: key)) { images[key] = image; return }
        inFlight.insert(key)
        defer { inFlight.remove(key) }
        let size = StreamScreen.pixelSize(formFactor: document.formFactor)
        guard let image = await renderer(document.html, size) else { return }
        images[key] = image
        save(image, to: file(for: key))
    }

    private func file(for key: String) -> URL {
        directory.appendingPathComponent(key.replacingOccurrences(of: "/", with: "_") + ".png")
    }

    private func save(_ image: NSImage, to url: URL) {
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? png.write(to: url)
    }
}
```

Run: `swift test --filter ScreenCardStoreTests` → PASS.

- [ ] **Step 6: Route the bridge message to the store** — in `NativeBridge.swift` add an `onScreenDocument: (ScreenDocument) -> Void` closure beside `onStream` (same init pattern: stored `private let`, init parameter `onScreenDocument: @escaping (ScreenDocument) -> Void = { _ in }`), and in its message handling switch add `case .screenDocument(let document): onScreenDocument(document)`. In `AppDelegate.swift` next to `onStream:` pass `onScreenDocument: { document in Task { await ScreenCardStore.shared.receive(document) } }`.

- [ ] **Step 7: Create `ScreenCard.swift`**

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// A built (or building) screen in the chat: a still picture of the real
/// screen. Clicking it opens that screen on the Canvas.
struct ScreenCard: View {
    let screen: StreamScreen
    let store: ScreenCardStore
    let open: (StreamScreen) -> Void

    private var width: CGFloat { screen.formFactor == "mobile" ? 200 : 340 }
    private var height: CGFloat { width * screen.pixelSize.height / screen.pixelSize.width }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Button { open(screen) } label: { picture }
                .buttonStyle(.plain)
                .disabled(screen.state != .built)
                .accessibilityLabel("Open \(screen.name) on the Canvas")
            HStack(spacing: OrionSpacing.xs) {
                Text(screen.name).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if screen.updating { Text("Updating…").font(.caption2).foregroundStyle(.secondary) }
            }
        }
    }

    @ViewBuilder private var picture: some View {
        let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)
        Group {
            switch screen.state {
            case .built:
                if let image = store.image(for: screen) {
                    Image(nsImage: image).resizable().scaledToFill()
                } else {
                    placeholder("Loading…")
                }
            case .building: placeholder("Designing…")
            case .failed: placeholder("Couldn't build this screen")
            }
        }
        .frame(width: width, height: height)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.white.opacity(0.12)))
    }

    private func placeholder(_ text: String) -> some View {
        ZStack {
            Rectangle().fill(.white.opacity(0.06))
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
    }
}
```

(If `OrionSpacing` has no `.xs`, use the same constant the composer's model pill uses; `.xs` exists in this codebase, used in `ChatComposer.swift`.)

- [ ] **Step 8: Put cards in the main chat** — in `ProjectScreen.swift`'s `stream` view, replace `ForEach(stream.mainChatMessages)` with:

```swift
                    ForEach(stream.mainChatTimeline) { item in
                        switch item {
                        case .message(let message):
                            StreamMessageRow(message: message, stream: stream) { frame.openStar($0) }
                                .id(message.id)
                        case .screen(let screen):
                            ScreenCard(screen: screen, store: .shared) { frame.openScreenInCanvas($0.id) }
                                .padding(.leading, 28 + OrionSpacing.sm)
                                .id("screen:\(screen.id)")
                        }
                    }
```

  and keep `lastID: stream.mainChatMessages.last?.id` as is (the card does not take over the scroll anchor).

- [ ] **Step 9: Build, test, commit**

```bash
cd apps/mac && swift build 2>&1 | grep -E "error|Build"; swift test 2>&1 | tail -3
git add apps/mac && git commit -m "feat(mac): screen cards in the chat with a cached picture" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: build complete, all tests pass.

---

### Task 8: The working line

**Files:**
- Create: `apps/mac/Sources/Orion/Project/ActivityLine.swift`
- Modify: `apps/mac/Sources/Orion/Project/ProjectScreen.swift`

**Interfaces:**
- Consumes: `StreamActivity` and `StreamSnapshot.activity(forStar:)` (Task 6).

- [ ] **Step 1: Create `ActivityLine.swift`**

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// One quiet line at the end of the chat saying what Orion is doing.
struct ActivityLine: View {
    let activity: StreamActivity
    @State private var sway = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            ChatAvatar(isOrion: true, size: 20)
                .rotationEffect(.degrees(isWorking && sway ? 6 : -6), anchor: .bottom)
                .animation(isWorking && !reduceMotion
                           ? .easeInOut(duration: 0.7).repeatForever(autoreverses: true) : .default, value: sway)
            Text(activity.line())
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .padding(.leading, 2)
        .onAppear { sway = true }
        .accessibilityElement(children: .combine)
    }

    private var isWorking: Bool {
        switch activity.phase {
        case .reading, .replying, .designing: true
        default: false
        }
    }
}
```

- [ ] **Step 2: Show it in the main chat and in Star threads** — in `ProjectScreen.swift`:
  - In `stream`, inside the `LazyVStack` after the `ForEach`, add `if let activity = stream.activity(forStar: nil) { ActivityLine(activity: activity).id("activity") }`.
  - In `starThread(_:stream:showsProjectReturn:)`, inside its `LazyVStack` after the replies, add `if let activity = stream.activity(forStar: star.id) { ActivityLine(activity: activity).id("activity") }`.

- [ ] **Step 3: Build, test, check by eye**

```bash
cd apps/mac && swift build 2>&1 | grep -E "error|Build"; swift test 2>&1 | tail -2
```

  Then run `apps/mac/scripts/preview.sh`, send a message in the demo project, and confirm the line appears and the hat sways while Orion works and disappears when it finishes. Take a screenshot into `.context/`.

- [ ] **Step 4: Commit**

```bash
git add apps/mac && git commit -m "feat(mac): show what Orion is doing above the composer" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Canvas shows design screens, backfills old ones, and can focus one

**Files:**
- Create: `apps/web/src/features/canvas-excalidraw/design-screen-board.ts`
- Test: `apps/web/src/features/canvas-excalidraw/design-screen-board.test.ts`
- Modify: `apps/web/src/features/canvas-excalidraw/load-screen.ts`, `excalidraw-board.tsx`
- Modify: `apps/mac/Sources/Orion/Project/ProjectScreen.swift` (canvas focus)

**Interfaces:**
- Produces (`design-screen-board.ts`):

```ts
export function boardScreenId(designScreenId: string): string; // "ds-<lowercase uuid>"
export type BoardDeps = {
  api: Pick<ExcalidrawImperativeAPI, "getSceneElements" | "getSceneElementsIncludingDeleted" | "updateScene" | "scrollToContent">;
  store: ScreenStore;
  loadDocument: (designScreenId: string) => Promise<string | null>;
};
export async function ensureDesignScreen(deps: BoardDeps, designScreenId: string): Promise<ExcalidrawElement | null>;
export async function backfillDesignScreens(deps: BoardDeps, builtIds: string[]): Promise<number>;
export async function focusDesignScreen(deps: BoardDeps, designScreenId: string): Promise<boolean>;
```
- Produces (`load-screen.ts`): `export async function listBuiltRoomScreenIds(roomId: string): Promise<string[]>`.
- Produces on `window.__orionBoard`: `focusScreen: (designScreenId: string) => Promise<boolean>`.

- [ ] **Step 1: Write the failing tests** — `design-screen-board.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createScreenStore } from "./screen-store";
import { frameLink } from "./frame-link";
import {
  backfillDesignScreens, boardScreenId, ensureDesignScreen, focusDesignScreen, type BoardDeps,
} from "./design-screen-board";

const UUID_A = "AAAAAAAA-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fakeDeps(loadDocument: BoardDeps["loadDocument"]): BoardDeps & { elements: unknown[] } {
  const elements: any[] = [];
  const api = {
    getSceneElements: () => elements.filter((element) => !element.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    updateScene: vi.fn((update: { elements?: any[] }) => {
      if (update.elements) { elements.splice(0, elements.length, ...update.elements); }
    }),
    scrollToContent: vi.fn(),
  };
  return { api: api as unknown as BoardDeps["api"], store: createScreenStore(), loadDocument, elements };
}

describe("design screens on the board", () => {
  it("uses an id the board accepts", () => {
    expect(boardScreenId(UUID_A)).toBe("ds-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(() => frameLink(boardScreenId(UUID_A))).not.toThrow();
  });

  it("adds a frame and its document once, then finds it again", async () => {
    const load = vi.fn(async () => "<html>doc</html>");
    const deps = fakeDeps(load);
    const first = await ensureDesignScreen(deps, UUID_A);
    const second = await ensureDesignScreen(deps, UUID_A);
    expect(first?.id).toBe(second?.id);
    expect(load).toHaveBeenCalledTimes(1);
    expect(deps.elements).toHaveLength(1);
    expect(deps.store.get(boardScreenId(UUID_A))?.html).toBe("<html>doc</html>");
  });

  it("adds nothing when the screen cannot be loaded", async () => {
    const deps = fakeDeps(async () => null);
    expect(await ensureDesignScreen(deps, UUID_A)).toBeNull();
    expect(deps.elements).toHaveLength(0);
  });

  it("backfills only the screens that are missing", async () => {
    const deps = fakeDeps(async () => "<html></html>");
    await ensureDesignScreen(deps, UUID_A);
    const added = await backfillDesignScreens(deps, [UUID_A, UUID_B]);
    expect(added).toBe(1);
    expect(deps.elements).toHaveLength(2);
    expect(await backfillDesignScreens(deps, [UUID_A, UUID_B])).toBe(0);
  });

  it("focusing zooms to the frame", async () => {
    const deps = fakeDeps(async () => "<html></html>");
    expect(await focusDesignScreen(deps, UUID_A)).toBe(true);
    expect((deps.api.scrollToContent as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    expect(await focusDesignScreen(fakeDeps(async () => null), UUID_B)).toBe(false);
  });
});
```

Run: `cd apps/web && pnpm exec vitest run src/features/canvas-excalidraw/design-screen-board.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `design-screen-board.ts`**

```ts
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { addScreenFrame, nextFramePosition } from "./board-actions";
import { frameLink, screenIdFromLink } from "./frame-link";
import type { ScreenStore } from "./screen-store";

export type BoardDeps = {
  api: Pick<
    ExcalidrawImperativeAPI,
    "getSceneElements" | "getSceneElementsIncludingDeleted" | "updateScene" | "scrollToContent"
  >;
  store: ScreenStore;
  loadDocument: (designScreenId: string) => Promise<string | null>;
};

// The board only accepts ids like "ds-<uuid>": a lowercase letter first.
export function boardScreenId(designScreenId: string): string {
  return `ds-${designScreenId.toLowerCase()}`;
}

function findFrame(deps: BoardDeps, designScreenId: string): ExcalidrawElement | null {
  const wanted = frameLink(boardScreenId(designScreenId));
  return (
    deps.api
      .getSceneElements()
      .find((element) => element.type === "embeddable" && element.link === wanted) ?? null
  );
}

// Adds the screen's frame (and its page) to the board if it is not there yet.
// Only ever adds: an existing frame is returned untouched.
export async function ensureDesignScreen(
  deps: BoardDeps,
  designScreenId: string,
): Promise<ExcalidrawElement | null> {
  const existing = findFrame(deps, designScreenId);
  if (existing) return existing;
  const html = await deps.loadDocument(designScreenId);
  if (!html) return null;
  const id = boardScreenId(designScreenId);
  deps.store.set({ id, rev: (deps.store.get(id)?.rev ?? 0) + 1, html });
  const position = nextFramePosition(deps.api as ExcalidrawImperativeAPI);
  return addScreenFrame(deps.api as ExcalidrawImperativeAPI, { screenId: id, ...position });
}

export async function backfillDesignScreens(deps: BoardDeps, builtIds: string[]): Promise<number> {
  let added = 0;
  for (const designScreenId of builtIds) {
    if (findFrame(deps, designScreenId)) continue;
    if (await ensureDesignScreen(deps, designScreenId)) added += 1;
  }
  return added;
}

export async function focusDesignScreen(deps: BoardDeps, designScreenId: string): Promise<boolean> {
  const element = await ensureDesignScreen(deps, designScreenId);
  if (!element) return false;
  deps.api.scrollToContent([element], { fitToViewport: true, viewportZoomFactor: 0.8, animate: false });
  return true;
}

export { screenIdFromLink };
```

  (The final re-export keeps one import path for callers; remove it if lint flags it as unused.)

Run the test → PASS. If `restoreElements` inside `addScreenFrame` cannot run under the test environment, run the file with `// @vitest-environment jsdom` at the top (the existing `star-section.test.ts` in this folder shows the working setup).

- [ ] **Step 3: Server action for built ids** — append to `load-screen.ts`:

```ts
// The ids of every built, non-deleted design screen in the room, for adding
// the ones the board does not show yet.
export async function listBuiltRoomScreenIds(roomId: string): Promise<string[]> {
  const screens = await listRoomCanvasScreens(roomId);
  return screens.filter((screen) => screen.state === "built").map((screen) => screen.id);
}
```

- [ ] **Step 4: Wire into `excalidraw-board.tsx`**
  1. Add to the `window.__orionBoard` type: `focusScreen: (designScreenId: string) => Promise<boolean>;`.
  2. Inside `onApi`, after `window.__orionBoard = {...}` is built, create deps and expose the method. The `loadDocument` is the same recipe `own-ai-deps.ts` uses:

```ts
      const deps: BoardDeps = {
        api: next,
        store,
        loadDocument: async (designScreenId) => {
          if (!roomId) return null;
          const screen = await loadRoomScreen(roomId, designScreenId);
          if (!screen) return null;
          return buildFramePreviewDoc(screen, previewTheme(getComputedStyle(document.body)), previewChromeCss);
        },
      };
      window.__orionBoard.focusScreen = (designScreenId) => focusDesignScreen(deps, designScreenId);
      if (roomId && access === "edit") {
        void (async () => {
          const deadline = Date.now() + 20_000;
          while (!readyToFocus() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 250));
          if (!readyToFocus()) return;
          try { await backfillDesignScreens(deps, await listBuiltRoomScreenIds(roomId)); } catch { /* the board still works without them */ }
        })();
      }
```

  3. Add the imports (`focusDesignScreen`, `backfillDesignScreens`, `type BoardDeps` from `./design-screen-board`; `loadRoomScreen`, `listBuiltRoomScreenIds` from `./load-screen`; `buildFramePreviewDoc` from `@/features/canvas/screen-preview-doc`; `previewChromeCss`, `previewTheme` from `@/features/canvas-next/preview-theme`).
  4. `readyToFocus` is defined just above `window.__orionBoard = {...}`; keep the backfill code after it.

- [ ] **Step 5: Mac: focus the screen from the chat** — in `ProjectScreen.swift`:
  - `canvasFocusKey`: change the last component to `frame.canvasStarID ?? frame.canvasScreenID ?? "project"`.
  - In `syncCanvasFocus()`, before the `canvasStar(in:)` branch add:

```swift
        if let screenID = frame.canvasScreenID {
            let ok = await runCanvasCommand(
                "return window.__orionBoard?.roomId === roomId && (await window.__orionBoard.focusScreen(screenId)) === true",
                arguments: ["roomId": roomID, "screenId": screenID]
            )
            if !ok && !Task.isCancelled { frame.errorMessage = "Canvas is still loading. Try again." }
            return
        }
```

  - In the Artifacts panel, where a screen artifact row is opened (find the code that handles `artifact.kind == .screen` / `previewArtifact`), call `frame.openScreenInCanvas(<screen id>)` where the artifact id has the form `screen:<id>` (strip the `screen:` prefix) instead of loading the old `?tab=prototype` page.

- [ ] **Step 6: Run everything**

```bash
cd apps/web && pnpm exec vitest run src/features/canvas-excalidraw src/features/native && pnpm typecheck && pnpm exec eslint src/features/canvas-excalidraw --quiet
cd ../mac && swift build 2>&1 | grep -E "error|Build"; swift test 2>&1 | tail -2
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps && git commit -m "feat(canvas): show design screens on the board, backfill old ones, focus from chat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verify end to end, then roll out

**Files:** none new; this task is checks and delivery.

- [ ] **Step 1: Full local gate** (same as CI)

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm typecheck && pnpm test:workspace && pnpm test:astryx && pnpm check:astryx && pnpm test:colocation && pnpm test:sql && pnpm test:conductor
(cd apps/web && pnpm exec eslint src --quiet)
(cd apps/mac && swift build && swift test 2>&1 | tail -2)
```

Expected: every command exits 0. For pgTAP, run the whole directory on the scratch DB as in Task 1 Step 2 (all files `ok`).

- [ ] **Step 2: e2e** — start the e2e web server on a spare port and run the full suite as in the earlier CI-fix session (`MELD_E2E_PORT=3105`, temporary config in `.context/` that disables `webServer`). Expected: 0 failures. Add one e2e if any existing spec asserted the old no-card chat.

- [ ] **Step 3: Look at it** — run `apps/mac/scripts/preview.sh`; in the demo project: (a) send a message and see the working line; (b) in the Artifacts panel open a screen and confirm the Canvas opens with that screen focused; (c) if the demo data has built screens, confirm cards appear in the chat and click one. Save screenshots in `.context/` and inspect them.

- [ ] **Step 4: Rebuild and reinstall the connector** (point 14 of the local-setup notes) so the new Product Agent prompt is live:

```bash
cd apps/connector && pnpm build
grep -c "design_screen" dist/agent.mjs
cp dist/agent.mjs "$HOME/Library/Application Support/Meld/connector/current/agent.mjs"
grep -c "design_screen" "$HOME/Library/Application Support/Meld/connector/current/agent.mjs"
launchctl kickstart -k gui/$(id -u)/com.meld.agent
cat "$HOME/Library/Application Support/Meld/config.json" | grep gatewayUrl
```

Expected: both counts are at least 1, and `gatewayUrl` is `wss://orion-gateway.nicholasodunsi.workers.dev/ws` (production). If it shows `127.0.0.1`, stop and re-pair to production (see the Orion Online runbook); never leave the installed connector on the local gateway.

- [ ] **Step 5: Open the PR and wait for CI** — `git push -u origin <branch>`, `gh pr create --base main` with a body listing the four parts and the one additive migration, then wait for `database`, `validate`, `gateway-integration` and `e2e` to pass (about 12 minutes). Do not merge without the owner's go-ahead: the merge deploys the migration, gateway and website to production.

- [ ] **Step 6: After the owner approves and the deploy finishes** (`gh run list --workflow=deploy.yml`), check production: send "design a mobile screen for me" from the Mac app; expect one short question, then after the answer the "Designing…" line and card, then the finished screen; open the Canvas and confirm the three older screens are on the board and in the chat history. Report anything that does not match.
