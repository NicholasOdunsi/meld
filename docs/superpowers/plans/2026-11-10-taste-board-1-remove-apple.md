# Taste style-guide board — Plan 1: remove the Apple idea

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete everything about "Make it feel like Apple" and the Apple rules switch: the Mac UI, the composer preset, the web API and screen-design prompt block, the contract fields, and the database column and function.

**Architecture:** Pure removal in five layers, each leaving the repo green: (1) contracts, (2) database migration, (3) web Taste service and routes, (4) web screen-design prompt, (5) Mac app. Tests are edited first so they fail for the right reason, then the code is removed. No new behaviour is added. Plan 2 (the board) and Plan 3 (the composer look) build on the cleaner code; Plan 2 also adds the craft-rules block to the screen-design prompt, in the slot this plan empties.

**Tech Stack:** TypeScript (Next.js route handlers, zod, vitest), Supabase SQL and pgTAP, Swift 6.2 / SwiftUI / Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-10-taste-style-guide-board-design.md` (Part A "Apple is removed", B8). **Depends on:** the shipped native Taste Plans 1–3.

## Global Constraints

- Everything about Apple's guidelines is removed from Taste: the **"Make it feel like Apple"** quick start (composer, panels), the **Apple rules switch** and row, the preset compose path, the `apple_rules` column and function, `appleRules` in contracts and the Mac snapshot, and the `APPLE RULES` block in screen-generation prompts.
- **Do not touch** the comments about Apple's interface guidelines in `apps/web/src/ui/orion-sidebar.tsx`, `apps/web/src/features/projects/components/project-tabs.tsx`, `apps/mac/Sources/Orion/Frame/*`, `apps/mac/Sources/OrionAppCore/Frame/TabOverflow.swift`, `apps/mac/Sources/Orion/App/AppDelegate.swift`, `apps/web/src/features/native/user-agent.test.ts`, `packages/prototype/src/screen-safety.ts` ("applet"). Those are not Taste.
- `origin = 'preset'` stays **allowed** in the contract enum and the database check (old rows may carry it). Nothing writes it any more. `TasteCardSource.kind` keeps `"preset"` for the same reason.
- Colour is **not** removed in this plan (Plan 2 hides it in the Mac app).
- The Mac app and the web code ship together: the new web snapshot has no `appleRules`, and the new Mac decoder no longer requires it. An old Mac build against new web would fail to decode.
- Migration file name: `supabase/migrations/20261110000005_remove_apple_rules.sql` (next after `20261110000004`).
- All commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Commands (run from the repo root unless noted): `pnpm --filter @meld/contracts test`, `pnpm --filter web test -- <name>`, `pnpm --filter web exec tsc --noEmit`, `supabase db reset && supabase test db`, `cd apps/mac && swift build --build-tests && swift test`.

## File Structure

| File | Change |
|---|---|
| `packages/contracts/src/taste.ts` (+`.test.ts`) | Drop `appleRules` from the snapshot, drop `ShelfAppleRulesRequestSchema` |
| `supabase/migrations/20261110000005_remove_apple_rules.sql` | Replace `capture_get_taste`, drop `capture_set_apple_rules`, drop the column |
| `supabase/tests/capture_taste.test.sql` | Assert the profile has no `apple_rules` and the function and column are gone |
| `apps/web/src/features/inspiration/shelf-taste.ts` (+test), `taste/taste-fake.ts` | Remove `setAppleRules`, `appleRules`; narrow card origin to `"composer"` |
| `apps/web/src/app/api/shelf/taste/apple-rules/*` | Delete |
| `apps/web/src/app/api/shelf/taste/route.test.ts`, `compose/route.ts` (+test) | Remove `appleRules` fixtures and the `preset` field |
| `apps/web/src/features/inspiration/taste/compose/apple-preset.ts` (+test), `run-compose.ts` (+test) | Delete the preset; `runCompose` has one path |
| `apps/web/src/features/inspiration/picking/format-apple-rules-block.ts` (+test) | Delete |
| `.../picking/compose-instruction.ts` (+test), `load-taste-board.ts` (+test) | No Apple block; `loadTasteProfile` goes away |
| `apps/web/src/features/design/design-screen-generation.ts` (+test) | No Apple block, no form-factor lookup |
| `apps/mac/Sources/Orion/Taste/*` | Remove chip, row, panel quick starts, light-type note, tray preset text |
| `apps/mac/Sources/ShelfCore/**`, `apps/mac/Tests/**` | Remove client method, store method, snapshot field, request preset |

---

### Task 1: Contracts drop the Apple fields

**Files:**
- Modify: `packages/contracts/src/taste.ts:184-198`
- Test: `packages/contracts/src/taste.test.ts:4,114,121`

**Interfaces:**
- Produces: `ShelfTasteSnapshotSchema` = `{ board, version, pending }` (no `appleRules`). `ShelfAppleRulesRequestSchema` no longer exists.

- [ ] **Step 1: Edit the tests so they describe the new shape**

In `packages/contracts/src/taste.test.ts`:
1. Remove `ShelfAppleRulesRequestSchema,` from the import list (line 4).
2. Replace the snapshot assertion at line ~114 (`ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, appleRules: true, pending: [] }).success`) with a block that proves the field is gone. Use this test (adapt the surrounding `it` if the assertion lives inside a larger one; keep the other assertions in it):

```ts
  it("has no Apple switch in the snapshot", () => {
    const parsed = ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, pending: [] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "appleRules" in parsed.data).toBe(false);
    const withOld = ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, appleRules: true, pending: [] });
    expect(withOld.success && "appleRules" in withOld.data).toBe(false);
  });
```
3. Delete the line `expect(ShelfAppleRulesRequestSchema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);` (line ~121). If its `it(...)` block becomes empty, delete the whole block.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter @meld/contracts test -- taste`
Expected: FAIL (the first new test finds `appleRules` still present in `parsed.data`).

- [ ] **Step 3: Remove the fields from the schema**

In `packages/contracts/src/taste.ts`: delete the line `  appleRules: z.boolean(),` inside `ShelfTasteSnapshotSchema` (line 187) and delete `export const ShelfAppleRulesRequestSchema = z.object({ enabled: z.boolean() }).strict();` (line 198).

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @meld/contracts test`
Expected: PASS (all). Do not run web type-checks yet; they fail until Tasks 3–4.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/taste.ts packages/contracts/src/taste.test.ts
git commit -m "refactor(contracts): drop Apple rules from the taste snapshot

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database drops the Apple switch

**Files:**
- Create: `supabase/migrations/20261110000005_remove_apple_rules.sql`
- Modify: `supabase/tests/capture_taste.test.sql:4,22-24,52-54`

**Interfaces:**
- Produces: `capture_get_taste(actor_user_id uuid, target_workspace_id uuid)` returns `{ board, version, locks }` (no `apple_rules`). `capture_set_apple_rules` and `taste_profiles.apple_rules` no longer exist.

- [ ] **Step 1: Edit the pgTAP test**

In `supabase/tests/capture_taste.test.sql`:
1. Change `select plan(19);` to `select plan(20);`.
2. Replace lines 22–24:

```sql
select is(
  (public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001'))->>'apple_rules',
  'true', 'apple_rules defaults to on');
```
with:

```sql
select ok(
  not ((public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001')) ? 'apple_rules'),
  'the profile no longer carries apple_rules');
```
3. Replace lines 52–54:

```sql
select lives_ok(
  $$ select public.capture_set_apple_rules('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001', false) $$,
  'owner can switch Apple rules off');
```
with:

```sql
select hasnt_function('public', 'capture_set_apple_rules', array['uuid','uuid','boolean'],
  'the Apple rules switch function is gone');
select hasnt_column('public', 'taste_profiles', 'apple_rules', 'the apple_rules column is gone');
```

- [ ] **Step 2: Run the database tests and see them fail**

Run: `supabase db reset && supabase test db`
Expected: FAIL in `capture_taste.test.sql` ("the profile no longer carries apple_rules", the function and column still exist).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261110000005_remove_apple_rules.sql`:

```sql
-- Remove the Apple rules switch (spec: 2026-11-10-taste-style-guide-board-design.md, B8).
-- capture_get_taste is replaced first (it reads the column), then the function and column go.
-- create or replace keeps the existing grants (service_role only).

create or replace function public.capture_get_taste(actor_user_id uuid, target_workspace_id uuid)
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
    'board', profile.board, 'version', profile.version, 'locks', profile.locks);
end;
$$;

drop function public.capture_set_apple_rules(uuid, uuid, boolean);

alter table public.taste_profiles drop column apple_rules;
```

- [ ] **Step 3b: Check nothing else reads the column**

Run: `grep -rn "apple_rules" supabase/migrations supabase/tests apps packages --include='*.sql' --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v "20261110000001\|20261110000002\|20261110000005"`
Expected: only web files that Tasks 3–4 remove (`shelf-taste*.ts`, `load-taste-board*.ts`). If anything else appears, stop and report it.

- [ ] **Step 4: Run the database tests and see them pass**

Run: `supabase db reset && supabase test db`
Expected: PASS (all files; `capture_taste.test.sql` reports 20 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261110000005_remove_apple_rules.sql supabase/tests/capture_taste.test.sql
git commit -m "feat(db): drop the Apple rules column and switch function

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Web Taste service, fake and route stop knowing about Apple

**Files:**
- Modify: `apps/web/src/features/inspiration/shelf-taste.ts` (lines 34, 38, 46, 98, 109, 127, 192-195, 230, 239, 265-269)
- Modify: `apps/web/src/features/inspiration/taste/taste-fake.ts` (lines 38, 41, 48, 129-134, 141)
- Delete: `apps/web/src/app/api/shelf/taste/apple-rules/route.ts`, `apps/web/src/app/api/shelf/taste/apple-rules/route.test.ts`
- Test: `apps/web/src/features/inspiration/shelf-taste.test.ts`, `apps/web/src/app/api/shelf/taste/route.test.ts`

**Interfaces:**
- Produces: `ShelfTaste` without `setAppleRules`; `ShelfTasteSnapshot` (from contracts) has no `appleRules`. `addCards(cards: { card: TasteComposerCard; origin: "composer" }[], replaceIds: string[])`.
- Consumes: Task 1 contract, Task 2 `capture_get_taste` shape.

- [ ] **Step 1: Edit the tests**

`apps/web/src/features/inspiration/shelf-taste.test.ts`:
1. In every `capture_get_taste: () => ({ data: { board: BOARD, version: N, apple_rules: X, locks: {} } })` mock (lines 36, 60, 76, 84, 94, 132) remove the `apple_rules: X, ` part.
2. In the first test's expected value (around line 47) delete the line `        appleRules: false,`.
3. Delete the whole `it("setAppleRules calls the function", ...)` block (lines ~114–118).

`apps/web/src/app/api/shelf/taste/route.test.ts`: delete `      appleRules: true,` (line 38) and change line 63's `{ board: {}, version: 1, appleRules: true, pending: [] }` to `{ board: {}, version: 1, pending: [] }`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter web test -- shelf-taste`
Expected: FAIL: `ProfileSchema` still requires `apple_rules`, so the mocks without it return `unavailable`.

- [ ] **Step 3: Remove Apple from the service**

In `apps/web/src/features/inspiration/shelf-taste.ts`:
- Delete the type member `setAppleRules(enabled: boolean): Promise<ShelfTasteResult<{ enabled: boolean }>>;` (line 34).
- Change the `addCards` signature's origin: `cards: { card: TasteComposerCard; origin: "composer" }[],` (line 38).
- In `ProfileSchema` delete `  apple_rules: z.boolean(),` (line 46).
- Change `loadProfile`'s return type to `Promise<ShelfTasteResult<{ board: TasteBoard; version: number } | null>>` and its returned `value` to `{ board: parsed.data.board, version: parsed.data.version }` (delete the `appleRules:` line).
- In `snapshot()` delete `        appleRules: profile.value.appleRules,` (line 127).
- Delete the real `async setAppleRules(enabled) { ... },` method (lines 192–195 including the blank line after).
- In `createFakeShelfTaste`: change the import to `const { fakeGetTasteView, fakePendingCards } = await import("./taste/taste-fake");`, delete `        appleRules: fakeAppleRules(),`, and delete the fake `async setAppleRules(enabled) { ... },` method (lines 265–269).

In `apps/web/src/features/inspiration/taste/taste-fake.ts`: delete `; appleRules: boolean` from the `FakeStore` type (line 41), delete `    appleRules: true,` from `seed()` (line 48), delete `fakeAppleRules` and `fakeSetAppleRules` (lines 129–134), narrow `origin?: "learning" | "composer" | "preset";` (line 38) to `origin?: "learning" | "composer";`, and `origin: "composer" | "preset"` in `fakeAddCards` (line 141) to `origin: "composer"`.

Delete the route directory: `git rm -r apps/web/src/app/api/shelf/taste/apple-rules`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter web test -- shelf-taste route`
Expected: PASS for `shelf-taste.test.ts` and `api/shelf/taste/route.test.ts`. (`tsc` still fails in compose files until Task 4; that is expected.)

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/features/inspiration apps/web/src/app/api/shelf/taste
git commit -m "refactor(web): remove the Apple rules switch from the Shelf taste service

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Compose has no Apple preset

**Files:**
- Delete: `apps/web/src/features/inspiration/taste/compose/apple-preset.ts`, `apple-preset.test.ts`
- Modify: `apps/web/src/features/inspiration/taste/compose/run-compose.ts`
- Modify: `apps/web/src/app/api/shelf/taste/compose/route.ts:35,84`
- Test: `.../compose/run-compose.test.ts`, `apps/web/src/app/api/shelf/taste/compose/route.test.ts`

**Interfaces:**
- Produces: `ComposeInput` = `{ words, urls, files, libraryItemIds, tile, replyTo }` (no `preset`). The compose route's form no longer accepts a `preset` field.
- Consumes: Task 3's `addCards` signature.

- [ ] **Step 1: Edit the tests**

`run-compose.test.ts`: delete `  preset: null,` from `EMPTY` (line 29); delete `        appleRules: true,` in the `get` stub (line 41); delete the whole `it("uses the Apple preset without the interpreter", ...)` block (lines 131–137). Add this test in its place (it proves the empty-input rule no longer depends on a preset):

```ts
  it("is invalid with no words, links, files or images", async () => {
    expect(await runCompose({ ...EMPTY }, deps())).toEqual({ ok: false, error: "invalid_request" });
  });
```
(If `"is unavailable without an interpreter and invalid without input"` already asserts exactly this, keep only that one and skip adding the new test.)

`compose/route.test.ts`: change line 66 to `expect(input).toMatchObject({ words: "calm", urls: ["https://example.com"], tile: "density" });` and delete `appleRules: true, ` from the `value` at line 123.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter web test -- compose`
Expected: FAIL (type errors or the removed-preset tests; `route.test.ts` still sees `preset: null` in the parsed input only if the assertion kept it; at minimum `run-compose.test.ts` fails to type-check against `ComposeInput`). If vitest does not type-check, run `pnpm --filter web exec tsc --noEmit` and expect errors in the compose files.

- [ ] **Step 3: Remove the preset**

Delete both preset files: `git rm apps/web/src/features/inspiration/taste/compose/apple-preset.ts apps/web/src/features/inspiration/taste/compose/apple-preset.test.ts`.

In `apps/web/src/app/api/shelf/taste/compose/route.ts` delete `  preset: z.literal("apple").nullable(),` (line 35) and `    preset: field(form, "preset") ?? null,` (line 84).

In `run-compose.ts`: remove `import { appleTasteCards } from "./apple-preset";` (line 5), remove `  preset: "apple" | null;` from `ComposeInput` (line 17), and replace the whole `runCompose` function (from `export async function runCompose` to the end of the file) with this version (same behaviour as the old non-preset branch, un-nested):

```ts
export async function runCompose(input: ComposeInput, deps: ComposeDeps): Promise<ComposeResult> {
  const { words, urls, files, libraryItemIds } = input;
  if (
    words.length > COMPOSE_LIMITS.words ||
    urls.length > COMPOSE_LIMITS.urls ||
    files.length > COMPOSE_LIMITS.files ||
    libraryItemIds.length > COMPOSE_LIMITS.library
  ) {
    return { ok: false, error: "invalid_request" };
  }
  if (!words.trim() && urls.length === 0 && files.length === 0 && libraryItemIds.length === 0) {
    return { ok: false, error: "invalid_request" };
  }

  const snapshot = await deps.taste.get();
  if (!snapshot.ok) return { ok: false, error: mapTasteError(snapshot.error) };
  if (!snapshot.value) return { ok: false, error: "not_found" };
  const { board } = snapshot.value;
  const rejected = await deps.taste.rejectedKeys();
  const rejectedKeys = rejected.ok ? rejected.value : [];

  if (!deps.interpreter) return { ok: false, error: "unavailable" };
  const skipped: { name: string; reason: string }[] = [];
  const sources: InterpreterSource[] = [];
  for (const url of urls) {
    const link = await deps.fetchLink(url);
    if (link.ok) sources.push({ kind: "link", name: link.name, text: link.text });
    else skipped.push({ name: link.name, reason: link.reason === "blocked" ? SKIP_TEXT.blocked : SKIP_TEXT.link });
  }
  for (const file of files) {
    if (attachmentKind(file.name, file.mimeType) === "image") {
      try {
        const labels = await deps.labelImage(file.bytes, file.mimeType as "image/png" | "image/jpeg" | "image/webp");
        sources.push({ kind: "image", name: file.name, text: labelsText(labels) });
      } catch {
        skipped.push({ name: file.name, reason: SKIP_TEXT.image });
      }
      continue;
    }
    const read = await deps.extract(file);
    if (read.ok) sources.push({ kind: "file", name: read.name, text: read.text });
    else skipped.push({ name: file.name, reason: SKIP_TEXT.file });
  }
  if (libraryItemIds.length > 0) {
    for (const item of await deps.libraryLabels(libraryItemIds)) {
      sources.push({ kind: "image", name: item.name, text: labelsText(item.labels) });
    }
  }
  if (sources.length === 0 && !words.trim()) return { ok: false, error: "unreadable" };

  const replyTo = new Set(input.replyTo);
  let cards: TasteComposerCard[];
  try {
    cards = await deps.interpreter.interpret({
      words,
      sources,
      board,
      rejectedKeys,
      tile: input.tile,
      pending: snapshot.value.pending
        .filter((p) => replyTo.has(p.id))
        .map(({ tile, op, value, reason }) => ({ tile, op, value, reason })),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  cards = filterComposerCards(cards, board, rejectedKeys);
  if (input.tile) cards = cards.filter((card) => card.tile === input.tile);

  if (cards.length === 0) return { ok: true, cards: [], skipped };
  const stored = await deps.taste.addCards(
    cards.map((card) => ({ card, origin: "composer" as const })),
    input.replyTo,
  );
  if (!stored.ok) return { ok: false, error: "unavailable" };
  const after = await deps.taste.get();
  const ids = new Set(stored.value.ids);
  const fresh = after.ok && after.value ? after.value.pending.filter((p) => ids.has(p.id)) : [];
  return { ok: true, cards: fresh, skipped };
}
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter web test -- compose && pnpm --filter web exec tsc --noEmit`
Expected: tests PASS. `tsc` may still report errors only in the screen-design files (fixed in Task 5). Any error mentioning `compose`, `shelf-taste`, `taste-fake` or `preset` is a miss: fix it now.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/features/inspiration/taste/compose apps/web/src/app/api/shelf/taste/compose
git commit -m "refactor(web): remove the Apple preset from compose

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Screen design no longer adds Apple rules

**Files:**
- Delete: `apps/web/src/features/inspiration/picking/format-apple-rules-block.ts`, `format-apple-rules-block.test.ts`
- Modify: `.../picking/compose-instruction.ts`, `.../picking/load-taste-board.ts`, `apps/web/src/features/design/design-screen-generation.ts`
- Test: `.../picking/compose-instruction.test.ts`, `.../picking/load-taste-board.test.ts`, `apps/web/src/features/design/design-screen-generation.test.ts`

**Interfaces:**
- Produces: `composeInstruction({ base, tasteBlock, inspiration, maxChars? }): string` (no `appleBlock`). `loadTasteBoard(supabase, roomId): Promise<TasteBoard | null>` (unchanged signature). `loadTasteProfile` and `LoadedTaste` no longer exist. Plan 2 will add a `craftBlock` parameter in the slot after `tasteBlock`.

- [ ] **Step 1: Edit the tests**

`compose-instruction.test.ts`: delete the three Apple tests (`"puts the Apple block after taste and before inspiration"`, `"drops inspiration, then the Apple block, then taste, never the base"`, `"behaves as before when no Apple block is passed"`, lines 45–71). The first four tests already cover order, trimming and the clash header.

`load-taste-board.test.ts`: change line 2 to `import { loadTasteBoard } from "./load-taste-board";` and delete the whole `describe("loadTasteProfile", ...)` block (lines 43–56).

`design-screen-generation.test.ts`:
1. Replace the hoisted mock (lines 3–12) with:

```ts
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  loadTasteBoard: vi.fn(async (): Promise<typeof BOARD | null> => null),
  loadInspirationPicks: vi.fn(async (): Promise<typeof PICK[]> => []),
}));
```
2. Replace the `vi.mock("@/features/inspiration/picking/load-taste-board", ...)` block (lines 15–20) with:

```ts
vi.mock("@/features/inspiration/picking/load-taste-board", () => ({
  loadTasteBoard: mocks.loadTasteBoard,
}));
```
3. In the test `"puts the owner's taste ahead of the inspiration..."` change `mocks.loadTasteProfile.mockResolvedValue({ board: BOARD, appleRules: true });` to `mocks.loadTasteBoard.mockResolvedValue(BOARD);`.
4. Delete the two tests `"embeds APPLE RULES in the task instruction for an iPhone target when the switch is on"` and `"omits APPLE RULES when the apple switch is off"` (lines 469–513) and add this one in their place:

```ts
  it("never adds Apple rules, even for an iPhone target", async () => {
    mocks.loadTasteBoard.mockResolvedValue(BOARD);
    const rpc = vi.fn(async (name: string, _args?: unknown) => {
      if (name === "create_design_screen_generate_task") return { data: { id: taskId }, error: null };
      if (name === "set_design_generation_user_prompt") return { data: null, error: null };
      throw new Error(`unexpected rpc ${name}`);
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await generateDesignScreen({ roomId, screenId, instruction: "an iPhone login screen" });

    const instruction = (
      rpc.mock.calls.find(([name]) => name === "create_design_screen_generate_task")?.[1] as
        | { target_instruction: string }
        | undefined
    )?.target_instruction as string;
    expect(instruction).not.toContain("APPLE RULES");
    expect(instruction).toContain("YOUR TASTE");
  });
```
5. `grep -n "loadTasteProfile" apps/web/src/features/design/design-screen-generation.test.ts` must return nothing after your edits; replace any remaining `mocks.loadTasteProfile.mockResolvedValue(...)` with `mocks.loadTasteBoard.mockResolvedValue(<board or null>)`.

- [ ] **Step 2: Run the tests and see them fail**

Run: `pnpm --filter web test -- design-screen-generation compose-instruction load-taste-board`
Expected: FAIL (the code still imports `loadTasteProfile` and still adds the Apple block).

- [ ] **Step 3: Remove Apple from the prompt code**

Delete: `git rm apps/web/src/features/inspiration/picking/format-apple-rules-block.ts apps/web/src/features/inspiration/picking/format-apple-rules-block.test.ts`.

Replace `compose-instruction.ts` with:

```ts
import { formatInspirationBlock } from "./format-inspiration-block";
import type { PickedInspiration } from "./pick-inspiration";

const TASK_INSTRUCTION_MAX_CHARS = 4000;

/**
 * base → taste → inspiration, within the task limit. The owner's words are
 * never trimmed; inspiration lines go first, then (if still too long) the
 * taste block.
 */
