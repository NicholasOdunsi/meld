# Design Room — sketch and talk your way to a clickable prototype

Date: 2026-08-13
Status: approved design, not yet planned

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

These were settled during brainstorming and are not open questions.

| # | Decision |
|---|---|
| 1 | Both lanes — coded prototype and Figma references — are first-class. |
| 2 | A prototype is an artifact Meld stores and serves. Anyone in the room can open it. It does **not** run on the designer's machine. |
| 3 | The design system enters as an uploaded document. Other sources (GitHub, Figma) come later and produce the same distilled profile. |
| 4 | A prototype is a set of screens wired into a clickable flow. The **screen** is the generation unit. The Define flow seeds which screens exist and how they link. |
| 5 | Sketching and chatting are two halves of one instruction, not two modes. Both ship in v1. |
| 6 | Figma previews use the public oEmbed thumbnail. No Figma OAuth in v1. |
| 7 | One canvas. The `user-flows` surface is relabelled **Canvas** and hosts flows, sketches, and screens together. |
| 8 | Edits regenerate the whole screen from its current version. No patch protocol in v1. |
| 9 | The design-system profile is workspace-level. |
| 10 | Prototypes may run sandboxed JavaScript. The iframe sandbox, not a no-JS rule, is the security control. |

## Surface

### One canvas

`ROOM_SURFACE_LABELS["user-flows"]` becomes **"Canvas"**. The surface key stays
`user-flows` so existing URLs, tests, and broadcast plumbing keep working; only
the label and the contents change.

The canvas is already a multiplayer tldraw room served by the gateway
(`apps/gateway/src/canvas/*` — ticketed sessions, edit/view authority, per-room
sqlite). Sketches and screen frames are shapes in that same document, so
multiplayer sketching, presence, and persistence come free.

Three kinds of content coexist:

- **Flow shapes** — the validated `FlowDocument` graph from Define. These keep
  their existing rules (typed nodes, reachability, PRD binding).
- **Screen frames** — a shape bound to a `design_screen` record. Shows the
  rendered screen once built, a placeholder before that.
- **Loose sketch shapes** — anything else the designer draws. No rules.

Flow shapes and screen frames must remain distinguishable in the document so
the flow's validation and PRD binding are unaffected by free drawing.

### The three canvas controls

**Composer — bottom centre, always present.** One input for both ways of
working:

- Nothing selected: "build a pick-plan screen" → the agent creates a new screen
  frame on the canvas.
- A sketch or screen selected: the selection appears as a chip in the composer,
  and the message is about that screen.

There is no mode switch. Chatting without sketching is simply the case where no
layout accompanies the message.

**▶ Preview prototype — top right.** Runs the whole wired prototype. Each screen
frame also carries a small ▶ on hover to start from that screen. This is where
Figma puts it; the placement is deliberate.

**History — right drawer.** Not a second inbox. It renders the room's existing
conversation. With a screen selected it filters to that screen's messages and
versions; deselected, it shows the whole thread. Conversation and screen
versions are one timeline.

## Design-system profile

Workspace-level. Uploaded once, used by every room.

1. The user uploads a document (markdown or text) describing their design
   system.
2. A `design_profile_distill` task reads it once and produces a **profile**:
   colour roles, type scale, spacing scale, radii, and a component inventory
   with each component's visual rules — plus a CSS token sheet.
3. The profile is visible and editable in workspace settings.
4. Every screen generation is given the profile and the token sheet.

Later sources (a targeted GitHub repo scan, Figma variables) produce the *same*
profile shape, so nothing downstream changes when they land.

**No profile is not a blocker.** With no profile, screens generate against a
neutral default style. The stage never gates on having one.

## Screen generation

### The contract

A new task kind, `design_screen_generate`, joins the existing
`AITaskKindSchema` enum. Its request carries:

- `intent` — the designer's words from the composer (may be empty)
- `layout` — the serialized sketch (may be absent)
- `profile` — the design-system profile and token sheet
- `screen` — name, and the current version when this is an edit
- `links` — the screens this one connects to, from the flow graph
- PRD context, scoped tightly

Its response is one **self-contained screen**: markup, styles, optional
sandboxed script, and a declared list of links (`"Continue" → dashboard`). No
imports, no build step, no external assets.

### Meld assembles, the agent writes screens

The agent never writes navigation code. It returns screen bodies and link
targets; Meld builds the router that wires them. Link integrity is therefore
structural rather than something the model has to get right.

### Sketch → layout, without vision

The connector pipeline is text-only: a context package in, schema-validated
text out. There is no image path to the provider, and this design does not add
one.

Instead, the sketch is **serialized from tldraw shapes into a structured layout
description** — regions, ordering, nesting, relative sizes, and any text the
designer typed on the shapes. This is more reliable than vision for layout
(nothing has to guess what a wobbly rectangle meant) and it fits the existing
pipeline unchanged.

Division of labour: **the sketch says where, the chat says what and why.**

### Edits

"Make the button bigger" regenerates that screen with its current version as
the starting point, returning a whole new screen. Every version is retained,
which gives undo for free and is what the history drawer displays.

Cost control, in order of leverage:

1. **Tight context.** An edit ships the profile, the current screen, and the
   instruction. Not the whole PRD, not the other screens.
