# Taste style-guide board — Plan 2: the six-tile board

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native Taste screen (chapter list + sample column + card tray) with the six-tile style-guide board: Motion, Lettering, Shape, Space, Voice, Steer clear of, plus a locked Craft-rules strip, a Preview-on-a-screen overlay, suggestions that land on tiles, and a right-hand edit panel. Add the three new stored parts (`motion`, `shape`, `voice`), hide colour in the Mac app, and make the craft rules reach every screen Orion designs.

**Architecture:** Data first: the contract and database gain three optional board fields and three tile names (old boards keep working). The web side learns the new tiles (labels, prompts, composer filter) and gets a craft-rules block in the screen-design prompt, in the slot Plan 1 emptied. The Mac side adds pure, tested units in `ShelfCore` (board model, slots, motion spec, craft rules, voice lines, sample style), then SwiftUI views in `Orion/Taste/Board/` and panel edits, then assembles the new `TasteScreen`. The composer logic is unchanged here (its look is Plan 3), except that the card tray's "reply" moves into the composer.

**Tech Stack:** TypeScript (zod, vitest, Next.js), Supabase SQL and pgTAP, Swift 6.2 / SwiftUI (macOS 26 glass) / Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-10-taste-style-guide-board-design.md` (Parts A and B1–B7, B9 excluded). **Depends on:** Plan 1 (`2026-11-10-taste-board-1-remove-apple.md`) merged: no Apple code remains, `composeInstruction` has no `appleBlock`, `loadTasteBoard` exists, migration `20261110000005` exists.

## Global Constraints

- Three new optional board fields (verbatim from the spec, B1): `motion` ∈ `instant|snappy|smooth|playful`, default `snappy`; `shape` = `{ corners ∈ sharp|soft|round, depth ∈ shadows|hairlines|flat }`, default `soft`/`shadows`; `voice` = `{ tone ∈ plain|warm|formal|playful, note: 0–80 chars }`, default `plain`/empty note. All are **`set` only**. Tile names widen from 8 to **11**.
- Existing keys and limits are unchanged, including `colors`. Colour stays in the stored data (the website's Taste tab still reads it) but is **hidden in the Mac app** and **removed from the taste block** sent to screen generation.
- **Motion and Voice are never learned from saved images.** Learning (DeepSeek refresh) may propose `shape`; it never proposes `motion` or `voice`. Composer reads may propose `motion`, `shape`, `voice` and **never `colors`**. Learning may still propose `colors` (the website shows them); the Mac app hides those cards.
- Motion timings (exact): Instant = opacity only, 0 ms. Snappy = 150 ms, `cubic-bezier(0.2, 0, 0, 1)`, 12 pt rise, 4 pt blur, no bounce. Smooth = 300 ms, same curve. Playful = 450 ms with one overshoot of about 3%. Fixed for all: press scale **0.96** over 150 ms ease-out (never on disabled controls); exit 150 ms, 12 pt up, 4 pt blur; stagger 100 ms only on rare staged entrances. Loop demo cycle 2.4 s. With macOS Reduce Motion on, loops stop on the end state.
- **Eight craft rules** (titles verbatim from the spec): 1 Pressing a button scales it to 0.96. 2 Things leave faster and smaller than they arrive. 3 Things used constantly (keyboard shortcuts, hovering rows) never animate. 4 Reduced Motion is respected (a fade, not movement). 5 Numbers that change line up (tabular figures). 6 Nested rounded corners add up (outer = inner + padding). 7 Tap targets are at least 44 px. 8 Errors and warnings are always calm and plain, and say how to fix it, whatever tone you picked.
- Screen-design prompt order: **base → taste → craft rules → inspiration**; when too long, drop inspiration first, then the taste block, then the craft block; never the owner's words.
- Layout: six tiles, 6-column grid: row 1 Motion (3 cols) + Lettering (3 cols); row 2 Shape (2) + Space (2) + Voice (2); row 3 thin strips: Steer clear of (3) + Craft rules (3). Below 720 pt content width the board becomes two columns with the craft strip last. Edit panel: 360 pt, slides in from the right.
- Mapping: Motion ← `motion`; Lettering ← `typography`; Shape ← `shape` + `signatureDetails`; Space ← `density` + `spacing` + `layoutHabits`; Voice ← `voice`; Steer clear ← `avoid`; mood line under the title ← `designLanguage`; `colors` is not shown.
- Swift: strict concurrency (language mode 6); use `OrionSpacing`, `OrionRadius`, `OrionButtonStyle`, `OrionColor`; Orion cyan is `OrionColor.dayBreakBlue.color`; danger red is `OrionColor.loudRed.color`; glass is `.glassEffect(.regular, in: ...)`.
- All commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands: `pnpm --filter @meld/contracts test`, `pnpm --filter web test -- <name>`, `pnpm --filter web exec tsc --noEmit`, `supabase db reset && supabase test db`, `cd apps/mac && swift build --build-tests && swift test --filter <Name>`.

## File Structure

| File | Job |
|---|---|
| `packages/contracts/src/taste.ts` (+test) | Vocabulary, schemas, defaults, ops for the 3 new parts; 11 tile names |
| `supabase/migrations/20261110000006_taste_motion_shape_voice_tiles.sql`, `supabase/tests/taste_new_tiles.test.sql` | Widen the 4 SQL tile-name lists |
| `apps/web/src/features/inspiration/taste/describe-suggestion.ts` (+test), `taste-prompt.ts` (+test), `compose/interpreter-prompt.ts` (+test), `compose/taste-interpreter.ts` (+test) | Labels, learning prompt, composer prompt and colour filter |
| `apps/web/src/features/inspiration/picking/format-taste-block.ts` (+test), `format-craft-rules-block.ts` (+test), `compose-instruction.ts` (+test) | Taste block (no colour), craft block, prompt order |
| `apps/web/src/features/design/design-screen-generation.ts` (+test) | Pass the craft block |
| `apps/mac/Sources/ShelfCore/Taste/TasteBoard.swift` | New enums, fields, tolerant decoding |
| `.../ShelfCore/Taste/TasteSlots.swift` (replaces `TasteChapters.swift`) | `TasteSlot`, tile display names |
| `.../ShelfCore/Taste/TasteMotionSpec.swift`, `TasteCraftRules.swift`, `TasteVoiceExamples.swift` | Pure data |
| `.../ShelfCore/Taste/TasteSampleStyle.swift`, `TasteCardText.swift`, `TasteStore.swift` | Sample without colour; card text; hide colour cards |
| `.../Orion/Taste/Board/*.swift` | Board grid, tile card, tiles, motion demo, shape picture, header, preview overlay |
| `.../Orion/Taste/Panels/*.swift`, `TasteEditPanel.swift`, `TastePanelChrome.swift` | Slot panels; delete colour panel |
| `.../Orion/Taste/TasteScreen.swift`, `TasteModel.swift`, `TasteComposerView.swift`, `ComposerDraft.swift` | Assemble screen; reply moves to composer |

---

# Part A — Data and web

### Task 1: Contracts know motion, shape and voice

**Files:**
- Modify: `packages/contracts/src/taste.ts`
- Test: `packages/contracts/src/taste.test.ts`

**Interfaces:**
- Produces (all exported from `@meld/contracts`): `TASTE_TILES` (11 names), `TASTE_MOTION`, `TASTE_CORNERS`, `TASTE_DEPTH`, `TASTE_VOICE_TONES`, `TasteShapeSchema`, `TasteVoiceSchema`, `type TasteMotion`, `type TasteShape`, `type TasteVoice`, `TASTE_DEFAULTS`, `type ResolvedTasteBoard`, `resolveTasteBoard(board: TasteBoard): ResolvedTasteBoard`. `TasteBoard` gains optional `motion`, `shape`, `voice`. `TasteOperationSchema` gains `set` ops for the three.

- [ ] **Step 1: Write the failing tests**

Add `TasteBoardSchema, TasteOperationSchema, TASTE_TILES, applyTasteOperation, resolveTasteBoard, tasteValueKey` to the imports of `packages/contracts/src/taste.test.ts` if missing, then append (the file already defines `BOARD`, a valid old-style board):

```ts
describe("motion, shape and voice", () => {
  it("accepts an old board without them and a new board with them", () => {
    expect(TasteBoardSchema.safeParse(BOARD).success).toBe(true);
    const full = {
      ...BOARD,
      motion: "smooth",
      shape: { corners: "round", depth: "hairlines" },
      voice: { tone: "warm", note: "friendly" },
    };
    expect(TasteBoardSchema.safeParse(full).success).toBe(true);
  });

  it("rejects values outside the vocabulary", () => {
    expect(TasteBoardSchema.safeParse({ ...BOARD, motion: "zippy" }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, shape: { corners: "pointy", depth: "flat" } }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, voice: { tone: "rude", note: "" } }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, voice: { tone: "plain", note: "x".repeat(81) } }).success).toBe(false);
  });

  it("fills the defaults when resolving a bare board", () => {
    const resolved = resolveTasteBoard(TasteBoardSchema.parse(BOARD));
    expect(resolved.motion).toBe("snappy");
    expect(resolved.shape).toEqual({ corners: "soft", depth: "shadows" });
    expect(resolved.voice).toEqual({ tone: "plain", note: "" });
  });

  it("names 11 tiles including the new ones", () => {
    expect(TASTE_TILES).toHaveLength(11);
    expect(TASTE_TILES).toEqual(expect.arrayContaining(["motion", "shape", "voice"]));
  });

  it("allows set on the new tiles and nothing else", () => {
    expect(TasteOperationSchema.safeParse({ tile: "motion", op: "set", value: "smooth" }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "motion", op: "add", value: "smooth" }).success).toBe(false);
    expect(TasteOperationSchema.safeParse({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "voice", op: "set", value: { tone: "warm", note: "" } }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "voice", op: "remove", value: { tone: "warm", note: "" } }).success).toBe(false);
  });

  it("gives them stable value keys", () => {
    expect(tasteValueKey({ tile: "motion", op: "set", value: "smooth" })).toBe("motion:set:smooth");
    expect(tasteValueKey({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } })).toBe("shape:set:round/flat");
    expect(tasteValueKey({ tile: "voice", op: "set", value: { tone: "warm", note: "Hi  there" } })).toBe("voice:set:warm/hi there");
  });

  it("treats setting the default on a bare board as a no-op, and a real change as a change", () => {
    const board = TasteBoardSchema.parse(BOARD);
    expect(applyTasteOperation(board, { tile: "motion", op: "set", value: "snappy" })).toBeNull();
    expect(applyTasteOperation(board, { tile: "motion", op: "set", value: "smooth" })?.motion).toBe("smooth");
    expect(applyTasteOperation(board, { tile: "shape", op: "set", value: { corners: "round", depth: "flat" } })?.shape).toEqual({ corners: "round", depth: "flat" });
  });
});
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm --filter @meld/contracts test -- taste`
Expected: FAIL (`resolveTasteBoard` is not exported, tiles length 8, schemas reject the new fields).

- [ ] **Step 3: Implement**

In `packages/contracts/src/taste.ts`:

1. Replace the `TASTE_TILES` list with 11 names:

```ts
export const TASTE_TILES = [
  "designLanguage",
  "colors",
  "typography",
  "spacing",
  "density",
  "layoutHabits",
  "signatureDetails",
  "avoid",
  "motion",
  "shape",
  "voice",
] as const;
```
Update the comment above it to also name the three new SQL lists changed in migration `20261110000006`.

2. After `TASTE_AVOID_SOURCES` add:

```ts
export const TASTE_MOTION = ["instant", "snappy", "smooth", "playful"] as const;
export const TASTE_CORNERS = ["sharp", "soft", "round"] as const;
export const TASTE_DEPTH = ["shadows", "hairlines", "flat"] as const;
export const TASTE_VOICE_TONES = ["plain", "warm", "formal", "playful"] as const;
```

3. After `TasteTypographySchema` add:

```ts
export const TasteShapeSchema = z.object({ corners: z.enum(TASTE_CORNERS), depth: z.enum(TASTE_DEPTH) });
export const TasteVoiceSchema = z.object({ tone: z.enum(TASTE_VOICE_TONES), note: plain(0, 80) });
export type TasteMotion = (typeof TASTE_MOTION)[number];
export type TasteShape = z.infer<typeof TasteShapeSchema>;
export type TasteVoice = z.infer<typeof TasteVoiceSchema>;

/** What a board without these fields means. */
export const TASTE_DEFAULTS: { motion: TasteMotion; shape: TasteShape; voice: TasteVoice } = {
  motion: "snappy",
  shape: { corners: "soft", depth: "shadows" },
  voice: { tone: "plain", note: "" },
};
```

4. In `TasteBoardSchema`'s object add after `avoid`:

```ts
    motion: z.enum(TASTE_MOTION).optional(),
    shape: TasteShapeSchema.optional(),
    voice: TasteVoiceSchema.optional(),
```

5. After `export type TasteBoard = ...` add:

```ts
export type ResolvedTasteBoard = Omit<TasteBoard, "motion" | "shape" | "voice"> & {
  motion: TasteMotion;
  shape: TasteShape;
  voice: TasteVoice;
};
/** The board with the three optional parts filled in with their defaults. */
export function resolveTasteBoard(board: TasteBoard): ResolvedTasteBoard {
  return {
    ...board,
    motion: board.motion ?? TASTE_DEFAULTS.motion,
    shape: board.shape ?? TASTE_DEFAULTS.shape,
    voice: board.voice ?? TASTE_DEFAULTS.voice,
  };
}
```

6. Add to `TASTE_OPERATIONS` (after the `density` setOp): `setOp("motion", z.enum(TASTE_MOTION)), setOp("shape", TasteShapeSchema), setOp("voice", TasteVoiceSchema),`.

7. In `tasteItemKey`, add before `default`:

```ts
    case "shape": {
      const shape = value as z.infer<typeof TasteShapeSchema>;
      return `${shape.corners}/${shape.depth}`;
    }
    case "voice": {
      const voice = value as z.infer<typeof TasteVoiceSchema>;
      return `${voice.tone}/${norm(voice.note)}`;
    }
