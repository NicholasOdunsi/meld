# Native Inspiration Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web Inspiration page inside the Orion Mac app with a native SwiftUI screen: a masonry wall with a side panel that opens on click, multi-select, add to chat, delete, drag in and out, and an offline cache. The data comes through new Shelf-token endpoints.

**Architecture:** The server gains four `/api/shelf/library…` routes. Each is backed by a new security-definer `capture_*` RPC that re-checks the token's user and workspace. The session RPCs are refactored onto shared `*_for(actor…)` helpers. The Mac app gains a tested data layer in `ShelfCore/Library` (client methods, `LibraryStore`, disk caches) and a pure masonry layout in `OrionAppCore`. The new SwiftUI screen in `Sources/Orion/Inspiration` shows in place of the web view when the sidebar destination is `.inspiration`, the same way the native Overview works today. In demo (fake) mode the Shelf routes run against `inspiration-fake.ts`, so `apps/mac/scripts/preview.sh` exercises the whole flow.

**Tech Stack:** Next.js route handlers + zod (`@meld/contracts`), Supabase Postgres (plpgsql RPCs, pgTAP), Swift 6 / SwiftUI on macOS 26 (SPM package `apps/mac`), Swift Testing, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-native-inspiration-design.md` (read Part A first).

## Global Constraints

- macOS deployment target `.macOS(.v26)`, Swift language mode 6, swift-tools 6.2 (from `apps/mac/Package.swift`). Do not change them.
- All Swift UI work follows `.claude/skills/swiftui-pro` (read `SKILL.md` before Tasks 10–12). Use `foregroundStyle`, `clipShape(.rect(cornerRadius:))`, `Button("Label", systemImage:)` and other modern APIs. One type per file.
- Colours and spacing come from `OrionDesignSystem`: Orion blue `OrionColor.dayBreakBlue.color` for actions, Orion red `OrionColor.loudRed.color` for destructive actions, `OrionSpacing.*` for spacing. No raw hex in Swift.
- Every modal is an in-window `OrionDialog` (`apps/mac/Sources/Orion/Frame/OrionDialog.swift`). Never `.sheet`, `.alert` or `.confirmationDialog`. A destructive action uses `isDestructive: true` (red, no Return shortcut).
- Notes are max **500** characters (`INSPIRATION_LIMITS.noteMax`; the database `check` enforces the same).
- Bulk actions take 1–100 ids (`INSPIRATION_LIMITS.bulkMax`).
- Library page size is **100** (`INSPIRATION_LIMITS.shelfLibraryPageSize`, added in Task 1).
- Tile width steps (pt): **140, 180, 230, 290, 360**. The default is step index 2. The UserDefaults key is `inspirationTileStep`.
- The side panel is **300 pt** wide.
- Signed image URLs live 1 h (`SIGNED_URL_TTL_SECONDS`, already in `inspiration-shared.ts`).
- User-visible copy, verbatim:
  - Empty state: `Drag images here, paste with ⌘V, or use the Shelf in your menu bar.`
  - Offline banner: `Offline — showing your last saved view.`
  - Label pending: `Orion is still looking at this…`
  - Connecting: `Connecting…`
  - Reconnect button: `Reconnect Inspiration`
  - Non-image drop: `Only images can be saved to Inspiration.`
  - Delete dialog title: `Delete N images?` (`Delete this image?` when N = 1)
  - Delete dialog message: `They'll be removed from Inspiration and from any chats using them. This can't be undone.`
  - Add dialog title: `Add to Chat`
  - Add confirmation: `Added N images to <Chat> · <Project>`
- Node 22.23.2 for web tests: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`.
- The Supabase CLI must be the pinned 2.109.1: `export PATH="$HOME/.local/share/supabase:$PATH"`, then check `which supabase`. Never run `supabase db reset` on the shared dev DB. Apply migrations with `supabase migration up --local`.
- Commit after every task with a message ending in:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Map

**Web / DB**
- Modify `packages/contracts/src/inspiration.ts`: library item, page and request schemas; the page-size limit.
- Modify `packages/contracts/src/inspiration.test.ts`: schema tests.
- Create `supabase/migrations/20261109000004_capture_library.sql`: shared helpers plus four `capture_*` RPCs.
- Create `supabase/tests/inspiration_capture_library.test.sql`: pgTAP tests.
- Create `apps/web/src/features/inspiration/shelf-library.ts` (+ `.test.ts`): list, note, delete and add for a Shelf principal (real + fake).
- Modify `apps/web/src/features/inspiration/inspiration-fake.ts` (+ test): fake token, labels, real dimensions.
- Modify `apps/web/src/features/inspiration/shelf-auth.ts` (+ test): resolve the fake token in fake mode.
- Modify `apps/web/src/app/api/shelf/connect/route.ts`, `apps/web/src/app/api/shelf/items/route.ts` (+ tests): fake-mode branches.
- Create `apps/web/src/app/api/shelf/library/route.ts`, `library/[id]/route.ts`, `library/delete/route.ts`, `library/add-to-room/route.ts` (+ `route.test.ts` next to each).
- Create `apps/web/src/app/api/shelf/library/request-json.ts` (+ test): the shared JSON body reader.

**Mac**
- Modify `apps/mac/Sources/OrionAppCore/AppConfig.swift` (+ test): `origin(of:)`.
- Modify `apps/mac/Sources/Orion/App/AppDependencies.swift`, `AppModel.swift`, `AppDelegate.swift`: preview outbox, library hooks.
- Create `apps/mac/Sources/ShelfCore/Library/LibraryItem.swift`, `LibraryPage.swift`, `LibraryDates.swift`.
- Modify `apps/mac/Sources/ShelfCore/Network/OrionClient.swift`, `URLSessionOrionClient.swift`, `ShelfAPIError.swift`.
- Modify `apps/mac/Tests/ShelfTestSupport/FakeOrionClient.swift`.
- Create `apps/mac/Sources/OrionAppCore/Inspiration/MasonryLayout.swift`, `TileStep.swift`, `WallNavigation.swift`.
- Create `apps/mac/Sources/ShelfCore/Library/LibraryCache.swift`, `ThumbnailCache.swift`, `LibraryStore.swift`.
- Create `apps/mac/Sources/Orion/Inspiration/` (`InspirationScreen.swift`, `InspirationWall.swift`, `InspirationTile.swift`, `PendingTile.swift`, `InspirationHeader.swift`, `InspirationStateView.swift`, `InspirationPanel.swift`, `SelectionBar.swift`, `AddToChatDialog.swift`, `DeleteImagesDialog.swift`, `InspirationDragFile.swift`, `InspirationModel.swift`).
- Modify `apps/mac/Sources/Orion/Window/OrionRootView.swift`: show the native screen for `.inspiration`.
- Tests: `apps/mac/Tests/ShelfCoreTests/LibraryClientTests.swift`, `LibraryCacheTests.swift`, `ThumbnailCacheTests.swift`, `LibraryStoreTests.swift`; `apps/mac/Tests/OrionAppCoreTests/MasonryLayoutTests.swift`, `TileStepTests.swift`, `WallNavigationTests.swift`, `AppConfigTests.swift`; `apps/mac/Tests/OrionTests/InspirationModelTests.swift`.

---

### Task 0: Commit the Orion dialog work this plan builds on

The working tree on `NicholasOdunsi/native-inspiration` already contains the uncommitted New/Edit/Delete Project dialog work. That work adds `OrionDialog`, `orionDialogField()` and `LogoWell`, which later tasks use.

**Files:** everything `git status` lists under `apps/mac/`. Nothing else.

- [ ] **Step 1: Verify it builds and passes**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: three `Test run with … passed` lines and no `✘`.

- [ ] **Step 2: Commit**

```bash
git add apps/mac
git commit -m "feat(mac): Orion dialogs for New, Edit and Delete Project, with optional company logo

New Project takes an optional logo and picks the colour itself; right-click
offers Edit Project… (logo + name) and Delete…. All three are in-window
OrionDialog panels in Orion blue/red instead of system sheets and alerts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Contracts for the library endpoints

**Files:**
- Modify: `packages/contracts/src/inspiration.ts`
- Test: `packages/contracts/src/inspiration.test.ts`

**Interfaces:**
- Produces (TS, exported from `@meld/contracts`): `INSPIRATION_LIMITS.shelfLibraryPageSize = 100`, `ShelfLabelStateSchema` / `ShelfLabelState` (`"pending" | "done" | "skipped"`), `ShelfLibraryItemSchema` / `ShelfLibraryItem`, `ShelfLibraryPageSchema` / `ShelfLibraryPage`, `ShelfNoteRequestSchema`, `ShelfItemIdsRequestSchema`, `ShelfAddToRoomRequestSchema`, `ShelfCountResponseSchema` / `ShelfCountResponse`.
- JSON shape of one item (used by Swift in Task 6):
  `{ id, width, height, mimeType, note|null, sourceUrl|null, createdAt (ISO 8601 with ms, "…Z"), description|null, labelState, rooms: [{ roomId, roomName, projectName }], imageUrl|null }`.

- [ ] **Step 1: Write the failing tests** (append to `packages/contracts/src/inspiration.test.ts`)

```ts
import {
  INSPIRATION_LIMITS,
  ShelfAddToRoomRequestSchema,
  ShelfItemIdsRequestSchema,
  ShelfLibraryItemSchema,
  ShelfLibraryPageSchema,
  ShelfNoteRequestSchema,
} from "./inspiration";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  width: 1200,
  height: 900,
  mimeType: "image/png",
  note: "soft shadows",
  sourceUrl: "https://dribbble.com/shots/1",
  createdAt: "2026-11-09T14:02:00.000Z",
  description: "Pricing page with three glass cards.",
  labelState: "done",
  rooms: [{ roomId: "22222222-2222-4222-8222-222222222222", roomName: "Main", projectName: "Voxecore" }],
  imageUrl: "https://example.supabase.co/storage/v1/object/sign/inspiration/a.png?token=t",
};

describe("shelf library contracts", () => {
  it("accepts a full library item and a page", () => {
    expect(ShelfLibraryItemSchema.parse(ITEM)).toEqual(ITEM);
    expect(ShelfLibraryPageSchema.parse({ items: [ITEM], nextOffset: 100 }).nextOffset).toBe(100);
    expect(ShelfLibraryPageSchema.parse({ items: [], nextOffset: null }).items).toEqual([]);
  });

  it("rejects an unknown label state and extra keys", () => {
    expect(ShelfLibraryItemSchema.safeParse({ ...ITEM, labelState: "sorted" }).success).toBe(false);
    expect(ShelfLibraryItemSchema.safeParse({ ...ITEM, storagePath: "x" }).success).toBe(false);
  });

  it("limits notes to 500 characters and allows null", () => {
    expect(ShelfNoteRequestSchema.safeParse({ note: "a".repeat(500) }).success).toBe(true);
    expect(ShelfNoteRequestSchema.safeParse({ note: "a".repeat(501) }).success).toBe(false);
    expect(ShelfNoteRequestSchema.safeParse({ note: null }).success).toBe(true);
  });

  it("takes 1 to 100 item ids", () => {
    const id = ITEM.id;
    expect(ShelfItemIdsRequestSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(ShelfItemIdsRequestSchema.safeParse({ ids: Array(101).fill(id) }).success).toBe(false);
    expect(ShelfAddToRoomRequestSchema.safeParse({ ids: [id], roomId: ITEM.rooms[0].roomId }).success).toBe(true);
    expect(ShelfAddToRoomRequestSchema.safeParse({ ids: [id], roomId: "nope" }).success).toBe(false);
  });

  it("pages 100 items at a time", () => {
    expect(INSPIRATION_LIMITS.shelfLibraryPageSize).toBe(100);
  });
});
```

(If the file already imports `describe`/`expect`/`it` from vitest, keep one import. Merge the new names into the existing `./inspiration` import.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @meld/contracts exec vitest run src/inspiration.test.ts`
Expected: FAIL (`ShelfLibraryItemSchema` is not exported).

- [ ] **Step 3: Implement** in `packages/contracts/src/inspiration.ts`

Add `shelfLibraryPageSize: 100,` to `INSPIRATION_LIMITS`, after `pageSize: 60,`. Then append after `ShelfUploadResponseSchema`:

```ts
// Native Inspiration screen (spec 2026-11-09-native-inspiration-design.md).
export const ShelfLabelStateSchema = z.enum(["pending", "done", "skipped"]);
export type ShelfLabelState = z.infer<typeof ShelfLabelStateSchema>;

export const ShelfLibraryItemSchema = z
  .object({
    id: z.string().uuid(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: InspirationMimeTypeSchema,
    note: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    createdAt: z.string(),
    description: z.string().nullable(),
    labelState: ShelfLabelStateSchema,
    rooms: z.array(ShelfRoomSchema),
    imageUrl: z.string().nullable(),
  })
  .strict();
export type ShelfLibraryItem = z.infer<typeof ShelfLibraryItemSchema>;

export const ShelfLibraryPageSchema = z
  .object({ items: z.array(ShelfLibraryItemSchema), nextOffset: z.number().int().min(0).nullable() })
  .strict();
export type ShelfLibraryPage = z.infer<typeof ShelfLibraryPageSchema>;

export const ShelfNoteRequestSchema = z
  .object({ note: z.string().max(INSPIRATION_LIMITS.noteMax).nullable() })
  .strict();

const ShelfItemIds = z.array(z.string().uuid()).min(1).max(INSPIRATION_LIMITS.bulkMax);
export const ShelfItemIdsRequestSchema = z.object({ ids: ShelfItemIds }).strict();
export const ShelfAddToRoomRequestSchema = z.object({ ids: ShelfItemIds, roomId: z.string().uuid() }).strict();

export const ShelfCountResponseSchema = z.object({ count: z.number().int().min(0) }).strict();
export type ShelfCountResponse = z.infer<typeof ShelfCountResponseSchema>;
```

Also, if `packages/contracts/src/index.ts` re-exports names one by one (instead of `export * from "./inspiration"`), add the new names there.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @meld/contracts exec vitest run src/inspiration.test.ts && pnpm --filter @meld/contracts exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/inspiration.ts packages/contracts/src/inspiration.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): shelf library item, page and request schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Database RPCs for the Shelf library

**Files:**
- Create: `supabase/migrations/20261109000004_capture_library.sql`
- Test: `supabase/tests/inspiration_capture_library.test.sql`

**Interfaces:**
- Produces (Postgres, `service_role` execute only):
  - `capture_list_inspiration(actor_user_id uuid, target_workspace_id uuid, page_offset integer, page_limit integer) returns jsonb`: an array of `{id,width,height,mime_type,note,source_url,created_at,storage_path,label_status,description,rooms:[{room_id,room_name,project_name}]}`, newest first. Raises `not_authorized` for a non-member and `invalid_request` for a bad paging argument.
  - `capture_update_inspiration_note(actor_user_id uuid, target_workspace_id uuid, target_item_id uuid, item_note text) returns void`: raises `invalid_request` (>500 characters) or `not_found`.
  - `capture_delete_inspiration_items(actor_user_id uuid, target_workspace_id uuid, target_item_ids uuid[]) returns text[]` (the removed storage paths): raises `invalid_request` or `not_authorized`.
  - `capture_link_inspiration_items(actor_user_id uuid, target_workspace_id uuid, target_room_id uuid, target_item_ids uuid[]) returns integer`: raises `not_found` (the room is outside the workspace or an item is missing) or `not_authorized` (no edit access).
- Unchanged signatures, new bodies: `update_inspiration_note(uuid, text)` and `delete_inspiration_items(uuid[])` now call the shared helpers.

