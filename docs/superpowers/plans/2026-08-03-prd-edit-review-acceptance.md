# PRD Editing, Gap Review, and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an editable, versioned Discovery Room PRD with deterministic gap review, section-aware history/diffs, role-restricted acceptance, and immutable accepted snapshots.

**Architecture:** Keep `prds` as an append-only document-version store, exposing guarded Supabase RPCs for draft saves and acceptance. Share pure review and diff functions between the client UI and tests, and extend the existing fake Discovery backend so the same actions work in Playwright. Keep the current read-only renderer as the view-mode foundation and compose a focused client editor around it.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Supabase/PostgreSQL RPCs and RLS, Vitest Testing Library, Playwright, Astryx Core 0.1.8.

## Global Constraints

- Do not add a dependency; use the existing Astryx Core components and current test stack.
- No raw `<div>` or `<span>` layout elements; use Astryx layout components for structure.
- Use Astryx component props first and token variables for custom values; do not add raw hex, hardcoded visual pixels, Tailwind utilities, or imported CSS.
- Preserve the existing `PRDDocument` contract and stable `PRD_SECTIONS` IDs; additions must be validated with Zod.
- Save review warnings but do not silently block saving or acceptance because warnings exist.
- Accepted document content is immutable; editing after acceptance inserts a new draft version.
- Only room editors may save; only the room owner or organization admin may accept.
- AI chat and highlight-to-discuss behavior are deferred from this plan.
- Run commands through the repository’s existing pnpm scripts and `pnpm exec astryx` discovery workflow.

---

## File map

Create focused domain modules under `apps/web/src/features/prd/`:

- `prd-review.ts`: deterministic gap detection and warning types.
- `prd-review.test.ts`: every gap rule and stable warning/section mapping.
- `prd-diff.ts`: section-aware document comparison.
- `prd-diff.test.ts`: prose, list, structured-row, and unchanged comparisons.
- `components/prd-editor.tsx`: client form state, dirty state, save/cancel, and conflict handling.
- `components/prd-editor.test.tsx`: structured editing interactions and mutation states.
- `components/prd-gap-review.tsx`: review dialog/panel and section links.
- `components/prd-gap-review.test.tsx`: warning rendering and navigation actions.
- `components/prd-version-history.tsx`: history list and comparison UI.
- `components/prd-version-history.test.tsx`: version metadata and diff rendering.

Modify the existing PRD and persistence boundaries:

- `apps/web/src/features/prd/schemas.ts`: accepted status and audit metadata.
- `apps/web/src/features/prd/repository.ts` and `.test.ts`: history, save, and accept RPC access.
- `apps/web/src/features/prd/actions.ts` and `.test.ts`: validated server actions and typed mutation results.
- `apps/web/src/features/prd/queries.ts`: current/history reads.
- `apps/web/src/features/prd/components/prd-document.tsx`: compose view, edit, review, history, and acceptance controls.
- `apps/web/src/features/prd/components/prd-header.tsx`: status/accepted-snapshot presentation and action slots.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx` and `.test.tsx`: load history and pass room/permission context.
- `apps/web/src/features/discovery/backend.ts`, `fake-backend.ts`, `e2e-fake.ts`, and `supabase-backend.ts`: shared mutation/read interface and fake/real implementations.
- `supabase/migrations/202608030001_prd_editable_versions.sql`: schema, guarded functions, grants, and immutability trigger.
- `supabase/tests/prds.test.sql`: persistence, authorization, conflict, acceptance, and immutability assertions.
- `e2e/prd-edit-acceptance.spec.ts`: browser workflow.
- `docs/product-feature-checklist.md`: evidence for completed PRD workflow items.

## Interfaces established by the plan

The implementation should use these names and shapes so each task composes cleanly:

```ts
export type PrdGap = {
  id: string;
  sectionId: string;
  message: string;
};

export function findPrdGaps(document: PRDDocument): PrdGap[];

export type PrdSectionDiff = {
  sectionId: string;
  label: string;
  before: PRDDocument[keyof PRDDocument] | undefined;
  after: PRDDocument[keyof PRDDocument] | undefined;
};

export function diffPrdDocuments(
  before: PRDDocument,
  after: PRDDocument,
): PrdSectionDiff[];

export type SavePrdResult =
  | { status: "saved"; prd: RoomPrd }
  | { status: "conflict"; currentVersion: number }
  | { status: "error"; message: string };

