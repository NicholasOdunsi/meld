# Prototype shared layouts — design

Date: 2026-08-15
Status: Approved (concept + rendering), ready for implementation planning

## Problem

Generated prototype screens drift and mis-connect because each screen is
generated in isolation as a full self-contained document. The model only sees
sibling screens as `{key, name}` pairs (`packages/prototype/src/screen-generation-context.ts`),
never their markup, so:

1. **Chrome drifts.** Each screen reinvents its own sidebar/top-bar from tokens
   + component rules. Generated one-at-a-time, sidebars diverge (the "first
   screen's sidebar is different" bug). Generating the whole batch in one model
   response masks it — consistency is a side effect of "same response," not a
   persisted contract.
2. **Nav links orphan.** Every screen re-emits its own nav buttons with
   free-text `targetScreenKey`s. Slugs drift, screens are deleted/regenerated,
   and links dead-end (the orphaned-dashboard bug already fixed at the key layer
   in `202608150011_design_screen_key_claim_displaces.sql`).

## Goal

A **first-class, reusable layout** (app shell / frame) that screens share.
Screens generate only their *content region*; the shell — including its nav —
is authored once per layout and composed around every screen that uses it.

Design principle: **consistent by default, different by intent.** Screens stay
identical unless the user explicitly asks for something different.

Supported behaviors (all confirmed with user):
- Content variation ("3 versions of the worklist") → N screens, same layout.
- Chrome variation ("top-nav version") → a NEW layout; existing screens
  untouched.
- No-shell screen (login, modal, marketing) → screen with no layout.
- Edit the shell ("add a Reports link to the sidebar") → edits the layout;
  every screen using it updates at once.
- Layout assignment is **automatic** from the generation instruction (Option A):
  the model picks/reuses/creates a layout; the user corrects in plain language.

## Non-goals

- No backfill/extraction of shells from existing self-contained screens.
  Existing screens keep working unchanged (see Migration). Forward-only.
- No explicit layout-picker UI in the composer (may be added later as an
  override; YAGNI now).
- No change to the sandbox/CSP or the click-routing harness engine beyond
  merging layout actions into the route table.

## Data model

Layouts mirror the existing screen/version pattern so the code and RLS follow
established conventions.

**`design_layouts`**
- `id uuid pk`, `room_id`, `workspace_id`
- `layout_key text` — slug, `^[a-z][a-z0-9_-]{0,63}$`, unique per live room
  (same shape/constraint story as `design_screens.screen_key`)
- `name text`
- `current_version_id uuid null`
- `created_by`, `created_at`, `deleted_at`
- RLS + grants mirror `design_screens`.

**`design_layout_versions`**
- `id`, `layout_id`, `room_id`, `workspace_id`
- `shell_markup text` — fragment containing **exactly one** `data-meld-slot`
  marker element where content is injected
- `shell_styles text`
- `actions_json jsonb` — the shell's nav actions (`DesignScreenAction[]`, the
  existing shape: `id`, `label`, `targetScreenKey`), authored once
- versioning/promotion columns matching `design_screen_versions`
  (`originating_task_id`, `profile_version_id`, `promoted`, base-version logic)

**`design_screens`**
- add `layout_id uuid null references design_layouts(id)`. Null = standalone
  (opt-out). A screen version's `markup`/`styles`/`actions` now describe only
  the content region when `layout_id` is set.

Bounds: `shell_markup`/`shell_styles` reuse `MAX_SCREEN_MARKUP_BYTES` /
`MAX_SCREEN_STYLES_BYTES`; layout actions reuse `MAX_SCREEN_ACTIONS`.

## Rendering / composition

Location: `packages/prototype/src/prototype-document.ts` and the two readers
(`apps/web/src/features/design/canvas-screen-reader.ts`,
`.../prototype-reader.ts`). The "one togglable `<section>` per screen" model is
unchanged.

- Each screen renders `<section data-meld-screen="id" data-meld-layout="layoutId">`.
  If it has a layout, the layout's `shell_markup` wraps the screen's content:
  the content is injected at `data-meld-slot`. Standalone screens render exactly
  as today.
- **Styles:** shell styles emitted once per distinct layout, scoped
  `[data-meld-layout="id"] { … }`; content styles per screen
  `[data-meld-screen="id"] { … }`. No shell-CSS duplication.
