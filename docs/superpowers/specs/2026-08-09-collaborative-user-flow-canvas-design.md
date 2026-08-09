# Collaborative User Flow Canvas Design

Date: 2026-08-09
Status: Revised for tldraw; awaiting final written-spec review

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

Draft and Archived journeys are not included by default. For flow generation or
revision only, the requester may explicitly include named Draft journeys. Draft
journeys never enter PRD generation or revision context. Canvas positions,
selections, viewports, and decorative presentation data are never sent to an
agent.

Ready journeys, explicitly selected Draft journeys, and active links all count
toward the existing hydrated-context limit. Meld never silently truncates them.
When the snapshot would exceed the limit, the user selects which journeys to
include before task creation.

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

Document-scoped records are durable. Camera, selection, active tool, and other
session state remain local. Presence records are ephemeral and include cursors,
user identity, and current viewport. The gateway supplies identity from the
authenticated session rather than trusting an identity field chosen by the client.

When disconnected, the tab shows **Offline - changes are on this device**. tldraw
may continue applying optimistic local changes and rebases them through its native
sync client after reconnect. Meld does not claim that changes are shared until the
client returns to `synced-remote`.

Before reconnect and before a fatal sync transition, the client saves an encrypted
local recovery snapshot in IndexedDB. If authentication, authorization, schema, or
rebase failure prevents synchronization, Meld keeps that snapshot for seven days
and offers a downloadable Meld recovery JSON file. A recovery file is never
silently uploaded or applied to a different room; an authorized editor explicitly
imports it into a new Draft after validation.

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
tldraw record IDs, selection, viewport, and style-only properties. Presentation
hashes cover durable frame, node, and note geometry.

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
- Every start can reach a successful outcome or a clearly labeled terminal failure.
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

Undo remains tldraw's user-scoped document behavior. Because removing a node also
removes or invalidates its attached bindings, undo may affect another collaborator's
later edge to that node. The UI reports the resulting repair; it never leaves a
dangling edge in the semantic projection.

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
wire messages. SQLite is the durable sync store and acknowledges a canvas mutation
only after its synchronous storage transaction commits. No managed collaboration
or separate WebSocket product is required.

The gateway writes a compressed, checksum-verified room snapshot to the PostgreSQL
`user_flow_canvas_snapshots` table every five minutes while active and on clean
room eviction. It retains the newest 12 hourly snapshots and 14 daily snapshots.
A restore starts from the newest checksum-valid snapshot and refuses to expose the
room if schema validation fails.

PostgreSQL stores journey lifecycle metadata, PRD links, proposal records, audit
events, and the latest validated semantic projection. Projection work is coalesced
to the latest tldraw document clock with maximum queue depth one per room. Ready,
agent-patch, and PRD-context operations synchronously refresh the projection from
the current room storage before evaluating hashes.

The tldraw store is authoritative for collaborative canvas records. PostgreSQL is
authoritative for lifecycle and cross-artifact business records. The projection is
rebuildable and is never edited directly. A periodic verifier rebuilds it from the
tldraw snapshot and compares its clock and hash to the stored projection.

### 14.2 Server-authored operations

Generated insertion, accepted proposal application, and confirmed automatic layout
use a server-side tldraw storage transaction so all related records appear
atomically. Lifecycle and PRD-link actions use authenticated application RPCs.

Ready stores the semantic hash validated at the current tldraw clock. Effective
Ready eligibility always requires both `status = ready` and a matching current
semantic hash. This hash rule closes the non-atomic boundary between SQLite canvas
storage and PostgreSQL metadata.

### 14.3 Deployment boundary

The web app, Fastify API, connector WebSocket, and tldraw WebSocket may be hosted
under one application deployment. The gateway needs a persistent volume for its
SQLite sync store; the tldraw commercial license does not provide hosting.

The initial gateway is single-instance. Before horizontal scaling, Meld must add
deterministic room affinity with one global room authority, or move the sync route
to a supported room-isolated deployment such as the tldraw Cloudflare Durable
Object template. Two independent `TLSocketRoom` instances may never serve the same
room.

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
native reconnect and rebase. Do not claim remote durability while disconnected.

### Permission or fatal sync rejection

