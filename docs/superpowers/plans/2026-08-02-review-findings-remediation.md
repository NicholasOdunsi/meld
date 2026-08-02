# Review Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the six confirmed review defects across discovery attachments, first-pair provider setup, and draft restoration while restoring every required validation gate.

**Architecture:** Persist each human message, its mentions, and its staged attachments through one security-invoker PostgreSQL transaction exposed by the discovery repository. Correlate first-pair setup discovery to a server timestamp returned with the pairing code, and restore room drafts after hydration through a guarded queued callback. Keep the existing backend boundary, durable setup projection, and Realtime message subscription.

**Tech Stack:** PostgreSQL/PLpgSQL and pgTAP, Supabase JS, Next.js 16 server routes/actions, React 19, TypeScript 5.9, Vitest, Astryx 0.1.8.

## Global Constraints

- Use Astryx components and tokens only; do not add raw layout elements or hardcoded CSS values.
- Preserve server-owned provider setup state and existing task best-effort semantics.
- A message with attachments must not commit unless every requested staged attachment is linked.
- Database migrations are forward-only and must retain the complete application MIME allowlist.
- Do not broaden the device-pairing, provider-installation, or discovery-room product scope.

---

### Task 1: Atomic discovery message persistence

**Files:**
- Create: `supabase/migrations/202608020001_atomic_discovery_messages.sql`
- Modify: `supabase/tests/discovery_access.test.sql`
- Modify: `apps/web/src/features/discovery/repository.ts`
- Modify: `apps/web/src/features/discovery/repository.test.ts`
- Modify: `apps/web/src/features/discovery/backend.ts`
- Modify: `apps/web/src/features/discovery/supabase-backend.ts`
- Modify: `apps/web/src/features/discovery/e2e-fake.ts`
- Modify: `apps/web/src/features/discovery/fake-backend.ts`
- Modify: `apps/web/src/features/discovery/actions.ts`
- Modify: `apps/web/src/features/discovery/actions.test.ts`

**Interfaces:**
- Consumes: `MessageInput`, `public.link_staged_discovery_attachments(uuid, uuid, uuid[], text)`, and the existing authenticated discovery backend.
- Produces: `public.post_discovery_message(uuid, uuid, text, uuid[], uuid[]) returns setof public.messages` and `DiscoveryBackend.postMessage(input)` with atomic attachment semantics.

- [ ] **Step 1: Add failing pgTAP coverage for atomic rollback and success**

Insert a staged attachment, call `post_discovery_message` with a missing attachment ID and assert both the exception and absence of the message. Then call it with the staged ID and assert the message and attachment share the returned message ID.

- [ ] **Step 2: Run the focused database suite to verify the function is missing**

Run: `pnpm exec supabase test db supabase/tests/discovery_access.test.sql`

Expected: FAIL because `public.post_discovery_message` does not exist.

- [ ] **Step 3: Add the transaction function**

Create a security-invoker PL/pgSQL function with this signature:

```sql
create function public.post_discovery_message(
  target_room_id uuid,
  target_client_id uuid,
  target_body text,
  target_mentioned_user_ids uuid[],
  target_attachment_ids uuid[]
)
returns setof public.messages
```

The function must reject a body over 20,000 characters, reject a request with neither body nor attachment, insert or recover the caller's `(room_id, client_id)` message, upsert valid mentions, call `link_staged_discovery_attachments` for a new message, and return the message. Any linking exception must roll back the INSERT.

- [ ] **Step 4: Route the real repository through the RPC**

Replace the direct message INSERT and separate mention upsert with one `supabase.rpc("post_discovery_message", ...)` call. Parse the returned first row with `mapDiscoveryMessageRow`. Preserve the existing user verification and generic error copy.

- [ ] **Step 5: Make the fake backend atomic before mutation**

Validate every staged attachment ID before pushing the fake message, then link those rows as part of the same synchronous store mutation. A validation failure must leave both the messages and attachment rows unchanged.

- [ ] **Step 6: Remove the second attachment-link phase from the action**

`postMessage` should await `backend.postMessage(parsed)` and proceed directly to optional Product Agent task creation. Delete the swallowed `linkStagedAttachments` block while retaining the standalone link action if tests or other callers still require it.

- [ ] **Step 7: Update repository and action tests**

Assert exact RPC arguments, atomic fake behavior, no second link call, and error propagation for attachment-only failure.

- [ ] **Step 8: Run focused tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/discovery/repository.test.ts src/features/discovery/actions.test.ts src/features/discovery/e2e-fake.test.ts`

Expected: PASS.

### Task 2: MIME allowlist parity

**Files:**
- Create: `supabase/migrations/202608020002_attachment_mime_parity.sql`
- Modify: `supabase/tests/discovery_access.test.sql`

**Interfaces:**
- Consumes: the MIME values in `AttachmentInputSchema`.
- Produces: matching Storage bucket and `attachments_mime_type_check` allowlists.

- [ ] **Step 1: Add failing pgTAP assertions for structured-text MIME values**

Insert attachment intents for `text/csv`, `text/tab-separated-values`, `text/yaml`, `application/yaml`, `application/json`, `application/xml`, and `text/xml`, and assert they satisfy the table constraint. Assert the Storage bucket array contains the same values.

- [ ] **Step 2: Add the forward-only parity migration**

Replace both allowlists with the exact sixteen-value set from the approved spec.

- [ ] **Step 3: Run SQL and database validation**

Run: `pnpm test:sql && pnpm exec supabase test db supabase/tests/discovery_access.test.sql`

Expected: PASS.

### Task 3: Realtime attachment resolution retry

**Files:**
- Modify: `apps/web/src/features/discovery/components/conversation.tsx`
- Modify: `apps/web/src/features/discovery/components/conversation.test.tsx`

**Interfaces:**
- Consumes: `fetchMessageAttachments(roomId, messageId)`.
- Produces: a bounded resolver that stops after attachments are found, the component unmounts, or three attempts complete.

- [ ] **Step 1: Add a failing test for an initially empty lookup**

Emit a teammate Realtime message, make the first attachment lookup return `[]` and the second return an image, advance fake timers, and assert the image appears without a full message reload.

- [ ] **Step 2: Implement bounded retry with cancellation**

Add a focused helper/callback that performs an immediate lookup followed by at most two delayed retries. Track scheduled timers and mounted state so unmount cancels pending work. Do not retry after a non-empty result.

- [ ] **Step 3: Run the conversation tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/discovery/components/conversation.test.tsx`

