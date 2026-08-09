# Collaborative User Flow Canvas Design

Date: 2026-08-09
Status: Revised after final written-spec review; awaiting approval

## 1. Summary

Meld will add a **User Flows** tab to every Discovery Room. The tab contains one
shared infinite canvas on which a team can generate, edit, review, and organize
multiple user journeys. Each journey is a labeled frame containing a structured
graph of user actions, system responses, decisions, failures, and outcomes.

The canvas is freeform in presentation but structured in meaning. Users may move
and connect elements while Meld retains a validated semantic graph that agents can
generate, revise, and supply to PRD generation.

Generation is explicit. It starts only when a user asks in the Discovery
conversation or enters a request in the User Flows tab. A generated journey is
inserted as a Draft. An agent never silently changes existing canvas content.

The production implementation uses the tldraw SDK for canvas interaction and
`@tldraw/sync` for multiplayer collaboration. Meld self-hosts `@tldraw/sync-core`
through its existing Fastify gateway. The canvas and sync implementation are
licensed dependencies; Meld's semantic `UserFlowGraph` contract remains independent
of tldraw so the product model, AI contracts, and PRD integration stay portable.

No implementation work beyond a disposable technical spike begins until Meld has
a written commercial quote and license terms that cover the intended editor,
self-hosted sync, domains, and renewal model. The semantic and AI contracts are
portable; the client, sync, persistence, undo, and enforcement architecture is
tldraw-specific and would require a new design if the dependency is replaced.

## 2. Goals

- Let teams map a journey before, during, or after PRD creation.
- Generate one coherent primary journey from authorized room context.
- Include important decisions, alternate paths, failures, and outcomes.
- Give humans a freeform but semantically structured editing surface.
- Support simultaneous editing, conflict resolution, live cursors, and presence.
- Make agent revisions inspectable and explicitly accepted or rejected.
- Let reviewed flows inform later PRD generation and revision.
- Link PRD sections and flow elements in both directions.
- Keep meaningful flow activity visible in the Discovery conversation.
- Preserve a canvas-engine-independent semantic and AI contract.
- Meet WCAG 2.2 AA across the supported canvas and review workflows.

## 3. Non-goals

The first release does not include:

- Freehand drawing
- Images, media, embeds, tables, stamps, or generic whiteboard widgets
- HTML or clickable prototype generation
- Export to production application code
- Cross-room canvases
- Automatic PRD rewriting when a flow changes
- Automatic or unreviewed agent changes to existing flows
- Visible generated-source citations on canvas elements
- Deep Figma synchronization
- Editing the graph through the Linear view
- A general-purpose FigJam replacement

tldraw may support some excluded capabilities, but Meld hides and rejects their
tools and record types in this release. They are not implicitly part of the
product because the underlying SDK can render them.

## 4. Product Model

### 4.1 One canvas per Discovery Room

Each Discovery Room owns exactly one user-flow canvas. Multiple journeys live on
that canvas in distinct labeled frames. The User Flows tab includes an outline
that lists frames and moves the viewport to the selected journey.

The canvas exists whether or not the room has a PRD. This supports teams that begin
with a flow and later generate a PRD as well as teams that derive flows from an
existing PRD.

### 4.2 Journey states

Every journey has one of three server-authoritative states:

- **Draft**: Semantically editable and excluded from PRD context by default.
- **Ready**: Reviewed and eligible for PRD context while its stored Ready hash
  matches its current semantic hash.
- **Archived**: Retained but excluded from normal navigation and all agent context
  until restored.

New generated and manually created journeys begin as Draft. Marking a journey
Ready is an explicit server-authorized human action. Agents may recommend it but
cannot perform it.

Ready freezes meaning, not placement. Editors may move or resize Ready frames,
nodes, and notes because geometry is excluded from the semantic hash. The normal
client blocks label, type, connection, and membership changes until the user
chooses **Edit as Draft**. If a stale, faulty, or modified client nevertheless
changes Ready semantics, the hash mismatch immediately makes the journey
ineligible for PRD context and the server demotes it to Draft. Unreviewed meaning
can therefore never enter PRD context under a stale Ready label.

General annotation text is presentation-only and may also change on a Ready
journey. Assumption and open-question note text or attachment is semantic and
remains blocked until **Edit as Draft**.

This is protection against a stale or faulty authorized editor client, not a
privilege boundary: anyone allowed to edit could already choose **Edit as Draft**.
An automatic demotion is nevertheless a visible product failure. Its audit and
conversation event identify the initiating operation and client version, and the
demotion is an operational alert. A Ready transition also establishes an undo
barrier by clearing local canvas undo/redo history for connected editors. Semantic
undo against a Ready journey is blocked; geometry-only undo remains allowed.

Archiving is a server transaction that removes the journey's live tldraw records
and stores a compressed, checksum-verified semantic graph plus presentation data
in `user_flow_journey_archives`. Archived journeys therefore do not consume live
room record or snapshot limits. The archive list remains available from the
outline. Restore validates the current schema, reissues colliding tldraw record IDs
while preserving stable Meld IDs, and refuses when active-room limits would be
exceeded.

### 4.3 Supported elements

The first release supports:

- Journey frames
- One or more start points with distinct trigger labels
- User actions
- System responses
- Decisions
- Failures
- Successful outcomes
- Directed connectors with optional branch labels
- Text
- Sticky notes for assumptions, questions, and general annotations

The compact toolbar exposes only these tools. Multiple start points are allowed
when one journey genuinely has multiple entry triggers, such as an email link and
an in-product action.

## 5. Entry Points And Generation Workflow

### 5.1 Equivalent entry points

