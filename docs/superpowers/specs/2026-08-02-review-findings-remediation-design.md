# Review Findings Remediation Design

**Date:** 2026-08-02
**Status:** Approved in conversation

## Goal

Resolve the six confirmed review findings without broadening the managed-provider or discovery-room feature set. The finished change must preserve durable server-owned state, prevent attachment-only data loss, make first-pair recovery reliable, and restore every required CI gate.

## Scope

This remediation covers:

- atomic persistence of a discovery message and its staged attachments;
- database and Storage MIME parity with the application allowlist;
- first-pair provider setup discovery and retry behavior;
- hydration-safe restoration of a room draft from session storage;
- regression coverage for each failure mode; and
- the existing web lint failure.

It does not redesign the discovery composer, provider installation protocol, device pairing protocol, or room Realtime transport beyond the changes needed for these findings.

## Attachment Persistence

Message insertion and staged-attachment linking will move behind one authenticated PostgreSQL function. The function will validate the caller, room participation, message input, attachment ownership, attachment state, and requested attachment count inside one transaction. It will insert the message, link every requested attachment, and fail the transaction if any requested attachment cannot be linked.

The application repository will expose a focused method for this atomic operation. The server action will use it instead of inserting the message and then swallowing a separate link failure. Agent task creation remains best-effort and occurs only after the atomic human-message transaction returns, so the existing task semantics are preserved.

Because PostgreSQL Realtime observes the message INSERT only after the transaction commits, every attachment is linked before teammates receive the message event. The browser may continue to resolve signed attachment URLs after the event. A bounded retry remains appropriate for replication or signing latency, but it must stop after success, unmount, or a small retry limit.

## MIME Parity

A forward-only migration will replace both the `discovery-attachments` Storage bucket allowlist and `public.attachments` MIME constraint with the complete application set:

- `text/plain`
- `text/markdown`
- `text/html`
- `text/csv`
- `text/tab-separated-values`
- `text/yaml`
- `application/yaml`
- `application/json`
- `application/xml`
- `text/xml`
- `application/pdf`
- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`
- `image/svg+xml`

Database tests will prove the newly supported structured-text types can be stored. Application tests will continue to pin extension-to-MIME resolution and extraction behavior.

## First-Pair Provider Setup

Retry will use `setup.deviceId`, the durable device identifier returned with the setup row, rather than the device list captured when the page first rendered.

First-pair discovery must observe the setup created by the current pairing attempt even if it reaches `completed`, `failed`, or `cancelled` before the browser's first two-second poll. The pairing-code response will carry a server-issued creation timestamp. The discovery request will supply the selected provider and that timestamp, and the server will return the newest matching setup created at or after that boundary regardless of status. This correlation prevents an older terminal setup from being mistaken for the current attempt.

Once a setup row is discovered, the existing per-request poll remains authoritative and stops on terminal status.

## Draft Restoration

Room draft restoration will remain hydration-safe: server HTML and the first client render will both use an empty composer. After mount, the room-scoped draft will be read once, captured as one coherent value, applied to body/provider/attachment-id state, and removed from session storage.

The state update will occur from an asynchronous effect callback with an unmount guard, rather than synchronously in the effect body. This preserves the one-shot handoff, avoids hydration mismatch, and satisfies `react-hooks/set-state-in-effect` without disabling the rule.

## Error Handling

- Atomic message persistence returns an error and creates no message when any staged attachment cannot be linked.
- Ordinary text-only messages remain valid and require no attachment work.
- Attachment-only messages are never acknowledged unless their attachments are durably linked.
- A failed attachment URL lookup is retried only within the bounded Realtime resolution window; a later full room read remains the fallback.
- Provider setup discovery ignores malformed rows and transient fetch failures, then retries on the next interval.
- Draft restoration does nothing when no valid room-scoped draft exists.

## Testing

Regression coverage will include:

1. the atomic message function rolls back the message when attachment linking fails;
2. attachment-only messages return only after attachments are linked;
3. all accepted structured-text MIME types pass the database constraint;
4. a teammate's Realtime attachment lookup retries when the first read is empty;
5. first-pair retry posts with `setup.deviceId` when the initial device list is empty;
6. first-pair discovery adopts a terminal setup created after the pairing-code timestamp and ignores older rows;
7. draft body, provider override, and attachment IDs restore once without a synchronous effect update; and
8. web lint, typecheck, focused tests, SQL tests, database tests, and Astryx checks pass.

## Success Criteria

- No attachment-only send can persist a blank message after a link failure.
- Teammates receive linked attachments without reloading the room.
- Every MIME type accepted by the application is accepted by Storage and the attachments table.
- First-pair terminal progress is discoverable and its retry button always starts a new request.
- Draft restoration preserves its existing user-visible behavior and passes lint.
- No unrelated behavior or public API is changed.