Expected: PASS.

### Task 4: Correlated first-pair discovery and retry

**Files:**
- Modify: `apps/web/src/features/ai/device-service.ts`
- Modify: `apps/web/src/features/ai/device-service.test.ts`
- Modify: `apps/web/src/features/ai/components/use-pairing-code.ts`
- Modify: `apps/web/src/features/ai/components/ai-connection-setup.tsx`
- Modify: `apps/web/src/features/ai/components/ai-connection-setup.test.tsx`
- Modify: `apps/web/src/features/ai/provider-setup-service.ts`
- Modify: `apps/web/src/features/ai/provider-setup-service.test.ts`
- Modify: `apps/web/src/app/api/devices/provider-setups/route.ts`
- Modify: `apps/web/src/app/api/devices/provider-setups/route.test.ts`

**Interfaces:**
- Consumes: pairing-code creation and `ProviderSetupView.deviceId`.
- Produces: `PairingCode.createdAt`, `listProviderSetupsSince(supabase, provider, createdAfter)`, and `GET /api/devices/provider-setups?provider=<provider>&createdAfter=<iso>`.

- [ ] **Step 1: Add failing service and component tests**

Assert pairing-code creation returns a server timestamp, the setup query includes terminal rows at or after that timestamp, first-pair discovery adopts a terminal result, and retry posts with the discovered `setup.deviceId` while `devices=[]`.

- [ ] **Step 2: Return the pairing creation timestamp**

Capture `new Date().toISOString()` immediately after the successful pairing-code RPC and return it as `createdAt`. Parse and store it in `usePairingCode`; fake pairing codes use the hook's current clock.

- [ ] **Step 3: Replace nonterminal list discovery with a correlated query**

Validate the route's `provider` and `createdAfter` query parameters. Query `provider_setup_requests` with `.eq("provider", provider)`, `.gte("created_at", createdAfter)`, newest first, and `.limit(1)`, without a status filter.

- [ ] **Step 4: Update onboarding discovery and retry**

Poll only when `pairing.pairingCode?.createdAt` exists. Include provider and timestamp in the URL, adopt the returned row even when terminal, and retry with `setup.deviceId`.

- [ ] **Step 5: Run focused provider tests**

Run: `pnpm --filter @meld/web exec vitest run src/features/ai/device-service.test.ts src/features/ai/provider-setup-service.test.ts src/app/api/devices/provider-setups/route.test.ts src/features/ai/components/ai-connection-setup.test.tsx`

Expected: PASS.

### Task 5: Hydration-safe draft restoration and Astryx verification

**Files:**
- Modify: `apps/web/src/features/discovery/components/conversation.tsx`
- Modify: `apps/web/src/features/discovery/components/conversation.test.tsx`

**Interfaces:**
- Consumes: `readRoomDraft`, `clearRoomDraft`, and `RoomDraft`.
- Produces: one guarded post-hydration restoration of body, provider override, and attachment IDs.

- [ ] **Step 1: Run Astryx discovery before UI edits**

Run: `pnpm exec astryx build "discovery chat composer restoring a saved draft after returning from setup"` and inspect every named component used by the edited UI.

- [ ] **Step 2: Add/retain the failing lint and restoration coverage**

Run `pnpm --filter @meld/web lint` to capture the current failure. Ensure the existing restored-draft tests assert body, provider override, and attachment IDs survive exactly one send.

- [ ] **Step 3: Restore from a guarded queued callback**

Initialize the rendered composer with empty state. On mount, schedule one zero-delay callback that reads and parses the room draft, updates the draft attachment ref, body, and restored provider state together, clears storage, and no-ops after unmount. Remount the composer once with a stable restoration key so `initialProviderOverride` is applied.

- [ ] **Step 4: Run component tests, lint, and Astryx checks**

Run: `pnpm --filter @meld/web exec vitest run src/features/discovery/components/conversation.test.tsx && pnpm --filter @meld/web lint && pnpm check:astryx`

Expected: PASS.

### Task 6: Full validation

**Files:**
- Modify only files required by failures found during validation.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-5.
- Produces: a clean workspace whose required gates pass.

- [ ] **Step 1: Run formatting and diff checks**

Run: `git diff --check && git status --short`

- [ ] **Step 2: Run application validation**

Run: `pnpm --filter @meld/web test && pnpm --filter @meld/connector test && pnpm --filter @meld/gateway test && pnpm typecheck && pnpm lint && pnpm build`

- [ ] **Step 3: Run repository and database validation**

Run: `pnpm test:sql && pnpm check:astryx && pnpm test:colocation && pnpm exec supabase test db`

- [ ] **Step 4: Review the final diff against the approved spec**

Confirm every success criterion is covered by code and a regression test, no unrelated files changed, and generated/local Supabase state remains ignored.
