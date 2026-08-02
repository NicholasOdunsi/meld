# PRD View & Generation Design

**Date:** 2026-08-02
**Status:** Approved (design), pending implementation
**Author:** Product discovery — PRD surface

## Problem

Meld's whole purpose is turning a Discovery Room conversation into a durable,
reviewable PRD. The PRD is fully specified in data — `PRDDocumentSchema` exists in
`packages/contracts/src/prd.ts`, and the `prd_generate` / `prd_revise` task kinds
exist in the `ai_task_kind` enum — but **no UI produces, stores, or renders a PRD
today.** The Discovery Room is a single panel showing only the conversation. There
is no way for a user to ask for a PRD and no surface on which to read one.

This design covers the first slice: **generate a PRD from a room, and view it.**

## Scope

**In scope**
- A progressive tab strip under the room header (Conversation always present; PRD
  appears once a PRD exists; Prototype reserved for later).
- A read-only PRD document view (Notion-style header, section outline, all
  `PRDDocumentSchema` sections rendered, traceability links back to source
  messages).
- Natural-language generation: the agent recognizes PRD intent from ordinary
  conversation and offers a one-tap confirm that runs `prd_generate` on the
  initiator's own device; the PRD tab shows a live generating state, then the
  draft.
- A first-class `prds` table with participant-scoped read access.

**Explicitly deferred (reserved in the UI, not wired here)**
- PRD **acceptance** and immutability of accepted versions.
- **Version selection** (the version control renders as a label/dropdown but is
  display-only this pass).
- **Editing** — human edits and AI proposed-revision accept/reject. The "Accept
  PRD", header "Ask agent to revise", and per-section "revise" affordances render
  but are inert until the acceptance/versioning pass.
- The **Prototype** tab's contents.

These are called out so the reading layout accounts for where those controls sit,
without building their behavior now.

## Founding constraint

AI never runs on a platform key. Every AI task runs through the initiating user's
own authenticated Codex or Claude subscription, on their machine, and only on an
explicit request. This is why PRD generation is **not** fired silently on detected
intent: the one-tap confirm chip is the explicit request, and it is the point at
which we disambiguate "new PRD" from "revise the existing one".

## Architecture

Meld's request path is flat: React Server Components and server actions →
repository → Postgres, authorization enforced by row-level security. The browser
can read AI-task *status* but never a task's `result_json` (all writes go through
security-definer RPCs; RLS hides task payloads). Rendering a PRD therefore needs a
deliberate, participant-scoped read path — provided here by a dedicated `prds`
table with its own select policy, rather than by exposing `ai_tasks.result_json`.

### 1. Data model — `prds` table

A new migration under `supabase/migrations/` adds:

- `public.prd_status` enum: **`draft`** only in this pass. `accepted` and
  `superseded` are added by the later acceptance/versioning pass.
- `public.prds`:
  - `id uuid primary key`
  - `room_id uuid not null` / `organization_id uuid not null`, with a composite FK
    `(room_id, organization_id) → discovery_rooms(id, organization_id)` and
    `on delete cascade` — mirrors the `ai_tasks` FK pattern.
  - `version int not null` — first row for a room is `1`; each subsequent
    generate/revise inserts `max(version) + 1`.
  - `status public.prd_status not null default 'draft'`.
  - `document jsonb not null` — validated against `PRDDocumentSchema` before
    insert; size-capped consistently with the existing `ai_tasks_result_size`
    check (≤256 KiB).
  - `owner_id uuid not null` — the Discovery Room owner at generation time.
  - `source_task_id uuid` — FK to the `ai_tasks` row that produced it, for
    traceability and debugging.
  - `created_at timestamptz not null default now()`, `updated_at timestamptz`.
  - Index on `(room_id, version desc)` for "latest PRD for room".

**RLS**
- `select`: `authenticated` where `public.is_room_participant(room_id)` — room
  participants can read their org's PRDs; tenant isolation is enforced by the same
  helper used across the schema.
- No `insert` / `update` / `delete` for `authenticated`. Writes happen only inside
  a security-definer RPC (below).

### 2. Write path — task settlement inserts the PRD

Generation reuses the existing durable-task pipeline. A `prd_generate` task is
created (§5), claimed by the initiator's paired device, and run by the connector,
which returns a `PRDDocument`. On settlement:

- A security-definer RPC (e.g. `settle_prd_task(task_id, document)` or an
  extension of the existing settlement RPC for PRD-kind tasks) validates the
  document, computes the next `version` for the room, and inserts a `prds` row with
  `status='draft'`, `owner_id` = room owner, `source_task_id` = the task.
- The task transitions to `needs_review` (consistent with the generic
  draft-awaiting-human semantics). A failed task inserts **no** row.

### 3. Read path

- New feature folder `apps/web/src/features/prd/` with `repository.ts` isolating
  all Supabase access (Discovery is the precedent for the repository pattern).
  `getRoomPrd(roomId)` returns the latest `prds` row for the room (RLS-scoped),
  parsed through `PRDDocumentSchema`.
- The Discovery Room loader exposes a `hasPrd` boolean (presence of any `prds` row
  for the room) to drive tab visibility without fetching the whole document.

## UI

All UI is built from the Astryx design system (no raw `<div>`, tokens for every
value); `pnpm check:astryx` enforces this.

### 4. Progressive tab strip

A new tab strip renders directly under the room header (the Slack-style reference:
icon + label, active tab underlined):

- **`💬 Conversation`** — always present; the existing `Conversation` surface.
- **`📄 PRD`** — present only when `hasPrd`. Carries a small **`Draft`** status
  chip.
- **`🖼️ Prototype`** — reserved; renders only when a prototype exists (later work).

