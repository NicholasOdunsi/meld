# The Room — a freeform canvas

**Date:** 2026-08-20
**Status:** Approved design, ready for an implementation plan
**Replaces:** `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx` and
the six-surface tab strip around it
**Companion to:** `2026-08-20-workspace-deck-design.md` (the Deck is where you
click a project; this is what opens)

---

## Read this part first

Today a Room is a document viewer. You land on Conversation, and a strip of tabs
above it decides what you are allowed to see: Canvas appears once a user flow
exists, PRD appears once a PRD exists, Prototype appears once you have reached
the Design stage. A floating pill tells you you are 3 of 4 ready to advance. The
product decides the order; you follow it.

The new Room decides nothing. It opens **empty** — a plane, a small toolbar, and
a place to talk.

Three bands, top to bottom:

**The tab strip.** Like a browser. `Overview` first, then tabs named after the
work — `Checkout`, `Empty states` — then a `+` to start another. Who is in the
Room shows on the right, with a green pip for who is live right now.

**The plane.** The work surface. A small toolbar floats at its top-left holding
three tools: **Canvas**, **Prototype**, **PRD**. Tap one and it opens. Drag one
and you choose where it lands — the target lights up in blue as you drag over
it. Up to four things open at once. The toolbar collapses to icons when you want
the room back.

**The dock.** A single line at the bottom where you and your teammates talk, and
where you tell the agents what to do. It is the same conversation on every tab.
Type "update the name in the PRD" and it goes to the PRD. Type "make a design
like the one we have today" and a screen gets built. You do not aim it at
anything; it works out where you mean.

That is the whole product. Nothing is gated, nothing is sequenced, nothing is
hidden until you have earned it.

### The five calls this design makes

1. **Things snap into place — they do not float freely.** When you drag a tool
   onto the plane, a *region* lights up, and the pane fills that region exactly.
   Panes never overlap, never need resizing, and never get lost behind each
   other. One pane fills the plane; two split it; four make quadrants.
2. **Chat is not one of the tools.** The dock is always there, so a Chat pane
   would be a second window onto a conversation already on screen — and it would
   spend one of your four slots doing it. Want more room to read? The dock
   expands upward.
3. **One conversation for the whole Room.** Not one per tab. A teammate must
   never miss a question because they were standing in a different tab.
4. **Overview builds itself.** You never place it. Once the Room has real
   content, an `Overview` tab appears, pinned first, and it is what a new
   teammate lands on. **Decisions live inside it** — there is no Decisions tab.
5. **The stage coach is retired from the Room.** The Discovery → Define → Design
   → Development ladder, the readiness ring, the checklist pill: all removed
   from the screen. The whole point of this rebuild is not telling people how to
   work. **Nothing is deleted from the database** — `stage-readiness.ts`, the
   `room_stage_checklist` migration and the `set_room_checklist_item` RPC stay
   exactly where they are, so this can return as an Overview section if it is
   missed.

### What survives untouched

The parts that already work are reused whole, not rewritten:

- **The conversation** — `Conversation`, its message list, agent sprite avatars,
  Markdown, citations, agent task state, proposed actions, `@`-mentions of
  Product / Research / Design. **Agents and humans reply exactly as they do
  today.** The dock is a new frame around this component, not new message UI.
- **`PrdChangeEvent`** — already renders an applied agent edit as one compact
  line with a diff disclosure rather than a chat bubble. That is the "it went to
  the right place" signal, and it already exists.
- The canvas, the prototype viewer, the PRD document, all three agents, the
  whole `prd_proposals` → `apply_prd_proposal` → `prd_change` path.

---

## Brand and components — non-negotiable

Everything below obeys `apps/web/src/ui/meld/COMPONENTS.md` and
`apps/web/src/ui/meld/tokens.css`. Those two files *are* the brand guide as far
as this work is concerned. The rules that bite hardest here:

1. **Tokens only.** `tokens.css` is the only file permitted a literal hex or
   `px`. Enforced by `scripts/check-astryx-conventions.mjs`.
2. **Primitives own their markup.** New raw `<div>` / `<button>` markup belongs
   in `apps/web/src/ui/meld/`. Feature code under `features/rooms/` composes
   those primitives and must not hand-roll elements.