export function composeInstruction({
  base,
  tasteBlock,
  inspiration,
  maxChars = TASK_INSTRUCTION_MAX_CHARS,
}: {
  base: string;
  tasteBlock: string;
  inspiration: PickedInspiration[];
  maxChars?: number;
}): string {
  const join = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const hasTaste = tasteBlock.length > 0;
  for (let count = inspiration.length; count >= 0; count -= 1) {
    const block = count > 0 ? formatInspirationBlock(inspiration.slice(0, count), { hasTaste }) : "";
    const combined = join(base, tasteBlock, block);
    if (combined.length <= maxChars) return combined;
  }
  return base;
}
```

Replace `load-taste-board.ts` with:

```ts
import "server-only";

import { TasteBoardSchema, type TasteBoard } from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const RoomSchema = z.object({ workspace_id: z.string().uuid() });

// Best-effort, session-scoped: RLS returns only the caller's own profile.
export async function loadTasteBoard(supabase: SupabaseClient, roomId: string): Promise<TasteBoard | null> {
  try {
    const room = await supabase.from("rooms").select("workspace_id").eq("id", roomId).maybeSingle();
    const parsedRoom = RoomSchema.safeParse(room.data);
    if (room.error || !parsedRoom.success) return null;
    const profile = await supabase
      .from("taste_profiles")
      .select("board")
      .eq("workspace_id", parsedRoom.data.workspace_id)
      .maybeSingle();
    if (profile.error || !profile.data) return null;
    const board = TasteBoardSchema.safeParse((profile.data as { board: unknown }).board);
    return board.success ? board.data : null;
  } catch {
    return null;
  }
}
```

In `design-screen-generation.ts`:
- Remove the imports of `formatAppleRulesBlock, isAppleTarget` (line 14) and `inferTarget` (line 16); change line 17 to `import { loadTasteBoard } from "@/features/inspiration/picking/load-taste-board";`.
- Delete `FormFactorSchema`, `ScreensFormFactorSchema` and the whole `loadRoomFormFactors` function with its two-line comment (lines 43–61).
- Replace the block from `// Best-effort: both loaders return empty ...` through the `composeInstruction({...})` call (lines 89–116) with:

