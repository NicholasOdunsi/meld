# Freeform Document Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Document empty state and rigid PRD form with one autosaving, Notion-like block editor that preserves existing documents and versioning.

**Architecture:** Store a constrained Tiptap JSON document in the existing `prds.document` JSONB column under the `blocks-v1` discriminator. Normalize legacy PRDs at the UI boundary, serialize all new writes through one revision-aware autosave action, and route empty, legacy, and freeform documents through a single surface wrapper.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tiptap/ProseMirror, Zod, Astryx components, Supabase/Postgres, Vitest/Testing Library.

## Global Constraints

- Keep the product label `Document`; retain internal `prd` naming where a rename adds no behavior.
- Do not create a database row merely by opening an empty Document.
- Autosave after 750 ms; allow one in-flight save and one trailing newest snapshot.
- New writes use `format: "blocks-v1"`; legacy stored JSON remains readable.
- Supported content is paragraphs, H1-H3, bullets, ordered lists, checklists, quotes, code blocks, links, undo, and redo.
- Use the existing running development server; do not start another server.
- Run only focused contract, Document/PRD, and migration checks.

---

### Task 1: Freeform document contract and normalization

**Files:**
- Modify: `packages/contracts/src/prd.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/freeform-document.test.ts`
- Create: `apps/web/src/features/prd/freeform-document.ts`
- Create: `apps/web/src/features/prd/freeform-document.test.ts`

**Interfaces:**
- Produces: `FreeformDocument`, `FreeformDocumentSchema`, `isFreeformDocument(document)`, `normalizePrdDocument(document)`, and `createEmptyFreeformDocument()`.
- Consumes: the existing structured `PRDDocument` shape and `PRD_SECTIONS` ordering.

- [ ] **Step 1: Add failing schema tests** proving `blocks-v1` accepts an empty title and supported nodes, rejects unknown node types/unsafe links/excessive nesting, and leaves legacy PRDs valid.
- [ ] **Step 2: Run the focused contract test** with `pnpm --dir packages/contracts exec vitest run src/freeform-document.test.ts`; expect the new exports to be missing.
- [ ] **Step 3: Implement the schema union** with a recursive allowlisted node schema, a `meldId` requirement on top-level blocks, bounded title/node attributes, and `PRDDocumentSchema = z.union([FreeformDocumentSchema, LegacyPRDDocumentSchema])`.
- [ ] **Step 4: Add failing adapter tests** covering prose, arrays, scope, risks, decisions, and user journeys.
- [ ] **Step 5: Implement deterministic normalization** so every legacy field becomes ordinary supported blocks with IDs and no source content is discarded.
- [ ] **Step 6: Run both focused suites** and expect them to pass.

### Task 2: Canonical Markdown conversion

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/features/prd/document-markdown.ts`
- Create: `apps/web/src/features/prd/document-markdown.test.ts`
- Modify: `apps/web/src/features/prd/prd-markdown.ts`

**Interfaces:**
- Consumes: `FreeformDocument` and `normalizePrdDocument`.
- Produces: `documentToMarkdown(document): string` and `markdownToDocument(markdown, title?): FreeformDocument`.

- [ ] **Step 1: Install Tiptap and maintained Markdown dependencies** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/markdown`).
- [ ] **Step 2: Add failing round-trip tests** for headings, paragraphs, bullet/ordered/task lists, quotes, code, links, and an `Untitled` export fallback.
- [ ] **Step 3: Implement import/export** through Tiptap's maintained Markdown facilities, sanitize output through `FreeformDocumentSchema`, and assign missing top-level `meldId` values.
- [ ] **Step 4: Route copy/export helpers through `documentToMarkdown`** while retaining the current filename helper.
- [ ] **Step 5: Run `document-markdown.test.ts` and `prd-markdown.test.ts`** and expect both to pass.

### Task 3: Revision-aware first draft persistence

**Files:**
- Create: `supabase/migrations/202608210003_freeform_document_autosave.sql`
- Modify: `apps/web/src/features/prd/repository.ts`
- Modify: `apps/web/src/features/prd/actions.ts`
- Modify: `apps/web/src/features/rooms/backend.ts`
- Modify: `apps/web/src/features/rooms/supabase-backend.ts`
- Modify: `apps/web/src/features/rooms/fake-backend.ts`
- Modify: `apps/web/src/features/rooms/e2e-fake.ts`
- Modify: `apps/web/src/features/prd/actions.test.ts`
- Modify: `apps/web/src/features/prd/repository.test.ts`

**Interfaces:**
- Produces: `autosavePrdDocument({ roomId, document, basePrdId, baseVersion, baseUpdatedAt })` returning `{ status: "saved", prd } | { status: "conflict", latest } | { status: "error", message }`.
- Consumes: `FreeformDocumentSchema` and existing `RoomPrd` mapping.

- [ ] **Step 1: Add failing action/repository tests** for creating v1 from no row, updating the same draft row, creating a new draft after an accepted version, and rejecting mismatched `id` or `updatedAt`.
- [ ] **Step 2: Add the locked SQL RPC** `autosave_prd_document(target_room_id, base_prd_id, base_version, base_updated_at, next_document)`, validate the JSON/size, lock the Room/latest PRD, and return `prd_revision_conflict` for stale input.
- [ ] **Step 3: Add typed repository errors and backend wiring** without changing the existing manual save API used by legacy tests.
- [ ] **Step 4: Add the server action** with strict Zod parsing and public-safe error mapping.
- [ ] **Step 5: Run the focused action/repository tests** and expect them to pass.

### Task 4: Autosave controller

