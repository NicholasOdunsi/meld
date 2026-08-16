# Workspace -> Project -> Room -> Stage

Design for the core model restructure: one persistent Room that moves through
lifecycle stages, replacing the Discovery-Room-converts-into-Feature-Room model.

## 1. Summary

A Room is the permanent home for one piece of work. Discovery, Define, Design,
and Development are states of the same Room, not separate rooms or containers.

The work stays. The stage changes. The people change. The context stays.

Advancing a Room is one authorized state transition. It never creates or
converts to a second room. Every transition is recorded so room activity can
show who changed the stage, when, and in which direction.

## 2. Scope

This is the first of four sub-projects. It covers the structural model,
navigation, and the minimum durable metadata required for progressive room
surfaces.

### In scope

- A `Project` layer between Workspace and Room
- One `Room` entity carrying a `stage` property
- An append-only history of stage changes
- Vocabulary alignment: application-owned `organization` names become
  `workspace`
- Sidebar and room navigation
- Progressive emergence of Conversation, User Flows, PRD, Decisions, and
  Overview
- AI proposals to create a user flow or capture a decision, with explicit
  confirmation and durable dismissal state
- A workspace-level attention indicator that reveals no cross-workspace content

### Deferred to later sub-projects

- **Stage-scoped membership** - the Collaboration Layer / Context Layer split,
  where "active in this stage" becomes a real permission rather than a display
  tag. Sub-project 2.
- **Development-stage content** - domain tasks, engineering tickets, QA, and
  blockers, including the Tasks surface and AI-proposed task creation.
  Sub-project 3.
- **Context graph and "ask the ticket"** - traversable artifact relationships
  and sourced contextual Q&A. Sub-project 4.

`ai_tasks` remains execution infrastructure. It is not the user-facing Tasks
surface and does not make Tasks part of this sub-project.

## 3. Baseline and sequencing

Implementation starts only after `origin/setup-workspace-from-file` has merged.
That branch contributes:

- a tldraw canvas whose document data is persisted by the gateway per room;
- Research Agent routing and room/web research scope;
- per-message provider and model routing;
- PRD section proposals; and
- Conversation, User Flows, and PRD destinations in the room tab strip.

The baseline does **not** yet provide artifact-driven User Flow emergence. Its
User Flows tab is controlled by the canvas trial flag, while the canvas document
is stored outside Supabase. This design adds a durable Supabase `user_flows`
metadata row so the application can answer whether a room has started a flow.

Work lands in this order:

1. Merge the setup branch.
2. Land the vocabulary rename as a mechanical commit and forward database
   migration. Do not change cardinality, authorization, or behavior in that
   commit.
3. Land Projects, Room stages, stage history, and authorization.
4. Land navigation and deterministic progressive emergence.
5. Land AI-suggested user-flow and decision proposals.

No migration history is rewritten. New forward migrations must upgrade an
existing development or staging database as well as build a fresh database.
There is no dual-write or compatibility period because the product is
pre-launch, but existing rows are transformed deterministically.

## 4. Vocabulary rename

The UI already says "Workspace" while the schema and application identifiers
say `organization`. The application-owned vocabulary changes once:

| Today | Becomes | UI label |
|---|---|---|
| `organizations` | `workspaces` | Workspace |
| `organization_id` | `workspace_id` | - |
| `products` | `projects` | Project |
| `discovery_rooms` | `rooms` | Room |

The rename covers database tables, columns, functions, policies, application
types, route parameter names, test fixtures, and user-facing copy that refers to
the Workspace or Room entities.

It does not rename genuine product-domain language. `product_role`, Product
Agent, product manager, product requirements documents, and similar concepts
keep their names. Internal storage bucket IDs `organization-logos` and
`discovery-attachments` also stay unchanged; their policies and code references
continue using those literal IDs.

### URLs

Renaming the dynamic parameter from `[organizationId]` to `[workspaceId]` does
not itself change a URL because the segment value remains the same UUID. The
canonical room route does change from:

```text
/{workspaceId}/discovery/{roomId}
```

to:

```text
/{workspaceId}/rooms/{roomId}
```

Pre-launch links using `/discovery/` may break. No redirect or compatibility
route is required. Workspace Home and Settings URLs retain their existing
shapes with only the route parameter identifier renamed in code.

## 5. Data model

### Projects

`products` becomes `projects`. The table is an explicitly managed, one-to-many
child of a workspace:

```sql
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (id, workspace_id)
);
```

The rename migration adds and backfills `created_by` from the workspace creator.
Workspace creation still seeds a first project, using the existing onboarding
project name, so a new workspace is never empty.