```

8. In `applyTasteOperation`, change the `set` branch's comparison line `if (key(board[op.tile]) === key(op.value)) return null;` to compare against the resolved board:

```ts
    if (key(resolveTasteBoard(board)[op.tile]) === key(op.value)) return null;
```

- [ ] **Step 4: Run and see it pass**

Run: `pnpm --filter @meld/contracts test`
Expected: PASS (all). Then `pnpm --filter web exec tsc --noEmit` — expect errors only in `describe-suggestion.ts` (`Record<TasteTile, string>` lacks the new keys); Task 3 fixes them.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/taste.ts packages/contracts/src/taste.test.ts
git commit -m "feat(contracts): motion, shape and voice taste parts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database accepts the new tile names

**Files:**
- Create: `supabase/migrations/20261110000006_taste_motion_shape_voice_tiles.sql`
- Create: `supabase/tests/taste_new_tiles.test.sql`

**Interfaces:**
- Consumes: Plan 1 migration `20261110000005`.
- Produces: `taste_suggestions.tile`, `save_taste_board`, `capture_save_taste_board` and `capture_clear_taste_lock` accept `motion`, `shape`, `voice`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/taste_new_tiles.test.sql`:

```sql
-- supabase/tests/taste_new_tiles.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e4000000-0000-4000-8000-000000000001','authenticated','authenticated','new-tiles@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e5000000-0000-4000-8000-000000000001','New tiles WS','e4000000-0000-4000-8000-000000000001');
insert into public.taste_profiles (workspace_id, user_id, board, version)
values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','{"density":"airy"}'::jsonb, 1);

select lives_ok(
  $$ insert into public.taste_suggestions (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
     values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',gen_random_uuid(),'motion','set','"smooth"','motion:set:smooth','You asked for calm',1) $$,
  'a motion suggestion can be stored');
select throws_ok(
  $$ insert into public.taste_suggestions (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
     values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',gen_random_uuid(),'colour','set','"x"','colour:set:x','nope',1) $$,
  '23514', null, 'an unknown tile is still refused');
select is(
  public.capture_save_taste_board('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','{"shape":{"corners":"round","depth":"flat"}}'::jsonb, 1, 'shape'),
  2, 'saving the shape tile locks it and bumps the version');
select is(
  (select locks ? 'shape' from public.taste_profiles where workspace_id = 'e5000000-0000-4000-8000-000000000001'),
  true, 'the shape lock is recorded');
select lives_ok(
  $$ select public.capture_clear_taste_lock('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','voice') $$,
  'the voice lock can be cleared');
select throws_ok(
  $$ select public.capture_clear_taste_lock('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','nonsense') $$,
  'P0001', 'invalid_request', 'an unknown lock tile is refused');

select * from finish();
rollback;
```

- [ ] **Step 2: Run and see it fail**

