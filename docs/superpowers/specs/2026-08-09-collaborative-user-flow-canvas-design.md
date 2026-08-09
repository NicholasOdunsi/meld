# Collaborative User Flow Canvas Design

Date: 2026-08-09
Status: Approved in product-design discussion; awaiting written-spec review

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
through Meld's existing self-hosted gateway, so the feature does not require a
paid canvas SDK or managed collaboration service.

## 2. Goals

- Let teams map a journey before, during, or after PRD creation.
- Generate one coherent primary journey from authorized room context.
- Include important decisions, alternate paths, failures, and outcomes.
- Give humans a freeform but semantically structured editing surface.
- Support simultaneous editing, live cursors, and collaborator presence.
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

- **Draft**: Editable and excluded from PRD context.
- **Ready**: Reviewed by a human and eligible for PRD context.
- **Archived**: Retained in the room but excluded from normal canvas navigation
  and PRD context until restored.

Newly generated and manually created journeys begin as Draft. Marking a journey
Ready is an explicit human action; agents may recommend it but cannot perform it.

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

Draft and Archived journeys are not included. Canvas positions, selections,
viewports, and decorative presentation data are not sent to the agent.

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
4. Finds available space on the shared canvas.
5. Adds the complete Draft journey in one atomic collaborative transaction.
6. Places material assumptions and unresolved questions as nearby sticky notes.
7. Emits one completion event with a deep link to the new frame.

If automatic layout fails, Meld uses a simple ordered fallback layout. Valid
semantic content is not discarded because positioning failed.

## 6. Manual Editing And Collaboration

Owners, admins, and editors may:

- Create, rename, move, resize, and archive journey frames
- Create, edit, move, and delete supported nodes and notes
- Create, relabel, reconnect, and delete edges
- Run automatic layout on a selected journey
- Generate a new journey
- Request and review agent changes
- Link flow elements to PRD sections
- Mark a journey Draft, Ready, or Archived

Viewers may inspect flows, follow deep links, and see collaborator presence, but
cannot mutate durable canvas content.

Multiple authorized editors may work simultaneously. Durable collaborative state
includes frames, nodes, edges, notes, links, and journey status. Ephemeral
presence includes cursor positions, selections, active tools, and viewports.

Routine canvas operations do not create Discovery conversation messages.

## 7. Agent Revision Workflow

An agent never writes directly over an existing journey. A
`user_flow_revise` task freezes the target journey revision and returns a graph
patch containing additions, updates, removals, reconnections, and optional PRD
link proposals.

The client renders the patch as a proposal overlay:

- Additions are visibly distinguished from current content.
- Removals remain visible until accepted.
- Changed labels and connections show their before and proposed states.
- The user may accept or reject the whole proposal.
- The user may exclude individual changes when the remaining patch still forms a
  valid graph.
- Excluding a node also excludes dependent proposed edges automatically.

Before applying a proposal, Meld compares the patch's base revision with the
current graph. If collaborators changed any affected element, the proposal shows
conflicts and cannot silently overwrite them. Accepting a conflict-free proposal
applies it as one atomic transaction so it can be undone as a unit.

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

If a later PRD version removes a linked section, Meld marks the relationship
`needs_attention` and preserves the original reference for repair. It does not
silently retarget the link.

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

The semantic model is independent of React Flow and Yjs. Shared contracts define
the following concepts.

### 10.1 Canvas document

`UserFlowCanvasDocument` contains:

- Schema version
- Discovery Room identifier
- Canvas revision
- Journey frames
- Nodes
- Edges
- Notes
- PRD links

### 10.2 Journey frame

`UserFlowJourney` contains:

- Stable journey identifier
- Name
- Status: `draft`, `ready`, or `archived`
- Actor, goal, trigger, and successful outcome
- Frame position and dimensions
- Creation and update attribution
- Monotonic semantic revision

### 10.3 Node

`UserFlowNode` contains:

- Stable node identifier
- Parent journey identifier
- Kind: `start`, `user_action`, `system_response`, `decision`, `failure`, or
  `outcome`
