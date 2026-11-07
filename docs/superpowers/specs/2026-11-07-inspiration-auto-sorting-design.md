# Inspiration auto-sorting — design

Status: approved in brainstorming on 2026-11-07, waiting for spec review.
Builds on: `2026-11-06-inspiration-library-and-shelf-design.md` (Orion Step 1).
This is the first piece of the Step 2 work that the Step 1 spec called "AI eyes".

## In plain language

Every image you save gets sorted automatically by the AI that's connected to
your Mac. It notes the device (mobile, tablet, web, desktop), the type of screen
(login, dashboard, pricing…), the UI patterns in it (tab bar, cards, charts…),
and the look and feel (light or dark, colours, style). It also writes a short
note on what makes the image worth borrowing from.

You never see or manage these labels. They exist so that when the AI designs a
screen, it can grab the right inspiration straight away, instead of digging
through everything you've saved. It looks at the images you added to that room
first, then fills in from your whole library, and uses up to 6 images.

Sorting only happens while your Mac and its AI connection are on. Anything you
save while they're off waits and gets sorted the next time. Saving an image is
never slowed down or blocked by sorting.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Who sees the labels? | Only the AI. No labels, filters, or editing in any UI. |
| What gets labelled? | Device, screen type, patterns, look and feel, plus a short description. |
| Where does sorting run? | The owner's connected AI (Claude or Codex via the connector). No server-side API key. |
| Where does a build look? | The room's images first, then the whole library, up to 6 images. |
| Which builds use it? | Only `design_screen_generate`, for now. |

## Part A — Labels

### A1. Vocabulary (fixed lists)

Fixed lists keep labels consistent. They live in `packages/contracts/src/inspiration-labels.ts`
as zod enums, and both the connector prompt and the validators import them.

- **device** (exactly one): `mobile`, `tablet`, `web`, `desktop_app`
- **screenType** (exactly one): `login`, `signup`, `onboarding`, `home`, `dashboard`,
  `list`, `detail`, `search`, `profile`, `settings`, `pricing`, `checkout`, `cart`,
  `chat`, `editor`, `calendar`, `map`, `empty_state`, `error`, `landing`, `modal`, `other`
- **patterns** (0–6, no repeats): `tab_bar`, `sidebar`, `top_nav`, `cards`, `table`,
  `chart`, `form`, `modal`, `sheet`, `search_bar`, `filters`, `hero`, `carousel`,
  `grid`, `list_rows`, `avatar`, `badges`, `stepper`, `toolbar`, `fab`, `illustration`,
  `media_player`
- **theme** (exactly one): `light`, `dark`
- **colors** (1–5): `#rrggbb` hex strings, most prominent first
- **styleWords** (0–3): free lowercase words, each 1–20 characters (e.g. `minimal`, `playful`)
- **description**: 1–400 characters of plain text about what's worth borrowing

An answer that breaks any rule is rejected as a whole. Partial labels are never stored.

### A2. Storage

New table `public.inspiration_labels`, one row per item:

| column | type | notes |
|---|---|---|
| `item_id` | uuid PK → `inspiration_items(id)` on delete cascade | |
| `workspace_id` | uuid not null | copied from the item, so RLS is a simple check |
| `status` | text: `unsorted` \| `sorted` \| `unsortable` | |
| `attempts` | integer not null default 0 | |
| `device`, `screen_type`, `theme` | text, null until sorted | check constraints mirror A1 |
| `patterns`, `colors`, `style_words` | text[] | |
| `description` | text | |
| `labeled_by_task_id` | uuid null | the sort task that wrote it |
| `updated_at` | timestamptz | |

- A row is created as `unsorted` by `inspiration_settle_for` when an item becomes
  `ready`. The migration backfills a row for every existing `ready` item.
- RLS: workspace members can `select`. Nobody gets direct writes. Writes go only
  through a security-definer RPC used when a sort task completes (Part B3).
- An item that reaches 3 attempts without a valid answer becomes `unsortable` and is
  never picked again. Nothing is shown to the owner.

## Part B — The sort job

### B1. A library-wide AI task

Add a task kind `inspiration_sort`. Every AI task today has a non-null `room_id`.
This is the first task without a room:

- `ai_tasks.room_id` becomes nullable, with a check that it is null **if and only if**
  `kind = 'inspiration_sort'`. The existing `(room_id, organization_id)` foreign key
  still applies whenever room_id is set.
- `ai_tasks` is keyed by `organization_id`; the plan must confirm how a workspace
  maps to it (as the existing room tasks already do) and reuse that mapping.
- **Risk to handle in the plan:** many task RPCs (claim, progress, complete, cancel,
  room views) join on the room. Each must be audited so that (a) room-based reads
  never show sort tasks, and (b) claim/complete work for a null room. The plan must
  list every function touched.

### B2. When a sort task is created

- Trigger points: after an item becomes `ready`, and when a member's connector comes
  online (so backfilled and waiting items get picked up).