3. **Flat. No offset shadows. Nothing protrudes off the page.** Depth comes from
   colour and the pixel notch, never elevation. *The mockups shown during
   brainstorming used a 3px offset shadow on the toolbar and panes. That was
   wrong and does not ship.* A pane reads as raised because it is white on the
   `--meld-surface-wash` dot field with an ink edge — nothing more.
4. **The pixel corner is the signature.** `clip-path: var(--meld-pixel-corner)`.
   Two traps: `clip-path` erases `outline`, so focus rings must be **inset
   box-shadow**; and a border does not follow the staircase, so a visible edge
   needs the **frame-layer technique** — a filled clipped parent with
   `padding: var(--meld-pixel-step)` wrapping a second clipped element, exactly
   as `MeldTextInput` does.
5. **Sky Blue is the accent, reached through roles** — `--meld-accent`,
   `--meld-accent-hover`, `--meld-text-on-accent`. Never the raw `--meld-sky`
   pigment at a call site.
6. **Pixelify Sans for small metadata, labels and status only.** Never body
   copy, never titles. Archivo everywhere legible.
7. **`data-*` attributes are the test surface.** Hashed CSS-module class names
   cannot be targeted; every new primitive reflects its variant and state as
   `data-*`.
8. **Update `COMPONENTS.md` in the same change** that adds a primitive.

Astryx components (`@astryxdesign/core/*`) remain in use inside the surviving
feature components — the conversation, the PRD document, the prototype viewer.
Do not rewrite those to Meld primitives as part of this work; that is a separate
migration.

---

## The surface

### Route

`/{workspaceId}/rooms/{roomId}` stays. The `?tab=` search param changes meaning:
it no longer names a *surface* (`conversation`, `prd`, …) but a **tab id**, plus
`?tab=overview` for the generated tab. Old links carrying a surface name
(`?tab=prd`) are resolved for one release: an unrecognised value that matches a
known tool name opens a fresh tab containing just that tool, then rewrites the
URL. Anything else falls back to the first tab.

### Band 1 — the tab strip

Full width, sits directly under the app chrome, `--meld-surface` with a
`--meld-line-strong` bottom edge.

| Element | Behaviour |
| --- | --- |
| `Overview` tab | Always first, always present once the Room qualifies. Cannot be renamed, reordered, or closed. Accent-outlined so it reads as generated, not placed. |
| Workstream tabs | Named after the work. Created untitled; renamed by double-click. Reorderable by drag. Closable. |
| `+` | Opens a new untitled tab with an empty plane. **A tool dragged onto `+` opens a new tab containing that tool.** |
| Presence | Right-aligned avatar squares for the Room's participants, with a green status pixel for whoever is live. Uses `MeldAvatar` and `MeldStatusPixel`. |

**Presence is the one genuinely new capability in this band.** Participants are
already known; *liveness* is not tracked anywhere today. It rides Supabase
Realtime presence on the existing private `room:${roomId}` channel that
`use-room-surface-realtime.ts` already opens — no new channel, no new table, no
writes. If presence fails to connect, the avatars still render and simply none
of them show a pip; the strip must never depend on it.

A tab is a **named slice of the work that holds a pane layout**. It scopes panes
and nothing else — not conversation, not permissions, not agent context.

Tabs are **room-level and shared**. Two people in the same Room see the same
tabs. A tab someone else adds appears for you without a reload.

### Band 2 — the plane

`--meld-surface-wash` with the dot field on the 24px grid, matching
`MeldDeckFrame` and `MeldPixelField`.

**The toolbar** floats at the plane's top-left, inset on the grid. It is a
Meld primitive, `MeldToolbar`:

- Vertical list of rows: pixel icon + Archivo label.
- **Three row states, and they are distinct.** A tool with no pane in this tab is
  `idle`. A tool with a pane open is `open` — an `--meld-accent` pip on the row.
  The tool owning the **focused** pane is `active` — a `--meld-text` fill with a
  `--meld-white` label, clipped to the pixel corner, **not** a rounded pill. All
  three reflect as `data-state`.
