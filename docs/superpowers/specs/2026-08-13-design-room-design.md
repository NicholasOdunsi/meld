# Design Room — sketch and talk your way to a clickable prototype

Date: 2026-08-13
Status: product decisions approved; technical contracts below are the design.
A security/architecture spike (slice 0) precedes implementation.

## Problem

Rooms move through Discovery → Define → Design → Development. Discovery and
Define are real: conversation, a multiplayer user-flow canvas, a PRD, captured
decisions. The Design stage is a stub. `stage-readiness.ts` checks three things
— a user flow exists, some files are attached, and a human ticked "Design
reviewed" — and there is no design surface, no notion of a design system, and
no prototype anywhere in the codebase.

Meanwhile the people this stage is for have split into two camps. Some design
in Figma and hand off pictures. Some skip pictures entirely and build in code.
Both camps want the same thing at the end of the stage: something a teammate can
click through, that looks like the product, that a developer can build from.

This design gives the Design stage a real surface: **one canvas where you sketch
screens and talk to an agent, and the agent builds them into a clickable
prototype using your own design system.** Figma links remain first-class for the
teams who work that way.

## What "done" means for the Design stage

Either lane satisfies the stage:

- a built prototype (one or more generated screens), **or**
- Figma references attached to the room.

Neither lane is privileged. A team that only ever pastes Figma links moves
through Design normally.

## Decisions

Settled during brainstorming and review. Not open questions.

| # | Decision |
|---|---|
| 1 | Both lanes — coded prototype and Figma references — are first-class. |
| 2 | A prototype is stored by Meld and openable by anyone in the room through an authenticated read. It does **not** run on the designer's machine. |
| 3 | The design system enters as an uploaded document. Other sources (GitHub, Figma) come later and produce the same distilled profile. |
| 4 | A prototype is a set of screens wired into a clickable flow. The **screen** is the generation unit. The Define flow seeds which screens exist and how they link. |
| 5 | Sketching and chatting are two halves of one instruction, not two modes. Both ship in v1. |
| 6 | Figma previews use the public oEmbed thumbnail. No Figma OAuth in v1. |
| 7 | One canvas. The `user-flows` surface is relabelled **Canvas** and hosts flows, sketches, and screens together. |
| 8 | Edits regenerate the whole screen from its current version. No patch protocol in v1. |
| 9 | The design-system **profile** is workspace-scoped; the **distillation task** is room-scoped (see Task scope). |
| 10 | Generated code never becomes a navigable document. It is stored as data and rendered only into a sandboxed `srcdoc`. |
| 11 | Routing is structural: stable screen IDs and action slots, never mutable names. Meld owns click handling. |
| 12 | The Supabase screen record is authoritative; the canvas shape is a recoverable projection. |
| 13 | The prototype is assembled deterministically on read. Only the Development handoff is snapshotted immutably. |
| 14 | Version promotion is compare-and-swap on `base_version_id`. Losing candidates are retained, never silently discarded. |
| 15 | The model returns validated profile **data**; Meld compiles token CSS deterministically. |
| 16 | Every screen version records the profile version it was built against. |

## Task scope

`ai_tasks.room_id` is `not null` (migration `202607280001`, line 83) and
`AITaskSchema.roomId` is required (`packages/contracts/src/ai.ts`). Every task
in the system is room-scoped.

Rather than generalising the task model — nullable `room_id` plus a scope
column, rippling through RLS, dispatch, gateway hydration, and settlement for
the sake of one task kind — **profile distillation is initiated from a room.**

The design-system document is attached in a room like any other file. The
`design_profile_distill` task is genuinely room-scoped. Its *result* is promoted
to workspace scope, and workspace settings displays and edits the profile from
then on. No synthetic rooms, no task-model refactor.

Adding a task kind touches: `AITaskKindSchema` (`ai.ts`), the `ai_task_kind` SQL
enum, the connector's task executor and prompt modules, transport frames
(`ws.ts`), context hydration, and settlement. It does **not** touch
`RoomProposedActionSchema` in `rooms.ts` — that contract is for agent-*proposed*
actions, and screen generation is user-initiated from the composer.