- [ ] **Step 1: Write the failing pgTAP test** `supabase/tests/inspiration_capture_library.test.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Owner (member + room editor), outsider, and a second workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','lib-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000003','authenticated','authenticated','lib-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001','Lib WS','f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002','Other WS','f1000000-0000-4000-8000-000000000003');
insert into public.projects (id, workspace_id, name, created_by) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Voxecore','f1000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','Elsewhere','f1000000-0000-4000-8000-000000000003');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Main','f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','Their Room','f1000000-0000-4000-8000-000000000003');

-- Items: two ready (older, newer), one pending, one in the other workspace.
insert into public.inspiration_items (id, workspace_id, created_by, status, storage_path, mime_type, byte_size, width, height, content_hash, note, capture_channel, created_at) values
  ('f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','ready','f2000000-0000-4000-8000-000000000001/a.png','image/png',10,400,300,repeat('1',64),'old','shelf',now() - interval '2 days'),
  ('f5000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','ready','f2000000-0000-4000-8000-000000000001/b.png','image/png',10,300,600,repeat('2',64),null,'shelf',now() - interval '1 day'),
  ('f5000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','pending','f2000000-0000-4000-8000-000000000001/c.png','image/png',10,10,10,repeat('3',64),null,'shelf',now()),
  ('f5000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','ready','f2000000-0000-4000-8000-000000000002/d.png','image/png',10,10,10,repeat('4',64),null,'shelf',now());
insert into public.inspiration_labels (item_id, workspace_id, status, device, screen_type, theme, colors, description) values
  ('f5000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','sorted','web','pricing','dark','{#101010}','Three glass pricing cards.');
insert into public.room_inspiration (room_id, item_id, added_by) values
  ('f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001');

-- Grants: only service_role may call the capture RPCs.
select ok(not has_function_privilege('authenticated', 'public.capture_list_inspiration(uuid, uuid, integer, integer)', 'execute'), 'authenticated cannot list via capture');
select ok(has_function_privilege('service_role', 'public.capture_list_inspiration(uuid, uuid, integer, integer)', 'execute'), 'service_role can list via capture');
select ok(not has_function_privilege('anon', 'public.capture_delete_inspiration_items(uuid, uuid, uuid[])', 'execute'), 'anon cannot delete via capture');

set local role service_role;

-- List: ready only, newest first, label + rooms attached.
select is(
  jsonb_array_length(public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100)),
  2, 'list returns only ready items of the workspace');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 ->> 'id',
  'f5000000-0000-4000-8000-000000000002', 'newest first');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 ->> 'description',
  'Three glass pricing cards.', 'description comes from labels');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 -> 'rooms' -> 0 ->> 'project_name',
  'Voxecore', 'rooms carry project names');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',1,1) -> 0 ->> 'id',
  'f5000000-0000-4000-8000-000000000001', 'offset and limit page the list');
select throws_ok(
  $$ select public.capture_list_inspiration('f1000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000001',0,100) $$,
  'P0001', 'not_authorized', 'outsider cannot list');

-- Note.
select lives_ok(
  $$ select public.capture_update_inspiration_note('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','  fresh  ') $$,
  'owner updates a note');
select is((select note from public.inspiration_items where id = 'f5000000-0000-4000-8000-000000000001'), 'fresh', 'note is trimmed and saved');
select throws_ok(
  $$ select public.capture_update_inspiration_note('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000004','x') $$,
  'P0001', 'not_found', 'a token for one workspace cannot touch another');

-- Link.
select is(
  public.capture_link_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000001'::uuid,'f5000000-0000-4000-8000-000000000002'::uuid]),
  1, 'links new items, skips existing links');
select throws_ok(
  $$ select public.capture_link_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002', array['f5000000-0000-4000-8000-000000000001'::uuid]) $$,
  'P0001', 'not_found', 'cannot link into a room outside the workspace');

-- Delete.
select is(
  public.capture_delete_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000001'::uuid]),
  array['f2000000-0000-4000-8000-000000000001/a.png'], 'delete returns the storage paths');
select throws_ok(
  $$ select public.capture_delete_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000004'::uuid]) $$,
  'P0001', 'not_authorized', 'cannot delete another workspace''s item');

select * from finish();
rollback;
```

Note: `workspaces` inserts rely on the existing owner-membership trigger, the same as `supabase/tests/inspiration.test.sql`. If the owner isn't made a member automatically, add `insert into public.memberships (workspace_id, user_id, role) values ('f2000000-…-0001','f1000000-…-0001','owner') on conflict do nothing;`. Also make sure the owner is an `edit` participant in room `f4000000-…-0001`; add a `room_participants` row with `on conflict (room_id, user_id) do update set access = 'edit'` if the room-owner trigger doesn't do it.

- [ ] **Step 2: Run to verify it fails**

Use the branch-pure scratch-DB recipe (memory note "meld-local-setup" point 15), or, on a freshly reset local DB:
Run: `supabase test db --local 2>&1 | grep -E "inspiration_capture_library|not ok|Result"`
Expected: FAIL (`function public.capture_list_inspiration(...) does not exist`).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261109000004_capture_library.sql`

```sql
-- Native Inspiration screen (spec: docs/superpowers/specs/2026-11-09-native-inspiration-design.md).
-- The Mac app lists and edits the library with its Shelf token. These capture_*
-- RPCs mirror the session ones; both paths run the shared *_for helpers.

create function public.inspiration_update_note_for(actor uuid, scope_workspace uuid, target_item_id uuid, item_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(item_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set note = nullif(btrim(coalesce(item_note, '')), ''), updated_at = now()
  where id = target_item_id
    and status = 'ready'
    and (scope_workspace is null or workspace_id = scope_workspace)
    and public.inspiration_actor_is_member(actor, workspace_id);
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.inspiration_delete_for(actor uuid, scope_workspace uuid, target_item_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null
      or (scope_workspace is not null and item.workspace_id <> scope_workspace)
      or not public.inspiration_actor_is_member(actor, item.workspace_id)
  ) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  with removed as (
    delete from public.inspiration_items
    where id = any(target_item_ids)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into paths from removed;
  return paths;
end;
$$;

revoke all on function public.inspiration_update_note_for(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_delete_for(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- Session RPCs keep their signatures and grants; they now share the helpers.
create or replace function public.update_inspiration_note(target_item_id uuid, item_note text)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_update_note_for(auth.uid(), null, target_item_id, item_note); $$;

create or replace function public.delete_inspiration_items(target_item_ids uuid[])
returns text[] language sql security definer set search_path = ''
as $$ select public.inspiration_delete_for(auth.uid(), null, target_item_ids); $$;

-- Capture RPCs (shelf routes; the route has already resolved the token).
create function public.capture_list_inspiration(
  actor_user_id uuid, target_workspace_id uuid, page_offset integer, page_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if page_offset is null or page_offset < 0 or page_limit is null or page_limit not between 1 and 200 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(page.entry order by page.created_at desc, page.id), '[]'::jsonb)
  into result
  from (
    select
      item.id,
      item.created_at,
      jsonb_build_object(
        'id', item.id,
        'width', item.width,
        'height', item.height,
        'mime_type', item.mime_type,
        'note', item.note,
        'source_url', item.source_url,
        'created_at', item.created_at,
        'storage_path', item.storage_path,
        'label_status', label.status,
        'description', label.description,
        'rooms', coalesce((
          select jsonb_agg(
            jsonb_build_object('room_id', room.id, 'room_name', room.name, 'project_name', project.name)
            order by project.name, room.name)
          from public.room_inspiration link
          join public.rooms room on room.id = link.room_id
          join public.projects project on project.id = room.project_id
          where link.item_id = item.id
        ), '[]'::jsonb)
      ) as entry
    from public.inspiration_items item
    left join public.inspiration_labels label on label.item_id = item.id
    where item.workspace_id = target_workspace_id
      and item.status = 'ready'
    order by item.created_at desc, item.id
    offset page_offset
    limit page_limit
  ) page;
  return result;
end;
$$;

create function public.capture_update_inspiration_note(
  actor_user_id uuid, target_workspace_id uuid, target_item_id uuid, item_note text
)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_update_note_for(actor_user_id, target_workspace_id, target_item_id, item_note); $$;

create function public.capture_delete_inspiration_items(
  actor_user_id uuid, target_workspace_id uuid, target_item_ids uuid[]
)
returns text[] language sql security definer set search_path = ''
as $$ select public.inspiration_delete_for(actor_user_id, target_workspace_id, target_item_ids); $$;

create function public.capture_link_inspiration_items(
  actor_user_id uuid, target_workspace_id uuid, target_room_id uuid, target_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.rooms where id = target_room_id and workspace_id = target_workspace_id
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return public.inspiration_link_for(actor_user_id, target_room_id, target_item_ids);
end;
$$;

revoke all on function public.capture_list_inspiration(uuid, uuid, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.capture_update_inspiration_note(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_delete_inspiration_items(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.capture_link_inspiration_items(uuid, uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

grant execute on function public.capture_list_inspiration(uuid, uuid, integer, integer) to service_role;
grant execute on function public.capture_update_inspiration_note(uuid, uuid, uuid, text) to service_role;
grant execute on function public.capture_delete_inspiration_items(uuid, uuid, uuid[]) to service_role;
grant execute on function public.capture_link_inspiration_items(uuid, uuid, uuid, uuid[]) to service_role;
```

- [ ] **Step 4: Run to verify it passes, plus the existing inspiration tests**

Run the scratch-DB recipe (or `supabase migration up --local` followed by `supabase test db --local`), covering `inspiration.test.sql`, `inspiration_labels.test.sql` and `inspiration_capture_library.test.sql`.
Expected: all `ok`. The existing `inspiration.test.sql` must still pass, because the session note and delete behaviour hasn't changed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261109000004_capture_library.sql supabase/tests/inspiration_capture_library.test.sql
git commit -m "feat(db): capture RPCs to list, note, delete and link inspiration with the Shelf token

Session note/delete RPCs now share the same *_for helpers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Server library module (real + demo data)

**Files:**
- Create: `apps/web/src/features/inspiration/shelf-library.ts`
- Test: `apps/web/src/features/inspiration/shelf-library.test.ts`
- Modify: `apps/web/src/features/inspiration/inspiration-fake.ts` (+ `inspiration-fake.test.ts`)

**Interfaces:**
- Consumes: Task 1 contracts; Task 2 RPC names; `createInspirationStorage(client)` with `signUrls(paths) → Map<path,url>` and `remove(paths)`; `ShelfPrincipal = { tokenId, userId, workspaceId }` from `shelf-auth.ts`; `isRoomFakeEnabled()` from `@/features/rooms/e2e-gate`.
- Produces:
  ```ts
  export type ShelfLibraryResult<T> = { ok: true; value: T } | { ok: false; error: "unauthorized" | "not_found" | "invalid_request" | "unavailable" };
  export function createShelfLibrary(client: SupabaseClient, principal: ShelfPrincipal): {
    list(offset: number): Promise<ShelfLibraryResult<ShelfLibraryPage>>;
    updateNote(itemId: string, note: string | null): Promise<ShelfLibraryResult<ShelfLibraryItem>>;
    remove(ids: string[]): Promise<ShelfLibraryResult<ShelfCountResponse>>;
    addToRoom(ids: string[], roomId: string): Promise<ShelfLibraryResult<ShelfCountResponse>>;
  };
  export function createFakeShelfLibrary(principal: ShelfPrincipal): same shape;
  ```
- In `inspiration-fake.ts`: `FAKE_SHELF_TOKEN = "orion_cap_preview"`, `fakeShelfLibraryItems(): ShelfLibraryItem[]`, `fakeSaveInspiration` gains optional `width`/`height` inputs, `fakeSetLabel(itemId, description | null, state)`.

- [ ] **Step 1: Write the failing tests** `apps/web/src/features/inspiration/shelf-library.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ signUrls: vi.fn(), remove: vi.fn(), upload: vi.fn() }));
vi.mock("./inspiration-storage", () => ({ createInspirationStorage: () => storage }));

import { createShelfLibrary } from "./shelf-library";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const ROOM_ID = "55555555-5555-4555-8555-555555555555";
const ROW = {
  id: ITEM_ID,
  width: 400,
  height: 300,
  mime_type: "image/png",
  note: "nice",
  source_url: null,
  created_at: "2026-11-09T14:02:00.123456+00:00",
  storage_path: `${PRINCIPAL.workspaceId}/a.png`,
  label_status: "sorted",
  description: "Pricing cards.",
  rooms: [{ room_id: ROOM_ID, room_name: "Main", project_name: "Voxecore" }],
};

function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as never;
}

describe("createShelfLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.signUrls.mockResolvedValue(new Map([[ROW.storage_path, "https://signed/a"]]));
    storage.remove.mockResolvedValue(undefined);
  });

  it("lists a page with signed urls, label state and rooms", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [ROW], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(0);
    expect(rpc).toHaveBeenCalledWith("capture_list_inspiration", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      page_offset: 0,
      page_limit: 101,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: ITEM_ID,
            width: 400,
            height: 300,
            mimeType: "image/png",
            note: "nice",
            sourceUrl: null,
            createdAt: "2026-11-09T14:02:00.123Z",
            description: "Pricing cards.",
            labelState: "done",
            rooms: [{ roomId: ROOM_ID, roomName: "Main", projectName: "Voxecore" }],
            imageUrl: "https://signed/a",
          },
        ],
        nextOffset: null,
      },
    });
  });

  it("maps label status to label state", async () => {
    const rows = [
      { ...ROW, id: "a0000000-0000-4000-8000-000000000001", label_status: null, description: null },
      { ...ROW, id: "a0000000-0000-4000-8000-000000000002", label_status: "unsorted", description: null },
      { ...ROW, id: "a0000000-0000-4000-8000-000000000003", label_status: "unsortable", description: null },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(0);
    expect(result.ok && result.value.items.map((item) => item.labelState)).toEqual(["pending", "pending", "skipped"]);
  });

  it("reports a next offset when one extra row comes back", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ ...ROW, id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(100);
    expect(result.ok && result.value.items).toHaveLength(100);
    expect(result.ok && result.value.nextOffset).toBe(200);
  });

  it("maps not_authorized to unauthorized", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "not_authorized" } });
    expect(await createShelfLibrary(client(rpc), PRINCIPAL).list(0)).toEqual({ ok: false, error: "unauthorized" });
  });

  it("updates a note and returns the fresh item", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ ...ROW, note: "fresh" }], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).updateNote(ITEM_ID, "fresh");
    expect(rpc).toHaveBeenNthCalledWith(1, "capture_update_inspiration_note", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_item_id: ITEM_ID,
      item_note: "fresh",
    });
    expect(result.ok && result.value.note).toBe("fresh");
  });

  it("maps a missing note target to not_found", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "not_found" } });
    expect(await createShelfLibrary(client(rpc), PRINCIPAL).updateNote(ITEM_ID, "x")).toEqual({ ok: false, error: "not_found" });
  });

  it("deletes rows then removes their objects", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [ROW.storage_path], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).remove([ITEM_ID]);
    expect(rpc).toHaveBeenCalledWith("capture_delete_inspiration_items", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_item_ids: [ITEM_ID],
    });
    expect(storage.remove).toHaveBeenCalledWith([ROW.storage_path]);
    expect(result).toEqual({ ok: true, value: { count: 1 } });
  });

  it("links items to a room", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).addToRoom([ITEM_ID], ROOM_ID);
    expect(rpc).toHaveBeenCalledWith("capture_link_inspiration_items", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_room_id: ROOM_ID,
      target_item_ids: [ITEM_ID],
    });
    expect(result).toEqual({ ok: true, value: { count: 2 } });
  });
});
```

Append to `apps/web/src/features/inspiration/inspiration-fake.test.ts`:

```ts
import { createFakeShelfLibrary } from "./shelf-library";
import { FAKE_SHELF_TOKEN, fakeSaveInspiration, fakeSetLabel, resetInspirationFake } from "./inspiration-fake";

