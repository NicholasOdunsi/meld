# Collaborative User Flow Canvas Design

Date: 2026-08-09
Status: Revised after written-spec review; awaiting re-review

## 1. Summary

Meld will add a **User Flows** tab to every Discovery Room. The tab contains one
shared infinite canvas on which a team can generate, edit, review, and organize
multiple user journeys. Each journey is a labeled frame containing a structured
graph of user actions, system responses, decisions, failure paths, and outcomes.

The canvas is freeform in presentation but structured in meaning. Users may move
and connect elements anywhere, while Meld retains a validated semantic graph that
agents can generate, revise, and later supply to PRD generation.

Flow generation remains explicit. It starts only when a user asks for it in the
Discovery conversation or enters a request in the User Flows tab. A generated
journey arrives as a Draft. Existing canvas content is never changed silently by
an agent.

The production implementation will use React Flow for the node canvas and Yjs for
real-time collaboration. Both are MIT licensed. Canvas synchronization will run
through Meld's existing self-hosted gateway. The browser sends typed, idempotent
canvas commands rather than security-sensitive opaque document deltas; the gateway
validates and applies accepted commands to the authoritative Yjs document. The
feature therefore requires neither a paid canvas SDK nor a managed collaboration
service while retaining server-enforced graph invariants and authorization.

## 2. Goals

- Let teams map a journey before, during, or after PRD creation.
- Generate one coherent primary journey from authorized room context.
- Include important decisions, alternate paths, failures, and outcomes.
- Give humans a freeform but semantically structured editing surface.
- Support simultaneous editing, live cursors, and collaborator presence.
- Provide keyboard and screen-reader access to every journey through a linear view.
- Make agent revisions inspectable and explicitly accepted or rejected.
- Let reviewed flows inform later PRD generation and revision.
- Link PRD sections and flow elements in both directions.
- Keep meaningful flow activity visible in the Discovery conversation.
- Avoid a paid editor or collaboration SDK dependency.

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

These exclusions keep the feature focused on proper user flows rather than a
general-purpose FigJam replacement.

## 4. Product Model

### 4.1 One canvas per Discovery Room

Each Discovery Room owns exactly one user-flow canvas. Multiple journeys live on
that canvas in distinct labeled frames. The User Flows tab includes an outline
that lists journey frames and moves the viewport to the selected journey.

The canvas remains available whether or not the room has a PRD. This supports
teams that begin with a flow and use it to inform the PRD, as well as teams that
generate flows from an existing PRD.

### 4.2 Journey states

Every journey frame has one of three states:

- **Draft**: Editable and excluded from PRD context by default.
- **Ready**: Reviewed, immutable, and eligible for PRD context.
- **Archived**: Retained in the room but excluded from normal canvas navigation
  and PRD context until restored.

Newly generated and manually created journeys begin as Draft. Marking a journey
Ready is an explicit server-authorized human action; agents may recommend it but
cannot perform it. A Ready journey rejects semantic and presentation mutations.
Selecting **Edit as Draft** performs a server-authorized transition before editing
can resume. This makes it impossible for unreviewed changes to enter PRD context
under an already-Ready label.

### 4.3 Supported elements

The first release supports:

- Journey frames
- Start points
- User actions
- System responses
- Decisions
- Failures
- Successful outcomes
- Directed connectors with optional labels
- Text
- Sticky notes for assumptions and unresolved questions

The compact canvas toolbar exposes only these tools.

## 5. Entry Points And Generation Workflow

### 5.1 Equivalent entry points

A user may request a flow in either place:

1. The Discovery conversation, for example: "Generate the checkout user flow."
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

Draft and Archived journeys are not included by default. For user-flow generation
or revision only, the requester may explicitly add named Draft journeys to the
frozen snapshot. Draft journeys never enter PRD generation or PRD revision context.
Canvas positions, selections, viewports, and decorative presentation data are not
sent to the agent.

If the serialized Ready-flow context would exceed Meld's existing hydrated
context limit, Meld does not silently truncate it. The user must select which
Ready journeys to include before the task is created.

### 5.3 Context readiness

Meld uses two levels of readiness handling:

