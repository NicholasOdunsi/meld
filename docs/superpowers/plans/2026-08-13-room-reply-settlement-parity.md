# Room Reply Settlement Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make valid room replies that cite attached context settle successfully and replace the misleading room-reply review message with an honest retry state.

**Architecture:** The connector and PostgreSQL settlement remain independent trust boundaries, but both authorize citations against the same frozen union of message, evidence, attachment, and decision IDs. Regression tests feed the observed attachment citation through each boundary. The web keeps the existing `needs_review` status and `Ask again` callback while removing review language.

**Tech Stack:** TypeScript 5.9, Vitest 4, PostgreSQL/Supabase migrations, pgTAP, React 19, Astryx 0.1.8.

## Global Constraints

- The frozen context manifest remains the citation authorization boundary.
- A UUID absent from all manifest categories must still be rejected.
- Historical terminal tasks are not replayed or mutated.
- Room replies expose no human-review action; recovery remains `Ask again`.
- Existing unrelated worktree changes must not be altered.

---

### Task 1: Lock Connector Citation Semantics

**Files:**
- Modify: `apps/connector/src/providers/provider-adapter.test.ts`
- Test: `apps/connector/src/providers/provider-adapter.test.ts`

**Interfaces:**
- Consumes: `validateTaskResult(value, manifest, "room_reply")`
- Produces: an executable assertion that `citedEvidenceIds` may contain an authorized `attachmentIds` UUID.

- [ ] **Step 1: Add the live-shape regression test**

Add a room reply whose `citedEvidenceIds` contains the fixture attachment ID and whose `proposedAction` is `{ kind: "user_flow_generate" }`. Assert `validateTaskResult` returns `{ ok: true, result: roomReply }`. Keep the existing outside-manifest rejection assertion.

- [ ] **Step 2: Run the focused connector test**

Run: `pnpm --filter @meld/connector exec vitest run src/providers/provider-adapter.test.ts`

Expected: PASS, proving the connector's intended rule before SQL changes.

### Task 2: Align PostgreSQL Settlement

**Files:**
- Create: `supabase/migrations/202608130003_room_reply_manifest_citations.sql`
- Modify: `supabase/tests/room_agent_messages.test.sql`
- Test: `supabase/tests/room_agent_messages.test.sql`

**Interfaces:**
- Consumes: `public.settle_ai_task(...)` and `context_manifest_json`
- Produces: a canonical `settle_ai_task` definition in which both reply citation arrays must be subsets of `messageIds ∪ evidenceIds ∪ attachmentIds ∪ decisionIds`.

- [ ] **Step 1: Make pgTAP replay the observed failure**

Give the valid settlement fixture an attachment UUID in `attachmentIds`, include that UUID in `payload.citedEvidenceIds`, retain the `user_flow_generate` proposal, and assert the task reaches `completed`, inserts exactly one Product Agent message, and persists the attachment UUID in `messages.cited_evidence_ids`.

- [ ] **Step 2: Run the test to verify the current function fails**

Run: `pnpm exec supabase test db supabase/tests/room_agent_messages.test.sql`

Expected before the migration is applied: the attachment-citation settlement returns `needs_review` instead of `completed`.

- [ ] **Step 3: Add the forward migration**

Replace the latest `public.settle_ai_task` definition. Build `manifest_authorized_ids` from all four arrays:

```sql
select coalesce(array_agg(distinct value::uuid), '{}'::uuid[])
into manifest_authorized_ids
from jsonb_array_elements_text(
  coalesce(current_task.context_manifest_json -> 'messageIds', '[]'::jsonb)
  || coalesce(current_task.context_manifest_json -> 'evidenceIds', '[]'::jsonb)
  || coalesce(current_task.context_manifest_json -> 'attachmentIds', '[]'::jsonb)
  || coalesce(current_task.context_manifest_json -> 'decisionIds', '[]'::jsonb)
) as value;

if not (reply_cited_message_ids <@ manifest_authorized_ids)
  or not (reply_cited_evidence_ids <@ manifest_authorized_ids)
then
  reply_valid := false;
end if;
```

Preserve the rest of the current function byte-for-byte except for replacing the two category-specific manifest variables and checks.

- [ ] **Step 4: Apply migrations and rerun pgTAP**

Run: `pnpm exec supabase migration up`

Run: `pnpm exec supabase test db supabase/tests/room_agent_messages.test.sql`

Expected: PASS, including the attachment citation and existing out-of-manifest rejection.

- [ ] **Step 5: Run SQL definition checks**

Run: `pnpm check:sql-rooms && pnpm check:sql-arities`

Expected: PASS with the new migration recognized as the latest canonical definition.

### Task 3: Correct the Room Reply Recovery Copy

**Files:**
- Modify: `apps/web/src/features/ai/components/agent-task-state.tsx`
- Modify: `apps/web/src/features/ai/components/agent-task-state.test.tsx`
- Test: `apps/web/src/features/ai/components/agent-task-state.test.tsx`

**Interfaces:**
- Consumes: `AgentTaskState` with `status="needs_review"`
- Produces: an error `Banner` titled `The Product Agent couldn't reply`, with `Ask again` as its only recovery action.

- [ ] **Step 1: Update the failing UI assertion**

Assert the banner shows `The Product Agent couldn't reply`, shows `The response could not be posted. Ask again to generate a fresh reply.`, exposes no visible text matching `/review/i`, and still invokes `onAskAgain`.

- [ ] **Step 2: Run the focused web test and observe the copy failure**

Run: `pnpm --filter @meld/web exec vitest run src/features/ai/components/agent-task-state.test.tsx`

Expected before implementation: FAIL because the component still renders `The reply needs review`.

- [ ] **Step 3: Change only the room-reply presentation map**

Set `ATTENTION_PRESENTATION.needs_review` to:

```ts
{
  bannerStatus: "error",
  title: "The Product Agent couldn't reply",
  description:
    "The response could not be posted. Ask again to generate a fresh reply.",
  action: "ask_again",
}
```

Leave PRD generation copy and all callbacks unchanged.

- [ ] **Step 4: Rerun the focused web test**

Run: `pnpm --filter @meld/web exec vitest run src/features/ai/components/agent-task-state.test.tsx`

Expected: PASS.

### Task 4: Cross-Layer Verification

**Files:**
- Verify all files changed in Tasks 1-3.

**Interfaces:**
- Consumes: the connector, SQL, and UI changes.
- Produces: evidence that the same live-shaped payload is accepted end to end without weakening manifest authorization.

- [ ] **Step 1: Run focused connector and web suites**

Run: `pnpm --filter @meld/connector exec vitest run src/providers/provider-adapter.test.ts src/providers/claude-adapter.test.ts src/tasks/task-executor.test.ts`

Run: `pnpm --filter @meld/web exec vitest run src/features/ai/components/agent-task-state.test.tsx src/features/rooms/components/conversation.test.tsx`

- [ ] **Step 2: Run type and convention checks**

Run: `pnpm --filter @meld/connector typecheck && pnpm --filter @meld/web typecheck && pnpm check:astryx`

- [ ] **Step 3: Inspect only the scoped diff**

Run: `git diff --check`

Run: `git diff -- apps/connector/src/providers/provider-adapter.test.ts apps/web/src/features/ai/components/agent-task-state.tsx apps/web/src/features/ai/components/agent-task-state.test.tsx supabase/migrations/202608130003_room_reply_manifest_citations.sql supabase/tests/room_agent_messages.test.sql`

Confirm no historical task mutation, provider prompt change, or unrelated refactor is present.