Preserve a seven-day local recovery snapshot, switch to read-only when permitted,
and offer explicit recovery export. Never retry unauthorized changes silently.

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

Reject the operation that crosses the declared limit where the sync protocol can
do so safely. If a malformed or unsupported client has already crossed it, make
the room read-only until an owner archives or removes content through recovery
tools. Preserve the last valid projection.

### Local SQLite or remote backup failure

SQLite transaction failure prevents durable sync acknowledgment and marks the room
unavailable. Remote-backup failure does not discard locally durable edits, but it
alerts operations and blocks rollout expansion when backup age exceeds 15 minutes.

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
- Per-connection WebSocket buffered bytes and backpressure disconnects
- Projection clock lag, rebuild latency, verifier mismatch, and invalid-record count
- Snapshot age, checksum failure, backup failure, and restore duration
- Ready hash mismatch and automatic-demotion count
- Agent proposal conflict and rejection rates
- Generation latency, clarification rate, validation failure, and layout fallback

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
- One active `TLSocketRoom` per room
- Durable SQLite restart, snapshot backup, checksum validation, and restore
- Server storage transactions for generation, proposal acceptance, and layout
- Projection rebuild and periodic divergence detection
- Ready hash safety across concurrent canvas and lifecycle writes
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
- Disconnect, edit, reconnect, rebase, and recover a rejected local snapshot
- Verify cursors and presence are visible only to room members
- Review, partially accept, reject, conflict, and revert agent proposals
- Apply layout after concurrent geometry changes and abort after semantic changes
- Move Ready elements while blocking semantic edits until Edit as Draft
- Prove a Ready hash mismatch immediately excludes and demotes the journey
- Create, follow, stale, reactivate, and repair PRD links
- Verify viewers cannot mutate through the UI or direct sync messages
- Verify routine edits do not create conversation noise
- Complete supported editor and viewer workflows with keyboard and VoiceOver

### Load and recovery tests

- Twenty-five active sessions meet synchronization targets
- A room sustains 250 record changes per second for 60 seconds without corruption
- Presence coalescing holds each client to 20 updates per second
- Outbound backpressure disconnects and cleanly resynchronizes a slow client
- Process termination after SQLite commit restores the acknowledged state
- Restore from every retained backup class
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

- 50 non-archived journeys per canvas
- 100 live nodes, 150 live edges, and 30 live notes per journey
- 2,500 live semantic elements across one canvas
- 200 characters per node label, 80 per edge label, and 2,000 per note or detail
- 10 MiB maximum serialized room snapshot with no binary assets
- 25 simultaneous canvas sessions per Discovery Room
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
- No backup older than 15 minutes for an active room
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
16. A valid tldraw commercial production license is approved before external
    commercial release.

## 23. Rollout, Licensing, And Disablement

The feature ships behind an organization allowlist and
`MELD_USER_FLOW_CANVAS_ENABLED`. Database changes are additive. The first enabled
visit lazily creates an empty versioned room and metadata record.

Rollout proceeds through local fake-provider tests, internal trial workspaces, and
then a small private cohort. Expansion requires green authorization, convergence,
restore, accessibility, AI-quality, and load gates plus observed SLO compliance.

tldraw is source-available but requires a production license key for commercial
use. Meld may develop and evaluate under the 100-day trial, but external commercial
release is blocked until the company accepts a written annual quote and obtains a
valid domain-bound key. The tldraw license supplies software rights and sync
packages; gateway compute, persistent storage, backups, and operations remain
Meld's responsibility.

Disabling the feature stops generation and new read-write sync sessions without
deleting data. The tab falls back to the last validated projection-driven Linear
view. Existing rooms remain recoverable from SQLite and remote snapshots.

If licensing is not approved, the trial expires, backups become stale, the gateway
cannot meet its targets, or tldraw client/server compatibility cannot be maintained,
the kill switch remains off. Replacing tldraw would require a new canvas adapter,
not changes to `UserFlowGraph`, AI results, readiness rules, or PRD-link contracts.

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
- The portable semantic graph, AI contracts, lifecycle, links, and projection remain
  Meld-owned boundaries.
- Production release requires an accepted tldraw commercial license.