Tab state lives in a `?tab=` URL search param so a traceability link can deep-link
to the Conversation tab scrolled to a specific message. Built from Astryx
`TabList` (or `SegmentedControl` if it reads better at this size — decided during
implementation against the component API).

### 5. PRD document view

`PrdDocument` renders inside the PRD tab as **one scrolling document**, not a stack
of independent approval forms (per product intent):

- **Header (Notion-style):** the feature name as the page title, followed by
  properties — `👤 Owner`, `🔖 Version`, `◐ Status` (Draft), `🕐 Created` — as
  icon + muted-label + value rows, with a "more properties" expander. Top-right:
  `Ask agent to revise` and `Accept PRD` buttons (inert this pass).
- **Left: sticky section outline** (Astryx `Outline`) — jump-nav across the ~16
  sections, highlighting the current one.
- **Section renderers**, one per `PRDDocumentSchema` field:
  - Prose sections (executive summary, problem & evidence, target users, goals &
    metrics, proposed solution, user journeys) → `Markdown`.
  - List sections (functional/non-functional requirements, UX states & edge cases,
    dependencies & constraints, acceptance criteria, open questions) → bulleted
    `List`.
  - `mvpScope` → two columns, **Included** / **Excluded**.
  - `risksAndMitigations` → risk/mitigation pairs.
  - `decisionHistory` → each decision with rationale and a **`🔗` citation**
    (`sourceMessageIds`) that links to the Conversation tab at those messages.
- **Per-section "revise"** affordance renders on hover but is inert this pass.

### 6. Generating state

While a `prd_generate` task is in flight, the PRD tab shows a generating state in
place of the document: a progress rail ("Gathered room context → Writing sections
→ Linking decisions → Finalizing") and skeleton section blocks. It is driven by
the existing participant-scoped task-status poller
(`features/ai/room-task-status.ts`), the same mechanism `agent-task-state.tsx`
already uses — no new realtime channel. When the task settles and the `prds` row
appears, the tab swaps to the document.

## Generation trigger — natural language → confirm → run

1. **Intent recognition.** The Product Agent already runs as a natural-conversation
   partner (`room_reply` task; see
   `docs/superpowers/specs/2026-08-01-product-agent-natural-conversation-design.md`).
   We add an optional `proposedAction` field to the room-reply response schema
   (`packages/contracts/src/ai.ts` and the connector's response schema). When the
   model detects PRD intent from any phrasing or casing ("create a prd", "Create A
   PRD", "let's write this up", "@agent formalize this"), it populates
   `proposedAction = { kind: 'prd_generate', label: 'Generate PRD' }`. The model —
   not a composer-side regex — is the judge of intent.
2. **Confirm chip.** When present, the agent's message renders a confirm control:
   **"✨ Generate PRD"** with the note that it runs on the initiator's own
   subscription (~30–60s), plus a dismiss ("Not yet").
3. **Explicit run.** Tapping calls a `generatePrd` server action in
   `features/prd/actions.ts` → `create_ai_task(kind='prd_generate')`. This is the
   explicit request the founding constraint requires.
4. **Connector work.** The connector gains a `prd_generate` task handler: a system
   prompt that produces one coherent PRD from the hydrated room context (messages,
   evidence, decisions, attachments — already assembled by
   `hydrate_authorized_room_context`), and the `PRDDocument` JSON output schema.

Complementary (optional, not required for the first slice): a proactive agent offer
when the room is "ripe", and a `/prd` composer fast path. The natural-language path
above is the primary mechanism.

## Error handling

- Task failure states — `needs_reauthentication`, `usage_limit_reached`, `failed` —
  surface with retry, reusing the existing `agent-task-state.tsx` treatment. The
  generating state in the PRD tab (or the confirm chip in the conversation)
  reflects them; no `prds` row is written on failure.
- Document validation: the settlement RPC rejects a document that fails
  `PRDDocumentSchema` or exceeds the size cap; the task settles to `failed` rather
  than inserting an invalid row.
- Concurrent generation: a room already generating shows the in-flight state; the
  confirm chip guards against firing a second overlapping `prd_generate`.

## Testing

- **pgTAP** (`supabase/tests/`): a new `prds` policy test — participant-only
  `select`, tenant isolation (no cross-org read), and that `authenticated` cannot
  `insert`/`update`/`delete` directly. Extends the current green baseline
  (383 tests).
- **Vitest**: `getRoomPrd` repository, the `generatePrd` action (input validation,
  task creation), and tab-visibility logic.
- **Playwright E2E** (`e2e/`): the full path against the fake device — natural ask
  → confirm chip → generate → PRD tab appears → sections and traceability render.
- `pnpm check:astryx` for design-system conformance.

## Files touched (anticipated)

- `supabase/migrations/2026080200XX_prds.sql` — table, enum, RLS, settlement RPC.
- `supabase/tests/prds.test.sql` — pgTAP policy coverage.
- `packages/contracts/src/ai.ts` — optional `proposedAction` on the room-reply
  schema. (`prd.ts` already holds `PRDDocumentSchema`.)
- `apps/web/src/features/prd/` — `schemas.ts`, `actions.ts`, `repository.ts`,
  `components/` (`prd-tab.tsx`, `prd-document.tsx`, `prd-header.tsx`,
  `prd-outline.tsx`, section renderers, generating state).
- `apps/web/src/features/discovery/components/` — room tab strip; render the
  confirm chip in the agent message.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx` — mount the
  tab strip and route `?tab=`.
- `apps/connector/src/tasks/` — `prd_generate` handler, prompt, and output schema.

## Open questions

None blocking. Version and Owner are first-class in the `prds` table now; their
richer controls (dropdown selection, ownership transfer) arrive with the
acceptance/versioning pass.
