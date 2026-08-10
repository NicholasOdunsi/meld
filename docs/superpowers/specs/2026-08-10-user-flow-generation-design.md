# User Flow Generation Design

Date: 2026-08-10
Status: Approved

## Goal

Add a `Generate User Flow` action to the User Flows tab. The action uses the
room PRD as the primary source and conversation context as supporting evidence,
then places a schema-validated draft journey directly on the shared tldraw
canvas.

The first version generates a standard journey flow, not a semantic product
model. It is deliberately limited to ordinary tldraw shapes so human edits
remain transparent and portable.

## User Experience

The User Flows tab shows a clear `Generate User Flow` action when the current
user can edit the room. Viewers see the existing canvas without the action.

Clicking the action shows a generating state. On success, the canvas receives a
Draft frame containing Start, user actions, system responses, decision branches,
and End. A small source/status label identifies the result as agent-generated
and includes the generation timestamp. Human edits happen on the same shared
shapes.

When context is insufficient, no invented flow is written. The tab shows a
concrete clarification question and a text field/action to provide the missing
context, then retry generation. The request remains tied to the same room and
user.

## Context And Generation

The server action authenticates the current user and room access, then queues a
`user_flow_generate` task through Meld's existing Product Agent connector
pipeline. Authorized task hydration loads the room PRD and a bounded recent
conversation context. The PRD is authoritative; conversation evidence can fill
gaps but cannot override explicit PRD requirements.

The Product Agent returns JSON matching `FlowDocument`:

- `title`: non-empty flow title;
- `summary`: short purpose statement;
- `nodes`: ordered records with stable IDs, one of `start`, `action`, `system`,
  `decision`, or `end`, plus a concise label and optional detail;
- `edges`: directed links between node IDs with optional decision labels;
- `openQuestions`: unresolved assumptions that should be visible to the user.

The server rejects malformed output, duplicate IDs, missing edge endpoints,
cycles that do not pass through a decision, excessive node/label sizes, and
unbounded output. It returns a user-safe error rather than partially writing a
document.

If there is no usable PRD or conversation context, the server action returns a
clarification response instead of calling the agent with an empty prompt.

## Task Lifecycle And Persistence

Add a protected `generateUserFlow` server action accepting the room, provider,
and an optional clarification string. It returns one of:

- `queued` with the Product Agent task ID;
- `needs_context` with a clarification question when context is insufficient;
- `error` with a user-safe message for authentication, access, room, or agent
  availability failures.

The User Flows tab polls the existing participant-scoped room task-status
projection while generation is active. Successful settlement materializes the
validated result into a participant-readable `user_flow_generations` record;
the browser never reads `ai_tasks.result_json` directly. The initiating client
loads the generation by task ID and inserts its deterministic shapes. Repeating
that insertion is idempotent because every generated shape ID is derived from
the task ID and flow record ID.

Only owners, organization admins, and room editors may generate. The action
does not mutate PRD or conversation records. The client converts the validated
document into standard tldraw frame/geo/text/arrow shapes and commits the shape
diff through the existing shared room connection. Generated IDs include the
task ID namespace so repeated generations do not overwrite unrelated human
work.

The first generation is a Draft frame. Regeneration creates a new proposed
frame and leaves the previous frame intact until a human deletes or edits it;
there is no destructive replacement in this version.

## Shape Mapping

- Start and End: compact geo shapes with distinct labels;
- Action and System: rounded geo shapes with title/detail text;
- Decision: diamond geo shape with outgoing edge labels;
- Edges: arrow shapes between node centers;
- Frame: a surrounding frame/title shape containing all generated shapes.

The mapper is deterministic and independently testable. It preserves the
document's node/edge IDs in shape metadata so later linking and patch-based
revisions can target stable records.

## Error Handling And Safety

Generation is disabled when the trial flag is off or in production. Server
authorization is authoritative; the UI access check is only a usability guard.
Requests carry no client-supplied user identity, role, or room ownership.

Agent failures, invalid JSON, timeouts, and rate limits produce an inline
retryable error derived from safe task status. No raw prompt, task result,
ticket, provider error, or secret is exposed through task-status APIs. A failed
generation never writes partial shapes.

## Testing And Gates

- Server-action and SQL tests cover owner/editor/viewer authorization, missing
  context, clarification retry, idempotent task creation, result
  materialization, and participant-scoped reads.
- Connector tests cover prompt grounding, valid output, malformed output,
  contract limits, and provider failure mapping.
- Contract tests cover `FlowDocument` validation and deterministic shape
  mapping, including decisions and repeated generation namespaces.
- Canvas tests cover loading, clarification, generating, success, retry, and
  viewer read-only behavior.
- The gated trial test verifies two editors see the generated draft and that a
  viewer cannot mutate it.
- Existing blank-canvas, room-tab, gateway, and volume tests remain green.

## Out Of Scope

This feature does not add PRD editing, semantic user-flow storage, AI-generated
HTML prototypes, PRD linking, custom tldraw shapes, editor-level undo
semantics, or production deployment/licensing approval.