```ts
    // Best-effort: both loaders return empty on any problem. composeInstruction
    // keeps the owner's words whole and drops inspiration before taste.
    const [board, picks] = await Promise.all([
      loadTasteBoard(supabase, parsed.data.roomId),
      loadInspirationPicks(supabase, {
        roomId: parsed.data.roomId,
        instruction: parsed.data.instruction,
        screenName: parsed.data.name ?? null,
      }),
    ]);
    const taskInstruction = composeInstruction({
      base: instruction,
      tasteBlock: formatTasteBlock(board),
      inspiration: picks,
    });
```

- [ ] **Step 4: Run the tests and the type check and see them pass**

Run: `pnpm --filter web test -- design-screen-generation compose-instruction load-taste-board && pnpm --filter web exec tsc --noEmit`
Expected: tests PASS, `tsc` clean (no output).

- [ ] **Step 5: Run the whole web suite and lint**

Run: `pnpm --filter web test && pnpm --filter web lint`
Expected: all PASS, 0 lint errors (warnings that already existed are fine).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/features/inspiration/picking apps/web/src/features/design
git commit -m "refactor(web): stop adding Apple rules to screen-design prompts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mac UI stops showing Apple

**Files:**
- Delete: `apps/mac/Sources/Orion/Taste/AppleRulesRow.swift`
- Modify: `apps/mac/Sources/Orion/Taste/TasteComposerView.swift:31-45,96-104`, `TasteChapterList.swift:15`, `TasteCardTray.swift:5,14,116-122`, `TasteModel.swift:31-35`, `TastePanelRequests.swift:11`
- Modify: `apps/mac/Sources/Orion/Taste/Panels/TypographyPanel.swift`, `DensityPanel.swift`, `SpacingPanel.swift`, `ColourPanel.swift`
- Test: `apps/mac/Tests/OrionTests/TastePanelComposeTests.swift:18-24`

