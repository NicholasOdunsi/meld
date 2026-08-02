# Import a brief → Product Agent review, and real attachment context

**Date:** 2026-08-01
**Status:** Approved (design), pending spec review
**Area:** `apps/web` only — no connector, gateway, or DB migration changes.

## Problem

Three connected problems, all around getting a document in front of the Product Agent:

1. **Import hangs.** On the home page, "Import Project" → pick a brief shows an
   "Importing your files…" spinner that never resolves. Reloading reveals the room
   was created but the brief did not attach.

2. **Import does nothing useful.** Even when it works, import only creates a room
   with a file attached. The user wants the agent to *read the brief and post a
   breakdown/review*.

3. **Attachments never reach the agent.** The agent only reads attachments that are
   linked to a message, and the task's context manifest is **frozen at task-creation
   time**. In the composer, attachments are linked *after* `postMessage` has already
   created the reply task — so a file attached to the message that mentions
   `@Product Agent` is invisible to the agent. Adding file types to the composer's
   `＋` button is pointless until this ordering is fixed.

## Root causes (verified)

- **Hang:** `unpdf`/`pdfjs-dist` are bundled into the Next server-action chunk
  (no `serverExternalPackages` in `apps/web/next.config.ts`). pdfjs's fake-worker
  handshake never fires in the bundled runtime, so `extractText()` returns a
  promise that **never settles**. A never-settling promise is uncatchable, so the
  surrounding `try/catch` in `createRoomFromUploads`
  (`apps/web/src/features/discovery/actions.ts:350-363`) can't convert it to a
  per-file failure. Extraction runs *before* persistence, so the room (created at
  `actions.ts:340-343`) exists but no attachment row is written.
  This is the "only e2e catches it" class of bug (build/typecheck/unit all pass).

- **Manifest ordering:** `create_room_reply_task`
  (`supabase/migrations/202607290002_room_agent_messages.sql:234-269`) freezes
  `attachmentIds` where `message_id is not null` at the instant the task is created.
  The composer's `submit` links attachments only *after* `sendMessage`/`postMessage`
  returns (`apps/web/src/features/discovery/components/conversation.tsx:654`), and
  `postMessage` creates the task inside itself
  (`apps/web/src/features/discovery/actions.ts:163-176`). No later re-freeze exists.

## Goals

- Import a brief and, when an agent is connected, get an automatic breakdown in a room.
- Make files attached to an `@Product Agent` message actually reach the agent.
- Broaden accepted attachment types beyond images/PDF to common text docs.
- Make the import loop hang-proof, not merely PDF-safe.

## Non-goals / Future work

- **`.docx` / `.xlsx` / `.rtf`.** These need a binary parser dependency (e.g.
  `mammoth`) that carries the *same* server-action bundling/hang risk we're fixing.
  Deferred to a fast-follow with its own `serverExternalPackages` entry and tests.
- No changes to the connector/gateway/agent prompt: the agent already ingests
  `attachments[].extractedText` from the hydrated manifest
  (`apps/connector/src/tasks/product-agent-prompt.ts:90-96`). We only need to get the
  brief into the manifest.
- No new message provenance type. We reuse a normal human-authored message that
  mentions `@Product Agent`; `create_room_reply_task`'s human-author requirement is met.

## Design

### Piece 1 — Hang fix

- **`apps/web/next.config.ts`:** add `serverExternalPackages: ["unpdf", "pdfjs-dist"]`
  so PDF extraction runs as a real Node module.
- **Bounded extraction/upload:** wrap the per-file work in `createRoomFromUploads`
  (and the shared `uploadAttachment`/`stageDiscoveryAttachment` path) in a timeout
  (~30s) via `Promise.race` with an `AbortController` where supported. On timeout,
  reject → the existing catch records the file in `failedFileNames`. Result: any
  future stall (PDF worker, stalled Supabase Storage `.upload()` at
  `apps/web/src/features/discovery/upload-persistence.ts:42`, which has no timeout)
  degrades to a caught per-file failure instead of an infinite spinner.

### Piece 2 — Attachment context ordering (unblocks the agent reading files)

Make `postMessage` the single orchestrator so linking happens **before** the task's
manifest freeze:

- **Schema:** add `attachmentIds: z.array(uuid).max(10).optional()` to
  `MessageInputSchema` (`apps/web/src/features/discovery/schemas.ts:17-27`).
- **`postMessage` (`actions.ts:145-196`):** after the message persists
  (unconditional, still first), if `attachmentIds` is non-empty, best-effort
  `backend.linkStagedAttachments({ roomId, messageId, attachmentIds, caption: body })`
  **before** the `createRoomReplyTask` call. The manifest then includes the brief.
  Link failure is logged and surfaced but never rolls back the message.
- **Composer (`conversation.tsx`):** pass `attachmentIds` in the `MessageInput` and
  delete the separate post-send `linkAttachmentsToMessage` step (`:566-589`, `:654`).
  The ids passed are the freshly-staged submission attachments **plus** any restored
  draft's surviving `attachmentIds` (consumed once, on the first send after a
  restore). This closes the documented "their ids survive in the draft for future
  re-linking" TODO (`conversation.tsx:388-391`) and is what makes the not-ready
  import path (Piece 3) and the composer's own not-ready→reconnect path actually
  re-attach the brief.
- Invariant preserved: message persists first; linking and task creation are
  best-effort and cannot fail the message.

### Piece 3 — Import a brief → review

Reuses Piece 2. Staging gives each brief an attachment id; the ready path then goes
through the ordering-fixed `postMessage`.

New server action **`createRoomFromBrief(formData)`** in
`apps/web/src/features/discovery/actions.ts`:

1. Parse `organizationId` + `files` (reuse existing guards).
2. `createDiscoveryRoom({ organizationId, name: deriveRoomNameFromFiles(names) })`.
3. Stage each file via the existing staged-upload path (`readAttachmentUpload` +
   `backend.stageAttachment`), collecting `stagedIds` and `failedFileNames`.
4. `getAgentReadiness()`:
   - **Ready:** call `postMessage({ roomId, clientId: <server uuid>, body: OPENER,
     mentionedUserIds: [], mentionsProductAgent: true, attachmentIds: stagedIds })`.
     Piece 2 links the briefs then creates the task with the brief in the manifest.
     Return `{ roomId, agentTask, failedFileNames, ready: true }`.
   - **Not ready:** return `{ roomId, stagedIds, failedFileNames, ready: false }`
     without posting. The client saves a room draft (body `OPENER`, `attachmentIds:
     stagedIds`, `mentionRanges` for the `@Product Agent` span) using the existing
     `serializeRoomDraft`/`roomDraftStorageKey` and navigates to the room. The
     composer restores the draft (brief attached, mention present) and shows the
     existing "Connect your AI to reply" banner. After the user connects and hits
     Send, the ordering-fixed normal flow produces the review. This reuses the
     draft-preserve/restore path already proven by
     `conversation.test.tsx` ("restores the saved draft and queues a Product Agent
     reply with the restored provider").
5. `OPENER = "@Product Agent — please review this brief and give me a breakdown of it."`
   (For >1 file: "these documents".)

**Home flow (`use-starting-point-actions.ts`):** `handleFilesSelected` calls
`createRoomFromBrief` instead of `createRoomFromUploads`. On `ready: true` →
`router.push('/<org>/discovery/<roomId>')`. On `ready: false` → save draft, then push.
Toast on `failedFileNames`. `isImporting` clears in `finally` regardless (already the
case). `createRoomFromUploads` is removed if no other caller remains (it is only used
here).

### Piece 4 — Accepted file types

- **Extractor (`attachment-extractor.ts`):** treat a broader text family as UTF-8
  text (reuse the existing `TextDecoder("utf-8", { fatal: true })` branch):
  `text/plain`, `text/markdown`, `text/html` (existing), plus `text/csv`,
  `application/json`, `application/xml`/`text/xml`, `text/yaml`/`application/yaml`,
  `text/tab-separated-values`. HTML keeps its tag-stripping branch.
- **Schema (`AllowedMimeTypeSchema`, `schemas.ts:48-57`):** add the new MIME types.
- **Extension fallback:** browsers often send an empty or generic MIME type for
  `.md`, `.csv`, `.yaml`, etc. Where the flow currently trusts `file.type`, derive an
  effective MIME from the file extension when `file.type` is empty/`application/
  octet-stream`. This fixes a latent bug where `.md` with no MIME is rejected. Applied
  in `parseAttachmentForm` (`actions.ts:231-258`) and mirrored in the client accept
  lists.
- **Accept lists:** unify Import (`STARTING_POINT_ACCEPTED_FILE_TYPES`,
  `use-starting-point-actions.ts:8`) and composer (`ACCEPTED_ATTACHMENT_TYPES`,
  `composer.tsx:62-70`) to a shared constant:
  `.txt,.md,.html,.pdf,.csv,.json,.xml,.yaml,.yml,.tsv` + the existing image MIME types.

## Data flow (ready import)

```
Home ─ createRoomFromBrief(files)
        ├─ createRoom
        ├─ stage each brief  ──────────────► attachment rows (message_id null)
        ├─ getAgentReadiness → ready
        └─ postMessage(body, mentionsProductAgent, attachmentIds=[briefIds])
             ├─ backend.postMessage           (human message persists FIRST)
             ├─ linkStagedAttachments         (briefs now message_id = msg.id)
             └─ createRoomReplyTask           (manifest freezes WITH briefs)
                   │
Gateway/connector ─┴─► agent reads attachments[].extractedText ─► settle_ai_task
                                                                    posts product_agent
                                                                    breakdown message
Client navigates to /<org>/discovery/<roomId> ─► breakdown streams in via poll.
```

## Error handling

- Per-file stage/extract failure → `failedFileNames`, room still created, toast.
- All files fail to stage → still create the room; if nothing to review, skip the
  task (treat as not-ready-style: land in room, no breakdown). Never hang.
- Link failure inside `postMessage` → logged, message stands, manifest may miss that
  file (best-effort, matches current invariant).
- Task creation failure → `agentTask: retryable_error`, surfaced in-room as today.

## Testing

- **Unit — extractor:** csv/json/xml/yaml/tsv decode to text; extension fallback for
  empty-MIME `.md`/`.csv`; existing html/pdf/image branches unchanged.
- **Unit — `postMessage` ordering:** with `attachmentIds`, `linkStagedAttachments` is
  called before `createRoomReplyTask` (assert call order); message still returns if
  linking throws.
- **Unit — `createRoomFromBrief`:** ready path posts an `@Product Agent` message with
  `attachmentIds` and returns a queued task; not-ready path returns `stagedIds` and no
  task; `failedFileNames` populated on stage failure; room always created.
- **Unit — home action:** ready → push to room; not-ready → draft saved (brief ids +
  mention range) then push.
- **Real-app verification (required):** import a real PDF against the running dev app
  (Playwright/screenshot per the local-verification-setup note) to prove the hang is
  gone and the breakdown appears — unit/build cannot catch the bundling hang.

## Open risks

- Browser MIME variance for the new text types; mitigated by the extension fallback.
- `postMessage` gaining `attachmentIds` touches a hot path; the ordering change and
  its call-order test are the crux of the review.