export type AcceptPrdResult =
  | { status: "accepted"; prd: RoomPrd }
  | { status: "error"; message: string };
```

The persistence layer should expose these operations:

```ts
getRoomPrd(roomId: string): Promise<RoomPrd | null>;
getRoomPrdHistory(roomId: string): Promise<RoomPrd[]>;
saveRoomPrdVersion(input: {
  roomId: string;
  baseVersion: number;
  document: PRDDocument;
}): Promise<RoomPrd>;
acceptRoomPrdVersion(input: {
  roomId: string;
  prdId: string;
}): Promise<RoomPrd>;
```

### Task 1: Add PRD metadata, gap detection, and section-aware diffs

**Files:**
- Modify: `apps/web/src/features/prd/schemas.ts`
- Create: `apps/web/src/features/prd/prd-review.ts`
- Create: `apps/web/src/features/prd/prd-review.test.ts`
- Create: `apps/web/src/features/prd/prd-diff.ts`
- Create: `apps/web/src/features/prd/prd-diff.test.ts`
- Modify: `apps/web/src/features/prd/prd-sections.ts` only if a stable section helper is needed by the new modules

**Interfaces:**
- Consumes: `PRDDocumentSchema`, `PRDDocument`, and `PRD_SECTIONS`.
- Produces: `RoomPrd` accepts `status: "draft" | "accepted"`, `createdBy`, nullable `acceptedAt`, and nullable `acceptedBy`; `findPrdGaps` and `diffPrdDocuments` use the signatures above.

- [ ] **Step 1: Write failing review tests** for blank prose, blank list rows, missing risk/mitigation values, empty MVP rows, incomplete decisions, and open questions. Assert each warning has the expected stable `sectionId` and message.

```ts
it("flags an open question without treating it as a schema error", () => {
  const gaps = findPrdGaps({ ...completePrdDocument(), openQuestions: [""] });
  expect(gaps).toEqual([
    expect.objectContaining({ sectionId: "open-questions" }),
  ]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `pnpm --filter web test -- src/features/prd/prd-review.test.ts`

Expected: FAIL because the review module does not exist.

- [ ] **Step 3: Implement `findPrdGaps`.** Trim values only for warning detection, keep the original document untouched, and return deterministic IDs based on section plus row index. Treat an existing open-question row as a warning even when it is non-empty; do not make warnings schema errors.

- [ ] **Step 4: Add failing diff tests** for one changed prose field, an added/removed list row, changed risk and MVP rows, changed title, and identical documents returning an empty array.

```ts
it("reports only changed sections", () => {
  const before = completePrdDocument();
  const after = { ...before, executiveSummary: "Updated" };
  expect(diffPrdDocuments(before, after)).toEqual([
    expect.objectContaining({ sectionId: "executive-summary" }),
  ]);
});
```

- [ ] **Step 5: Implement `diffPrdDocuments`** by comparing `title` plus every entry in `PRD_SECTIONS`, preserving section labels and before/after values for the UI.

- [ ] **Step 6: Update `RoomPrdSchema` and its tests** for accepted status and nullable audit fields, then run the focused PRD tests.

- [ ] **Step 7: Commit the domain slice.**

```bash
git add apps/web/src/features/prd/schemas.ts apps/web/src/features/prd/prd-review.ts apps/web/src/features/prd/prd-review.test.ts apps/web/src/features/prd/prd-diff.ts apps/web/src/features/prd/prd-diff.test.ts apps/web/src/features/prd/prd-sections.ts
git commit -m "feat(prd): add gap review and document diffs"
```

### Task 2: Add guarded database versioning and acceptance

**Files:**
- Create: `supabase/migrations/202608030001_prd_editable_versions.sql`
- Modify: `supabase/tests/prds.test.sql`

**Interfaces:**
- Consumes: `public.prds`, `public.can_edit_room`, `public.is_org_admin`, room ownership, and the existing participant RLS policy.
- Produces: `public.save_prd_version(target_room_id uuid, base_version integer, next_document jsonb) returns public.prds` and `public.accept_prd_version(target_prd_id uuid) returns public.prds`, both executable by `authenticated`.

- [ ] **Step 1: Add failing pgTAP assertions** for the status enum, metadata columns, editor save, stale base conflict, viewer rejection, owner/admin acceptance, member rejection, accepted-row document immutability, accepted-row deletion rejection, and retry-safe acceptance.

```sql
select throws_ok(
  $$ select public.save_prd_version(
    '50000000-0000-4000-8000-000000000001'::uuid,
    1,
    '{}'::jsonb
  ) $$,
  'P0001',
  'prd_version_conflict',
  'a stale base version cannot overwrite the latest draft'
);
```

- [ ] **Step 2: Run the PRD database test to verify it fails.**

Run: `pnpm test:db`

Expected: FAIL because the enum, columns, and RPCs do not exist.

- [ ] **Step 3: Extend `public.prd_status`** to include `accepted`, add `created_by`, `accepted_at`, and `accepted_by`, backfill generated rows with their owner as `created_by`, and keep existing generated rows as drafts.

- [ ] **Step 4: Implement `save_prd_version`** as `security definer` with `search_path = ''`. Verify `auth.uid()` is present, `can_edit_room(target_room_id)` is true, lock the room row, verify `base_version` equals the current maximum, validate the document through the existing JSON shape/size constraints, and insert the next version with `created_by = auth.uid()` and `status = 'draft'`. Raise `prd_version_conflict` for stale versions and `prd_edit_forbidden` for unauthorized callers.

- [ ] **Step 5: Implement `accept_prd_version`** as `security definer`. Load the PRD and room, verify the caller is the room owner or `is_org_admin(room.organization_id)`, return an already-accepted row as a successful idempotent no-op, reject other invalid states with `prd_already_accepted`, update only status and acceptance metadata for a draft, and return the row.

- [ ] **Step 6: Add an immutability trigger** that rejects document, room, version, author, and provenance changes on accepted rows and rejects deletes of accepted rows. Permit only the guarded draft-to-accepted metadata transition.

- [ ] **Step 7: Revoke direct authenticated table writes, grant only the two RPCs, and rerun the pgTAP tests.**

- [ ] **Step 8: Commit the database slice.**

```bash
git add supabase/migrations/202608030001_prd_editable_versions.sql supabase/tests/prds.test.sql
git commit -m "feat(prd): persist editable and accepted versions"
```

### Task 3: Wire real and fake persistence through the Discovery backend

**Files:**
- Modify: `apps/web/src/features/prd/repository.ts`
- Modify: `apps/web/src/features/prd/repository.test.ts`
- Modify: `apps/web/src/features/discovery/backend.ts`
- Modify: `apps/web/src/features/discovery/supabase-backend.ts`
- Modify: `apps/web/src/features/discovery/fake-backend.ts`
- Modify: `apps/web/src/features/discovery/e2e-fake.ts`
- Modify: `apps/web/src/features/discovery/e2e-fake.test.ts` if backend behavior coverage belongs there

**Interfaces:**
- Consumes: the RPCs and domain types from Tasks 1–2.
- Produces: the four persistence methods in the plan’s interface block and fake behavior with the same authorization/error semantics.

- [ ] **Step 1: Extend repository tests** with a history select, a save RPC call, an accept RPC call, row parsing for all metadata, and mapping of `P0001` error messages to typed repository errors.

```ts
it("parses accepted audit metadata from history rows", async () => {
  const history = await createPrdRepository(fakeSupabase([acceptedDbRow])).getRoomPrdHistory(ROOM_ID);
  expect(history[0]).toMatchObject({ status: "accepted", acceptedBy: USER_ID });
});
```

- [ ] **Step 2: Implement one row-to-`RoomPrd` mapper** and use it in current, history, save, and accept paths. Select `created_by, accepted_at, accepted_by` alongside the existing columns.

- [ ] **Step 3: Implement the RPC repository calls** with exact parameters. When `save_prd_version` returns `P0001/prd_version_conflict`, re-read the latest room PRD and expose its version through the repository error so the server action can return `currentVersion`:

```ts
supabase.rpc("save_prd_version", {
  target_room_id: input.roomId,
  base_version: input.baseVersion,
  next_document: input.document,
});
supabase.rpc("accept_prd_version", { target_prd_id: input.prdId });
```

- [ ] **Step 4: Add the new methods to `DiscoveryBackend`** and delegate them from `createSupabaseDiscoveryBackend` through `createPrdRepository`.

- [ ] **Step 5: Convert the fake store to retain every `RoomPrd` row**, make `fakeGetRoomPrd` return the highest version, and make `fakeRoomHasPrd` check any version. Add `fakeListRoomPrdHistory`, `fakeSaveRoomPrdVersion`, and `fakeAcceptRoomPrdVersion` using `requireEditor`, the base-version check, `room.ownerId`, and `context.membership.role`.

- [ ] **Step 6: Update seeded and generated fake PRDs** with `createdBy`, `acceptedAt: null`, and `acceptedBy: null`. Assert that generation still creates version 1 and that a saved version becomes version 2 without replacing version 1.

- [ ] **Step 7: Run repository/backend tests and commit.**

```bash
pnpm --filter web test -- src/features/prd/repository.test.ts src/features/discovery/e2e-fake.test.ts
git add apps/web/src/features/prd/repository.ts apps/web/src/features/prd/repository.test.ts apps/web/src/features/discovery/backend.ts apps/web/src/features/discovery/supabase-backend.ts apps/web/src/features/discovery/fake-backend.ts apps/web/src/features/discovery/e2e-fake.ts apps/web/src/features/discovery/e2e-fake.test.ts
git commit -m "feat(prd): expose version persistence in both backends"
```

### Task 4: Add validated server actions and page data

**Files:**
- Modify: `apps/web/src/features/prd/actions.ts`
- Modify: `apps/web/src/features/prd/actions.test.ts`
- Modify: `apps/web/src/features/prd/queries.ts`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx`

**Interfaces:**
- Consumes: backend persistence methods and typed repository errors from Task 3.
- Produces: `savePrdVersion(input): Promise<SavePrdResult>`, `acceptPrdVersion(input): Promise<AcceptPrdResult>`, and `getRoomPrdHistory({ roomId }): Promise<RoomPrd[]>`.

- [ ] **Step 1: Add failing action tests** for strict input validation, successful save, conflict result, rejected save, successful acceptance, and rejected acceptance. Assert that no invalid document reaches the backend.

```ts
expect(await savePrdVersion({ roomId: "bad", baseVersion: 0, document: {} })).toEqual({
  status: "error",
  message: "Invalid request.",
});
```

- [ ] **Step 2: Add strict Zod input schemas** for UUID room/PRD IDs, positive base/version values, and `PRDDocumentSchema`.

- [ ] **Step 3: Implement action dispatch** through `getDiscoveryBackend()` so fake mode and Supabase mode share the same result mapping. Map repository conflict errors to `{ status: "conflict", currentVersion }`; map authorization and persistence failures to stable user-facing messages.

- [ ] **Step 4: Add `getRoomPrdHistory`** with UUID validation and backend dispatch.

- [ ] **Step 5: Load history and permission context on the PRD page.** Extend the page data contract with `isCurrentUserOrgAdmin` from the authenticated organization membership. Pass `history`, `canEdit` from the current participant’s room access, and `canAccept` when the current user is room owner or `isCurrentUserOrgAdmin` into `PrdDocument`.

- [ ] **Step 6: Update page tests** to mock history and assert the PRD receives the latest version plus permissions.

- [ ] **Step 7: Run focused action/page tests and commit.**

```bash
pnpm --filter web test -- src/features/prd/actions.test.ts 'src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
git add apps/web/src/features/prd/actions.ts apps/web/src/features/prd/actions.test.ts apps/web/src/features/prd/queries.ts 'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx' 'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
git commit -m "feat(prd): add version save and acceptance actions"
```

### Task 5: Build the in-place structured editor

**Files:**
- Create: `apps/web/src/features/prd/components/prd-editor.tsx`
- Create: `apps/web/src/features/prd/components/prd-editor.test.tsx`
- Modify: `apps/web/src/features/prd/components/prd-document.tsx`
- Modify: `apps/web/src/features/prd/components/prd-header.tsx`

**Interfaces:**
- Consumes: `RoomPrd`, `PRDDocument`, `PRD_SECTIONS`, `savePrdVersion`, and `findPrdGaps`.
- Produces: an editor with `initialPrd`, `canEdit`, `onSaved`, and `onCancel` props; it calls `savePrdVersion` with the original `prd.version` and the edited `document`.

- [ ] **Step 1: Add failing component tests** for entering edit mode, changing title/prose, adding/removing list rows, editing risk pairs and MVP scope, canceling, saving, loading state, and preserving local values on a conflict.

```tsx
await user.click(screen.getByRole("button", { name: "Edit" }));
await user.clear(screen.getByRole("textbox", { name: "Executive summary" }));
await user.type(screen.getByRole("textbox", { name: "Executive summary" }), "Updated summary");
await user.click(screen.getByRole("button", { name: "Save changes" }));
expect(savePrdVersionMock).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 1 }));
```

- [ ] **Step 2: Implement local draft state** with a deep clone of `prd.document`, a structural equality dirty check, and a reset on cancel or successful save.

- [ ] **Step 3: Implement editors for every document shape** using Astryx `TextInput`, `TextArea`, `Button`, `HStack`, `VStack`, and `List` primitives. Use stable field labels and row indices in accessible names. Use tokens for sizing and spacing.

- [ ] **Step 4: Implement add/remove/reorder row controls** for all list-like sections. Keep empty rows in local state so the gap review can identify them; do not silently drop user-entered blank rows.

- [ ] **Step 5: Add save/cancel controls** to the editor header/footer. Disable save when clean, show `isLoading` while saving, and return the saved PRD to the parent on success.

- [ ] **Step 6: Add conflict handling** that leaves the local document intact, displays the server’s current version, and offers a `Review latest` callback rather than replacing text.

- [ ] **Step 7: Integrate edit mode into `PrdDocument`** without changing the existing read-only section renderer and add the header’s Edit action/dirty state.

- [ ] **Step 8: Run the editor tests and the Astryx convention check.**

```bash
pnpm --filter web test -- src/features/prd/components/prd-editor.test.tsx
pnpm check:astryx
```

- [ ] **Step 9: Commit the editor slice.**

```bash
git add apps/web/src/features/prd/components/prd-editor.tsx apps/web/src/features/prd/components/prd-editor.test.tsx apps/web/src/features/prd/components/prd-document.tsx apps/web/src/features/prd/components/prd-header.tsx
git commit -m "feat(prd): add in-place structured editing"
```

### Task 6: Add gap review, history/diffs, and acceptance confirmation

**Files:**
- Create: `apps/web/src/features/prd/components/prd-gap-review.tsx`
- Create: `apps/web/src/features/prd/components/prd-gap-review.test.tsx`
- Create: `apps/web/src/features/prd/components/prd-version-history.tsx`
- Create: `apps/web/src/features/prd/components/prd-version-history.test.tsx`
- Modify: `apps/web/src/features/prd/components/prd-document.tsx`
- Modify: `apps/web/src/features/prd/components/prd-header.tsx`

**Interfaces:**
- Consumes: `findPrdGaps`, `diffPrdDocuments`, `RoomPrd[]`, `acceptPrdVersion`, and the stable section IDs.
- Produces: review, history, and acceptance actions that update the current document only after successful server results.

- [ ] **Step 1: Add failing gap-review tests** for grouped warnings, warning count, links to `#section-id`, empty state, and the acceptance warning summary.

