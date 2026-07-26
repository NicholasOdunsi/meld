# Discovery Room Composer Design

## Goal

Turn the Discovery Room composer into a compact team-messaging composer
that supports queued attachments, Markdown formatting, and mentions while
remaining consistent with the Astryx design system.

## Approved interaction

The default composer remains compact. Its footer contains:

- an add button for files and images;
- an `Aa` formatting toggle;
- an `@` mention button;
- the Astryx circular send button with its default upward-arrow icon.

Emoji is out of scope.

### Attachments

Selecting files queues them locally rather than uploading immediately.
The composer drawer shows image files as removable Astryx `Thumbnail`
previews and other files as removable `Token` items. Paste and drag/drop
use the same queue. Files retain the existing MIME-type, count, and
10 MB size validation, with a maximum of 10 queued files.

Sending first persists the message, then uploads every queued attachment
with the resulting message ID. The message body is used as image caption
context. The composer reports partial upload failures without duplicating
the successfully posted message. Attachments can be removed before send.
A non-empty message remains required in this pass because it provides
accessible caption and discussion context for image attachments.

### Formatting

Pressing `Aa` expands the composer and reveals a compact formatting
toolbar above the input. Pressing it again returns to the compact state
without losing the draft.

The initial toolbar supports bold, italic, strikethrough, link, bulleted
list, numbered list, quote, inline code, and code block. Actions insert
Markdown around the active selection or add a useful placeholder at the
caret. Sent message bodies render through Astryx `Markdown` at compact
density so formatting reads consistently in the conversation.

### Mentions

Typing `@` or pressing the footer mention button opens the same Astryx
trigger menu. The button inserts `@` at the caret and focuses the input.

The picker contains room teammates and the Product and Research agents.
Rows use `TypeaheadItem`: people use their room avatar and email, while
agents use the existing solid-color circular agent markers. Search
matches display names and handles.

After selection, the input displays an Astryx inline token:

- teammate mentions use the blue category variant;
- Product Agent uses purple;
- Research Agent uses teal.

Serialized teammate tokens populate `mentionedUserIds` when sending.
Agent tokens remain selectable and visible in the message, but this work
does not claim or simulate an automated agent response. Product-agent
execution remains governed by the separate personal-AI connection flow.

## Component structure

- `DiscoveryComposer` owns the expanded state, attachment queue,
  formatting actions, mention trigger, and attachment validation.
- `Conversation` owns message persistence and coordinates attachment
  uploads after a message is persisted.
- Existing `AgentMarker` supplies agent identity in the mention picker.
- Astryx `ChatComposer`, `ChatComposerInput`, `ChatComposerDrawer`,
  `ChatSendButton`, `Thumbnail`, `Token`, `TypeaheadItem`, `IconButton`,
  `Toolbar`, and `Markdown` provide the interface primitives.
- Boxicons provide the formatting and attachment glyphs where Astryx has
  no semantic icon.

## Data and failure behavior

The composer submits a structured payload containing the body, queued
files, mentioned teammate IDs, and selected agent identities. The current
optimistic-message reconciliation remains unchanged.

If message persistence fails, no attachment upload starts and the
composer keeps enough state to retry. If individual uploads fail after
the message persists, the message remains in the room and the composer
shows the failed file names. Successful uploads are not repeated.

Object URLs created for image previews are revoked when files are
removed, sent, or the composer unmounts.

## Accessibility and responsive behavior

Every icon-only action has an accessible label and tooltip. Formatting
controls expose pressed state. Mention results support keyboard
navigation through the Astryx trigger menu. The expanded toolbar may
wrap or overflow safely on narrow screens while the message input keeps
the existing mobile font-size protection.

## Validation

Focused component tests will cover:

- compact-to-expanded composer morphing;
- attachment queuing, previewing, removal, and upload-on-send;
- `@` button and typed-trigger behavior;
- teammate and agent token appearance;
- structured mention submission;
- Markdown formatting insertion and message rendering;
- upward-arrow send control and keyboard submission;
- upload and validation failures.

A browser-level visual check will cover the compact composer, expanded
formatting state, attachment drawer, and mention menu.
