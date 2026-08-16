# Room Reply Settlement Parity Design

## Problem

Two Claude `room_reply` tasks created at 2026-08-13 14:21 and 14:22 UTC
finished with complete replies but settled to `needs_review`. Both tasks stored
`malformed_output` with the message that the reply failed validation. Codex
answered the same request successfully.

This was not a Claude availability or structured-output failure. The saved
task results contain valid `room_reply` envelopes. Claude cited the attached
Markdown document in `citedEvidenceIds`. The frozen task manifest contains that
UUID in `attachmentIds`, not `evidenceIds`.

The connector deliberately authorizes a citation when its UUID appears in any
manifest category (`messageIds`, `evidenceIds`, `attachmentIds`, or
`decisionIds`) because the reply contract exposes only `citedMessageIds` and
`citedEvidenceIds`. The database settlement function instead checks each
citation array against only its same-named manifest category. It therefore
rejects an attachment citation that the connector and product prompt accept.
Codex happened not to cite the attachment and did not exercise the mismatch.

The recurring failure pattern comes from duplicated validation across the
model schema, shared Zod contract, connector, and PostgreSQL settlement. Earlier
fixes covered provider output shape and connector behavior but did not replay
the same accepted payload through SQL, allowing the two acceptance sets to
drift.

## Approaches Considered

### 1. Align settlement authorization and test the live payload (selected)

Make SQL authorize both citation arrays against the union of all four frozen
manifest ID categories, matching `citesOnlyAuthorizedIds` in the connector.
Add a pgTAP regression using an attachment UUID in `citedEvidenceIds`, including
the observed `user_flow_generate` proposal shape. Retain rejection of a UUID
absent from the entire manifest.

This preserves useful citations, keeps the frozen manifest as the security
boundary, and makes both acceptance layers agree.

### 2. Strip or remap attachment citations in the connector

The connector could remove attachment UUIDs before settlement. This would make
SQL pass but silently discard valid provenance. Moving the UUID to another
existing citation array would not help because SQL currently validates both
arrays by category. This treats the symptom and leaves the duplicated contract
inconsistent.

### 3. Add a separate attachment-citation field

Adding `citedAttachmentIds` would make category semantics explicit, but it
requires model schema, shared contract, connector, message storage, repository,
and UI changes. The product currently renders supplied files as evidence and
does not need a third user-facing citation type. This is unnecessary scope for
the observed failure.

## Database Design

Add a forward migration that replaces the current `settle_ai_task` definition.
During room-reply validation, construct one UUID array from the manifest's four
ID arrays and require both `reply_cited_message_ids` and
`reply_cited_evidence_ids` to be subsets of that authorized set.

The migration must preserve all existing settlement behavior:

- malformed UUIDs remain invalid;
- IDs outside the frozen manifest remain invalid;
- invalid or partial replies still post no message;
- proposed actions continue to be validated independently;
- idempotent and conflicting settlement behavior is unchanged;
- the stored message retains the citation in the array supplied by the model.

No existing terminal tasks will be mutated or replayed. The two failed Claude
attempts were followed by a successful Codex reply, so automatically posting
their historical results would create duplicate answers.

## User Experience

Keep the internal `needs_review` status for compatibility with task settlement,
but stop presenting it as a human-review workflow for room replies. There is no
accept, discard, or inspect-reply action on this surface.

Use the existing error banner and recovery action with this copy:

- Title: `The Product Agent couldn't reply`
- Description: `The response could not be posted. Ask again to generate a fresh reply.`
- Action: `Ask again`

The existing provider suffix continues to identify whether the attempt ran via
Claude or Codex. PRD-generation copy is out of scope because that surface has a
real generated artifact and separate retry behavior.

## Regression Strategy

1. Extend the connector validation test to state explicitly that an attachment
   UUID in `citedEvidenceIds` is accepted and an out-of-manifest UUID is not.
2. Extend `room_agent_messages.test.sql` with the same attachment citation and
   verify the task completes, one Product Agent message is inserted, and the
   citation is persisted.
3. Keep the existing out-of-manifest SQL test to prove the authorization
   boundary did not widen beyond the frozen context.
4. Update the room-task banner test to assert that no visible `review` wording
   remains and that `Ask again` still invokes the existing recovery callback.
5. Run focused connector, web, SQL structural, and pgTAP suites. Run the
   project SQL parity checks so the latest `settle_ai_task` definition remains
   canonical.

## Scope

This change fixes authorization parity for room-reply citations and corrects
the misleading room-reply error copy. It does not add a review workflow,
change provider selection, alter Claude prompts, replay historical tasks, or
redesign citations.