- **One pane per tool per tab.** Pressing a tool that is already open focuses its
  existing pane rather than adding a second copy. Two PRD panes side by side
  would be two windows onto one document — the pop-to-new-tab control is how you
  get a second view of the same thing.
- `«` collapses to icons only; `»` restores. The plane reclaims the width; panes
  reflow. Collapsed state persists per user in `localStorage` — it is a personal
  preference, not shared Room state.
- Rows are draggable. Pressing one places the tool; dragging one lets you choose
  where.
- Edge via the frame-layer technique. No shadow.

Three tools ship: **Canvas**, **Prototype**, **PRD**. Their icons come from
`@/ui/pixel-icons` — `PixelPaintBrush`, `PixelCode`, `PixelClipboard`, matching
what the old tab strip already used, so the iconography does not change under
people.

**Panes** are `MeldPane` — a Meld primitive with a title bar (tool name in
Pixelify small-caps, a close control, and a "pop to new tab" control) and a
content slot. White surface, ink edge via frame layer, pixel corner, flat.

### Band 3 — the dock

`MeldDock`, pinned to the bottom of the plane, spanning from the toolbar's right
edge to the plane's right edge.

- **At rest:** one composer line. `meld ▸ message or ask…`, styled as
  `MeldConsoleSearch` already is on the Deck, so the Room and the Deck share one
  way of talking to the product.
- **Expanded:** grows upward over the plane to a maximum of 60% of plane height,
  showing the existing `Conversation`. Panes do not reflow — the dock overlays
  them and the plane dims very slightly beneath. Collapse returns to one line.
- Expands automatically on a new incoming message when at rest, unless the user
  collapsed it in the last 30 seconds.
- **One conversation per Room.** Switching tabs does not change it.
- Collapsed/expanded is per-user `localStorage`, like the toolbar.

---

## Placing things

### Regions, not coordinates

Pane geometry is **derived from how many panes are open and their order**. There
are no stored x/y positions and no resizing.

| Panes | Layout |
| --- | --- |
| 1 | Fills the plane |
| 2 | Left half, right half |
| 3 | Left full-height; right split top and bottom |
| 4 | Quadrants — top-left, top-right, bottom-left, bottom-right |

Two pure functions carry this, both unit-tested with no DOM:

- `regionsFor(count: 0|1|2|3|4): PaneRegion[]` — the geometry for a pane count.
- `insertPaneAt(panes, tool, index): PaneLayout` — insertion, clamped to four.

Because geometry is derived, a pane closing reflows the rest with no bookkeeping,
and the layout survives any viewport width without stored pixels.

### The drag

1. Press a toolbar row and move. The row lifts; the plane enters drop mode.
2. The plane shows **candidate zones** — `count + 1` of them, being the regions
   the layout *would* become. Each zone is an outline on the dot field.
3. The zone under the cursor fills `--meld-accent-surface` with an
   `--meld-accent` inset edge. This is the highlight, and it names an **insert
   index**, not a coordinate.
4. Release drops the pane at that index.
5. Dragging over the tab strip's `+` instead opens a new tab holding that tool.

**At four panes** the toolbar rows go disabled with a `MeldBanner`-style inline
note — *"Four is the most a tab holds. Close one, or drop this on `+` for a new
tab."* Dragging onto `+` still works, which is the escape hatch.

**Tapping instead of dragging** appends to the first free region — index `count`.

Panes can also be dragged between regions once placed, using the same zones.

### Keyboard

Placement is not mouse-only.

- Toolbar rows are buttons; `Enter` places the tool at the first free region.
- `Ctrl/Cmd + 1…4` focuses the pane in that region.
- `Ctrl/Cmd + W` closes the focused pane. `Ctrl/Cmd + T` opens a new tab.
- `Ctrl/Cmd + K` focuses the dock composer from anywhere in the Room.
- `Escape` cancels a drag and collapses the dock.

### The empty Room

A brand-new Room is one untitled tab, an empty plane, the toolbar, and the dock
at rest. The plane carries a ghosted `MeldWatermark` of the Room name and a
single line of Pixelify guidance: *"Pick a tool, or just say what you're doing."*

