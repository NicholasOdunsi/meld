# Native Taste — Plan 1: Apple rules + Taste API for the Mac app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two backend pieces the native Taste screen needs: (1) the Apple-rules guardrail block that Orion adds to screen-design instructions, and (2) a Shelf-key Taste API (`/api/shelf/taste…`) the Mac app can call.

**Architecture:** The Apple block is a pure formatter plus a new slot in `composeInstruction`, fed by a new `apple_rules` column on `taste_profiles`. The Mac app authenticates with the Shelf key (service role, no `auth.uid()`), so it gets its own `capture_*` SQL functions that take `actor_user_id`, exactly like the Inspiration library does. A `ShelfTaste` service wraps them, and thin routes sit on top, reusing the existing taste logic (`applyTasteOperation`, the rejected-avoid rule).

**Tech Stack:** Next.js route handlers, zod (`@meld/contracts`), Supabase (Postgres + pgTAP), vitest.

**Spec:** `docs/superpowers/specs/2026-11-10-native-taste-design.md` (sections B5, B5a, build-order step 1).

**Plans 2 and 3 (not in this file):** native screen (chapters, sample, panel swap) and composer + cards. They are written after this plan is built so they use the real route shapes.

## Global Constraints

- Apple block cap: **450 characters**. Task instruction cap stays **4,000**; taste block cap stays **700**.
- Trim order when over budget: inspiration lines first, then the Apple block, then the taste block; the owner's words are never trimmed.
- Apple rules apply only to Apple targets (iPhone, iPad, Mac app). Web and Android get no block.
- Precedence is stated inside the block: Apple rules beat taste on usability; taste beats them on look; a room design system wins on brand colours and fonts.
- `apple_rules` defaults to **on**.
- The Shelf key may read/change the taste board and apple switch. It still must not read messages, PRDs or canvases.
- Shelf taste errors reuse `ShelfErrorCode` (`unauthorized`, `invalid_request`, `not_found`, `unavailable`); a version conflict is `409 {"status":"conflict"}`.
- All commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Run web tests with `pnpm --filter web test -- <path>` (the web package's test script is `vitest run`; confirm the filter name with `cat apps/web/package.json | grep '"name"'` and adjust if it differs). Run pgTAP with `supabase test db` per the "Meld local setup" memory (CLI 2.109.1 pin, colima socket fix).

## File Structure

| File | Job |
|---|---|
| `apps/web/src/features/inspiration/picking/format-apple-rules-block.ts` (new) | Pure: board + target + switch → the ≤450-char block (or `""`) |
| `apps/web/src/features/inspiration/picking/format-apple-rules-block.test.ts` (new) | Its tests |
| `apps/web/src/features/inspiration/picking/compose-instruction.ts` (modify) | New `appleBlock` slot and trim order |
| `apps/web/src/features/inspiration/picking/load-taste-board.ts` (modify) | Also read `apple_rules` (new `loadTasteProfile`) |
| `apps/web/src/features/design/design-screen-generation.ts` (modify) | Pass the Apple block into `composeInstruction` |
| `supabase/migrations/20261110000001_taste_apple_rules.sql` (new) | `apple_rules` column |
| `supabase/migrations/20261110000002_capture_taste.sql` (new) | `capture_*` taste functions for the Shelf key |
| `supabase/tests/capture_taste.test.sql` (new) | pgTAP for those functions |
| `packages/contracts/src/taste.ts` (modify) | Shelf taste request/response schemas |
| `apps/web/src/features/inspiration/taste/taste-board-ops.ts` (new) | `withRejectedAvoid` moved out of the server-action file so both paths share it |
| `apps/web/src/features/inspiration/shelf-taste.ts` (new) | `ShelfTaste` service (real + fake) |
| `apps/web/src/app/api/shelf/taste/…/route.ts` (new) | The four routes |

---

### Task 1: Apple rules block formatter

**Files:**
- Create: `apps/web/src/features/inspiration/picking/format-apple-rules-block.ts`
- Test: `apps/web/src/features/inspiration/picking/format-apple-rules-block.test.ts`

**Interfaces:**
- Produces: `APPLE_BLOCK_MAX_CHARS = 450`; `isAppleTarget(device: InspirationDevice | null, instruction: string): boolean`; `formatAppleRulesBlock(input: { enabled: boolean; appleTarget: boolean; board: TasteBoard | null }): string`

- [ ] **Step 1: Write the failing test**

```ts
// format-apple-rules-block.test.ts
import { describe, expect, it } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { APPLE_BLOCK_MAX_CHARS, formatAppleRulesBlock, isAppleTarget } from "./format-apple-rules-block";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

describe("isAppleTarget", () => {
  it("is true for mobile, tablet and desktop apps", () => {
    expect(isAppleTarget("mobile", "a login screen")).toBe(true);
    expect(isAppleTarget("tablet", "a login screen")).toBe(true);
    expect(isAppleTarget("desktop_app", "a mac app settings screen")).toBe(true);
  });
  it("is false for web, unknown devices and explicit non-Apple wording", () => {
    expect(isAppleTarget("web", "a landing page")).toBe(false);
    expect(isAppleTarget(null, "a login screen")).toBe(false);
    expect(isAppleTarget("mobile", "an Android login with Material design")).toBe(false);
    expect(isAppleTarget("desktop_app", "a Windows app")).toBe(false);
  });
});

describe("formatAppleRulesBlock", () => {
  it("returns the rules for an Apple target when the switch is on", () => {
    const block = formatAppleRulesBlock({ enabled: true, appleTarget: true, board: BOARD });
    expect(block.startsWith("APPLE RULES")).toBe(true);
    expect(block).toContain("tap targets at least 44pt");
    expect(block).toContain("taste wins on look");
    expect(block).toContain("room design system wins brand colour and fonts");
    expect(block.length).toBeLessThanOrEqual(APPLE_BLOCK_MAX_CHARS);
  });
  it("is empty when the switch is off or the target is not Apple", () => {
    expect(formatAppleRulesBlock({ enabled: false, appleTarget: true, board: BOARD })).toBe("");
    expect(formatAppleRulesBlock({ enabled: true, appleTarget: false, board: BOARD })).toBe("");
  });
  it("tells the AI to use Regular when taste asks for Light, and stays under the cap", () => {
    const light = { ...BOARD, typography: { ...BOARD.typography, weight: "light" as const } };
    const block = formatAppleRulesBlock({ enabled: true, appleTarget: true, board: light });
    expect(block).toContain("use Regular, not Light");
    expect(block.length).toBeLessThanOrEqual(APPLE_BLOCK_MAX_CHARS);
  });
  it("works with no taste board", () => {
    expect(formatAppleRulesBlock({ enabled: true, appleTarget: true, board: null })).toContain("APPLE RULES");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- format-apple-rules-block`
Expected: FAIL, "Cannot find module './format-apple-rules-block'".

- [ ] **Step 3: Write the implementation**

```ts
// format-apple-rules-block.ts
import type { InspirationDevice, TasteBoard } from "@meld/contracts";

export const APPLE_BLOCK_MAX_CHARS = 450;

const NON_APPLE = /\b(android|material design|windows|linux|pixel|samsung)\b/i;
const APPLE_DEVICES: InspirationDevice[] = ["mobile", "tablet", "desktop_app"];

/**
 * Inspiration labels only say "mobile", not iPhone vs Android, so a mobile,
 * tablet or desktop-app target counts as Apple unless the owner's words name
 * another platform.
 */
export function isAppleTarget(device: InspirationDevice | null, instruction: string): boolean {
  return device !== null && APPLE_DEVICES.includes(device) && !NON_APPLE.test(instruction);
}

const HEADER =
  "APPLE RULES (HIG; beat taste on usability, taste wins on look, room design system wins brand colour and fonts):";
const RULES = [
  "- tap targets at least 44pt",
  "- body 17pt iOS, 13pt Mac; never under 11pt (Mac 10pt)",
  "- Regular to Bold weights only; no Light or Thin",
  "- at most 2 typefaces; hierarchy via weight, size, colour",
  "- key content top and leading; group with space",
  "- controls distinct from content; readable contrast in Light and Dark",
];
const LIGHT_NOTE = "- use Regular, not Light";

export function formatAppleRulesBlock({
  enabled,
  appleTarget,
  board,
}: {
  enabled: boolean;
  appleTarget: boolean;
  board: TasteBoard | null;
}): string {
  if (!enabled || !appleTarget) return "";
  const lines = [HEADER, ...RULES];
  if (board?.typography.weight === "light") lines.push(LIGHT_NOTE);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test -- format-apple-rules-block`
Expected: PASS (all). The Light variant is 444 characters; if a count is off, shorten wording, never raise the cap.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inspiration/picking/format-apple-rules-block.ts apps/web/src/features/inspiration/picking/format-apple-rules-block.test.ts
git commit -m "feat(taste): Apple rules block formatter

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Add the Apple block to `composeInstruction`

**Files:**
- Modify: `apps/web/src/features/inspiration/picking/compose-instruction.ts`
- Modify: `apps/web/src/features/inspiration/picking/compose-instruction.test.ts`

**Interfaces:**
- Consumes: Task 1's block string.
- Produces: `composeInstruction({ base, tasteBlock, appleBlock?, inspiration, maxChars? })`. Order is base → taste → apple → inspiration. Trim order: inspiration, then apple, then (as today) everything but base.

- [ ] **Step 1: Write the failing tests** (append inside the existing `describe("composeInstruction")`)

```ts
  it("puts the Apple block after taste and before inspiration", () => {
    const out = composeInstruction({
      base: "make a login",
      tasteBlock: "YOUR TASTE x",
      appleBlock: "APPLE RULES y",
      inspiration: [pick(1)],
    });
    expect(out.indexOf("YOUR TASTE")).toBeLessThan(out.indexOf("APPLE RULES"));
    expect(out.indexOf("APPLE RULES")).toBeLessThan(out.indexOf("INSPIRATION"));
  });

  it("drops inspiration, then the Apple block, then taste, never the base", () => {
    const base = "b".repeat(3000);
    const taste = "YOUR TASTE " + "t".repeat(500);
    const apple = "APPLE RULES " + "a".repeat(400);
    const withInspiration = composeInstruction({ base, tasteBlock: taste, appleBlock: apple, inspiration: [pick(1)] });
    expect(withInspiration).toContain(apple);
    const noRoomForApple = composeInstruction({ base: "b".repeat(3400), tasteBlock: taste, appleBlock: apple, inspiration: [pick(1)] });
    expect(noRoomForApple).toContain(taste);
    expect(noRoomForApple).not.toContain("APPLE RULES");
    expect(noRoomForApple.length).toBeLessThanOrEqual(4000);
    expect(composeInstruction({ base: "b".repeat(3900), tasteBlock: taste, appleBlock: apple, inspiration: [] })).toBe("b".repeat(3900));
  });

  it("behaves as before when no Apple block is passed", () => {
    expect(composeInstruction({ base: "x", tasteBlock: "", inspiration: [] })).toBe("x");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- compose-instruction`
Expected: FAIL (`appleBlock` ignored: the Apple text is missing from the output).

- [ ] **Step 3: Implement**

Replace the body of `compose-instruction.ts` with:

```ts
import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → Apple rules → inspiration, within the task limit. The owner's
 * words are never trimmed; inspiration lines go first, then the Apple block,
 * then the taste block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  appleBlock = "",
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  appleBlock?: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, appleBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  const withoutApple = join(base, tasteBlock);
  return withoutApple.length <= maxChars ? withoutApple : base;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter web test -- compose-instruction`
Expected: PASS, including the four existing tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inspiration/picking/compose-instruction.ts apps/web/src/features/inspiration/picking/compose-instruction.test.ts
git commit -m "feat(taste): Apple rules slot in composeInstruction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `apple_rules` column, loader, and generation wiring

**Files:**
- Create: `supabase/migrations/20261110000001_taste_apple_rules.sql`
- Modify: `apps/web/src/features/inspiration/picking/load-taste-board.ts`
- Modify: `apps/web/src/features/inspiration/picking/load-taste-board.test.ts`
- Modify: `apps/web/src/features/design/design-screen-generation.ts:60-90`
- Test: `apps/web/src/features/design/design-screen-generation.test.ts` (extend if it asserts `composeInstruction` args; otherwise add one case)

**Interfaces:**
- Consumes: `formatAppleRulesBlock`, `isAppleTarget` (Task 1), `inferTarget` (existing, `picking/infer-target.ts`).
- Produces: `loadTasteProfile(supabase, roomId): Promise<{ board: TasteBoard | null; appleRules: boolean }>` (defaults `{ board: null, appleRules: true }` on any problem); `loadTasteBoard` keeps its signature and delegates.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261110000001_taste_apple_rules.sql
-- Apple HIG guardrail switch for the native Taste screen
-- (spec: docs/superpowers/specs/2026-11-10-native-taste-design.md, B5a).
alter table public.taste_profiles
  add column apple_rules boolean not null default true;
```

- [ ] **Step 2: Write the failing loader test** (append to `load-taste-board.test.ts`; match the file's existing mock style — read its first 30 lines first and reuse its `supabase` fake builder)

```ts
import { loadTasteProfile } from "./load-taste-board";

it("loadTasteProfile returns the board and the apple switch", async () => {
  const supabase = fakeSupabase({
    rooms: { workspace_id: WS },
    taste_profiles: { board: BOARD, apple_rules: false },
  });
  expect(await loadTasteProfile(supabase, ROOM)).toEqual({ board: BOARD, appleRules: false });
});

it("loadTasteProfile defaults to no board and rules on when anything fails", async () => {
  const supabase = fakeSupabase({ rooms: null, taste_profiles: null });
  expect(await loadTasteProfile(supabase, ROOM)).toEqual({ board: null, appleRules: true });
});
```

(`fakeSupabase`, `WS`, `ROOM`, `BOARD` are whatever the existing test file already defines; if it has no builder, copy the two-table `.from().select().eq().maybeSingle()` chain mock used by its current cases.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter web test -- load-taste-board`
Expected: FAIL, `loadTasteProfile` is not exported.

- [ ] **Step 4: Implement the loader**

In `load-taste-board.ts`, replace `loadTasteBoard` with:

```ts
export type LoadedTaste = { board: TasteBoard | null; appleRules: boolean };
const NO_TASTE: LoadedTaste = { board: null, appleRules: true };

// Best-effort, session-scoped: RLS returns only the caller's own profile.
export async function loadTasteProfile(supabase: SupabaseClient, roomId: string): Promise<LoadedTaste> {
  try {
    const room = await supabase.from("rooms").select("workspace_id").eq("id", roomId).maybeSingle();
    const parsedRoom = RoomSchema.safeParse(room.data);
    if (room.error || !parsedRoom.success) return NO_TASTE;
    const profile = await supabase
      .from("taste_profiles")
      .select("board,apple_rules")
      .eq("workspace_id", parsedRoom.data.workspace_id)
      .maybeSingle();
    if (profile.error || !profile.data) return NO_TASTE;
    const row = profile.data as { board: unknown; apple_rules?: boolean };
    const board = TasteBoardSchema.safeParse(row.board);
    return { board: board.success ? board.data : null, appleRules: row.apple_rules !== false };
  } catch {
    return NO_TASTE;
  }
}

export async function loadTasteBoard(supabase: SupabaseClient, roomId: string): Promise<TasteBoard | null> {
  return (await loadTasteProfile(supabase, roomId)).board;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter web test -- load-taste-board`
Expected: PASS.

- [ ] **Step 6: Wire generation.** In `design-screen-generation.ts` change the imports and the block at lines 60-90:

```ts
import { formatAppleRulesBlock, isAppleTarget } from "@/features/inspiration/picking/format-apple-rules-block";
import { inferTarget } from "@/features/inspiration/picking/infer-target";
import { loadTasteProfile } from "@/features/inspiration/picking/load-taste-board";
```

Replace the `Promise.all` and `composeInstruction` call with:

```ts
    const [taste, picks] = await Promise.all([
      loadTasteProfile(supabase, parsed.data.roomId),
      loadInspirationPicks(supabase, {
        roomId: parsed.data.roomId,
        instruction: parsed.data.instruction,
        screenName: parsed.data.name ?? null,
      }),
    ]);
    const target = inferTarget({
      instruction: parsed.data.instruction,
      screenName: parsed.data.name ?? null,
      roomFormFactors: [],
    });
    const taskInstruction = composeInstruction({
      base: instruction,
      tasteBlock: formatTasteBlock(taste.board),
      appleBlock: formatAppleRulesBlock({
        enabled: taste.appleRules,
        appleTarget: isAppleTarget(target.device, parsed.data.instruction),
        board: taste.board,
      }),
      inspiration: picks,
    });
```

Before editing, read how `loadInspirationPicks` gets `roomFormFactors` (`grep -n roomFormFactors apps/web/src/features/inspiration/picking/*.ts`). If it loads the room's form factors, load them once and pass the same array to `inferTarget` here instead of `[]`, so a mobile room counts as Apple even when the instruction doesn't say "iPhone".

- [ ] **Step 7: Add the generation test.** In `design-screen-generation.test.ts`, add a case: mock `loadTasteProfile` to return `{ board: BOARD, appleRules: true }`, call generation with instruction `"an iPhone login screen"`, and assert the `target_instruction` passed to `create_design_screen_task` (or whichever rpc the file already asserts) contains `"APPLE RULES"`. Add a second case with `appleRules: false` asserting it does not.

- [ ] **Step 8: Run the affected tests**

Run: `pnpm --filter web test -- design-screen-generation load-taste-board compose-instruction`
Expected: PASS.

- [ ] **Step 9: Apply the migration locally and commit**

Run: `supabase db reset` (local, per the setup memory) and confirm `\d public.taste_profiles` shows `apple_rules boolean not null default true`.

```bash
git add supabase/migrations/20261110000001_taste_apple_rules.sql apps/web/src/features/inspiration/picking apps/web/src/features/design
git commit -m "feat(taste): apple_rules switch feeds screen generation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Shelf-key taste functions in SQL

**Files:**
- Create: `supabase/migrations/20261110000002_capture_taste.sql`
- Test: `supabase/tests/capture_taste.test.sql`

**Interfaces:**
- Produces (all `security definer`, `search_path = ''`, executable only by `service_role`, membership via the existing `public.inspiration_actor_is_member(actor, workspace)`; failures raise `P0001` with message `not_authorized` / `not_found` / `invalid_request`, matching `capture_*_inspiration`):
  - `capture_get_taste(actor_user_id uuid, target_workspace_id uuid) returns jsonb` → `null` when no profile yet, else `{board, version, apple_rules, locks}`
  - `capture_list_taste_suggestions(actor_user_id uuid, target_workspace_id uuid) returns jsonb` → array of `{id, tile, op, value, reason, evidence_item_ids}` (pending, oldest first)
  - `capture_save_taste_board(actor_user_id uuid, target_workspace_id uuid, new_board jsonb, expected_version integer, lock_tile text) returns integer` → new version, or `null` on a version mismatch
  - `capture_decide_taste_suggestion(actor_user_id uuid, target_suggestion_id uuid, decision text, new_board jsonb, expected_version integer) returns text` → `kept`/`rejected`/`superseded`
  - `capture_set_apple_rules(actor_user_id uuid, target_workspace_id uuid, enabled boolean) returns void`

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/capture_taste.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','taste-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','taste-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Taste WS','e1000000-0000-4000-8000-000000000001');
insert into public.taste_profiles (workspace_id, user_id, board, version)
values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
        '{"density":"airy"}'::jsonb, 1);
insert into public.taste_suggestions (id, workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
        gen_random_uuid(),'density','set','"balanced"','density:set:balanced','Seen lately',1);

select is(
  (public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001'))->>'version',
  '1', 'owner reads the profile');
select is(
  (public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001'))->>'apple_rules',
  'true', 'apple_rules defaults to on');
select throws_ok(
  $$ select public.capture_get_taste('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001') $$,
  'P0001', 'not_authorized', 'a non-member cannot read the profile');
select is(
  jsonb_array_length(public.capture_list_taste_suggestions('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001')),
  1, 'lists the pending suggestion');

select is(
  public.capture_save_taste_board('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','{"density":"dense"}'::jsonb, 1, 'density'),
  2, 'save bumps the version');
select is(
  public.capture_save_taste_board('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','{"density":"light"}'::jsonb, 1, null),
  null, 'a stale version returns null');
select is(
  (select locks ? 'density' from public.taste_profiles where workspace_id = 'e2000000-0000-4000-8000-000000000001'),
  true, 'editing a tile locks it');
select throws_ok(
  $$ select public.capture_save_taste_board('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','{}'::jsonb, 2, null) $$,
  'P0001', 'not_authorized', 'a non-member cannot save');

select is(
  public.capture_decide_taste_suggestion('e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','kept','{"density":"balanced"}'::jsonb, 2),
  'kept', 'keeping applies the board');
select is(
  public.capture_decide_taste_suggestion('e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','rejected','{}'::jsonb, 3),
  'kept', 'deciding twice returns the first decision');

select lives_ok(
  $$ select public.capture_set_apple_rules('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001', false) $$,
  'owner can switch Apple rules off');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db`
Expected: FAIL, "function public.capture_get_taste(uuid, uuid) does not exist".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261110000002_capture_taste.sql
-- Taste functions for the Shelf key (Mac app). The route has already resolved
-- the token to (actor, workspace); these never use auth.uid().
-- Board contents are validated in TypeScript (zod) before every write.

create function public.capture_get_taste(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile public.taste_profiles;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into profile from public.taste_profiles
  where workspace_id = target_workspace_id and user_id = actor_user_id and board is not null;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'board', profile.board, 'version', profile.version,
    'apple_rules', profile.apple_rules, 'locks', profile.locks);
end;
$$;

create function public.capture_list_taste_suggestions(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'tile', s.tile, 'op', s.op, 'value', s.value,
      'reason', s.reason, 'evidence_item_ids', to_jsonb(s.evidence_item_ids)) order by s.created_at, s.id)
    from public.taste_suggestions s
    where s.workspace_id = target_workspace_id and s.user_id = actor_user_id and s.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