A user may request a flow in either place:

1. The Discovery conversation, for example, "Generate the checkout user flow."
2. The persistent agent prompt inside the User Flows tab.

Both routes create the same task type, context package, result contract, and
durable artifact. Starting in conversation additionally produces conversation
task state and a completion event linking to the generated frame.

### 5.2 Context sources

The task receives a frozen authorized snapshot containing:

- The user's request
- Current room messages
- Extracted attachment text permitted for the room
- Evidence and decisions
- The current PRD when one exists
- Existing Ready journeys on the same canvas
- Active accepted PRD-to-flow links relevant to the included artifacts
- Assumption and open-question notes attached to included journeys

Draft and Archived journeys are not included by default. For flow generation or
revision only, the requester may explicitly include named Draft journeys. Draft
journeys never enter PRD generation or revision context. Canvas positions,
selections, viewports, and decorative presentation data are never sent to an
agent.

Ready journeys, explicitly selected Draft journeys, and active links all count
toward the existing hydrated-context limit. Meld never silently truncates them.
When the snapshot would exceed the limit, the user selects which journeys to
include before task creation.

General annotation notes are presentation-only and excluded from agent context.
Assumption and open-question notes are semantic: their text and attachment affect
the journey semantic hash, enter context with the journey, and require **Edit as
Draft** before they can be changed on a Ready journey.

### 5.3 Context readiness

Meld uses two levels of readiness handling:

1. A deterministic preflight rejects obviously empty input, such as a generic
   request in a room with no usable messages, PRD, evidence, decisions, or Ready
   flows. It creates no provider task and asks for the actor, goal, trigger, and
   expected outcome.
2. For non-empty context, the provider result is a discriminated union: a generated
   journey, `needs_context` with one or two focused questions, or
   `needs_journey_selection` with candidate journeys. The two question outcomes
   create no canvas artifact.

A request may perform at most two provider-backed `needs_context` rounds. Selecting
a journey after `needs_journey_selection` does not consume that allowance because
it resolves scope rather than missing product context. After the second
`needs_context` result, the request closes and asks the user for a fuller brief.

A generated journey must identify:

- A user or actor
- The actor's goal
- At least one starting trigger
- A successful outcome
- Enough supported product behavior to connect the journey meaningfully

When one journey dominates, generation proceeds. When several distinct journeys
are plausible, the agent asks the user to select one instead of creating several
unrequested frames.

### 5.4 Successful generation

The agent returns portable semantic graph data without canvas coordinates. Meld:

1. Validates the result against the shared `UserFlowGraph` contract.
2. Rejects dangling edges, invalid kinds, duplicate IDs, and graphs without a start
   or successful outcome.
3. Runs deterministic layout behind a Meld-owned layout interface.
4. Acquires a short PostgreSQL placement lock, recalculates occupied frame bounds,
   and reserves free canvas space.
5. Converts the graph to Meld tldraw records and inserts the complete Draft through
   one server-side tldraw storage transaction.
6. Places material assumptions and unresolved questions as nearby notes.
7. Updates the validated semantic projection.
8. Emits one completion event with a deep link to the new frame.

If primary layout fails, Meld uses a simple ordered fallback. Valid semantic
content is not discarded because positioning failed.

Generated journeys are capped at 75 nodes, 110 edges, and 20 notes and must fit
the existing 256 KiB AI-result limit. The lower generation caps intentionally
leave editing headroom below the stored-journey limits. Larger results are rejected
with a request to split the journey.

## 6. Canvas Experience

Owners, admins, and editors may:

- Create and rename Draft journey frames
- Create, edit, move, resize, and delete supported Draft elements
- Move and resize Ready elements without changing their semantics
- Create, relabel, reconnect, and delete Draft edges
- Preview and apply automatic layout
- Generate a journey
- Request and review agent changes
- Link journeys or nodes to PRD sections
- Request Draft, Ready, and Archived transitions

Viewers may inspect flows, follow deep links, navigate the outline, and see
collaborator presence, but the gateway joins them to tldraw sync in server-enforced
read-only mode.

tldraw supplies pan, zoom, selection, grouping, snapping, copy/paste, undo/redo,
keyboard interaction, touch behavior, and presence. Meld replaces the general
tldraw UI with a focused toolbar and contextual panels built with Astryx. Imports,
pastes, drops, and programmatic writes are filtered to the allowlisted record
schema; unsupported assets and shapes are rejected.

Routine edits do not create Discovery conversation messages.

### 6.1 Automatic layout

Automatic layout first presents a preview. Confirmation is fenced by the journey's
semantic hash, not its geometry hash. If meaning changed during review, the commit
aborts and regenerates the preview. If only geometry changed, accepting layout
deliberately replaces those positions and informs active collaborators that layout
was applied. This avoids a fragile geometry lease while preserving semantic safety.

## 7. Collaboration And Recovery

Human canvas edits use tldraw's native optimistic store and `@tldraw/sync` protocol.
Meld does not layer Yjs or a second mutation protocol underneath it. Document
records are validated by the same exact-version schema on the browser and server.

Concurrent edits to different records merge normally. Concurrent edits to the
same node label use tldraw's record conflict semantics rather than character-level
text merging: one complete label becomes canonical. The MVP shows the converged
value without an inline conflict dialog. The mutation audit retains each update
that reached the server; an edit discarded during client-side rebase survives only
in the seven-day local recovery snapshot.

Document-scoped records are durable. Camera, selection, active tool, and other
session state remain local. Presence records are ephemeral and include cursors,
user identity, and current viewport. The gateway supplies identity from the
authenticated session rather than trusting an identity field chosen by the client.