- [ ] **Step 2: Implement the review surface** using Astryx `Dialog` or a layout-backed panel, `Banner` for warning status, and `Button` links/actions. Clicking a warning closes the surface and scrolls the one document pane to the matching section.

- [ ] **Step 3: Add failing history tests** for descending version metadata, accepted badge, current/last-accepted labels, changed-section summaries, list row additions/removals, and unchanged comparisons.

- [ ] **Step 4: Implement version history** with a version list and two-version comparison using `diffPrdDocuments`. Keep dense version rows edge-to-edge; use a Card only for the comparison summary if needed.

- [ ] **Step 5: Add failing acceptance tests** for unavailable action, confirmation copy, warnings acknowledgment, loading state, successful status update, and failed acceptance.

- [ ] **Step 6: Implement acceptance confirmation** with Astryx `Dialog` using `purpose="required"` for the irreversible acknowledgement. On success, update the current/history state and show the accepted status; on error, keep the dialog open.

- [ ] **Step 7: Wire Review gaps, History, and Accept into the PRD header** with explicit labels, correct role visibility, and the current draft/last accepted status treatment.

- [ ] **Step 8: Run focused component tests and commit.**

```bash
pnpm --filter web test -- src/features/prd/components/prd-gap-review.test.tsx src/features/prd/components/prd-version-history.test.tsx
git add apps/web/src/features/prd/components/prd-gap-review.tsx apps/web/src/features/prd/components/prd-gap-review.test.tsx apps/web/src/features/prd/components/prd-version-history.tsx apps/web/src/features/prd/components/prd-version-history.test.tsx apps/web/src/features/prd/components/prd-document.tsx apps/web/src/features/prd/components/prd-header.tsx
git commit -m "feat(prd): add review history and acceptance UI"
```