1. A deterministic preflight rejects obviously empty input, such as a generic
   request in a room with no usable messages, PRD, evidence, decisions, or Ready
   flows. It creates no provider task and asks the user to describe the actor,
   goal, and expected outcome.
2. For non-empty context, the generation result is a discriminated union. The
   agent may return a generated journey, `needs_context` with one or two focused
   questions, or `needs_journey_selection` with candidate journeys. The latter
   two outcomes create no canvas artifact. They may consume one provider task
   because semantic sufficiency cannot be determined reliably without reading
   the context.

A generation request may perform at most two provider-backed clarification rounds.
After the second `needs_context` result, the request closes and asks the user to
write a fuller brief before starting a new request. Flow generation and revision
are limited to five starts per user per room per ten minutes and twenty per user
per room per hour. Queue wait does not count toward execution time; a claimed
generation attempt has a ten-minute execution timeout.

A generated journey must identify:

- A user or actor
- The actor's goal
- A starting trigger
- A successful outcome
- Enough product behavior to connect the journey meaningfully

When one journey clearly dominates, generation proceeds. When several distinct
journeys are plausible, the agent asks the user to select one rather than placing
several unrequested frames on the canvas.

### 5.4 Successful generation

The agent returns semantic graph data without canvas coordinates. Meld:

1. Validates the result against the shared contract.
2. Rejects dangling edges, invalid node kinds, duplicate identifiers, and graphs
   without a start and outcome.
3. Runs deterministic automatic layout.
4. Acquires a PostgreSQL-backed room placement lock, recalculates occupied frame
   bounds, and reserves available space. Concurrent task settlements serialize on
   this lock and cannot choose the same region.
5. Adds the complete Draft journey in one atomic collaborative transaction.
6. Places material assumptions and unresolved questions as nearby sticky notes.
7. Emits one completion event with a deep link to the new frame.

If automatic layout fails, Meld uses a simple ordered fallback layout. Valid
semantic content is not discarded because positioning failed.

One generated journey may contain at most 75 nodes, 110 edges, and 20 notes and
must remain within the existing 256 KiB AI-result limit. Larger journeys are
rejected with a request to split the work into narrower journeys.

## 6. Manual Editing And Collaboration

Owners, admins, and editors may:

- Create and rename Draft journey frames
- Create, edit, move, and delete supported nodes and notes
- Create, relabel, reconnect, and delete edges
- Preview and apply automatic layout to a Draft journey
- Generate a new journey
- Request and review agent changes
- Link flow elements to PRD sections
- Request server-authorized Draft, Ready, and Archived transitions

Viewers may inspect flows, follow deep links, and see collaborator presence, but
cannot mutate durable canvas content.

Multiple authorized editors may work simultaneously. The browser sends typed,
idempotent `CanvasMutation` commands carrying a mutation ID, affected element IDs,
and the semantic or presentation hashes relevant to the operation. The gateway
stamps the authenticated actor, validates
the mutation against the current server document, serializes accepted commands per
room, applies them to Yjs, persists them, and broadcasts the resulting Yjs update.
The gateway never accepts a client-authored opaque Yjs delta as an authorized
durable mutation.

Durable collaborative content includes Draft frames, live and tombstoned nodes,
edges, notes, and geometry. Journey status, Ready content hash, artifact links,
agent proposals, and audit attribution are server-authoritative PostgreSQL records.
The Yjs document may contain a server-authored display mirror of status and link
indicators, but no authorization or PRD-context decision trusts that mirror.

Deletion writes a tombstone rather than immediately removing identity. An edge is
renderable only when both endpoints are live and belong to the same journey. After
each accepted mutation batch, a deterministic server normalizer tombstones dangling
or cross-journey edges and refreshes the semantic projection. This repair is
idempotent and uses a distinct `server_repair` origin.

Cursor positions, selections, active tools, viewports, and in-progress drag
coordinates are ephemeral Awareness data. A drag or resize sends presence updates
while moving and one durable geometry mutation on completion. The gateway replaces
all client-supplied presence identity with the authenticated user's server-known
ID, name, and color.

Ready and Archived journeys reject canvas mutations. Choosing **Edit as Draft**
first changes the server-authoritative status and invalidates the prior Ready hash.