describe("fake shelf library", () => {
  const principal = {
    tokenId: "a0000000-0000-4000-8000-000000000000",
    userId: "a0000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000001",
  };

  beforeEach(() => resetInspirationFake());

  it("keeps real dimensions and labels for the native wall", async () => {
    const saved = fakeSaveInspiration({ workspaceId: principal.workspaceId, bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", width: 800, height: 1200 });
    if (!saved.ok) throw new Error("save failed");
    fakeSetLabel(saved.itemId, "A tall mobile login.", "done");
    const page = await createFakeShelfLibrary(principal).list(0);
    expect(page.ok && page.value.items[0]).toMatchObject({ width: 800, height: 1200, description: "A tall mobile login.", labelState: "done" });
  });

  it("names a stable preview token", () => {
    expect(FAKE_SHELF_TOKEN).toBe("orion_cap_preview");
  });
});
```

(Add `beforeEach` to the vitest import if the file doesn't already import it.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter web exec vitest run src/features/inspiration/shelf-library.test.ts src/features/inspiration/inspiration-fake.test.ts`
Expected: FAIL (module `./shelf-library` not found; `FAKE_SHELF_TOKEN` not exported).

- [ ] **Step 3: Extend the fake** in `inspiration-fake.ts`

1. Below `FAKE_SHELF_CONNECT_CODE`, add:
   ```ts
   // The token the demo /api/shelf/connect hands out, so Orion Preview's Shelf
   // auto-connect works without Supabase.
   export const FAKE_SHELF_TOKEN = "orion_cap_preview";
   ```
2. Change `type FakeItem` to `InspirationItemView & { contentHash: string; description: string | null; labelState: ShelfLabelState }`. Import `type ShelfLabelState, type ShelfLibraryItem` from `@meld/contracts`.
3. In `withRoomIds`, strip the new fields too: `const { contentHash: _contentHash, description: _d, labelState: _l, ...view } = item;`.
4. `fakeSaveInspiration` input gains `width?: number; height?: number`. Set `width: input.width ?? 1, height: input.height ?? 1, description: null, labelState: "pending"` on new items.
5. Append:
   ```ts
   export function fakeSetLabel(itemId: string, description: string | null, labelState: ShelfLabelState): void {
     const item = store().items.find((candidate) => candidate.id === itemId);
     if (item) Object.assign(item, { description, labelState });
   }

   export function fakeShelfLibraryItems(workspaceId: string): ShelfLibraryItem[] {
     return store()
       .items.filter((item) => item.workspaceId === workspaceId)
       .map((item) => ({
         id: item.id,
         width: item.width,
         height: item.height,
         mimeType: item.mimeType,
         note: item.note,
         sourceUrl: item.sourceUrl,
         createdAt: item.createdAt,
         description: item.description,
         labelState: item.labelState,
         rooms: store()
           .links.filter((link) => link.itemId === item.id)
           .flatMap((link) => (link.roomId === FAKE_INSPIRATION_ROOM.roomId ? [FAKE_INSPIRATION_ROOM] : [])),
         imageUrl: item.imageUrl,
       }));
   }
   ```

- [ ] **Step 4: Implement** `apps/web/src/features/inspiration/shelf-library.ts`

```ts
import "server-only";

import {
  INSPIRATION_LIMITS,
  InspirationMimeTypeSchema,
  type ShelfCountResponse,
  type ShelfLabelState,
  type ShelfLibraryItem,
  type ShelfLibraryPage,
} from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createInspirationStorage } from "./inspiration-storage";
import type { ShelfPrincipal } from "./shelf-auth";

export type ShelfLibraryError = "unauthorized" | "not_found" | "invalid_request" | "unavailable";
export type ShelfLibraryResult<T> = { ok: true; value: T } | { ok: false; error: ShelfLibraryError };

export interface ShelfLibrary {
  list(offset: number): Promise<ShelfLibraryResult<ShelfLibraryPage>>;
  updateNote(itemId: string, note: string | null): Promise<ShelfLibraryResult<ShelfLibraryItem>>;
  remove(ids: string[]): Promise<ShelfLibraryResult<ShelfCountResponse>>;
  addToRoom(ids: string[], roomId: string): Promise<ShelfLibraryResult<ShelfCountResponse>>;
}

const PAGE = INSPIRATION_LIMITS.shelfLibraryPageSize;

const LibraryRowSchema = z.object({
  id: z.string().uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mime_type: InspirationMimeTypeSchema,
  note: z.string().nullable(),
  source_url: z.string().nullable(),
  created_at: z.string(),
  storage_path: z.string(),
  label_status: z.enum(["unsorted", "sorted", "unsortable"]).nullable(),
  description: z.string().nullable(),
  rooms: z.array(z.object({ room_id: z.string().uuid(), room_name: z.string(), project_name: z.string() })),
});
type LibraryRow = z.infer<typeof LibraryRowSchema>;

function labelState(status: LibraryRow["label_status"]): ShelfLabelState {
  if (status === "sorted") return "done";
  if (status === "unsortable") return "skipped";
  return "pending";
}

function toItem(row: LibraryRow, imageUrl: string | null): ShelfLibraryItem {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    note: row.note,
    sourceUrl: row.source_url,
    createdAt: new Date(row.created_at).toISOString(),
    description: labelState(row.label_status) === "done" ? row.description : null,
    labelState: labelState(row.label_status),
    rooms: row.rooms.map((room) => ({ roomId: room.room_id, roomName: room.room_name, projectName: room.project_name })),
    imageUrl,
  };
}

function failure(message: string | undefined): { ok: false; error: ShelfLibraryError } {
  if (message?.includes("not_authorized")) return { ok: false, error: "unauthorized" };
  if (message?.includes("not_found")) return { ok: false, error: "not_found" };
  if (message?.includes("invalid_request")) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}

export function createShelfLibrary(client: SupabaseClient, principal: ShelfPrincipal): ShelfLibrary {
  const scope = { actor_user_id: principal.userId, target_workspace_id: principal.workspaceId };
  const storage = createInspirationStorage(client);

  async function page(offset: number, limit: number): Promise<ShelfLibraryResult<LibraryRow[]>> {
    const { data, error } = await client.rpc("capture_list_inspiration", { ...scope, page_offset: offset, page_limit: limit });
    if (error) return failure(error.message);
    const rows = z.array(LibraryRowSchema).safeParse(data);
    if (!rows.success) return { ok: false, error: "unavailable" };
    return { ok: true, value: rows.data };
  }

  async function signed(rows: LibraryRow[]): Promise<ShelfLibraryItem[]> {
    const urls = await storage.signUrls(rows.map((row) => row.storage_path));
    return rows.map((row) => toItem(row, urls.get(row.storage_path) ?? null));
  }

  return {
    async list(offset) {
      // One extra row tells us whether there is a next page.
      const rows = await page(offset, PAGE + 1);
      if (!rows.ok) return rows;
      const items = await signed(rows.value.slice(0, PAGE));
      return { ok: true, value: { items, nextOffset: rows.value.length > PAGE ? offset + PAGE : null } };
    },

    async updateNote(itemId, note) {
      const { error } = await client.rpc("capture_update_inspiration_note", { ...scope, target_item_id: itemId, item_note: note });
      if (error) return failure(error.message);
      // Re-read the one row so the app gets the stored (trimmed) note back.
      let offset = 0;
      for (;;) {
        const rows = await page(offset, 200);
        if (!rows.ok) return rows;
        const row = rows.value.find((candidate) => candidate.id === itemId);
        if (row) return { ok: true, value: (await signed([row]))[0] };
        if (rows.value.length < 200) return { ok: false, error: "not_found" };
        offset += 200;
      }
    },

    async remove(ids) {
      const { data, error } = await client.rpc("capture_delete_inspiration_items", { ...scope, target_item_ids: ids });
      if (error) return failure(error.message);
      const paths = z.array(z.string()).safeParse(data);
      if (!paths.success) return { ok: false, error: "unavailable" };
      // The rows are gone either way; an orphaned object is harmless and private.
      await storage.remove(paths.data).catch(() => console.error("inspiration object removal failed", { count: paths.data.length }));
      return { ok: true, value: { count: paths.data.length } };
    },

    async addToRoom(ids, roomId) {
      const { data, error } = await client.rpc("capture_link_inspiration_items", { ...scope, target_room_id: roomId, target_item_ids: ids });
      if (error) return failure(error.message);
      return { ok: true, value: { count: Number(data) } };
    },
  };
}

export function createFakeShelfLibrary(principal: ShelfPrincipal): ShelfLibrary {
  const load = () => import("./inspiration-fake");
  return {
    async list(offset) {
      const items = (await load()).fakeShelfLibraryItems(principal.workspaceId);
      const pageItems = items.slice(offset, offset + PAGE);
      return { ok: true, value: { items: pageItems, nextOffset: items.length > offset + PAGE ? offset + PAGE : null } };
    },
    async updateNote(itemId, note) {
      const fake = await load();
      fake.fakeUpdateNote(itemId, note?.trim() ? note.trim() : null);
      const item = fake.fakeShelfLibraryItems(principal.workspaceId).find((candidate) => candidate.id === itemId);
      return item ? { ok: true, value: item } : { ok: false, error: "not_found" };
    },
    async remove(ids) {
      return { ok: true, value: { count: (await load()).fakeDeleteItems(ids) } };
    },
    async addToRoom(ids, roomId) {
      return { ok: true, value: { count: (await load()).fakeLinkToRoom(roomId, ids) } };
    },
  };
}
```

The `updateNote` re-read pages through the library. That's fine for a one-person library. Don't add a single-item RPC.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter web exec vitest run src/features/inspiration/`
Expected: PASS (including the existing inspiration tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inspiration/shelf-library.ts apps/web/src/features/inspiration/shelf-library.test.ts apps/web/src/features/inspiration/inspiration-fake.ts apps/web/src/features/inspiration/inspiration-fake.test.ts
git commit -m "feat(web): shelf library module for the native Inspiration screen, with demo data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Library routes, plus demo-mode Shelf auth, connect and upload

**Files:**
- Create: `apps/web/src/app/api/shelf/library/request-json.ts` (+ `request-json.test.ts`)
- Create: `apps/web/src/app/api/shelf/library/route.ts` (+ `route.test.ts`)
- Create: `apps/web/src/app/api/shelf/library/[id]/route.ts` (+ `route.test.ts`)
- Create: `apps/web/src/app/api/shelf/library/delete/route.ts` (+ `route.test.ts`)
- Create: `apps/web/src/app/api/shelf/library/add-to-room/route.ts` (+ `route.test.ts`)
- Modify: `apps/web/src/features/inspiration/shelf-auth.ts` (+ test), `apps/web/src/app/api/shelf/connect/route.ts` (+ test), `apps/web/src/app/api/shelf/items/route.ts` (+ test)
- Modify: `packages/contracts/src/inspiration.ts` (one new error code)

**Interfaces:**
- Consumes: `createShelfLibrary`, `createFakeShelfLibrary` (Task 3); `FAKE_SHELF_TOKEN`, `FAKE_SHELF_CONNECT_CODE`, `fakeSaveInspiration` (Task 3); `validateImageBytes` (existing; returns `{ ok: true, image: { mimeType, width, height, … } }`).
- Produces (HTTP, all with `Authorization: Bearer <token>`):
  - `GET /api/shelf/library?offset=N` → 200 `ShelfLibraryPage`
  - `PATCH /api/shelf/library/{id}` body `{ note }` → 200 `ShelfLibraryItem`
  - `POST /api/shelf/library/delete` body `{ ids }` → 200 `{ count }`
  - `POST /api/shelf/library/add-to-room` body `{ ids, roomId }` → 200 `{ count }`
  - Errors use the existing envelope. The new code `not_found` → 404 (message `That image is no longer in Inspiration.`). `invalid_request` reuses `invalid_image`'s 422 status with its own message. `unauthorized` → 401. `unavailable` → 503.
- Demo mode (`isRoomFakeEnabled()`): `authenticateShelfRequest` resolves `Bearer orion_cap_preview` to `{ tokenId: FAKE id, userId: demo user id, workspaceId: E2E_WORKSPACE_ID }`. `POST /api/shelf/connect` with `FAKE_SHELF_CONNECT_CODE` returns `{ token: FAKE_SHELF_TOKEN, workspaceId: E2E_WORKSPACE_ID, workspaceName: "Demo" }`. `POST /api/shelf/items` saves through `fakeSaveInspiration` with the validated width and height.

- [ ] **Step 1: Add the error codes** to `packages/contracts/src/inspiration.ts`

In `ShelfErrorCodeSchema`, add `"not_found"` and `"invalid_request"`. In `SHELF_ERROR_MESSAGES`, add:
```ts
  not_found: "That image is no longer in Inspiration.",
  invalid_request: "Orion couldn't do that. Try again.",
```
In `apps/web/src/features/inspiration/shelf-responses.ts` `SHELF_ERROR_STATUS`, add `not_found: 404, invalid_request: 422,`.
On the Swift side, `ShelfAPIError.Code` gains matching cases in Task 6.

- [ ] **Step 2: Write the failing route tests**

`apps/web/src/app/api/shelf/library/request-json.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readJson } from "./request-json";

describe("readJson", () => {
  const Schema = z.object({ a: z.number() }).strict();
  it("parses a valid body", async () => {
    expect(await readJson(new Request("http://x", { method: "POST", body: JSON.stringify({ a: 1 }) }), Schema)).toEqual({ a: 1 });
  });
  it("returns null for bad JSON or a schema mismatch", async () => {
    expect(await readJson(new Request("http://x", { method: "POST", body: "{" }), Schema)).toBeNull();
    expect(await readJson(new Request("http://x", { method: "POST", body: JSON.stringify({ a: "1" }) }), Schema)).toBeNull();
  });
});
```

`apps/web/src/app/api/shelf/library/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  list: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ list: mocks.list }),
  createFakeShelfLibrary: () => ({ list: mocks.list }),
}));

import { GET } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};

describe("GET /api/shelf/library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
  });

  it("401s without a valid token", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(401);
  });

  it("returns the page for the token's workspace", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: true, value: { items: [], nextOffset: null } });
    const response = await GET(new Request("http://localhost/api/shelf/library?offset=100"));
    expect(mocks.list).toHaveBeenCalledWith(100);
    expect(await response.json()).toEqual({ items: [], nextOffset: null });
  });

  it("treats a bad offset as 0", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: true, value: { items: [], nextOffset: null } });
    await GET(new Request("http://localhost/api/shelf/library?offset=-4"));
    expect(mocks.list).toHaveBeenCalledWith(0);
  });

  it("maps library errors to the shelf envelope", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.list.mockResolvedValue({ ok: false, error: "unauthorized" });
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(401);
    mocks.list.mockResolvedValue({ ok: false, error: "unavailable" });
    expect((await GET(new Request("http://localhost/api/shelf/library"))).status).toBe(503);
  });
});
```

`apps/web/src/app/api/shelf/library/[id]/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  updateNote: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ updateNote: mocks.updateNote }),
  createFakeShelfLibrary: () => ({ updateNote: mocks.updateNote }),
}));

