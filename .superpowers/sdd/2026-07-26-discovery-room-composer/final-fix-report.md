# Discovery Room Composer Final Fix Report

## Status

Complete.

## Finding addressed

Queued attachments are now reserved by ID immediately when a submission
starts. They are removed from the available draft queue before
`onSubmit` is awaited, so a newer clean draft can be sent without
reusing the first submission's files.

On success, only that submission's reservation is released and its image
preview URLs are revoked. On a `false` result or rejected submission,
only that reservation is restored alongside attachments queued in the
meantime. Draft restoration continues to use the existing revision guard,
so an older failure cannot overwrite a newer draft.

Reserved previews are also included in unmount cleanup.

## TDD evidence

The two new regression tests initially failed:

- the second deferred submission received `original.pdf` instead of an
  empty attachment list;
- `original.pdf` remained in the available/rendered queue while its first
  submission was pending.

After the fix, the tests prove:

- a deferred first send owns `original.pdf`;
- a newer clean follow-up submits no attachments;
- a rejected first send restores `original.pdf` without replacing the
  newer draft or removing `newer.pdf`.

## Verification

- Focused composer and conversation tests: 28/28 passed.
- Full Discovery suite: 85/85 passed.
- Web typecheck: passed.
- Scoped ESLint for `composer.tsx` and `composer.test.tsx`: passed.
- `git diff --check`: passed.

The first typecheck attempt encountered a malformed generated
`.next/dev/types/validator.ts`; `next typegen` regenerated route types.
A subsequent source-level implicit-any finding in the new test was fixed,
and the final typecheck passed.

## Scope

Tracked implementation changes are limited to:

- `apps/web/src/features/discovery/components/composer.tsx`
- `apps/web/src/features/discovery/composer.test.tsx`
- this report

The ledgered synchronous injectable `uploadFile` throw remains deferred.
Unrelated worktree changes, including
`docs/product-feature-checklist.md`, were not modified or staged.