Automatic layout is available only for Draft journeys. It first shows a preview
and requires confirmation. The gateway grants a 30-second journey layout lease,
checks that neither the journey semantic hash nor layout hash has changed, and
applies accepted geometry as one scoped transaction. The operation aborts rather
than moving nodes when either hash changed or another layout lease is active.

Routine canvas operations do not create Discovery conversation messages.

## 7. Agent Revision Workflow

An agent never writes directly over an existing journey. A Ready journey must be
changed to Draft before a revision task can target it. A `user_flow_revise` task
freezes the Yjs state vector, the target journey content hash, and hashes for every
element in scope. It returns a graph patch containing additions, updates, removals,
reconnections, and optional PRD link proposals.

The client renders the patch as a proposal overlay:

- Additions are visibly distinguished from current content.
- Removals remain visible until accepted.
- Changed labels and connections show their before and proposed states.
- The user may accept or reject the whole proposal.
- The user may exclude individual changes when the remaining patch still forms a
  valid graph.
- Excluding a node also excludes dependent proposed edges automatically.

Before applying a proposal, Meld compares each affected element's expected hash
with the current server projection. The Yjs state vector detects document movement,
while element hashes prevent unrelated edits elsewhere on the canvas from causing
false conflicts. A changed, deleted, or newly conflicting affected element blocks
that patch operation from silent application.

Accepting a conflict-free proposal applies it as one atomic server transaction and
stores the inverse patch. Ordinary Undo is origin-scoped and reverses only the
current user's unconflicted manual mutations. An accepted agent proposal is reverted
through **Revert proposal**, available to the acceptor, room owner, or admin while
all affected elements still match the accepted hashes. If later edits touched those
elements, revert becomes a reviewed inverse proposal rather than an unsafe Undo.

Rejected proposals remain recorded as task outcomes but never become canvas
content.

## 8. PRD Links

Links are deliberate artifact relationships, not generated-source citations.

### 8.1 Creating links

- From a PRD section, **Link user flow** opens a chooser for a journey or node.
- From a selected journey or node, **Link to PRD** opens a PRD-section chooser.
- A flow generation or revision result may propose relevant links.
- Agent-proposed links remain pending until a human accepts them.

### 8.2 Presenting links

Linked canvas elements show only a subtle indicator. Selecting the element shows
link details and actions. The canvas does not display source citations or
requirement labels on every node.

Clicking a link switches to the destination tab and focuses the exact PRD section,
journey frame, or node. Links use stable flow-element and PRD-section identifiers,
not viewport coordinates or copied display text.

Every active link records both the linked PRD version, the linked flow content
hash, and the journey lifecycle state at link time. A node-level link additionally
records the linked node content hash. Links to Draft journeys are permitted for
navigation but do not make that Draft eligible for PRD context.

Meld marks the relationship `needs_attention` when either side becomes stale:

- A later PRD version removes or materially replaces the linked section.
- The linked flow node is tombstoned or materially changed.
- The linked journey changes lifecycle state.
- A journey-level link's recorded flow content hash no longer matches.

The original references remain available for repair. Meld never silently retargets
either side, and a `needs_attention` link is not supplied to an agent as a confirmed
artifact relationship until a human confirms or replaces it.

## 9. Conversation Activity

The Discovery conversation records meaningful artifact events:

- Generation or revision request
- Queued, waiting, running, failed, or completed task state
- Generated Draft journey
- Accepted or rejected agent proposal
- Journey marked Ready
- Journey archived or restored
- Material PRD link accepted or removed

Each settled event is concise and deep-links to the relevant frame or node. Drag,
resize, text-edit, and connector operations do not create conversation events.
Duplicate task settlement or retry delivery cannot create duplicate events.

## 10. Semantic Data Model

The semantic model is independent of React Flow and Yjs. The server projection
merges collaborative graph content with server-authoritative lifecycle metadata.
Shared contracts define the following concepts.

### 10.1 Canvas document

`UserFlowCanvasDocument` contains:

- Schema version
- Discovery Room identifier
- Yjs state vector
- Canonical semantic content hash
- Journey frames
- Nodes
- Edges
- Notes

The collaborative document does not contain authoritative status, attribution,
artifact links, or audit decisions.