### Task 7: Cover the complete browser workflow and regression behavior

**Files:**
- Create: `e2e/prd-edit-acceptance.spec.ts`
- Modify: `e2e/prd-view.spec.ts` only if shared selectors or setup need a stable assertion
- Modify: `apps/web/src/features/prd/components/prd-document.tsx` or fake setup only for failures found by the E2E test
- Modify: `apps/web/src/features/discovery/e2e-fake.ts` and `fake-backend.ts` only for missing fake parity found by the test

**Interfaces:**
- Consumes: the complete real/fake workflow from Tasks 1–6.
- Produces: browser evidence for PRD-03, PRD-04, PRD-07, PRD-08, PRD-09, and PRD-10 without relying on direct database writes.

- [ ] **Step 1: Add the E2E setup** using the existing owner cookie fixture and the seeded Discovery Room.

- [ ] **Step 2: Assert edit mode** changes a prose field and a list field, saves, reloads, and sees the new content at version 2.

- [ ] **Step 3: Assert gap review** shows the seeded open-question warning and links to the Open questions section.

- [ ] **Step 4: Assert history/diff** shows versions 1 and 2 and identifies the edited sections.

- [ ] **Step 5: Assert acceptance** shows the warning summary, accepts version 2, and shows `Accepted`.

- [ ] **Step 6: Edit after acceptance** and assert version 3 is `Draft`, version 2 remains `Accepted`, and the version-2 content is unchanged in history.

