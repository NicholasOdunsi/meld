# Discovery Composer Staged Uploads and Polish

## Goal

Make the Discovery Room composer feel like a complete chat input: slightly
taller at rest, able to grow around attachments, reliable when deleting a
mention token, and explicit about attachment readiness before a message can
be sent.

## Composer layout

- Keep the existing compact Astryx composer shell and sidebar-matched surface.
- Increase the empty input's minimum height by one small spacing step, without
  turning it into a large text area.
- Render attachment previews inside the composer body, above the editable
  message field. Adding attachments grows the same rounded composer surface;
  no separate drawer may appear above or behind it.
- Keep formatting and footer actions in their existing locations.
- Override the send control with the Boxicons plain upward-arrow icon. Do not
  use the boxed upload glyph.

## Mention deletion

Astryx mention tokens remain atomic inline tokens. When a collapsed caret is
immediately after a mention token, Backspace removes the complete token and
its trailing spacer in one action. This must work for a single mention in an
otherwise empty composer as well as mentions within a longer draft.

After deletion:

- the editor serializes to an empty string when no other content remains;
- the visual token disappears immediately;
- derived mentioned user and agent identifiers no longer include the removed
  token.

## Staged attachment lifecycle

Selecting, pasting, or dropping files starts the same staged-upload flow:

1. Validate file count, duplicate identity, MIME type, and the existing 10 MB
   per-file limit before starting network work.
2. Add accepted items inside the composer with an `uploading` state and start
   uploading immediately.
3. Store uploaded attachments in the room without a message association.
4. Replace the local uploading state with an `uploaded` record containing the
   server attachment identifier and signed view URL.
5. Keep Send disabled while any attachment is uploading or has failed.
6. On upload failure, retain the item with an error state and a clear error
   message. The user removes and re-adds the file to retry.
7. Removing an uploaded staged attachment deletes its unattached metadata and
   storage object. Removing a local or failed item only clears its local state.

The total of queued, uploading, uploaded, and in-flight attachments remains
bounded by the existing maximum of ten.

## Sending and persistence

The message body remains required. Send becomes available only when the body
is non-empty and every staged attachment has uploaded successfully.

On Send:

1. Reserve the uploaded attachment records for that submission.
2. Persist the message using the existing optimistic/realtime reconciliation
   path.
3. Associate the staged attachment identifiers with the persisted message.
4. For image attachments, update the persisted caption and extracted textual
   context to the final message body.
5. Reconcile the message and its attachments into the conversation.

The file transfer is complete before the user can send; only the lightweight
message association happens after message persistence. A failed association
shows an error without uploading the file a second time. Concurrent clean
follow-up messages must not reuse attachments reserved by an earlier send.

## Attachment rendering in messages

Discovery Room page data includes each attachment's `messageId`, MIME type,
original name, extraction status, and signed view URL.

- Image attachments render inside their associated chat message beneath the
  Markdown body.
- Non-image attachments render as compact downloadable file items inside the
  same message.
- Newly sent attachments appear immediately from the staged upload result.
- Reloaded rooms render the same attachment association from persisted page
  data.
- Unattached staged uploads never render on the conversation canvas.

## Error handling

- Invalid type, oversize, duplicate, and count-limit errors appear immediately
  and do not start an upload.
- Uploading state is visible and announced; Send is disabled.
- Failed upload state identifies the affected file and keeps Send disabled.
- Message persistence failure restores the draft and its successfully staged
  attachments without re-uploading them.
- Association failure keeps the persisted message visible, reports the
  affected attachment names, and does not duplicate file storage.

## Verification

Automated coverage will include:

- the modest composer minimum-height and inside-composer attachment layout;
- a sole mention token being removed by Backspace;
- validation occurring before upload;
- Send disabled during upload and after upload failure;
- Send enabled only after every upload succeeds;
- staged attachment removal and cleanup;
- no duplicate uploads during send, retry, realtime reconciliation, or a
  concurrent follow-up;
- images and files rendered under their associated messages initially and
  after page-data hydration;
- the plain upward-arrow send icon;
- existing formatting, mention-picker, Markdown, and keyboard behavior.

Browser verification will capture the empty, uploading, uploaded, failed, and
sent-image states and confirm the composer grows without separating from its
rounded surface.
