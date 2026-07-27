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

## Fix Round 2

### Findings addressed

Attachment validation now receives the complete outstanding attachment
pool: the visible queue plus every reserved in-flight attachment. This
keeps the 10-file maximum effective while sends are pending and rejects a
duplicate of a reserved file. Accepted new files are still appended only
to the visible queue, so a failed send can restore its complete reserved
set without exceeding the cap or losing files.

A successful submission once again clears stale attachment validation
errors after it releases its reservation.

### TDD evidence

Three focused regressions failed before implementation:

- 10 new files were accepted while 10 files were reserved;
- a duplicate of a reserved file was accepted and rendered;
- a duplicate-file error remained after a successful submission.

After the fix, the focused composer suite passes 21/21 tests. The
regressions verify that reserved files count toward the maximum, reserved
files participate in duplicate detection, a rejected reservation restores
exactly the original 10 files, and successful settlement clears stale
validation feedback.

### Verification

- Focused composer tests: 21/21 passed.
- Full Discovery suite: 88/88 passed.
- Web typecheck: passed.
- Scoped ESLint for `composer.tsx` and `composer.test.tsx`: passed.
- `git diff --check`: passed.

The synchronous injectable `uploadFile` throw remains deferred and no
unrelated files were modified or staged.