import { PATCH } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ID = "44444444-4444-4444-8444-444444444444";
const patch = (body: unknown, id = ID) =>
  PATCH(new Request(`http://localhost/api/shelf/library/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

describe("PATCH /api/shelf/library/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
  });

  it("saves the note", async () => {
    mocks.updateNote.mockResolvedValue({ ok: true, value: { id: ID, note: "fresh" } });
    const response = await patch({ note: "fresh" });
    expect(mocks.updateNote).toHaveBeenCalledWith(ID, "fresh");
    expect(response.status).toBe(200);
  });

  it("422s on a too-long note or a bad id", async () => {
    expect((await patch({ note: "a".repeat(501) })).status).toBe(422);
    expect((await patch({ note: "x" }, "nope")).status).toBe(422);
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("404s when the image is gone", async () => {
    mocks.updateNote.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await patch({ note: null })).status).toBe(404);
  });
});
```

`apps/web/src/app/api/shelf/library/delete/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), authenticateShelfRequest: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ remove: mocks.remove }),
  createFakeShelfLibrary: () => ({ remove: mocks.remove }),
}));

import { POST } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";
const post = (body: unknown) => POST(new Request("http://localhost/api/shelf/library/delete", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/shelf/library/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue({ tokenId: ID, userId: ID, workspaceId: ID });
  });

  it("deletes the ids", async () => {
    mocks.remove.mockResolvedValue({ ok: true, value: { count: 1 } });
    const response = await post({ ids: [ID] });
    expect(mocks.remove).toHaveBeenCalledWith([ID]);
    expect(await response.json()).toEqual({ count: 1 });
  });

  it("422s on an empty list", async () => {
    expect((await post({ ids: [] })).status).toBe(422);
  });

  it("401s when the item belongs elsewhere", async () => {
    mocks.remove.mockResolvedValue({ ok: false, error: "unauthorized" });
    expect((await post({ ids: [ID] })).status).toBe(401);
  });
});
```

`apps/web/src/app/api/shelf/library/add-to-room/route.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), authenticateShelfRequest: vi.fn(), addToRoom: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));
vi.mock("@/features/inspiration/shelf-library", () => ({
  createShelfLibrary: () => ({ addToRoom: mocks.addToRoom }),
  createFakeShelfLibrary: () => ({ addToRoom: mocks.addToRoom }),
}));

import { POST } from "./route";

const ID = "44444444-4444-4444-8444-444444444444";
const ROOM = "55555555-5555-4555-8555-555555555555";
const post = (body: unknown) => POST(new Request("http://localhost/api/shelf/library/add-to-room", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/shelf/library/add-to-room", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue({ tokenId: ID, userId: ID, workspaceId: ID });
  });

  it("links the ids to the room", async () => {
    mocks.addToRoom.mockResolvedValue({ ok: true, value: { count: 2 } });
    const response = await post({ ids: [ID], roomId: ROOM });
    expect(mocks.addToRoom).toHaveBeenCalledWith([ID], ROOM);
    expect(await response.json()).toEqual({ count: 2 });
  });

  it("422s without a room", async () => {
    expect((await post({ ids: [ID] })).status).toBe(422);
  });

  it("404s for a room outside the workspace", async () => {
    mocks.addToRoom.mockResolvedValue({ ok: false, error: "not_found" });
    expect((await post({ ids: [ID], roomId: ROOM })).status).toBe(404);
  });
});
```

Add to `apps/web/src/features/inspiration/shelf-auth.test.ts` (create the file with the same mock style as the route tests if it doesn't exist):
```ts
it("resolves the preview token to the demo workspace in fake mode", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
  vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
  const request = new Request("http://x", { headers: { authorization: "Bearer orion_cap_preview" } });
  const principal = await authenticateShelfRequest(request, { rpc: vi.fn() } as never);
  expect(principal?.workspaceId).toBe("00000000-0000-4000-8000-000000000001");
  vi.unstubAllEnvs();
});
```

Add to `apps/web/src/app/api/shelf/connect/route.test.ts`:
```ts
it("hands out the preview token for the fake code in fake mode", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
  vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
  const response = await POST(new Request("http://localhost/api/shelf/connect", {
    method: "POST",
    body: JSON.stringify({ code: "ORION234", deviceName: "Orion Preview" }),
  }));
  expect(await response.json()).toMatchObject({ token: "orion_cap_preview", workspaceId: "00000000-0000-4000-8000-000000000001" });
  vi.unstubAllEnvs();
});
```

Add to `apps/web/src/app/api/shelf/items/route.test.ts`:
```ts
it("saves into the demo store with real dimensions in fake mode", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
  vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
  mocks.authenticateShelfRequest.mockResolvedValue({ tokenId: "t", userId: "u", workspaceId: "00000000-0000-4000-8000-000000000001" });
  const form = new FormData();
  form.set("file", new Blob([TINY_PNG], { type: "image/png" }));
  const response = await POST(new Request("http://localhost/api/shelf/items", { method: "POST", body: form }));
  expect(response.status).toBe(201);
  const { fakeShelfLibraryItems } = await import("@/features/inspiration/inspiration-fake");
  expect(fakeShelfLibraryItems("00000000-0000-4000-8000-000000000001")[0]).toMatchObject({ width: 1, height: 1 });
  vi.unstubAllEnvs();
});
```
(Use the PNG fixture the existing items test already uses for `TINY_PNG`. If there isn't one, take the 1×1 PNG bytes from `apps/web/src/features/inspiration/image-validation.test.ts`.)

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter web exec vitest run src/app/api/shelf src/features/inspiration/shelf-auth.test.ts`
Expected: FAIL (the new route modules are missing; the fake branches don't exist yet).

- [ ] **Step 4: Implement**

`apps/web/src/app/api/shelf/library/request-json.ts`:
```ts
import type { z } from "zod";

// Reads and validates a JSON body; any failure is just "no valid body".
export async function readJson<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const parsed = schema.safeParse(await request.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
```

Add one shared helper, `apps/web/src/app/api/shelf/library/library-for-request.ts`:
```ts
import { createFakeShelfLibrary, createShelfLibrary, type ShelfLibrary, type ShelfLibraryError } from "@/features/inspiration/shelf-library";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

// Token → the right library (real or demo), or the error response to send.
export async function libraryForRequest(request: Request): Promise<{ library: ShelfLibrary } | { response: Response }> {
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
  return { library: isRoomFakeEnabled() ? createFakeShelfLibrary(principal) : createShelfLibrary(supabase, principal) };
}

export function libraryError(error: ShelfLibraryError): Response {
  return shelfError(error);
}
```
Give it a colocated test, `library-for-request.test.ts`, that asserts: unauthorized → 401; fake mode uses `createFakeShelfLibrary`. Use the mock style from `route.test.ts` above. `pnpm test:colocation` requires a test next to every module.

`apps/web/src/app/api/shelf/library/route.ts`:
```ts
import { libraryError, libraryForRequest } from "./library-for-request";

export async function GET(request: Request) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const raw = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  const offset = Number.isInteger(raw) && raw >= 0 ? raw : 0;
  const result = await resolved.library.list(offset);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
```

`apps/web/src/app/api/shelf/library/[id]/route.ts`:
```ts
import { ShelfNoteRequestSchema } from "@meld/contracts";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { libraryError, libraryForRequest } from "../library-for-request";
import { readJson } from "../request-json";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  const body = await readJson(request, ShelfNoteRequestSchema);
  if (!z.string().uuid().safeParse(id).success || !body) return shelfError("invalid_request");
  const result = await resolved.library.updateNote(id, body.note);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
```

`apps/web/src/app/api/shelf/library/delete/route.ts`:
```ts
import { ShelfItemIdsRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { libraryError, libraryForRequest } from "../library-for-request";
import { readJson } from "../request-json";

export async function POST(request: Request) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfItemIdsRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.library.remove(body.ids);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
```

`apps/web/src/app/api/shelf/library/add-to-room/route.ts`:
```ts
import { ShelfAddToRoomRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { libraryError, libraryForRequest } from "../library-for-request";
import { readJson } from "../request-json";

export async function POST(request: Request) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfAddToRoomRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.library.addToRoom(body.ids, body.roomId);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
```

`shelf-auth.ts`: add at the top of `authenticateShelfRequest`:
```ts
  if (isRoomFakeEnabled()) {
    const presented = parseCaptureAuthorization(request.headers.get("authorization"));
    const { FAKE_SHELF_TOKEN } = await import("./inspiration-fake");
    if (presented !== FAKE_SHELF_TOKEN) return null;
    const { E2E_WORKSPACE_ID } = await import("@/features/workspaces/e2e-fake");
    return {
      tokenId: "00000000-0000-4000-8000-0000000000cc",
      userId: "00000000-0000-4000-8000-0000000000aa",
      workspaceId: E2E_WORKSPACE_ID,
    };
  }
```
(Import `isRoomFakeEnabled` from `@/features/rooms/e2e-gate`. If `parseCaptureAuthorization` rejects tokens without the real token's prefix or length, compare the raw header to `` `Bearer ${FAKE_SHELF_TOKEN}` `` instead.)

`connect/route.ts` (import `isRoomFakeEnabled` from `@/features/rooms/e2e-gate`): before the real redeem path, after parsing the body with `ShelfConnectRequestSchema`, add:
```ts
  if (isRoomFakeEnabled()) {
    const { FAKE_SHELF_CONNECT_CODE, FAKE_SHELF_TOKEN } = await import("@/features/inspiration/inspiration-fake");
    const { E2E_WORKSPACE_ID } = await import("@/features/workspaces/e2e-fake");
    if (body.code.toUpperCase() !== FAKE_SHELF_CONNECT_CODE) return shelfError("invalid_code");
    return Response.json({ token: FAKE_SHELF_TOKEN, workspaceId: E2E_WORKSPACE_ID, workspaceName: "Demo" }, { status: 201 });
  }
```
Place it before `createShelfServerClient()`, because the demo has no service-role key. Match the variable names the file already uses for the parsed body.

`items/route.ts`: move the `createShelfServerClient()` try/catch so that, in fake mode, a configuration error doesn't return early: `if (!isRoomFakeEnabled()) return shelfError("unavailable")`, and use `{}` as the client. After `fields` are parsed, add:
```ts
  if (isRoomFakeEnabled()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validateImageBytes(bytes);
    if (!validated.ok) return shelfError(validated.error);
    const { fakeSaveInspiration } = await import("@/features/inspiration/inspiration-fake");
    const saved = fakeSaveInspiration({
      workspaceId: principal.workspaceId,
      bytes,
      mimeType: validated.image.mimeType,
      roomId: fields.roomId,
      width: validated.image.width,
      height: validated.image.height,
    });
    if (!saved.ok) return shelfError(saved.error);
    return Response.json({ itemId: saved.itemId, duplicate: saved.duplicate, roomLinked: saved.roomLinked }, { status: saved.duplicate ? 200 : 201 });
  }
```
(Import `validateImageBytes` from `@/features/inspiration/image-validation`. If `ValidatedImage` names the dimensions differently, use the real field names from that file.)

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter web exec vitest run src/app/api/shelf src/features/inspiration && pnpm --filter web exec tsc --noEmit && pnpm check:test-colocation`
Expected: PASS, no type errors, colocation OK.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/inspiration.ts apps/web/src/features/inspiration apps/web/src/app/api/shelf
git commit -m "feat(web): shelf library routes and a demo-mode shelf for Orion Preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Mac app wiring — origin base URL, preview outbox, library hooks

**Files:**
- Modify: `apps/mac/Sources/OrionAppCore/AppConfig.swift`
- Test: `apps/mac/Tests/OrionAppCoreTests/AppConfigTests.swift`
- Modify: `apps/mac/Sources/Orion/App/AppDependencies.swift`, `apps/mac/Sources/Orion/App/AppModel.swift`

**Interfaces:**
- Produces:
  - `AppConfig.origin(of url: URL) -> URL`: the scheme + host + port only.
  - `AppModel.libraryToken() -> String?`: the Shelf token while connected, else nil.
  - `AppModel.libraryClient() -> any OrionClient`.
  - `AppModel.libraryUnauthorized()`: marks the Shelf disconnected, so the next page `ready` auto-connects.
  - `AppModel.pendingCaptures: [RecentCapture]`: `recent.filter { $0.itemID == nil }`.
  - `@ObservationIgnored var AppModel.onUploadsFinished: (() -> Void)?`: called after a drain that uploaded at least one image.
  - `AppModel.isConnected: Bool`.

- [ ] **Step 1: Write the failing test** (append to `AppConfigTests.swift`)

```swift
@Test func originDropsPathQueryAndFragment() throws {
    let url = try #require(URL(string: "http://127.0.0.1:3107/dev/demo-sign-in?x=1#y"))
    #expect(AppConfig.origin(of: url).absoluteString == "http://127.0.0.1:3107")
    let plain = try #require(URL(string: "https://orion-workspace-phi.vercel.app"))
    #expect(AppConfig.origin(of: plain) == plain)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter AppConfigTests`
Expected: FAIL (`origin(of:)` is not defined).

- [ ] **Step 3: Implement**

In `AppConfig`:
```swift
    /// Just scheme, host and port. The Preview's start page carries a path
    /// (`/dev/demo-sign-in`) that must not prefix the Shelf API.
    public static func origin(of url: URL) -> URL {
        var parts = URLComponents()
        parts.scheme = url.scheme
        parts.host = url.host()
        parts.port = url.port
        return parts.url ?? url
    }
```

In `AppDependencies.live`:
- `defaultBaseURL: AppConfig.origin(of: AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard))`
- Preview gets its own outbox so it never shares the real Shelf's queue:
```swift
        let isPreview = AppConfig.isPreview(info: Bundle.main.infoDictionary)
        let outboxDirectory = isPreview
            ? Outbox.defaultDirectory.deletingLastPathComponent().appending(path: "preview-outbox", directoryHint: .isDirectory)
            : Outbox.defaultDirectory
```
  and pass `outbox: Outbox(directory: outboxDirectory), outboxDirectory: outboxDirectory`.

In `AppModel`, add:
```swift
    /// Called after a drain that uploaded something, so Inspiration reloads.
    @ObservationIgnored var onUploadsFinished: (() -> Void)?

    var isConnected: Bool { connection != .disconnected }

    /// Captures still on their way to Orion; Inspiration shows them as shimmering tiles.
    var pendingCaptures: [RecentCapture] { recent.filter { $0.itemID == nil } }

    func libraryToken() -> String? {
        guard isConnected else { return nil }
        return try? dependencies.makeTokenStore(baseURL).token()
    }

    func libraryClient() -> any OrionClient {
        dependencies.makeClient(baseURL)
    }

    /// Inspiration was told the key is no longer valid. The next page `ready`
    /// message re-runs Shelf auto-connect (NativeBridge).
    func libraryUnauthorized() {
        markDisconnected()
    }
```
In `drain()`, after the `for uploaded in report.uploaded` loop, add `if !report.uploaded.isEmpty { onUploadsFinished?() }`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/OrionAppCore/AppConfig.swift apps/mac/Tests/OrionAppCoreTests/AppConfigTests.swift apps/mac/Sources/Orion/App
git commit -m "feat(mac): shelf talks to the site origin, Preview gets its own outbox, library hooks on AppModel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Swift library models and client methods

**Files:**
- Create: `apps/mac/Sources/ShelfCore/Library/LibraryItem.swift`, `LibraryPage.swift`, `LibraryDates.swift`
- Modify: `apps/mac/Sources/ShelfCore/Network/OrionClient.swift`, `URLSessionOrionClient.swift`, `ShelfAPIError.swift`
- Modify: `apps/mac/Tests/ShelfTestSupport/FakeOrionClient.swift`
- Test: `apps/mac/Tests/ShelfCoreTests/LibraryClientTests.swift`

**Interfaces:**
- Consumes: the JSON from Task 4.
- Produces:
  ```swift
  public struct LibraryItem: Codable, Sendable, Hashable, Identifiable {
      public enum LabelState: String, Codable, Sendable { case pending, done, skipped }
      public let id: UUID; public let width: Int; public let height: Int
      public let mimeType: ImageMimeType; public var note: String?; public let sourceUrl: String?
      public let createdAt: Date; public let description: String?; public let labelState: LabelState
      public var rooms: [ShelfRoom]; public let imageUrl: URL?
      public var aspectRatio: Double   // width / height
      public var sourceURL: URL?       // http(s) only
  }
  public struct LibraryPage: Codable, Sendable, Equatable { public let items: [LibraryItem]; public let nextOffset: Int? }
  public struct LibraryCount: Codable, Sendable, Equatable { public let count: Int }
  public enum LibraryDates { public static let decoder: JSONDecoder; public static let encoder: JSONEncoder }
  // OrionClient additions:
  func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage
  func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem
  func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount
  func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount
  // ShelfAPIError.Code additions: case notFound = "not_found", invalidRequest = "invalid_request"
  ```

- [ ] **Step 1: Write the failing tests** `apps/mac/Tests/ShelfCoreTests/LibraryClientTests.swift`

```swift
import Foundation
import Testing
@testable import ShelfCore

struct LibraryClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }
    let itemID = UUID()
    let roomID = UUID()

    private func client() -> URLSessionOrionClient {
        URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session())
    }

    private var itemJSON: String {
        #"{"id":"\#(itemID.uuidString.lowercased())","width":400,"height":800,"mimeType":"image/png","note":"nice","sourceUrl":"https://dribbble.com/x","createdAt":"2026-11-09T14:02:00.123Z","description":"Tall login.","labelState":"done","rooms":[{"roomId":"\#(roomID.uuidString.lowercased())","roomName":"Main","projectName":"Voxecore"}],"imageUrl":"https://signed/a"}"#
    }

    @Test func libraryGetsAPageWithTheBearerToken() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/library")
            #expect(request.url?.query() == "offset=100")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer orion_cap_t")
            return (200, Data(#"{"items":[\#(itemJSON)],"nextOffset":200}"#.utf8))
        }
        let page = try await client().library(offset: 100, token: "orion_cap_t")
        #expect(page.nextOffset == 200)
        let item = try #require(page.items.first)
        #expect(item.id == itemID)
        #expect(item.aspectRatio == 0.5)
        #expect(item.labelState == .done)
        #expect(item.rooms == [ShelfRoom(roomId: roomID, roomName: "Main", projectName: "Voxecore")])
        #expect(item.sourceURL?.host() == "dribbble.com")
        #expect(abs(item.createdAt.timeIntervalSince1970 - 1_794_232_920.123) < 0.001)
    }

    @Test func updateNotePatchesJSON() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.httpMethod == "PATCH")
            #expect(request.url?.path() == "/api/shelf/library/\(itemID.uuidString.lowercased())")
            let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(of: request)) as? [String: Any]
            #expect(body?["note"] as? String == "fresh")
            return (200, Data(itemJSON.utf8))
        }
        _ = try await client().updateNote(itemID: itemID, note: "fresh", token: "t")
    }

    @Test func clearingANoteSendsNull() async throws {
        StubURLProtocol.register(host: host) { request in
            let text = String(decoding: StubURLProtocol.body(of: request), as: UTF8.self)
            #expect(text == #"{"note":null}"#)
            return (200, Data(itemJSON.utf8))
        }
        _ = try await client().updateNote(itemID: itemID, note: nil, token: "t")
    }

    @Test func deleteAndAddPostLowercasedIDs() async throws {
        StubURLProtocol.register(host: host) { request in
            let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(of: request)) as? [String: Any]
            #expect((body?["ids"] as? [String]) == [itemID.uuidString.lowercased()])
            if request.url?.path() == "/api/shelf/library/add-to-room" {
                #expect(body?["roomId"] as? String == roomID.uuidString.lowercased())
            }
            return (200, Data(#"{"count":1}"#.utf8))
        }
        #expect(try await client().deleteItems([itemID], token: "t") == LibraryCount(count: 1))
        #expect(try await client().addItems([itemID], toRoom: roomID, token: "t") == LibraryCount(count: 1))
    }

    @Test func notFoundMapsToItsCode() async {
        StubURLProtocol.register(host: host) { _ in
            (404, Data(#"{"error":{"code":"not_found","message":"That image is no longer in Inspiration."}}"#.utf8))
        }
        await #expect(throws: ShelfAPIError(code: .notFound, message: "That image is no longer in Inspiration.")) {
            try await client().updateNote(itemID: itemID, note: "x", token: "t")
        }
    }

    @Test func pageRoundTripsThroughTheCacheCoder() throws {
        let page = try LibraryDates.decoder.decode(LibraryPage.self, from: Data(#"{"items":[\#(itemJSON)],"nextOffset":null}"#.utf8))
        let again = try LibraryDates.decoder.decode(LibraryPage.self, from: LibraryDates.encoder.encode(page))
        #expect(again == page)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter LibraryClientTests`
Expected: FAIL (`LibraryItem`, `library(offset:token:)` are not defined).

- [ ] **Step 3: Implement**

`apps/mac/Sources/ShelfCore/Library/LibraryDates.swift`:
```swift
import Foundation

/// Orion sends `createdAt` as ISO 8601 with milliseconds ("…T14:02:00.123Z").
public enum LibraryDates {
    public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            if let date = try? Date(text, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(text, strategy: .iso8601) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Bad date \(text)"))
        }
        return decoder
    }()

    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(.iso8601.year().month().day().time(includingFractionalSeconds: true)))
        }
        return encoder
    }()
}
```

`apps/mac/Sources/ShelfCore/Library/LibraryItem.swift`:
```swift
import Foundation

/// One saved inspiration image as the native wall needs it.
public struct LibraryItem: Codable, Sendable, Hashable, Identifiable {
    public enum LabelState: String, Codable, Sendable {
        case pending, done, skipped
    }

    public let id: UUID
    public let width: Int
    public let height: Int
    public let mimeType: ImageMimeType
    public var note: String?
    public let sourceUrl: String?
    public let createdAt: Date
    public let description: String?
    public let labelState: LabelState
    public var rooms: [ShelfRoom]
    public let imageUrl: URL?

    public init(
        id: UUID, width: Int, height: Int, mimeType: ImageMimeType, note: String?, sourceUrl: String?,
        createdAt: Date, description: String?, labelState: LabelState, rooms: [ShelfRoom], imageUrl: URL?
    ) {
        self.id = id
        self.width = width
        self.height = height
        self.mimeType = mimeType
        self.note = note
        self.sourceUrl = sourceUrl
        self.createdAt = createdAt
        self.description = description
        self.labelState = labelState
        self.rooms = rooms
        self.imageUrl = imageUrl
    }

    /// Width ÷ height; drives the masonry tile height before the picture loads.
    public var aspectRatio: Double { Double(width) / Double(max(height, 1)) }

    /// The source link, only if it's a web address.
    public var sourceURL: URL? {
        guard let sourceUrl, let url = URL(string: sourceUrl), url.scheme == "https" || url.scheme == "http" else { return nil }
        return url
    }
}
```

`apps/mac/Sources/ShelfCore/Library/LibraryPage.swift`:
```swift
import Foundation

public struct LibraryPage: Codable, Sendable, Equatable {
    public let items: [LibraryItem]
    public let nextOffset: Int?

    public init(items: [LibraryItem], nextOffset: Int?) {
        self.items = items
        self.nextOffset = nextOffset
    }
}

public struct LibraryCount: Codable, Sendable, Equatable {
    public let count: Int

    public init(count: Int) {
        self.count = count
    }
}
```

`ShelfAPIError.Code`: add `case notFound = "not_found"` and `case invalidRequest = "invalid_request"`. In `URLSessionOrionClient.error(from:status:)`, map status `404` to `.notFound`.

`OrionClient`: add the four signatures from **Interfaces**.

`URLSessionOrionClient`: add
```swift
    public func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage {
        var components = URLComponents(url: baseURL.appending(path: "api/shelf/library"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "offset", value: String(offset))]
        guard let url = components?.url else { throw .network }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request, decoder: LibraryDates.decoder)
    }

    public func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem {
        let path = "api/shelf/library/\(itemID.uuidString.lowercased())"
        return try await sendJSON(path: path, method: "PATCH", body: NoteBody(note: note), token: token)
    }

    public func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount {
        try await sendJSON(path: "api/shelf/library/delete", method: "POST", body: IDsBody(ids: ids.map { $0.uuidString.lowercased() }), token: token)
    }

    public func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount {
        let body = AddBody(ids: ids.map { $0.uuidString.lowercased() }, roomId: roomID.uuidString.lowercased())
        return try await sendJSON(path: "api/shelf/library/add-to-room", method: "POST", body: body, token: token)
    }

    private struct NoteBody: Encodable {
        let note: String?
        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(note, forKey: .note) // writes null, not omitted
        }
        enum CodingKeys: String, CodingKey { case note }
    }
    private struct IDsBody: Encodable { let ids: [String] }
    private struct AddBody: Encodable { let ids: [String]; let roomId: String }

    private func sendJSON<Body: Encodable, Response: Decodable>(path: String, method: String, body: Body, token: String) async throws(ShelfAPIError) -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't prepare the request."))
        }
        return try await send(request, decoder: LibraryDates.decoder)
    }
```
Change the existing `send` to `private func send<Response: Decodable>(_ request: URLRequest, decoder: JSONDecoder = JSONDecoder()) async throws(ShelfAPIError) -> Response` and use `decoder.decode`.

`FakeOrionClient`: add scripted results and recorders:
```swift
    public var libraryPages: [Result<LibraryPage, ShelfAPIError>] = []
    public var noteResult: Result<LibraryItem, ShelfAPIError>?
    public var deleteResult: Result<LibraryCount, ShelfAPIError> = .success(LibraryCount(count: 0))
    public var addResult: Result<LibraryCount, ShelfAPIError> = .success(LibraryCount(count: 0))
    public private(set) var libraryOffsets: [Int] = []
    public private(set) var notesSent: [(UUID, String?)] = []
    public private(set) var deletedIDs: [[UUID]] = []
    public private(set) var added: [([UUID], UUID)] = []

    public func setLibraryPages(_ pages: [Result<LibraryPage, ShelfAPIError>]) { libraryPages = pages }
    public func setNoteResult(_ result: Result<LibraryItem, ShelfAPIError>) { noteResult = result }
    public func setDeleteResult(_ result: Result<LibraryCount, ShelfAPIError>) { deleteResult = result }
    public func setAddResult(_ result: Result<LibraryCount, ShelfAPIError>) { addResult = result }

    public func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage {
        libraryOffsets.append(offset)
        guard !libraryPages.isEmpty else { throw ShelfAPIError.network }
        return try libraryPages.removeFirst().get()
    }
    public func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem {
        notesSent.append((itemID, note))
        guard let noteResult else { throw ShelfAPIError.network }
        return try noteResult.get()
    }
    public func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount {
        deletedIDs.append(ids)
        return try deleteResult.get()
    }
    public func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount {
        added.append((ids, roomID))
        return try addResult.get()
    }
```

If the existing app code switches exhaustively over `ShelfAPIError.Code`, add the new cases there too (search with `grep -rn "case .unavailable" apps/mac/Sources`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: all pass (including `LibraryClientTests`).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore apps/mac/Tests/ShelfTestSupport apps/mac/Tests/ShelfCoreTests/LibraryClientTests.swift
git commit -m "feat(mac): library models and Shelf client calls for the native Inspiration screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Masonry maths, tile steps and arrow-key navigation (pure, OrionAppCore)

**Files:**
- Create: `apps/mac/Sources/OrionAppCore/Inspiration/MasonryLayout.swift`, `TileStep.swift`, `WallNavigation.swift`
- Test: `apps/mac/Tests/OrionAppCoreTests/MasonryLayoutTests.swift`, `TileStepTests.swift`, `WallNavigationTests.swift`

**Interfaces:**
- Produces:
  ```swift
  public enum MasonryLayout {
      /// How many columns of `tileWidth` fit in `width` with `spacing` between them (≥ 1).
      public static func columnCount(width: Double, tileWidth: Double, spacing: Double) -> Int
      /// Item indexes per column, each placed in the currently shortest column. Heights use 1 / aspectRatio.
      public static func columns(aspectRatios: [Double], count: Int) -> [[Int]]
  }
  public struct TileStep: Equatable, Sendable {
      public static let widths: [Double] = [140, 180, 230, 290, 360]
      public static let defaultIndex = 2
      public static let defaultsKey = "inspirationTileStep"
      public let index: Int            // clamped 0…4
      public init(index: Int)
      public var width: Double
      public func bigger() -> TileStep
      public func smaller() -> TileStep
  }
  public enum WallDirection: Sendable { case left, right, up, down }
  public enum WallNavigation {
      /// The next item index from `current` in `direction`. Left/right walk the
      /// newest-first order; up/down stay in the same column. Returns nil at an edge.
      public static func next(from current: Int, direction: WallDirection, columns: [[Int]]) -> Int?
  }
  ```

- [ ] **Step 1: Write the failing tests**

`MasonryLayoutTests.swift`:
```swift
import Testing
@testable import OrionAppCore

struct MasonryLayoutTests {
    @Test func columnCountFitsTilesAndSpacing() {
        #expect(MasonryLayout.columnCount(width: 1000, tileWidth: 230, spacing: 12) == 4)
        #expect(MasonryLayout.columnCount(width: 100, tileWidth: 230, spacing: 12) == 1)
        #expect(MasonryLayout.columnCount(width: 0, tileWidth: 230, spacing: 12) == 1)
    }

    @Test func placesEachItemInTheShortestColumn() {
        // Heights are 1 / ratio: tall 2, wide 0.5, square 1, square 1.
        // 0 → col0 (2). 1 → col1 (0.5). 2 → col1 (1.5 < 2). 3 → col1 (1.5 < 2, now 2.5).
        let columns = MasonryLayout.columns(aspectRatios: [0.5, 2, 1, 1], count: 2)
        #expect(columns == [[0], [1, 2, 3]])
    }

    @Test func keepsNewestFirstWithinAColumnAndTiesGoLeft() {
        let columns = MasonryLayout.columns(aspectRatios: [1, 1, 1, 1, 1, 1], count: 3)
        #expect(columns == [[0, 3], [1, 4], [2, 5]])
    }

    @Test func handlesEmptyAndOneColumn() {
        #expect(MasonryLayout.columns(aspectRatios: [], count: 3) == [[], [], []])
        #expect(MasonryLayout.columns(aspectRatios: [1, 2], count: 1) == [[0, 1]])
    }
}
```

`TileStepTests.swift`:
```swift
import Testing
@testable import OrionAppCore

struct TileStepTests {
    @Test func clampsAndSteps() {
        #expect(TileStep(index: 2).width == 230)
        #expect(TileStep(index: 9).index == 4)
        #expect(TileStep(index: -1).index == 0)
        #expect(TileStep(index: 4).bigger().index == 4)
        #expect(TileStep(index: 0).smaller().index == 0)
        #expect(TileStep(index: 2).bigger().width == 290)
    }
}
```

`WallNavigationTests.swift`:
```swift
import Testing
@testable import OrionAppCore

struct WallNavigationTests {
    let columns = [[0, 3], [1, 4], [2]]

    @Test func leftRightFollowNewestFirstOrder() {
        #expect(WallNavigation.next(from: 1, direction: .right, columns: columns) == 2)
        #expect(WallNavigation.next(from: 1, direction: .left, columns: columns) == 0)
        #expect(WallNavigation.next(from: 0, direction: .left, columns: columns) == nil)
        #expect(WallNavigation.next(from: 4, direction: .right, columns: columns) == nil)
    }

    @Test func upDownStayInTheColumn() {
        #expect(WallNavigation.next(from: 0, direction: .down, columns: columns) == 3)
        #expect(WallNavigation.next(from: 3, direction: .up, columns: columns) == 0)
        #expect(WallNavigation.next(from: 2, direction: .down, columns: columns) == nil)
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/mac && swift test --filter "MasonryLayoutTests|TileStepTests|WallNavigationTests"`
Expected: FAIL (types are not defined).

- [ ] **Step 3: Implement**

`MasonryLayout.swift`:
```swift
import Foundation

/// Pinterest-style columns. Pure so it is tested without SwiftUI.
public enum MasonryLayout {
    public static func columnCount(width: Double, tileWidth: Double, spacing: Double) -> Int {
        guard width > 0, tileWidth > 0 else { return 1 }
        return max(1, Int((width + spacing) / (tileWidth + spacing)))
    }

    public static func columns(aspectRatios: [Double], count: Int) -> [[Int]] {
        let count = max(1, count)
        var columns = Array(repeating: [Int](), count: count)
        var heights = Array(repeating: 0.0, count: count)
        for (index, ratio) in aspectRatios.enumerated() {
            // Shortest column; ties go to the leftmost so rows read naturally.
            var target = 0
            for column in 1..<count where heights[column] < heights[target] {
                target = column
            }
            columns[target].append(index)
            heights[target] += 1 / max(ratio, 0.05)
        }
        return columns
    }
}
```

`TileStep.swift`:
```swift
import Foundation

/// The five tile sizes behind the slider and ⌘+ / ⌘−.
public struct TileStep: Equatable, Sendable {
    public static let widths: [Double] = [140, 180, 230, 290, 360]
    public static let defaultIndex = 2
    public static let defaultsKey = "inspirationTileStep"

    public let index: Int

    public init(index: Int) {
        self.index = min(max(index, 0), Self.widths.count - 1)
    }

    public var width: Double { Self.widths[index] }
    public func bigger() -> TileStep { TileStep(index: index + 1) }
    public func smaller() -> TileStep { TileStep(index: index - 1) }
}
```

`WallNavigation.swift`:
```swift
import Foundation

public enum WallDirection: Sendable {
    case left, right, up, down
}

public enum WallNavigation {
    public static func next(from current: Int, direction: WallDirection, columns: [[Int]]) -> Int? {
        let total = columns.reduce(0) { $0 + $1.count }
        switch direction {
        case .left:
            return current > 0 ? current - 1 : nil
        case .right:
            return current + 1 < total ? current + 1 : nil
        case .up, .down:
            guard let column = columns.first(where: { $0.contains(current) }),
                  let row = column.firstIndex(of: current) else { return nil }
            let target = direction == .up ? row - 1 : row + 1
            return column.indices.contains(target) ? column[target] : nil
        }
    }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/mac && swift test --filter "MasonryLayoutTests|TileStepTests|WallNavigationTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/OrionAppCore/Inspiration apps/mac/Tests/OrionAppCoreTests
git commit -m "feat(mac): masonry columns, tile sizes and arrow-key navigation for Inspiration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Disk caches — the last library page, and thumbnails

**Files:**
- Create: `apps/mac/Sources/ShelfCore/Library/LibraryCache.swift`, `ThumbnailCache.swift`
- Test: `apps/mac/Tests/ShelfCoreTests/LibraryCacheTests.swift`, `ThumbnailCacheTests.swift`

**Interfaces:**
- Consumes: `LibraryItem`, `LibraryPage`, `LibraryDates` (Task 6); `StubURLProtocol` and `TestImages` (existing test support).
- Produces:
  ```swift
  public struct LibraryCache: Sendable {
      public static var defaultDirectory: URL   // Application Support/Orion/inspiration-cache
      public init(directory: URL = LibraryCache.defaultDirectory)
      public func save(_ items: [LibraryItem]) throws
      public func load() -> [LibraryItem]          // [] if missing or unreadable
  }
  public actor ThumbnailCache {
      public init(directory: URL = LibraryCache.defaultDirectory.appending(path: "thumbnails"), session: URLSession = .shared)
      /// Downsampled image (longest side ≤ maxPixels) from disk, else downloaded, downsampled and stored.
      public func thumbnail(for item: LibraryItem, maxPixels: Int) async -> CGImage?
      /// The full-size file for Quick Look, copy and drag-out (downloaded once into `full/`).
      public func fullImageFile(for item: LibraryItem) async throws -> URL
  }
  ```

- [ ] **Step 1: Write the failing tests**

`LibraryCacheTests.swift`:
```swift
import Foundation
import Testing
@testable import ShelfCore

struct LibraryCacheTests {
    let directory = URL.temporaryDirectory.appending(path: "lib-cache-\(UUID().uuidString)", directoryHint: .isDirectory)

    static func item(_ id: UUID = UUID()) -> LibraryItem {
        LibraryItem(id: id, width: 4, height: 3, mimeType: .png, note: "n", sourceUrl: nil,
                    createdAt: Date(timeIntervalSince1970: 1_794_232_920.123), description: nil,
                    labelState: .pending, rooms: [], imageUrl: URL(string: "https://signed/a"))
    }

    @Test func savesAndLoadsTheLastPage() throws {
        let cache = LibraryCache(directory: directory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let items = [Self.item(), Self.item()]
        try cache.save(items)
        #expect(cache.load() == items)
    }

    @Test func missingOrBrokenCacheIsEmpty() throws {
        let cache = LibraryCache(directory: directory)
        defer { try? FileManager.default.removeItem(at: directory) }
        #expect(cache.load().isEmpty)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("nope".utf8).write(to: directory.appending(path: "library.json"))
        #expect(cache.load().isEmpty)
    }
}
```

`ThumbnailCacheTests.swift`:
```swift
import CoreGraphics
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct ThumbnailCacheTests {
    let host = "thumbs-\(UUID().uuidString.lowercased()).test"
    let directory = URL.temporaryDirectory.appending(path: "thumbs-\(UUID().uuidString)", directoryHint: .isDirectory)

    private func item() -> LibraryItem {
        LibraryItem(id: UUID(), width: 800, height: 400, mimeType: .png, note: nil, sourceUrl: nil,
                    createdAt: .now, description: nil, labelState: .pending, rooms: [],
                    imageUrl: URL(string: "http://\(host)/a.png"))
    }

    @Test func downsamplesOnceThenServesFromDisk() async throws {
        defer { try? FileManager.default.removeItem(at: directory) }
        var downloads = 0
        let png = TestImages.png(width: 800, height: 400)
        StubURLProtocol.register(host: host) { _ in
            downloads += 1
            return (200, png)
        }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        let item = item()
        let first = try #require(await cache.thumbnail(for: item, maxPixels: 200))
        #expect(max(first.width, first.height) <= 200)
        _ = await cache.thumbnail(for: item, maxPixels: 200)
        #expect(downloads == 1)
    }

    @Test func failedDownloadIsNil() async {
        defer { try? FileManager.default.removeItem(at: directory) }
        StubURLProtocol.register(host: host) { _ in (500, Data()) }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        #expect(await cache.thumbnail(for: item(), maxPixels: 200) == nil)
    }

    @Test func fullImageFileKeepsTheExtension() async throws {
        defer { try? FileManager.default.removeItem(at: directory) }
        StubURLProtocol.register(host: host) { _ in (200, TestImages.png(width: 10, height: 10)) }
        let cache = ThumbnailCache(directory: directory, session: StubURLProtocol.session())
        let file = try await cache.fullImageFile(for: item())
        #expect(file.pathExtension == "png")
        #expect(FileManager.default.fileExists(atPath: file.path()))
    }
}
```
(`StubURLProtocol` lives in `Tests/ShelfCoreTests`, so these tests compile in that target. If `TestImages` has no `png(width:height:)`, add one to `Tests/ShelfTestSupport/TestImages.swift` that draws a solid-colour `CGContext` and encodes it with `CGImageDestination` as PNG. If the stub handler can't mutate a captured `var` under Swift 6, count downloads with a `Mutex<Int>` from `Synchronization`.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/mac && swift test --filter "LibraryCacheTests|ThumbnailCacheTests"`
Expected: FAIL (types are not defined).

- [ ] **Step 3: Implement**

`LibraryCache.swift`:
```swift
import Foundation

/// The last list the wall showed, so Inspiration still shows something offline.
public struct LibraryCache: Sendable {
    public static var defaultDirectory: URL {
        URL.applicationSupportDirectory.appending(path: "Orion/inspiration-cache", directoryHint: .isDirectory)
    }

    private let file: URL

    public init(directory: URL = LibraryCache.defaultDirectory) {
        file = directory.appending(path: "library.json")
    }

    public func save(_ items: [LibraryItem]) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try LibraryDates.encoder.encode(items).write(to: file, options: .atomic)
    }

    public func load() -> [LibraryItem] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? LibraryDates.decoder.decode([LibraryItem].self, from: data)) ?? []
    }
}
```

`ThumbnailCache.swift`:
```swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Downloads each image once, keeps a small copy for the wall and the full
/// file for Quick Look / drag-out. Image transforms are a paid Supabase
/// feature, so the Mac does the shrinking.
public actor ThumbnailCache {
    private let directory: URL
    private let session: URLSession

    public init(
        directory: URL = LibraryCache.defaultDirectory.appending(path: "thumbnails", directoryHint: .isDirectory),
        session: URLSession = .shared
    ) {
        self.directory = directory
        self.session = session
    }

    public func thumbnail(for item: LibraryItem, maxPixels: Int) async -> CGImage? {
        let thumbFile = directory.appending(path: "\(item.id.uuidString)-\(maxPixels).png")
        if let image = Self.image(at: thumbFile) { return image }
        guard let full = try? await fullImageFile(for: item),
              let source = CGImageSourceCreateWithURL(full as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        Self.write(thumb, to: thumbFile)
        return thumb
    }

    public func fullImageFile(for item: LibraryItem) async throws -> URL {
        let file = directory.appending(path: "full/inspiration-\(item.id.uuidString.prefix(8).lowercased()).\(item.mimeType.fileExtension)")
        if FileManager.default.fileExists(atPath: file.path()) { return file }
        guard let url = item.imageUrl else { throw URLError(.badURL) }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), !data.isEmpty else {
            throw URLError(.badServerResponse)
        }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        return file
    }

    private static func image(at file: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(file as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private static func write(_ image: CGImage, to file: URL) {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }
}
```
`CGImage` is not `Sendable`. If Swift 6 complains when returning it from the actor, mark the method `nonisolated` and keep the disk I/O inside it (the actor holds no mutable state), or wrap the result in a `struct SendableImage: @unchecked Sendable { let cgImage: CGImage }`. Pick one and use it consistently in Task 10.

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/mac && swift test --filter "LibraryCacheTests|ThumbnailCacheTests"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Library apps/mac/Tests/ShelfCoreTests apps/mac/Tests/ShelfTestSupport
git commit -m "feat(mac): offline library cache and on-Mac thumbnails for Inspiration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: LibraryStore — load, page, offline, optimistic edits

**Files:**
- Create: `apps/mac/Sources/ShelfCore/Library/LibraryStore.swift`
- Test: `apps/mac/Tests/ShelfCoreTests/LibraryStoreTests.swift`

**Interfaces:**
- Consumes: `OrionClient` library methods (Task 6), `LibraryCache` (Task 8), `FakeOrionClient` (Task 6).
- Produces:
  ```swift
  @MainActor @Observable
  public final class LibraryStore {
      public enum Phase: Equatable, Sendable { case idle, loading, loaded, offline, needsConnect }
      public private(set) var items: [LibraryItem]
      public private(set) var phase: Phase
      public private(set) var hasMore: Bool
      public private(set) var errorMessage: String?       // set when an edit fails; UI shows OrionDialog-style error
      public init(client: @escaping @MainActor () -> any OrionClient, token: @escaping @MainActor () -> String?, cache: LibraryCache)
      public var onUnauthorized: (@MainActor () -> Void)?
      public func reload() async
      public func loadMore() async
      @discardableResult public func updateNote(_ id: UUID, to note: String?) async -> Bool
      @discardableResult public func delete(_ ids: Set<UUID>) async -> Bool
      @discardableResult public func addToRoom(_ ids: Set<UUID>, room: ShelfRoom) async -> Bool
      public func rooms() async -> [ShelfRoom]
      public func clearError()
      public var canEdit: Bool   // phase == .loaded
  }
  ```

- [ ] **Step 1: Write the failing tests** `apps/mac/Tests/ShelfCoreTests/LibraryStoreTests.swift`

```swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
final class Flag {
    var value = false
}

@MainActor
struct LibraryStoreTests {
    let directory = URL.temporaryDirectory.appending(path: "store-\(UUID().uuidString)", directoryHint: .isDirectory)

    func item(_ note: String? = nil, id: UUID = UUID()) -> LibraryItem {
        LibraryItem(id: id, width: 4, height: 3, mimeType: .png, note: note, sourceUrl: nil, createdAt: .now,
                    description: nil, labelState: .pending, rooms: [], imageUrl: nil)
    }

    func store(_ client: FakeOrionClient, token: String? = "t") -> LibraryStore {
        LibraryStore(client: { client }, token: { token }, cache: LibraryCache(directory: directory))
    }

    @Test func reloadLoadsAPageAndCachesIt() async {
        let client = FakeOrionClient()
        let first = item()
        await client.setLibraryPages([.success(LibraryPage(items: [first], nextOffset: 100))])
        let store = store(client)
        await store.reload()
        #expect(store.items == [first])
        #expect(store.phase == .loaded)
        #expect(store.hasMore)
        #expect(LibraryCache(directory: directory).load() == [first])
    }

    @Test func loadMoreAppendsTheNextOffset() async {
        let client = FakeOrionClient()
        let (a, b) = (item(), item())
        await client.setLibraryPages([
            .success(LibraryPage(items: [a], nextOffset: 100)),
            .success(LibraryPage(items: [b], nextOffset: nil)),
        ])
        let store = store(client)
        await store.reload()
        await store.loadMore()
        #expect(store.items == [a, b])
        #expect(await client.libraryOffsets == [0, 100])
        #expect(!store.hasMore)
    }

    @Test func offlineFallsBackToTheCache() async throws {
        let cached = item("from cache")
        try LibraryCache(directory: directory).save([cached])
        let client = FakeOrionClient()
        await client.setLibraryPages([.failure(.network)])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .offline)
        #expect(store.items == [cached])
        #expect(!store.canEdit)
    }

    @Test func noTokenNeedsConnect() async {
        let store = store(FakeOrionClient(), token: nil)
        await store.reload()
        #expect(store.phase == .needsConnect)
    }

    @Test func unauthorizedAsksToReconnect() async {
        let client = FakeOrionClient()
        await client.setLibraryPages([.failure(ShelfAPIError(code: .unauthorized, message: "x"))])
        let store = store(client)
        let asked = Flag()
        store.onUnauthorized = { asked.value = true }
        await store.reload()
        #expect(asked.value)
        #expect(store.phase == .needsConnect)
    }

    @Test func noteIsOptimisticAndRollsBackOnFailure() async {
        let client = FakeOrionClient()
        let original = item("old")
        await client.setLibraryPages([.success(LibraryPage(items: [original], nextOffset: nil))])
        await client.setNoteResult(.failure(.network))
        let store = store(client)
        await store.reload()
        let saved = await store.updateNote(original.id, to: "new")
        #expect(!saved)
        #expect(store.items.first?.note == "old")
        #expect(store.errorMessage != nil)
    }

    @Test func noteSuccessKeepsTheServerCopy() async {
        let client = FakeOrionClient()
        let original = item("old")
        var serverCopy = original
        serverCopy.note = "new"
        await client.setLibraryPages([.success(LibraryPage(items: [original], nextOffset: nil))])
        await client.setNoteResult(.success(serverCopy))
        let store = store(client)
        await store.reload()
        #expect(await store.updateNote(original.id, to: "  new  "))
        #expect(store.items.first?.note == "new")
    }

    @Test func deleteRemovesAndRestoresOnFailure() async {
        let client = FakeOrionClient()
        let (a, b) = (item(), item())
        await client.setLibraryPages([.success(LibraryPage(items: [a, b], nextOffset: nil))])
        await client.setDeleteResult(.failure(.network))
        let store = store(client)
        await store.reload()
        #expect(!(await store.delete([a.id])))
        #expect(store.items == [a, b])
        await client.setDeleteResult(.success(LibraryCount(count: 1)))
        #expect(await store.delete([a.id]))
        #expect(store.items == [b])
    }

    @Test func addToRoomTagsTheItems() async {
        let client = FakeOrionClient()
        let a = item()
        let room = ShelfRoom(roomId: UUID(), roomName: "Main", projectName: "Voxecore")
        await client.setLibraryPages([.success(LibraryPage(items: [a], nextOffset: nil))])
        await client.setAddResult(.success(LibraryCount(count: 1)))
        let store = store(client)
        await store.reload()
        #expect(await store.addToRoom([a.id], room: room))
        #expect(store.items.first?.rooms == [room])
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter LibraryStoreTests`
Expected: FAIL (`LibraryStore` is not defined).

- [ ] **Step 3: Implement** `LibraryStore.swift`

```swift
import Foundation
import Observation

/// Everything the Inspiration wall shows and changes. Edits are applied at
/// once and undone if Orion refuses.
@MainActor
@Observable
public final class LibraryStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded, offline, needsConnect
    }

    public private(set) var items: [LibraryItem] = []
    public private(set) var phase: Phase = .idle
    public private(set) var hasMore = false
    public private(set) var errorMessage: String?

    @ObservationIgnored public var onUnauthorized: (@MainActor () -> Void)?
    @ObservationIgnored private let client: @MainActor () -> any OrionClient
    @ObservationIgnored private let token: @MainActor () -> String?
    @ObservationIgnored private let cache: LibraryCache
    @ObservationIgnored private var nextOffset: Int?
    @ObservationIgnored private var isLoadingMore = false

    public init(client: @escaping @MainActor () -> any OrionClient, token: @escaping @MainActor () -> String?, cache: LibraryCache) {
        self.client = client
        self.token = token
        self.cache = cache
    }

    public var canEdit: Bool { phase == .loaded }

    public func clearError() {
        errorMessage = nil
    }

    public func reload() async {
        guard let token = token() else {
            phase = .needsConnect
            if items.isEmpty { items = cache.load() }
            return
        }
        if items.isEmpty { phase = .loading }
        do {
            let page = try await client().library(offset: 0, token: token)
            items = page.items
            nextOffset = page.nextOffset
            hasMore = page.nextOffset != nil
            phase = .loaded
            try? cache.save(items)
        } catch {
            handleLoadFailure(error)
        }
    }

    public func loadMore() async {
        guard phase == .loaded, let offset = nextOffset, !isLoadingMore, let token = token() else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await client().library(offset: offset, token: token)
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            nextOffset = page.nextOffset
            hasMore = page.nextOffset != nil
        } catch {
            handleLoadFailure(error)
        }
    }

    @discardableResult
    public func updateNote(_ id: UUID, to note: String?) async -> Bool {
        guard canEdit, let token = token(), let index = items.firstIndex(where: { $0.id == id }) else { return false }
        let previous = items[index]
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned = (trimmed?.isEmpty ?? true) ? nil : trimmed.map { String($0.prefix(500)) }
        items[index].note = cleaned
        do {
            let saved = try await client().updateNote(itemID: id, note: cleaned, token: token)
            if let current = items.firstIndex(where: { $0.id == id }) { items[current] = saved }
            try? cache.save(items)
            return true
        } catch {
            if let current = items.firstIndex(where: { $0.id == id }) { items[current] = previous }
            fail(error, String(localized: "Your note wasn't saved."))
            return false
        }
    }

    @discardableResult
    public func delete(_ ids: Set<UUID>) async -> Bool {
        guard canEdit, !ids.isEmpty, let token = token() else { return false }
        let previous = items
        items.removeAll { ids.contains($0.id) }
        do {
            _ = try await client().deleteItems(Array(ids), token: token)
            try? cache.save(items)
            return true
        } catch {
            items = previous
            fail(error, String(localized: "Those images weren't deleted."))
            return false
        }
    }

    @discardableResult
    public func addToRoom(_ ids: Set<UUID>, room: ShelfRoom) async -> Bool {
        guard canEdit, !ids.isEmpty, let token = token() else { return false }
        do {
            _ = try await client().addItems(Array(ids), toRoom: room.roomId, token: token)
            for index in items.indices where ids.contains(items[index].id) && !items[index].rooms.contains(room) {
                items[index].rooms.append(room)
            }
            try? cache.save(items)
            return true
        } catch {
            fail(error, String(localized: "Those images weren't added to the chat."))
            return false
        }
    }

    public func rooms() async -> [ShelfRoom] {
        guard let token = token() else { return [] }
        return (try? await client().rooms(token: token)) ?? []
    }

    private func handleLoadFailure(_ error: any Error) {
        if (error as? ShelfAPIError)?.code == .unauthorized {
            phase = .needsConnect
            onUnauthorized?()
            return
        }
        if items.isEmpty { items = cache.load() }
        phase = .offline
    }

    private func fail(_ error: any Error, _ what: String) {
        if (error as? ShelfAPIError)?.code == .unauthorized {
            phase = .needsConnect
            onUnauthorized?()
        }
        let reason = (error as? ShelfAPIError)?.message ?? String(localized: "Orion couldn't be reached.")
        errorMessage = "\(what) \(reason)"
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift test --filter LibraryStoreTests && swift test 2>&1 | grep -E "Test run with|✘"`
Expected: PASS, and the full suite stays green.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Library/LibraryStore.swift apps/mac/Tests/ShelfCoreTests/LibraryStoreTests.swift
git commit -m "feat(mac): LibraryStore with paging, offline cache and optimistic edits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The wall — native screen in the frame

Read `.claude/skills/swiftui-pro/SKILL.md` and its `references/views.md`, `performance.md` and `accessibility.md` before starting.

**Files:**
- Create: `apps/mac/Sources/Orion/Inspiration/InspirationModel.swift`
- Create: `InspirationScreen.swift`, `InspirationWall.swift`, `InspirationTile.swift`, `PendingTile.swift`, `InspirationHeader.swift`, `InspirationStateView.swift` (all in `apps/mac/Sources/Orion/Inspiration/`)
- Modify: `apps/mac/Sources/Orion/Window/OrionRootView.swift`, `apps/mac/Sources/Orion/Window/MainWindowController.swift`, `apps/mac/Sources/Orion/App/AppDelegate.swift`
- Test: `apps/mac/Tests/OrionTests/InspirationModelTests.swift`

**Interfaces:**
- Consumes: `LibraryStore` (Task 9), `ThumbnailCache` (Task 8), `MasonryLayout`, `TileStep`, `WallNavigation` (Task 7), `AppModel.pendingCaptures` / `onUploadsFinished` / `isConnected` / `libraryToken()` / `libraryClient()` / `libraryUnauthorized()` / `capture(_:note:roomID:)` / `captureClipboard()` (Task 5 + existing), `FrameModel.destination` (existing).
- Produces:
  ```swift
  @MainActor @Observable final class InspirationModel {
      let store: LibraryStore
      let thumbnails: ThumbnailCache
      var selection: Set<UUID>
      var anchor: UUID?                  // last plain/⌘ click, for Shift ranges
      var tileStep: TileStep             // persisted in UserDefaults
      var isPanelOpen: Bool { selection.count == 1 }
      var selectedItem: LibraryItem?     // the one item when isPanelOpen
      func click(_ id: UUID, command: Bool, shift: Bool)
      func move(_ direction: WallDirection, columns: [[Int]])
      func clearSelection()
      func selectAll()
      func biggerTiles(); func smallerTiles()
      init(store: LibraryStore, thumbnails: ThumbnailCache, defaults: UserDefaults)
  }
  struct InspirationScreen: View { init(model: InspirationModel, appModel: AppModel, frame: FrameModel, reconnect: @escaping () -> Void) }
  ```

- [ ] **Step 1: Write the failing tests** `apps/mac/Tests/OrionTests/InspirationModelTests.swift`

```swift
import Foundation
import OrionAppCore
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct InspirationModelTests {
    let ids = (0..<4).map { _ in UUID() }

    func model() async -> InspirationModel {
        let client = FakeOrionClient()
        let items = ids.map {
            LibraryItem(id: $0, width: 1, height: 1, mimeType: .png, note: nil, sourceUrl: nil, createdAt: .now,
                        description: nil, labelState: .pending, rooms: [], imageUrl: nil)
        }
        await client.setLibraryPages([.success(LibraryPage(items: items, nextOffset: nil))])
        let directory = URL.temporaryDirectory.appending(path: "insp-\(UUID().uuidString)")
        let store = LibraryStore(client: { client }, token: { "t" }, cache: LibraryCache(directory: directory))
        await store.reload()
        let defaults = UserDefaults(suiteName: "insp-\(UUID().uuidString)")!
        return InspirationModel(store: store, thumbnails: ThumbnailCache(directory: directory), defaults: defaults)
    }

    @Test func plainClickSelectsOneAndOpensThePanel() async {
        let model = await model()
        model.click(ids[1], command: false, shift: false)
        #expect(model.selection == [ids[1]])
        #expect(model.isPanelOpen)
        model.click(ids[1], command: false, shift: false)
        #expect(model.selection.isEmpty)
    }

    @Test func commandTogglesAndShiftSelectsARange() async {
        let model = await model()
        model.click(ids[0], command: false, shift: false)
        model.click(ids[2], command: true, shift: false)
        #expect(model.selection == [ids[0], ids[2]])
        #expect(!model.isPanelOpen)
        model.click(ids[3], command: false, shift: true)
        #expect(model.selection == [ids[2], ids[3]])
    }

    @Test func arrowsMoveASingleSelection() async {
        let model = await model()
        model.click(ids[0], command: false, shift: false)
        model.move(.right, columns: [[0, 2], [1, 3]])
        #expect(model.selection == [ids[1]])
        model.move(.down, columns: [[0, 2], [1, 3]])
        #expect(model.selection == [ids[3]])
    }

    @Test func tileStepPersists() async {
        let model = await model()
        model.biggerTiles()
        #expect(model.tileStep.index == TileStep.defaultIndex + 1)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter InspirationModelTests`
Expected: FAIL (`InspirationModel` is not defined).

- [ ] **Step 3: Implement the model** `InspirationModel.swift`

```swift
import Foundation
import Observation
import OrionAppCore
import ShelfCore

/// Selection, tile size and keyboard movement for the Inspiration wall.
@MainActor
@Observable
final class InspirationModel {
    let store: LibraryStore
    let thumbnails: ThumbnailCache
    var selection: Set<UUID> = []
    var anchor: UUID?
    var tileStep: TileStep {
        didSet { defaults.set(tileStep.index, forKey: TileStep.defaultsKey) }
    }

    var isEditingNote = false

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var didRefreshLinks = false

    init(store: LibraryStore, thumbnails: ThumbnailCache, defaults: UserDefaults = .standard) {
        self.store = store
        self.thumbnails = thumbnails
        self.defaults = defaults
        let saved = defaults.object(forKey: TileStep.defaultsKey) as? Int
        tileStep = TileStep(index: saved ?? TileStep.defaultIndex)
    }

    var isPanelOpen: Bool { selection.count == 1 }

    var selectedItem: LibraryItem? {
        guard isPanelOpen, let id = selection.first else { return nil }
        return store.items.first { $0.id == id }
    }

    func click(_ id: UUID, command: Bool, shift: Bool) {
        let order = store.items.map(\.id)
        if shift, let anchor, let from = order.firstIndex(of: anchor), let to = order.firstIndex(of: id) {
            selection = Set(order[min(from, to)...max(from, to)])
            return
        }
        if command {
            if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
        } else {
            selection = selection == [id] ? [] : [id]
        }
        anchor = id
    }

    /// Arrow keys: with nothing (or several) selected, start at the newest image.
    func move(_ direction: WallDirection, columns: [[Int]]) {
        let order = store.items.map(\.id)
        guard !order.isEmpty else { return }
        let next: Int?
        if selection.count == 1, let id = selection.first, let current = order.firstIndex(of: id) {
            next = WallNavigation.next(from: current, direction: direction, columns: columns)
        } else {
            next = 0
        }
        guard let next, order.indices.contains(next) else { return }
        selection = [order[next]]
        anchor = order[next]
    }

    /// Signed image links expire after an hour; the first failed thumbnail
    /// reloads the list once to get fresh links before tiles show ↻.
    func thumbnailFailed() {
        guard !didRefreshLinks else { return }
        didRefreshLinks = true
        Task { await store.reload() }
    }

    func clearSelection() {
        selection = []
    }

    func selectAll() {
        selection = Set(store.items.map(\.id))
    }

    func biggerTiles() { tileStep = tileStep.bigger() }
    func smallerTiles() { tileStep = tileStep.smaller() }
}
```
(The Shift test expects the range from the last ⌘/plain click anchor, `ids[2]`, to `ids[3]`. That's why `anchor` updates on ⌘-click.)

- [ ] **Step 4: Implement the views**

`InspirationTile.swift`: one image tile.
```swift
import ShelfCore
import SwiftUI

struct InspirationTile: View {
    let item: LibraryItem
    let width: CGFloat
    let isSelected: Bool
    let thumbnails: ThumbnailCache
    let onLoadFailed: () -> Void

    @Environment(\.displayScale) private var displayScale
    @State private var image: CGImage?
    @State private var failed = false
    @State private var isHovering = false

    var body: some View {
        let height = width / max(item.aspectRatio, 0.05)
        ZStack {
            Rectangle().fill(.fill.tertiary)
            if let image {
                Image(decorative: image, scale: displayScale)
                    .resizable()
                    .scaledToFill()
            } else if failed {
                Button("Try again", systemImage: "arrow.clockwise") { Task { await load() } }
                    .labelStyle(.iconOnly)
                    .buttonStyle(.borderless)
            }
        }
        .frame(width: width, height: height)
        .clipShape(.rect(cornerRadius: 10, style: .continuous))
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2.5)
            }
        }
        .scaleEffect(isHovering && !isSelected ? 1.015 : 1)
        .animation(.snappy(duration: 0.15), value: isHovering)
        .onHover { isHovering = $0 }
        .task(id: item.id) { await load() }
        .accessibilityElement()
        .accessibilityLabel(item.note ?? item.description ?? String(localized: "Inspiration image"))
        .accessibilityAddTraits(isSelected ? [.isImage, .isSelected] : .isImage)
    }

    private func load() async {
        failed = false
        let pixels = Int(TileStep.widths.last ?? 360) * Int(displayScale)
        image = await thumbnails.thumbnail(for: item, maxPixels: pixels)
        failed = image == nil
        if failed { onLoadFailed() }
    }
}
```
(Add `import OrionAppCore` and `import OrionDesignSystem`. Adjust for whichever `CGImage` sendability choice Task 8 made.)

`PendingTile.swift`: the local shimmer tile for `RecentCapture` with `itemID == nil`. It shows the capture's `NSImage` thumbnail at 60% opacity, with a moving `LinearGradient` shimmer overlay (`.phaseAnimator`, disabled under Reduce Motion) and the same width and corner radius as `InspirationTile`. Its height comes from the thumbnail's size ratio (1:1 if there's no thumbnail).

`InspirationWall.swift`: the masonry wall.
```swift
import OrionAppCore
import ShelfCore
import SwiftUI

struct InspirationWall: View {
    @Bindable var model: InspirationModel
    let pending: [RecentCapture]
    let onColumns: ([[Int]]) -> Void

    private let spacing: CGFloat = 12

    var body: some View {
        GeometryReader { proxy in
            let usable = proxy.size.width - spacing * 2
            let count = MasonryLayout.columnCount(width: usable, tileWidth: model.tileStep.width, spacing: spacing)
            let tileWidth = (usable - spacing * CGFloat(count - 1)) / CGFloat(count)
            let columns = MasonryLayout.columns(aspectRatios: model.store.items.map(\.aspectRatio), count: count)
            ScrollView {
                VStack(spacing: spacing) {
                    if !pending.isEmpty {
                        HStack(spacing: spacing) {
                            ForEach(pending) { capture in
                                PendingTile(capture: capture, width: tileWidth)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                    HStack(alignment: .top, spacing: spacing) {
                        ForEach(columns.indices, id: \.self) { column in
                            LazyVStack(spacing: spacing) {
                                ForEach(columns[column], id: \.self) { index in
                                    tile(index, width: tileWidth)
                                }
                            }
                            .frame(width: tileWidth)
                        }
                    }
                }
                .padding(spacing)
            }
            .onChange(of: columns, initial: true) { onColumns(columns) }
        }
    }

    @ViewBuilder
    private func tile(_ index: Int, width: CGFloat) -> some View {
        let item = model.store.items[index]
        InspirationTile(
            item: item,
            width: width,
            isSelected: model.selection.contains(item.id),
            thumbnails: model.thumbnails,
            onLoadFailed: { model.thumbnailFailed() }
        )
            .onTapGesture {
                let flags = NSEvent.modifierFlags
                model.click(item.id, command: flags.contains(.command), shift: flags.contains(.shift))
            }
            .onAppear {
                if index >= model.store.items.count - 10 { Task { await model.store.loadMore() } }
            }
    }
}
```
(Reading `NSEvent.modifierFlags` inside a tap gesture is the documented macOS way to get the click modifiers. Keep it in one place, as here.)

`InspirationHeader.swift`: the title "Inspiration" (`.title2.bold()`) on the left. On the right, a `Slider(value:in:step:)` bound to `Double(model.tileStep.index)` from 0 to 4, step 1, with `photo` / `photo.fill` minimum and maximum labels, 120 pt wide, `.controlSize(.small)`, and `.help("Tile size (⌘+ / ⌘−)")`.

`InspirationStateView.swift`: one view for the empty, connecting and reconnect states.
- `.needsConnect` with `appModel.isConnected == false`: `ProgressView` plus "Connecting…". After 8 s it shows the "Reconnect Inspiration" button (`OrionButtonStyle()`), which calls `reconnect`.
- Empty (`.loaded` and no items): `ContentUnavailableView` with `photo.on.rectangle.angled` and the empty-state copy from Global Constraints.
- The offline banner is a one-line `Label("Offline — showing your last saved view.", systemImage: "wifi.slash")` in `.secondary`, shown above the wall when `phase == .offline`.

`InspirationScreen.swift`: composes the pieces.
```swift
import OrionAppCore
import ShelfCore
import SwiftUI

struct InspirationScreen: View {
    @Bindable var model: InspirationModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    @State private var columns: [[Int]] = []

    var body: some View {
        VStack(spacing: 0) {
            InspirationHeader(model: model)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            if model.store.phase == .offline {
                InspirationStateView.offlineBanner
            }
            content
        }
        .task { await model.store.reload() }
        .onChange(of: appModel.isConnected) { _, connected in
            if connected { Task { await model.store.reload() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.store.reload() }
        }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { model.move(.left, columns: columns); return .handled }
        .onKeyPress(.rightArrow) { model.move(.right, columns: columns); return .handled }
        .onKeyPress(.upArrow) { model.move(.up, columns: columns); return .handled }
        .onKeyPress(.downArrow) { model.move(.down, columns: columns); return .handled }
        .onExitCommand { model.clearSelection() }
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle, .loading where model.store.items.isEmpty:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.items.isEmpty:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .loaded where model.store.items.isEmpty && appModel.pendingCaptures.isEmpty:
            InspirationStateView(kind: .empty, reconnect: reconnect)
        default:
            InspirationWall(model: model, pending: appModel.pendingCaptures) { columns = $0 }
        }
    }
}
```
(`InspirationStateView.Kind` is `.connecting` / `.empty`. `offlineBanner` is a `static var` on it.)

Wiring:
- `AppDelegate.applicationDidFinishLaunching`: after `appModel` is ready, build
  ```swift
  let libraryStore = LibraryStore(
      client: { [appModel] in appModel.libraryClient() },
      token: { [appModel] in appModel.libraryToken() },
      cache: LibraryCache(directory: isPreview
          ? LibraryCache.defaultDirectory.deletingLastPathComponent().appending(path: "preview-inspiration-cache")
          : LibraryCache.defaultDirectory)
  )
  libraryStore.onUnauthorized = { [appModel] in appModel.libraryUnauthorized() }
  let inspiration = InspirationModel(store: libraryStore, thumbnails: ThumbnailCache())
  appModel.onUploadsFinished = { Task { await libraryStore.reload() } }
  ```
  Pass `inspiration` and `reconnect: { [weak web] in web?.reload() }` through `MainWindowController(…)` into `OrionRootView`.
- `OrionRootView`: add `let inspiration: InspirationModel`, `let appModel: AppModel`, `let reconnect: () -> Void`. Generalise `showsNativeOverview` into
  ```swift
  private var nativePage: FrameDestination? {
      guard frame.isAvailable, let destination = frame.destination else { return nil }
      return destination == .home || destination == .inspiration ? destination : nil
  }
  ```
  Hide the web view when `nativePage != nil`, and show `OverviewPage(frame:)` for `.home` and `InspirationScreen(model:appModel:frame:reconnect:)` for `.inspiration`.
- `FrameModel.open(.inspiration)` still navigates the web view to `/…/inspiration`. That's fine: the page loads hidden behind the native screen, which keeps the bridge snapshot (and so `destination`) correct. Change nothing there.
- Add `⌘+` / `⌘−` to `FrameCommands` (the View menu): "Bigger Tiles" and "Smaller Tiles". They're enabled only when `frame.destination == .inspiration` and call `inspiration.biggerTiles()` / `smallerTiles()`. Pass `inspiration` into `FrameCommands` the same way `frame` is passed.

- [ ] **Step 5: Run the tests and build**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: all pass.

- [ ] **Step 6: Look at it**

Run `bash apps/mac/scripts/preview.sh` (in the background). Click Inspiration. Drag two images onto the wall: the shimmer tiles should appear, then real tiles after the upload. Capture the window with `screencapture -x -l <windowid> .context/insp-wall.png`; get the id from `CGWindowListCopyWindowInfo` filtered by owner "Orion Preview" and width 1280. Check: no cropping, columns reflow when the window resizes, and the slider changes the column count.

- [ ] **Step 7: Commit**

```bash
git add apps/mac/Sources/Orion apps/mac/Tests/OrionTests/InspirationModelTests.swift
git commit -m "feat(mac): native Inspiration wall in the frame (masonry, tile sizes, offline and connect states)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Side panel, Quick Look and keyboard

**Files:**
- Create: `apps/mac/Sources/Orion/Inspiration/InspirationPanel.swift`
- Modify: `apps/mac/Sources/Orion/Inspiration/InspirationScreen.swift`

**Interfaces:**
- Consumes: `InspirationModel.selectedItem`, `store.updateNote(_:to:)`, `thumbnails.fullImageFile(for:)`, `frame.openTab(_:)` (existing; takes a room id string).
- Produces: `InspirationPanel(item: LibraryItem, model: InspirationModel, frame: FrameModel)`.

- [ ] **Step 1: Implement** `InspirationPanel.swift`

```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Slides in when one image is clicked: your note first, then what Orion noticed.
struct InspirationPanel: View {
    let item: LibraryItem
    @Bindable var model: InspirationModel
    let frame: FrameModel

    @Environment(\.displayScale) private var displayScale
    @Environment(\.openURL) private var openURL
    @State private var note = ""
    @State private var image: CGImage?
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                HStack {
                    Spacer()
                    Button("Close", systemImage: "xmark") { model.clearSelection() }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.borderless)
                        .keyboardShortcut(.cancelAction)
                }
                if let image {
                    Image(decorative: image, scale: displayScale)
                        .resizable()
                        .scaledToFit()
                        .clipShape(.rect(cornerRadius: 10, style: .continuous))
                }
                section("Your note") {
                    TextField("Add a note", text: $note, axis: .vertical)
                        .lineLimit(2...8)
                        .orionDialogField()
                        .disabled(!model.store.canEdit)
                        .onChange(of: note) { scheduleSave() }
                }
                switch item.labelState {
                case .done:
                    if let description = item.description {
                        section("What Orion noticed") {
                            Text(description).foregroundStyle(.secondary)
                        }
                    }
                case .pending:
                    section("What Orion noticed") {
                        Text("Orion is still looking at this…").foregroundStyle(.tertiary)
                    }
                case .skipped:
                    EmptyView()
                }
                if let source = item.sourceURL {
                    section("From") {
                        Link(source.host() ?? source.absoluteString, destination: source)
                            .foregroundStyle(OrionColor.dayBreakBlue.color)
                    }
                }
                section("Saved") {
                    Text(item.createdAt, format: .relative(presentation: .named))
                }
                if !item.rooms.isEmpty {
                    section("Used in") {
                        FlowChips(rooms: item.rooms) { room in
                            frame.openTab(room.roomId.uuidString.lowercased())
                        }
                    }
                }
            }
            .padding(OrionSpacing.md)
        }
        .frame(width: 300)
        .background(.regularMaterial)
        .task(id: item.id) {
            saveTask?.cancel()
            note = item.note ?? ""
            image = await model.thumbnails.thumbnail(for: item, maxPixels: Int(600 * displayScale))
        }
        .onDisappear { flushSave() }
    }

    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            content()
        }
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let id = item.id
        let text = note
        saveTask = Task {
            try? await Task.sleep(for: .seconds(1))
            guard !Task.isCancelled, text != (model.store.items.first { $0.id == id }?.note ?? "") else { return }
            await model.store.updateNote(id, to: text)
        }
    }

    private func flushSave() {
        guard note != (item.note ?? "") else { return }
        saveTask?.cancel()
        let (id, text, store) = (item.id, note, model.store)
        Task { await store.updateNote(id, to: text) }
    }
}
```
`FlowChips` is a small private view in the same file. Its chips are `Button("\(room.roomName) · \(room.projectName)") { onTap(room) }` with `.buttonStyle(OrionButtonStyle(.secondary))`, laid out in a simple wrapping `Layout`, or in a `ViewThatFits`-free `LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))])`. The grid is fine.

The note limit (500) is enforced by the store. Also cap typing with `.onChange(of: note) { if note.count > 500 { note = String(note.prefix(500)) } }`.

- [ ] **Step 2: Wire it into the screen**

In `InspirationScreen.body`, put the wall and the panel in an `HStack(spacing: 0)`:
```swift
            HStack(spacing: 0) {
                content
                if let item = model.selectedItem {
                    Divider()
                    InspirationPanel(item: item, model: model, frame: frame)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(.snappy(duration: 0.2), value: model.isPanelOpen)
```
Add Quick Look: `@State private var previewURL: URL?`; `.quickLookPreview($previewURL)`; and
```swift
        .onKeyPress(.space) {
            guard let item = model.selectedItem else { return .ignored }
            Task { previewURL = try? await model.thumbnails.fullImageFile(for: item) }
            return .handled
        }
```
Ignore Space while the note field is focused. The panel keeps a `@FocusState private var noteFocused: Bool`, applies `.focused($noteFocused)` to the note field, and mirrors it with `.onChange(of: noteFocused) { model.isEditingNote = noteFocused }`. `InspirationModel.isEditingNote` is added in Task 10. The arrow-key handlers also return `.ignored` while `model.isEditingNote` is true.

When the store's `errorMessage` is non-nil, show the shared Orion error. Set `frame.errorMessage = message` (that opens the existing "Orion couldn't do that" alert), then call `store.clearError()`, in `.onChange(of: model.store.errorMessage)`.

- [ ] **Step 3: Build, test, look**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: all pass.
In Orion Preview, check these and save screenshots to `.context/insp-panel.png`:
- clicking a tile opens the panel and clicking it again closes it;
- arrow keys move the panel's image;
- Space opens Quick Look;
- Esc closes the panel;
- a note edit survives a reload.

- [ ] **Step 4: Commit**

```bash
git add apps/mac/Sources/Orion/Inspiration
git commit -m "feat(mac): Inspiration side panel with your note, what Orion noticed, Quick Look and arrow keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Selection bar, Add to Chat, Delete, right-click, drag in/out, paste

**Files:**
- Create: `apps/mac/Sources/Orion/Inspiration/SelectionBar.swift`, `AddToChatDialog.swift`, `DeleteImagesDialog.swift`, `InspirationDragFile.swift`
- Modify: `apps/mac/Sources/Orion/Inspiration/InspirationScreen.swift`, `InspirationWall.swift`, `InspirationModel.swift`

**Interfaces:**
- Consumes: `OrionDialog(title:message:actionTitle:isDestructive:canConfirm:onCancel:onConfirm:content:)` (Task 0); `store.delete(_:)`, `store.addToRoom(_:room:)`, `store.rooms()` (Task 9); `ShelfDropItem` (existing Transferable with `.captured: CapturedImage`); `appModel.capture(_:note:roomID:)`, `appModel.captureClipboard()` (existing).
- Produces: `InspirationModel.dialog: InspirationDialog?` where `enum InspirationDialog: Equatable { case addToChat(Set<UUID>), delete(Set<UUID>) }`, plus `InspirationModel.toast: String?`.

- [ ] **Step 1: Add the dialog state to the model**

In `InspirationModel`:
```swift
    enum Dialog: Equatable {
        case addToChat(Set<UUID>)
        case delete(Set<UUID>)
    }

    var dialog: Dialog?
    var toast: String?

    /// The images an action applies to: the right-clicked one unless it is part of the selection.
    func targets(for id: UUID?) -> Set<UUID> {
        guard let id else { return selection }
        return selection.contains(id) ? selection : [id]
    }
```
Add a test to `InspirationModelTests`:
```swift
    @Test func rightClickTargetsTheSelectionOnlyWhenTheItemIsInIt() async {
        let model = await model()
        model.click(ids[0], command: false, shift: false)
        model.click(ids[1], command: true, shift: false)
        #expect(model.targets(for: ids[1]) == [ids[0], ids[1]])
        #expect(model.targets(for: ids[3]) == [ids[3]])
    }
```
Run `swift test --filter InspirationModelTests` and expect a FAIL; implement; expect a PASS.

- [ ] **Step 2: Implement the dialogs**

`DeleteImagesDialog.swift`:
```swift
import SwiftUI

struct DeleteImagesDialog: View {
    let ids: Set<UUID>
    @Bindable var model: InspirationModel

    var body: some View {
        OrionDialog(
            title: Text(ids.count == 1 ? "Delete this image?" : "Delete \(ids.count) images?"),
            message: Text("They'll be removed from Inspiration and from any chats using them. This can't be undone."),
            actionTitle: "Delete",
            isDestructive: true,
            onCancel: { model.dialog = nil },
            onConfirm: {
                model.dialog = nil
                Task {
                    if await model.store.delete(ids) { model.selection.subtract(ids) }
                }
            }
        ) {
            EmptyView()
        }
    }
}
```

`AddToChatDialog.swift`:
```swift
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct AddToChatDialog: View {
    let ids: Set<UUID>
    @Bindable var model: InspirationModel

    @State private var rooms: [ShelfRoom] = []
    @State private var picked: ShelfRoom?
    @State private var isLoading = true

    var body: some View {
        OrionDialog(
            title: Text("Add to Chat"),
            actionTitle: "Add",
            canConfirm: picked != nil,
            onCancel: { model.dialog = nil },
            onConfirm: add
        ) {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else if rooms.isEmpty {
                Text("No chats yet.").foregroundStyle(.secondary)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        ForEach(Dictionary(grouping: rooms, by: \.projectName).sorted { $0.key < $1.key }, id: \.key) { project, chats in
                            Text(project).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .padding(.top, OrionSpacing.xs)
                            ForEach(chats) { room in
                                Button {
                                    picked = room
                                } label: {
                                    HStack {
                                        Text(room.roomName)
                                        Spacer()
                                        if picked == room { Image(systemName: "checkmark") }
                                    }
                                    .padding(.horizontal, OrionSpacing.sm)
                                    .frame(minHeight: 32)
                                    .background(picked == room ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 8))
                                    .contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .frame(maxHeight: 260)
            }
        }
        .task {
            rooms = await model.store.rooms()
            isLoading = false
        }
    }

    private func add() {
        guard let room = picked else { return }
        model.dialog = nil
        Task {
            if await model.store.addToRoom(ids, room: room) {
                model.toast = String(localized: "Added \(ids.count) images to \(room.roomName) · \(room.projectName)")
                model.selection = []
            }
        }
    }
}
```

`SelectionBar.swift`: a capsule with `.glassEffect(.regular, in: .capsule)` containing `Text("\(count) selected")`, a `Button("Delete")` styled `OrionButtonStyle(.secondary)`, and a `Button("Add to Chat…")` styled `OrionButtonStyle()`. Both buttons are disabled when `!model.store.canEdit`. It sits at the bottom centre with 16 pt padding.

- [ ] **Step 3: Drag out, right-click, drop and paste**

`InspirationDragFile.swift`:
```swift
import CoreTransferable
import ShelfCore
import UniformTypeIdentifiers

/// Dragging a tile out hands over the full-size file.
struct InspirationDragFile: Transferable {
    let item: LibraryItem
    let thumbnails: ThumbnailCache

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(exportedContentType: .image) { file in
            SentTransferredFile(try await file.thumbnails.fullImageFile(for: file.item))
        }
    }
}
```
On each tile in `InspirationWall.tile(_:width:)`:
```swift
            .draggable(InspirationDragFile(item: item, thumbnails: model.thumbnails))
            .contextMenu {
                Button("Add to Chat…") { model.dialog = .addToChat(model.targets(for: item.id)) }
                Button("Copy Image") { copy(item) }
                    .disabled(model.targets(for: item.id).count != 1)
                if let source = item.sourceURL {
                    Button("Open Source Link") { NSWorkspace.shared.open(source) }
                }
                Divider()
                Button("Delete…", role: .destructive) { model.dialog = .delete(model.targets(for: item.id)) }
            }
            .disabled(false)
```
`copy(_:)` loads `fullImageFile` and writes `NSImage(contentsOf:)` to `NSPasteboard.general` after `clearContents()`. Disable Add to Chat and Delete in the menu when `!model.store.canEdit`.

In `InspirationScreen`, add:
```swift
        .dropDestination(for: ShelfDropItem.self) { items, _ in
            let images = items.map(\.captured)
            guard !images.isEmpty else {
                model.toast = String(localized: "Only images can be saved to Inspiration.")
                return false
            }
            Task { await appModel.capture(images, note: nil, roomID: nil) }
            return true
        }
        .onPasteCommand(of: [.image, .fileURL]) { _ in
            Task { await appModel.captureClipboard() }
        }
        .onKeyPress(characters: ["a"], phases: .down) { press in
            guard press.modifiers == .command, !model.isEditingNote else { return .ignored }
            model.selectAll()
            return .handled
        }
```
Overlay the selection bar when `model.selection.count >= 2`. Overlay the dialogs in a full-size `ZStack` with a 0.25 black dim, like `OrionFrameView` does:
```swift
        .overlay {
            if let dialog = model.dialog {
                ZStack {
                    Color.black.opacity(0.25).ignoresSafeArea().contentShape(.rect).onTapGesture {}
                    switch dialog {
                    case .addToChat(let ids): AddToChatDialog(ids: ids, model: model)
                    case .delete(let ids): DeleteImagesDialog(ids: ids, model: model)
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.18), value: model.dialog)
```
Show the toast as a small glass capsule at the bottom. It clears itself after 2.5 s via `.task(id: model.toast)`.

- [ ] **Step 4: Build, test, look**

Run: `cd apps/mac && swift build && swift test 2>&1 | grep -E "Test run with|error:|✘"`
Expected: all pass.
In Orion Preview, check each of these, with screenshots in `.context/insp-*.png`:
- ⌘-click two tiles: the bar shows "2 selected".
- Add to Chat lists "Design Room" under "E2E Project". Adding shows the toast, and the panel's "Used in" shows the chip.
- Delete shows the red dialog and removes the tiles.
- Right-click shows the menu.
- Drag a tile to the Desktop: a full-size `inspiration-xxxxxxxx.png` appears.
- ⌘V an image: a shimmer tile appears, then a real one.
- ⌘A selects all.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/Orion/Inspiration apps/mac/Tests/OrionTests/InspirationModelTests.swift
git commit -m "feat(mac): Inspiration multi-select, Add to Chat, Delete, right-click, drag in/out and paste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Acceptance pass

**Files:**
- Create: `.context/native-inspiration-acceptance.md` (not committed)
- Modify: `apps/mac/README.md` (one line under "Use")

- [ ] **Step 1: Full test runs**

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm --filter @meld/contracts exec vitest run
pnpm --filter web exec vitest run src/features/inspiration src/app/api/shelf
pnpm --filter web exec tsc --noEmit
pnpm check:test-colocation
cd apps/mac && swift test 2>&1 | grep -E "Test run with|✘"
```
Expected: all green. Run the pgTAP files from Task 2 again with the scratch-DB recipe.

- [ ] **Step 2: Manual checklist in Orion Preview** (`bash apps/mac/scripts/preview.sh`)

Record pass/fail and a screenshot path for each item in `.context/native-inspiration-acceptance.md`:
1. Open Inspiration: the wall appears (empty state on first run with demo data).
2. Drag three images of different shapes onto the wall: shimmer tiles appear, then masonry tiles with nothing cropped.
3. ⌘+ / ⌘− and the slider change the column count; the size is remembered after relaunch.
4. Click a tile: the panel shows the note field, "Orion is still looking at this…", Saved, and no "From". Click the same tile again: the panel closes.
5. Type a note and wait 1 s. Relaunch Preview: the note is still there.
6. Arrow keys move the panel's image; Space opens Quick Look; Esc closes the panel.
7. ⌘-click two tiles, then Add to Chat → Design Room: the toast appears and the "Used in" chip shows.
8. Delete one image: the red dialog appears, Return does nothing, a click deletes it.
9. Drag a tile to Finder: the full-size file is created.
10. ⌘V an image from the clipboard: it's saved.
11. Stop the local site (Ctrl+C the preview script's web server, or `kill` the process on port 3107) and switch away from Orion and back: the offline banner shows the cached wall, and edits are disabled.
12. Taste in the sidebar still opens the web page.
13. The real installed Orion's Shelf outbox (`~/Library/Application Support/Orion/shelf-outbox`) did not receive any of the preview's images.

- [ ] **Step 3: README line**

Under "## Use" in `apps/mac/README.md`, add:
`- **Inspiration** is native: click an image for its note and what Orion noticed, ⌘-click to pick several, drag images in or out.`

- [ ] **Step 4: Commit**

```bash
git add apps/mac/README.md
git commit -m "docs(mac): mention the native Inspiration screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