There is no starting-point wizard and no first-run tour. The dock composer holds
focus on mount, so typing works before anything is placed.

---

## The Overview tab

**Derived, never stored.** It has no row and nothing writes it, computed at read
time the way the Deck computes `STALE`.

**It appears when the Room has at least two artifacts** — reusing exactly the
condition `getRoomSurfaces` already applies to today's Overview surface. Below
that threshold there is no Overview tab and the Room opens on its first
workstream tab.

**Landing rule:** a participant who has never opened this Room lands on Overview
when it exists. Everyone else lands on the tab they last had open. "Last opened"
is per-user `localStorage`; it is a convenience, not Room state.

**Contents,** rendered with `MeldRegion` / `MeldColumnHeading` on the plane:

| Section | Source |
| --- | --- |
| What this Room is | The PRD summary, or the opening message if there is no PRD |
| Decisions | `listRoomDecisions` — the retired Decisions tab, moved here |
| Artifacts | Canvas / Prototype / PRD, each a link that opens that tool in a new tab |
| People | Participants, with presence |
| Recent | The last few conversation turns and applied edits |

**Overview holds no panes and shows no toolbar.** It is not a plane you work on;
it is a briefing. The toolbar is hidden while Overview is active, and the tools
are unreachable there — an artifact link opens that tool in a new tab instead.
The dock stays, because the conversation is Room-wide and Overview is where a new
teammate will want to ask their first question.

Overview is read-only. Every row navigates; nothing on it writes.

---

## How the dock knows where you mean

"Update the name in the PRD" reaching the PRD is **not client-side parsing**. No
regex, no intent classifier in the browser.

The machinery already exists. The Product Agent already proposes PRD edits;
`prd_proposals` → `apply_prd_proposal` → a `prd_change` message → `PrdChangeEvent`
is a complete, shipped path, and `generateDesignScreen` is the equivalent for
screens. What this design adds is **context and consequence**:

1. **Context in.** The room reply task carries the current tab name, the tools
   open in it, and which pane has focus. So "make this shorter" while the PRD
   pane is focused resolves to the PRD, and the same words with a canvas frame
   selected resolve to that frame.
2. **Consequence out.** When an agent's work lands on an artifact that is **not
   open**, the Room opens it — the tool is placed at the first free region, or,
   at four panes, the pane's title bar gets an accent pip and the dock's event
   line links to it. When the artifact **is** open, the pane scrolls to the
   change and flashes it in `--meld-accent-surface` once.

Both are additive. If the agent's context is missing or ambiguous it behaves
exactly as today: it asks. Nothing about this design makes an agent guess where
a vague instruction should land — it makes the answer available when it exists.

---

## Data

### One new table