2. **A bounded screen size**, so screens cannot grow until every future edit is
   expensive.
3. **Model routing.** Model is already threaded per task at creation time (see
   `create_prd_section_assist_task(..., target_model)`). First generation uses
   the strong model; edits route to a cheaper one.

A patch protocol remains available later without disturbing anything else: the
response envelope can carry a patch instead of a full screen.

## Prototype viewer

### Isolation

The prototype renders in an iframe with `sandbox` and **without**
`allow-same-origin`, placing it on an opaque origin. This is the load-bearing
control: generated code cannot read the user's Meld session, cookies, or local
storage, and cannot call Supabase as them. A strict CSP prevents outbound
network access.

Sandboxed JavaScript is allowed. With no same-origin access and no network,
script inside the frame can only affect its own document, so banning it would
cost most of a prototype's value for almost no safety gain.

When shareable links land (explicitly out of scope for v1), the prototype also
moves to a separate origin — belt and braces — and that change needs its own
security review.

### Assembly

A prototype is the room's screens plus the navigation graph, assembled into one
self-contained document with a small Meld-authored router. It is stored as an
artifact; opening it is a read, not a build.

## Figma lane

Pasting a Figma URL into the room conversation produces a preview card with the
real thumbnail, fetched from Figma's public oEmbed endpoint — no OAuth, no
per-user Figma connection. Tapping the card opens Figma.

- Files without link sharing fall back gracefully to a plain link card.
- The endpoint's behaviour must be verified before the slice is committed to;
  if it does not return usable thumbnails, the lane degrades to link cards and
  the rest of this design is unaffected.
- References are stored as room design references, not as file attachments.

Placing Figma cards onto the canvas beside a sketch is a natural follow-up and
is not in v1.

## Stage readiness

The Design stage checklist in `stage-readiness.ts` is rewired. The current
`design_assets` item counts file attachments, which stops being meaningful.

| Item | Kind | Required | Satisfied by |
|---|---|---|---|
| Screens designed | auto | yes | at least one built screen **or** at least one Figma reference |
| Prototype reviewed | manual | yes | the existing `design_reviewed` confirm |
| Design system connected | auto | **no** | a distilled profile exists |

The existing `flows_refined` item is absorbed: on one canvas, "flows refined"
and "screens designed" are no longer separable, and requiring both would gate
the Figma-only lane on drawing a flow.

`StageReadinessSignals` gains `builtScreenCount` and `designReferenceCount`.
`designAssetCount` remains for the Development handoff summary.

## Handoff to Development

The Development stage receives one bundle: the prototype, the design-system
profile, the PRD, and the flow. Not four scattered artifacts.

## Data model

- **`design_system_profiles`** — workspace-scoped. Source document reference,
  distilled profile JSON, token CSS, timestamps.
- **`design_screens`** — room-scoped. Name, nullable flow node id, state
  (`empty` / `building` / `built`), current version id, canvas shape binding.
- **`design_screen_versions`** — one row per generation. Markup, styles,
  script, links JSON, originating task id, author, timestamp.
- **`design_references`** — room-scoped Figma links. URL, title, thumbnail URL,
  fetched-at.
- **Task kinds** — `design_profile_distill` and `design_screen_generate` added
  to `AITaskKindSchema` and to the room task contract in `rooms.ts`.

All tables follow the existing tenant-isolation and RLS patterns; policies get
pgTAP coverage alongside the existing suite.

## Testing

- **Pure engines get unit tests.** The sketch→layout serializer, the prototype
  assembler and router, the readiness rewiring, and the profile distiller's
  output validation are all pure functions and are tested exhaustively — the
  same approach `stage-readiness.ts` already takes.
- **Contract tests** for the new task kinds and their response envelopes,
  including malformed and oversized responses.
- **Connector integration tests** against the fake provider binaries, matching
  the existing `task-executor.integration.test.ts` pattern.
- **Security tests** proving the prototype frame cannot reach parent storage,
  cookies, or the network. These are non-negotiable for the viewer slice.
- **Playwright**: sketch a screen → build it → open the prototype → click
  through to a second screen. And: paste a Figma link → see a preview card.
- **pgTAP** for the new tables' RLS.

## Scope

**In v1:** design-system profile from a document; sketching and chat on one
canvas; screen generation and editing; the assembled clickable prototype and its
sandboxed viewer; Figma link previews; readiness and handoff rewiring.

**Deliberately not in v1:** shareable public prototype links; GitHub as a design
system source; Figma OAuth, frames-as-images, or variables-as-tokens; Figma
cards on the canvas; a patch protocol for edits; prototypes running on the
designer's machine.

## Suggested plan split

This is too large for one implementation plan. Three plans, in order:

1. **Spine** — profile distillation, `design_screen_generate`, screen storage
   and versioning, prototype assembly and the sandboxed viewer, composer-driven
   generation on the canvas. Chat-only at this point; it is a complete,
   shippable path.
2. **Sketch** — free-form drawing on the canvas, screen frames, the
   shape→layout serializer, selection-aware composer.
3. **Figma previews** — oEmbed cards, design references, readiness wiring.
   Independent of 1 and 2; can be built in parallel by someone else.

Plans 1 and 2 together are what makes the first release land as a design tool
rather than another chat box, which was an explicit requirement.