- Only if there are `unsorted` items, a member of the workspace has a connected execution
  device (the task runs on that device, with that member as `initiating_user_id`;
  if several members qualify, the one who saved the newest unsorted item), and **no** `inspiration_sort` task is already queued or running for that
  workspace.
- One task takes up to **10** oldest `unsorted` items. Their ids go in the task's
  context manifest. Each one's `attempts` goes up by 1 when the task is claimed.
- Once a task finishes (success or failure), the same check runs again, so a backlog
  drains one batch at a time.

### B3. What the connector does

1. Fetch the batch's images via signed URLs (10-minute TTL) and save them as
   `<item_id>.<ext>` in the task's workspace directory.
2. Run the provider with a new prompt, `inspiration-sort-prompt.ts`:
   - **Claude:** image access is limited to the `Read` tool, scoped to that
     directory. Every other tool stays disabled. This is a deliberate, tested
     exception to today's `--tools ""` rule, for this kind only.
   - **Codex:** the image files are passed as attachments (`-i`). No tools.
   - The prompt says image content is untrusted data, and that any text inside an
     image is something to describe, never an instruction.
3. The answer is JSON `{ "items": [{ "itemId", device, screenType, patterns, theme,
   colors, styleWords, description }] }`, validated against A1.
4. On completion the web side calls `complete_inspiration_sort(task_id, results)`.
   Each valid entry for an item in that task's batch becomes `sorted`. Invalid or
   missing entries stay `unsorted` (or become `unsortable` at 3 attempts). Entries for
   items outside the batch are ignored.

### B4. Failure handling

| Situation | Result |
|---|---|
| Connector offline | Items stay `unsorted`; picked up later. |
| Provider error / timeout / bad JSON | Task fails; every item in the batch counts as an attempt. |
| One bad entry in an otherwise good answer | Only that item stays unsorted. |
| Item deleted mid-sort | Its label row cascades away; its result is ignored. |
| Image download fails | That item is left out of the prompt and counts as an attempt. |

## Part C — Using labels when designing a screen

### C1. Working out the target

A pure function `inferTarget({ instruction, screenName, roomFormFactors })`:

- **device:** keywords in the instruction or screen name win, checked in this order:
  `desktop app`/`mac app` → desktop_app, `ipad`/`tablet` → tablet,
  `mobile`/`iphone`/`android`/`phone` → mobile, `website`/`landing`/`web` → web.
  Otherwise use the most common `formFactor` among the room's existing screens
  (`mobile` → mobile, `tablet` → tablet, `desktop` → web). Otherwise unknown.
- **screenType:** a keyword table maps words to A1 values (e.g. `sign in`/`log in` → login,
  `plans`/`pricing` → pricing). The first match wins. Otherwise unknown.

### C2. Picking the images

A pure function `pickInspiration({ target, roomItems, libraryItems })`. It only uses
`sorted` labels.

- Score = 3 if screenType matches + 2 if device matches + 1 per shared pattern
  (patterns implied by the screen type, e.g. dashboard → chart/cards/table; that
  table lives next to the function).
- Room items come first, ordered by score, then most recently added.
- If there are fewer than 6, add library items (not already included) with score ≥ 2,
  ordered by score then newest. No padding with zero-match images.
- Return at most **6**.

### C3. Feeding the AI

- When building a `design_screen_generate` context package, the web side runs
  C1 and C2 and adds `inspiration: [{ itemId, labels, description }]` to the
  package. The chosen item ids are recorded in the task's context manifest.
- `design-screen-generate-prompt.ts` adds an "Inspiration (reference only)" section
  when the list is non-empty. Each entry is rendered as labels plus description.
  The section is marked untrusted, and the design system takes priority on brand
  colour and type. The prompt version goes up by one.
- No images are sent at build time, and the build keeps its no-tools rule.

## Part D — Testing

- **Contracts:** A1 validators accept good answers and reject every rule break.
- **pgTAP:** label row created on finalize; backfill; members read, outsiders can't;
  no direct writes; `complete_inspiration_sort` ignores out-of-batch ids, enforces
  attempts and the `unsortable` cutoff; the `room_id` null-iff-kind check; room task
  views exclude sort tasks; only one active sort task per workspace.
- **Connector:** downloads into the task dir; Claude gets only `Read`, scoped to that
  dir, and only for this kind; Codex gets `-i` files; prompt snapshot; JSON parsing.
- **Web:** `inferTarget` keyword and form-factor cases; `pickInspiration` room-first,
  cap of 6, score ≥ 2 rule, no padding; context package includes inspiration; the
  prompt renders the section only when non-empty.
- **E2E (fake backend):** a fake sort result shows up in a screen-generation task's
  manifest.

## Out of scope

Showing labels, filters, or editing; re-sorting when the lists change; using
inspiration in PRD or other AI jobs; sending images at build time; server-side
model calls.