Project deletion uses the Room foreign key's default `on delete restrict`
behavior. A project containing rooms cannot be deleted; its rooms must first be
moved or deleted explicitly.

`projects.workspace_id` and `projects.created_by` are immutable after insert.
Authenticated Project updates receive column privilege for `name` only; moving
a Project between Workspaces is not supported.

### Rooms

`discovery_rooms` becomes `rooms`, gaining:

- `project_id` - required; a room lives in exactly one project;
- `workspace_id` - retained and renamed from `organization_id`;
- `stage` - `room_stage`, default `discovery`.

```sql
create type public.room_stage
  as enum ('discovery', 'define', 'design', 'development');

alter table public.rooms
  add constraint rooms_project_workspace_fk
  foreign key (project_id, workspace_id)
  references public.projects (id, workspace_id)
  on delete restrict;
```

The composite foreign key, rather than a trigger, guarantees that a room and its
project always share a workspace. It also prevents moving a project to another
workspace while rooms still reference it. `workspace_id`, `owner_id`, and direct
updates to `project_id` remain protected room identity fields.

The structural migration maps every existing room to its workspace's existing
renamed project before making `project_id` non-null. The current schema seeds one
product per workspace, so this mapping is deterministic. The migration fails
closed if a workspace has zero or multiple candidate legacy projects instead of
guessing.

Every existing child record keyed to a room remains room-scoped: messages,
mentions, attachments, evidence, decisions, PRDs, participants, and `ai_tasks`.
Context therefore persists across stages without copying child records.

### Stage history

Stage changes are recorded separately from the current state:

```sql
create table public.room_stage_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_stage public.room_stage not null,
  to_stage public.room_stage not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_stage <> to_stage)
);
```

`rooms.stage` is the current value used for fast rendering. `room_stage_events`
is the append-only audit and activity source. The initial `discovery` value does
not create an event; events represent transitions after creation.

### User-flow metadata

Gateway SQLite remains the source of truth for tldraw document content. Supabase
owns a small lifecycle record:

```sql
create table public.user_flows (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
```

Starting a user flow creates this row idempotently before opening the canvas.
The gateway document key remains the Room ID, so no second identifier is needed.
This sub-project does not support deleting a user flow. Once started, the
surface remains part of the Room even if its canvas is temporarily empty.

### AI proposal responses

`messages.proposed_action` remains the immutable proposal payload. The complete
allowed action union after this sub-project is:

```ts
type RoomProposedAction =
  | { kind: "prd_generate" }
  | { kind: "prd_revise" }
  | { kind: "user_flow_generate" }
  | {
      kind: "decision_capture";
      summary: string;
      sourceMessageId: string | null;
    };
```

`summary` uses the same trimmed 1-5,000 character bound as `decisions.summary`.
`sourceMessageId`, when present, must belong to the same room and be included in
the task's frozen context manifest.

Per-user proposal responses are stored independently:

```sql
create type public.proposal_response as enum ('accepted', 'dismissed');

create table public.message_proposal_responses (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response public.proposal_response not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
```

Dismissal creates only this response metadata; it never creates a decision or
user flow. A dismissed proposal stays hidden for that user across reloads but
remains available to other participants. Accepting is idempotent. Decision rows
gain a nullable, unique `proposal_message_id` so concurrent confirmations cannot
create duplicates. Existing PRD and User Flow existence similarly make their
proposal actions resolved for the whole room.

### Removed concepts

`Feature`, `FeatureStage`, `ReadinessWarning` as a conversion gate, and the
conversion event from the earlier lifecycle design are not part of the model.
They were never built.

## 6. Authorization and mutations

Authorization remains in PostgreSQL. Application checks control presentation
only and never substitute for database enforcement.

### Permission matrix

| Action | Workspace member | Room editor | Room owner | Workspace admin |
|---|---:|---:|---:|---:|
| Read project names in workspace | Yes | Yes | Yes | Yes |
| Create, rename, delete project | No | No | No | Yes |
| Create room in a project | Yes | Yes | Yes | Yes |
| Read room and its artifacts | Only when a participant | Yes | Yes | Only when a participant |
| Rename room | No | Yes | Yes | When a participant |
| Change room stage | No | No | Yes | When a participant |
| Move room within workspace | No | No | Yes | When a participant |
| Delete room | No | No | Yes | No |
| Start user flow | No | Yes | Yes | When a participant with edit access |
| Confirm or dismiss proposal | When a participant | Yes | Yes | When a participant |

Workspace administration does not implicitly reveal rooms. An admin must also
be a room participant to read the room, change its stage, or move it. This keeps
the existing room privacy boundary intact.

