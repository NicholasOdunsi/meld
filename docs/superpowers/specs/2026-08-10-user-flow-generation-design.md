# User Flow Generation Design

Date: 2026-08-10
Status: Approved direction, pending implementation

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

When context is insufficient, no invented flow is written. The tab shows the
agent's clarification question and a text field/action to provide the missing
context, then retry generation. The request remains tied to the same room and
user.

## Context And Generation

The server route authenticates the current user and room access, loads the room
PRD and a bounded recent conversation context, and sends both to the existing
Product Agent pipeline with a strict output contract. The PRD is authoritative;
conversation evidence can fill gaps but cannot override explicit PRD
requirements.

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

If there is no usable PRD or conversation context, the route returns a
clarification response instead of calling the agent with an empty prompt.

## API And Persistence

Add a protected `POST /api/user-flow/generate` route accepting the room and an
optional clarification string. It returns one of:

- `201` with the validated `FlowDocument` and generated draft metadata;
- `422` with a clarification question when context is insufficient;
- `401`, `403`, `404`, or `503` for authentication, access, room, or agent
  availability failures.

Only owners, organization admins, and room editors may generate. The route
does not mutate PRD or conversation records. The client converts the validated
document into standard tldraw page/geo/text/arrow shapes and commits the shape
diff through the existing shared room connection. Generated IDs include a
generation namespace so repeated generations do not overwrite unrelated human
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
retryable error. No raw prompt, ticket, provider error, or secret is exposed to
the browser. A failed generation never writes partial shapes.

## Testing And Gates

- Route tests cover owner/editor/viewer authorization, missing context,
  clarification retry, valid output, malformed output, limits, and provider
  failure mapping.
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
