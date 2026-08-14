# Screen-to-screen connections (clickable prototype navigation)

**Date:** 2026-08-14
**Status:** Approved for implementation

## Problem

A generated screen's navigation buttons never link to another screen, so the
"Try" prototype preview cannot navigate. Root cause: the generator returns each
action's `targetScreenId`, but its context contains only the current screen — no
sibling screen IDs and no flow-node → screen map — so it always returns `null`
(or a hallucinated UUID that matches nothing). Nothing post-generation wires the
links either. The preview harness (`prototype-document.ts`) is already capable of
navigating (`routes[screenId][actionId] = targetScreenId`); only the target data
is missing.

## Decisions (from brainstorming)

- **A — flow edges are the source of truth.** The journey graph already exists:
  each screen is pinned to a flow `action` node (`design_screens.flow_node_id`),
  and canvas edges connect those nodes.
- **A1 — the generator tags each button with the journey step it leads to.** We
  hand the model the outgoing steps of this screen's node; it returns each nav
  action tagged with a `targetNodeId`. Meld resolves node → screen. The model
  never invents UUIDs.
- **C2a — manual override via canvas arrows.** Draw a tldraw arrow from frame A
  to frame B; on drop, a picker lists A's nav buttons (auto-picks if only one);
  the chosen button is linked to B. A manual link **overrides** A1.
- **T1 — "Build next step →" from the selected screen.** With a screen selected,
  the composer offers a button per downstream step to generate that step's
  (already-seeded) screen.

## Architecture

### Data model

Persisted action shape in `design_screen_versions.actions_json` becomes:

```
{ id: string, label: string, targetNodeId: string | null }
```

`targetNodeId` is the flow node the button leads to (set by A1). Legacy rows
carrying `{ id, label, targetScreenId }` still parse and are treated as
already-resolved (see resolution).

New table for manual overrides, kept **separate from versions** so overriding a
link neither spawns a content version nor is lost on regeneration:

```
design_screen_action_links (
  screen_id   uuid  references design_screens(id) on delete cascade,
  action_id   text,
  target_screen_id uuid references design_screens(id) on delete cascade,
  primary key (screen_id, action_id)
)
```

RPCs (security definer, room-edit gated):
- `set_design_screen_action_link(screen_id, action_id, target_screen_id)` — upsert.
- `clear_design_screen_action_link(screen_id, action_id)` — delete (arrow removed).
- Overrides are read as part of the room screen reads (below).

### Resolution (in the readers, not the harness)

The harness contract is unchanged. Readers compute a concrete `targetScreenId`
per action before assembly:

```
effectiveTarget(action) =
    manualOverride[screen_id][action_id]     // C2a wins
 ?? nodeToScreen[action.targetNodeId]        // A1 auto-resolve
 ?? action.targetScreenId                    // legacy already-resolved
 ?? null                                     // unresolved
```

`nodeToScreen` is built from the room's `design_screens` (`id`, `flow_node_id`).
Unknown `targetNodeId` resolves to `null` (no strict validation needed — an
unresolved link is a legal state). Resolution lives in a pure helper in
`@meld/prototype` (`resolveActionTargets`) consumed by both:
- `prototype-reader.ts` (full-screen preview), and
- `canvas-screen-reader.ts` (canvas overlay).

Both fetch the room's screens + the override table, resolve, and pass resolved
actions into `assembleValidatedPrototype`.

### Generator (A1)

The **client** already derives the flow from canvas shapes
(`flowDocumentFromShapes`). When generating screen A it computes A's node's
downstream steps and passes them to the `generateDesignScreen` server action,
which embeds them in the instruction (same pattern as the sketch layout via
`combineInstructionWithLayout`). This avoids changing the security-definer
`hydrate_authorized_room_context` RPC.

- New prototype helper `formatOutgoingStepsForPrompt(steps)` +
  `OutgoingStepsSchema` (`[{ nodeId, label }]`).
- "Downstream steps" = for each outgoing edge from A's node, follow through
  non-`action` nodes (system/decision) to the first `action` node(s); collect
  `{ nodeId, label }` (label from edge, else target node). Bounded traversal,
  deterministic, de-duplicated.
- Prompt (`design-screen-generate-prompt.ts`): instruct the model to set each
  navigating action's `targetNodeId` to one of the supplied step node ids, or
  `null` if it does not navigate.
- Response schema: `targetScreenId` → `targetNodeId: { type: ["string","null"] }`.
- `DesignScreenActionSchema` (zod, in `screen-payload.ts`): `targetScreenId` →
  `targetNodeId`, with a back-compat union so already-persisted rows parse.

### Composer "Build next step →" (T1)

`screen-composer.tsx`, when a screen is selected: compute the selected screen
node's downstream steps from the flow; render a "Build <label> →" button per
step. Clicking targets that step's screen (seeded empty frame; create if
missing) and runs generation with the current prompt. The inbound link from A is
established when **A** was generated with `targetNodeId` pointing at that node, so
no extra wiring is needed here.

### Manual override — canvas arrows (C2a)

In `user-flow-trial-canvas.tsx` / overlay layer:
- Detect a tldraw arrow whose start and end bind to two screen frames
  (`meta.meldScreenId`).
- On completion, show a small popover picker of the source screen's nav actions
  (from its current version's `actions_json`), labelled; auto-pick if exactly one.
- On pick: call `set_design_screen_action_link(sourceScreenId, actionId,
  targetScreenId)`; tag the arrow shape `meta` with `{ meldLink: { sourceScreenId,
  actionId, targetScreenId } }`.
- Deleting such an arrow calls `clear_design_screen_action_link`.
- Existing manual links render as arrows between frames on load (reconcile from
  the override table, mirroring `screen-frame-reconcile`).

## Testing

- `@meld/prototype`: unit tests for `resolveActionTargets` (override wins,
  node-resolve, legacy passthrough, unknown → null), `formatOutgoingStepsForPrompt`,
  and downstream-step traversal (skip logic nodes, branch fan-out, cycle guard).
- Readers: resolution wired, overrides applied, legacy rows unaffected.
- Connector: prompt contains supplied steps; schema exposes `targetNodeId`.
- DB: pgTAP for the new table + RPCs (edit-gated, cascade, upsert/clear).
- Web: composer renders a build button per downstream step and targets the right
  screen; canvas arrow between two frames opens the picker and persists a link;
  removing the arrow clears it.

## Scope / YAGNI

- No multi-select or bulk relink UI; one arrow = one button → one screen.
- No re-tagging of inbound links on flow edits in v1 — regenerate A or draw an
  arrow to update. (A future flow-edit reconciler can re-run A1 tags.)
- Terminal/`end` nodes and logic nodes are never navigation targets themselves;
  traversal resolves through them to the next `action` node.

## Out of scope (tracked separately)

- Canvas overlay not receiving `tokenCss` (latent; only bites once a design
  system is connected) — separate mechanical fix.