When disconnected, the tab shows **Offline - changes are on this device**. tldraw
may continue applying optimistic local changes and rebases them through its native
sync client after reconnect. Meld does not claim that changes are shared until the
client returns to `synced-remote`.

Before reconnect and before a fatal sync transition, the client saves a local
recovery snapshot in IndexedDB, scoped to the browser profile, organization, room,
user, and schema version. It is not described as encrypted because its key would
share the same browser trust boundary. If authentication, authorization, schema,
or rebase failure prevents synchronization, Meld keeps the local snapshot for
seven days. The user may inspect it and copy unsynchronized labels and note text as
plain text. Downloadable JSON recovery and recovery-file import are deferred; the
MVP never turns an untrusted local file into canvas records.

## 8. Agent Revision Workflow

An agent never writes directly over an existing journey. A Ready journey must be
changed to Draft before a revision task targets it. A `user_flow_revise` task
freezes the target journey semantic hash and content hashes for every element in
scope. It returns a `UserFlowPatch` containing additions, updates, removals,
reconnections, and optional PRD-link proposals.

The client renders the patch as a proposal overlay:

- Additions are distinguished from current content.
- Removals remain visible until accepted.
- Changed labels and connections show before and proposed states.
- The user may accept or reject the whole proposal.
- Individual changes may be excluded when the remainder still validates.
- Excluding a node also excludes dependent proposed edges.

Before acceptance, Meld refreshes the projection to the current tldraw document
clock and compares every affected element's expected content hash. Unrelated
geometry or edits elsewhere do not create false conflicts. A changed or missing
affected element blocks silent application.

A conflict-free accepted proposal is converted to tldraw records and applied in
one server storage transaction. Every accepted proposal stores an inverse semantic
patch. **Revert proposal** always opens that inverse as a reviewed proposal against
current hashes; it never uses a privileged fast path that could overwrite later
human work.

Rejected proposals remain task outcomes and never become canvas content.

## 9. PRD Links

Links are deliberate artifact relationships, not generated-source citations.

### 9.1 Creating links

- From a PRD section, **Link user flow** opens a journey-or-node chooser.
- From a selected journey or node, **Link to PRD** opens a section chooser.
- A generation or revision result may propose relevant links.
- Agent-proposed links remain pending until a human accepts them.

### 9.2 Presenting and maintaining links

Linked canvas elements show a subtle indicator. Selecting one exposes link details
and actions. Deep links switch tabs and focus the exact stable PRD section, journey,
or node; they never depend on viewport coordinates or copied labels.

Each active link records:

- Stable PRD and section IDs plus the linked PRD version
- Stable journey and optional node IDs
- The linked journey semantic hash and lifecycle state
- The linked node content hash when targeting a node
- State: `active` or `needs_attention`
- Provenance and acceptance attribution

Draft links are allowed for navigation but do not make a Draft eligible for PRD
context. A link becomes `needs_attention` when either target is removed or
materially changed, the journey lifecycle changes, or its stored hashes no longer
match. Meld preserves the original references and never silently retargets them.

On a Draft-to-Ready transition, a `needs_attention` link automatically returns to
`active` only when the same stable targets still exist and every recorded PRD,
journey, and optional node hash still matches. All other links require human repair.
Only active accepted links enter agent context as confirmed relationships.

## 10. Conversation Activity

The Discovery conversation records meaningful artifact events:

- Generation or revision request and durable task state
- Generated Draft journey
- Accepted or rejected agent proposal
- Journey marked Ready or automatically demoted after a semantic mismatch
- Journey archived or restored
- Material PRD link accepted or removed

Each settled event is concise and deep-links to the relevant frame or node. Drag,
resize, text-edit, and connector operations do not create messages. Idempotent task
settlement prevents duplicate events.

## 11. Portable Semantic Model

The semantic model is independent of tldraw. `@meld/contracts` defines
`UserFlowGraph`, `UserFlowPatch`, and the following concepts. Agent providers,
readiness validation, PRD context, evaluation fixtures, and exports depend on these
contracts rather than tldraw record types.

### 11.1 Canvas and journey

`UserFlowCanvasProjection` contains the Discovery Room ID, schema version, tldraw
document clock, canonical semantic hash, journeys, nodes, edges, and notes. It is a
rebuildable, validated projection, not a second editable canvas authority.

`UserFlowJourney` contains a stable ID, name, actor, goal, one or more triggers,
successful outcome, frame geometry, semantic hash, and layout hash.

`UserFlowJourneyMetadata` lives in PostgreSQL and contains status, accepted Ready
hash, creation and lifecycle attribution, and timestamps. tldraw records may show
a display mirror, but authorization and PRD-context decisions use this metadata.

### 11.2 Nodes, edges, and notes

`UserFlowNode` contains a stable ID, journey ID, kind (`start`, `user_action`,
`system_response`, `decision`, `failure`, or `outcome`), label, optional detail,
geometry, and canonical content and presentation hashes.

`UserFlowEdge` contains a stable ID, journey ID, source and target node IDs,
optional branch label, and canonical content hash. Cross-journey flow edges are not
allowed.

`UserFlowNote` contains a stable ID, text, kind (`assumption`, `open_question`, or
`general`), geometry, optional journey or node reference, and content and
presentation hashes.

Semantic hashes use canonical JSON with sorted stable IDs and exclude geometry,
tldraw record IDs, selection, viewport, style-only properties, and `general` note
content. Assumption and open-question note content and attachment are semantic.
Presentation hashes cover durable frame, node, and note geometry plus general-note
content.

### 11.3 tldraw mapping

