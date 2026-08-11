# Workspace → Project → Room → Stage

Design for the core model restructure: one persistent Room that moves through
lifecycle stages, replacing the Discovery-Room-converts-into-Feature-Room model.

## 1. Summary

A Room is the permanent home for one piece of work. Discovery, Define, Design,
and Development are not separate rooms and not separate containers — they are
states of the same Room.

The work stays. The stage changes. The people change. The context stays.

This replaces the previously designed flow where a Discovery Room is explicitly
converted into a separate Feature Room. There is no conversion and no second
room; advancing a Room is a change to one column.

## 2. Scope

This is the first of four sub-projects. It covers the structural model and the
navigation built on it.

### In scope

- A `Project` layer between Workspace and Room
- One `Room` entity carrying a `stage` property
- Vocabulary alignment: `organization` becomes `workspace` throughout
- Sidebar and room navigation
- Progressive emergence of room structure, including AI-suggested structure

### Deferred to later sub-projects

- **Stage-scoped membership** — the Collaboration Layer / Context Layer split,
  where "active in this stage" becomes a real permission rather than a display
  tag. Sub-project 2.
- **Development-stage content** — engineering tasks, tickets, QA, blockers.
  Sub-project 3.
- **Context graph and "ask the ticket"** — traversable artifact relationships
  and sourced contextual Q&A. Sub-project 4.

## 3. Baseline

This design assumes `origin/setup-workspace-from-file` has merged. That branch
contributes, and this design builds on rather than replaces:

- **User Flows** — a tldraw canvas per room, AI-generated from room context
  (`apps/web/src/features/canvas/`)
- **Research agent** — `ai_tasks.agent_kind` (`product` | `research`) and
  `research_scope` (`room` | `web`)
- **Model selection** — per-message provider and model routing in the composer
- **PRD section proposals** — section-level AI assistance and proposals
- **Three-tab progressive emergence** in `room-tab-strip.tsx`: Conversation
  always; User Flows only when flows exist; PRD only when a PRD exists

Progressive emergence is therefore an existing pattern being extended, not a new
concept being introduced.

## 4. Vocabulary rename

The UI already says "Workspace" everywhere while the schema and code say
`organization`. That mismatch is a standing tax on everyone reading the code,
and this design changes the surrounding vocabulary anyway by introducing
`Project`. Both renames happen together so the vocabulary shifts once.

| Today | Becomes | UI label |
|---|---|---|
| `organizations` | `workspaces` | Workspace |
| `organization_id` | `workspace_id` | — |
| `products` (one per org) | `projects` (many per workspace) | Project |
| `discovery_rooms` | `rooms` | Room |

Scale: roughly 1,651 `organization` references (465 SQL, 1,186 TypeScript) and
86 `discovery_rooms` references (67 SQL, 19 TypeScript).

### Sequencing

The rename lands as its own mechanical commit — after the setup branch merges,
before any work in this design. It changes no behaviour. Keeping it isolated
prevents a 1,600-reference diff from tangling with feature work, and means the
restructure is written in final vocabulary from the first line.

### Deliberate exclusion

The `organization-logos` storage bucket keeps its ID. Renaming a bucket requires
copying every object into a new one, and the bucket ID is internal plumbing that
no user sees.

### Accepted consequence

`[organizationId]` is a route segment, so URLs become `/{workspaceId}/...`.
Existing links break. Acceptable pre-launch.

## 5. Data model

### Projects

`products` becomes `projects`. Today `create_organization_with_product` creates
exactly one product per organization; a project becomes an explicitly created,
one-to-many child of a workspace. Workspace creation still seeds a first project
so a new workspace is never empty.

### Rooms

`discovery_rooms` becomes `rooms`, gaining:

- `project_id` — required; a room lives in a project
- `workspace_id` — retained, denormalized (see below)
- `stage` — `room_stage` enum, default `discovery`

```sql
create type public.room_stage
  as enum ('discovery', 'define', 'design', 'development');
```

Every child record already keyed to a room — messages, mentions, attachments,
evidence, decisions, PRDs, user flows, participants, `ai_tasks` — is untouched.
Because they were already room-scoped, context persists across stages with no
new machinery. That is the central principle falling out of the existing schema
rather than being built.

#### Why `workspace_id` stays denormalized on rooms

Rooms now hang off projects, so workspace could be derived through a join. It is
kept on the row anyway because every RLS policy, the storage-path check, and the
realtime topic check evaluate workspace membership. Forcing a join through
`projects` into each of those policies costs more than one redundant column. A
trigger enforces that `rooms.workspace_id` always matches
`projects.workspace_id`, so the denormalization cannot drift.

