# Discovery Room Header and Participants Design

## Goal

Simplify the Discovery Room into a focused conversation surface with a compact
room header, lightweight participant access, and clear visual separation from
the dashboard navigation.

## Current Problems

The permanent right inspector consumes a large portion of the room and presents
Participants, Attachments, Evidence, and Decisions as dense forms. This
competes with the conversation even when those tools are not being used.

The current room header repeats privacy information in a tall, two-line block.
It does not expose the participant identity treatment shown in the approved
reference.

The main conversation and dashboard navigation also use similar surfaces, so
the primary workspace does not read as a distinct area.

## Design

### Layout

The permanent right inspector will be removed from the Discovery Room page.
The conversation becomes the full remaining width beside the dashboard
navigation.

The dashboard navigation retains
`var(--color-background-surface)`. The room header and conversation use
`var(--color-background-body)`, with the existing semantic divider between
navigation and content. No raw color values or new global theme overrides are
introduced.

### Compact room header

The room header becomes one horizontal row:

- Start: a Boxicons lock icon followed by the room name.
- End: a compact participant trigger containing no more than three overlapping
  avatars followed by a downward chevron.
- The current privacy subtitle is removed because privacy is communicated by
  the lock and the participant roster.
- The header remains fixed above the scrolling conversation.

The participant trigger has an accessible label that includes the total roster
count and exposes expanded state to assistive technology.

### Visible avatar ordering

The compact trigger contains at most three avatars, in this order:

1. Current signed-in user.
2. Product Agent.
3. Research Agent.

If a listed item is unavailable or duplicated, the next human participant
fills the open position. All remaining participants are available in the
popover. The trigger always includes a chevron; no fourth avatar or separate
overflow bubble is shown.

Human participants use the Astryx `Avatar` initials fallback because the
current room data does not contain profile-photo URLs.

### Participant popover

Clicking the avatar trigger opens a compact, light-dismiss participant popover.
The popover shows the complete roster:

- Product Agent, with the Product Agent illustration and an `Agent · UI only`
  description.
- Research Agent, with the Research Agent illustration and an
  `Agent · UI only` description.
- Every human participant, with an initials avatar, email, and access label.

The roster is informational in this pass. Existing participant, attachment,
evidence, and decision actions remain in the codebase, but their permanent
right-sidebar interface is no longer rendered.

### Agent illustrations

Two dedicated square avatar assets will be produced from the approved Meld
mascot family direction:

- Product Agent — The Fold, the rich-blue accordion roadmap character.
- Research Agent — The Lens, the mint magnifying-loop character.

The assets will preserve the approved character silhouettes and colors, use a
clean neutral background suitable for circular avatar cropping, and remain
legible at Astryx `sm` and `md` avatar sizes.

These roster entries are visual previews only. They must not activate agent
tasks, spend provider allowance, post agent messages, or imply connected
provider status.

## Components

A focused client component will own the room-header interaction:

- `DiscoveryRoomHeader` receives the room name, current user ID, and human
  participants.
- It composes Astryx `Avatar`, `AvatarGroup`, `Popover`, `List`, and `ListItem`
  with Boxicons lock and chevron icons.
- It creates the two static UI-only agent roster entries locally.
- The server page continues to load participant data and passes only the fields
  required by the header.

The existing conversation remains unchanged except for its surrounding
semantic background surface.

## Interaction and Accessibility

- The participant trigger is keyboard-focusable and opens with standard button
  activation.
- The popover closes with Escape or light dismiss.
- Agent and human avatars always receive names for fallbacks and accessible
  text.
- The participant list remains usable when the roster contains more than three
  entries.
- Reduced-motion behavior is unchanged; this design adds no custom motion.

## Testing

- Assert the room header renders the lock icon and room name without the old
  privacy subtitle.
- Assert the compact trigger renders no more than three avatars.
- Assert the trigger prioritizes the current user, Product Agent, and Research
  Agent.
- Assert opening the popover reveals all humans and both UI-only agents.
- Assert the Discovery Room page no longer renders the `Room details` panel.
- Assert the main room surface uses the semantic body background and remains
  visually distinct from the surface-colored dashboard navigation.
- Run focused Vitest tests, type checking, linting, Astryx convention checks,
  and a browser smoke check at desktop width.

## Overall Plan Follow-Up

The original personal AI product lifecycle implementation plan will gain an
explicit deferred requirement for both Product Agent and Research Agent:

- Replace the UI-only roster status with real availability state.
- Enable actual agent participation only after provider connection, task
  authorization, allowance, and message-persistence requirements are complete.
- Give each agent its own role-specific prompt and approved illustration.
- Verify that automatic roster presence never triggers automatic model usage;
  both agents remain explicit-invocation only.

## Non-Goals

- Enabling Product Agent or Research Agent responses.
- Changing room-participant database tables or authorization policies.
- Deleting attachment, evidence, decision, or participant actions.
- Adding participant profile-photo storage.
- Redesigning the Discovery Room list page or the dashboard navigation.