### 10.2 Journey frame

`UserFlowJourney` contains:

- Stable journey identifier
- Name
- Actor, goal, trigger, and successful outcome
- Frame position and dimensions
- Canonical semantic content hash
- Canonical layout hash

`UserFlowJourneyMetadata` is stored server-side and contains status (`draft`,
`ready`, or `archived`), the accepted Ready content hash, creation attribution,
lifecycle attribution, and timestamps. Clients request lifecycle transitions; they
do not write this record through Yjs.

### 10.3 Node

`UserFlowNode` contains:

- Stable node identifier
- Parent journey identifier
- Kind: `start`, `user_action`, `system_response`, `decision`, `failure`, or
  `outcome`
- Label and optional supporting detail
- Position and dimensions
- Optional tombstone metadata
- Canonical element content hash
- Canonical element presentation hash

### 10.4 Edge

`UserFlowEdge` contains:

- Stable edge identifier
- Parent journey identifier
- Source and target node identifiers
- Optional branch label
- Optional tombstone metadata
- Canonical element content hash

Edges may not connect nodes from different journey frames. Cross-journey
relationships are notes or artifact links in the first release, not executable
flow edges.

### 10.5 Note and PRD link

`UserFlowNote` contains text, note kind (`assumption`, `open_question`, or
`general`), position, optional related journey or node, optional tombstone metadata,
and canonical content and presentation hashes.

`UserFlowPrdLink` contains the flow target, PRD identifier, stable PRD section
identifier, linked PRD version, linked flow content hash, linked journey state,
optional linked node hash, state (`active` or `needs_attention`), provenance
(`manual` or `agent_proposed`), and acceptance attribution. It is
server-authoritative.

Element and journey semantic hashes use canonical JSON with sorted IDs and exclude
positions, dimensions, selections, and viewports. Presentation hashes cover durable
frame, node, and note geometry. Selections and viewports remain ephemeral and enter
neither hash. Yjs state vectors identify the collaborative document version, while
semantic and presentation hashes fence operations at the affected scope.

### 10.6 Invariants and readiness rules

Hard invariants apply after every durable mutation:

- Journey IDs are server-issued. Element IDs are cryptographically random UUIDs;
  the gateway validates uniqueness before accepting a create command.
- Every live edge references two live nodes in the same live journey.
- A tombstoned node cannot receive a new live edge.
- Cross-journey edges are forbidden.
- Ready and Archived journeys reject content mutations.
- Per-journey and per-canvas size limits are not exceeded.

Draft journeys may be incomplete while humans work. Meld reports readiness
warnings for the following conditions and blocks the Ready transition until they
are resolved:

- The journey does not have exactly one live start node.
- The journey has no successful outcome.
- A live node is unreachable from the start.
- A decision has fewer than two outgoing edges or duplicate/empty branch labels.
- A non-terminal action or response has no outgoing edge.
- A failure is neither terminal nor connected to a recovery path.
- A node cannot reach a terminal outcome or failure.
- A cycle has no path that exits to a terminal node.

Cycles themselves are allowed because retry and recovery flows legitimately loop.
The server runs the same deterministic validator after every mutation to refresh
Draft warnings and again inside the authorized Ready transaction. It runs the
edge normalizer before validation, so convergence cannot leave dangling or
cross-journey edges in the durable projection.

Node and edge deletion remains tombstoned until it appears in two consecutive
verified snapshots, is at least seven days old, and is no longer referenced by an
open proposal or artifact link. Only then may compaction remove it. This makes
concurrent create/delete outcomes deterministic and preserves enough history for
proposal and link-staleness checks.

## 11. Client Architecture

React Flow renders the infinite pan-and-zoom canvas. Meld supplies custom node
renderers for every semantic node kind and uses grouping for journey frames.
Automatic layout uses a deterministic graph-layout library such as ELK or Dagre
behind a Meld-owned layout interface so the layout implementation can change
without changing contracts or stored data.

The client applies typed commands optimistically to its local Yjs view and stores
unacknowledged commands by mutation ID in IndexedDB. The gateway accepts, rejects,
or normalizes each command and broadcasts the authoritative Yjs update; the client
then reconciles optimistic state. Reconnect replays commands idempotently rather
than uploading an untrusted accumulated document delta.

