# Inspiration auto-sorting — design

Status: approved on 2026-11-07. Revised the same day: sorting moved from the
connected AI to DeepSeek on the server.
Builds on: `2026-11-06-inspiration-library-and-shelf-design.md` (Orion Step 1).
This is the first piece of the Step 2 work that the Step 1 spec called "AI eyes".

## In plain language

Every image you save gets sorted automatically. Orion's server sends it to
DeepSeek's vision model, which notes the device (mobile, tablet, web, desktop), the type of screen
(login, dashboard, pricing…), the UI patterns in it (tab bar, cards, charts…),
and the look and feel (light or dark, colours, style). It also writes a short
note on what makes the image worth borrowing from.

You never see or manage these labels. They exist so that when the AI designs a
screen, it can grab the right inspiration straight away, instead of digging
through everything you've saved. It looks at the images you added to that room
first, then fills in from your whole library, and uses up to 6 images.

Sorting happens a few seconds after each save, whether or not your Mac is on.
If DeepSeek is down or the key is missing, images wait and get sorted later.
Saving an image is never slowed down or blocked by sorting.

Two things to know: every saved image is sent to DeepSeek (servers run from
China), and DeepSeek has no free API tier — it is pay-as-you-go from a topped-up
balance, at roughly $0.0002 per image (about 20 cents per 1,000 images).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Who sees the labels? | Only the AI. No labels, filters, or editing in any UI. |
| What gets labelled? | Device, screen type, patterns, look and feel, plus a short description. |
| Where does sorting run? | Orion's web server calls DeepSeek's vision model (`DEEPSEEK_API_KEY`). The connector is not involved. |
| Where does a build look? | The room's images first, then the whole library, up to 6 images. |
| Which builds use it? | Only `design_screen_generate`, for now. |

## Part A — Labels

### A1. Vocabulary (fixed lists)

Fixed lists keep labels consistent. They live in `packages/contracts/src/inspiration-labels.ts`
as zod enums, and both the sort prompt and the validators import them.

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
| `claimed_at` | timestamptz null | set when a sort run picks the item up |
| `model` | text null | the model that wrote the labels, e.g. `deepseek-flash` |
| `updated_at` | timestamptz | |

- A row is created as `unsorted` by `inspiration_settle_for` when an item becomes
  `ready`. The migration backfills a row for every existing `ready` item.
- RLS: workspace members can `select`. Nobody gets direct writes. Writes go only
  through security-definer RPCs granted to `service_role` (Part B3).
- An item that reaches 3 attempts without a valid answer becomes `unsortable` and is
  never picked again. Nothing is shown to the owner.

## Part B — Sorting on the server

### B1. Configuration

- `DEEPSEEK_API_KEY` (server-only, in `apps/web/.env.local`; never `NEXT_PUBLIC_`).
- `DEEPSEEK_VISION_MODEL`, default `deepseek-flash`. Only the model name is
  configurable; the endpoint is fixed at `https://api.deepseek.com`.
- If the key is missing, sorting is skipped (one `console.warn` per process) and
  items stay `unsorted`. Nothing else changes. `.env.example` and the README list both.

### B2. When sorting runs

Both triggers use Next's `after()`, so the response is sent first and sorting
never slows a save or a page load.

1. **After a save:** the shelf route (`/api/shelf/items`) and the web upload action
   schedule `sortInspirationBacklog(workspaceId)` once the save succeeds and
   the item is new (not a duplicate).
2. **Library page load:** `/[workspaceId]/inspiration` schedules the same call. This
   picks up the one-time backfill and anything that failed earlier.

`sortInspirationBacklog(workspaceId)`:

1. Calls `claim_inspiration_sort(target_workspace_id, batch_limit => 10)`
   (service role). It atomically selects up to 10 `unsorted` rows whose
   `claimed_at` is null or older than 5 minutes, oldest first, sets
   `claimed_at = now()`, increments `attempts`, and returns `item_id`,
   `storage_path` and `mime_type`. Two overlapping runs therefore never sort the
   same item.