The canvas adapter maps portable concepts to allowlisted Meld custom shapes and
bindings:

- `meld-journey-frame`
- `meld-flow-node`
- `meld-flow-note`
- `meld-flow-arrow` plus validated endpoint bindings

Every record carries its stable Meld ID and journey ID. The browser and sync server
register identical validators and migrations. The adapter supports both directions:
semantic graph to atomic tldraw records, and tldraw snapshot to validated semantic
projection. Round-trip contract tests prevent canvas-specific data from leaking
into agent contracts.

## 12. Invariants And Readiness

The tldraw schema rejects malformed properties, unknown Meld shape kinds, invalid
string lengths, and unsupported document record types. The semantic projector
classifies invalid relationships as Draft warnings and excludes them from Ready
context. A journey cannot transition to Ready unless:

- It has one or more starts, each with a non-empty distinct trigger.
- It has at least one successful outcome.
- Every live node is reachable from at least one start.
- Every start can reach at least one successful outcome; it may also reach clearly
  labeled terminal failures.
- Every decision has at least two outgoing edges with distinct non-empty labels.
- Every non-terminal action or response has an outgoing edge.
- Every non-terminal failure reaches a live `user_action` or `system_response` from
  which a terminal outcome or failure remains reachable.
- Every node can reach a terminal outcome or failure.
- Every cycle has a path that exits to a terminal node.
- Every edge connects two nodes in the same journey.
- Per-journey and per-canvas limits are satisfied.

Drafts may be temporarily incomplete. The projector reports warnings after changes,
and the server runs the same deterministic validator inside every Ready action.
tldraw manages its own synchronization tombstones; Meld does not add a second
tombstone or garbage-collection system in the MVP.

For dangling endpoints, cross-journey edges, or bindings to removed records, the
warning panel offers **Repair flow** with an exact preview of the records it will
remove or detach. Repair is a user-confirmed server storage transaction, never an
automatic semantic rewrite.

Undo remains tldraw's user-scoped document behavior. Because removing a node also
removes or invalidates its attached bindings, undo may affect another collaborator's
later edge to that node. The UI reports the resulting repair; it never leaves a
dangling edge in the semantic projection. Server-authored generation, layout, and
accepted proposal transactions enter clients as remote changes and never enter a
user's local undo stack. The Ready undo barrier prevents older semantic history
from being replayed against reviewed content.

## 13. Client Architecture

The User Flows feature boundary owns:

- A dynamically loaded tldraw editor and exact-version sync client
- Meld custom shape and binding utilities
- The focused tool palette and journey outline
- Generation prompt and task state
- Readiness warnings and lifecycle actions
- Proposal review overlay
- PRD-link inspection and selection
- The projection-driven Linear view

Automatic layout uses a deterministic graph library such as ELK behind a
Meld-owned interface. Agent output never contains tldraw coordinates or records.

All surrounding chrome, dialogs, prompts, status, and review UI use Astryx. The
tldraw stylesheet is isolated to the canvas boundary. Meld does not override
global Astryx tokens or introduce general-purpose application CSS to accommodate
the SDK.

## 14. Sync And Persistence Architecture

The existing Fastify gateway gains an authenticated WebSocket route:

`/canvas/:roomId`

It is separate from the connector's device-authenticated `/ws` protocol. A browser
connection presents the current Supabase session. The gateway verifies organization
membership, room access, and role before joining the tldraw room. Editors connect
read-write; viewers connect using tldraw's server-enforced read-only session mode.

The gateway creates exactly one active `TLSocketRoom` for each Discovery Room in
the private-MVP process. It uses the same exact tldraw package version and schema
as the web client. `TLSocketRoom` handles WebSocket synchronization, conflict
resolution, presence, session recovery, chunking, and store clocks.

### 14.1 Storage

For the single-instance private MVP, each room uses tldraw's `SQLiteSyncStorage`
through Node's SQLite support on a persistent gateway volume. A thin
`MeldCanvasStoragePolicy` decorator runs inside the same SQLite transaction and
rejects unsupported records, count-limit violations, and oversized resulting
snapshots before commit. It does not alter tldraw clocks, conflict resolution, or
wire messages. The same SQLite transaction writes a local replication-and-audit
outbox entry containing the resulting clock, forward diff, authenticated session,
client version, and touched record IDs.

The deployed runtime is pinned to Node `22.23.2`. SQLite runs in WAL mode with
`synchronous=FULL` and foreign-key checking enabled. Phase 0 verifies that the
selected host provides a genuinely persistent, single-attached volume whose
filesystem honors SQLite fsync and atomic-rename guarantees. A host that cannot
meet those requirements cannot run this architecture.

A canvas mutation is acknowledged after its synchronous SQLite transaction
commits. That acknowledgment means **durable on the gateway volume**, not remotely
replicated. The UI uses **Synced** for connected collaboration and exposes a
degraded backup notice only when the remote-replication threshold is crossed; it
does not describe every acknowledged edit as remotely backed up.

### 14.2 Remote replication and restore

After each SQLite commit, an outbox dispatcher appends the resulting ordered tldraw
clock and forward record diff, with a checksum, to the PostgreSQL
`user_flow_canvas_journal` and writes the authenticated audit row. This replication
is asynchronous so it does not delay normal sync acknowledgment. Target replication
lag is five seconds. At 15 seconds the gateway pages operations; at 30 seconds it
moves affected rooms to read-only until the journal and audit outbox catch up. This
bounds acknowledged-data loss after complete volume loss to a 30-second RPO.