- Label and optional supporting detail
- Position and dimensions
- Creation and update attribution

### 10.4 Edge

`UserFlowEdge` contains:

- Stable edge identifier
- Parent journey identifier
- Source and target node identifiers
- Optional branch label
- Creation and update attribution

Edges may not connect nodes from different journey frames. Cross-journey
relationships are notes or artifact links in the first release, not executable
flow edges.

### 10.5 Note and PRD link

`UserFlowNote` contains text, note kind (`assumption`, `open_question`, or
`general`), position, and optional related journey or node.

`UserFlowPrdLink` contains the flow target, PRD identifier, stable PRD section
identifier, linked PRD version, state (`active` or `needs_attention`), provenance
(`manual` or `agent_proposed`), and acceptance attribution.

The server validates the semantic projection after every accepted agent patch and
before a journey becomes Ready.

## 11. Client Architecture

React Flow renders the infinite pan-and-zoom canvas. Meld supplies custom node
renderers for every semantic node kind and uses grouping for journey frames.
Automatic layout uses a deterministic graph-layout library such as ELK or Dagre
behind a Meld-owned layout interface so the layout implementation can change
without changing contracts or stored data.

Yjs shared maps represent durable semantic and presentation records. Yjs
Awareness carries transient collaborator presence. React Flow remains a renderer
and interaction layer; it is not the authoritative business schema.

All page chrome, prompts, toolbars, dialogs, status, and review UI use Astryx.
The canvas integration must remain isolated behind one feature boundary. Any
third-party base style required by the renderer must be confined to that boundary
and handled through the repository's Astryx convention process rather than
introducing general-purpose application CSS.

## 12. Gateway And Persistence Architecture

The existing Fastify gateway gains an authenticated WebSocket route:

`/canvas/:roomId`

This route is separate from the connector's device-authenticated `/ws` protocol.
Browser canvas connections authenticate with the user's current Supabase session.
The gateway verifies organization membership, Discovery Room access, and the
editor/viewer role before joining the Yjs room.

The gateway owns the active Yjs document for each connected Discovery Room. It:

- Applies and broadcasts authorized Yjs updates
- Publishes collaborator presence
- Rejects viewer mutations
- Revalidates access on reconnect and sensitive state changes
- Persists an append-only Yjs update journal in PostgreSQL
- Periodically writes compacted document snapshots
- Maintains a validated semantic JSON projection for server-side consumers
- Restores active documents from a snapshot plus later updates

The JSON projection is used for AI context, readiness checks, deep-link lookup,
and server-side authorization of semantic operations. It is derived from the
authoritative collaborative document and carries the same canvas revision.

For the private MVP, the web app and gateway may run on one machine or within one
hosting account. The connector WebSocket and canvas WebSocket run in the same
gateway process. Supabase/PostgreSQL remains the durable store. No managed Yjs
service is required.

The initial gateway remains single-instance. A later multi-instance deployment
must introduce room affinity or shared Yjs coordination before horizontal scaling;
running two independent authoritative documents for the same room is forbidden.

## 13. AI Contracts And Task Lifecycle

Shared contracts add:

- Task kinds `user_flow_generate` and `user_flow_revise`
- A generation context extension containing Ready semantic flows
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

## 14. Authorization And Security

- Canvas access inherits Discovery Room access.
- Owners, admins, and editors may mutate; viewers are read-only.
- Every durable mutation records actor and room identifiers server-side.
- Client-supplied organization, role, and attribution claims are not trusted.
- A browser WebSocket handshake validates the Supabase session and room access.
- Permission is revalidated before applying an agent result or marking Ready.
- Cross-organization room IDs, element IDs, and PRD links are rejected.
- The gateway limits WebSocket frame size, update rate, and total document size.
- Text labels and notes are treated as untrusted content and escaped when rendered.
- Yjs update and snapshot data is never accepted as an authorization decision.
- Provider output cannot supply final database ownership or attribution fields.

## 15. Failure Handling

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

Show an offline state. Queue local Yjs updates and synchronize them after
reconnection. Do not claim server durability while updates exist only locally.