Yjs Awareness carries transient collaborator presence. React Flow remains a
renderer and interaction layer; neither React Flow state nor client-owned Yjs
records are the authoritative business schema.

All page chrome, prompts, toolbars, dialogs, status, and review UI use Astryx.
The canvas integration must remain isolated behind one feature boundary. Any
third-party base style required by the renderer must be confined to that boundary
and handled through the repository's Astryx convention process rather than
introducing general-purpose application CSS.

## 12. Accessibility

The infinite canvas is not the only way to understand or operate a journey. Every
journey has a synchronized **Linear view** derived from the semantic graph. It:

- Presents the start, actions, decisions, labeled branches, failures, loops, and
  outcomes as a navigable ordered outline.
- Announces node type, label, branch destinations, readiness warnings, and link
  state to assistive technology.
- Supports inspecting, editing, linking, and reviewing proposals without pointer
  input for authorized editors.
- Moves focus between the linear item and its canvas element in both directions.

The canvas provides visible focus, keyboard selection and movement, keyboard edge
creation, zoom controls, a skip path to the linear view, reduced-motion behavior,
and no color-only status or proposal meaning. The complete User Flows experience,
including viewer review, must meet WCAG 2.2 AA. Automated accessibility checks are
supplemented with keyboard-only and macOS VoiceOver acceptance passes.

## 13. Gateway And Persistence Architecture

The existing Fastify gateway gains an authenticated WebSocket route:

`/canvas/:roomId`

This route is separate from the connector's device-authenticated `/ws` protocol.
Browser canvas connections authenticate with the user's current Supabase session.
The gateway verifies organization membership, Discovery Room access, and the
editor/viewer role before joining the Yjs room.

The gateway owns the active Yjs document and a serialized command queue for each
connected Discovery Room. It:

- Validates typed canvas commands, expected hashes, lifecycle state, and limits
- Applies accepted commands to Yjs and broadcasts server-authored Yjs updates
- Stamps collaborator identity onto rate-limited Awareness messages
- Rejects viewer mutations
- Revalidates access on reconnect and sensitive state changes
- Persists an append-only, monotonically sequenced Yjs update journal in PostgreSQL
- Periodically writes compacted document snapshots
- Maintains a validated semantic JSON projection for server-side consumers
- Restores active documents from a snapshot plus later updates
- Applies idempotent normalizer transactions when concurrent intent would otherwise
  violate referential invariants

Initial synchronization and large restore updates are sent as ordered,
checksum-verified chunks no larger than the one-MiB WebSocket frame limit. A client
does not expose the restored document until every chunk verifies.

The JSON projection is used for AI context, readiness checks, deep-link lookup,
and server-side authorization of semantic operations. It is derived from the
authoritative collaborative document and carries the same Yjs state vector and
semantic hashes.

### 13.1 Server-authoritative operations

Journey creation, lifecycle transitions, PRD-link acceptance or removal, agent
proposal acceptance or reversion, and automatic-layout commit use authenticated
server actions/RPCs or typed gateway commands, never a raw Yjs mutation. Each
command revalidates room permission and writes attribution from the authenticated
session. The gateway applies any corresponding Yjs change; the client never
supplies authoritative status, attribution, or link state.

These commands enter the same per-room serialized queue as canvas mutations. A
Ready transition drains earlier commands, normalizes and validates the journey,
computes its semantic hash, and commits metadata plus any server-authored Yjs
mirror update atomically. Later mutations observe Ready and are rejected, closing
the race between review and subsequent editing.

### 13.2 Durability and compaction

In-progress pointer movement is Awareness-only and is never journaled. Node text,
graph structure, and notes are semantic commands coalesced for at most 50 ms or
64 KiB, whichever occurs first. A drag or resize produces one presentation command
on completion; final geometry commands may coalesce for at most 100 ms, and a newer
unsaved geometry command for the same element supersedes the older one. The gateway
writes each resulting batch and semantic projection in PostgreSQL before sending
the durable acknowledgment and authoritative broadcast. The UI may show optimistic
local state but displays `Saving` until that acknowledgment arrives.