### Entities dropped

`Feature`, `FeatureStage`, `ReadinessWarning`-as-conversion-gate, and the
conversion event from the earlier lifecycle design are removed from the model.
None were built. The entire point of this design is that no second room exists to
convert into.

### Migration

Nothing is in production. This is a clean schema change, not a data migration —
no backward-compatibility shims, no dual-write period.

## 6. Stage behaviour

Stage is a **property, not a place**. It renders as a status pill in the room
header (`Design ▾`) and changes through a dropdown.

Stage is deliberately **not** rendered as tabs. A tab strip reading
`[Discovery] [Define] [Design] [Development]` implies four separate destinations
and directly undercuts the model. Tabs in a room are reserved for genuinely
distinct surfaces (Conversation, User Flows, PRD, and so on).

### Rules

- **Light action.** Pick a stage; it changes. No confirmation screen, no review
  step, no summary of what carries forward.
- **Any direction.** Backward moves are allowed. Work is not linear, and a room
  returning from Design to Discovery is a normal event, not an error.
- **Never gated.** No artifact is required to advance. An accepted PRD does not
  gate Define. A designer or developer driving a room may never produce a formal
  PRD, and a gate keyed to one artifact type would encode a single role's
  workflow as everyone's.
- **Readiness is informational.** Missing flows, unanswered questions, or an
  unaccepted PRD may surface as warnings. They never block.
- **Permission:** room owner or workspace admin, matching the existing model.

### Stage identity in the sidebar

Each room row carries a glyph for its current stage. Glyphs, not progress dots:
once a list holds many rooms, a distinct mark is read at a glance while dots
require counting. Final icons come from the boxicons set used throughout the app
(indicatively: search for Discovery, target for Define, palette for Design,
wrench for Development) — not emoji.

## 7. Navigation

### Workspace rail

A vertical rail on the far left, always visible. One click switches workspace.
Create-workspace stays at the bottom of the rail, as today.

An unobtrusive attention dot marks a workspace with something waiting. It carries
no content — you must enter that workspace to see what it is. Workspaces are
frequently different clients, so the boundary is a trust property, not only
visual hygiene.

### Workspace-scoped column

Home, Search, and Settings are scoped to the current workspace. There is
deliberately no merged cross-workspace feed: mixing one client's rooms into
another's view is both cluttered and a boundary a consultant cannot afford to
blur.

### Projects as an accordion

Projects list under the workspace column and expand to reveal rooms. **Only one
project is open at a time** — opening one collapses the other. This bounds the
list at "all projects plus one project's rooms" regardless of how much exists,
without needing scroll management or a collapse-all control.

### Add actions

`◆+` in the workspace section adds a project. Create-workspace lives at the
bottom of the rail. They are deliberately separated: the earlier sketch placed
two unlabelled `+` icons adjacent, and which one did what was unreadable.

### No Project page

Clicking a project expands it in the sidebar. There is no separate Project
overview page. The accordion already answers "what rooms are in this project,"
and the earlier design's Overview / Rooms / Activity / People page would be a
surface with no unique job. It can be added later if a real need appears.

## 8. Progressive emergence

A room accrues structure as structure becomes real. It is never configured
upfront.

### Empty room

A newly created room has **no tabs at all** — not even "Conversation," because
there is nothing to switch between. Showing five empty sections on day one makes
a new room read as unfilled paperwork.

### Emergence rules

Each surface appears independently, on its own condition. There is no fixed
sequence — a room where a PRD is drafted before any user flow shows Conversation
and PRD, with User Flows absent until a flow exists.

| Surface | Appears when |
|---|---|
| User Flows | a user flow exists |
| PRD | a PRD exists (badged Draft / Accepted) |
| Decisions | a decision has been recorded |
| Tasks | tasks exist |
| Overview | at least two other surfaces exist |

The tab strip itself renders only once **two or more** surfaces exist —
Conversation alone needs no navigation, so a room with only conversation shows no
tabs. Conversation is always present in the strip once the strip exists, and is
always the first tab.

**Overview is the exception to independence**: it is gated on other surfaces
existing rather than on its own content, because it is generated from room
activity rather than authored. An overview of an empty room is nothing.

### Two sources, one framework

Structure is proposed by two mechanisms that converge on the same path:

- **Deterministic** — a PRD is generated, so the PRD tab appears. No inference.
  This already works in `room-tab-strip.tsx`.
- **AI-suggested** — the agent notices something that reads like a decision or a
  task and offers it. **Nothing becomes structure without explicit human
  confirmation.**