create function public.capture_save_taste_board(
  actor_user_id uuid, target_workspace_id uuid, new_board jsonb, expected_version integer, lock_tile text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if new_board is null or jsonb_typeof(new_board) <> 'object' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if lock_tile is not null and lock_tile not in
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles
  set board = new_board,
      version = version + 1,
      locks = case when lock_tile is null then locks
                   else jsonb_set(locks, array[lock_tile], to_jsonb(public.taste_sorted_count(target_workspace_id, actor_user_id))) end,
      updated_at = now()
  where workspace_id = target_workspace_id and user_id = actor_user_id
    and version = expected_version and board is not null
  returning version into next_version;
  return next_version;
end;
$$;

create function public.capture_decide_taste_suggestion(
  actor_user_id uuid, target_suggestion_id uuid, decision text, new_board jsonb, expected_version integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion public.taste_suggestions;
  current_version integer;
begin
  if decision not in ('kept', 'rejected') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into suggestion from public.taste_suggestions
  where id = target_suggestion_id and user_id = actor_user_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not public.inspiration_actor_is_member(actor_user_id, suggestion.workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if suggestion.status <> 'pending' then
    return suggestion.status;
  end if;
  select version into current_version from public.taste_profiles
  where workspace_id = suggestion.workspace_id and user_id = actor_user_id
  for update;
  if new_board is null or jsonb_typeof(new_board) <> 'object' or current_version is distinct from expected_version then
    update public.taste_suggestions set status = 'superseded', decided_at = now() where id = target_suggestion_id;
    return 'superseded';
  end if;
  update public.taste_profiles
  set board = new_board, version = version + 1, updated_at = now()
  where workspace_id = suggestion.workspace_id and user_id = actor_user_id;
  update public.taste_suggestions set status = decision, decided_at = now() where id = target_suggestion_id;
  return decision;
end;
$$;

create function public.capture_set_apple_rules(actor_user_id uuid, target_workspace_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.taste_profiles set apple_rules = enabled, updated_at = now()
  where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.capture_get_taste(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_list_taste_suggestions(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_save_taste_board(uuid, uuid, jsonb, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_decide_taste_suggestion(uuid, uuid, text, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.capture_set_apple_rules(uuid, uuid, boolean) from public, anon, authenticated, service_role;

grant execute on function public.capture_get_taste(uuid, uuid) to service_role;
grant execute on function public.capture_list_taste_suggestions(uuid, uuid) to service_role;
grant execute on function public.capture_save_taste_board(uuid, uuid, jsonb, integer, text) to service_role;
grant execute on function public.capture_decide_taste_suggestion(uuid, uuid, text, jsonb, integer) to service_role;
grant execute on function public.capture_set_apple_rules(uuid, uuid, boolean) to service_role;
```

- [ ] **Step 4: Run to verify it passes**

Run: `supabase db reset && supabase test db`
Expected: `capture_taste.test.sql` passes 11/11; the rest of the suite is unchanged. Per the "branch-pure pgTAP scratch-DB" memory, if other branches' migrations pollute the local DB, run against a clean scratch DB.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261110000002_capture_taste.sql supabase/tests/capture_taste.test.sql
git commit -m "feat(db): capture_* taste functions for the Shelf key

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Contracts and shared board operation

**Files:**
- Modify: `packages/contracts/src/taste.ts` (append)
- Modify: `packages/contracts/src/taste.test.ts` (append)
- Create: `apps/web/src/features/inspiration/taste/taste-board-ops.ts`
- Modify: `apps/web/src/features/inspiration/taste/taste-actions.ts` (import `withRejectedAvoid` instead of defining it)
- Test: `apps/web/src/features/inspiration/taste/taste-board-ops.test.ts`

**Interfaces:**
- Produces (contracts):
  - `ShelfTasteSuggestionSchema = { id: uuid, tile, op, value: unknown, reason: string, evidenceItemIds: uuid[] }`
  - `ShelfTasteSnapshotSchema = { board, version: int, appleRules: boolean, pending: ShelfTasteSuggestion[] }` plus type `ShelfTasteSnapshot`
  - `ShelfTasteTileRequestSchema = { tile: TasteTile, value: unknown, expectedVersion: int ≥ 0 }` (strict)
  - `ShelfTasteDecisionRequestSchema = { decision: "kept" | "rejected", expectedVersion: int ≥ 0 }` (strict)
  - `ShelfAppleRulesRequestSchema = { enabled: boolean }` (strict)
- Produces (web): `withRejectedAvoid(board: TasteBoard, op: TasteOperation): TasteBoard`

- [ ] **Step 1: Write the failing contract tests** (append to `taste.test.ts`)

```ts
import {
  ShelfAppleRulesRequestSchema,
  ShelfTasteDecisionRequestSchema,
  ShelfTasteSnapshotSchema,
  ShelfTasteTileRequestSchema,
} from "./taste";

describe("Shelf taste contracts", () => {
  it("accepts a snapshot and a tile save", () => {
    expect(
      ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, appleRules: true, pending: [] }).success,
    ).toBe(true);
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "density", value: "airy", expectedVersion: 2 }).success).toBe(true);
  });
  it("rejects unknown tiles, bad decisions and extra keys", () => {
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "mood", value: 1, expectedVersion: 0 }).success).toBe(false);
    expect(ShelfTasteDecisionRequestSchema.safeParse({ decision: "maybe", expectedVersion: 0 }).success).toBe(false);
    expect(ShelfAppleRulesRequestSchema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);
  });
});
```

(`BOARD` is the board constant already defined at the top of `taste.test.ts`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts test -- taste`
Expected: FAIL, the new schemas are not exported. (If the package name differs, find it with `grep '"name"' packages/contracts/package.json`.)