## Surface

### One canvas

`ROOM_SURFACE_LABELS["user-flows"]` becomes **"Canvas"**. The surface key stays
`user-flows` so existing URLs, tests, and broadcast plumbing keep working; only
the label and the contents change.

**Availability changes.** `getRoomSurfaces` currently emits `user-flows` only
when `hasUserFlow`. That breaks two ways: a chat-created screen in a room with
no flow would have no Canvas tab, and a room with neither would have no canvas
from which to create its first screen. `RoomSurfaceState` gains
`hasDesignScreen` and `stage`, and the Canvas surface appears when
`hasUserFlow || hasDesignScreen || stage is design or later`.

The canvas is already a multiplayer tldraw room served by the gateway
(`apps/gateway/src/canvas/*` — ticketed sessions, edit/view authority, per-room
sqlite). Sketches and screen frames are shapes in that document, so multiplayer
sketching, presence, and persistence come free.

Three kinds of content coexist:

- **Flow shapes** — the validated `FlowDocument` graph from Define, with its
  existing rules (typed nodes, reachability, PRD binding).
- **Screen frames** — a shape projecting a `design_screen` record.
- **Loose sketch shapes** — anything else. No rules. Flow extraction already
  ignores shapes without flow metadata, so these are inert to Define.

### The three canvas controls

**Composer — bottom centre, always present.** One input for both ways of
working. Nothing selected: "build a pick-plan screen" creates a new screen.
A sketch or screen selected: the selection becomes a chip and the message is
about that screen. No mode switch — chatting without sketching is simply the
case where no layout accompanies the message.

**▶ Preview prototype — top right.** Runs the whole wired prototype. Each screen
frame carries a small ▶ on hover to start from that screen.

**History — right drawer.** Renders the room's conversation unified with design
events (see History). With a screen selected it filters to that screen;
deselected, it shows everything.

## Canvas integration contract

The Supabase `design_screens` row is **authoritative**. The tldraw shape is a
**recoverable projection**. Supabase and the gateway's SQLite cannot be written
transactionally together, so no design depends on them agreeing at any instant.

**Representation.** The gateway constructs its schema with the default
`createTLSchema()` (`sqlite-canvas-room.ts`). Introducing a custom shape would
require a schema shared by web and gateway and a migration of existing rooms.
Instead a screen frame is a **built-in `frame` shape carrying
`meta.meldScreenId`**. The record authorizers must permit that meta field.

**Reconciliation**, run when the canvas loads and after any task settles:

- Screen row with no shape → create the shape at the row's stored position.
- Shape whose `meldScreenId` matches no row → orphan; it is marked visually and
  offered for removal. It is never silently deleted.
- Two shapes carrying the same `meldScreenId` (tldraw duplication) → the later
  one is re-bound to a **new** screen row seeded from the source's current
  version. Duplicating a frame duplicates the screen; it never aliases it.
- Deleting a shape soft-deletes the row after confirmation. Deleting a row
  removes the shape on the next reconcile.
- A task settling while the initiator is offline is not a special case: the
  version lands in Supabase and the canvas reconciles when next opened.

**Rendered frames on the canvas are inert.** The screen preview is not a tldraw
shape — it is a DOM overlay anchored to the frame shape's bounds, rendering
markup and styles in an iframe with `sandbox=""` (no `allow-scripts`). This
keeps the synced record a plain built-in `frame` while still showing the screen,
and it means canvas previews cannot execute generated JavaScript. No screenshot
pipeline is required. Slice 0 confirms the overlay tracks camera and shape
movement acceptably; if it does not, the fallback is a stored static image and
the record representation is unaffected.

## Design-system profile

### Scope and versioning

- `design_system_profiles` — workspace-scoped, holds the active version pointer.
- `design_system_profile_versions` — immutable rows: validated profile JSON,
  compiled token CSS, source document reference, author, created_at.
- Every screen version records `profile_version_id`, so a screen always names
  the design system it was built against.