### Permission loss

Reject subsequent mutations, close or downgrade the session, and render the canvas
read-only. Unsynchronized mutations created after access loss are not accepted.

### Persistence failure

Keep the connection in a degraded state and do not acknowledge an update as
durable until the gateway has recorded it. Retry idempotently.

### Layout failure

Use the fallback layout and retain the valid graph.

### Broken PRD link

Mark it `needs_attention`; preserve the original target metadata for repair.

## 16. Testing Strategy

### Contract and unit tests

- Every valid and invalid graph shape
- Dangling edges, duplicate IDs, cross-journey edges, and missing endpoints
- Context preflight and result-union behavior
- Automatic and fallback layout determinism
- Patch validation and dependent-change deselection
- PRD-link lifecycle and broken-link detection
- Ready-only semantic context serialization

### Gateway integration tests

- Browser session and room-role authentication
- Cross-organization connection and mutation rejection
- Viewer read-only enforcement
- Yjs update persistence, snapshot compaction, and restoration
- Reconnect replay without duplicate durable updates
- Permission loss during an active session
- Agent result permission revalidation
- Single conversation event under duplicate settlement delivery

### Connector tests

- Provider-neutral flow prompt contains only authorized context
- Draft and Archived flows are excluded
- Structured result validation for both providers
- `needs_context` and `needs_journey_selection` create no artifact
- Malformed or oversized results fail without partial canvas changes

### Browser end-to-end tests

- Generate from conversation and open the deep-linked Draft frame
- Generate from the User Flows tab
- Insufficient context asks questions without creating a frame
- Multiple candidate journeys require selection
- Two editors concurrently mutate and converge on one document
- Live cursors and presence appear only to room members
- Disconnect, edit, reconnect, and synchronize
- Review, partially accept, reject, and conflict an agent proposal
- Mark Ready and prove only that journey enters later PRD context
- Create, follow, break, and repair a bidirectional PRD link
- Verify viewers cannot mutate
- Verify routine movement does not create conversation noise

### Dependency gate

The production dependency audit must confirm that the canvas and collaboration
runtime have no paid production-license requirement. React Flow and Yjs are used
under their MIT licenses; no React Flow Pro example code is required or copied.

## 17. Acceptance Criteria

The first release is complete when:

1. Every Discovery Room has one authorized collaborative User Flows canvas.
2. A user can generate a coherent journey from either supported entry point.
3. Obviously empty or semantically insufficient input creates no speculative
   canvas artifact.
4. A valid result creates exactly one atomic Draft journey with a readable layout.
5. The journey includes user actions, system responses, decisions, important
   failures, branches, and a successful outcome when supported by context.
6. Multiple editors converge after concurrent and offline edits.
7. Existing content changes only through human edits or accepted agent proposals.
8. A stale proposal cannot silently overwrite newer changes.
9. Only Ready journeys enter PRD generation or revision context.
10. Humans can create and follow bidirectional PRD links, and accept agent-proposed
    links.
11. Meaningful lifecycle events appear once in conversation without logging routine
    canvas operations.
12. Cross-tenant, viewer, revoked-user, and malformed-provider mutations fail
    closed.
13. The feature runs through Meld's existing gateway without a paid editor,
    collaboration SDK, or separate managed WebSocket product.

## 18. Key Decisions

- Generation is available before or after PRD creation.
- The user explicitly requests every generation or revision.
- One shared canvas contains all room journeys in labeled frames.
- The canvas is freeform, while the underlying content is a structured graph.
- New generated journeys are Drafts.
- Agent revisions are proposals, not direct mutations.
- Human-approved Ready flows inform PRDs.
- Generated-source citations stay off the canvas.
- Assumptions and unresolved questions appear as sticky notes.
- PRD links are bidirectional and may be proposed but require human acceptance.
- Meaningful flow activity appears in conversation; routine edits do not.
- React Flow and Yjs replace the rejected paid-production tldraw option.
- Canvas sync runs inside the existing Meld gateway deployment.