```sql
create table room_tabs (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  name         text,                       -- null renders as "Untitled"
  position     integer not null,
  panes        jsonb not null default '[]'::jsonb,   -- ordered, max 4
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

`panes` is an ordered array of `{ "tool": "canvas" | "prototype" | "prd" }`.
Geometry is derived from array length and index, so nothing positional is
stored. A `check` constraint caps it at four; the pure `insertPaneAt` clamp is
the friendly guard, the constraint is the honest one.

**Why a table and not a JSON blob on `rooms`:** two people editing different
tabs must not clobber each other. Row-per-tab gives per-tab atomicity and
per-row Realtime for free.

**RLS mirrors what the Room already enforces**, with no new concept:

- `select` — any participant of the room.
- `insert` / `update` / `delete` — `can_edit_room`, the same predicate
  `start_user_flow` gates on. Not the Room owner, not the Workspace
  administrator. A view-only participant sees every tab and can switch between
  them; they cannot create, rename, reorder, close, or place panes.

**Realtime.** Subscribe to `room_tabs` for the room, following the existing
`use-room-surface-realtime.ts` pattern. A tab added, renamed, reordered or
re-laid-out appears for everyone without a reload.

### Every Room must have at least one tab

This is an invariant, and it needs handling in three places or the Room opens to
nothing.

1. **New Rooms.** Room creation inserts one tab — `name: null`, `position: 0`,
   `panes: []`. Same transaction as the Room, so a Room can never exist without
   one.
2. **Existing Rooms — backfill.** The migration that creates `room_tabs`
   backfills one untitled empty tab for every Room already in the database. The
   Room's existing artifacts are *not* converted into panes: someone opening an
   old Room gets the empty plane and places what they want, which is the whole
   point of the rebuild. Their PRD, canvas and prototype are all one tap away and
   none of it is lost.
3. **Closing the last tab.** Not allowed. The close control is absent on the only
   remaining workstream tab. Overview does not count toward this — a Room whose
   only tab is Overview would have nowhere to work.

The read path treats a Room with zero tabs as a bug, not a state to render: it
creates one on read and logs it. Defensive, because an empty tab strip is
unrecoverable from the UI.

### Nothing else is stored

Derived (no write): the Overview tab, presence, pane geometry.
Per-user `localStorage` (no write): toolbar collapsed, dock expanded, last tab
opened per room.

---

## Components

New Meld primitives, in `apps/web/src/ui/meld/`, each with a co-located test and
a `COMPONENTS.md` entry added in the same change:

| Component | File | Responsibility |
| --- | --- | --- |
| `MeldTabStrip` / `MeldTab` | `tab-strip.tsx` | The browser-style strip, `+`, presence slot. Rename, reorder, close. |
| `MeldToolbar` / `MeldToolbarItem` | `toolbar.tsx` | Floating tool list, collapse, draggable rows. |
| `MeldPlane` | `plane.tsx` | The dot-field work surface and its region grid. |
| `MeldPane` | `pane.tsx` | One framed pane: title bar, close, pop-out, content slot. |
| `MeldDropZone` | `drop-zone.tsx` | A candidate region outline and its active highlight. |
| `MeldDock` | `dock.tsx` | The bottom band: at-rest composer line, expanded body. |

New feature modules, in `apps/web/src/features/rooms/`:

| Module | Responsibility |
| --- | --- |
| `pane-layout.ts` | `regionsFor`, `insertPaneAt`, `movePane`, `removePane`. Pure, no DOM, fully unit-tested. |
| `room-tabs-repository.ts` | Reads and writes `room_tabs`. |
| `tab-resolution.ts` | `?tab=` → active tab, including the one-release legacy surface-name redirect. |
| `overview-eligibility.ts` | Whether the Overview tab exists. **Inherits the artifact-counting logic from the retired `surfaces.ts`** — the same `hasUserFlow` / `hasPrd` / `decisionCount` / `hasBuiltDesignScreen` signals off `RoomPageData.surfaceState`, and the same "two or more" threshold. Port the logic and its tests; do not re-derive them. |
| `components/room-plane.tsx` | Client shell: wires toolbar, panes, tabs, dock, drag state. |
| `components/pane-content.tsx` | Maps a tool to its existing feature component. |

`pane-layout.ts` is deliberately pure and separate. It is the part with real
logic, and it should be provable without rendering anything.

### Files retired

`components/room-tab-strip.tsx`, `room-tabs.ts`, `surfaces.ts`,
`components/decisions-surface.tsx`, `components/stage-coaching-panel.tsx`,
`components/stage-progress-ring.tsx`, and the surface-switch body of
`rooms/[roomId]/page.tsx` — which drops from 278 lines to a thin server
component that loads the Room, its tabs, and the panes of the active tab.

`stage-readiness.ts` and its tests **stay**, unreferenced by the UI. So does
every stage migration and RPC.

---

## Accessibility

- The tab strip is a real `tablist` / `tab` / `tabpanel`, arrow-key navigable.
- Each pane is a landmark region labelled by its tool name.
- **Drag has a keyboard equivalent for every action** — nothing is reachable
  only by pointer. Toolbar rows place on `Enter`; a placed pane moves via its
  title-bar menu.
- Drop-zone highlighting is announced through an `aria-live="polite"` region:
  *"Drop to open PRD on the right half."* Colour is never the only signal — the
  active zone also gains a heavier inset edge.
- Focus rings are **inset box-shadow**, because `clip-path` erases `outline`.
- The dock's expand/collapse control is a button with `aria-expanded`, and
  expansion moves focus into the composer.
- Presence pips carry text alternatives; green is never the only cue.

---

## Testing

**Unit (Vitest).** `pane-layout.ts` across every count 0–4: insertion, clamping
at four, removal reflow, move. `tab-resolution.ts` including the legacy
surface-name redirect and unknown values. `overview-eligibility.ts` at, above and
below the artifact threshold.

**Component (Vitest + Testing Library).** Each new Meld primitive: variants,
`data-*` reflection, keyboard behaviour, focus ring presence. `MeldToolbar`
collapse. `MeldDock` at-rest versus expanded.

**Integration.** `room-plane.tsx`: tap-to-place appends; drag-to-place inserts at
the highlighted index; the fourth pane disables the toolbar; a view-only
participant gets no create/rename/close controls.

**E2E (Playwright).** Open an empty Room, place a tool, place a second, drag a
third onto `+` and confirm a new tab; confirm the dock is the same conversation
across two tabs; confirm a second browser context sees a tab another user added.

**Conventions.** `pnpm exec eslint`, `pnpm --filter web typecheck`, and
`scripts/check-astryx-conventions.mjs` must pass — the last one fails the build
on any raw hex or `px` outside `tokens.css`.

---

## Delivery order

This is a large piece of work. It is one coherent design, but it must land in
stages that each leave the app working — and the order is chosen so the riskiest
unknown is answered second, not last.

1. **Foundations.** `pane-layout.ts`, `tab-resolution.ts`,
   `overview-eligibility.ts` — pure modules, fully tested, nothing rendered. The
   `room_tabs` migration, RLS, backfill, and repository.
2. **The width risk, answered early.** Mount the existing canvas and prototype
   viewer inside a fixed quarter-width box and see what breaks. Everything after
   this depends on the answer, so it must not wait until the end. If either is
   unusable at quadrant size, the fix (a minimum region size, or a tool that
   refuses to go below half) changes the layout rules — and it is far cheaper to
   learn that now.
3. **Meld primitives.** `MeldPlane`, `MeldPane`, `MeldToolbar`, `MeldTabStrip`,
   `MeldDropZone`, `MeldDock`. Each with tests and a `COMPONENTS.md` entry.
4. **The shell, wired.** `room-plane.tsx` and `pane-content.tsx`: tap-to-place,
   panes rendering real tools, tabs switching, the dock holding the existing
   `Conversation`. The Room is usable at the end of this step.
5. **Drag and drop.** Zones, highlight, insert index, drag onto `+`, the
   keyboard equivalents, the `aria-live` announcements.
6. **Overview.** The derived tab, its sections, Decisions moved into it.
7. **Retirement.** Delete the old tab strip, the surface switch, the Decisions
   surface, the stage panel. Trim `page.tsx`.
8. **Agent context and consequence.** Pane context into the reply task; opening
   or flashing the artifact an agent touched.
9. **Presence.** The liveness pips. Last because everything works without them.

Steps 1–7 are independent enough to parallelise across subagents once step 2 has
reported. Steps 8 and 9 are additive and could ship in a follow-up if needed.

## Out of scope

Named explicitly so they do not creep in:

- **Anchored comments** — pins on a canvas frame or a PRD paragraph. A good idea
  for critique, and additive later. Not v1.
- **More than four panes**, free-floating windows, pane resizing.
- **Per-tab conversations.** Decided against; do not reintroduce.
- **Tab templates or saved layouts.**
- **Migrating surviving feature components** from Astryx to Meld primitives.
- **Reviving the stage coach** inside Overview. The data stays; the UI does not
  come back in this work.
- **Any change to how agents and humans render their replies.** Untouched.

---

## Risks

**The canvas and prototype viewer at quarter width.** Both were built for a full
surface. A quadrant is roughly 420×260 at the reference width. Mitigation: the
pane title bar's "pop to new tab" control promotes any pane to a full plane in
one click. **Verified in Task 6 — the canvas does not survive a quadrant; see
"Width probe" below for the finding and the layout-rule change it forced.**

### Width probe (Task 6)

Task 6 probed whether the two heaviest pane surfaces — the tldraw-backed
user-flow canvas and the prototype viewer — are usable at a quadrant
(420×260 CSS px at the 1060px reference width). They are not equally usable,
and the difference changes `pane-layout.ts`.

**Method, and its limits.**

1. *jsdom probe* — `apps/web/src/features/rooms/pane-width-probe.test.tsx`
   mounts `PrototypeViewer` (both states) and the `UserFlowTrialTab` loader's
   unavailable-trial chrome inside a 420×260 container and asserts each
   mounts without throwing. Those all pass. The real tldraw canvas render is
   *not* exercised there: jsdom has no canvas 2D/WebGL implementation (this
   repo has no `canvas` npm package), and a local, uncommitted attempt to
   force the tree past its loading state and into a real
   `<UserFlowTrialCanvas>` → `<Tldraw>` render logged "Not implemented:
   HTMLCanvasElement's getContext() method," collapsed the render tree to an
   empty container, and hung past a 5s timeout instead of settling — the
   same reason every other test in this codebase that touches tldraw
   (`user-flow-trial-canvas.test.tsx` and its `.e2e.test.tsx` sibling) mocks
   `tldraw` and `@tldraw/sync` wholesale rather than rendering them. jsdom
   can prove a component *doesn't crash to mount*; it cannot prove legible
   or interactive.
2. *Real browser* — the canvas-trial Playwright stack
   (`playwright.canvas-trial.config.ts`'s gateway + a `next dev` server on a
   scratch port, both run manually, matching its fake-workspace/fake-canvas-
   session env) served the existing `00000000-…-0001` / `40000000-…-0001`
   fixture room, which already has a built "Checkout research" flow on the
   canvas and a built "Checkout prototype start" screen on the Prototype
   tab — the shared Supabase instance's empty database was sidestepped
   entirely, nothing there was touched. Screenshots were taken with
   Playwright at several sizes. Two method notes:
   - Shrinking the *browser viewport* to 420×260 does not isolate the pane:
     it trips an unrelated `(max-width: 768px)` "Please use Meld on desktop"
     gate (`src/ui/desktop-only-gate.tsx`) that replaces the entire app. The
     probe instead kept the viewport at 1280×800 and forced just the
     surface element's own box (the
     `user-flow-trial-surface` / prototype-wrapper `div`) down to the target
     size via injected CSS, which is a reasonable but not exact stand-in for
     how a real pane region will constrain these components once the
     freeform canvas exists.
   - The fixture flow has two frames ("Checkout prototype start" and "Order
     review") seeded close together; at every size tested, tldraw's
     zoom-to-fit camera left their name labels overlapping into illegible
     text. That overlap looks like a fixture-placement artifact, not
     something a width rule fixes, and is called out below so it isn't
     mistaken for the actual finding.

**What was found, with numbers.**

- **Canvas: not usable at 420×260.** At that size, the tldraw toolbar and
  page menu fit (barely), but the drawing surface itself showed no legible
  frame — only the empty dot-grid background and the overlapping label text
  described above, off in the lower edge of the viewport. Nothing on the
  canvas was identifiable, let alone selectable.
- **Canvas: becomes legible somewhere between 420×260 and 480×320.** At
  480×320 a frame's content (a "Review order" button, the frame edge) was
  visible and would be clickable; the toolbar fit with little room to spare.
  At 530×540 (the size of a "half" region — one of two side-by-side panes —
  at the 1060px reference width) and at 700×500, the same content was
  visible with comfortable room. This was not bisected precisely; 480×320 is
  the smallest size tested at which the canvas showed usable content, not a
  proven exact threshold.
- **Canvas: a further, untested risk.** `user-flow-trial-canvas.tsx` reserves
  a fixed 64px icon rail plus, when open, a fixed 320px Agents panel
  (`CANVAS_RAIL_WIDTH`, `CANVAS_PANEL_WIDTH`) as flex siblings of the editor,
  not overlays. Neither was open during this probe. With the panel open, 384
  of a pane's width goes to that chrome before the editor sees a pixel — at
  a "half" region (~530px) that leaves roughly 146px for the actual canvas.
  This was not visually verified; it is a static read of the source and a
  reason to treat "half" as a floor, not a comfortable size, once the Agents
  panel is in play.
- **Prototype viewer: usable at 420×260.** `PrototypeViewer` is a bare
  `<iframe>` with no toolbar, no fixed-width chrome, nothing absolutely
  positioned — so it imposes no minimum width of its own. At 420×260 the
  fixture screen's heading, its "Review order" button, and the screen-picker
  dropdown were all fully visible and reachable. Caveat: the fixture HTML is
  intentionally minimal, unstyled semantic markup
  (`<main><h1>…</h1><button>…</button></main>`) with no fixed-width CSS, so
  it reflows trivially. A real "desktop" form-factor screen built with fixed
  pixel widths could still overflow or clip inside a 420px iframe — that is
  a property of the screen's own content, which `minimumRegion` (a per-tool,
  not per-content, rule) cannot fix, and is out of scope for this task.

**Decision: minimum region, for `canvas` only — enforced against the region a
tool would occupy, not the pane count.**

Per the brief's branch: one of the two surfaces (canvas) is unusable at a
quadrant, so `canvas` gets `minimumRegion: "half"` in `pane-layout.ts`.
`prototype` and `prd` get no entry — they tolerate a quarter. `regionsFor` is
unchanged and unconsulted for area — instead, a new `classifyRegion(region)`
reads a region's own grid span and calls it `"full"`, `"half"`, or
`"quarter"`. That matters because `regionsFor(3)` does not hand out a quarter
to everyone: its index 0 (the tall left pane, full height / half width) is a
genuine half, close to the ~530×540 this probe measured as comfortable for
canvas; only indices 1 and 2 are quarters. A rule keyed on pane count alone
can't see that difference — a rule keyed on the region's own span can.

So the checks are all keyed on *which region a tool would land in*, not on
how many panes the tab would have:

- `canPlace(panes, tool)` asks "does **any** index exist at which `tool` could
  be inserted without pushing itself, or any already-open tool, into a
  quarter smaller than its minimum." Placing `canvas` into a would-be
  three-pane tab is allowed — index 0 works — even though indices 1 and 2
  don't.
- `insertPaneAt(panes, tool, index)` now checks the *specific* index it's
  given, in addition to the existing duplicate/capacity checks: canvas at
  index 0 of a three-pane tab succeeds; at index 1 or 2 it's refused and the
  layout comes back unchanged, same as every other existing refusal branch.
  This also catches indirect displacement — inserting a *different* tool at
  index 0 of a tab where canvas already validly holds it would push canvas to
  index 1, and is refused for that reason even though the inserted tool has
  no minimum of its own.
- `movePane(panes, from, to)` gained the same check: moving canvas out of
  index 0 of a three-pane tab into index 1 or 2 is refused, unchanged
  returned. The other two panes can still freely trade places between the
  two quarter slots.
- A new `paneRefusalReason(panes, tool, index)` returns a short string for
  the refusal at that specific index (duplicate tool, full tab, or the
  minimum-region rule) so a later toolbar or drop zone can explain *why* a
  placement is disabled instead of just disabling it — no toolbar consumes it
  yet.

**Consequence, correctly stated.** Three-pane tabs remain fully reachable,
including with canvas in them — a user can build canvas-on-the-left with PRD
and prototype stacked on the right, which is the natural arrangement anyway.
The real, narrower consequence: canvas can only ever occupy index 0 of a
three-pane layout, never index 1 or 2. Four-pane tabs are unreachable today,
but for an unrelated, pre-existing reason that has nothing to do with this
rule: `PaneTool` has only three values, so a four-long layout can't be built
without repeating one of them, and `MAX_PANES`'s capacity check already
refuses that. (An earlier version of this rule refused canvas at three panes
outright, which would have blocked that natural left-canvas arrangement too —
corrected after review, before this reached later tasks. See the fix report
in `.superpowers/sdd/2026-08-20-room-freeform-canvas/task-6-report.md` for
the full before/after.)

**Four panes plus an expanded dock is a lot of chrome.** Mitigation: the dock
overlays rather than reflows, so it never shrinks a pane, and it collapses on
`Escape`.

**Losing the stage ladder removes the only sense of progress.** Accepted
deliberately. Overview's Decisions and Artifacts sections are the replacement:
progress you can see, rather than progress you are graded on.