The gateway also writes a compressed, checksum-verified full room snapshot to
`user_flow_canvas_snapshots` every five minutes while active and during clean room
eviction. Journal entries are retained until a later full snapshot is restored,
validated, and verified to cover their clocks. Meld retains the newest 12 hourly
snapshots and 14 daily snapshots.

A restore loads the newest checksum-valid snapshot and replays later journal diffs
in clock order. Before reopening read-write access, a reconciliation pass:

1. Validates the tldraw schema and record limits.
2. Rebuilds the semantic projection from the restored clock.
3. Demotes Ready metadata whose accepted hash no longer matches.
4. Re-evaluates PRD links and marks stale relationships `needs_attention`.
5. Marks open proposals conflicted when their target hashes no longer match.
6. Records the restore source, final clock, and reconciliation results in audit.

Process restart with an intact volume has a five-minute RTO target. Complete volume
loss has a 30-minute RTO and 30-second RPO target. These targets are explicit
private-MVP tradeoffs, not equivalent to synchronous multi-region durability.

PostgreSQL stores journey lifecycle metadata, PRD links, proposal records, audit
events, and the latest validated semantic projection. Projection work is coalesced
to the latest tldraw document clock with maximum queue depth one per room. Ready,
agent-patch, and PRD-context operations synchronously refresh the projection from
the current room storage before evaluating hashes.

The tldraw store is authoritative for collaborative canvas records. PostgreSQL is
authoritative for lifecycle and cross-artifact business records. The projection is
rebuildable and is never edited directly. A periodic verifier rebuilds it from the
tldraw snapshot and compares its clock and hash to the stored projection.

### 14.3 Server-authored operations and attribution

Generated insertion, accepted proposal application, and confirmed automatic layout
use a server-side tldraw storage transaction so all related records appear
atomically. Lifecycle and PRD-link actions use authenticated application RPCs.

Ready stores the semantic hash validated at the current tldraw clock. Effective
Ready eligibility always requires both `status = ready` and a matching current
semantic hash. This hash rule closes the non-atomic boundary between SQLite canvas
storage and PostgreSQL metadata.

For every processed durable client diff, the gateway appends a compact audit row
containing organization, room, authenticated actor and session, client version,
resulting tldraw clock, operation origin, and touched record IDs. Record-authored
`meta` is never trusted as attribution. Audit capture does not participate in
conflict resolution, but the same 30-second replication backpressure applies if
audit persistence is unavailable. Audit retention follows the room deletion and
organization-erasure policy in Section 23.3.

### 14.4 Single-authority deployment

The web app, Fastify API, connector WebSocket, and tldraw WebSocket may be hosted
under one application deployment. The gateway needs a persistent volume for its
SQLite sync store; the tldraw commercial license does not provide hosting.

Before opening a `TLSocketRoom`, the gateway obtains a PostgreSQL session-scoped
advisory lock keyed by organization and room ID on a dedicated database connection.
It holds that connection for the room lifetime and releases it only after room
eviction. If the lock is unavailable, the gateway refuses to open a second
authority and asks the client to retry. Idle rooms are evicted two minutes after
their last session, subject to final replication and snapshot completion.

Private-MVP deployment uses a recreate strategy: stop and drain the old sync
gateway before starting the new one, with no rolling overlap. Shutdown first stops
new sync connections, notifies clients to reconnect, allows up to 20 seconds for
active sync traffic to settle, flushes journal and audit work, writes final room
snapshots, evicts rooms, and releases advisory locks. The process receives a
60-second termination grace period; forced termination relies on PostgreSQL
session closure to release locks and on journal replay for recovery.

Before horizontal scaling, Meld must add deterministic room affinity while keeping
the advisory-lock guard, or move the sync route to a supported room-isolated
deployment such as the tldraw Cloudflare Durable Object template. Two independent
`TLSocketRoom` instances can therefore be detected and refused rather than merely
forbidden by convention.

Client and server tldraw versions are pinned exactly and deployed together. An
incompatible client is refused with a refresh instruction. The MVP uses tldraw's
declared shape and record migrations but does not attempt an independent online
Meld migration engine. An incompatible room is disabled for manual recovery from
its last valid snapshot.

## 15. AI Contracts And Task Lifecycle

Shared contracts add:

- Task kinds `user_flow_generate` and `user_flow_revise`
- A context extension containing Ready flows, active accepted links, and explicitly
  selected Draft-flow context for flow tasks
- A discriminated `UserFlowGenerationResult`
- A validated `UserFlowGraph`
- A validated `UserFlowPatch`
- Optional proposed PRD links

The connector remains content-only. It receives authorized structured context and
returns structured JSON. It never accesses the browser canvas, tldraw records,
repository, arbitrary files, shell commands, or local secrets.

Generation and revision use the existing initiating-user, paired-device, provider,
queueing, progress, cancellation, and settlement model. Results enter the canvas
only after contract validation, permission revalidation, and settlement fencing.

## 16. Authorization And Security

- Canvas access inherits Discovery Room access.
- Owners, admins, and editors connect read-write; viewers connect read-only.
- WebSocket authentication uses the current Supabase session.
- Cross-organization room IDs, element IDs, and PRD links are rejected.
- Server-authored operations revalidate permission at execution time.
- Session identity and attribution come from server-known user records.
- Every durable client diff receives an authenticated server-side audit row with
  actor, room, clock, origin, client version, and touched record IDs.
- Provider output cannot supply ownership, status, or attribution fields.
- The server schema allowlists Meld record types and validates all custom props.
- Text labels and notes are untrusted content and escaped when projected or rendered.
- Image, media, embed, bookmark, and asset uploads are rejected in the MVP.
- The gateway enforces connection, rate, record-count, and payload limits.
- Permission loss closes the read-write session and reconnects only if the user
  still has viewer access.

