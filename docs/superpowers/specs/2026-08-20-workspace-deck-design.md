# The Deck — workspace landing surface

**Date:** 2026-08-20
**Status:** Approved design, ready for an implementation plan
**Replaces:** `apps/web/src/app/(app)/[workspaceId]/page.tsx` ("What are you
building?" + starting points + Needs attention)

---

## Why

The current landing page is a heading, a row of starting-point cards and an
attention list, wrapped in the sidebar shell. It is indistinguishable from every
other AI product. The workspace is single-tenant in practice — one person, their
projects, their agents — so the landing surface should read as *their desk*, not
as a generic dashboard.

The Deck is a framed plane on the pixel field with three fixed regions: a
**ticket** of pending work on the left, a **column of project tiles** down the
right edge, and a **prompt** at the bottom centre. The workspace name sits
ghosted through the middle. There is no sidebar.

Rejected along the way, and why, so we don't relitigate:

- **Literal OS** (windows, dock, minimise) — costume without payoff, and window
  state per user is a real cost for no daily gain.
- **Infinite pegboard** — day-one emptiness, and "where did I put that" at scale.
- **Isometric room** — charming once, a chore daily, breaks past ~8 projects.
  Its one good idea (agents as characters) survives as the sprites on the ticket.
- **Hand-written to-do list** — a second place to keep track of work. Replaced by
  Pending, which is derived and drains itself.

---

## The surface

One route, one screen, no scroll on a normal viewport. Everything aligns to the
24px dot grid — the frame, both columns, the prompt.

```
┌─ frame (1px ink, inset 24) ───────────────────────────────────┐
│  ◆ Nicholas' Studio · thu 20 aug     Design system  Settings  │
│                                                               │
│  ┌ TICKET ─────────┐                        PROJECTS      4   │
│  │ PENDING     04  │                        ┌───────────┐     │
│  │ ─ ─ ─ ─ ─ ─ ─ ─ │        M E L D         │ Checkout  │     │
│  │ DECISION  2d    │                        └───────────┘     │
│  │ Apple Pay …     │     workspace name     ┌───────────┐     │
│  │ [ANSWER][ROOM]  │                        │ Onboarding│     │
│  │ …               │                        └───────────┘     │
│  │ ↓ 2 MORE        │                        ┌───────────┐     │
│  │ ── on shift ──  │                        │ Growth    │     │
│  │   [P]    [D]    │                        └───────────┘     │
│  │ ▮▮▮ barcode     │                        ┌ + new ────┐     │
│  └─────────────────┘                        └───────────┘     │
│                    ┌ meld ▸ what are we doing today?  ⌘K ┐    │
│                    └──────────────────────────────────────┘   │
│                     ⌘N New project  ⇧⌘N Scratch  ⌘K Ask       │
└───────────────────────────────────────────────────────────────┘
```

Regions, at the 1060px reference width:

| Region | Position | Size |
| --- | --- | --- |
| Frame | inset 24 | — |
| Top strip | left 72, top 52 | full width less 72 each side |
| Ticket | left 72, top 96 | 316 × 472 |
| Project column | left 816, top 96 | 172 wide |
| Watermark | centred in the gap between them | — |
| Prompt | left 396, top 612 | 420 × 46 |
| Shortcut line | under the prompt | 420 wide |

### Look

Light mode, `--meld-*` tokens only, pixel corners on every container. The ticket
is the single dark block on the page — it is the structure, not a sticker.

**Typography discipline is load-bearing here.** An earlier version set the whole
ticket in Pixelify and read as a novelty. Body copy is Archivo; Pixelify is
restricted to labels, kind chips, counts, sources, ages and the barcode line —
which is the rule `ui/meld/COMPONENTS.md` already states.

---

## Pending (the ticket)

Pending is **generated, never typed**. Each row is one thing the workspace knows
is waiting on this user, carrying: kind, source (`PROJECT · ROOM`), the ask in
plain language, age, and the action that clears it.

| Chip | Backing `AttentionKind` | Clears when |
| --- | --- | --- |
| `DECISION` | `decision_needed` | the decision is answered |
| `APPROVE` | `approval_request`, `agent_result_review` | approved or rejected |
| `REVIEW` | `mention`, `assigned_work` | acknowledged or opened |
| `STALE` | `room_idle` *(new)* | the room moves again |

This maps onto infrastructure that already exists.
`features/home/attention/` defines `AttentionKind`, `AttentionItem` and a
`composeAttentionItems(resolvers, context)` registry that runs resolvers with
`Promise.allSettled` and sorts by `occurredAt`. Today only
`createMentionResolver` is wired. The work is **adding resolvers, not building a
system**:

- `decision_needed` — unanswered decisions on rooms in the workspace.
- `approval_request` / `agent_result_review` — agent output holding for a yes/no.
- `assigned_work` — work assigned to the current user.
- `room_idle` — **new kind**; rooms with no activity for N days (default 5).
  Requires extending the `AttentionKind` union and the resolver set.

`AttentionItem` gains three fields, all optional so existing resolvers keep
compiling:

```ts
projectName?: string;   // source line: "CHECKOUT · GUEST FLOW"
actionLabel?: string;   // "ANSWER" — falls back to a per-kind default
secondaryHref?: string; // "OPEN ROOM"
```

A resolver that throws is already swallowed and logged by the registry, so one
broken resolver degrades the ticket rather than the page. The ticket renders the
first four items and a `↓ N MORE` affordance; the rest expand in place.

**Empty state:** an empty ticket is a *good* state, not a void. It prints the
header, `NOTHING PENDING`, the on-shift sprites and the barcode. The ticket keeps
its shape.

### On shift

The two sprites at the foot of the ticket are the surviving piece of the
isometric concept. State comes from in-flight `ai_tasks` / `ai_task_attempts`
for the workspace:

- **working** — sprite animates (the design agent's brush moves), equaliser above
- **waiting** — sprite idles, label reads `WAITING`
- **idle** — sprite idles, muted label

If presence turns out to need a query we don't want on this page, v1 falls back
to idle sprites with no equaliser. The sprites are decorative-but-honest: they
must never claim work that isn't running.

---

## Project tiles

A tile is a container with its contents spilling out, not an icon:

- dark tile, pixel corner, project colour glowing from the top-left corner
- one or two **peek cards** rotated behind the top-right edge, previewing the most
  recent artifact in the project
- title in Archivo, `N rooms · <relative updated>` in Pixelify
- green `LIVE` pixel when an agent is working in the project, red count badge
  when something is unread

The peek card renders one of three shapes from the latest artifact's kind — doc
(title + rule lines), screens (three mini frames, or the real thumbnail when the
canvas already has one), brief (lines). **v1 uses metadata only**; no extra image
fetch beyond thumbnails that already exist.

The line reads `N rooms · updated 2h` in v1. The "24 items" count in the mockup
is deferred until there is a cheap aggregate — it is decoration, not a decision
aid, and not worth a fan-out query on the landing page.

Four tiles fit comfortably. Past six, the column scrolls and tiles halve in
height (title + count, no peek cards).

---

## Interaction

| Input | Result |
| --- | --- |
| Click a project tile | **Navigate** to the project page. Not a window, not an overlay. |
| Click a pending action | Perform it inline where possible; otherwise navigate to the room |
| `⌘K` / any printing key | Focus the prompt |
| `⌘N` | New project |
| `⇧⌘N` | Scratch room |
| `Esc` | Clear the prompt, return focus to the deck |
| `↑` `↓` `⏎` | Move through tiles and pending rows, open |

Clicking a project navigates like a normal page load. Whatever the project and
room surfaces become, the Deck only hands off — it does not own their layout.

The prompt is the primary verb. It is a text input that routes to search and
commands; the routing behaviour is **out of scope for this spec** and gets its
own. Here it must exist, focus correctly, and be keyboard-reachable.

---

## Architecture

### Escaping the sidebar

`app/(app)/[workspaceId]/layout.tsx` currently wraps every child in `AppFrame` +
`WorkspaceNavigation`. A Next.js child route cannot opt out of a parent layout,
so the shell moves **down** to the routes that want it:

1. Extract the current layout body into
   `features/workspaces/workspace-shell-layout.tsx`, and the auth/membership
   guard into a `requireWorkspaceAccess(workspaceId)` helper so it has exactly
   one implementation.
2. Delete `[workspaceId]/layout.tsx`.
3. Add thin layouts under `rooms/`, `settings/` and `design-system/` that call
   the guard and render `WorkspaceShellLayout`.
4. `[workspaceId]/page.tsx` calls the same guard and renders the Deck full-bleed.

This is the one structural change in the design. It is contained, and it keeps a
single source of truth for the access check — the failure mode to avoid is a deck
page that renders before checking membership.

### Components

New primitives in `ui/meld/` (the only place raw elements are allowed):

| Component | Purpose |
| --- | --- |
| `MeldTicket` | Torn-edge dark paper container: `tear` edges, header, dashed rules, barcode foot |
| `MeldTicketRow` | One pending row: kind chip, source, age, ask, actions |
| `MeldKindChip` | Pixelify chip, `data-kind` for the four kinds |
| `MeldProjectTile` | Dark tile + colour glow + `LIVE` / count badge |
| `MeldPeekCard` | The rotated preview card, `data-shape="doc\|screens\|brief"` |
| `MeldAgentSprite` | The pixel character, `data-state="working\|waiting\|idle"` |
| `MeldWatermark` | Ghosted wordmark + workspace name |
| `MeldDeckFrame` | The framed plane over `MeldPixelField` |

`MeldPixelField`, `MeldMark`, `MeldStatusPixel`, `MeldBadge` and `MeldButton`
already exist and are reused. Every new component reflects its variant as
`data-*` — hashed module class names can't be targeted from tests, and that
contract is already established in this directory.

Feature components in `features/home/components/`: `deck.tsx` (composition),
`pending-ticket.tsx`, `project-column.tsx`, `deck-prompt.tsx`,
`shortcut-line.tsx`. Feature code composes primitives and uses **no raw
elements** — `scripts/check-astryx-conventions.mjs` enforces this.

### Data flow

The page is a server component. It runs the access guard, then fetches in
parallel:

```
requireWorkspaceAccess(workspaceId)
  ├── listWorkspaceProjects(workspaceId)   // existing
  ├── listPendingItems(workspaceId)        // listAttentionItems + new resolvers
  └── listAgentPresence(workspaceId)       // new, from ai_tasks
```

As today, skip the pending query entirely when the workspace has no rooms — every
kind is anchored to a room, so the result is provably empty.

Failures are already partial-tolerant at the registry level. A failed presence
query renders idle sprites. A failed project query is the only fatal one, and it
surfaces as an error boundary rather than an empty deck, so "no projects" and
"projects failed to load" are never confusable.

### Motion

Sprite bob, brush stroke, equaliser, `LIVE` pulse and the prompt caret. All of it
sits behind `prefers-reduced-motion: reduce`, which drops every animation to a
static frame. Nothing animates that isn't reporting real state.

---

## Testing

- **Unit (vitest + testing-library)** per new primitive: renders, reflects
  `data-*`, respects reduced motion. Colocated `*.test.tsx`, matching this
  directory's convention.
- **Pending mapping**: each new resolver gets a test over a fake query client,
  the way `mention-resolver.test.ts` is written. Explicitly test that one
  throwing resolver leaves the other rows intact.
- **Deck composition**: pending rows render in `occurredAt` order; the fifth item
  hides behind `↓ N MORE`; the empty ticket keeps its header and sprites.
- **Conventions**: `scripts/check-astryx-conventions.mjs` must pass — no raw
  elements outside `ui/meld/`, no literal hex or px outside `tokens.css`.
- **E2E (playwright)**: land on the workspace → the deck renders with no sidebar;
  clicking a project tile navigates to the project page; `⌘K` focuses the prompt.

---

## Out of scope

- What the prompt actually *does* (search and command routing) — its own spec.
- The project and room surfaces behind the tiles.
- Mobile. The Deck is a desktop surface; narrow viewports fall back to the
  ticket stacked above the project column, which is a follow-up.
- Item counts on tiles, real canvas thumbnails in peek cards beyond those that
  already exist, and any sound design.

---

## Open questions

1. **`⌘N` binding.** Currently `⌘N` = new project, `⇧⌘N` = scratch room. If the
   scratch room is the thing hit ten times a day, they should swap.
2. **Pending overflow.** `↓ N MORE` expands in place. If a heavy week means
   twenty pending rows, does the ticket scroll internally or does the paper get
   longer with the page?
3. **Real copy.** The pending wording ("Apple Pay above the fold, or after the
   address step?") is placeholder pending the real strings.
4. **`room_idle` threshold.** Defaulted to 5 days. Unverified guess.
