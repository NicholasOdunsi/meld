# PRD Editing, Gap Review, and Acceptance

## Status

Approved design for the first PRD workflow slice. This document covers direct editing, document-gap review, version history, acceptance, and editing after acceptance.

## Context

The Discovery Room currently displays a generated PRD as a read-only document. The `prds` table stores generated versions, but its status enum only contains `draft`, and the UI has no save, history, review, or acceptance workflow. The product checklist identifies continuous editing, immutable accepted versions, meaningful diffs, and role-restricted acceptance as the next PRD capabilities.

The first slice intentionally focuses on the PRD as a trustworthy working document. AI chat and highlight-to-discuss behavior are deferred, but the component boundaries will preserve section identity and selection context for that follow-up.

## Goals

- Let room editors modify the complete PRD in place and save a coherent new version.
- Let readers review gaps inside the PRD itself.
- Preserve every saved version and make changes understandable.
- Let the room owner or organization admin accept a specific draft version.
- Keep accepted document content immutable while allowing later edits as new drafts.
- Handle concurrent edits and permission failures without silent data loss.

## Non-goals

- Tracking implementation progress against repository features or code.
- AI-generated revisions, chat, or highlight-to-discuss actions.
- Automatically creating a Feature Room when a PRD is accepted.
- Replacing the current PRD room with a separate full-screen editor route.
- Blocking saves or acceptance solely because review warnings exist.

## User experience

### Read mode

The existing PRD header continues to show the title, owner, version, status, and created time. It gains these actions:

- **Edit**: enters in-place edit mode for users with room edit access.
- **Review gaps**: opens a review surface with warnings derived from the current document.
- **History**: opens saved versions and section-level comparisons.
- **Accept**: available to the room owner or organization admin when a draft exists.

The header distinguishes the current draft from the last accepted version when both exist.

### Edit mode

Edit mode keeps the document’s outline and section order, but replaces read-only content with structured fields:

- prose fields use multiline editors;
- list fields support adding, removing, and reordering items;
- MVP scope has separate Included and Excluded lists;
- risks use Risk/Mitigation pairs;
- decision history uses Decision, Rationale, and source-message IDs.

The title is editable as part of the same form. The form is initialized from the version opened by the user and tracks a dirty state. **Save** validates the complete document and creates one new draft version. **Cancel** discards local changes and returns to the saved version. A dirty form warns before navigation or switching room tabs.

The save action may persist review warnings. The title must satisfy the existing document schema; warnings are not hidden validation failures.

### Gap review

Review gaps are computed from the document, not manually maintained. The review surface groups warnings by section and links each warning to that section in the document. It reports:

- blank required prose content;
- blank titles or empty rows in list sections;
- missing risk text or mitigation text;
- empty Included or Excluded scope rows;
- decision entries missing a decision, rationale, or source link;
- one or more open questions present.

Warnings can be fixed from edit mode, but they do not silently block saving or acceptance. The acceptance confirmation displays the warning count and requires explicit confirmation when warnings remain.

### History and diffs

History lists all persisted versions for the room, including version number, status, author, creation time, and acceptance time when present. A comparison between two versions reports changed sections and renders additions, removals, and changed structured rows in a readable form. The diff is section-aware rather than a raw JSON diff.

### Acceptance and post-acceptance editing

Acceptance opens a confirmation surface containing the version being accepted, its author, gap warnings, and the consequence that the snapshot cannot be edited. On confirmation, the selected draft becomes `accepted`.

An accepted version remains readable in history and is the room’s last accepted snapshot. If a user edits it afterward, the editor saves a new `draft` version with the next version number; it never mutates the accepted document.

## Authorization and state handling

- A room participant with edit access can create draft versions.
- Viewers/commenters can read the PRD, review gaps, and inspect history, but cannot save.
- Only the Discovery Room owner or an organization admin can accept a version.
- Server operations re-check room membership, role, and the version state; client controls are not authorization.
- A save includes the version from which the editor started. If the room has advanced since then, the server rejects the save as a conflict rather than overwriting another user’s work. The UI preserves local text and offers to review the latest version.
- Failed saves, conflicts, and failed acceptance keep the current editor open and expose an actionable message.

## Data model and persistence

The existing `prds` table remains the version store, with one row per saved document version. Document content is append-only; the only allowed mutation to an existing row is the guarded draft-to-accepted metadata transition.

- Extend the status enum to `draft | accepted`.
- Add `created_by` to identify the user who created the version.
- Add `accepted_at` and `accepted_by` for accepted-version audit metadata.
- Continue enforcing one `(room_id, version)` pair and the existing document size bound.
- Keep generated-task provenance when a version originated from PRD generation.

Saving inserts `version + 1` as a draft in a transaction serialized per room. It does not update document content in place. The latest-version query returns the newest row; history returns all rows ordered by version descending; a separate lookup identifies the highest accepted version.

Acceptance is a guarded server/database operation. It verifies owner/admin authorization, accepts only a draft version, and changes only status and acceptance metadata. Database protections reject document mutation or deletion for accepted rows and prevent invalid status transitions. The acceptance operation is safe to retry.

The shared web schema expands `RoomPrd` to represent both statuses and the new metadata. The fake backend mirrors append-only versions, conflict checks, role checks, acceptance, and history so browser tests exercise the same behavior as the real workflow.

## Component and service boundaries

- `prd-review`: pure gap detection with deterministic warning IDs and section IDs.
- `prd-diff`: pure section-aware comparison of two `PRDDocument` values.
- `PrdEditor`: client form state, dirty tracking, save/cancel, and conflict presentation.
- Section field editors: small focused renderers for prose, lists, MVP scope, risks, and decisions.
- PRD repository/actions: load current/history data, save a draft version, and accept a version.
- Database migration and SQL tests: status, metadata, authorization, concurrency, and immutability.
- Fake discovery backend: in-memory behavior matching repository actions for E2E.

The existing read-only section renderers remain reusable in view mode. Section IDs remain stable so future text selection can be associated with a PRD section for AI discussion.

## Verification

Unit and component tests cover:

- every gap rule and warning-to-section mapping;
- section editor add/remove/reorder behavior;
- structured document validation;
- save, cancel, dirty navigation, and error states;
- section-aware diffs and version history presentation.

Database tests cover:

- editor versus viewer save authorization;
- owner/admin acceptance authorization;
- valid and invalid status transitions;
- accepted-row immutability and deletion rejection;
- version allocation and stale-base conflict behavior;
- retry-safe acceptance.

The E2E path covers: generated draft → edit multiple section types → review gaps → save → inspect history/diff → accept → edit again → verify a new draft exists and the accepted snapshot is unchanged.

## Future extension seam

AI assistance is intentionally outside this slice. The editor will retain stable section IDs and selection-aware boundaries so a later highlight action can send a focused section or text range to the existing room AI flow and return a visible proposal rather than silently overwriting the document.