### Mutation functions

Sensitive room identity and lifecycle columns are not directly writable through
the authenticated table grant. Mutations use narrow functions:

```sql
public.set_room_stage(target_room_id uuid, target_stage public.room_stage)
  returns public.room_stage

public.move_room(target_room_id uuid, target_project_id uuid)
  returns uuid

public.start_user_flow(target_room_id uuid)
  returns public.user_flows

public.dismiss_message_proposal(target_message_id uuid)
  returns public.proposal_response

public.capture_proposed_decision(target_message_id uuid)
  returns public.decisions

public.accept_proposed_user_flow(target_message_id uuid)
  returns jsonb
```

All functions are `security definer`, set `search_path = ''`, validate
`auth.uid()`, lock the relevant row where idempotency or concurrency matters,
and have `PUBLIC` execution revoked before granting access to `authenticated`.

`set_room_stage` returns without writing when the requested stage already equals
the current stage. Otherwise it updates `rooms.stage` and `rooms.updated_at` and
inserts the matching stage event in one transaction. Any forward or backward
transition between enum values is allowed.

`move_room` checks owner-or-participant-admin authority, verifies the target
project belongs to the room's current workspace, and updates only `project_id`
and `updated_at`.

`dismiss_message_proposal` records only the caller's `dismissed` response.
`capture_proposed_decision` and `accept_proposed_user_flow` validate the stored
proposal kind, materialize the artifact idempotently, and record the caller's
`accepted` response in the same transaction. The user-flow acceptance result
includes a user-flow generation task whose `source_message_id` is the proposal
message and whose Room context is frozen at acceptance time. A partial unique
index on proposal source and task kind prevents a retry from creating a second
task, including after the first task reaches a terminal state.

RLS policies continue to protect table reads. `is_room_participant` and
`can_edit_room` are updated for renamed tables. Project reads require workspace
membership; project writes require workspace administration. A proposal response
row is selectable and writable only by its own user while that user remains a
Room participant. Security-definer materialization functions may inspect
responses to enforce idempotency without exposing one person's dismissal to
another participant.

Authenticated users receive direct `UPDATE` privilege only for explicitly
editable Room columns such as `name`; lifecycle and identity columns remain
writable only through the mutation functions above.

## 7. Stage behavior

Stage is a property, not a place. It renders in the room header as a compact
enumerated-state control, for example `Design` with a chevron. The implementation
uses the Astryx Selector or DropdownMenu APIs and Boxicons; it does not hand-roll
a pill or use emoji.

Rules:

- Pick a stage and the mutation runs immediately. There is no confirmation
  screen or artifact gate.
- Any forward or backward transition is allowed.
- Readiness warnings are informational and never block a transition.
- Only the room owner or a participating workspace admin can change stage.
- Success updates the header and sidebar from the committed database value.
- Failure restores the previous value and shows a non-blocking error toast.
- Concurrent changes are last-write-wins. Every committed change still creates
  its own ordered stage event.

Each room row carries a Boxicons glyph for its current stage: Search for
Discovery, Target for Define, Palette for Design, and Spanner for Development.
The mapping is a single tested function shared by the sidebar and any other
stage presentation. Glyph and accessible label communicate the stage without
depending on color.

## 8. Navigation

### Workspace rail

The far-left workspace rail remains always visible on desktop and uses the
existing AppShell mobile navigation behavior. One click switches workspace.
Create Workspace remains at the bottom.

An attention dot appears only when the current user has an unresolved attention
item in that workspace. A workspace-scoped database function returns only
`workspace_id` and `has_attention`; no room name, message, or client content
crosses the inactive-workspace boundary. The dot has an accessible label such as
`Northstar needs attention`.

### Workspace column

Home, Search, AI Connections, and Settings remain scoped to the active
workspace. There is no merged cross-workspace feed.

### Project accordion

Projects form an Astryx `CollapsibleGroup` or equivalent single-open accordion.
All project headings remain visible; only one project's participant-visible
rooms are expanded at a time.

The column has its own vertical scroll region. Single-open behavior bounds the
expanded content but does not eliminate scrolling when there are many projects
or rooms.

`openProjectId` follows these rules:

1. On a Room route, initialize and synchronize it to that Room's `project_id`.
2. On Home or Settings, retain the user's most recently opened project for the
   current workspace in client storage.
3. If the stored project no longer exists, open the first project.
4. Opening another project closes the previous one.

Project triggers use standard disclosure keyboard behavior. Arrow and activation
keys follow the Astryx component contract. The same tree appears in the AppShell
mobile drawer; it is not replaced by a different information architecture.

### Add and move actions