- [ ] **Step 7: Run the focused browser test.**

Run: `pnpm exec playwright test e2e/prd-edit-acceptance.spec.ts`

Expected: PASS with the fake Discovery backend and no new test-only persistence path.

- [ ] **Step 8: Commit the E2E slice.**

```bash
git add e2e/prd-edit-acceptance.spec.ts e2e/prd-view.spec.ts apps/web/src/features/discovery/e2e-fake.ts apps/web/src/features/discovery/fake-backend.ts
git commit -m "test(prd): cover editing acceptance and immutable history"
```

### Task 8: Update checklist evidence and run the full verification gate

**Files:**
- Modify: `docs/product-feature-checklist.md`

**Interfaces:**
- Consumes: passing tests and committed implementation from Tasks 1–7.
- Produces: checklist evidence for PRD-03, PRD-04, PRD-07, PRD-08, PRD-09, and PRD-10. Leave PRD-05 and PRD-06 unchecked because AI targeted revisions and visible AI proposals are explicitly deferred, and leave PRD-02 unchanged unless the existing generation validation is independently proven by the final test run.

- [ ] **Step 1: Update only the evidence for capabilities proven by tests.** Reference the new unit/component tests, `supabase/tests/prds.test.sql`, and `e2e/prd-edit-acceptance.spec.ts`; do not mark AI revisions or Feature Room conversion complete.