The AI-suggested path extends `messages.proposed_action`, which already exists
and is currently constrained to `{"kind":"prd_generate"}`. Widening that
constraint to cover decision capture and task creation reuses the established
propose-then-confirm mechanic rather than inventing a parallel one.

### What may update without confirmation

Low-risk derived metadata only: latest activity, active people, linked file
counts, open task counts. Anything that creates a durable record — a decision, a
task, a stage change — requires confirmation. This is the guard against one
misread sentence permanently cluttering a room.

## 9. Starting a room

A new room offers explicit ways in rather than a bare composer, reusing the
starting-point card pattern already on Home
(`apps/web/src/features/home/components/starting-point-cards.tsx`):

- **Paste meeting notes**
- **Start a user flow** — opens the canvas immediately; the User Flows tab
  exists from that moment
- **Just start talking**

Additionally, when a user pastes substantial content, the agent proposes mapping
it as a user flow through the standard `proposed_action` confirm step.

Both paths exist because they catch different users: the card serves someone who
knows they want a flow, the proposal catches someone who dumps in notes and does
not know the feature exists. Neither forces a canvas on someone who only wants to
talk an idea through.

## 10. Membership

Unchanged from today, deliberately.

- One participant list per room, with `view` / `edit` access
- Anyone in a room sees its **full history across every stage**. A developer
  joining at Development can read why a decision was made in Discovery.
- "Active in this stage" is a **display tag, not a permission**

Per-person, time-windowed visibility — hiding Design conversation from someone
who participated only in Discovery — is explicitly not built. It is real
complexity for an unproven need, and it contradicts the principle that context
persists. The blunt instrument already exists: remove someone from the room.
Stage-scoped membership is sub-project 2's subject.

## 11. Authorization

Authorization stays in the database under RLS; no application-layer checks
substitute for it.

- `is_room_participant` and `can_edit_room` are updated for the renamed table
- Room insert validates workspace membership through `workspace_id`
- A trigger enforces `rooms.workspace_id = projects.workspace_id`
- Stage changes are restricted to room owner or workspace admin, enforced in a
  policy rather than in TypeScript
- Project reads and writes are gated on workspace membership

## 12. Failure and edge cases

| Case | Behaviour |
|---|---|
| Stage changed concurrently by two users | Last write wins; the pill reflects committed state. Stage is a single low-stakes column, so locking is unwarranted. |
| Room moved backward | Allowed. Surfaces cleanly in room activity. |
| Project deleted with rooms inside | Blocked. Rooms must be moved or deleted first — silent cascade would destroy conversation history. |
| AI proposes a decision that is wrong | Dismissed without a trace; nothing is recorded. |
| AI proposes while offline / no provider | No proposal appears. Deterministic emergence is unaffected. |
| Room with no project (legacy row) | Cannot occur; `project_id` is `not null` and this is a clean schema change. |

## 13. Verification

Following existing repo conventions:

- **pgTAP** (`supabase/tests/`) — stage transition authorization, workspace
  isolation across the renamed tables, the `workspace_id`/`project_id`
  consistency trigger, project-delete protection
- **Vitest** — emergence logic (which surfaces appear for a given room state),
  accordion single-open behaviour, stage-glyph mapping
- **Playwright** — create a room and confirm it has no tabs; generate a user
  flow and confirm the tab appears; change stage and confirm the sidebar glyph
  updates; confirm a dismissed AI proposal records nothing
- `pnpm check:astryx` — all new UI must use Astryx components

## 14. Design decisions

Decisions made during this design, with their reasoning:

1. **Four stages, not three.** Define exists as its own stage because there is a
   real boundary between "still fleshing out the idea" and "the idea is settled,
   now execute." Discovery/Define/Design/Develop also maps onto the widely known
   Double Diamond, so it reads as familiar rather than invented.
2. **Stage as a pill, not tabs.** Tabs imply separate destinations and would
   undercut the one-room model.
3. **No gates on stage transitions.** Gating Define on an accepted PRD encodes a
   product manager's workflow as universal; designers and developers drive rooms
   too.
4. **Accordion projects, one open at a time.** Bounds sidebar length without a
   separate control.
5. **Glyphs over progress dots.** Faster to scan in a long list; no colour
   dependency.
6. **No cross-workspace Home.** Client separation is a trust boundary.
7. **No Project page.** The accordion already does its job.
8. **Empty room shows nothing.** Structure is earned, not pre-allocated.
9. **AI never creates structure silently.** Confirmation is required for any
   durable record.
10. **Rename despite the cost.** Leaving `discovery_rooms` and `organizations` in
    place would bake a superseded model into every query read for years.

## 15. Open questions

None blocking. Items intentionally left to later sub-projects are listed in §2.
