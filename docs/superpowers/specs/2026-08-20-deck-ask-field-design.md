# The deck's ask field

**Date:** 2026-08-20
**Status:** approved, ready to plan

## In plain language

The workspace home screen has one field at the top. Today it only filters project
and room names, and pressing Enter does something slightly unpredictable: it
either jumps to the top matching room, or pops open the "Create Room" dialog.

After this change, the field does one more thing and does all of it predictably:

- **Type a name** — you see matching rooms, projects, and teammates. Press Enter
  to open the first one.
- **Type a question** — nothing matches, so the field offers to ask. Press Enter
  and Meld creates a room, posts your question into it, asks the Product Agent,
  and drops you in the room to watch the reply arrive.
- **Press `⌘↵` at any time** to ask, even when there were matches.

Question-rooms land in a project called **Scratch**, so asking never litters your
real projects. Scratch is the project every workspace already gets at signup —
today it is called "Untitled project". This change renames it and gives it a
job.

The pattern is Dia's omnibox: one field, a list underneath, and an explicit
"ask" row you can always see and always reach by keyboard. Nothing is inferred
from how you phrased your text.

## Why this shape

Three alternatives were considered and rejected:

- **Answering inline on the home screen.** Would need a brand-new AI surface
  that isn't a room: its own transcript, its own streaming, its own history.
  Rooms already do all of that.
- **Guessing intent from phrasing** (a trailing `?`, question-like wording).
  Unpredictable, and unpredictable is worse than an extra keystroke.
- **A second pinned "Search" row**, mirroring Dia exactly. Dia needs one because
  its search results live on the web. Meld's matches are already in the list, so
  the row would only scroll you to rows you can already see.

## Behaviour

### Empty query

Unchanged. The field sits above `PROJECTS`, `TEAMMATES`, and the system links.

### While typing

A results panel opens between the field and `PROJECTS` — the position it
already renders in today. Contents, top to bottom:

| Order | Row | Notes |
| --- | --- | --- |
| 1 | `"<query>" — Ask` | Always present, even with zero matches. Shows a `⌘↵` hint. |
| 2 | Room matches | Name contains the query, case-insensitive. Existing behaviour. |
| 3 | Project matches | Existing behaviour. |
| 4 | Teammate matches | **New.** Teammates are not searched today. Running one opens `settings/members`. |
| 5 | `+ Create project "<query>"` | Existing behaviour. |

The current `+ Start a room about "<query>"` row is **removed**. The Ask row
replaces it.

Matching stays client-side over the projects, rooms, and teammates the page
already loaded. Searching message or PRD content is explicitly out of scope and
becomes its own spec.

### Keyboard

| Input | Result |
| --- | --- |
| `↵` | Runs the highlighted row. |
| `⌘↵` / `Ctrl+↵` | Ask, regardless of what is highlighted. |
| `↑` `↓` | Move the highlight. Does not wrap. |
| `Esc` | Clear the query and close the panel. |
| `⌘K` | Focus the field. **Currently broken** — see below. |

`⌘K` and `⌘N` are already implemented in `features/home/components/deck-shortcuts.tsx`,
which targets `#deck-prompt` — still the console input's id. But nothing imports
`DeckShortcuts` since the console replaced the old deck, so both bindings are
dead. `WorkspaceConsole` mounts it and passes its existing
`setIsCreateProjectOpen` as `onNewProject`. One import and one element.

The highlight defaults to the **first match** when the query matched anything,
and to the **Ask row** when it matched nothing. This is not intent inference: the
rule is "if there is nothing to open, Enter asks."

Mouse users click any row directly; the highlight is a keyboard affordance only.

Every row in the panel is runnable, which is what lets the highlight be a
simple contiguous index. There is no per-teammate page, so a teammate row
opens `settings/members` — the alternative, rows the highlight has to skip,
costs more machinery than the feature is worth.

### Asking

While the ask is in flight the field is disabled and the Ask row reads
`Starting a room…`. On success the browser navigates to the new room. If room
creation itself fails, an inline error appears under the field and the field is
re-enabled.

## The Scratch project

Every workspace already gets exactly one project at creation, named
`"Untitled project"` (`features/workspaces/backend.ts:15`), and the database
holds an invariant that a workspace always has at least one project
(`supabase/migrations/202608110002_projects_rooms.sql`). That project becomes
Scratch.

### Migration

One migration file, following the shape of `202608120001_project_icon.sql`:

1. `alter table public.projects add column is_scratch boolean not null default false;`
2. Backfill: for each workspace, set `is_scratch = true` on the
   earliest-created project. Rename that project to `Scratch` **only where it is
   still literally named `Untitled project`** — a workspace whose owner already
   renamed it and filled it with real work keeps its name.