An icon button beside the Projects heading creates a project and is shown only
to workspace admins. Each expanded project has a labeled Add Room icon button;
rooms created there inherit that project without another picker. Room overflow
actions include Move Room for room owners and participating workspace admins.

Create Workspace remains separated at the bottom of the workspace rail. Every
icon-only action has a tooltip and accessible label.

### No Project page

Clicking a project expands it. There is no Project overview route in this
sub-project. The Room URL does not include `projectId`, so moving a Room does not
break its URL.

## 9. Progressive emergence

A room accrues structure as durable artifacts become real. Nothing is configured
up front.

### Empty room

A newly created Room shows the Conversation surface, composer, and starting
actions, but no tab strip. "No tabs" does not mean a blank page.

### Pure emergence rules

The server and client share one pure `getRoomSurfaces` function. Define
`artifactSurfaceCount` as the number of true artifact conditions below:

| Surface | Artifact condition |
|---|---|
| User Flows | a `user_flows` metadata row exists |
| PRD | a PRD exists or its initial generation task is materializing |
| Decisions | at least one decision exists |
| Tasks | deferred; never returned by this sub-project |

The returned surfaces are:

1. Conversation, always.
2. Each artifact surface whose condition is true, in the table order above.
3. Overview after User Flows, PRD, or Decisions when
   `artifactSurfaceCount >= 2`.

The tab strip renders only when the returned list has at least two entries. Thus
Conversation plus one artifact shows tabs; Conversation alone does not.

If the URL requests a surface that is unavailable, the server renders
Conversation and replaces the URL with `?tab=conversation`. If a currently
selected removable surface disappears through another session, the client uses
the same fallback. User Flows cannot disappear in this sub-project; Decisions
can disappear when the last decision is deleted.

PRD retains its Draft or Accepted enumerated-state badge. Overview is derived
from room activity and artifacts; it has no authored persistence row.

### Decisions and Overview presentation

Decisions renders an edge-to-edge chronological List. Each item shows its
summary, author, timestamp, and a link to its source message when one exists.
It is not wrapped in per-row Cards.

Overview is deterministic in this sub-project. It shows the current stage,
latest room activity, participant roster, artifact counts, and the three most
recent decisions. It does not ask an AI model to synthesize a narrative. Every
value is queried from the same room-scoped source rows that control emergence.

## 10. AI-suggested structure

Deterministic emergence and AI suggestions converge on the same durable artifact
creation paths:

- Starting a user flow inserts `user_flows`; the tab appears.
- Generating a PRD materializes a PRD; the tab appears.
- Confirming `decision_capture` inserts a decision; the tab appears.
- Confirming `user_flow_generate` calls `start_user_flow` and queues the existing
  user-flow generation task; the tab appears immediately while generation runs.

The Product Agent may emit a proposal only when its typed response contract
validates. Database settlement independently validates the exact JSON shape,
string bounds, room ownership of `sourceMessageId`, and frozen-manifest
membership before persisting the message.

The UI shows the exact decision summary before confirmation. Confirmation never
asks the model to reinterpret the proposal. The decision RPC copies the already
validated payload and records the proposing message for idempotency and audit.

Nothing creates durable room structure silently. Low-risk metadata such as
latest activity and counts is derived from source rows rather than treated as a
separate AI mutation.

### Dismissal

Dismiss records a per-user `dismissed` response and creates no domain artifact.
It remains hidden for that user after reload. Another participant can still see
and accept it. Once an artifact is created, the proposal is resolved for all
participants.

## 11. Starting a room

An empty Room reuses the starting-point pattern with three explicit actions:

- **Paste meeting notes** - focuses the composer and opens the attachment/paste
  path.
- **Start a user flow** - calls `start_user_flow`, then opens the canvas.
- **Just start talking** - focuses the composer.

Starting a user flow is available only to users with edit access. View-only
participants see the Conversation surface without creation controls.

When substantial pasted content causes the agent to infer a flow, it may return
`{ kind: "user_flow_generate" }`. The normal proposal confirmation path starts
the flow and queues generation. There is no unconfirmed canvas creation.

## 12. Membership

Membership remains one participant list per Room with `view` or `edit` access.
Anyone who can access a Room sees its full history across every stage. "Active in
this stage" remains presentation metadata, not a permission, until sub-project
2.

Removing someone from the Room removes their access to all room history and
artifacts. Stage-scoped or time-windowed visibility is not introduced here.

## 13. Realtime and consistency

`rooms`, `room_stage_events`, `user_flows`, and `decisions` are in the Supabase
Realtime publication. Existing RLS determines which changes a subscriber may
receive.