## 17. Failure Handling

### Insufficient or ambiguous context

Ask focused questions or present journey choices. Create no speculative frame.

### Provider failure or malformed output

Use existing durable task states. Reject malformed output before a storage
transaction, preserve a redacted diagnostic, and offer retry.

### Canvas disconnection

Show offline state, preserve the local recovery snapshot, and let tldraw perform
native reconnect and rebase. Do not claim shared state or gateway-volume durability
while disconnected.

### Permission or fatal sync rejection

Preserve a seven-day local recovery snapshot, switch to read-only when permitted,
and let the user inspect and copy unsynchronized text. Never retry unauthorized
changes silently and do not offer JSON import in the MVP.

### Room authority unavailable

If the PostgreSQL advisory lock is held by another gateway, refuse to create a
second room authority and return a retryable `room_authority_unavailable` state.
The client remains read-only on its last validated projection until reconnect.

### Projection lag or mismatch

Keep collaborative editing available but block Ready, proposal acceptance, and PRD
context reads until a synchronous rebuild succeeds. Emit an operational alert when
the verifier finds divergent hashes.

### Stale agent proposal

Highlight conflicting operations and require a new or manually resolved proposal.
Never overwrite newer human edits.

### Ready semantic mismatch

Exclude the journey from PRD context immediately, demote it to Draft, and record
one conversation and audit event.

### Layout failure

Use the ordered fallback and retain valid semantic content.

### Broken PRD link

Mark it `needs_attention` and preserve original target metadata.

### Capacity limit

The transactional storage policy rejects the operation that would cross a declared
limit. If an incompatible or faulty client nevertheless leaves a room beyond a
limit, the room enters **Maintenance mode**. Normal writes stop, but owners retain
server-authorized **Archive journey**, **Delete journey**, and **Repair flow**
actions. Those actions operate directly through validated storage transactions and
are the only mutations allowed until the room returns below every limit.

### Local SQLite or remote replication failure

SQLite transaction failure prevents durable sync acknowledgment and marks the room
unavailable. PostgreSQL journal or audit lag pages at 15 seconds and forces the
affected room read-only at 30 seconds. Snapshot-backup failure alerts operations;
an active room with no verified snapshot in 15 minutes also remains ineligible for
rollout expansion.

### License invalid or near expiry

Alert on the declared countdown schedule. Before the vendor's invalid-key behavior
can appear inside a customer room, disable new canvas sessions and serve the
projection-driven Linear view. Exact treatment of already-open sessions and the
safety margin before expiry are set from the written vendor terms obtained in
Phase 0; absent a documented safe behavior, Meld disables the canvas 24 hours
before expiry.

## 18. Accessibility

Every journey has a synchronized **Linear view** derived exclusively from the
validated PostgreSQL projection. It remains available when the live canvas or sync
feature is disabled. It:

- Presents starts, actions, decisions, labeled branches, failures, loops, and
  outcomes as a navigable ordered outline.
- Announces node type, label, destinations, readiness warnings, lifecycle, and
  link state.
- Supports navigation to a canvas element and proposal review without pointer input.
- Is read, navigate, and review only in the MVP.

The canvas supplies visible focus, keyboard selection and movement, keyboard edge
creation, zoom controls, a skip path to Linear view, reduced motion, and no
color-only meaning. Editing remains available through the keyboard-operated canvas,
not through a second outline editor. Automated checks are supplemented by complete
keyboard-only and macOS VoiceOver acceptance passes.

## 19. Observability

Meld records and alerts on:

- Active rooms and sessions by role
- Sync connections, reconnects, fatal sync errors, and schema rejections
- Incoming sync and presence message rates
- SQLite transaction latency and failure count
- PostgreSQL journal and audit lag, append failures, and forced read-only rooms
- Per-connection WebSocket buffered bytes and backpressure disconnects
- Projection clock lag, rebuild latency, verifier mismatch, and invalid-record count
- Snapshot age, checksum failure, backup failure, and restore duration
- Every Ready hash mismatch and automatic demotion, including actor, operation
  origin, and client version
- Room advisory-lock contention and authority-unavailable responses
- Agent proposal conflict and rejection rates
- Generation latency, clarification rate, validation failure, and layout fallback
- Commercial license-key validity and days until expiry, with alerts at 60, 30, 14,
  7, and 1 day

The verifier runs every five minutes for active rooms and daily for inactive rooms.
Any projection mismatch blocks business operations that consume the projection
until repair completes.

## 20. Testing Strategy

### Contract and adapter tests

- Valid and invalid graph structures, multiple starts, reachability, recovery, and
  terminal-path rules
- Duplicate IDs, dangling or cross-journey edges, decision labels, and cycles
- Portable graph to tldraw record to portable graph round trips
- Exact client/server custom-shape schema parity
- Unsupported record, paste, import, drop, and asset rejection
- Semantic hashes excluding geometry and presentation hashes including geometry
- Context selection including Ready, selected Draft, and active-link size accounting
- Automatic and fallback layout determinism
- Patch validation and inverse-proposal generation
- Link staleness and hash-matched automatic reactivation

### Gateway and persistence tests

- Organization, room, and role authorization
- Server-enforced viewer read-only sessions
- A second gateway process against the same PostgreSQL database is refused the
  same room by its advisory lock, whether or not it can see the first volume
- Graceful shutdown drains, journals, snapshots, evicts, and releases locks within
  the 60-second termination window
- Durable SQLite restart with WAL and `synchronous=FULL`
- Journal replay, snapshot checksum validation, RPO/RTO measurement, and
  post-restore reconciliation of Ready metadata, links, and proposals