- [ ] **Step 3: Add the schemas** (append to `taste.ts`; `TASTE_TILES` and `TasteBoardSchema` already exist in that file)

```ts
export const ShelfTasteSuggestionSchema = z.object({
  id: z.string().uuid(),
  tile: z.enum(TASTE_TILES),
  op: z.enum(["add", "remove", "set"]),
  value: z.unknown(),
  reason: z.string(),
  evidenceItemIds: z.array(z.string().uuid()),
});
export type ShelfTasteSuggestion = z.infer<typeof ShelfTasteSuggestionSchema>;

export const ShelfTasteSnapshotSchema = z.object({
  board: TasteBoardSchema,
  version: z.number().int().min(0),
  appleRules: z.boolean(),
  pending: z.array(ShelfTasteSuggestionSchema),
});
export type ShelfTasteSnapshot = z.infer<typeof ShelfTasteSnapshotSchema>;

export const ShelfTasteTileRequestSchema = z
  .object({ tile: z.enum(TASTE_TILES), value: z.unknown(), expectedVersion: z.number().int().min(0) })
  .strict();
export const ShelfTasteDecisionRequestSchema = z
  .object({ decision: z.enum(["kept", "rejected"]), expectedVersion: z.number().int().min(0) })
  .strict();
export const ShelfAppleRulesRequestSchema = z.object({ enabled: z.boolean() }).strict();
```