An active room writes a verified snapshot every 500 durable batches or five
minutes, whichever occurs first. Each snapshot records the last journal sequence,
schema version, state vector, and checksum. After a new snapshot restores and
validates successfully, Meld retains the two newest verified snapshots and prunes
journal rows covered by the older retained snapshot. A pre-migration snapshot is
retained for 30 days regardless of normal compaction.

The private-MVP service targets p95 authoritative broadcast below 250 ms and p95
durable acknowledgment below 750 ms for clients in the deployment region.

### 13.3 Schema migration

Canvas clients advertise their supported schema version during handshake. An
incompatible client is refused with a refresh/update instruction. The gateway
migrates a room under an exclusive PostgreSQL advisory lock: restore the last
snapshot and journal into an isolated document, apply ordered server migrations,
run normalization and full validation, write a new-version snapshot, then atomically
advance the room version. A failed migration leaves the prior snapshot and version
active. No client joins the room while its migration lease is held.

For the private MVP, the web app and gateway may run on one machine or within one
hosting account. The connector WebSocket and canvas WebSocket run in the same
gateway process. Supabase/PostgreSQL remains the durable store. No managed Yjs
service is required.

The initial gateway remains single-instance. A later multi-instance deployment
must introduce room affinity or shared Yjs coordination before horizontal scaling;
running two independent authoritative documents for the same room is forbidden.

## 14. AI Contracts And Task Lifecycle

Shared contracts add:

- Task kinds `user_flow_generate` and `user_flow_revise`
- A generation context extension containing Ready semantic flows and explicitly
  selected Draft-flow context for flow tasks
- A discriminated `UserFlowGenerationResult`
- A validated `UserFlowGraph`
- A validated `UserFlowPatch`
- Optional proposed PRD links

The connector remains content-only. It receives authorized structured context and
returns structured JSON. It does not access the repository, arbitrary files, a
browser canvas, shell commands, or local secrets.

Generation and revision use the existing initiating-user, paired-device, provider,
queueing, progress, cancellation, and settlement model. Results are projected into
canvas content only after contract validation, permission revalidation, and task
settlement fencing.

## 15. Authorization And Security

- Canvas access inherits Discovery Room access.
- Owners, admins, and editors may mutate; viewers are read-only.
- Every durable mutation records actor and room identifiers server-side.
- Client-supplied organization, role, and attribution claims are not trusted.
- A browser WebSocket handshake validates the Supabase session and room access.
- Permission is revalidated for every server-authoritative operation, including
  journey creation, Ready/Draft/Archived transitions, link changes, layout commit,
  and agent proposal application.
- Cross-organization room IDs, element IDs, and PRD links are rejected.
- Durable clients submit typed commands; arbitrary client-authored Yjs updates are
  rejected.
- Journey IDs and durable attribution are issued or stamped by the gateway;
  client-generated element UUIDs are accepted only after uniqueness validation.
- The gateway replaces Awareness identity with authenticated server-known identity.
- The gateway enforces the quantified WebSocket, rate, element, and document limits.
- Text labels and notes are treated as untrusted content and escaped when rendered.
- Yjs update and snapshot data is never accepted as an authorization decision.
- Provider output cannot supply final database ownership or attribution fields.

## 16. Failure Handling

### Insufficient or ambiguous context

Return focused questions or journey choices. Do not create an empty or speculative
frame.

### Device offline or provider unavailable

Use the existing durable AI queue and visible task states. Canvas collaboration
continues independently of provider availability.

### Malformed provider output

Reject the result before any canvas mutation. Preserve a redacted diagnostic and
offer a safe retry.

### Stale agent proposal

Mark conflicting changes and require human resolution. Never overwrite newer
human edits silently.

### Canvas connection loss

Show an offline state. Queue typed mutations by idempotency key in IndexedDB and
replay them after reconnection. Do not claim server durability while commands
remain only local. A replay rejected because its expected element hash is stale
becomes an explicit conflict instead of being dropped.

### Permission loss

Reject subsequent mutations, close or downgrade the session, and render the canvas
read-only. Unsynchronized mutations created after access loss are not accepted.

### Persistence failure

Keep the connection in a degraded state and do not acknowledge an update as
durable until the gateway has recorded it. Retry idempotently.