Run: `supabase db reset && supabase test db`
Expected: FAIL in `taste_new_tiles.test.sql` (the check constraint and the three functions reject `motion`, `shape`, `voice`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261110000006_taste_motion_shape_voice_tiles.sql`:

```sql
-- Widen the tile-name lists from 8 to 11 names (adds motion, shape, voice).
-- Mirrors TASTE_TILES in packages/contracts/src/taste.ts.

do $$
declare
  existing text;
begin
  select conname into existing from pg_constraint
  where conrelid = 'public.taste_suggestions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%designLanguage%';
  if existing is not null then
    execute format('alter table public.taste_suggestions drop constraint %I', existing);
  end if;
end $$;

alter table public.taste_suggestions
  add constraint taste_suggestions_tile_check
  check (tile in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice'));

create or replace function public.save_taste_board(
  target_workspace_id uuid, new_board jsonb, expected_version integer, lock_tile text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  next_version integer;
begin
  if uid is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new_board is null or jsonb_typeof(new_board) <> 'object' then
    raise exception 'invalid board' using errcode = '22023';
  end if;
  if lock_tile is not null and lock_tile not in
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
    raise exception 'invalid tile' using errcode = '22023';
  end if;

  update public.taste_profiles
  set board = new_board,
      version = version + 1,
      locks = case when lock_tile is null then locks
                   else jsonb_set(locks, array[lock_tile], to_jsonb(public.taste_sorted_count(target_workspace_id, uid))) end,
      updated_at = now()
  where workspace_id = target_workspace_id and user_id = uid
    and version = expected_version and board is not null
  returning version into next_version;
  return next_version;
end;
$$;

create or replace function public.capture_save_taste_board(
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
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
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

create or replace function public.capture_clear_taste_lock(actor_user_id uuid, target_workspace_id uuid, lock_tile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if lock_tile not in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles set locks = locks - lock_tile, updated_at = now()
    where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
```
(`create or replace` keeps each function's existing grants.)

- [ ] **Step 4: Run and see it pass**

Run: `supabase db reset && supabase test db`
Expected: PASS for every file, including `taste_new_tiles.test.sql` (6) and the older `capture_taste.test.sql` and `taste_profile.test.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261110000006_taste_motion_shape_voice_tiles.sql supabase/tests/taste_new_tiles.test.sql
git commit -m "feat(db): allow the motion, shape and voice taste tiles

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web learns the new tiles (labels, prompts, composer filter)

**Files:**
- Modify: `apps/web/src/features/inspiration/taste/describe-suggestion.ts`, `taste/taste-prompt.ts`, `taste/compose/interpreter-prompt.ts`, `taste/compose/taste-interpreter.ts`
- Test: `describe-suggestion.test.ts`, `taste-prompt.test.ts`, `taste/compose/taste-interpreter.test.ts`; create `taste/compose/interpreter-prompt.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `TASTE_TILE_LABELS` covers 11 tiles; `describeSuggestion` works for the three; the learning prompt allows `shape` only; the composer prompt lists `motion`, `shape`, `voice` and never `colors`; `filterComposerCards` drops `colors` cards.

- [ ] **Step 1: Write the failing tests**

`describe-suggestion.test.ts` — append:

```ts
  it("describes the new tiles", () => {
    const board = TasteBoardSchema.parse(BOARD); // reuse the file's board fixture; if it has another name, use that
    expect(describeSuggestion({ tile: "motion", op: "set", value: "smooth" }, board)).toBe("Motion: snappy → smooth");
    expect(describeSuggestion({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } }, board)).toBe("Shape: soft, shadows → round, flat");
    expect(describeSuggestion({ tile: "voice", op: "set", value: { tone: "warm", note: "" } }, board)).toBe("Voice: plain → warm");
  });
```
(Add `TasteBoardSchema` to the file's contracts import if the fixture is a plain object. Reuse the file's existing board constant; the expected strings assume a board without the three fields.)

`taste-prompt.test.ts` — append:

```ts
  it("lets learning describe shape but never motion or voice", () => {
    expect(TASTE_SYSTEM_PROMPT).toContain("shape");
    expect(TASTE_SYSTEM_PROMPT).toMatch(/never (output or suggest )?motion or voice/i);
  });
```

Create `taste/compose/interpreter-prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TASTE_INTERPRETER_PROMPT } from "./interpreter-prompt";

describe("TASTE_INTERPRETER_PROMPT", () => {
  it("offers motion, shape and voice and never colours", () => {
    expect(TASTE_INTERPRETER_PROMPT).toContain("motion, shape, voice");
    expect(TASTE_INTERPRETER_PROMPT).toContain("never colors");
    expect(TASTE_INTERPRETER_PROMPT).not.toContain("colors item");
  });
});
```

`taste/compose/taste-interpreter.test.ts` — append a test (use the file's existing `BOARD` fixture name):

```ts
  it("drops colour cards: the composer never proposes colours", () => {
    const colourCard = { tile: "colors", op: "add", value: { hex: "#ff5a36", role: "accent" }, reason: "r", source: { kind: "words", name: "Your words", locator: "" } } as const;
    const motionCard = { tile: "motion", op: "set", value: "smooth", reason: "r", source: { kind: "words", name: "Your words", locator: "" } } as const;
    const out = filterComposerCards([colourCard, motionCard], BOARD, []);
    expect(out.map((card) => card.tile)).toEqual(["motion"]);
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter web test -- describe-suggestion taste-prompt interpreter-prompt taste-interpreter`
Expected: FAIL.

- [ ] **Step 3: Implement**

`describe-suggestion.ts` — extend the label map and `label()`:

```ts
export const TASTE_TILE_LABELS: Record<TasteTile, string> = {
  designLanguage: "Design language",
  colors: "Colour",
  typography: "Typography",
  spacing: "Spacing",
  density: "Density",
  layoutHabits: "Layout habits",
  signatureDetails: "Signature details",
  avoid: "You avoid",
  motion: "Motion",
  shape: "Shape",
  voice: "Voice",
};
```
In `label()` add before the final `return String(value);`:

```ts
  if (tile === "shape") {
    const shape = value as { corners: string; depth: string };
    return `${shape.corners}, ${shape.depth}`;
  }
  if (tile === "voice") return (value as { tone: string }).tone;
```
and make `describeSuggestion`'s `set` branch read the current value from the resolved board so a bare board prints its defaults: change `label(op.tile, board[op.tile])` to `label(op.tile, resolveTasteBoard(board)[op.tile])` and import `resolveTasteBoard` from `@meld/contracts`.

`taste-prompt.ts` — in the "Board shape" list add after the `density` line:

```
- shape: optional {"corners": one of ${TASTE_CORNERS.join(", ")}, "depth": one of ${TASTE_DEPTH.join(", ")}} — only when the screenshots clearly show it
```
add `TASTE_CORNERS, TASTE_DEPTH` to the import, change the suggestion sentence `"set" for typography, spacing, density (value is the whole value)` to `"set" for typography, spacing, density, shape (value is the whole value)`, and add this rule to the suggestion rules: `- Never output or suggest motion or voice: screenshots cannot show how something moves or sounds.`

`interpreter-prompt.ts` — replace the tile/op/value lines (the `- tile is one of ...` through the `- designLanguage item ...` line) with:

```
- tile is one of designLanguage, typography, spacing, density, layoutHabits, signatureDetails, avoid, motion, shape, voice (never colors)
- op is "add" or "remove" for list tiles (designLanguage, layoutHabits, signatureDetails, avoid; value is ONE item) and "set" for typography, spacing, density, motion, shape, voice (value is the whole value)
- designLanguage item: lowercase word, max 24 chars. typography: {"weight": one of ${TASTE_WEIGHTS.join(", ")}, "tracking": one of ${TASTE_TRACKING.join(", ")}, "note": max 80 chars}. spacing: one of ${TASTE_SPACING.join(", ")}. density: one of ${TASTE_DENSITY.join(", ")}. layoutHabits item: phrase max 80 chars. signatureDetails item: phrase max 60 chars. avoid item: {"text": max 80 chars, "source": "typed"}. motion: one of ${TASTE_MOTION.join(", ")}. shape: {"corners": one of ${TASTE_CORNERS.join(", ")}, "depth": one of ${TASTE_DEPTH.join(", ")}}. voice: {"tone": one of ${TASTE_VOICE_TONES.join(", ")}, "note": max 80 chars}
```
and add the sentence `Suggest motion, shape or voice only when the input explicitly says how things should move, look or sound (for example "snappy, no bounce" or "friendly but plain").` to the Rules paragraph. Fix the imports: remove `TASTE_COLOR_ROLES`; add `TASTE_MOTION, TASTE_CORNERS, TASTE_DEPTH, TASTE_VOICE_TONES`.

`taste-interpreter.ts` — in `filterComposerCards` loop, add as the first line inside `for (const card of cards) {`:

```ts
    if (card.tile === "colors") continue; // the composer never proposes colours
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter web test -- describe-suggestion taste-prompt interpreter-prompt taste-interpreter && pnpm --filter web exec tsc --noEmit`
Expected: PASS and no type errors (the `Record<TasteTile, string>` error from Task 1 is gone). If `tsc` reports another exhaustive `switch`/`Record` over `TasteTile`, fix it the same way (add the three keys) and re-run.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/features/inspiration/taste
git commit -m "feat(web): taste prompts, labels and composer filter know motion, shape and voice

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The craft rules reach every screen Orion designs

**Files:**
- Modify: `apps/web/src/features/inspiration/picking/format-taste-block.ts`, `compose-instruction.ts`, `apps/web/src/features/design/design-screen-generation.ts`
- Create: `apps/web/src/features/inspiration/picking/format-craft-rules-block.ts`, `format-craft-rules-block.test.ts`
- Test: `format-taste-block.test.ts`, `compose-instruction.test.ts`, `apps/web/src/features/design/design-screen-generation.test.ts`

**Interfaces:**
- Consumes: Task 1 (`resolveTasteBoard`), Plan 1 (`composeInstruction`, `loadTasteBoard`).
- Produces: `formatTasteBlock(board)` without colours and with motion/shape/voice lines; `formatCraftRulesBlock(board: TasteBoard | null): string` (always non-empty); `composeInstruction({ base, tasteBlock, craftBlock?, inspiration, maxChars? })`.

- [ ] **Step 1: Write the failing tests**

Create `format-craft-rules-block.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CRAFT_BLOCK_MAX_CHARS, formatCraftRulesBlock } from "./format-craft-rules-block";

describe("formatCraftRulesBlock", () => {
  it("always lists all eight rules, even with no board", () => {
    const block = formatCraftRulesBlock(null);
    expect(block.startsWith("CRAFT RULES")).toBe(true);
    for (const fragment of ["0.96", "exit", "constant", "Reduce Motion", "tabular", "outer radius = inner radius + padding", "44px", "calm, plain"]) {
      expect(block).toContain(fragment);
    }
    expect(block.length).toBeLessThanOrEqual(CRAFT_BLOCK_MAX_CHARS);
  });

  it("states the chosen motion in exact numbers", () => {
    const board = { motion: "smooth" } as never;
    expect(formatCraftRulesBlock(board)).toContain("300ms");
    expect(formatCraftRulesBlock({ motion: "playful" } as never)).toContain("450ms");
    expect(formatCraftRulesBlock({ motion: "instant" } as never)).toContain("no movement");
    expect(formatCraftRulesBlock(null)).toContain("150ms");
  });
});
```

`format-taste-block.test.ts` — remove any assertion that the block contains `colours:` or a hex colour, and append:

```ts
  it("has no colour line and states motion, shape and voice", () => {
    const block = formatTasteBlock({ ...BOARD, motion: "smooth", shape: { corners: "round", depth: "hairlines" }, voice: { tone: "warm", note: "friendly" } });
    expect(block).not.toContain("colours");
    expect(block).toContain("- shape: round corners, hairlines");
    expect(block).toContain("- motion: smooth");
    expect(block).toContain("- voice: warm — friendly");
  });

  it("falls back to the defaults for an old board", () => {
    const block = formatTasteBlock(BOARD);
    expect(block).toContain("- motion: snappy");
    expect(block).toContain("- shape: soft corners, shadows");
    expect(block).toContain("- voice: plain");
  });
```
(use the file's existing board constant in place of `BOARD` if it is named differently).

`compose-instruction.test.ts` — append:

```ts
  it("puts the craft block after taste and before inspiration", () => {
    const out = composeInstruction({ base: "make a login", tasteBlock: "YOUR TASTE x", craftBlock: "CRAFT RULES y", inspiration: [pick(1)] });
    expect(out.indexOf("YOUR TASTE")).toBeLessThan(out.indexOf("CRAFT RULES"));
    expect(out.indexOf("CRAFT RULES")).toBeLessThan(out.indexOf("INSPIRATION"));
  });

  it("drops inspiration, then taste, then craft, and never the base", () => {
    const taste = "YOUR TASTE " + "t".repeat(500);
    const craft = "CRAFT RULES " + "c".repeat(500);
    const withAll = composeInstruction({ base: "b".repeat(2000), tasteBlock: taste, craftBlock: craft, inspiration: [pick(1)] });
    expect(withAll).toContain(taste);
    expect(withAll).toContain(craft);
    const noInspiration = composeInstruction({ base: "b".repeat(2900), tasteBlock: taste, craftBlock: craft, inspiration: [pick(1)] });
    expect(noInspiration).not.toContain("INSPIRATION");
    expect(noInspiration).toContain(craft);
    const craftOnly = composeInstruction({ base: "b".repeat(3400), tasteBlock: taste, craftBlock: craft, inspiration: [pick(1)] });
    expect(craftOnly).not.toContain("YOUR TASTE");
    expect(craftOnly).toContain(craft);
    expect(composeInstruction({ base: "b".repeat(3900), tasteBlock: taste, craftBlock: craft, inspiration: [] })).toBe("b".repeat(3900));
    expect(craftOnly.length).toBeLessThanOrEqual(4000);
  });
```

`design-screen-generation.test.ts`:
1. Every exact `target_instruction: "Build a login screen"` / `"Tweak the header"` inside an `expect.objectContaining({...})` (lines ~92, 115, 150, 387, 411) becomes `target_instruction: expect.stringContaining("Build a login screen")` (resp. `"Tweak the header"`), because the instruction now carries the craft block after it. The line-448 case (`target_instruction: base` where `base` is 3,900 chars) stays exact: the craft block cannot fit.
2. Append a test:

```ts
  it("always adds the craft rules after the taste block and before inspiration", async () => {
    mocks.loadTasteBoard.mockResolvedValue(BOARD);
    mocks.loadInspirationPicks.mockResolvedValue([PICK]);
    const rpc = vi.fn(async (name: string, _args?: unknown) => {
      if (name === "create_design_screen") return { data: { id: screenId }, error: null };
      if (name === "create_design_screen_generate_task") return { data: { id: taskId }, error: null };
      if (name === "set_design_generation_user_prompt") return { data: null, error: null };
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });
    await generateDesignScreen({ roomId, instruction: "a login screen" });
    const instruction = (rpc.mock.calls.find(([name]) => name === "create_design_screen_generate_task")?.[1] as { target_instruction: string }).target_instruction;
    expect(instruction.indexOf("YOUR TASTE")).toBeLessThan(instruction.indexOf("CRAFT RULES"));
    expect(instruction.indexOf("CRAFT RULES")).toBeLessThan(instruction.indexOf("INSPIRATION"));
  });
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter web test -- format-craft-rules-block format-taste-block compose-instruction design-screen-generation`
Expected: FAIL (new module missing; old taste block still prints colours).

- [ ] **Step 3: Implement**

Create `format-craft-rules-block.ts`:

```ts
import { resolveTasteBoard, type TasteBoard, type TasteMotion } from "@meld/contracts";

export const CRAFT_BLOCK_MAX_CHARS = 800;

const HEADER = "CRAFT RULES (always apply; the owner's taste decides the look, these protect usability):";
const RULES = [
  "- buttons scale to 0.96 when pressed (150ms ease-out); never on disabled controls",
  "- things exit faster and smaller than they enter (150ms, 12px up, 4px blur)",
  "- never animate constant actions: keyboard shortcuts, hovering rows, tab switches",
  "- respect Reduce Motion: fade instead of move",
  "- numbers that change use tabular figures",
  "- nested rounded corners: outer radius = inner radius + padding",
  "- tap targets at least 44px, even when the icon is small",
  "- errors and warnings are calm, plain, and say how to fix it",
];
const MOTION_LINE: Record<TasteMotion, string> = {
  instant: "- motion: instant, opacity only, no movement",
  snappy: "- motion: snappy, 150ms ease-out cubic-bezier(0.2, 0, 0, 1), no bounce",
  smooth: "- motion: smooth, 300ms on the same curve, no bounce",
  playful: "- motion: playful, 450ms with one small overshoot (about 3%), never on icon swaps",
};

/** The fixed floor under every generated screen. Always non-empty; motion follows the board (default snappy). */
export function formatCraftRulesBlock(board: TasteBoard | null): string {
  const motion = board ? resolveTasteBoard(board).motion : "snappy";
  return [HEADER, ...RULES, MOTION_LINE[motion]].join("\n");
}
```
(`resolveTasteBoard` spreads the board; the test passes `{ motion }` objects cast to the type, which works because it only reads `.motion`.)

Replace `format-taste-block.ts`'s `formatTasteBlock` body so colours are gone and the new parts are present (keep `TASTE_BLOCK_MAX_CHARS` and `HEADER`):

```ts
import { resolveTasteBoard, type TasteBoard } from "@meld/contracts";

export const TASTE_BLOCK_MAX_CHARS = 700;
const HEADER =
  "YOUR TASTE (the owner's approved preferences; a room design system wins on brand colours and fonts):";

export function formatTasteBlock(board: TasteBoard | null): string {
  if (!board) return "";
  const { motion, shape, voice } = resolveTasteBoard(board);
  const type = board.typography;
  const lines = [
    `- design language: ${board.designLanguage.join(", ")}`,
    `- type: ${type.weight} weight, ${type.tracking} tracking${type.note ? ` — ${type.note}` : ""}`,
    `- spacing: ${board.spacing} · density: ${board.density}`,
    `- shape: ${shape.corners} corners, ${shape.depth}`,
    `- motion: ${motion}`,
    `- voice: ${voice.tone}${voice.note ? ` — ${voice.note}` : ""}`,
    ...(board.layoutHabits.length > 0 ? [`- layout habits: ${board.layoutHabits.join("; ")}`] : []),
    ...(board.signatureDetails.length > 0 ? [`- signature details: ${board.signatureDetails.join("; ")}`] : []),
  ];
  let avoid = board.avoid.length > 0 ? `- avoid: ${board.avoid.map((a) => a.text).join("; ")}` : null;
  const build = () => [HEADER, ...lines, ...(avoid ? [avoid] : [])].join("\n");
  // Drop from the bottom, skipping avoid; avoid goes only after everything else.
  while (build().length > TASTE_BLOCK_MAX_CHARS) {
    if (lines.length > 0) lines.pop();
    else if (avoid) avoid = null;
    else return "";
  }
  return lines.length === 0 && !avoid ? "" : build();
}
```

Replace `compose-instruction.ts` with:

```ts
import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → craft rules → inspiration, within the task limit. The owner's
 * words are never trimmed; when too long, inspiration goes first, then the
 * taste block, then the craft block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  craftBlock = "",
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  craftBlock?: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, craftBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  const withoutTaste = join(base, craftBlock);
  return withoutTaste.length <= maxChars ? withoutTaste : base;
}
```

In `design-screen-generation.ts` add `import { formatCraftRulesBlock } from "@/features/inspiration/picking/format-craft-rules-block";` and pass the block:

```ts
    const taskInstruction = composeInstruction({
      base: instruction,
      tasteBlock: formatTasteBlock(board),
      craftBlock: formatCraftRulesBlock(board),
      inspiration: picks,
    });
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter web test && pnpm --filter web exec tsc --noEmit && pnpm --filter web lint`
Expected: all PASS, no type errors, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/features/inspiration/picking apps/web/src/features/design
git commit -m "feat(web): craft rules reach screen generation; taste block drops colour

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

# Part B — Mac

### Task 5: The Swift board knows motion, shape and voice

**Files:**
- Modify: `apps/mac/Sources/ShelfCore/Taste/TasteBoard.swift`
- Test: create `apps/mac/Tests/ShelfCoreTests/TasteBoardNewPartsTests.swift`

**Interfaces:**
- Produces: `TasteTile` gains `.motion, .shape, .voice`. New public types: `TasteMotion` (`instant, snappy, smooth, playful`), `TasteCorners` (`sharp, soft, round`), `TasteDepth` (`shadows, hairlines, flat`), `TasteVoiceTone` (`plain, warm, formal, playful`), `TasteShape { corners, depth; static let `default` }`, `TasteVoice { tone, note; static let `default` }`. `TasteBoard` gains `motion`, `shape`, `voice`; JSON without them decodes to the defaults; `TasteBoard.init(designLanguage:colors:typography:spacing:density:layoutHabits:signatureDetails:avoid:motion:shape:voice:)` is public with the last three defaulted.

- [ ] **Step 1: Write the failing tests**

Create `apps/mac/Tests/ShelfCoreTests/TasteBoardNewPartsTests.swift`:

```swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteBoardNewPartsTests {
    let board = TasteFixtures.board   // fixture JSON has none of the new fields

    @Test func anOldBoardDecodesWithDefaults() {
        #expect(board.motion == .snappy)
        #expect(board.shape == TasteShape(corners: .soft, depth: .shadows))
        #expect(board.voice == TasteVoice(tone: .plain, note: ""))
    }

    @Test func newPartsCanBeSet() throws {
        let motion = try #require(board.setting(.motion, to: .string("smooth")))
        #expect(motion.motion == .smooth)
        let shape = try #require(board.setting(.shape, to: .object(["corners": .string("round"), "depth": .string("hairlines")])))
        #expect(shape.shape == TasteShape(corners: .round, depth: .hairlines))
        let voice = try #require(board.setting(.voice, to: .object(["tone": .string("warm"), "note": .string("friendly")])))
        #expect(voice.voice == TasteVoice(tone: .warm, note: "friendly"))
    }

    @Test func valuesOutsideTheVocabularyAreRefused() {
        #expect(board.setting(.motion, to: .string("zippy")) == nil)
        #expect(board.setting(.shape, to: .object(["corners": .string("pointy"), "depth": .string("flat")])) == nil)
        #expect(board.setting(.voice, to: .object(["tone": .string("rude"), "note": .string("")])) == nil)
    }

    @Test func valueForReportsTheNewParts() {
        #expect(board.value(for: .motion) == .string("snappy"))
        #expect(board.value(for: .shape) == .object(["corners": .string("soft"), "depth": .string("shadows")]))
    }

    @Test func tilesNowNumberEleven() {
        #expect(TasteTile.allCases.count == 11)
    }
}
```

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (no `motion` member, no `.motion` tile).

- [ ] **Step 3: Implement**

In `TasteBoard.swift`:

1. Replace the `TasteTile` enum with:

```swift
public enum TasteTile: String, Codable, CaseIterable, Sendable {
    case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
    case motion, shape, voice
}
public enum TasteMotion: String, Codable, CaseIterable, Sendable { case instant, snappy, smooth, playful }
public enum TasteCorners: String, Codable, CaseIterable, Sendable { case sharp, soft, round }
public enum TasteDepth: String, Codable, CaseIterable, Sendable { case shadows, hairlines, flat }
public enum TasteVoiceTone: String, Codable, CaseIterable, Sendable { case plain, warm, formal, playful }

public struct TasteShape: Codable, Sendable, Equatable {
    public var corners: TasteCorners
    public var depth: TasteDepth
    public init(corners: TasteCorners, depth: TasteDepth) { self.corners = corners; self.depth = depth }
    public static let `default` = TasteShape(corners: .soft, depth: .shadows)
}
public struct TasteVoice: Codable, Sendable, Equatable {
    public var tone: TasteVoiceTone
    public var note: String
    public init(tone: TasteVoiceTone, note: String) { self.tone = tone; self.note = note }
    public static let `default` = TasteVoice(tone: .plain, note: "")
}
```

2. Replace the `TasteBoard` struct's stored properties and add an explicit init and tolerant decoder (keep `value(for:)`, `setting(_:to:)`, `asObject` exactly as they are):

```swift
public struct TasteBoard: Codable, Sendable, Equatable {
    public var designLanguage: [String]
    public var colors: [TasteColor]
    public var typography: TasteTypography
    public var spacing: TasteSpacing
    public var density: TasteDensity
    public var layoutHabits: [String]
    public var signatureDetails: [String]
    public var avoid: [TasteAvoid]
    public var motion: TasteMotion
    public var shape: TasteShape
    public var voice: TasteVoice

    public init(designLanguage: [String], colors: [TasteColor], typography: TasteTypography, spacing: TasteSpacing,
                density: TasteDensity, layoutHabits: [String], signatureDetails: [String], avoid: [TasteAvoid],
                motion: TasteMotion = .snappy, shape: TasteShape = .default, voice: TasteVoice = .default) {
        self.designLanguage = designLanguage; self.colors = colors; self.typography = typography
        self.spacing = spacing; self.density = density; self.layoutHabits = layoutHabits
        self.signatureDetails = signatureDetails; self.avoid = avoid
        self.motion = motion; self.shape = shape; self.voice = voice
    }

    private enum CodingKeys: String, CodingKey {
        case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
        case motion, shape, voice
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        designLanguage = try c.decode([String].self, forKey: .designLanguage)
        colors = try c.decode([TasteColor].self, forKey: .colors)
        typography = try c.decode(TasteTypography.self, forKey: .typography)
        spacing = try c.decode(TasteSpacing.self, forKey: .spacing)
        density = try c.decode(TasteDensity.self, forKey: .density)
        layoutHabits = try c.decode([String].self, forKey: .layoutHabits)
        signatureDetails = try c.decode([String].self, forKey: .signatureDetails)
        avoid = try c.decode([TasteAvoid].self, forKey: .avoid)
        motion = try c.decodeIfPresent(TasteMotion.self, forKey: .motion) ?? .snappy
        shape = try c.decodeIfPresent(TasteShape.self, forKey: .shape) ?? .default
        voice = try c.decodeIfPresent(TasteVoice.self, forKey: .voice) ?? .default
    }
    // value(for:), setting(_:to:) and asObject stay as they were.
```
(Keep the three existing members below the new code; the encoder is still synthesized and always writes the new fields.)

- [ ] **Step 4: Run and see it pass**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15 && swift test --filter TasteBoardNewPartsTests 2>&1 | tail -15`
Expected: PASS. If other code constructs `TasteBoard(...)` memberwise, the defaulted init keeps it compiling. Then `swift test 2>&1 | tail -20`: everything that passed before still passes (the `TasteChapters` tests still compile: `TasteChapters.summary` switches over `TasteTile` and now needs the three cases, so add them temporarily to that switch returning `""` if the compiler requires it; Task 6 deletes the file).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Taste/TasteBoard.swift apps/mac/Sources/ShelfCore/Taste/TasteChapters.swift apps/mac/Tests/ShelfCoreTests/TasteBoardNewPartsTests.swift
git commit -m "feat(mac): board model gains motion, shape and voice

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Slots, names, card text and hidden colour cards

**Files:**
- Create: `apps/mac/Sources/ShelfCore/Taste/TasteSlots.swift`
- Delete: `apps/mac/Sources/ShelfCore/Taste/TasteChapters.swift`
- Modify: `apps/mac/Sources/ShelfCore/Taste/TasteCardText.swift`, `TasteStore.swift`
- Test: create `apps/mac/Tests/ShelfCoreTests/TasteSlotsTests.swift`; modify `TastePresentationTests.swift`, `TasteCardTextTests.swift`, `TasteStoreTests.swift`

**Interfaces:**
- Produces: `TasteSlot` (`motion, lettering, shape, space, voice, avoid, craft, mood`; `Identifiable`; `static let boardSlots: [TasteSlot]` = first seven in that order excluding `mood`; `var tiles: [TasteTile]`; `var primaryTile: TasteTile?`; `var title: String`; `var explanation: String`; `static func slot(for: TasteTile) -> TasteSlot?`). `TasteTile.displayName: String`. `TasteStore.pendingCards` excludes colour cards; `TasteStore.pending(in: TasteSlot) -> [TasteCard]`. `TasteCardText.headline` uses the display name and handles the new value shapes.

- [ ] **Step 1: Write the failing tests**

Create `TasteSlotsTests.swift`:

```swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteSlotsTests {
    @Test func everyTileExceptColoursHasExactlyOneSlot() {
        for tile in TasteTile.allCases where tile != .colors {
            let owners = TasteSlot.allCases.filter { $0.tiles.contains(tile) }
            #expect(owners.count == 1, "\(tile) should belong to exactly one slot")
            #expect(TasteSlot.slot(for: tile) == owners.first)
        }
        #expect(TasteSlot.slot(for: .colors) == nil)
    }

    @Test func theBoardHasSevenSlotsInOrder() {
        #expect(TasteSlot.boardSlots == [.motion, .lettering, .shape, .space, .voice, .avoid, .craft])
    }

    @Test func mappingMatchesTheSpec() {
        #expect(TasteSlot.slot(for: .typography) == .lettering)
        #expect(TasteSlot.slot(for: .signatureDetails) == .shape)
        #expect(TasteSlot.slot(for: .density) == .space)
        #expect(TasteSlot.slot(for: .spacing) == .space)
        #expect(TasteSlot.slot(for: .layoutHabits) == .space)
        #expect(TasteSlot.slot(for: .designLanguage) == .mood)
        #expect(TasteSlot.craft.tiles.isEmpty)
        #expect(TasteSlot.craft.primaryTile == nil)
    }

    @Test func everySlotHasATitleAndExplanation() {
        for slot in TasteSlot.allCases {
            #expect(!slot.title.isEmpty)
            #expect(!slot.explanation.isEmpty)
        }
    }

    @Test func tilesHavePlainDisplayNames() {
        #expect(TasteTile.density.displayName == "Density")
        #expect(TasteTile.motion.displayName == "Motion")
        #expect(TasteTile.avoid.displayName == "You avoid")
    }
}
```

`TastePresentationTests.swift`: delete `fourChaptersInOrderEveryRowExplained` and `summariesAreShortAndPlain`; keep `densityPicturesMapOntoFiveStoredValues`; Task 7 rewrites the two sample-style tests.

`TasteCardTextTests.swift` — append:

```swift
    @Test func newTilesReadInPlainWords() {
        #expect(TasteCardText.headline(TasteCard(id: "6", tile: .motion, op: "set", value: .string("smooth"), reason: "", evidenceItemIds: [])) == "Motion · set to Smooth")
        #expect(TasteCardText.headline(TasteCard(id: "7", tile: .shape, op: "set", value: .object(["corners": .string("round"), "depth": .string("hairlines")]), reason: "", evidenceItemIds: [])) == "Shape · set to Round, Hairlines")
        #expect(TasteCardText.headline(TasteCard(id: "8", tile: .voice, op: "set", value: .object(["tone": .string("warm"), "note": .string("")]), reason: "", evidenceItemIds: [])) == "Voice · set to Warm")
    }
```

`TasteStoreTests.swift` — append (use the file's existing `store(_:)` helper and `FakeOrionClient` pattern, as in the other tests):

```swift
    @Test func colourCardsAreHiddenAndCardsGroupBySlot() async {
        let client = FakeOrionClient()
        let colour = TasteCard(id: "c1", tile: .colors, op: "add", value: .object(["hex": .string("#ff5a36"), "role": .string("accent")]), reason: "x", evidenceItemIds: [])
        let density = TasteCard(id: "d1", tile: .density, op: "set", value: .string("dense"), reason: "x", evidenceItemIds: [])
        let spacing = TasteCard(id: "s1", tile: .spacing, op: "set", value: .string("tight"), reason: "x", evidenceItemIds: [])
        let mood = TasteCard(id: "m1", tile: .designLanguage, op: "add", value: .string("bold"), reason: "x", evidenceItemIds: [])
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: [colour, density, spacing, mood])))])
        let store = store(client)
        await store.reload()
        #expect(store.pendingCards.map(\.id) == ["d1", "s1", "m1"])
        #expect(store.pending(in: .space).map(\.id) == ["d1", "s1"])
        #expect(store.pending(in: .mood).map(\.id) == ["m1"])
        #expect(store.pending(in: .motion).isEmpty)
        #expect(store.snapshot?.pending.count == 4)   // the raw list still keeps the colour card
    }
```

- [ ] **Step 2: Run and see them fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (`TasteSlot`, `displayName`, `pending(in:)` do not exist).

- [ ] **Step 3: Implement**

Create `apps/mac/Sources/ShelfCore/Taste/TasteSlots.swift`:

```swift
import Foundation

/// A place on the Taste board (or the mood line). Several stored tiles can feed one slot.
public enum TasteSlot: String, CaseIterable, Sendable, Identifiable {
    case motion, lettering, shape, space, voice, avoid, craft, mood

    public var id: String { rawValue }

    /// The seven tiles and strips shown in the grid, in order.
    public static let boardSlots: [TasteSlot] = [.motion, .lettering, .shape, .space, .voice, .avoid, .craft]

    public var tiles: [TasteTile] {
        switch self {
        case .motion: [.motion]
        case .lettering: [.typography]
        case .shape: [.shape, .signatureDetails]
        case .space: [.density, .spacing, .layoutHabits]
        case .voice: [.voice]
        case .avoid: [.avoid]
        case .craft: []
        case .mood: [.designLanguage]
        }
    }

    /// The tile the panel's plain-words box talks to.
    public var primaryTile: TasteTile? { tiles.first }

    /// Colour has no slot: it is not shown in the Mac app.
    public static func slot(for tile: TasteTile) -> TasteSlot? {
        switch tile {
        case .colors: nil
        case .designLanguage: .mood
        case .typography: .lettering
        case .motion: .motion
        case .shape, .signatureDetails: .shape
        case .density, .spacing, .layoutHabits: .space
        case .voice: .voice
        case .avoid: .avoid
        }
    }

    public var title: String {
        switch self {
        case .motion: String(localized: "Motion & feel")
        case .lettering: String(localized: "Lettering")
        case .shape: String(localized: "Shape")
        case .space: String(localized: "Space")
        case .voice: String(localized: "Voice")
        case .avoid: String(localized: "Steer clear of")
        case .craft: String(localized: "Craft rules")
        case .mood: String(localized: "Mood")
        }
    }

    public var explanation: String {
        switch self {
        case .motion: String(localized: "How quickly things move, and how much. Pick by watching.")
        case .lettering: String(localized: "How heavy and how tight your lettering is. Heavier feels bold and confident; lighter feels quiet.")
        case .shape: String(localized: "How rounded things are, whether depth comes from shadows or thin lines, and the small touches you repeat.")
        case .space: String(localized: "How much is on screen at once, the breathing room between things, and how you like screens arranged.")
        case .voice: String(localized: "How labels and messages sound. Errors always stay calm and plain.")
        case .avoid: String(localized: "Things Orion should never do. Add anything that makes you wince.")
        case .craft: String(localized: "What Orion always does, whatever your taste says. Your taste decides the look; these protect how it feels to use.")
        case .mood: String(localized: "The overall mood of your screens. Pick the words that sound like you.")
        }
    }
}

public extension TasteTile {
    var displayName: String {
        switch self {
        case .designLanguage: String(localized: "Design language")
        case .colors: String(localized: "Colour")
        case .typography: String(localized: "Typography")
        case .spacing: String(localized: "Spacing")
        case .density: String(localized: "Density")
        case .layoutHabits: String(localized: "Layout habits")
        case .signatureDetails: String(localized: "Signature details")
        case .avoid: String(localized: "You avoid")
        case .motion: String(localized: "Motion")
        case .shape: String(localized: "Shape")
        case .voice: String(localized: "Voice")
        }
    }
}
```

`git rm apps/mac/Sources/ShelfCore/Taste/TasteChapters.swift`.

`TasteCardText.swift`: change `let title = TasteChapters.row(for: card.tile).title` to `let title = card.tile.displayName`, and in the `.object(fields)` branch, before `return nil`, add:

```swift
            if case .string(let corners)? = fields["corners"], case .string(let depth)? = fields["depth"] {
                return "set to \(corners.capitalized), \(depth.capitalized)"
            }
            if case .string(let tone)? = fields["tone"] {
                return "set to \(tone.capitalized)"
            }
```
(Place these before the `weight`/`tracking` check or after it; they do not overlap.)

`TasteStore.swift`: replace `public var pendingCards: [TasteCard] { snapshot?.pending ?? [] }` with:

```swift
    /// Cards the Mac app shows: colour cards stay on the server but are never shown here.
    public var pendingCards: [TasteCard] { (snapshot?.pending ?? []).filter { $0.tile != .colors } }
    public func pending(in slot: TasteSlot) -> [TasteCard] {
        pendingCards.filter { TasteSlot.slot(for: $0.tile) == slot }
    }
```

- [ ] **Step 4: Run and see it pass**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20`
Expected: the **ShelfCore** targets build; the **Orion** target now fails where it uses `TasteChapters` (`TastePanelChrome.swift:16`, `TasteChapterList.swift`). Fix by temporarily changing `Text(TasteChapters.row(for: tile).title)` to `Text(tile.displayName)` and leaving `TasteChapterList.swift` for Task 10 to delete: replace its `TasteChapters.all` loop body with `EmptyView()` so it compiles (Task 10 removes the file). Then `swift test 2>&1 | tail -20`: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): taste slots, tile names, card text for new tiles; hide colour cards

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pure specs: motion, craft rules, voice lines, sample style

**Files:**
- Create: `apps/mac/Sources/ShelfCore/Taste/TasteMotionSpec.swift`, `TasteCraftRules.swift`, `TasteVoiceExamples.swift`
- Modify: `apps/mac/Sources/ShelfCore/Taste/TasteSampleStyle.swift`, `apps/mac/Tests/ShelfCoreTests/TastePresentationTests.swift`
- Test: create `apps/mac/Tests/ShelfCoreTests/TasteSpecsTests.swift`

**Interfaces:**
- Produces:
  - `TasteMotionSpec(_ motion: TasteMotion)` with `motion`, `title`, `meaning`, `enterDuration: Double`, `rise: Double`, `blur: Double`, `overshoot: Double`, `curve: [Double]` (4 control points); statics `pressScale = 0.96`, `pressDuration = 0.15`, `exitDuration = 0.15`, `exitRise = 12`, `exitBlur = 4`, `staggerInterval = 0.1`, `loopSeconds = 2.4`.
  - `TasteCraftRule { id, group, title, reason }`, `TasteCraftGroup` (`motion, typeAndSurfaces, touch, words`, with `title`), `TasteCraftRules.all` (8 rules), `TasteCraftRules.rules(in:)`.
  - `TasteVoiceExamples.successLine(for: TasteVoiceTone)`, `.emptyLine(for:)`, `.errorLine`, `.errorsStayPlain`; `TasteVoiceTone.title`.
  - `TasteSampleStyle(board:)` now has `cornerRadius`, `depth`, `motion` and **no colour fields**.

- [ ] **Step 1: Write the failing tests**

Create `TasteSpecsTests.swift`:

```swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteSpecsTests {
    @Test func motionTimingsMatchTheSpec() {
        let instant = TasteMotionSpec(.instant)
        #expect(instant.enterDuration == 0 && instant.rise == 0 && instant.blur == 0 && instant.overshoot == 0)
        let snappy = TasteMotionSpec(.snappy)
        #expect(snappy.enterDuration == 0.15 && snappy.rise == 12 && snappy.blur == 4 && snappy.overshoot == 0)
        #expect(snappy.curve == [0.2, 0, 0, 1])
        #expect(TasteMotionSpec(.smooth).enterDuration == 0.30)
        let playful = TasteMotionSpec(.playful)
        #expect(playful.enterDuration == 0.45)
        #expect(playful.overshoot == 0.03)
    }

    @Test func fixedMotionValuesAreTheSameForEveryPersonality() {
        #expect(TasteMotionSpec.pressScale == 0.96)
        #expect(TasteMotionSpec.pressDuration == 0.15)
        #expect(TasteMotionSpec.exitDuration == 0.15)
        #expect(TasteMotionSpec.exitRise == 12)
        #expect(TasteMotionSpec.exitBlur == 4)
        #expect(TasteMotionSpec.staggerInterval == 0.1)
        #expect(TasteMotionSpec.loopSeconds == 2.4)
    }

    @Test func everyPersonalityHasATitleAndMeaning() {
        for motion in TasteMotion.allCases {
            let spec = TasteMotionSpec(motion)
            #expect(spec.motion == motion)
            #expect(!spec.title.isEmpty && !spec.meaning.isEmpty)
        }
        #expect(TasteMotionSpec(.snappy).title == "Snappy")
    }

    @Test func eightCraftRulesInFourGroups() {
        #expect(TasteCraftRules.all.count == 8)
        #expect(Set(TasteCraftRules.all.map(\.id)).count == 8)
        #expect(TasteCraftRules.all.allSatisfy { !$0.title.isEmpty && !$0.reason.isEmpty })
        #expect(TasteCraftRules.rules(in: .motion).count == 4)
        #expect(TasteCraftRules.rules(in: .typeAndSurfaces).count == 2)
        #expect(TasteCraftRules.rules(in: .touch).count == 1)
        #expect(TasteCraftRules.rules(in: .words).count == 1)
        #expect(TasteCraftRules.all.first?.title == "Pressing a button scales it to 0.96")
    }

    @Test func voiceLinesDifferByToneAndErrorsStayPlain() {
        let lines = Set(TasteVoiceTone.allCases.map { TasteVoiceExamples.successLine(for: $0) })
        #expect(lines.count == 4)
        #expect(TasteVoiceExamples.emptyLine(for: .plain) == "Nothing here yet.")
        #expect(TasteVoiceExamples.errorsStayPlain == "Errors stay calm and plain.")
        #expect(TasteVoiceTone.warm.title == "Warm")
    }

    @Test func sampleStyleFollowsDensityTypeShapeAndMotion() throws {
        let board = TasteFixtures.board
        let airy = TasteSampleStyle(board: board)
        let dense = TasteSampleStyle(board: try #require(board.setting(.density, to: .string("dense"))))
        #expect(airy.rowGap > dense.rowGap)
        #expect(airy.padding > dense.padding)
        let heavy = TasteSampleStyle(board: try #require(board.setting(.typography, to: .object(["weight": .string("heavy"), "tracking": .string("tight"), "note": .string("")]))))
        #expect(heavy.titleWeight == .heavy)
        #expect(heavy.tracking < 0)
        let round = TasteSampleStyle(board: try #require(board.setting(.shape, to: .object(["corners": .string("round"), "depth": .string("flat")]))))
        let sharp = TasteSampleStyle(board: try #require(board.setting(.shape, to: .object(["corners": .string("sharp"), "depth": .string("flat")]))))
        #expect(round.cornerRadius > sharp.cornerRadius)
        #expect(round.depth == .flat)
        #expect(TasteSampleStyle(board: board).motion == .snappy)
    }
}
```
In `TastePresentationTests.swift` delete `sampleStyleFollowsTheBoard` and `sampleFallsBackWhenColoursAreMissing` (the new test above replaces them).

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (new types missing; `TasteSampleStyle` has no `cornerRadius`).

- [ ] **Step 3: Implement**

`TasteMotionSpec.swift`:

```swift
import Foundation

/// What a motion personality means in exact numbers (spec B3). Pure data.
public struct TasteMotionSpec: Equatable, Sendable {
    public let motion: TasteMotion
    public let title: String
    public let meaning: String
    public let enterDuration: Double
    public let rise: Double
    public let blur: Double
    public let overshoot: Double
    public let curve: [Double]

    public static let pressScale = 0.96
    public static let pressDuration = 0.15
    public static let exitDuration = 0.15
    public static let exitRise = 12.0
    public static let exitBlur = 4.0
    public static let staggerInterval = 0.1
    public static let loopSeconds = 2.4

    public init(_ motion: TasteMotion) {
        self.motion = motion
        let easeOut = [0.2, 0.0, 0.0, 1.0]
        switch motion {
        case .instant:
            title = String(localized: "Instant"); meaning = String(localized: "No movement · 0 ms")
            enterDuration = 0; rise = 0; blur = 0; overshoot = 0; curve = easeOut
        case .snappy:
            title = String(localized: "Snappy"); meaning = String(localized: "Quick, no bounce · 150 ms")
            enterDuration = 0.15; rise = 12; blur = 4; overshoot = 0; curve = easeOut
        case .smooth:
            title = String(localized: "Smooth"); meaning = String(localized: "Calm and soft · 300 ms")
            enterDuration = 0.30; rise = 12; blur = 4; overshoot = 0; curve = easeOut
        case .playful:
            title = String(localized: "Playful"); meaning = String(localized: "A little overshoot · 450 ms")
            enterDuration = 0.45; rise = 12; blur = 4; overshoot = 0.03; curve = easeOut
        }
    }
}
```

`TasteCraftRules.swift`:

```swift
import Foundation

public enum TasteCraftGroup: String, CaseIterable, Sendable {
    case motion, typeAndSurfaces, touch, words
    public var title: String {
        switch self {
        case .motion: String(localized: "Motion")
        case .typeAndSurfaces: String(localized: "Type and surfaces")
        case .touch: String(localized: "Touch")
        case .words: String(localized: "Words")
        }
    }
}

public struct TasteCraftRule: Equatable, Sendable, Identifiable {
    public let id: String
    public let group: TasteCraftGroup
    public let title: String
    public let reason: String
}

/// The eight rules Orion always follows (spec Part A). Read-only.
public enum TasteCraftRules {
    public static let all: [TasteCraftRule] = [
        rule("press", .motion, "Pressing a button scales it to 0.96", "So buttons feel pressed. Never on disabled controls."),
        rule("exit", .motion, "Things leave faster and smaller than they arrive", "Exits take 150 ms and move 12 pt; entrances take longer."),
        rule("constant", .motion, "Things used constantly never animate", "Keyboard shortcuts, hovering rows and tab switches respond instantly."),
        rule("reduce", .motion, "Reduced Motion is respected", "People who ask for less motion get a fade, not movement."),
        rule("numbers", .typeAndSurfaces, "Numbers that change line up", "Tabular figures stop digits jumping as values change."),
        rule("corners", .typeAndSurfaces, "Nested rounded corners add up", "Outer radius = inner radius + padding, so curves look even."),
        rule("tap", .touch, "Tap targets are at least 44 px", "Even when the icon is small, the hit area is not."),
        rule("errors", .words, "Errors stay calm and plain", "They say how to fix it, whatever tone you picked."),
    ]

    public static func rules(in group: TasteCraftGroup) -> [TasteCraftRule] { all.filter { $0.group == group } }

    private static func rule(_ id: String, _ group: TasteCraftGroup, _ title: String.LocalizationValue, _ reason: String.LocalizationValue) -> TasteCraftRule {
        TasteCraftRule(id: id, group: group, title: String(localized: title), reason: String(localized: reason))
    }
}
```

`TasteVoiceExamples.swift`:

```swift
import Foundation

public extension TasteVoiceTone {
    var title: String {
        switch self {
        case .plain: String(localized: "Plain")
        case .warm: String(localized: "Warm")
        case .formal: String(localized: "Formal")
        case .playful: String(localized: "Playful")
        }
    }
}

/// Example lines per tone. Fixed text, no model. Errors never change with tone.
public enum TasteVoiceExamples {
    public static func successLine(for tone: TasteVoiceTone) -> String {
        switch tone {
        case .plain: String(localized: "Saved.")
        case .warm: String(localized: "All saved. Nice work.")
        case .formal: String(localized: "Your changes have been saved.")
        case .playful: String(localized: "Boom, saved!")
        }
    }

    public static func emptyLine(for tone: TasteVoiceTone) -> String {
        switch tone {
        case .plain: String(localized: "Nothing here yet.")
        case .warm: String(localized: "Nothing here yet. Add your first one.")
        case .formal: String(localized: "There are no items to display.")
        case .playful: String(localized: "Nothing here yet. Go on, add one!")
        }
    }

    public static let errorLine = String(localized: "Couldn't save. Check your connection and try again.")
    public static let errorsStayPlain = String(localized: "Errors stay calm and plain.")
}
```

Replace `TasteSampleStyle.swift` with:

```swift
import Foundation

/// What the preview needs, worked out from a board. Pure numbers. No colour: colour comes from each project.
public struct TasteSampleStyle: Equatable, Sendable {
    public let rowGap: Double
    public let padding: Double
    public let titleSize: Double
    public let titleWeight: TasteWeight
    public let tracking: Double
    public let cornerRadius: Double
    public let depth: TasteDepth
    public let motion: TasteMotion
    public let screenTitle = "Welcome back"

    public init(board: TasteBoard) {
        let densityGap: Double = switch board.density {
        case .airy: 22
        case .light: 17
        case .balanced: 12
        case .compact: 8
        case .dense: 5
        }
        let spacingFactor: Double = switch board.spacing {
        case .tight: 0.8
        case .comfortable: 1.0
        case .generous: 1.2
        }
        rowGap = densityGap * spacingFactor
        padding = 12 + densityGap * spacingFactor * 0.6
        titleSize = 22
        titleWeight = board.typography.weight
        tracking = switch board.typography.tracking {
        case .loose: 0.6
        case .normal: 0
        case .tight: -0.8
        }
        cornerRadius = switch board.shape.corners {
        case .sharp: 4
        case .soft: 10
        case .round: 18
        }
        depth = board.shape.depth
        motion = board.motion
    }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `cd apps/mac && swift test --filter ShelfCoreTests 2>&1 | tail -20`
Expected: PASS. (`TasteSampleView` in the Orion target still references the removed colour fields; Task 10 deletes it. To keep the build green now, delete `apps/mac/Sources/Orion/Taste/TasteSampleView.swift` in this task and replace its one use in `TasteScreen.swift` (`TasteSampleView(style: TasteSampleStyle(board: board))...`) with `EmptyView()`; Task 10 rewrites that file.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): motion spec, craft rules, voice lines and colour-free sample style

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Board tiles and grid (SwiftUI)

**Files:** create in `apps/mac/Sources/Orion/Taste/Board/`: `TasteWeight+Font.swift`, `TasteChip.swift`, `TasteTileCard.swift`, `MotionLoopDemo.swift`, `ShapePicture.swift`, `TasteBoardTiles.swift`, `TasteBoardGrid.swift`
Modify: `apps/mac/Sources/Orion/Taste/TasteModel.swift`
Test: `apps/mac/Tests/OrionTests/TasteModelTests.swift` (slot state)

**Interfaces:**
- Consumes: Tasks 5–7 (`TasteSlot`, `TasteMotionSpec`, `TasteCraftRules`, `TasteVoiceExamples`, `TasteSampleStyle`), `TasteStore.pending(in:)`, `TasteStore.decide`.
- Produces: `TasteModel.openSlot: TasteSlot?`, `TasteModel.isPreviewing: Bool`, `open(_ slot:)`, `closePanel()`; `TasteBoardGrid(model:board:)`; `TasteTileCard`, `TasteChip`, `MotionLoopDemo(spec:compact:)`, `ShapePicture(corners:depth:)`, `TasteWeight.fontWeight`.

This is view code; the build and the visual check in Task 11 are the verification. The only unit-testable part is `TasteModel`'s slot state, tested first.

- [ ] **Step 1: Write the failing test**

In `apps/mac/Tests/OrionTests/TasteModelTests.swift` (the helper is `model(editable:) async -> (TasteModel, FakeOrionClient)`), replace the two tests `opensAndClosesAPanel` and `cannotOpenAPanelWhileOffline` with these (they used `openTile`, which becomes `openSlot`), and keep `sampleBoardIsTheBoardUntilACardIsPreviewed` as it is:

```swift
    @Test func opensAndClosesAPanel() async {
        let (model, _) = await model()
        model.open(.space)
        #expect(model.openSlot == .space)
        model.closePanel()
        #expect(model.openSlot == nil)
    }

    @Test func cannotOpenAnEditingPanelWhileOfflineButCraftRulesStayReadable() async {
        let (model, _) = await model(editable: false)
        model.open(.motion)
        #expect(model.openSlot == nil)
        model.open(.craft)
        #expect(model.openSlot == .craft)
    }

    @Test func closingAPanelDoesNotCloseThePreview() async {
        let (model, _) = await model()
        model.open(.motion)
        model.isPreviewing = true
        model.closePanel()
        #expect(model.openSlot == nil)
        #expect(model.isPreviewing)
    }
```

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (`openSlot`, `isPreviewing` do not exist).

- [ ] **Step 3: Implement the model, then the views**

`TasteModel.swift` — replace the whole file with:

```swift
import Observation
import ShelfCore

@MainActor
@Observable
final class TasteModel {
    let store: TasteStore
    var openSlot: TasteSlot?
    var isPreviewing = false
    var previewCardID: String?
    var toast: String?

    init(store: TasteStore) {
        self.store = store
    }

    /// The board with the hovered pending card applied, for the preview. Never saved.
    var sampleBoard: TasteBoard? {
        let card = store.snapshot?.pending.first { $0.id == previewCardID }
        return store.preview(card)
    }

    func open(_ slot: TasteSlot) {
        guard store.canEdit || slot == .craft else { return }
        openSlot = slot
    }

    func closePanel() { openSlot = nil }
}
```
Update `apps/mac/Sources/Orion/App/AppDelegate.swift:41` to `let taste = TasteModel(store: tasteStore)`. (`inspiration` is no longer a parameter; if `inspiration` becomes unused in `AppDelegate`, leave the variable: other code uses it.)

`Board/TasteWeight+Font.swift`:

```swift
import ShelfCore
import SwiftUI

extension TasteWeight {
    var fontWeight: Font.Weight {
        switch self {
        case .light: .light
        case .regular: .regular
        case .bold: .bold
        case .heavy: .heavy
        }
    }
}
```

`Board/TasteChip.swift`:

```swift
import OrionDesignSystem
import SwiftUI

struct TasteChip: View {
    let text: String
    var isStruck = false

    var body: some View {
        Text(text)
            .font(.caption2)
            .lineLimit(1)
            .strikethrough(isStruck, color: OrionColor.loudRed.color)
            .foregroundStyle(isStruck ? .secondary : .primary)
            .padding(.horizontal, OrionSpacing.xs)
            .padding(.vertical, 3)
            .background(Color.primary.opacity(0.08), in: Capsule(style: .continuous))
    }
}
```

`Board/TasteTileCard.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// One tile of the board: label, specimen, and (when Orion has a suggestion for it) a dashed
/// cyan ring with Keep / Remove right on the tile.
struct TasteTileCard<Content: View>: View {
    let label: LocalizedStringKey
    var pending: [TasteCard] = []
    var isSelected = false
    var isEnabled = true
    let onOpen: () -> Void
    let onPreview: (String?) -> Void
    let onDecide: (TasteCard, TasteDecision) -> Void
    @ViewBuilder var content: () -> Content

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: OrionRadius.large, style: .continuous) }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .tracking(0.4)
                .foregroundStyle(.secondary)
            content()
            Spacer(minLength: 0)
            ForEach(pending, id: \.id) { card in footer(card) }
        }
        .padding(OrionSpacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.primary.opacity(0.06), in: shape)
        .overlay { ring }
        .contentShape(shape)
        .onTapGesture { if isEnabled { onOpen() } }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder private var ring: some View {
        if !pending.isEmpty {
            shape.strokeBorder(OrionColor.dayBreakBlue.color, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
        } else if isSelected {
            shape.strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
        }
    }

    private func footer(_ card: TasteCard) -> some View {
        HStack(spacing: OrionSpacing.xs) {
            Text(TasteCardText.headline(card))
                .font(.caption)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Keep") { onDecide(card, .kept) }
                .buttonStyle(OrionButtonStyle(.primary))
            Button("Remove") { onDecide(card, .rejected) }
                .buttonStyle(OrionButtonStyle(.secondary))
        }
        .padding(OrionSpacing.xs)
        .background(.regularMaterial, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
        .onHover { onPreview($0 ? card.id : nil) }
    }
}
```

`Board/MotionLoopDemo.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

extension TasteMotionSpec {
    var enterAnimation: Animation? {
        switch motion {
        case .instant: nil
        case .playful: .spring(duration: enterDuration, bounce: 0.15)
        case .snappy, .smooth: .timingCurve(curve[0], curve[1], curve[2], curve[3], duration: enterDuration)
        }
    }

    var exitAnimation: Animation? {
        motion == .instant ? nil : .timingCurve(0.2, 0, 0, 1, duration: Self.exitDuration)
    }
}

/// A toast that arrives and leaves and a button that presses, looping on a 2.4 s cycle at the
/// chosen speed. With Reduce Motion on it stops on the end state.
struct MotionLoopDemo: View {
    let spec: TasteMotionSpec
    var compact = false
    var toastText = "Saved"
    var buttonTitle = "Save changes"

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = true
    @State private var pressed = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? OrionSpacing.xs : OrionSpacing.sm) {
            HStack(spacing: OrionSpacing.xs) {
                Circle().fill(Color.green).frame(width: 10, height: 10)
                Text(toastText).font(compact ? .caption2 : .caption)
            }
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xxs + 2)
            .background(Color.primary.opacity(0.12), in: Capsule(style: .continuous))
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : spec.rise)
            .blur(radius: shown ? 0 : spec.blur)

            Text(buttonTitle)
                .font(compact ? .caption2.weight(.semibold) : .caption.weight(.semibold))
                .foregroundStyle(.black)
                .padding(.horizontal, OrionSpacing.sm)
                .padding(.vertical, OrionSpacing.xxs + 2)
                .background(.white, in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
                .scaleEffect(pressed ? TasteMotionSpec.pressScale : 1)
        }
        .task(id: spec) { await loop() }
        .accessibilityHidden(true)
    }

    private func loop() async {
        shown = true
        pressed = false
        guard !reduceMotion else { return }
        while !Task.isCancelled {
            withAnimation(nil) { shown = false }
            try? await Task.sleep(for: .milliseconds(300))
            withAnimation(spec.enterAnimation) { shown = true }
            try? await Task.sleep(for: .milliseconds(800))
            withAnimation(.easeOut(duration: TasteMotionSpec.pressDuration)) { pressed = true }
            try? await Task.sleep(for: .milliseconds(450))
            withAnimation(.easeOut(duration: TasteMotionSpec.pressDuration)) { pressed = false }
            try? await Task.sleep(for: .milliseconds(500))
            withAnimation(spec.exitAnimation) { shown = false }
            try? await Task.sleep(for: .milliseconds(350))
        }
    }
}
```

`Board/ShapePicture.swift`:

```swift
import ShelfCore
import SwiftUI

/// Nested rounded rectangles drawn with the rule outer radius = inner radius + padding.
struct ShapePicture: View {
    let corners: TasteCorners
    let depth: TasteDepth
    var size = CGSize(width: 84, height: 62)

    private let padding: CGFloat = 8
    private var innerRadius: CGFloat {
        switch corners {
        case .sharp: 2
        case .soft: 8
        case .round: 16
        }
    }

    var body: some View {
        let outer = innerRadius + padding
        ZStack {
            RoundedRectangle(cornerRadius: outer, style: .continuous)
                .fill(Color.primary.opacity(0.14))
                .shadow(color: depth == .shadows ? .black.opacity(0.35) : .clear, radius: 6, y: 3)
                .overlay {
                    if depth == .hairlines {
                        RoundedRectangle(cornerRadius: outer, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.4), lineWidth: 1)
                    }
                }
            RoundedRectangle(cornerRadius: innerRadius, style: .continuous)
                .fill(Color.primary.opacity(0.3))
                .padding(padding)
        }
        .frame(width: size.width, height: size.height)
        .accessibilityHidden(true)
    }
}
```

`Board/TasteBoardTiles.swift` (the six specimens and the two strips):

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct MotionTileContent: View {
    let board: TasteBoard
    var body: some View {
        let spec = TasteMotionSpec(board.motion)
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(spec.title).font(.system(size: 30, weight: .heavy)).tracking(-1)
            Text(spec.meaning).font(.caption).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            MotionLoopDemo(spec: spec)
        }
    }
}

struct LetteringTileContent: View {
    let board: TasteBoard
    var body: some View {
        let style = TasteSampleStyle(board: board)
        HStack(alignment: .bottom, spacing: OrionSpacing.md) {
            Text("Aa")
                .font(.system(size: 56, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking * 3)
            VStack(alignment: .leading, spacing: 4) {
                Text("Welcome back")
                    .font(.system(size: 17, weight: style.titleWeight.fontWeight))
                    .tracking(style.tracking)
                Text("Body text stays easy to read").font(.system(size: 12))
                Text("1,284.50").font(.system(size: 12).monospacedDigit())
                Text("\(board.typography.weight.rawValue.capitalized) · \(board.typography.tracking.rawValue)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
    }
}

struct ShapeTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                ShapePicture(corners: board.shape.corners, depth: board.shape.depth)
                VStack(alignment: .leading, spacing: 2) {
                    Text(board.shape.corners.rawValue.capitalized).font(.subheadline.weight(.semibold))
                    Text(board.shape.depth.rawValue.capitalized).font(.caption).foregroundStyle(.secondary)
                }
            }
            if !board.signatureDetails.isEmpty {
                FlowLayout(spacing: OrionSpacing.xxs) {
                    ForEach(board.signatureDetails.prefix(2), id: \.self) { TasteChip(text: $0) }
                }
            }
        }
    }
}

struct DensityPicture: View {
    let density: TasteDensity
    var body: some View {
        let choice = DensityChoice.choice(for: density)
        let rows = choice == .airy ? 2 : (choice == .balanced ? 3 : 5)
        VStack(spacing: choice == .packed ? 2 : (choice == .balanced ? 4 : 8)) {
            ForEach(0..<rows, id: \.self) { _ in
                Capsule().fill(Color.primary.opacity(0.3)).frame(height: 6)
            }
        }
        .frame(width: 84)
        .accessibilityHidden(true)
    }
}

struct SpaceTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                DensityPicture(density: board.density)
                VStack(alignment: .leading, spacing: 2) {
                    Text(board.density.rawValue.capitalized).font(.subheadline.weight(.semibold))
                    Text("\(board.spacing.rawValue.capitalized) gaps").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !board.layoutHabits.isEmpty {
                FlowLayout(spacing: OrionSpacing.xxs) {
                    ForEach(board.layoutHabits.prefix(3), id: \.self) { TasteChip(text: $0) }
                }
            }
        }
    }
}

struct VoiceTileContent: View {
    let board: TasteBoard
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(board.voice.tone.title).font(.subheadline.weight(.semibold))
            TasteChip(text: TasteVoiceExamples.successLine(for: board.voice.tone))
            TasteChip(text: TasteVoiceExamples.emptyLine(for: board.voice.tone))
        }
    }
}

struct AvoidStripContent: View {
    let board: TasteBoard
    var body: some View {
        HStack(spacing: OrionSpacing.xs) {
            if board.avoid.isEmpty {
                Text("None yet").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(board.avoid.prefix(3), id: \.text) { TasteChip(text: $0.text, isStruck: true) }
                if board.avoid.count > 3 {
                    Text("+\(board.avoid.count - 3)").font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct CraftStripContent: View {
    var body: some View {
        HStack(spacing: OrionSpacing.xs) {
            Image(systemName: "lock.fill").font(.caption).foregroundStyle(OrionColor.dayBreakBlue.color)
            Text("Always on").font(.caption).foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Text("\(TasteCraftRules.all.count) rules ›").font(.caption).foregroundStyle(.secondary)
        }
    }
}
```
(`FlowLayout` already exists in `Orion/Inspiration/FlowLayout.swift`; `DensityChoice` is in ShelfCore.)

`Board/TasteBoardGrid.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// The six tiles and two strips. Six columns wide; two columns below 720 pt.
struct TasteBoardGrid: View {
    @Bindable var model: TasteModel
    let board: TasteBoard

    private func card<C: View>(_ slot: TasteSlot, _ label: LocalizedStringKey, @ViewBuilder _ content: @escaping () -> C) -> some View {
        TasteTileCard(
            label: label,
            pending: model.store.pending(in: slot),
            isSelected: model.openSlot == slot,
            isEnabled: model.store.canEdit || slot == .craft,
            onOpen: { model.open(slot) },
            onPreview: { model.previewCardID = $0 },
            onDecide: { card, decision in Task { await model.store.decide(card, decision) } },
            content: content
        )
    }

    private var motion: some View { card(.motion, "MOTION & FEEL") { MotionTileContent(board: board) } }
    private var lettering: some View { card(.lettering, "LETTERING") { LetteringTileContent(board: board) } }
    private var shape: some View { card(.shape, "SHAPE") { ShapeTileContent(board: board) } }
    private var space: some View { card(.space, "SPACE") { SpaceTileContent(board: board) } }
    private var voice: some View { card(.voice, "VOICE") { VoiceTileContent(board: board) } }
    private var avoid: some View { card(.avoid, "STEER CLEAR OF") { AvoidStripContent(board: board) } }
    private var craft: some View { card(.craft, "CRAFT RULES") { CraftStripContent() } }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            wide.frame(minWidth: 720)
            narrow
        }
    }

    private var wide: some View {
        Grid(horizontalSpacing: OrionSpacing.xs, verticalSpacing: OrionSpacing.xs) {
            GridRow {
                motion.frame(height: 210).gridCellColumns(3)
                lettering.frame(height: 210).gridCellColumns(3)
            }
            GridRow {
                shape.frame(height: 150).gridCellColumns(2)
                space.frame(height: 150).gridCellColumns(2)
                voice.frame(height: 150).gridCellColumns(2)
            }
            GridRow {
                avoid.frame(height: 76).gridCellColumns(3)
                craft.frame(height: 76).gridCellColumns(3)
            }
        }
    }

    private var narrow: some View {
        VStack(spacing: OrionSpacing.xs) {
            HStack(spacing: OrionSpacing.xs) { motion.frame(height: 210); lettering.frame(height: 210) }
            HStack(spacing: OrionSpacing.xs) { shape.frame(height: 150); space.frame(height: 150) }
            HStack(spacing: OrionSpacing.xs) { voice.frame(height: 110); avoid.frame(height: 110) }
            craft.frame(height: 76)
        }
    }
}
```

- [ ] **Step 4: Build and test**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -30 && swift test --filter OrionTests 2>&1 | tail -20`
Expected: builds (fix any API mismatch the compiler reports, keeping the behaviour above), tests PASS. `TasteScreen` still shows the old content until Task 10; it must still compile: it references `model.openTile`, which no longer exists. In `TasteScreen.swift` replace `model.openTile` reads with `model.openSlot` placeholders only as far as needed to compile (`if let tile = model.openTile { TasteEditPanel(tile: tile, ...) }` → `if model.openSlot != nil { EmptyView() }`); Task 10 rewrites the file.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): style-guide board tiles, grid and live motion demo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Slot panels

**Files:**
- Create: `apps/mac/Sources/Orion/Taste/Panels/MotionControls.swift`, `ShapeControls.swift`, `VoiceControls.swift`, `SpaceControls.swift`, `CraftRulesPanel.swift`
- Modify: `TasteEditPanel.swift`, `Panels/TastePanelChrome.swift`, `Panels/TypographyPanel.swift`, `DensityPanel.swift`, `SpacingPanel.swift`, `ListPanel.swift`
- Delete: `Panels/ColourPanel.swift`, `Panels/LibraryImagePicker.swift`, `TastePanelRequests.fromImage`
- Test: `apps/mac/Tests/OrionTests/TastePanelComposeTests.swift`

**Interfaces:**
- Consumes: Task 8 (`TasteModel.openSlot`, `MotionLoopDemo`, `ShapePicture`, `TasteChip`), Task 6/7.
- Produces: `TasteEditPanel(slot:model:)`; `TastePanelChrome(slot:model:content:)`; content-only views `TypographyControls`, `DensityControls`, `SpacingControls`, `ListEditor(tile:model:)`, `MotionControls`, `ShapeControls`, `VoiceControls`, `SpaceControls`; `CraftRulesPanel`.

- [ ] **Step 1: Update the test**

In `TastePanelComposeTests.swift` delete the test `imageRequestTargetsColourFromTheLibraryImage` (the "pull colour from an image" request no longer exists) and keep `blankOrHugeWordsAreRefused`.

- [ ] **Step 2: Remove `fromImage` and see the build fail where it is used**

In `TastePanelRequests.swift` delete `static func fromImage(_ id: UUID) -> TasteComposeRequest { ... }`.
Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL in `ColourPanel.swift` (uses `fromImage`).

- [ ] **Step 3: Implement**

1. Delete `Panels/ColourPanel.swift` (it also defines `TasteDashedChips` and `TasteDashedChipStyle`; `ListPanel` uses `TasteDashedChips`, so **move** those two types, unchanged, into a new file `Panels/TasteDashedChips.swift` before deleting) and `Panels/LibraryImagePicker.swift`.

2. Replace `Panels/TastePanelChrome.swift` with (the "Why Orion chose this" box, plain-words box and footer are kept; they now work per slot):

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Shared back link, title, explanation, reason box, content, and Done / reset footer for one slot.
struct TastePanelChrome<Content: View>: View {
    let slot: TasteSlot
    @Bindable var model: TasteModel
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("‹ Back to board") { model.closePanel() }
                    .buttonStyle(OrionButtonStyle(.quiet))
                Text(slot.title).font(.title3.weight(.semibold))
                Text(slot.explanation).font(.callout).foregroundStyle(.secondary)
                content()
                if let reason, !reason.isEmpty {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text("Why Orion chose this").font(.caption.weight(.semibold))
                        Text(reason).font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OrionSpacing.sm)
                    .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                }
                if let primary = slot.primaryTile {
                    PlainWordsBox(tile: primary, model: model)
                }
                HStack(spacing: OrionSpacing.sm) {
                    Button("Done") { model.closePanel() }
                        .buttonStyle(OrionButtonStyle(.primary))
                    Button("Let Orion decide again") {
                        Task {
                            var ok = true
                            for tile in slot.tiles { ok = await model.store.resetTile(tile) && ok }
                            if ok { model.toast = String(localized: "Orion will look again after your next saves.") }
                        }
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    Spacer(minLength: 0)
                }
                .padding(.top, OrionSpacing.xs)
            }
            .padding(OrionSpacing.md)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var reason: String? {
        model.store.pending(in: slot).first { !$0.reason.isEmpty }?.reason
    }
}
```

3. For each of `TypographyPanel.swift`, `DensityPanel.swift`, `SpacingPanel.swift`, `ListPanel.swift`: rename the struct (`TypographyControls`, `DensityControls`, `SpacingControls`, `ListEditor`) and **remove the `TastePanelChrome(tile: ..., model: model) { ... }` wrapper**, keeping only its inner content as the `body`. (Each file's `body` currently is `TastePanelChrome(tile: X, model: model) { VStack(...) { ... } }`; the new `body` is just that `VStack(...) { ... }`.) For `ListEditor`, the existing `tile` parameter stays. In `TypographyControls`, the "Quick starts" section and the Apple note were already removed in Plan 1; confirm none remain.

4. Create the new controls:

`Panels/MotionControls.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct MotionControls: View {
    @Bindable var model: TasteModel
    private var current: TasteMotion { model.store.board?.motion ?? .snappy }

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: OrionSpacing.sm), GridItem(.flexible())], spacing: OrionSpacing.sm) {
            ForEach(TasteMotion.allCases, id: \.self) { motion in
                let spec = TasteMotionSpec(motion)
                Button {
                    Task { await model.store.save(.motion, to: .string(motion.rawValue)) }
                } label: {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(spec.title).font(.subheadline.weight(.semibold))
                        Text(spec.meaning).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                        MotionLoopDemo(spec: spec, compact: true)
                    }
                    .padding(OrionSpacing.sm)
                    .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
                    .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    .overlay {
                        if current == motion {
                            RoundedRectangle(cornerRadius: OrionRadius.medium, style: .continuous)
                                .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(!model.store.canEdit)
                .accessibilityLabel(spec.title)
                .accessibilityAddTraits(current == motion ? [.isSelected] : [])
            }
        }
    }
}
```

`Panels/ShapeControls.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct ShapeControls: View {
    @Bindable var model: TasteModel
    private var shape: TasteShape { model.store.board?.shape ?? .default }

    private func save(corners: TasteCorners? = nil, depth: TasteDepth? = nil) {
        let next = TasteShape(corners: corners ?? shape.corners, depth: depth ?? shape.depth)
        Task {
            await model.store.save(.shape, to: .object(["corners": .string(next.corners.rawValue), "depth": .string(next.depth.rawValue)]))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Text("Corners").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: OrionSpacing.xs) {
                ForEach(TasteCorners.allCases, id: \.self) { corners in
                    PictureChoice(title: corners.rawValue.capitalized, isSelected: shape.corners == corners) {
                        save(corners: corners)
                    } picture: {
                        ShapePicture(corners: corners, depth: shape.depth)
                    }
                }
            }
            Text("Depth").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: OrionSpacing.xs) {
                ForEach(TasteDepth.allCases, id: \.self) { depth in
                    PictureChoice(title: depth.rawValue.capitalized, isSelected: shape.depth == depth) {
                        save(depth: depth)
                    } picture: {
                        ShapePicture(corners: shape.corners, depth: depth)
                    }
                }
            }
            Text("Signature details").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ListEditor(tile: .signatureDetails, model: model)
        }
        .disabled(!model.store.canEdit)
    }
}
```

`Panels/VoiceControls.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct VoiceControls: View {
    @Bindable var model: TasteModel
    @State private var note = ""
    private var voice: TasteVoice { model.store.board?.voice ?? .default }

    private func save(tone: TasteVoiceTone? = nil, note: String? = nil) {
        let next = TasteVoice(tone: tone ?? voice.tone, note: String((note ?? voice.note).prefix(80)))
        Task {
            await model.store.save(.voice, to: .object(["tone": .string(next.tone.rawValue), "note": .string(next.note)]))
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            ForEach(TasteVoiceTone.allCases, id: \.self) { tone in
                Button { save(tone: tone) } label: {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(tone.title).font(.subheadline.weight(.semibold))
                        TasteChip(text: TasteVoiceExamples.successLine(for: tone))
                        TasteChip(text: TasteVoiceExamples.emptyLine(for: tone))
                    }
                    .padding(OrionSpacing.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    .overlay {
                        if voice.tone == tone {
                            RoundedRectangle(cornerRadius: OrionRadius.medium, style: .continuous)
                                .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            Text(TasteVoiceExamples.errorsStayPlain).font(.caption).foregroundStyle(.secondary)
            TextField("A note about how it should sound (optional)", text: $note)
                .textFieldStyle(.roundedBorder)
                .onSubmit { save(note: note) }
        }
        .disabled(!model.store.canEdit)
        .onAppear { note = voice.note }
    }
}
```

`Panels/SpaceControls.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct SpaceControls: View {
    @Bindable var model: TasteModel
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Text("Density").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            DensityControls(model: model)
            Text("Spacing").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            SpacingControls(model: model)
            Text("Layout habits").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ListEditor(tile: .layoutHabits, model: model)
        }
    }
}
```

`Panels/CraftRulesPanel.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Read-only: what Orion always does. No editing, no reset.
struct CraftRulesPanel: View {
    @Bindable var model: TasteModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("‹ Back to board") { model.closePanel() }
                    .buttonStyle(OrionButtonStyle(.quiet))
                Label(TasteSlot.craft.title, systemImage: "lock.fill").font(.title3.weight(.semibold))
                Text(TasteSlot.craft.explanation).font(.callout).foregroundStyle(.secondary)
                ForEach(TasteCraftGroup.allCases, id: \.self) { group in
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text(group.title.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        VStack(spacing: 0) {
                            ForEach(TasteCraftRules.rules(in: group)) { rule in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(rule.title).font(.subheadline)
                                    Text(rule.reason).font(.caption).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(OrionSpacing.sm)
                                Divider()
                            }
                        }
                        .background(Color.primary.opacity(0.06), in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                    }
                }
            }
            .padding(OrionSpacing.md)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
```

5. Replace `TasteEditPanel.swift`:

```swift
import ShelfCore
import SwiftUI

struct TasteEditPanel: View {
    let slot: TasteSlot
    @Bindable var model: TasteModel

    var body: some View {
        if slot == .craft {
            CraftRulesPanel(model: model)
        } else {
            TastePanelChrome(slot: slot, model: model) { controls }
        }
    }

    @ViewBuilder private var controls: some View {
        switch slot {
        case .motion: MotionControls(model: model)
        case .lettering: TypographyControls(model: model)
        case .shape: ShapeControls(model: model)
        case .space: SpaceControls(model: model)
        case .voice: VoiceControls(model: model)
        case .avoid: ListEditor(tile: .avoid, model: model)
        case .mood: ListEditor(tile: .designLanguage, model: model)
        case .craft: EmptyView()
        }
    }
}
```

- [ ] **Step 4: Build and test**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -30 && swift test 2>&1 | tail -20`
Expected: builds and PASSES. (If `TasteScreen.swift` still references `TasteEditPanel(tile:...)` from the old layout, Task 10 replaces it; keep the placeholder from Task 8.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): slot edit panels, craft rules panel; remove the colour panel

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Preview overlay, new Taste screen, reply in the composer

**Files:**
- Create: `apps/mac/Sources/Orion/Taste/Board/TasteHeader.swift`, `TastePreviewOverlay.swift`
- Modify: `apps/mac/Sources/Orion/Taste/TasteScreen.swift`, `TasteComposerView.swift`, `ComposerDraft.swift`
- Delete: `TasteChapterList.swift`, `TasteCardTray.swift` (reply moves into the composer), `Panels/MiniScreen.swift` stays (used by `PictureChoice`)
- Test: `apps/mac/Tests/OrionTests/ComposerDraftTests.swift` (create if absent; otherwise append)

**Interfaces:**
- Consumes: Tasks 8–9.
- Produces: `ComposerDraft.replyTargets(pending: [TasteCard]) -> [String]`; the finished screen.

- [ ] **Step 1: Write the failing test**

Create or extend `apps/mac/Tests/OrionTests/ComposerDraftTests.swift`:

```swift
import Foundation
import ShelfCore
import Testing
@testable import Orion

struct ComposerDraftReplyTests {
    private func card(_ id: String, origin: String?) -> TasteCard {
        TasteCard(id: id, tile: .density, op: "set", value: .string("dense"), reason: "", evidenceItemIds: [], origin: origin)
    }

    @Test func aWordsOnlyFollowUpRepliesToPendingComposerCards() {
        var draft = ComposerDraft()
        draft.words = "make it less airy"
        let pending = [card("a", origin: "composer"), card("b", origin: "learning")]
        #expect(draft.replyTargets(pending: pending) == ["a"])
    }

    @Test func aDraftWithFilesOrLinksStartsFresh() {
        var draft = ComposerDraft()
        draft.words = "use this"
        _ = draft.addFile(name: "brand.txt", data: Data("x".utf8))
        #expect(draft.replyTargets(pending: [card("a", origin: "composer")]).isEmpty)
    }

    @Test func emptyWordsReplyToNothing() {
        let draft = ComposerDraft()
        #expect(draft.replyTargets(pending: [card("a", origin: "composer")]).isEmpty)
    }
}
```

- [ ] **Step 2: Run and see it fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -15`
Expected: FAIL (`replyTargets` does not exist).

- [ ] **Step 3: Implement**

`ComposerDraft.swift` — add inside the struct:

```swift
    /// A words-only message with composer suggestions waiting is a follow-up ("make it less airy"):
    /// those suggestions are replaced. Anything with files or links starts fresh.
    func replyTargets(pending: [TasteCard]) -> [String] {
        guard !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, files.isEmpty, urls.isEmpty else { return [] }
        return pending.filter { $0.origin == "composer" }.map(\.id)
    }
```

`TasteComposerView.swift` — in `readIt()` replace `let request = draft.request(replyTo: [], tile: nil)` with `let request = draft.request(replyTo: draft.replyTargets(pending: model.store.pendingCards), tile: nil)`. (Plan 3 restyles this file; this keeps the reply behaviour the deleted tray had.)

`Board/TasteHeader.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Title, the mood line (tap to edit), the suggestions pill and the Preview button.
struct TasteHeader: View {
    @Bindable var model: TasteModel
    let board: TasteBoard?

    private var moodPending: [TasteCard] { model.store.pending(in: .mood) }
    private var moodText: String {
        let words = board?.designLanguage.prefix(2).joined(separator: " · ") ?? ""
        return words.isEmpty ? String(localized: "Add mood words") : words
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: OrionSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Taste").font(.title2.weight(.bold))
                if board != nil {
                    HStack(spacing: OrionSpacing.xs) {
                        Button { model.open(.mood) } label: {
                            Text(moodText).font(.caption).foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .disabled(!model.store.canEdit)
                        ForEach(moodPending, id: \.id) { card in
                            Text(TasteCardText.headline(card)).font(.caption)
                            Button("Keep") { Task { await model.store.decide(card, .kept) } }
                                .buttonStyle(OrionButtonStyle(.primary))
                            Button("Remove") { Task { await model.store.decide(card, .rejected) } }
                                .buttonStyle(OrionButtonStyle(.secondary))
                        }
                    }
                }
            }
            Spacer(minLength: OrionSpacing.sm)
            if !model.store.pendingCards.isEmpty {
                Button {
                    Task { await model.store.keepAll() }
                } label: {
                    Text("✦ \(model.store.pendingCards.count) suggestions · Keep all")
                }
                .buttonStyle(OrionButtonStyle(.secondary))
                .contextMenu { Button("Remove all") { Task { await model.store.removeAll() } } }
                .disabled(!model.store.canEdit)
            }
            if board != nil {
                Button("▶ Preview on a screen") { model.isPreviewing = true }
                    .buttonStyle(OrionButtonStyle(.secondary))
            }
        }
    }
}
```

`Board/TastePreviewOverlay.swift`:

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Your taste on two screens: a sign-in and an invoices list, moving the way you chose.
struct TastePreviewOverlay: View {
    let board: TasteBoard
    let close: () -> Void

    private var style: TasteSampleStyle { TasteSampleStyle(board: board) }
    private var summary: String {
        [TasteMotionSpec(board.motion).title, board.density.rawValue.capitalized,
         board.shape.corners.rawValue.capitalized, board.voice.tone.title].joined(separator: " · ")
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.35).ignoresSafeArea().onTapGesture(perform: close)
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Text("Your taste on a screen").font(.title3.weight(.bold))
                Text(summary).font(.caption).foregroundStyle(.secondary)
                HStack(spacing: OrionSpacing.md) {
                    stage { signIn }
                    stage { invoices }
                }
                HStack {
                    Spacer()
                    Button("Close", action: close)
                        .buttonStyle(OrionButtonStyle(.primary))
                        .keyboardShortcut(.cancelAction)
                }
            }
            .padding(OrionSpacing.lg)
            .frame(width: 640)
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    private func stage<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .frame(maxWidth: .infinity, minHeight: 300)
            .padding(OrionSpacing.md)
            .background(Color.black.opacity(0.25), in: .rect(cornerRadius: OrionRadius.large, style: .continuous))
    }

    private var card: some ShapeStyle { Color.white }

    private var signIn: some View {
        VStack(alignment: .leading, spacing: style.rowGap) {
            Text(style.screenTitle)
                .font(.system(size: style.titleSize, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking)
            field
            field
            MotionLoopDemo(spec: TasteMotionSpec(board.motion), toastText: TasteVoiceExamples.successLine(for: board.voice.tone), buttonTitle: "Continue")
        }
        .foregroundStyle(.black)
        .padding(style.padding)
        .background(.white, in: .rect(cornerRadius: style.cornerRadius, style: .continuous))
        .shadow(color: style.depth == .shadows ? .black.opacity(0.35) : .clear, radius: 10, y: 4)
        .overlay {
            if style.depth == .hairlines {
                RoundedRectangle(cornerRadius: style.cornerRadius, style: .continuous).strokeBorder(.black.opacity(0.25), lineWidth: 1)
            }
        }
    }

    private var field: some View {
        RoundedRectangle(cornerRadius: max(style.cornerRadius - 4, 2), style: .continuous)
            .strokeBorder(.black.opacity(0.25), lineWidth: 1)
            .frame(height: 30)
    }

    private var invoices: some View {
        VStack(alignment: .leading, spacing: style.rowGap * 0.6) {
            Text("Invoices")
                .font(.system(size: style.titleSize - 4, weight: style.titleWeight.fontWeight))
                .tracking(style.tracking)
            ForEach([("Invoice #1041", "$982.00"), ("Invoice #1042", "$1,284.50"), ("Invoice #1043", "$64.10")], id: \.0) { row in
                HStack {
                    Text(row.0).font(.caption)
                    Spacer()
                    Text(row.1).font(.caption.weight(.semibold).monospacedDigit())
                }
                Divider()
            }
            Text(TasteVoiceExamples.emptyLine(for: board.voice.tone)).font(.caption2).foregroundStyle(.gray)
        }
        .foregroundStyle(.black)
        .padding(style.padding)
        .background(.white, in: .rect(cornerRadius: style.cornerRadius, style: .continuous))
        .shadow(color: style.depth == .shadows ? .black.opacity(0.35) : .clear, radius: 10, y: 4)
    }
}
```
(Remove the unused `private var card` if the compiler warns.)

`TasteScreen.swift` — keep everything below `content` (the `addDroppedFiles`, `addDroppedText`, `pasteFromClipboard` helpers) and the imports; **replace `var body`, `showsComposer` and `content`** (from `var body: some View {` to the end of `private var content: some View { ... }`) with:

```swift
    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                TasteHeader(model: model, board: model.store.board)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.top, FrameMetrics.overviewTopMargin)
                    .padding(.bottom, OrionSpacing.sm)
                if model.store.phase == .offline {
                    Label("Offline. You can look, but not change anything.", systemImage: "wifi.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, OrionSpacing.md)
                        .padding(.bottom, OrionSpacing.xs)
                }
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if model.isPreviewing, let board = model.sampleBoard ?? model.store.board {
                TastePreviewOverlay(board: board) { model.isPreviewing = false }
                    .transition(.opacity)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showsComposer {
                TasteComposerView(model: model, appModel: appModel, draft: $draft)
            }
        }
        .dropDestination(for: URL.self) { urls, _ in
            Task { await addDroppedFiles(urls) }
            return true
        }
        .dropDestination(for: String.self) { strings, _ in
            addDroppedText(strings)
            return !strings.isEmpty
        }
        .onPasteCommand(of: [.fileURL, .image, .url, .plainText]) { _ in
            pasteFromClipboard()
        }
        .task { await model.store.reload() }
        .onChange(of: appModel.isConnected) { _, connected in
            if connected { Task { await model.store.reload() } }
        }
        .onChange(of: model.store.errorMessage) { _, message in
            guard let message else { return }
            frame.errorMessage = message
            model.store.clearError()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.store.reload() }
        }
        .onExitCommand {
            if model.isPreviewing { model.isPreviewing = false } else { model.closePanel() }
        }
        .animation(.snappy(duration: 0.2), value: model.openSlot)
        .animation(.easeOut(duration: 0.15), value: model.isPreviewing)
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                Text(toast)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.vertical, OrionSpacing.sm)
                    .glassEffect(.regular, in: .capsule)
                    .padding(16)
            }
        }
        .task(id: model.toast) {
            guard model.toast != nil else { return }
            try? await Task.sleep(for: .seconds(2.5))
            model.toast = nil
        }
    }

    private var showsComposer: Bool {
        model.store.snapshot != nil && model.store.phase != .learning
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle where model.store.snapshot == nil, .loading where model.store.snapshot == nil:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.snapshot == nil:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .learning where model.store.snapshot == nil:
            TasteLearningBoard()
        case .offline where model.store.snapshot == nil:
            ContentUnavailableView("Taste isn't available right now", systemImage: "exclamationmark.triangle")
        default:
            if let board = model.sampleBoard {
                HStack(alignment: .top, spacing: 0) {
                    ScrollView {
                        TasteBoardGrid(model: model, board: board)
                            .padding(.horizontal, OrionSpacing.md)
                            .padding(.bottom, OrionSpacing.xl)
                    }
                    if let slot = model.openSlot {
                        TasteEditPanel(slot: slot, model: model)
                            .frame(width: 360)
                            .background(.regularMaterial)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
            }
        }
    }
```

Add `Board/TasteLearningBoard.swift`:

```swift
import OrionDesignSystem
import SwiftUI

/// New account: empty dashed tiles with one friendly message on top.
struct TasteLearningBoard: View {
    var body: some View {
        ZStack {
            VStack(spacing: OrionSpacing.xs) {
                HStack(spacing: OrionSpacing.xs) { tile("MOTION & FEEL"); tile("LETTERING") }
                HStack(spacing: OrionSpacing.xs) { tile("SHAPE"); tile("SPACE"); tile("VOICE") }
                HStack(spacing: OrionSpacing.xs) { tile("STEER CLEAR OF"); tile("CRAFT RULES") }
            }
            .padding(.horizontal, OrionSpacing.md)
            ContentUnavailableView(
                "Orion is still learning",
                systemImage: "sparkles",
                description: Text("Save a few more images to Inspiration and Orion will draw your style guide.")
            )
            .padding(OrionSpacing.lg)
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    private func tile(_ label: LocalizedStringKey) -> some View {
        RoundedRectangle(cornerRadius: OrionRadius.large, style: .continuous)
            .strokeBorder(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
            .overlay(alignment: .topLeading) {
                Text(label).font(.caption2.weight(.semibold)).foregroundStyle(.tertiary).padding(OrionSpacing.sm)
            }
    }
}
```

Delete `TasteChapterList.swift` and `TasteCardTray.swift` (`git rm`). If anything still references `TasteCardTray`'s helpers, move only what is needed.

- [ ] **Step 4: Build and test**

Run: `cd apps/mac && swift build 2>&1 | tail -30 && swift test 2>&1 | tail -30`
Expected: builds clean and all tests PASS (including `ComposerDraftReplyTests`). Fix compiler API mismatches while preserving behaviour.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): the style-guide board screen, preview overlay and composer follow-ups

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Verify everything

**Files:** none (verification; fix anything found in the files named).

- [ ] **Step 1: Sweep for leftovers**

Run:
```bash
grep -rnE "TasteChapters|TasteChapterList|TasteCardTray|ColourPanel|LibraryImagePicker|TasteSampleView|openTile|fromImage|Pull from an image" apps/mac/Sources apps/mac/Tests
```
Expected: no output. (Anything printed is a miss: fix it.)

- [ ] **Step 2: Run every suite**

```bash
pnpm --filter @meld/contracts test
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
supabase db reset && supabase test db
cd apps/mac && swift build && swift test
```
Expected: all green.

- [ ] **Step 3: Look at the real app**

Run `apps/mac/scripts/preview.sh` and capture the window with `screencapture -l <windowid>` (the owner's screen may be on another Space). Save to `.context/`:
1. `taste-board-default.png`: the board with six tiles, the mood line, the Preview button; the Motion tile's toast and button are moving.
2. `taste-board-motion-panel.png`: click Motion; the right panel shows four live options.
3. `taste-board-craft-panel.png`: click the craft strip; eight rules in four groups, no Done button.
4. `taste-board-suggestions.png`: with a pending suggestion (the demo/fake mode seeds composer cards) — dashed ring, Keep and Remove on the tile, the header pill.
5. `taste-board-preview.png`: Preview on a screen (sign-in and invoices).
6. `taste-board-narrow.png`: window narrower than 720 pt — two columns, craft strip last.
7. `taste-board-reduce-motion.png`: System Settings → Accessibility → Display → Reduce motion on; the Motion tile shows the end state and does not loop.

Check: no colour tile or colour wording anywhere; no Apple wording; no card tray.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: finish the Taste board

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Skip if nothing changed.)