- Server storage transactions for generation, proposal acceptance, and layout
- Authenticated per-diff attribution with touched record IDs and tldraw clock
- Projection rebuild and periodic divergence detection
- Ready hash safety across concurrent canvas and lifecycle writes
- Ready transition clears prior history; geometry-only undo remains; semantic undo
  is blocked; server-authored changes never enter local undo
- Permission loss during an active session
- Exact-version refusal and manual incompatible-room recovery
- Rate limits and WebSocket backpressure behavior

### Connector tests

- Provider-neutral prompts contain only authorized semantic context
- Draft and Archived flows are excluded unless a Draft is explicitly named for a
  flow task; Drafts remain forbidden in PRD context
- Active accepted links are included and `needs_attention` links are excluded
- `needs_context` and `needs_journey_selection` create no artifact
- Malformed and oversized results fail without partial canvas changes

### Browser end-to-end tests

- Generate from conversation and from the User Flows tab
- Ask clarification without creating a frame
- Require selection among multiple candidate journeys
- Two editors concurrently edit and converge
- Concurrent same-label editing converges; every update received by the server is
  audited and a client-discarded value remains available in local recovery
- Disconnect, edit, reconnect, rebase, and inspect or copy rejected local text
- Verify cursors and presence are visible only to room members
- Review, partially accept, reject, conflict, and revert agent proposals
- Apply layout after concurrent geometry changes and abort after semantic changes
- Move Ready elements while blocking semantic edits until Edit as Draft
- Prove a Ready hash mismatch immediately excludes and demotes the journey with an
  explanatory conversation event and operational alert
- Create, follow, stale, reactivate, and repair PRD links
- Preview and accept repair of dangling or cross-journey edges
- Enter capacity Maintenance mode and recover through archive/delete-only actions
- Verify viewers cannot mutate through the UI or direct sync messages
- Disable an expiring or invalid license before vendor failure UI appears and serve
  the projection-driven Linear view
- Verify routine edits do not create conversation noise
- Complete supported editor and viewer workflows with keyboard and VoiceOver

### Load and recovery tests

- Twenty-five active sessions meet synchronization targets
- A room sustains 250 record changes per second for 60 seconds without corruption
- Presence coalescing holds each client to 20 updates per second
- Outbound backpressure disconnects and cleanly resynchronizes a slow client
- Process termination after SQLite commit restores the acknowledged state
- Restore from every retained backup class
- Complete volume loss stays within the 30-second RPO and 30-minute RTO
- Projection corruption is detected and rebuilt from the canvas snapshot

### AI quality gate

The repository stores a versioned evaluation set and rubric. The scorer separately
grades actor, goal, triggers, primary path, supported branches, failures, outcomes,
and unsupported invented behavior. A material invention is any node or edge that
changes permissions, money movement, data retention, external side effects, or a
required product state without support in the frozen context. Changing the rubric,
scorer, or fixtures requires an explicit evaluation-version change.

## 21. Limits And Service Targets

The private MVP enforces:

- 50 live Draft or Ready journeys per canvas
- 200 cold-stored Archived journeys and 250 total journeys per Discovery Room
- 100 live nodes, 150 live edges, and 30 live notes per journey
- 2,500 live semantic elements across one canvas
- 200 characters per node label, 80 per edge label, and 2,000 per note or detail
- 10 MiB maximum serialized room snapshot with no binary assets
- 25 simultaneous canvas sessions per Discovery Room
- 20 simultaneously active canvas rooms per gateway instance, matching its
  dedicated advisory-lock connection budget
- 60 incoming sync messages per second per connection averaged over ten seconds,
  with a burst of 120 over two seconds
- 20 presence updates per second per connection, latest update winning
- 2 MiB maximum outbound WebSocket buffer per connection before controlled
  disconnect and resynchronization
- Five flow-task starts per user per room per ten minutes and twenty per hour
- Two provider-backed missing-context rounds per request
- Ten minutes maximum claimed provider execution, excluding queue wait

The private MVP targets:

- p95 remote canvas visibility below 250 ms in-region
- p95 synchronous SQLite storage transaction below 100 ms
- p95 validated projection lag below one second during active editing
- p95 PostgreSQL journal and audit lag below five seconds, page at 15 seconds, and
  forced read-only at 30 seconds
- No full snapshot older than 15 minutes for an active room
- Five-minute process-restart RTO with an intact volume
- Thirty-minute complete-volume-loss RTO and 30-second RPO
- Generated layout with no overlapping nodes or frames, no clipped labels, a
  consistent primary direction, and visible decision labels
- Successful restore from the newest valid snapshot in every recovery run

## 22. Acceptance Criteria

The first release is complete when:

1. Every enabled Discovery Room has one authorized collaborative User Flows canvas.
2. A user can generate a journey from either entry point. Across at least 20
   representative contexts per provider, at least 90% pass the versioned rubric
   without a material invented behavior.
3. Insufficient input creates no speculative artifact.
4. A valid result creates exactly one atomic Draft with valid layout.
5. Supported context produces user actions, system responses, decisions, important
   failures, branches, and a successful outcome.
6. Twenty-five simulated sessions converge while meeting synchronization targets.
7. Existing content changes only through human edits or accepted agent proposals.
8. A stale proposal cannot overwrite newer affected content.
9. Only Ready journeys with matching current semantic hashes enter PRD context.
10. Humans can create and follow bidirectional links and accept proposed links.
11. Meaningful lifecycle events appear once without routine canvas noise.
12. Cross-tenant, viewer, revoked-user, unsupported-record, and malformed-provider
    mutations fail closed.