### Concurrent invariant conflict

Serialize typed commands per room. Reject commands whose expected hashes are stale
or whose requested result violates a hard invariant. As a defense in depth, run
the deterministic normalizer after every accepted batch; tombstone invalid edges
and surface a non-blocking repair notice rather than leaving a corrupt projection.

### Layout failure

Use the fallback layout and retain the valid graph.

### Broken PRD link

Mark it `needs_attention`; preserve the original target metadata for repair.

### Capacity limit reached

Reject only the operation that would exceed the declared limit. Preserve existing
content and direct the user to split, archive, or simplify a journey.

## 17. Testing Strategy

### Contract and unit tests

- Every valid and invalid graph shape
- Dangling edges, duplicate IDs, cross-journey edges, and missing endpoints
- Property tests interleave node deletion and edge creation and prove deterministic
  tombstone/repair outcomes
- Readiness rules for reachability, decisions, terminal paths, and cycles with exits
- Context preflight and result-union behavior
- Automatic and fallback layout determinism
- Patch validation and dependent-change deselection
- State-vector and element-hash proposal fencing under unrelated and related edits
- PRD-link lifecycle and broken-link detection
- Ready-only semantic context serialization

### Gateway integration tests

- Browser session and room-role authentication
- Cross-organization connection and mutation rejection
- Viewer read-only enforcement
- Typed-command authorization and arbitrary Yjs-delta rejection
- Durable batching, acknowledgment ordering, snapshot compaction, and restoration
- Chunked initial synchronization at and across the one-MiB frame boundary
- Idempotent reconnect replay without duplicate durable updates
- Schema migration success, rollback, incompatible-client rejection, and migration
  lease exclusion
- Ready mutation rejection and explicit Edit-as-Draft transition
- Server-stamped mutation attribution and Awareness identity
- Permission loss during an active session
- Agent result permission revalidation
- Single conversation event under duplicate settlement delivery

### Connector tests

- Provider-neutral flow prompt contains only authorized context
- Draft and Archived flows are excluded unless a Draft is explicitly named for a
  flow task; Drafts remain forbidden in PRD task context
- Structured result validation for both providers
- `needs_context` and `needs_journey_selection` create no artifact
- Malformed or oversized results fail without partial canvas changes

### Browser end-to-end tests

- Generate from conversation and open the deep-linked Draft frame
- Generate from the User Flows tab
- Insufficient context asks questions without creating a frame
- Multiple candidate journeys require selection
- Two editors concurrently mutate and converge on one document
- Concurrent node deletion and edge creation converge without a dangling edge
- Live cursors and presence appear only to room members
- Disconnect, edit, reconnect, and synchronize
- Review, partially accept, reject, and conflict an agent proposal
- Preview automatic layout, detect an intervening edit, and abort the stale commit
- Mark Ready and prove only that journey enters later PRD context
- Attempt to edit Ready, choose Edit as Draft, and prove it is immediately excluded
  from PRD context
- Create, follow, break, and repair a bidirectional PRD link
- Verify viewers cannot mutate
- Verify routine movement does not create conversation noise
- Complete every viewer and editor workflow with keyboard only
- Validate the linear view and canvas review flow with macOS VoiceOver

### Load and recovery tests

- Twenty-five simultaneous editors remain within the sync and acknowledgment SLOs
- Dragging persists one terminal geometry mutation rather than pointer-move rows
- A five-minute active-room run produces the expected snapshot and journal pruning
- Process termination after journal commit but before acknowledgment replays once
- Restore from each of the two retained snapshots plus its subsequent journal

### Dependency gate

The production dependency audit must confirm that the canvas and collaboration
runtime have no paid production-license requirement. React Flow and Yjs are used
under their MIT licenses; no React Flow Pro example code is required or copied.

## 18. Quantified Limits And Service Targets

The first release enforces:

- 50 non-archived journeys per canvas
- 100 live nodes, 150 live edges, and 30 live notes per journey
- 2,500 live semantic elements across one canvas
- 200 characters per node label, 80 per edge label, and 2,000 per note or detail
- 5 MiB maximum compacted Yjs document
- 1 MiB maximum WebSocket frame, matching the existing gateway contract
- 25 simultaneous canvas connections per Discovery Room
- Five flow-task starts per user per room per ten minutes and twenty per hour
- Two provider-backed clarification rounds per generation request
- Ten minutes maximum claimed provider execution, excluding durable queue wait