### The contract

The model returns **validated data only**. Meld compiles the token CSS
deterministically from that data — the model never authors the stylesheet.

Bounds, chosen to sit comfortably inside `MAX_RESULT_BYTES` (256 KiB):

| Field | Limit |
|---|---|
| colour roles | ≤ 64 entries, each a name and a CSS colour |
| type steps | ≤ 16 |
| spacing steps | ≤ 16 |
| radii | ≤ 12 |
| components | ≤ 80, each with ≤ 2 KiB of visual rules |
| whole profile | ≤ 64 KiB serialized |

Manual edits in workspace settings are validated against the same schema and
create a new version. The source document is stored in a workspace-scoped
bucket under the same RLS pattern as existing attachments.

**No profile is not a blocker.** With no profile, screens generate against a
neutral default. The stage never gates on having one.

## Screen generation

### Request

`design_screen_generate` carries: `intent` (composer text, may be empty),
`layout` (serialized sketch, may be absent), `profileVersionId`, `screenId`,
`baseVersionId` (absent on first generation), the screen's action slots and
their targets, and tightly scoped PRD context. The whole hydrated package must
fit `MAX_HYDRATED_CONTEXT_BYTES` (512 KiB); an edit ships the profile, the
current screen, and the instruction — not the whole PRD, not other screens.

### Response

```
{
  markup:  string,                                    // ≤ 96 KiB
  styles:  string,                                    // ≤ 32 KiB
  script:  string | null,                             // ≤ 32 KiB
  actions: [{ id, label, targetScreenId | null }]     // ≤ 40
}
```

Script is a **separate field**, never inline in markup, so it can be validated
and injected under Meld's control.

### Structural routing

Markup references actions as `data-meld-action="<id>"`. Meld attaches a single
delegated handler in the prototype harness and maps action IDs to target screen
IDs. Consequences:

- Screen names are display-only. Renaming never affects routing.
- An action with a null target renders and, when clicked, shows a "not built
  yet" affordance rather than doing nothing.
- Screens disconnected from the graph remain reachable from the viewer's screen
  list.
- The initial screen is the screen bound to the flow's start path, falling back
  to the earliest created screen.
- Flow nodes map to screens one-to-one for `action` nodes; `system` and
  `decision` nodes are logic and produce no screen.

### Concurrency, failure, and restore

`design_screens` carries `state` (`empty` / `built`) and a separate
`updating` flag, so "built, with an update running" is representable — a single
`building` state is not.

Promotion is compare-and-swap:

```sql
update design_screens set current_version_id = :new
 where id = :screen and current_version_id is not distinct from :base
```

- Zero rows updated → the base moved on. The result is retained as a **stale
  candidate**, shown in history as "based on an earlier version", and
  restorable. It is never discarded and never silently promoted.
- Task failure or cancellation clears `updating` and records a failure event.
  The current version is untouched.
- **Restore creates a new version** whose content is copied from the restored
  one, based on the current version. History stays append-only; the pointer
  never rewinds.

### Edits

"Make the button bigger" regenerates that screen from its current version.
Cost control, in order of leverage: tight context; the size caps above; and
model routing — model is already threaded per task at creation
(`create_prd_section_assist_task(..., target_model)`), so first generation uses
the strong model and edits route to a cheaper one.

A patch protocol can arrive later without disturbing anything: the response
envelope can carry a patch instead of a full screen.

## Prototype assembly and the security boundary

### Serving model

**Generated markup, styles, and script are stored as row data and are never
written to a storage bucket.** Migration `202608010002` allows `text/html`
attachments served by signed storage URL; a prototype placed there would be
directly navigable and the sandbox would be bypassed by opening the URL. There
is no artifact URL for generated content. The only path to it is an
authenticated read that renders it into a sandboxed `srcdoc`.

### The frame

| Context | Sandbox |
|---|---|
| Prototype viewer | `sandbox="allow-scripts"` — nothing else |
| Canvas frame / thumbnail | `sandbox=""` — inert, no script execution |