**Interfaces:**
- Produces: `TastePanelRequests` has `words(_:tile:)` and `fromImage(_:)` only. `TasteModel` has no `composeAppleQuickStart`. (ShelfCore's Apple API still exists until Task 7.)

- [ ] **Step 1: Edit the test**

In `TastePanelComposeTests.swift` replace the test `appleAndImageRequests` (lines 18–24) with:

```swift
    @Test func imageRequestTargetsColourFromTheLibraryImage() {
        let id = UUID()
        let image = TastePanelRequests.fromImage(id)
        #expect(image.tile == .colors)
        #expect(image.libraryItemIDs == [id])
    }
```

- [ ] **Step 2: Remove `apple()` and see the build fail where it is still used**

In `TastePanelRequests.swift` delete the line `    static func apple() -> TasteComposeRequest { TasteComposeRequest(preset: .apple) }` (and the blank line after it).
Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20`
Expected: FAIL with "type 'TastePanelRequests' has no member 'apple'" in `TasteModel.swift`, `TasteComposerView.swift`.

- [ ] **Step 3: Remove every Apple use in the UI**

- `TasteModel.swift`: delete the doc comment and `composeAppleQuickStart()` method (lines 31–35) so the type ends after `closePanel()`.
- `TasteComposerView.swift`:
  - In the disabled branch (lines 31–45), replace the `HStack` with a plain text line (the preset was the only reason for the button):

```swift
            } else {
                Text("Add a DeepSeek key to let Orion read things. You can still edit everything by hand.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.vertical, OrionSpacing.sm)
            }
```
  - In `enabledBody`, delete the button block (lines 100–104) `Button("Make it feel like Apple") { ... } .buttonStyle(OrionButtonStyle(.quiet)) .disabled(!model.store.canEdit || isReading)` (keep the `Spacer(minLength:)` before it and the send button after it).
- `TasteChapterList.swift`: delete line 15 `                AppleRulesRow(model: model)`.
- `git rm apps/mac/Sources/Orion/Taste/AppleRulesRow.swift`.
- `TasteCardTray.swift`: line 5 doc comment → `/// Shared tray for learning and composer cards — Keep / Remove / reply.`; line 14 → `cards.contains { $0.origin == "composer" }`; in `sourceLine` replace the `guard let source = card.source else { if card.origin == "preset" { return "Apple Human Interface Guidelines" }; return nil }` with `guard let source = card.source else { return nil }`.
- `Panels/TypographyPanel.swift`: delete the `if model.store.snapshot?.appleRules == true, typography.weight == .light { Text("Apple rules use Regular ...") ... }` block (lines 30–34) and delete the "Quick starts" `Text` plus `TasteDashedChips(items: ["Make it feel like Apple"]) {...}.disabled(...)` (lines 67–73).
- `Panels/DensityPanel.swift` (lines 40–46) and `Panels/SpacingPanel.swift` (lines 26–32): delete the same "Quick starts" `Text(...)` + `TasteDashedChips(...)` + `.disabled(...)` seven lines.
- `Panels/ColourPanel.swift`: delete only the Apple button block (lines 51–56: `Button("Make it feel like Apple") { ... } .buttonStyle(.plain) .modifier(TasteDashedChipStyle()) .disabled(!model.store.canEdit)` plus the blank line after); the other colour quick starts stay (Plan 2 removes the whole panel).

- [ ] **Step 4: Build and run the Orion tests**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20`
Expected: build succeeds (warnings about now-unused `TasteDashedChips` are fine; leave the type, Plan 2 removes it with the panels).
Run: `cd apps/mac && swift test --filter OrionTests 2>&1 | tail -20`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac/Sources/Orion apps/mac/Tests/OrionTests
git commit -m "refactor(mac): remove the Apple quick start, rules row and notes from Taste

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Mac networking and models drop Apple

**Files:**
- Modify: `apps/mac/Sources/ShelfCore/Taste/TasteSnapshot.swift:31-45,64-78,115-118`, `TasteStore.swift:4,90-104`, `Network/OrionClient.swift:16`, `Network/URLSessionOrionClient.swift:85-87,100,127`
- Test: `apps/mac/Tests/ShelfCoreTests/TasteModelsTests.swift`, `TasteStoreTests.swift`, `TasteClientTests.swift`, `TasteComposeTests.swift`, `UploaderTests.swift`; `apps/mac/Tests/ShelfTestSupport/FakeOrionClient.swift`, `TasteFixtures.swift`

**Interfaces:**
- Produces: `TasteSnapshot(board:version:pending:composerEnabled:)` (no `appleRules`); `TasteComposeRequest(words:urls:files:libraryItemIDs:tile:replyTo:)` (no `preset`); `OrionClient` without `setAppleRules`; `TasteStore` without `setAppleRules`; `TasteAppleRules` removed.

- [ ] **Step 1: Edit the tests and fixtures**

- `TasteModelsTests.swift`: in the JSON delete `"appleRules":true,` and delete `#expect(snapshot.appleRules)`. (A snapshot without the key must decode.)
- `TasteFixtures.swift` line 15: `TasteSnapshot(board: board, version: version, pending: pending)`.
- `TasteComposeTests.swift`: delete line 31 `#expect(!TasteComposeRequest(preset: .apple).isEmpty)`.
- `TasteStoreTests.swift`: delete the whole `@Test func appleRulesToggleRoundTrips()` (lines 113–121).
- `TasteClientTests.swift`: rename the test to `decideUsesItsRoute`, delete the `if request.url?.path() == "/api/shelf/taste/apple-rules" ...` line and the final `setAppleRules` expectation.
- `UploaderTests.swift`: delete the `setAppleRules` stub (lines 149–151 plus its blank line).
- `FakeOrionClient.swift`: delete `appleResult` (line 25), `appleSettings` (line 30), `setAppleResult` (line 53) and the `setAppleRules` method (lines 109–112 plus blank line).

- [ ] **Step 2: Build the tests and see them fail**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20`
Expected: FAIL (`TasteSnapshot` has no `init(board:version:pending:)`; `FakeOrionClient` no longer satisfies `OrionClient`).

- [ ] **Step 3: Remove the Apple API from ShelfCore**

- `TasteSnapshot.swift`: delete `public var appleRules: Bool` (line 31); change the init to `public init(board: TasteBoard, version: Int, pending: [TasteCard], composerEnabled: Bool = true) { self.board = board; self.version = version; self.pending = pending; self.composerEnabled = composerEnabled }`; delete `appleRules = try c.decode(Bool.self, forKey: .appleRules)` (line 43); in `TasteComposeRequest` delete `public var preset: Preset?`, `public enum Preset ...`, the `preset: Preset? = nil,` init parameter and `self.preset = preset`, and the `&& preset == nil` in `isEmpty`; delete the `TasteAppleRules` struct (lines 115–118).
- `TasteStore.swift`: change the line-4 doc comment to `/// The Taste board and the pending cards. Edits show at once ...` (keep the rest of that sentence as it is), and delete the whole `setAppleRules` method (lines 90–104, including its `@discardableResult`).
- `OrionClient.swift`: delete line 16 (`func setAppleRules ...`).
- `URLSessionOrionClient.swift`: delete the `setAppleRules` method (lines 85–87 plus blank line), the line `if let preset = request.preset { form.addField(name: "preset", value: preset.rawValue) }` (line 100) and `private struct AppleBody: Encodable { let enabled: Bool }` (line 127).

- [ ] **Step 4: Build and run all Mac tests**

Run: `cd apps/mac && swift build --build-tests 2>&1 | tail -20 && swift test 2>&1 | tail -30`
Expected: build succeeds; all tests PASS (the decode-without-`appleRules` test now passes).

- [ ] **Step 5: Commit**

```bash
git add -A apps/mac/Sources/ShelfCore apps/mac/Tests
git commit -m "refactor(mac): remove the Apple rules API, snapshot field and compose preset

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sweep and verify

**Files:** none (verification only; fix anything found in the files it names).

- [ ] **Step 1: Sweep for leftovers**

Run:
```bash
grep -rniE "apple.?rules|appleRules|apple_rules|setAppleRules|AppleRulesRow|apple-preset|appleTasteCards|formatAppleRulesBlock|isAppleTarget|Make it feel like Apple|composeAppleQuickStart|APPLE RULES" apps packages supabase docs/superpowers/specs/2026-11-10-taste-style-guide-board-design.md --include='*.ts' --include='*.tsx' --include='*.swift' --include='*.sql' 2>/dev/null | grep -v node_modules | grep -v "/.build/" | grep -v "20261110000001\|20261110000002\|20261110000005"
```
Expected: no output. (The two older migrations keep their history; `20261110000005` mentions the names in comments and drops.) Anything else printed is a miss: fix it, then re-run.

- [ ] **Step 2: Run every suite**

Run:
```bash
pnpm --filter @meld/contracts test
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
supabase db reset && supabase test db
cd apps/mac && swift build && swift test
```
Expected: all green. Record the counts in the commit message of the next step if you fix anything.

- [ ] **Step 3: Look at the real app**

Run `apps/mac/scripts/preview.sh` and capture the window with `screencapture -l <windowid>` (the owner's screen may be on another Space). Check: the Taste screen has no "Apple design rules" block, the composer has no "Make it feel like Apple" button, and the Density, Spacing, Typography and Colour panels have no Apple chip. Save the screenshot under `.context/taste-board-plan1-no-apple.png`.

- [ ] **Step 4: Commit any fixes**

If Step 1 or 2 needed fixes:
```bash
git add -A
git commit -m "chore: finish removing the Apple idea

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Otherwise nothing to commit.