The private MVP targets:

- p95 authoritative canvas broadcast below 250 ms in-region
- p95 durable acknowledgment below 750 ms in-region
- Generated layout with no overlapping nodes or journey frames, no clipped labels,
  a consistent primary direction, and visible labels on decision branches
- Successful restore from the newest verified snapshot and journal in every
  automated recovery run

## 19. Acceptance Criteria

The first release is complete when:

1. Every Discovery Room has one authorized collaborative User Flows canvas.
2. A user can generate a journey from either supported entry point. Across a fixed
   evaluation set of at least 20 representative room contexts for each provider,
   at least 90% identify the supported actor, goal, trigger, primary path, stated
   branches, and outcome without inventing a material product behavior.
3. Obviously empty or semantically insufficient input creates no speculative
   canvas artifact.
4. A valid result creates exactly one atomic Draft journey that satisfies the
   quantified generated-layout criteria.
5. The journey includes user actions, system responses, decisions, important
   failures, branches, and a successful outcome when supported by context.
6. Twenty-five simulated editors converge after concurrent and offline edits while
   meeting the private-MVP synchronization targets.
7. Existing content changes only through human edits or accepted agent proposals.
8. A stale proposal cannot silently overwrite newer changes.
9. Only Ready journeys whose stored Ready hash matches the current semantic hash
   enter PRD generation or revision context; Ready content is immutable until an
   explicit Edit-as-Draft transition.
10. Humans can create and follow bidirectional PRD links, and accept agent-proposed
    links.
11. Meaningful lifecycle events appear once in conversation without logging routine
    canvas operations.
12. Cross-tenant, viewer, revoked-user, and malformed-provider mutations fail
    closed.
13. The canvas remains keyboard-operable, exposes a complete linear representation,
    and passes the defined automated, keyboard-only, and VoiceOver checks.
14. The feature runs through Meld's existing gateway without a paid editor,
    collaboration SDK, or separate managed WebSocket product.

## 20. Rollout And Disablement

The feature ships behind an organization allowlist plus the production kill switch
`MELD_USER_FLOW_CANVAS_ENABLED`. Database changes are additive. Existing Discovery
Rooms require no document migration: the first enabled visit lazily creates an
empty versioned canvas and server metadata record.

Rollout proceeds through local fake-provider tests, internal workspaces, then a
small private-MVP cohort. Expansion requires green authorization, convergence,
restore, accessibility, and 25-editor load gates plus observed SLO compliance.

Disabling the feature stops new generation, durable mutations, and new canvas
WebSocket sessions without deleting stored documents. The User Flows tab falls
back to the last validated read-only linear projection so reviewers can still
inspect existing journeys. Re-enabling restores the collaborative canvas from its
verified snapshot and journal.

If the single-instance gateway cannot meet its targets, the kill switch remains
off until room affinity or shared Yjs coordination is implemented. The rollout may
not add a second independent canvas authority for the same room.

## 21. Key Decisions

- Generation is available before or after PRD creation.
- The user explicitly requests every generation or revision.
- One shared canvas contains all room journeys in labeled frames.
- The canvas is freeform, while the underlying content is a structured graph.
- New generated journeys are Drafts.
- Ready journeys are immutable until an explicit Edit-as-Draft transition.
- Agent revisions are proposals, not direct mutations.
- Human-approved Ready flows inform PRDs.
- Generated-source citations stay off the canvas.
- Assumptions and unresolved questions appear as sticky notes.
- PRD links are bidirectional and may be proposed but require human acceptance.
- Meaningful flow activity appears in conversation; routine edits do not.
- React Flow and Yjs replace the rejected paid-production tldraw option.
- Browsers send typed idempotent mutations; the gateway alone writes authoritative
  Yjs document updates and lifecycle metadata.
- Tombstones, normalization, and readiness validation preserve graph invariants.
- State vectors and content hashes replace monotonic revision counters.
- Canvas sync runs inside the existing Meld gateway deployment.