`allow-same-origin` is never set, which places the document on an opaque origin:
it cannot read Meld's cookies, storage, or session, and cannot call Supabase as
the user. `allow-top-navigation`, `allow-popups`, `allow-forms`, and
`allow-modals` are never set.

The injected document carries:

```
Content-Security-Policy:
  default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data:; font-src data:; connect-src 'none'; form-action 'none';
  base-uri 'none'; frame-src 'none'; object-src 'none'; child-src 'none'
```

### Sanitisation

Rejected at validation, before storage — not stripped at render time:

`<base>`, `<meta http-equiv>`, `<link>`, `<iframe>`, `<frame>`, `<object>`,
`<embed>`, `<form>`, `<script src>`, any remote URL in any attribute, `import`
and `importScripts`, `Worker` / `SharedWorker` / `ServiceWorker`, and any
navigation API. Images and fonts must be `data:` URIs.

A response violating these is a task failure with a specific error, not a
best-effort clean-up.

### Assembly

The prototype is the room's screens at their current versions plus the action
graph, assembled by Meld into one document with a Meld-authored harness. It is
deterministic and computed on read — there is no build step and therefore no
partial-rebuild state to protect. Only the Development handoff is snapshotted.

### Required tests

Proven, not assumed: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
image beacon, form submission, top-level navigation, `window.parent` and
`window.top` access, cookie and `localStorage` access, and an attempt to reach
any stored artifact by URL. Each must fail. These gate the viewer slice.

## History

The selected-screen timeline cannot be derived from screens and versions alone.
A `design_screen_events` table gives it one deterministic source:

`room_id`, `screen_id` (nullable), `kind` (`message` / `generation_started` /
`version_created` / `version_promoted` / `generation_failed` / `restored` /
`stale_candidate`), `message_id`, `task_id`, `version_id`, `actor`,
`created_at`.

Every generation request additionally persists `screen_id`, `base_version_id`,
the layout/selection snapshot it was built from, and the originating message ID
— so any version can be traced to the exact instruction and sketch that produced
it.

## Figma lane

Pasting a Figma URL into the conversation produces a preview card with a
thumbnail from Figma's public oEmbed endpoint. No OAuth.

Ingestion rules:

- **Host allowlist:** `figma.com` and `www.figma.com` only. Everything else is
  an ordinary link.
- **Normalisation:** lowercase host, strip all query parameters except
  `node-id`, drop fragments. Uniqueness per room is on the normalised URL.
- **Fetch limits:** 5 s timeout, ≤ 64 KiB response, no redirects to
  non-allowlisted hosts.
- **Sanitisation:** title and provider fields are treated as untrusted text.
- **Thumbnails are proxied and cached by Meld,** never hotlinked — hotlinking
  leaks each viewer's IP to Figma and breaks when the URL expires.
- **Refresh:** on demand, plus a 7-day TTL.
- **A valid Figma link counts for readiness even when oEmbed fails.** The lane
  degrades to a plain link card; readiness does not depend on a third party
  being reachable.

The endpoint's behaviour must be verified in slice 0. If it does not return
usable thumbnails, the lane degrades to link cards and nothing else changes.

Placing Figma cards on the canvas beside a sketch is a follow-up, not v1.

## Stage readiness

| Item | Kind | Required | Satisfied by |
|---|---|---|---|
| Screens designed | auto | yes | ≥ 1 built screen **or** ≥ 1 Figma reference |
| Design reviewed | manual | yes | the existing `design_reviewed` check |
| Design system connected | auto | **no** | an active profile version exists |

The manual key and label stay **`design_reviewed` / "Design reviewed"** —
"Prototype reviewed" would be wrong in a Figma-only room.

**Staleness.** `room_stage_checklist_items` holds one permanent row per
confirmed check, with `checked_at`. A review confirmed before later design
changes would otherwise stay green forever. The check is treated as **not done
when `checked_at` is older than the most recent design revision** (the latest of
any screen version and any design reference in the room), and the UI says
"design changed since review". The row is not deleted, so re-confirming is one
tap.