- [ ] **Step 2: Run focused and project checks.**

```bash
pnpm --filter web test -- src/features/prd
pnpm test:sql
pnpm check:astryx
pnpm --filter web typecheck
pnpm --filter web lint
pnpm exec playwright test e2e/prd-view.spec.ts e2e/prd-edit-acceptance.spec.ts
```

- [ ] **Step 3: Review the changed files** for raw layout elements, imported CSS, hardcoded visual values, unhandled mutation states, and any accidental changes outside the PRD workflow.

- [ ] **Step 4: Commit the verification evidence.**

```bash
git add docs/product-feature-checklist.md
git commit -m "docs(prd): record editable acceptance workflow evidence"
```

## Self-review checklist

- Spec coverage: direct editing is covered by Tasks 1, 4, and 5; gap review by Tasks 1 and 6; versioning and diffs by Tasks 2, 3, and 6; acceptance and immutable snapshots by Tasks 2, 3, 4, and 6; post-acceptance drafts by Tasks 5–7; conflict handling by Tasks 2, 4, and 5; fake parity by Task 3; and end-to-end evidence by Tasks 7–8.
- Placeholder scan: no task depends on a future unnamed function, new dependency, TODO, or unspecified error behavior.
- Type consistency: repository methods, server actions, pure modules, and component props use the exact names and return shapes defined above.
- Scope: AI chat/highlight behavior and Feature Room conversion remain outside this plan as agreed.