3. `create unique index projects_one_scratch_per_workspace on public.projects (workspace_id) where is_scratch;`
   — a workspace can never hold two. Created *after* the backfill so the index
   validates the backfill rather than the backfill having to dodge the index.
4. Recreate `create_workspace_with_project` so its `insert into public.projects`
   sets `is_scratch => true`. The function uses an explicit column list
   (`202608110002_projects_rooms.sql:206`), so without this new workspaces would
   default to `false` and have no scratch project at all.

### Application

- `DEFAULT_PROJECT_NAME` becomes `"Scratch"`.
- `ProjectSummary` gains `isScratch: boolean`; `PROJECT_COLUMNS` and
  `mapProject` in `features/projects/repository.ts` carry it.
- `features/projects/fake-backend.ts` and `features/workspaces/e2e-fake.ts`
  seed a scratch project, so E2E and unit fakes match the real invariant.
- `deleteProject` refuses the scratch project, returning the existing `blocked`
  result shape with a new reason code alongside `project_not_empty`.
- Scratch renders in the `PROJECTS` list like any other project — no special
  styling, no pinning, no filtering. It simply accumulates asks.

## The ask server action

`createRoomFromQuestion` in `features/rooms/actions.ts`, modelled directly on
`createRoomFromBrief` (`actions.ts:493`), which already proves this exact
sequence for file imports.

```
resolve the workspace's scratch project id, server-side
  → createRoom({ projectId: scratch, name: deriveRoomNameFromQuestion(q) })
  → revalidatePath(`/${workspaceId}`, "layout")   // so the sidebar shows the room
  → getAgentReadiness()
       ready     → postMessage({ body: `@Product Agent — ${q}`,
                                 mentionsProductAgent: true })
       not ready → postMessage({ body: q })       // plain message, no agent task
  → return { roomId, ready }
```

The caller then pushes `/${workspaceId}/rooms/${roomId}`.

The action takes **only** `{ workspaceId, question }`. It does not accept a
project id. Scratch is resolved server-side via a new
`getScratchProject(workspaceId)` on the projects backend, because a project id
arriving from the browser is untrusted input — the client could post an ask into
any project it named. This is also why `page.tsx` needs no change: the client
never learns the scratch id at all.

`getScratchProject` is total. If a workspace somehow has no row with
`is_scratch` — a legacy workspace the backfill missed, or one whose scratch was
deleted before the guard existed — it creates one named `Scratch` and returns
it. Asking must never fail because of a data gap.

### Invariants, inherited verbatim from `createRoomFromBrief`

- **The room and the message are never rolled back.** Everything after
  `createRoom` is wrapped, and any throw still returns a `roomId` the caller can
  navigate to.
- **A not-ready provider is not an error.** It is the not-ready branch. The room
  is still created and the question still posted as a plain message; the room's
  own composer is the single place that explains a missing provider.
- `revalidatePath` runs before navigation so a single client-side push shows the
  new room in the sidebar without a manual refresh.

### Naming

`deriveRoomNameFromQuestion` lives in a new `features/home/ask-seed.ts`,
beside `upload-seed.ts`'s `deriveRoomNameFromFiles` — the same idea for dropped
files. The opener body and the failure copy live in a new
`features/rooms/ask-opener.ts`, beside `brief-opener.ts`. The split follows the
existing convention exactly: name derivation next to the deck, room copy next
to the room. It also matters mechanically — `actions.ts` is `"use server"`,
where only async functions may be exported, so the failure copy a test needs
cannot live there.

`deriveRoomNameFromQuestion`:

- trims whitespace and collapses runs of it,
- strips a trailing `?`,
- capitalises the first character,
- truncates to the 120-character room-name limit on a word boundary.

Empty input cannot reach it: the Ask row is only offered for a non-empty
trimmed query.

`buildAskOpener` mirrors `buildBriefOpener` and reuses the exported
`PRODUCT_AGENT_MENTION` constant rather than restating the literal.

## Component boundaries

`ui/meld/console.tsx` stays presentational. It owns the field, the row list, and
highlight movement, and emits `onRun(index)`. It knows nothing about rooms,
projects, or asking — so it can be tested without mocking a single server
action.

`features/home/components/workspace-console.tsx` owns what the rows *are* and
what running one does: it builds the row list, holds the query, and calls the
server action.

This split is why the two new test files below divide the way they do.

## Files

### New