`flows_refined` is absorbed into "Screens designed": on one canvas the two are
not separable, and requiring a flow would gate the Figma-only lane on drawing
one. `StageReadinessSignals` gains `builtScreenCount` and
`designReferenceCount`; `designAssetCount` remains for the Development summary.

## Handoff to Development

Moving to Development writes an immutable `design_handoff_snapshots` row: the
screen-version manifest, start screen ID, `profile_version_id`, PRD revision,
flow document reference, creator, and timestamp. The handoff renders from the
snapshot, so later design edits cannot retroactively change what was handed
over.

## Data model

- **`design_system_profiles`** — workspace-scoped; active version pointer.
- **`design_system_profile_versions`** — immutable; profile JSON, compiled token
  CSS, source document reference, author, timestamps.
- **`design_screens`** — room-scoped; name, nullable flow node ID, `state`,
  `updating`, `current_version_id`, canvas position, soft-delete column.
- **`design_screen_versions`** — immutable; markup, styles, script, actions
  JSON, `base_version_id`, `profile_version_id`, originating task ID, author,
  timestamp, promoted flag.
- **`design_screen_events`** — the unified history feed described above.
- **`design_references`** — room-scoped Figma links; normalised URL, title,
  cached thumbnail reference, fetched_at, oEmbed status.
- **`design_handoff_snapshots`** — immutable handoff manifests.

All follow the existing tenant-isolation and RLS patterns, with pgTAP coverage
alongside the existing suite.

## Testing

- **Security matrix for the prototype frame** — the list under *Required tests*.
  Non-negotiable; gates the viewer slice.
- **Response validation** — every sanitisation rule gets a rejection test, plus
  oversized markup, styles, script, and action counts.
- **Pure engines, exhaustively** — the sketch→layout serializer, the prototype
  assembler and router, the readiness rewiring including staleness, the profile
  schema validator, and the deterministic token-CSS compiler. Same approach
  `stage-readiness.ts` already takes.
- **Concurrency** — two generations racing on one screen: one promotes, one is
  retained as a stale candidate; failure and cancellation leave the current
  version intact; restore appends rather than rewinds.
- **Canvas reconciliation** — orphan shapes, duplicated frames, screens created
  while offline, deletion in both directions.
- **Connector integration** against the fake provider binaries, matching
  `task-executor.integration.test.ts`.
- **Playwright** — sketch a screen, build it, open the prototype, click through
  to a second screen; and paste a Figma link, see a preview card.
- **pgTAP** for the new tables' RLS.

## Scope

**In v1:** design-system profile from a document; sketching and chat on one
canvas; screen generation, editing, and restore; the assembled clickable
prototype and its sandboxed viewer; Figma link previews; readiness and handoff
rewiring.

**Deliberately not in v1:** shareable public prototype links; GitHub as a design
system source; Figma OAuth, frames-as-images, or variables-as-tokens; Figma
cards on the canvas; a patch protocol; prototypes running on the designer's
machine.

## Plan split

Five slices. Foundations are separated from the first user-facing slice so
architectural failures surface early.

0. **Spike** — serving model and sandbox proof, exact schemas and size budgets,
   task scope, the `frame`-shape-with-meta representation against the gateway's
   authorizers, and Figma oEmbed verification. Ends in code that proves the
   boundary, not a document.
1. **Foundations** — migrations and RLS, profile versions, screens and versions
   with CAS promotion, the events table, contracts and limits, and the two task
   kinds threaded through executor, transport, SQL enum, hydration, and
   settlement.
2. **Chat-to-screen vertical slice** — create a screen, generate it, preview it
   safely, regenerate, restore. The first end-to-end path.
3. **Canvas** — projection and reconciliation, sketch serializer,
   selection-aware composer, unified history drawer.
4. **Figma and handoff** — references with ingestion hardening, readiness
   staleness invalidation, immutable handoff snapshot.

Slices 2 and 3 together are what make the release land as a design tool rather
than another chat box, which was an explicit requirement.
