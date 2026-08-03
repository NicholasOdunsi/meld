# Task 4 report — validated PRD actions and page data

## Status

Completed. This task adds validated PRD save and acceptance server actions,
history loading through the shared discovery backend, and PRD page capability
data without changing editor UI behavior.

## Changed files

- `apps/web/src/features/prd/actions.ts`
  - Added strict Zod request schemas for save and acceptance inputs.
  - Added typed `SavePrdResult` and `AcceptPrdResult` unions.
  - Added `savePrdVersion` and `acceptPrdVersion`, both dispatched through
    `getDiscoveryBackend()` so real and fake backends return the same mapped
    results.
  - Returns `{ status: "conflict", currentVersion }` for
    `PrdVersionConflictError`; returns stable user-facing messages for typed
    authorization/document errors and untyped persistence failures.
- `apps/web/src/features/prd/actions.test.ts`
  - Covers strict request validation, no backend dispatch for invalid input,
    successful save/acceptance, stale-version conflicts, authorization denial,
    and non-leaking persistence errors.
- `apps/web/src/features/prd/queries.ts`
  - Added `getRoomPrdHistory({ roomId })`, validating the UUID before calling
    the backend history method.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
  - Loads ordered PRD history for the PRD tab and treats the first entry as the
    current version.
  - Derives `canEdit` only from the current participant's `edit` access.
  - Derives `canAccept` when the current user is the room owner or
    `isCurrentUserOrgAdmin` is true, then forwards history and both
    capabilities to `PrdDocument` for the editor task.
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx`
  - Asserts the document receives descending history and the latest PRD,
    owner edit/accept capabilities, and admin acceptance without edit access.

## Verification

```bash
pnpm --filter web test -- src/features/prd/actions.test.ts 'src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx'
```

```text
Test Files  76 passed (76)
Tests  547 passed (547)
Duration  11.75s
```

The configured Vitest command also ran the wider web suite. It exited `0`.

```bash
pnpm --filter web typecheck
```

```text
> @meld/web@0.1.0 typecheck
> tsc --noEmit
```

The command exited `0` with no TypeScript diagnostics.

```bash
git diff --check
```

The command exited `0` with no output.

## Scope and concerns

- Scope is limited to the five Task 4 source/test files plus this required
  report. No editor or other UI component was changed.
- `PrdDocument` deliberately receives `history`, `canEdit`, and `canAccept`
  from the page but does not consume them yet; the subsequent editor task must
  add those props to its explicit component contract and render the controls.
- Vitest emitted pre-existing JSDOM canvas/CSS and third-party sourcemap
  warnings. They did not affect the passing result.