Check `grep -n "TASTE_TILES" packages/contracts/src/taste.ts`; if the tile list constant has another name, use it.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/contracts test -- taste`
Expected: PASS. Then rebuild if the web app consumes a built `dist` (`grep '"main"' packages/contracts/package.json`).

- [ ] **Step 5: Write the failing board-op test**

```ts
// taste-board-ops.test.ts
import { describe, expect, it } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { withRejectedAvoid } from "./taste-board-ops";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: ["Pill buttons"],
  avoid: [],
};

describe("withRejectedAvoid", () => {
  it("records a rejected addition as a dislike", () => {
    const next = withRejectedAvoid(BOARD, { tile: "signatureDetails", op: "add", value: "Heavy shadows" });
    expect(next.avoid).toEqual([{ text: "Heavy shadows", source: "rejected" }]);
  });
  it("leaves the board alone for sets, removes and avoid additions", () => {
    expect(withRejectedAvoid(BOARD, { tile: "density", op: "set", value: "dense" })).toBe(BOARD);
    expect(withRejectedAvoid(BOARD, { tile: "signatureDetails", op: "remove", value: "Pill buttons" })).toBe(BOARD);
    expect(withRejectedAvoid(BOARD, { tile: "avoid", op: "add", value: { text: "x", source: "typed" } })).toBe(BOARD);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter web test -- taste-board-ops`
Expected: FAIL, module not found.

- [ ] **Step 7: Move the function.** Create `taste-board-ops.ts`:

```ts
import { applyTasteOperation, type TasteBoard, type TasteOperation } from "@meld/contracts";
import { tasteValueLabel } from "./describe-suggestion";

/** Not me on an add records the value as a dislike (taste-profile spec B3). */
export function withRejectedAvoid(board: TasteBoard, op: TasteOperation): TasteBoard {
  if (op.op !== "add" || op.tile === "avoid") return board;
  const next = applyTasteOperation(board, {
    tile: "avoid",
    op: "add",
    value: { text: tasteValueLabel(op).slice(0, 80), source: "rejected" },
  });
  return next ?? board;
}
```

In `taste-actions.ts` delete the local `withRejectedAvoid` (the function at "Not me on an add records…") and add `import { withRejectedAvoid } from "./taste-board-ops";`. `"use server"` files may only export async functions, which is why it moves out instead of being exported.

- [ ] **Step 8: Run the taste tests**

Run: `pnpm --filter web test -- taste`
Expected: PASS, including the existing `taste-actions.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/taste.ts packages/contracts/src/taste.test.ts apps/web/src/features/inspiration/taste
git commit -m "feat(taste): Shelf taste contracts and shared rejected-avoid rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ShelfTaste` service

**Files:**
- Create: `apps/web/src/features/inspiration/shelf-taste.ts`
- Test: `apps/web/src/features/inspiration/shelf-taste.test.ts`

**Interfaces:**
- Consumes: `ShelfPrincipal` (`shelf-auth.ts`), `ShelfErrorCode` (contracts), Task 4's RPCs, Task 5's schemas and `withRejectedAvoid`, `applyTasteOperation`, `TasteBoardSchema`, `TasteOperationSchema`.
- Produces:

```ts
export type ShelfTasteError = ShelfErrorCode;
export type ShelfTasteResult<T> = { ok: true; value: T } | { ok: false; error: ShelfTasteError | "conflict" };
export type ShelfTaste = {
  get(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>>; // null = no board yet
  saveTile(input: { tile: TasteTile; value: unknown; expectedVersion: number }): Promise<ShelfTasteResult<{ version: number }>>;
  decide(input: { suggestionId: string; decision: "kept" | "rejected"; expectedVersion: number }): Promise<ShelfTasteResult<{ status: "kept" | "rejected" | "superseded" }>>;
  setAppleRules(enabled: boolean): Promise<ShelfTasteResult<{ enabled: boolean }>>;
};
export function createShelfTaste(client: SupabaseClient, principal: ShelfPrincipal): ShelfTaste;
export function createFakeShelfTaste(principal: ShelfPrincipal): ShelfTaste;
```

- [ ] **Step 1: Write the failing test**

```ts
// shelf-taste.test.ts
import { describe, expect, it, vi } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { createShelfTaste } from "./shelf-taste";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const SUGGESTION = "44444444-4444-4444-8444-444444444444";
const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

function clientWith(handlers: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } }>) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected rpc ${name}`);
    const out = handler(args);
    return { data: out.data ?? null, error: out.error ?? null };
  });
  return { client: { rpc } as never, rpc };
}

