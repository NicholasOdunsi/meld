# Semantic-key prototype linking

**Date:** 2026-08-15
**Status:** Approved for implementation

## Problem

Screens generated in a Design Room don't link to each other, so the "Try"
preview can't navigate. The prior attempt tied navigation to the user-flow graph
(`targetNodeId` → `design_screens.flow_node_id`) plus manual canvas arrows. That
fails for the common case — screens generated ad-hoc via the composer have
`flow_node_id = null`, so nothing resolves — and the manual canvas-arrow fallback
is tedious and fragile (tldraw frame-binding).

The model is fully capable of wiring navigation itself if it can *reference the
other screens*. The fix is to let it: each screen names itself with a semantic
**key**, buttons target other screens by key, and navigation resolves at render
time by matching keys across whatever screens currently exist. This heals forward
references (generate A → B in either order and they connect) and works for
standalone screens with no flow attachment.

## Decisions (from brainstorming)

- **Semantic keys, model-chosen, resolved at render.** A screen declares a
  `screenKey`; buttons carry a `targetScreenKey`; readers match key → screen.
- **Generation returns 1..N screens.** One request yields however many screens
  the prompt implies: "a login screen" → 1; "2 variations of home" → 2 separate
  frames; "the onboarding flow" → several. This covers both incremental ("add a
  screen") and one-shot ("generate several / the whole thing") with one contract.
  Screens still wire up by key, any order.
- **Full replace.** Retire the canvas arrows and the `targetNodeId`/flow-node
  linking entirely. No manual linking surface.
- **Composer is the only surface.** Navigation intent comes from the composer
  instruction plus the existing screens and journey as model context.

## Architecture

### Data model

- `design_screens` gains `screen_key text` — a slug (`^[a-z][a-z0-9_-]{0,63}$`),
  **unique per room among live screens** (partial unique index where
  `deleted_at is null`). Nullable (legacy rows, and screens not yet generated).
- **Stable identity:** `screen_key` is set when a screen's first version
  materializes and **preserved on regeneration** (the materialization keeps an
  existing non-null `screen_key` rather than overwriting it), so inbound links
  survive a rebuild.
- Action contract (`packages/prototype/src/screen-payload.ts`): replace
  `targetNodeId` with **`targetScreenKey`** (slug, nullable, optional). Keep
  `targetScreenId` (the resolved value / legacy). The payload gains a top-level
  **`screenKey`** (slug) — the screen naming itself.

### Generation (multi-screen)

One generation call returns an **array of screens** (1..N), each a full screen
with its own `screenKey`, markup, styles, and actions. The model decides the
count from the prompt. Each returned screen becomes its own `design_screen` +
frame; cross-links between them (and to existing screens) resolve by key.

The **client** composer already has the room's screens and journey; it passes
generation context to the `generateDesignScreen` server action (same mechanism as
the retired steps block), which formats it into the instruction:

- **Existing screens:** `[{ key, name }]` for every live screen in the room that
  has a key — so the model links to real ones and avoids key collisions.
- **Dangling targets:** keys that existing screens' buttons reference but no
  screen currently fulfills — so a new screen can *become* that target.
- **Journey:** the flow document (already derived client-side) for semantics.

Connector (`design-screen-generate-prompt.ts`):
- Response schema: a top-level `screens` array; each item has `screenKey`
  (string), `markup`, `styles`, `script` (null), and `actions` whose target field
  is `targetScreenKey` (`["string","null"]`). Bounded: cap the array length and
  keep the per-response total within `MAX_RESULT_BYTES`; if the request implies
  more screens than fit, the model returns the first batch and the remainder is a
  follow-up generation (surface this to the user, never silently truncate).
- Base rules: give each screen a stable, descriptive `screenKey`; set each
  navigating button's `targetScreenKey` to another screen's key (in this batch,
  an existing screen, or a listed dangling target); never invent a random UUID;
  distinct screens/variations must be separate array items, not stacked inside one
  screen's markup; use the journey + instruction to decide count and targets.

Zod `DesignScreenPayloadSchema` becomes a batch schema (or a per-screen schema
the persistence layer maps over); back-compat tolerant so already-persisted rows
(single screen, `targetScreenId` only, or legacy `targetNodeId`) still parse.

### Persisting a batch

A generation task now materializes **N screens**: for each returned screen,
upsert a `design_screen` by `screen_key` within the room (create if the key is
new, else target the existing screen), write a version, and lay each new screen
out as its own canvas frame (reuse the existing screen-seed/frame-reconcile
placement). All within the one task's settlement, so a batch is atomic.

### Persistence

Materialization trigger (new migration, mirroring
`materialize_design_screen_generate`):
- Store the version's actions with `targetScreenKey`.
- Set `design_screens.screen_key = coalesce(existing screen_key, payload.screenKey)`
  (stable). If the payload key collides with a *different* live screen in the
  room, keep this screen's existing key or fall back to a unique suffixed slug and
  record it — never point two screens at one key.
- Also mirror the `HydratedDesignScreenActionSchema` contract in
  `@meld/contracts` so regeneration hydration accepts `targetScreenKey`
  (the drift that broke regen last time — do not repeat it).

### Resolution (re-keyed, plumbing reused)

- `resolveActionTargets` (`packages/prototype/src/screen-action-resolve.ts`):
  resolve `targetScreenId = keyToScreenId.get(action.targetScreenKey)
  ?? action.targetScreenId ?? null`. Drop the override and node branches.
- Readers (`prototype-reader.ts`, `canvas-screen-reader.ts`): build
  `keyToScreenId` from the room's live screens (`screen_key` → `id`) and resolve
  before assembly. `canvas-screen-reader` reads `screen_key`.
- The routing contract is unchanged — the harness still consumes
  `targetScreenId`. (The harness gains a screen picker; see below.)

### Preview & screen selection

Two fixes so any screen — including unconnected variations/orphans — is viewable
in "Try":

- **Fix the per-frame ▶ button.** `openPreview(screenId)` currently discards the
  id (`void screenId`) and opens the whole-room prototype, so clicking a frame
  shows the default/last screen, not the one clicked. Thread the id through
  (e.g. `?tab=prototype&screen=<id>`); the prototype reader uses it as the
  harness `startScreenId`. Default (no id) = the first built screen.
- **Screen picker in the harness.** Add a Meld-owned selector to
  `buildPrototypeDocument` output — a fixed-position `<select>` listing every
  screen (by name/key) that calls the existing `show(id)` routing function. It is
  Meld-generated chrome (not model output), so it stays within the CSP/sandbox
  rules and makes orphaned screens reachable in the preview. The click-through
  links still work exactly as before; the picker is an additional way to jump.

### Retirement (full replace)

Remove:
- Canvas arrows: `use-screen-link-wiring.ts`, `screen-link-arrow.ts`,
  `design-screen-links.ts`, `action-links-reader.ts` (rows reader), the picker
  UI, and the `screenLinks`/`screenLinksAuthoritative` threading through
  `page.tsx` → `user-flow-trial-tab.tsx` → `user-flow-trial-canvas.tsx`.
- The `design_screen_action_links` table + its RPCs — a new migration `drop`s
  them.
- Flow-node linking: `outgoing-steps.ts` (`downstreamActionSteps`,
  `formatOutgoingStepsForPrompt`) and the `targetNodeId` resolution path.
- "Build next step →" (T1) buttons in `screen-composer.tsx`.

Keep: `flow_node_id` (still used to seed screens from a journey), the read-time
resolution pass, `targetScreenId` on actions, the prototype harness.

## Testing

- `@meld/prototype`: `resolveActionTargets` re-keyed (key-resolve, legacy
  passthrough, unknown → null); the payload schema parses `screenKey` +
  `targetScreenKey` and legacy shapes; a context formatter for existing
  screens/dangling targets.
- Readers: a built screen whose action has `targetScreenKey` pointing at another
  screen's `screen_key` yields a document routing to the right screen; forward
  reference heals (target built later); legacy `targetScreenId` still resolves.
- Connector: response schema is a `screens` array exposing `screenKey` +
  `targetScreenKey`; prompt carries existing screens + dangling targets and tells
  the model to split variations into separate array items.
- Multi-screen persistence: one payload of N screens materializes N
  `design_screen` rows (upserted by key) + N versions + N frames; a single-screen
  request still yields exactly one; a batch is atomic.
- Preview: the ▶ frame button threads the screen id so "Try" opens on that screen
  (regression for the discarded-id bug); the harness picker lists every screen and
  `show(id)` switches to it, including an orphan not reachable by any link.
- DB: pgTAP for `screen_key` (partial unique index, stability on regenerate,
  collision fallback) and the drop of `design_screen_action_links`.
- `@meld/contracts`: hydrated context accepts `targetScreenKey` (regen round-trip).
- Web: composer passes context; removed T1 buttons and arrow wiring don't leave
  dead references; page/tab/canvas typecheck after the threading is removed.

## Scope / YAGNI

- Multi-screen generation is bounded to what fits one model response; larger
  prototypes come in follow-up batches (surfaced, never silently truncated). No
  background multi-pass orchestration in v1.
- No manual link-editing UI (removed).
- No re-keying tool; if the model picks a wrong key, fix via the composer prompt
  and regenerate.
- Legacy screens (no `screen_key`) can't be link *targets* until regenerated —
  acceptable.

## Migration / backward compatibility

- New migrations: add `screen_key` + partial unique index; new materialization
  trigger writing `screen_key` + `targetScreenKey`; drop
  `design_screen_action_links`.
- Persisted actions with only `targetScreenId` (or legacy `targetNodeId`) still
  parse and resolve via the `targetScreenId` fallback (or → null).