- **Routes:** each screen's route table = **layout actions ∪ content actions**,
  both resolved via the existing `keyToScreenId` map with the existing
  `resolveActionTargets`. Nav in the injected shell resolves identically on
  every screen sharing the layout.
- **Action-id collisions:** on merge, layout action ids are namespaced (e.g.
  `layout:<id>`) and the shell markup's `data-meld-action` refs are rewritten to
  match at composition time, so a content action can never shadow a nav link.
- **Slot contract:** a layout version must contain exactly one `data-meld-slot`;
  validated at materialization. Renderer falls back to standalone rendering if a
  slot is ever missing (defensive; never throws the whole document).

## Generation

Task `design_screen_generate` (`apps/connector/src/tasks/design-screen-generate-prompt.ts`,
schema + `apps/web/src/features/design/design-screen-generation.ts`,
context in `packages/prototype/src/screen-generation-context.ts`).

Per returned screen, the model adds a `layout` decision:
- `{ "reuse": { "layoutKey": "app-shell" } }` — use an existing layout
- `{ "create": { "layoutKey", "name", "shellMarkup", "shellStyles", "actions" } }`
  — define a new layout (shellMarkup MUST contain one `data-meld-slot`)
- `null` — standalone (login/modal/marketing)

`markup`/`styles`/`actions` now describe the **content region** only when a
layout is used.

Prompt rules (added):
- Persistent chrome (sidebar, top bar, app frame) belongs in the layout, not the
  screen. The screen is only what changes between pages.
- Reuse the room's existing layout by key when the screen is part of the same
  app. Create a new layout only for a genuinely different frame. Use `null` for
  screens that have no app chrome.
- The layout's `actions` own the nav links; do not re-emit nav inside content.

Context fed to the model (via `formatScreenGenerationContext`): existing
**layouts** (key, name) + existing screens (key, name) + dangling targets.
Automatic assignment: the context lists every existing live layout; the prompt
instructs the model to reuse an existing layout by key when the screen belongs
to the same app, and to only `create` a new layout when the instruction calls
for a genuinely different frame (or `null` for no-chrome screens). There is no
server-side "primary layout" concept — reuse-vs-create is the model's decision
from the listed layouts + instruction, correctable in plain language.

## Materialization

`materialize_design_screen_generate()` (new migration, `create or replace`)
extends the existing fan-out:
- If a screen carries `create`, resolve-or-create a `design_layouts` row by
  `layout_key` using the **Policy A** claim-and-displace rule already in
  `202608150011` (the generated layout claims its key; a colliding live layout
  yields), then write a `design_layout_versions` row (promote like screens).
- If `reuse`, resolve the layout by key and set the screen's `layout_id`.
- If `null`, leave `layout_id` null.
- Write the screen's content version as today. Validate the slot on any new
  layout version.

Replay-safety, event appends, and `get_design_screen_generation` semantics carry
over unchanged.

## Migration (existing rooms)

Forward-only. `design_screens.layout_id` defaults null; every existing screen
stays standalone with its current full markup and keeps rendering as today. Rooms
adopt layouts naturally as screens are regenerated. No shell extraction. (A
future "extract layout from this screen" action is possible but out of scope.)

## Testing

- **pgtap** (`supabase/tests/`): new `design_layouts` CRUD/RLS; materializer
  fan-out for `create`/`reuse`/`null`; layout-key Policy A collision; slot
  validation. Run via the schema-only scratch-clone recipe (never `db reset` on
  the dev DB): clone as `supabase_admin`, `ALTER DATABASE … SET search_path`,
  run test files with psql.
- **Unit** (`packages/prototype`): composition (slot injection, style scoping,
  action namespacing, route merge), slot-missing fallback, `resolveActionTargets`
  applied to layout actions. Standalone screens render byte-identical to today
  (regression guard).
- **Reader tests** (`apps/web/src/features/design`): readers join layouts and
  produce composed previews; fake path (`e2e-fake`) updated.

## Phasing (for the implementation plan)

1. **Foundation (deterministic, fully testable):** migrations (tables,
   `layout_id`), `@meld/prototype` payload types + composition + route merge,
   readers join + compose, materializer fan-out, pgtap + unit + reader tests.
   Standalone screens unaffected — verifiable end-to-end before touching the
   model.
2. **Generation:** prompt + response schema + generation context so the model
   emits `layout` + content. Golden/one-shot prompt tests where feasible.
3. **(Deferred) Extract-layout helper** for existing rooms — not in this spec.

Build and verify Phase 1 before Phase 2.