| File | Purpose |
| --- | --- |
| `features/home/ask-seed.ts` | `deriveRoomNameFromQuestion` |
| `features/home/ask-seed.test.ts` | its unit tests |
| `features/rooms/ask-opener.ts` | `buildAskOpener`, `ASK_ERROR_MESSAGE` |
| `features/rooms/ask-opener.test.ts` | its unit tests |
| `features/home/components/workspace-console.test.tsx` | **no test exists today** |
| `ui/meld/console.test.tsx` | **no test exists today** |
| `supabase/migrations/<timestamp>_project_scratch.sql` | column, index, backfill, RPC recreate |
| `e2e/deck-ask.spec.ts` | ask → room, end to end |

### Changed

| File | Change |
| --- | --- |
| `features/workspaces/backend.ts` | `DEFAULT_PROJECT_NAME` → `"Scratch"` |
| `features/projects/schemas.ts` | `isScratch` on `ProjectSummary` |
| `features/projects/repository.ts` | select and map `is_scratch` |
| `features/projects/fake-backend.ts` | seed a scratch project |
| `features/workspaces/e2e-fake.ts` | seed a scratch project |
| `features/projects/actions.ts` | `deleteProject` refuses scratch |
| `features/projects/backend.ts` + `supabase-backend.ts` | `getScratchProject` |
| `features/rooms/actions.ts` | `createRoomFromQuestion` |
| `ui/meld/console.tsx` | keyboard nav; `shortcut` prop; honour `isSelected` |
| `features/home/components/workspace-console.tsx` | row assembly, highlight, submit, mount `DeckShortcuts` |

No change to `app/(app)/[workspaceId]/page.tsx`.

Two pieces of existing machinery are wired into rather than duplicated:

- `MeldConsoleRow` already declares an `isSelected` prop and emits a
  `data-selected` attribute, both currently unused. The highlight uses them.
- The `shortcut` prop renders through the existing `MeldKeycap`
  (`ui/meld/keycap.tsx`), which prints a combo exactly as given — so the Ask
  row's `⌘↵` is in the same voice as every other shortcut in the app.

## Testing

**Unit — `ask-seed.test.ts` and `ask-opener.test.ts`**
Name derivation: trailing `?` stripped, first character capitalised, long input
truncated to 120 characters on a word boundary, internal whitespace collapsed.
Opener body: contains the question and the `PRODUCT_AGENT_MENTION` constant.

**Unit — `ui/meld/console.test.tsx`**
`↓` moves the highlight and does not run past the last row; `↑` does not run
past the first; `↵` calls `onRun` with the highlighted index; `Esc` clears.
No server actions involved.

**Unit — `workspace-console.test.tsx`**
Row order matches the table above. Highlight starts on the first match when the
query matched, and on the Ask row when it did not. `⌘↵` asks even with matches
present. Teammates now appear in results. The field disables while an ask is in
flight. The removed `+ Start a room about …` row is gone.

**Unit — `projects/actions.test.ts`** (existing file)
`deleteProject` on the scratch project returns `blocked`.

**Unit — `projects/repository.test.ts`** (existing file)
`is_scratch` maps onto the summary and defaults to `false`.
`getScratchProject` returns the marked project, and creates one when the
workspace has none. Tested at the repository rather than the backend, because
that is where the logic is — the backend only supplies the authenticated
`createdBy` and delegates.

**E2E — `e2e/deck-ask.spec.ts`**
Type a question on the deck, press Enter, land in a room whose project is
Scratch with the question posted as the first message. Modelled on
`e2e/deck.spec.ts` for deck setup and `e2e/product-agent-room-reply.spec.ts`
for the fake agent path.

## Out of scope

Recorded so they are decisions rather than omissions:

- **Content search.** Message and PRD text is not searched. Names only.
- **File attach.** Dia's `+ Add tabs or files`. Meld's file→room path already
  exists as brief import; wiring it to this field is a follow-up.
- **Agent choice.** Every ask goes to the Product Agent. No `@`-mention routing,
  no picker.
- **Inline answers.** Asking always navigates to a room.
- **A bottom action bar** under the results panel.

## Flagged, not fixed here

The console replaced the old deck on this branch and left six components with no
importer other than their own tests: `DeckPrompt`, `StartingPoints`,
`NeedsAttention`, `PendingTicket`, `ProjectColumn`, and — until this change
remounts it — `DeckShortcuts`. Their tests still run and still pass, which makes
the suite look like it covers more of the home screen than it does.

Deleting them is not part of this spec, because whether they are dead or merely
parked is a call for the branch's author, not for this change. Recorded so it is
a decision rather than drift.