**Files:**
- Create: `apps/web/src/features/prd/document-autosave.ts`
- Create: `apps/web/src/features/prd/document-autosave.test.ts`

**Interfaces:**
- Produces: `createDocumentAutosaveController({ delayMs, save, onStateChange, onSaved, onConflict })` with `enqueue(snapshot)`, `retry()`, `rebase(revision)`, and `dispose()`.
- Consumes: the persistence result from Task 3.

- [ ] **Step 1: Add fake-timer tests** proving 750 ms debounce, no save for an untouched empty document, one in-flight request, one trailing newest snapshot, retry after errors, and pause on conflicts.
- [ ] **Step 2: Implement the framework-independent controller** with a single timer, `inFlight` flag, latest pending snapshot, and explicit conflict pause.
- [ ] **Step 3: Run the focused controller test** and expect it to pass.

### Task 5: Freeform editor and document header

**Files:**
- Create: `apps/web/src/features/prd/components/freeform-document-editor.tsx`
- Create: `apps/web/src/features/prd/components/freeform-document-editor.module.css`
- Create: `apps/web/src/features/prd/components/freeform-document-editor.test.tsx`
- Create: `apps/web/src/features/prd/components/freeform-document-viewer.tsx`
- Create: `apps/web/src/features/prd/components/document-header.tsx`

**Interfaces:**
- Produces: `FreeformDocumentEditor`, `FreeformDocumentViewer`, `DocumentHeader`.
- Consumes: normalized block JSON, `onChange(snapshot)`, `canEdit`, metadata, and autosave state.

- [ ] **Step 1: Query Astryx component contracts** for toolbar, menu, input, metadata, banner, stack, and icon button usage.
- [ ] **Step 2: Add failing component tests** for `New page`, an immediately writable body, read-only behavior, formatting commands, and save-state labels.
- [ ] **Step 3: Build the Tiptap extension set** with StarterKit, Link, TaskList/TaskItem, top-level `meldId` assignment, and an allowlisted paste result.
- [ ] **Step 4: Build a compact formatting toolbar** with Astryx `Button`/menu components and existing pixel icons; use tooltips/labels for every icon.
- [ ] **Step 5: Style the borderless writing surface** with token-only CSS and stable responsive dimensions; keep the title prominent but contained within the pane.
- [ ] **Step 6: Build the metadata header** for provisional and saved states, including Owner, Version, Status, Created, Saving, Saved, and Could not save.
- [ ] **Step 7: Run the focused component test** and expect it to pass.

### Task 6: One surface for empty, legacy, and freeform documents

**Files:**
- Create: `apps/web/src/features/prd/components/freeform-document-surface.tsx`
- Create: `apps/web/src/features/prd/components/freeform-document-surface.test.tsx`
- Modify: `apps/web/src/features/prd/components/prd-document.tsx`
- Modify: `apps/web/src/features/rooms/components/pane-content.tsx`
- Modify: `apps/web/src/features/rooms/components/pane-content.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Modify: `apps/web/src/features/prd/components/prd-generating.tsx`

**Interfaces:**
- Produces: an exported `PrdDocument` wrapper accepting `prd: RoomPrd | null`, `roomId`, owner metadata, permissions, history, and actions.
- Consumes: Tasks 1-5 plus current history/accept/copy/export behavior.

- [ ] **Step 1: Add failing pane/page tests** proving an absent document mounts the editor instead of `PaneEmptyState`/`EmptyState` and passes owner/edit permissions.
- [ ] **Step 2: Change page data construction** to provide Document props even when `prd` is null.
- [ ] **Step 3: Add the surface wrapper** that normalizes legacy data in memory, keeps local content across save failures, autosaves meaningful edits, and renders a viewer when `canEdit` is false.
- [ ] **Step 4: Preserve actions** for history, acceptance, copy, and export after the first save; provisional documents omit actions that require a PRD ID.
- [ ] **Step 5: Add compact Retry and conflict recovery banners**; `Load latest` adopts the server copy and `Keep my copy` rebases only after explicit confirmation.
- [ ] **Step 6: Run the focused pane and surface tests** and expect them to pass.

### Task 7: Migration compatibility and final focused verification

**Files:**
- Modify: `apps/web/src/features/prd/components/prd-version-history.tsx`
- Modify: `apps/web/src/features/prd/components/prd-version-history.test.tsx`
- Modify: `apps/web/src/features/prd/create-prd-generate-task.ts`
- Modify: `apps/web/src/features/prd/create-prd-revise-task.ts`
- Modify: `apps/web/src/features/prd/create-prd-section-assist-task.ts`
- Modify: related focused task tests only where their document contract changes.

**Interfaces:**
- Consumes: canonical normalization and Markdown conversion.
- Produces: history and generation paths that accept legacy and `blocks-v1` documents.

- [ ] **Step 1: Normalize history versions before display and comparison** so mixed legacy/freeform history remains readable.
- [ ] **Step 2: Change generation/revision context to canonical Markdown** and parse generated Markdown into blocks before persistence.
- [ ] **Step 3: Keep legacy section assistance available only for legacy versions**; freeform selections use block IDs and Markdown snapshots rather than field names.
- [ ] **Step 4: Run the focused contract, Markdown, autosave, editor, pane, history, and task tests**; do not run the full suite.
- [ ] **Step 5: Run the app typecheck once** and inspect only changed-file errors.
- [ ] **Step 6: Inspect `git diff --check` and the changed CSS/TSX for Astryx violations**: no new layout `<div>`, no raw hex values, and spacing/sizing through tokens.
- [ ] **Step 7: Leave the existing server running** and report the exact Document workflow ready for the user's visual test.