describe("createShelfTaste", () => {
  it("returns the snapshot with camelCase fields and pending suggestions", async () => {
    const { client } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, apple_rules: false, locks: {} } }),
      capture_list_taste_suggestions: () => ({
        data: [{ id: SUGGESTION, tile: "density", op: "set", value: "balanced", reason: "Seen lately", evidence_item_ids: [] }],
      }),
    });
    const result = await createShelfTaste(client, PRINCIPAL).get();
    expect(result).toEqual({
      ok: true,
      value: {
        board: BOARD,
        version: 3,
        appleRules: false,
        pending: [{ id: SUGGESTION, tile: "density", op: "set", value: "balanced", reason: "Seen lately", evidenceItemIds: [] }],
      },
    });
  });

  it("returns null when there is no board yet", async () => {
    const { client } = clientWith({ capture_get_taste: () => ({ data: null }), capture_list_taste_suggestions: () => ({ data: [] }) });
    expect(await createShelfTaste(client, PRINCIPAL).get()).toEqual({ ok: true, value: null });
  });

  it("saveTile merges the tile, validates, locks the tile, and reports conflicts", async () => {
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, apple_rules: true, locks: {} } }),
      capture_save_taste_board: () => ({ data: 4 }),
    });
    const taste = createShelfTaste(client, PRINCIPAL);
    expect(await taste.saveTile({ tile: "density", value: "dense", expectedVersion: 3 })).toEqual({ ok: true, value: { version: 4 } });
    expect(rpc).toHaveBeenCalledWith(
      "capture_save_taste_board",
      expect.objectContaining({
        actor_user_id: PRINCIPAL.userId,
        target_workspace_id: PRINCIPAL.workspaceId,
        expected_version: 3,
        lock_tile: "density",
        new_board: { ...BOARD, density: "dense" },
      }),
    );
    const stale = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 5, apple_rules: true, locks: {} } }),
      capture_save_taste_board: () => ({ data: null }),
    });
    expect(await createShelfTaste(stale.client, PRINCIPAL).saveTile({ tile: "density", value: "dense", expectedVersion: 3 })).toEqual({ ok: false, error: "conflict" });
  });

  it("saveTile rejects a value that breaks the board rules without calling save", async () => {
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, apple_rules: true, locks: {} } }),
    });
    const result = await createShelfTaste(client, PRINCIPAL).saveTile({ tile: "density", value: "roomy", expectedVersion: 3 });
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(rpc).not.toHaveBeenCalledWith("capture_save_taste_board", expect.anything());
  });

  it("decide keeps by applying the operation, and rejects an add into the avoid list", async () => {
    const pendingAdd = { id: SUGGESTION, tile: "signatureDetails", op: "add", value: "Pill buttons", reason: "r", evidence_item_ids: [] };
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, apple_rules: true, locks: {} } }),
      capture_list_taste_suggestions: () => ({ data: [pendingAdd] }),
      capture_decide_taste_suggestion: () => ({ data: "rejected" }),
    });
    const taste = createShelfTaste(client, PRINCIPAL);
    expect(await taste.decide({ suggestionId: SUGGESTION, decision: "rejected", expectedVersion: 3 })).toEqual({ ok: true, value: { status: "rejected" } });
    expect(rpc).toHaveBeenCalledWith(
      "capture_decide_taste_suggestion",
      expect.objectContaining({
        decision: "rejected",
        new_board: { ...BOARD, avoid: [{ text: "Pill buttons", source: "rejected" }] },
      }),
    );
  });

  it("maps SQL errors to shelf errors", async () => {
    const { client } = clientWith({ capture_get_taste: () => ({ error: { message: "not_authorized" } }) });
    expect(await createShelfTaste(client, PRINCIPAL).get()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("setAppleRules calls the function", async () => {
    const { client, rpc } = clientWith({ capture_set_apple_rules: () => ({ data: null }) });
    expect(await createShelfTaste(client, PRINCIPAL).setAppleRules(false)).toEqual({ ok: true, value: { enabled: false } });
    expect(rpc).toHaveBeenCalledWith("capture_set_apple_rules", { actor_user_id: PRINCIPAL.userId, target_workspace_id: PRINCIPAL.workspaceId, enabled: false });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter web test -- shelf-taste`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// shelf-taste.ts
import "server-only";

import {
  applyTasteOperation,
  TasteBoardSchema,
  TasteOperationSchema,
  type ShelfErrorCode,
  type ShelfTasteSnapshot,
  type TasteTile,
} from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ShelfPrincipal } from "./shelf-auth";
import { withRejectedAvoid } from "./taste/taste-board-ops";

export type ShelfTasteError = ShelfErrorCode;
export type ShelfTasteResult<T> = { ok: true; value: T } | { ok: false; error: ShelfTasteError | "conflict" };
export type ShelfTaste = {
  get(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>>;
  saveTile(input: { tile: TasteTile; value: unknown; expectedVersion: number }): Promise<ShelfTasteResult<{ version: number }>>;
  decide(input: {
    suggestionId: string;
    decision: "kept" | "rejected";
    expectedVersion: number;
  }): Promise<ShelfTasteResult<{ status: "kept" | "rejected" | "superseded" }>>;
  setAppleRules(enabled: boolean): Promise<ShelfTasteResult<{ enabled: boolean }>>;
};

const ProfileSchema = z.object({
  board: TasteBoardSchema,
  version: z.number().int(),
  apple_rules: z.boolean(),
});
const SuggestionRowSchema = z.object({
  id: z.string().uuid(),
  tile: z.string(),
  op: z.string(),
  value: z.unknown(),
  reason: z.string(),
  evidence_item_ids: z.array(z.string().uuid()),
});

function failure(message: string | undefined): { ok: false; error: ShelfTasteError } {
  if (message?.includes("not_authorized")) return { ok: false, error: "unauthorized" };
  if (message?.includes("not_found")) return { ok: false, error: "not_found" };
  if (message?.includes("invalid_request")) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}

export function createShelfTaste(client: SupabaseClient, principal: ShelfPrincipal): ShelfTaste {
  const scope = { actor_user_id: principal.userId, target_workspace_id: principal.workspaceId };

  async function snapshot(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>> {
    const profile = await client.rpc("capture_get_taste", scope);
    if (profile.error) return failure(profile.error.message);
    if (profile.data === null) return { ok: true, value: null };
    const parsed = ProfileSchema.safeParse(profile.data);
    if (!parsed.success) return { ok: false, error: "unavailable" };
    const list = await client.rpc("capture_list_taste_suggestions", scope);
    if (list.error) return failure(list.error.message);
    const rows = z.array(SuggestionRowSchema).safeParse(list.data);
    if (!rows.success) return { ok: false, error: "unavailable" };
    return {
      ok: true,
      value: {
        board: parsed.data.board,
        version: parsed.data.version,
        appleRules: parsed.data.apple_rules,
        pending: rows.data.flatMap((row) => {
          const op = TasteOperationSchema.safeParse({ tile: row.tile, op: row.op, value: row.value });
          return op.success
            ? [{ id: row.id, tile: op.data.tile, op: op.data.op, value: op.data.value, reason: row.reason, evidenceItemIds: row.evidence_item_ids }]
            : [];
        }),
      },
    };
  }

  return {
    get: snapshot,

    async saveTile({ tile, value, expectedVersion }) {
      const current = await snapshot();
      if (!current.ok) return current;
      if (!current.value) return { ok: false, error: "not_found" };
      const next = TasteBoardSchema.safeParse({ ...current.value.board, [tile]: value });
      if (!next.success) return { ok: false, error: "invalid_request" };
      const { data, error } = await client.rpc("capture_save_taste_board", {
        ...scope,
        new_board: next.data,
        expected_version: expectedVersion,
        lock_tile: tile,
      });
      if (error) return failure(error.message);
      return typeof data === "number" ? { ok: true, value: { version: data } } : { ok: false, error: "conflict" };
    },

    async decide({ suggestionId, decision, expectedVersion }) {
      const current = await snapshot();
      if (!current.ok) return current;
      if (!current.value) return { ok: false, error: "not_found" };
      const card = current.value.pending.find((item) => item.id === suggestionId);
      const op = card ? TasteOperationSchema.safeParse({ tile: card.tile, op: card.op, value: card.value }) : null;
      // An unknown or already-decided card still goes to SQL, which answers with its stored status.
      const board =
        op?.success === true
          ? decision === "kept"
            ? applyTasteOperation(current.value.board, op.data)
            : withRejectedAvoid(current.value.board, op.data)
          : current.value.board;
      const { data, error } = await client.rpc("capture_decide_taste_suggestion", {
        actor_user_id: principal.userId,
        target_suggestion_id: suggestionId,
        decision,
        new_board: board,
        expected_version: expectedVersion,
      });
      if (error) return failure(error.message);
      const status = z.enum(["kept", "rejected", "superseded"]).safeParse(data);
      return status.success ? { ok: true, value: { status: status.data } } : { ok: true, value: { status: "superseded" } };
    },

    async setAppleRules(enabled) {
      const { error } = await client.rpc("capture_set_apple_rules", { ...scope, enabled });
      return error ? failure(error.message) : { ok: true, value: { enabled } };
    },
  };
}

// Demo mode (MELD_E2E_FAKE_*): reuses the in-memory taste fake the web tab already uses.
export function createFakeShelfTaste(_principal: ShelfPrincipal): ShelfTaste {
  async function snapshot(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>> {
    const { fakeGetTasteView, fakeAppleRules } = await import("./taste/taste-fake");
    const view = await fakeGetTasteView();
    if (view.status !== "ready") return { ok: true, value: null };
    return {
      ok: true,
      value: {
        board: view.board,
        version: view.version,
        appleRules: fakeAppleRules(),
        pending: view.pending.map((card) => ({
          id: card.id,
          tile: card.tile,
          op: "set" as const,
          value: null,
          reason: card.reason,
          evidenceItemIds: card.evidence.map((e) => e.id),
        })),
      },
    };
  }
  return {
    get: snapshot,
    async saveTile({ tile, value, expectedVersion }) {
      const { fakeSaveTile } = await import("./taste/taste-fake");
      const out = await fakeSaveTile({ workspaceId: _principal.workspaceId, tile, value, expectedVersion });
      return out.status === "saved" ? { ok: true, value: { version: out.version } } : { ok: false, error: out.status === "conflict" ? "conflict" : "invalid_request" };
    },
    async decide({ suggestionId, decision }) {
      const { fakeDecide } = await import("./taste/taste-fake");
      const out = await fakeDecide({ suggestionId, decision });
      return out.status === "error" ? { ok: false, error: "not_found" } : { ok: true, value: { status: out.status } };
    },
    async setAppleRules(enabled) {
      const { fakeSetAppleRules } = await import("./taste/taste-fake");
      fakeSetAppleRules(enabled);
      return { ok: true, value: { enabled } };
    },
  };
}
```

- [ ] **Step 4: Add the two fake helpers** to `taste/taste-fake.ts` (it keeps state on `globalThis.__orionTasteFake`; add a field there instead of a second global):

```ts
// in type FakeStore add:  appleRules: boolean;   and in seed(): appleRules: true,
export function fakeAppleRules(): boolean {
  return store().appleRules;
}
export function fakeSetAppleRules(enabled: boolean): void {
  store().appleRules = enabled;
}
```

If `taste-fake.test.ts` builds a `FakeStore` literal, add `appleRules: true` there too.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter web test -- shelf-taste taste-fake`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inspiration/shelf-taste.ts apps/web/src/features/inspiration/shelf-taste.test.ts apps/web/src/features/inspiration/taste/taste-fake.ts apps/web/src/features/inspiration/taste/taste-fake.test.ts
git commit -m "feat(taste): ShelfTaste service for the Mac app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Shelf taste routes

**Files:**
- Create: `apps/web/src/app/api/shelf/taste/taste-for-request.ts`
- Create: `apps/web/src/app/api/shelf/taste/route.ts` (GET)
- Create: `apps/web/src/app/api/shelf/taste/tile/route.ts` (PUT)
- Create: `apps/web/src/app/api/shelf/taste/suggestions/[id]/route.ts` (POST)
- Create: `apps/web/src/app/api/shelf/taste/apple-rules/route.ts` (PUT)
- Test: `route.test.ts` beside each route

**Interfaces:**
- Consumes: `createShelfTaste` / `createFakeShelfTaste` (Task 6), `authenticateShelfRequest`, `readJson` (`../library/request-json`), `shelfError`, Task 5 request schemas.
- Produces (HTTP, all need `Authorization: Bearer <shelf key>`):
  - `GET /api/shelf/taste` → `200 {status:"ready", board, version, appleRules, pending}` · `200 {status:"learning"}` when no board yet · 401/503
  - `PUT /api/shelf/taste/tile` body `{tile, value, expectedVersion}` → `200 {version}` · `409 {status:"conflict"}` · `422`
  - `POST /api/shelf/taste/suggestions/:id` body `{decision, expectedVersion}` → `200 {status}` · `404` · `422`
  - `PUT /api/shelf/taste/apple-rules` body `{enabled}` → `200 {enabled}` · `404` · `422`

- [ ] **Step 1: Write the shared helper**

```ts
// taste-for-request.ts
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { createFakeShelfTaste, createShelfTaste, type ShelfTaste, type ShelfTasteError } from "@/features/inspiration/shelf-taste";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

// Token → the right taste service (real or demo), or the error response to send.
export async function tasteForRequest(request: Request): Promise<{ taste: ShelfTaste } | { response: Response }> {
  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    if (!isRoomFakeEnabled()) {
      console.error("Shelf server configuration error");
      return { response: shelfError("unavailable") };
    }
    supabase = {} as ReturnType<typeof createShelfServerClient>;
  }
  const principal = await authenticateShelfRequest(request, supabase);
  if (!principal) return { response: shelfError("unauthorized") };
  return { taste: isRoomFakeEnabled() ? createFakeShelfTaste(principal) : createShelfTaste(supabase, principal) };
}

export function tasteError(error: ShelfTasteError | "conflict"): Response {
  return error === "conflict" ? Response.json({ status: "conflict" }, { status: 409 }) : shelfError(error);
}
```

- [ ] **Step 2: Write the failing tests** (one file per route; same mocking style as `library/[id]/route.test.ts`). Example for the tile route; write the other three the same way, asserting the cases in the Interfaces list:

```ts
// tile/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  saveTile: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-taste", () => ({
  createShelfTaste: () => ({ saveTile: mocks.saveTile }),
  createFakeShelfTaste: () => ({ saveTile: mocks.saveTile }),
}));

import { PUT } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/shelf/taste/tile", { method: "PUT", body: JSON.stringify(body) }));

describe("PUT /api/shelf/taste/tile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("saves a tile and returns the new version", async () => {
    mocks.saveTile.mockResolvedValue({ ok: true, value: { version: 4 } });
    const response = await put({ tile: "density", value: "airy", expectedVersion: 3 });
    expect(mocks.saveTile).toHaveBeenCalledWith({ tile: "density", value: "airy", expectedVersion: 3 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: 4 });
  });

  it("409s on a version conflict", async () => {
    mocks.saveTile.mockResolvedValue({ ok: false, error: "conflict" });
    const response = await put({ tile: "density", value: "airy", expectedVersion: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "conflict" });
  });

  it("422s on a bad body and 401s without a valid key", async () => {
    expect((await put({ tile: "mood", value: 1, expectedVersion: 0 })).status).toBe(422);
    expect(mocks.saveTile).not.toHaveBeenCalled();
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await put({ tile: "density", value: "airy", expectedVersion: 0 })).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter web test -- api/shelf/taste`
Expected: FAIL, route modules not found.

- [ ] **Step 4: Implement the routes**

```ts
// api/shelf/taste/route.ts
import { shelfError } from "@/features/inspiration/shelf-responses";
import { tasteError, tasteForRequest } from "./taste-for-request";

export async function GET(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const result = await resolved.taste.get();
  if (!result.ok) return tasteError(result.error);
  // No board yet: the app shows "Orion is still learning".
  return Response.json(result.value ? { status: "ready", ...result.value } : { status: "learning" });
}
```

```ts
// api/shelf/taste/tile/route.ts
import { ShelfTasteTileRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "../../library/request-json";
import { tasteError, tasteForRequest } from "../taste-for-request";

export async function PUT(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfTasteTileRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.taste.saveTile(body);
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
```

```ts
// api/shelf/taste/suggestions/[id]/route.ts
import { ShelfTasteDecisionRequestSchema } from "@meld/contracts";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "../../../library/request-json";
import { tasteError, tasteForRequest } from "../../taste-for-request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  const body = await readJson(request, ShelfTasteDecisionRequestSchema);
  if (!z.string().uuid().safeParse(id).success || !body) return shelfError("invalid_request");
  const result = await resolved.taste.decide({ suggestionId: id, ...body });
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
```

```ts
// api/shelf/taste/apple-rules/route.ts
import { ShelfAppleRulesRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "../../library/request-json";
import { tasteError, tasteForRequest } from "../taste-for-request";

export async function PUT(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfAppleRulesRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.taste.setAppleRules(body.enabled);
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
```

(Remove the unused `shelfError` import from `route.ts` for GET.) Check `readJson`'s signature in `library/request-json.ts` and adapt the call if it differs.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter web test -- api/shelf/taste`
Expected: PASS for all four route test files.

- [ ] **Step 6: Whole-suite check and commit**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint`
Expected: all green.

```bash
git add apps/web/src/app/api/shelf/taste
git commit -m "feat(taste): Shelf-key taste routes for the Mac app

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Apple rules block, ≤450 chars, precedence wording | 1 |
| Applies only to Apple targets; web/Android none | 1 (`isAppleTarget`) |
| Block placed after taste; trim order inspiration → Apple → taste | 2 |
| `apple_rules` switch, default on; Light → Regular note | 1, 3 |
| Used when Orion designs screens in a project | 3 |
| New `/api/shelf/taste` routes; reuse existing taste logic | 4–7 |
| Shelf key widened to read/change taste only | 4 (service_role-only functions), 7 |
| Keep/Remove (= Not me, rejected add → avoid) | 5, 6 |
| Version conflict handling | 4, 6, 7 |

**Spec deviation to confirm:** the spec says "web and Android get no Apple block", but image labels only say `mobile`, not iPhone vs Android. Task 1 treats mobile, tablet and desktop-app targets as Apple unless the owner's words name Android, Windows, Linux or Material design.

**Not in this plan:** the "Let Orion decide again" endpoint, composer (`/compose`), and all Swift UI. They are in Plans 2 and 3.