The room header and workspace navigation subscribe to participant-visible Room
updates. A committed stage or project move updates the header glyph, stage
control, project accordion, and room row without a full page reload. Reconnect
performs an authoritative refetch before resuming subscriptions.

The server-rendered route remains authoritative on first load. Optimistic stage
selection is presentation only; the committed mutation response or subsequent
Realtime event replaces it.

## 14. Failure and edge cases

| Case | Behavior |
|---|---|
| Same stage selected | RPC returns current stage; no event is inserted. |
| Two users change stage concurrently | Last committed value wins; both real transitions are recorded in commit order. |
| Room moves backward | Allowed and recorded in `room_stage_events`. |
| Unauthorized direct stage/project update | Database rejects it; application checks are irrelevant. |
| Target project belongs to another workspace | Composite FK and `move_room` both reject it. |
| Project deleted with rooms inside | Foreign key restricts deletion. |
| Active room's project changes | Navigation moves the room row and opens the new project. Room URL stays stable. |
| Last artifact for active tab is deleted | Conversation renders and URL is replaced with `?tab=conversation`. |
| User starts flow twice | `start_user_flow` returns the existing row. |
| Two users accept one decision proposal | Unique `proposal_message_id` returns the same decision; no duplicate is created. |
| User dismisses proposal | Only that user's response row is stored; no artifact is created. |
| AI is offline or no provider is ready | No proposal appears; deterministic emergence remains available. |
| Legacy workspace has no single project during migration | Migration aborts with a descriptive exception. |
| Realtime disconnects | UI refetches authoritative room/surface state on reconnect. |

## 15. Verification

### pgTAP

- workspace isolation after renamed tables and functions;
- forward migration maps every existing room to exactly one project;
- composite Room/Project workspace foreign key;
- project CRUD authorization and delete restriction;
- stage transition authorization, no-op behavior, and matching event insertion;
- room move authorization and same-workspace enforcement;
- user-flow start idempotency and RLS;
- proposal JSON validation, per-user dismissal visibility, and idempotent decision
  capture;
- workspace attention summary returns only the current user's boolean status.

### Vitest

- `getRoomSurfaces` table cases, including Overview threshold and unavailable-tab
  fallback;
- stage glyph mapping;
- accordion single-open behavior, active-room synchronization, deleted stored
  project fallback, and workspace-specific persistence;
- optimistic stage rollback on mutation failure;
- proposal presentation and per-user dismissal filtering.

### Playwright

- create a Room from a Project and confirm Conversation has no tab strip;
- start a User Flow and confirm the metadata row causes the tab to appear;
- create a PRD before a flow and confirm independent emergence;
- capture a decision and confirm Decisions and Overview emerge at the defined
  thresholds;
- change stage in one browser context and confirm header/sidebar update in a
  second context;
- move a Room and confirm its stable URL and new accordion location;
- dismiss a proposal, reload, and confirm it stays hidden without creating an
  artifact;
- confirm the same decision proposal concurrently and verify one decision;
- verify workspace attention dots reveal no inactive-workspace content.

### Repository checks

- `pnpm check:astryx`
- `pnpm check:contract-enums`
- `pnpm check:sql-arities`
- `pnpm check:sql-discovery` updated or renamed to cover final Room vocabulary
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:db`
- focused Playwright specifications, followed by the full relevant E2E suite

All UI implementation must begin with `pnpm exec astryx build`, then inspect the
named templates and every component API used. Layout uses Astryx components and
tokens; icons come from Boxicons.

## 16. Design decisions

1. Four stages remain Discovery, Define, Design, and Development.
2. Stage is a compact selector in the header, never a tab.
3. Stage transitions are ungated but audited.
4. Current stage and append-only stage history are separate concerns.
5. Projects are a one-open accordion with an explicit scroll region.
6. Room URLs omit Project identity so moves do not break links.
7. A composite foreign key enforces Room/Project workspace consistency.
8. Workspace admins do not implicitly gain Room visibility.
9. Empty Rooms show Conversation and starting actions but no tab strip.
10. Surface emergence is a pure function of durable artifact existence.
11. Supabase stores User Flow lifecycle metadata; gateway SQLite stores canvas
    document content.
12. AI never creates structure silently, and dismissal is durable per user.
13. Domain Tasks and task proposals remain deferred to sub-project 3.
14. Internal storage bucket IDs and genuine product-domain vocabulary are not
    mechanically renamed.
15. Forward migrations preserve existing development data; prior migrations are
    not rewritten.

## 17. Open questions

None blocking for this sub-project. Stage-scoped membership, domain Tasks, and
the context graph remain explicitly deferred as described in Section 2.