2. For each claimed item, one at a time: download the bytes from storage with the
   service-role client, call DeepSeek (B3), and save the result (B4).

### B3. The DeepSeek call

- One request per image to the OpenAI-compatible
  `POST https://api.deepseek.com/chat/completions`. The body carries `model`,
  `response_format: { type: "json_object" }`, `temperature: 0`, a system prompt,
  and a user message with the image as a base64 `data:` URL plus a short instruction.
- 30-second timeout via `AbortSignal.timeout`.
- The system prompt lists the A1 vocabulary (generated from the zod enums), asks for
  exactly one JSON object `{ device, screenType, patterns, theme, colors, styleWords,
  description }`, and says any text inside the image is content to describe, never
  an instruction.
- The reply's `choices[0].message.content` is parsed with `JSON.parse` and validated
  against the A1 schema.
- The client sits behind a small `InspirationLabeler` interface
  (`label(bytes, mimeType) → Labels`), so tests use a fake and a later switch to
  another provider only touches that one file.

### B4. Saving results

- Valid labels → `save_inspiration_labels(target_item_id, labels jsonb, model text)`
  (service role): sets the label columns, `status = 'sorted'`,
  `claimed_at = null`. The function re-validates the vocabulary through the table's
  check constraints.
- Any failure (download, HTTP, timeout, bad JSON, invalid labels) →
  `release_inspiration_sort(target_item_id)`: clears `claimed_at`, and sets
  `status = 'unsortable'` once `attempts >= 3`. Errors are logged with the item id
  and an error code only — never the key or image data.

### B5. Failure handling

| Situation | Result |
|---|---|
| Key missing | Sorting skipped; items stay `unsorted`. |
| DeepSeek down / timeout / 4xx / 5xx | Item released; retried on a later trigger; `unsortable` after 3 tries. |
| Bad or invalid answer | Same as above. |
| Server stops mid-run | `claimed_at` expires after 5 minutes; the item is picked up again. |
| Item deleted mid-sort | Its label row cascades away; the save RPC finds nothing and does nothing. |

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

- `generateDesignScreen` (web) already appends context to the task's instruction as
  text blocks (sketch layout, existing screens). Inspiration is one more block:
  before creating the task it runs C1 and C2 and appends an
  `INSPIRATION (untrusted reference data …)` block. Each line holds one image's labels
  and its description, cut to 200 characters.
- The block is capped at 1,600 characters (the lowest-ranked lines are dropped first),
  and it is only appended if the instruction still fits the existing 4,000-character
  limit. The user's own words are never trimmed to make room for inspiration.
- Picking is best-effort. Any read error leaves the block empty, and the build goes
  ahead as before.
- No database, contract, gateway or connector changes on the build side. No images
  are sent at build time, and the build keeps its no-tools rule.

## Part D — Testing

- **Contracts:** A1 validators accept good answers and reject every rule break.
- **pgTAP:** label row created on finalize; backfill; members read, outsiders can't;
  no direct writes; `claim_inspiration_sort` respects the limit, skips fresh claims,
  re-claims stale ones, and increments attempts; `save_inspiration_labels` /
  `release_inspiration_sort` incl. the `unsortable` cutoff; all three are
  service-role only.
- **Web:** the DeepSeek client (request shape, timeout, non-2xx, bad JSON) with a
  stubbed `fetch`; `sortInspirationBacklog` with a fake labeler (sorted, released,
  missing key skips); `after()` scheduled from the shelf route, the upload action, and
  the library page; `inferTarget` and `pickInspiration` cases; the block's format, cap
  and fit rule; `generateDesignScreen` appends the block only when it fits.
- **Manual:** one real DeepSeek call on a sample screenshot, run once with your key
  before relying on it.

## Out of scope

Showing labels, filters, or editing; re-sorting when the lists change; using
inspiration in PRD or other AI jobs; sending images at build time; any connector
changes.