13. The supported experience passes automated, keyboard-only, and VoiceOver checks.
14. A validated projection can be rebuilt from every retained canvas snapshot.
15. The canvas runs through Meld's gateway without a managed collaboration service.
16. Phase 0 commercial and technical gates passed before feature implementation,
    and the production environment has a valid monitored tldraw license key.

## 23. Rollout, Licensing, And Disablement

### 23.1 Decision history and Phase 0 gate

The first design treated avoiding a paid canvas dependency as a goal and selected
React Flow plus Yjs. Written review showed that this required Meld to build a
freeform editor, conflict policies, offline reconciliation, server command system,
tombstone model, and migration framework before delivering the product workflow.
The user then explicitly chose tldraw after comparing that ownership cost with
tldraw and Excalidraw. This design accepts a commercial dependency to reduce
canvas and collaboration risk; it does not treat the reversal as free.

Before implementation begins, except for a disposable maximum two-engineering-day
technical spike, Meld must receive and approve a written tldraw quote and terms
that answer:

- Whether commercial editor use and self-hosted `@tldraw/sync-core` are covered by
  one price or separately priced
- Which production, staging, preview, local, and customer-owned domains the key
  covers and how domains are changed
- Exact runtime behavior before, at, and after key expiry or invalidation,
  including whether a watermark, disabled editor, or grace period appears
- Renewal term, renewal notice, price-escalation terms, cancellation rights, and
  data-export or transition rights
- Current trial length, permitted environments, telemetry, and conversion terms

The currently advertised trial length is not a planning guarantee; the signed or
written vendor terms at procurement time control. Procurement evidence records the
key expiry date and responsible owner without committing the secret key to source.

The Phase 0 technical spike must also prove exact-version client/server sync,
server read-only sessions, authenticated mutation-audit hooks, server-authored
transactions excluded from local undo, the pinned Node/SQLite configuration, and
fsync behavior on the intended persistent volume. Failure of either the commercial
or technical gate returns the product to design selection before feature code is
built.

### 23.2 Rollout and disablement

The feature ships behind an organization allowlist and
`MELD_USER_FLOW_CANVAS_ENABLED`. Database changes are additive. The first enabled
visit lazily creates an empty versioned room and metadata record.

After Phase 0, rollout proceeds through local fake-provider tests, internal
workspaces, and then a small private cohort. Expansion requires green authorization,
convergence, restore, accessibility, AI-quality, and load gates plus observed SLO
compliance.

tldraw is source-available but requires a production license key for commercial
use. The tldraw license supplies software rights and sync packages; gateway
compute, persistent storage, backups, and operations remain Meld's responsibility.

Disabling the feature stops generation and new read-write sync sessions without
deleting data. The tab falls back to the last validated projection-driven Linear
view. Existing rooms remain recoverable from SQLite and remote snapshots.

If licensing is not approved or becomes invalid, backups become stale, the gateway
cannot meet its targets, or tldraw client/server compatibility cannot be maintained,
the kill switch remains off.

### 23.3 Room deletion and organization offboarding

Deleting a Discovery Room immediately closes sync sessions, prevents new room
locks, and starts a 30-day soft-deletion period. The room disappears from product
views while its SQLite records, PostgreSQL journal and snapshots, projection,
archives, links, proposals, and audit rows are marked for deletion under one
server-issued deletion ID. Restore during that period is owner-authorized and
audited. At expiry, a verified purge removes every listed store and records a
tombstone containing only deletion ID, organization ID, completion time, and
checksums of the deleted object inventory.

Organization offboarding applies the same workflow to every room and prevents new
canvas sessions immediately. A contractual or user-requested shorter erasure period
overrides the default. Browser recovery snapshots cannot be remotely erased, so
the client purges them on the next authentication failure, room-deleted response,
or seven-day expiry.

### 23.4 Portability boundary

`UserFlowGraph`, `UserFlowPatch`, AI result contracts, readiness rules, stable
artifact IDs, and PRD-link semantics are canvas-engine independent. The tldraw
record adapter provides export into that portable model.

The sync protocol, storage files and clocks, presence, conflict behavior, undo,
custom-shape rendering, client-side Ready guard, server transactions, and much of
the enforcement and recovery architecture are tldraw-specific. Replacing tldraw
would preserve product data and agent contracts but still require a new client,
sync, storage, enforcement, and migration design.

## 24. Key Decisions

- Generation is available before or after PRD creation.
- Every generation or revision is explicitly requested.
- One shared canvas contains all room journeys in labeled frames.
- The presentation is freeform while the underlying flow is structured.
- New generated journeys are Drafts.
- Ready freezes semantics but permits geometry changes.
- Agent revisions are reviewed proposals, not direct mutations.
- Only hash-matching Ready flows inform PRDs.
- Generated-source citations stay off the canvas.
- Assumptions and questions appear as notes.
- PRD links are bidirectional and agent proposals require human acceptance.
- Meaningful flow activity appears in conversation; routine edits do not.
- tldraw replaces React Flow and Yjs as the canvas and collaboration engine.
- Meld self-hosts tldraw sync in the existing gateway for the private MVP.
- A written, acceptable tldraw quote and terms are an implementation prerequisite,
  not a post-build release check.
- PostgreSQL advisory locks and recreate deployments enforce one room authority.
- SQLite acknowledgment is locally durable; asynchronous PostgreSQL journaling
  bounds complete-volume-loss RPO to 30 seconds.
- The semantic graph, AI contracts, readiness, stable IDs, and link semantics are
  portable; sync, storage, undo, enforcement, and recovery are not.
