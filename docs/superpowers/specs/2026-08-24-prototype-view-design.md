# Prototype view: empty state, screen switching, and viewport

**Date:** 2026-08-24
**Status:** Approved in brainstorm, ready for planning

---

## In plain language

The Prototype tab has three problems.

**When it's empty it just says "No screens built yet"** and leaves you there. It should offer to build something, using what the room already has.

**Switching screens is a raw HTML dropdown** floating in the top-right corner. It isn't part of the app at all — it's injected into your prototype document, which is why it looks foreign and can't be styled. It becomes a small pill in the top-left that drops open into a list of screens with thumbnails.

**There's no way to see a screen on a phone.** A Desktop/Mobile toggle goes in the top-right.

Along the way the composer gets fixed too. It currently floats over the prototype permanently and covers your work. It collapses into a small pill at the bottom, expanding when you click it or press ⌘K.

---

## The organising rule

Two kinds of chrome, and it never varies:

| | Belongs to | How many | Contains |
|---|---|---|---|
| **Pane chrome** | one pane | one set per Prototype pane | screen pill, viewport toggle |
| **Page chrome** | the page | exactly one, always | the composer dock |

This matters because a room can have several panes open at once — Prototype, Canvas and Document side by side. A second Prototype pane gets its own screen pill; Canvas and Document have none. The composer never changes based on what's open, so there is only ever one rule to learn.

This is not a new idea being imposed. The composer is already a page-level dock: `room-plane.tsx` holds canvas selection above the panes because "the surface with the selection and the composer that acts on it are siblings". This design follows that grain.

---

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Empty state | Starting points from room context, falling back to focusing the composer | By the time you open Prototype there's usually a PRD or user flow to build from, so it can offer something specific rather than a blank box |
| Screen switcher | Collapsible pill, top-left | The bottom is contested by the composer, so a filmstrip fights it. A pill costs no space and stays usable at ten screens |
| Thumbnails | Inside the pill's dropdown | Keeps "recognise it by looking" without spending any height |
| Composer | Collapses to a pill | Answers "I still need it sometimes" without letting it cover work permanently |
| Composer expansion | Overlay, not push | It only covers anything while you're typing — the one moment you're looking at it and not the prototype. Pushing reflows every pane mid-sentence |
| Composer label | "Ask anything" | The dock addresses Product, Research, Design or a teammate. Naming one agent is wrong. This matches the home deck's existing wording |
| Viewport toggle | Preview only — resize the frame | Screens already ship a `max-width:960px` breakpoint, so resizing shows something real. No generation needed |

### Rejected, and why

- **Filmstrip along the bottom** — fights the composer for the same contested space.
- **Tabs across the top** — overflows past four or five screens into a "+2 ▾" menu, which is the dropdown again.
- **Docking the composer below the prototype** — costs ~90px of height permanently, the opposite of the goal.
- **Separate mobile and desktop screens** — doubles the screens that must stay consistent. Screen-to-screen drift is a problem this codebase has already fought at length; two variants of everything is that bug with more surface area.

---

## Architecture

### Moving the switcher out of the document

Today `prototype-document.ts` emits a `<select id="meld-screen-picker">` pinned with `position:fixed; z-index:2147483647` into the generated HTML. It goes.

The document keeps its routing harness, which gains a narrow message API so app chrome can drive it across the iframe boundary:

| Direction | Message | Payload |
|---|---|---|
| app → iframe | `meld:navigate` | `{ screenId }` |
| iframe → app | `meld:screen-changed` | `{ screenId }` |

The second direction is required, not optional: clicking a button *inside* the prototype navigates too, and the pill's label must follow. Without it the pill would silently drift out of sync with what's on screen — the same class of "the UI says one thing, the truth is another" bug that produced the near-miss screen key.

**Constraints.** The iframe is `sandbox="allow-scripts"` with no `allow-same-origin`, so its origin is opaque and messages arrive with `origin: "null"`. Validation must therefore be by `event.source === iframe.contentWindow` and by message shape, never by origin string. Posting to the iframe uses `"*"` as `targetOrigin` because an opaque origin cannot be named — safe here because the payload is a screen id, not a secret.

**No migration.** `prototype-reader.ts` assembles the document on every read via `assembleValidatedPrototype`; no rendered HTML is persisted anywhere. Removing the picker removes it from existing prototypes on their next view. Verified against the schema: the only `document` columns belong to `prds` and `user_flow_generations`.

**Bonus.** Anything exported or shared is now just the screens, with no app control baked into it.

### Components

`PrototypeViewer` is 45 lines today and becomes a real pane. Rather than growing one file, it splits:

| File | Responsibility |
|---|---|
| `prototype-viewer.tsx` | Composition: toolbar + frame + empty state. Owns the selected screen id and viewport |
| `prototype-screen-pill.tsx` | The pill and its dropdown. Props: screens, selected id, `onSelect` |
| `prototype-viewport-toggle.tsx` | Desktop/Mobile segmented control. Props: value, `onChange` |
| `prototype-empty-state.tsx` | Starting points, or the composer fallback |
| `use-prototype-frame.ts` | The iframe message channel. Owns `postMessage`, listener, and source validation |

Each is independently testable and none needs the others' internals. The message channel is a hook rather than inline code specifically so it can be tested without mounting a viewer.

**Built from the design system, not hand-rolled.** The pill, dropdown, segmented toggle and empty state use Astryx components and `--meld-*` / `--spacing-*` tokens, matching the rest of the app. No raw hex values and no bespoke CSS where a component exists — the reason today's picker looks wrong is precisely that it was hand-rolled outside the system. The one place custom CSS is unavoidable is the iframe wrapper's width constraint.

`PrototypeViewerProps` gains `screens: { id, name, formFactor }[]` — the viewer currently receives only `html` and `screenCount`, which cannot populate a named list. The page already reads this from `listRoomCanvasScreens`. `formFactor` is carried so the dropdown thumbnails use the right aspect ratio (a mobile screen drawn in a 16:10 box reads as broken); it does **not** drive the viewport toggle, which is a free preview independent of what a screen was designed for.

### Empty state

Offers what the room actually has, checked in this order:

1. A user flow exists → "Build the first screen from your user flow"
2. A PRD exists → "Build a screen from your PRD"
3. Neither → fall back to focusing the composer with `@Design Agent ` pre-filled

Each starting point generates on click through the existing `generateDesignScreen` path. Nothing new server-side.

### Viewport toggle

Pure CSS on the iframe wrapper: `Desktop` = 100% width, `Mobile` = 390px centred with the frame's height preserved. Per-pane React state, not persisted — it is a thing you glance at, not a mode you live in.

**Known consequence, not a bug:** at mobile width the generated `@media(max-width:960px)` rule sets `.reg__hero{display:none}`, so the branded sidebar disappears on phones. That is the model's design decision, now made visible. Acting on it ("Refine for mobile") is explicitly out of scope here.

### Composer pill

Lives in `room-plane.tsx` beside the existing dock state (`dockExpandedOverride`, `DOCK_STORAGE_KEY`), reusing that mechanism rather than inventing a parallel one.

- **Collapsed:** a pill reading `Ask anything ⌘K`, bottom-centre of the page
- **With context:** `2 screens selected · Ask anything` — contextual without naming an agent, and it preserves the selection feedback that would otherwise vanish when collapsed
- **Expanded:** the current composer, overlaying the panes. Escape or clicking away collapses it
- **Never collapses while:** it holds draft text, or a staged attachment. Collapsing over unsent work would lose it

That last rule is the one most likely to be missed and most likely to make someone angry.

---

## Error handling

| Case | Behaviour |
|---|---|
| Iframe hasn't loaded when a navigate is posted | Queue the id; post on the frame's `load` event |
| `meld:screen-changed` names an unknown screen | Ignore it and keep the current label. Never render a name not in the list |
| Message from an unexpected source | Drop it. Validated by `event.source`, not origin |
| Selected screen deleted while viewing | Fall back to the first live screen; if none, render the empty state |
| Starting-point generation fails | Surface the existing generation error; the empty state stays put so it can be retried |

---

## Testing

Unit tests, in the existing vitest setup:

- **Pill** — renders the current screen name; opens on click; calls `onSelect`; shows the count; keyboard reachable
- **Message channel** — posts on select; updates on `meld:screen-changed`; ignores foreign `event.source`; queues before load
- **Viewport toggle** — constrains width to 390px in mobile; restores full width; does not remount the iframe (a remount would reset the prototype to its start screen — the failure this test exists to catch)
- **Empty state** — offers the user-flow starting point when one exists; the PRD one when only that exists; falls back to composer focus when neither does
- **Composer pill** — collapses and expands; refuses to collapse with draft text; refuses with a staged attachment; shows selection context

Not covered by unit tests, and stated rather than assumed: whether the iframe's internal routing genuinely re-renders on `meld:navigate` is only provable in a browser. That needs one manual check, or an e2e spec — and the e2e suite is currently red for unrelated reasons (five specs still target deleted UI), so this design does not depend on it.

---

## Out of scope

- "Refine for mobile" — the generation action from mobile view. Wanted, but later
- Separate mobile screens
- Changing how screens are generated or how the reference-screen context works
- Retargeting the five stale e2e specs
- Reordering or renaming screens from the pill — selection only

---

## Open question for review

The contextual pill label (`2 screens selected · Ask anything`) was described but not explicitly confirmed. It is included here because collapsing the composer would otherwise hide the selection chips with nothing to replace them. Say if you would rather the pill stay static.
