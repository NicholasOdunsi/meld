# Home Screen Design

Date: 2026-07-25
Status: Approved

## 1. Purpose

Give users a place to land after onboarding that answers three questions:

| Question | Answered by |
|---|---|
| What should I start? | Two starting-point cards |
| What needs me? | Needs attention |
| Where does everything stand? | Your rooms |

Today there is no home screen. `apps/web/src/app/page.tsx:31` redirects to
`/{organizationId}/discovery`, and the sidebar `Home` item points at the same
route, so a new user lands on an empty room list.

The cards justify this screen on day one. They do nothing on day thirty, when
the sidebar already lists every room. Only Needs attention earns the screen for
a returning user, which is why it is a required half of this design rather than
an addition to it.

## 2. Naming

Discovery Rooms keep their name. An earlier proposal to rename them was
rejected. No route, table, RPC, pgTAP suite, or copy changes for naming.

## 3. Route and redirects

`/{organizationId}` currently has a layout and no page. That becomes home. No
new URL segment is introduced, and `/{organizationId}/discovery` remains the
full room list.

Four redirect targets change from `/{organizationId}/discovery` to
`/{organizationId}`:

| Location | Current |
|---|---|
| `apps/web/src/app/page.tsx:31` | `redirect(\`/${membership.organization_id}/discovery\`)` |
| `dashboard-navigation.tsx` | `Home` `SideNavItem` `href` |
| `dashboard-navigation.tsx` | `SideNavHeading` `headingHref` |
| `dashboard-navigation.tsx` | Workspace-rail organization `SideNavItem` `href` |

All four read the local `discoveryPath` constant today. A separate `homePath`
constant is introduced; `discoveryPath` remains for the Discovery Rooms nav
entries.

The `Home` nav item's `isSelected` check changes from `pathname === discoveryPath`
to `pathname === homePath`.

## 4. Rebalancing by tenure

One route renders two weightings, switched on whether the organization has any
Discovery Rooms. No new state, no persisted flag, no feature toggle.

**Fresh (`rooms.length === 0`)**

- `What are you building?` heading at full size
- Connection strip (deferred — see section 5)
- Two cards, carrying the screen
- No Needs attention section
- No Your rooms section

**Established (`rooms.length > 0`)**

- Compact heading
- Connection strip (deferred — see section 5)
- Needs attention, first
- Your rooms
- Cards collapse into a header action pair

Hiding Needs attention in the fresh weighting cannot hide real signal: every
attention kind is anchored to a room, and the fresh weighting means the
organization has no rooms, so no resolver can return an item.

This is what stops home from becoming a speed bump between a returning user and
their work.

## 5. Connection strip

Nothing on this screen functions until the user has a paired Codex or Claude
device (`CON-01`–`CON-16`). All entry points dead-end without one, which makes
connection a precondition rather than a choice, so it is not a card. If it were,
the row would reflow from three items to two once connected.

It sits directly under the heading:

- Unpaired: `Banner`, persistent until resolved, per the component map's
  "Errors and persistent warnings" row.
- Paired: a quiet `StatusDot` with visible text, per the component map's
  "Connector/task state" row.

### Deferred — no data source exists

**The strip is not built in the first implementation.** No device, connector, or
pairing table exists in any migration, and no connector status is readable from
the web application. Every `CON-*` feature is unbuilt (task 7 onward).

Building the strip now would require inventing a status value, which would
either always read "not connected" or be a hardcoded lie. It lands with the
connector work in task 7, which is when a real pairing state first exists.

The layouts in section 4 render without it until then.

## 6. Starting-point cards

Two cards. A third was considered for visual balance and dropped to avoid
overloading the screen.

### Anatomy

Icon on top, single text label beneath, left-aligned, rounded container, no
supporting text.

| Card | Icon | Label | Action |
|---|---|---|---|
| 1 | `LightBulb` | Start a Discovery Room | Creates a room via the existing `createDiscoveryRoom` flow |
| 2 | `FolderOpen` | Upload what you have | Opens the upload dialog, then creates a room with the files attached and their text extracted |

`LightBulb` is already the Discovery Room icon in the sidebar
(`dashboard-navigation.tsx:213`), so card 1 matches the nav. `FolderOpen` is
confirmed present in `@boxicons/react`.

Both cards land in the same place — a Discovery Room. That is what makes two
cards read as a genuine choice rather than a menu.

### Design-system exception

`docs/ui/astryx-component-map.md` sets the container policy as "Cards only for
coherent settings groups" and routes list surfaces to `List`/`Item` as
edge-to-edge dense rows. Two entry cards violate that as written.

The exception is deliberate: home presents a choice between two paths, which is
the one job cards do better than rows. A `Home / starting points → ClickableCard`
row is added to the component map recording this rationale, rather than
silently breaking the convention.

`scripts/check-astryx-conventions.mjs` enforces only colors, raw layout
elements, Tailwind utilities, and hardcoded pixel values. It does not enforce
container policy, so nothing fails mechanically. This is a review-time
convention and the map update is how it stays honest.

Every other surface on this screen obeys the existing policy: Needs attention
and Your rooms are `List`/`Item`, the connection strip is `Banner` or
`StatusDot`.

### Upload scope

Uploads only. No link pasting.

The agent cannot open a URL — `AI-10` specifies a content-only task workspace
with no repository, filesystem, shell, MCP, web, user rules, or local-secret
access. A pasted Bolt, v0, Lovable, or Figma link would be stored and clickable
but permanently invisible to the Product Agent, and every user who pasted one
would assume otherwise.

Upload-only means everything entering through this path goes through
`attachment-extractor.ts` (`DSC-05`), so everything on it is real AI context.

Prototype *links* remain first-class artifacts inside a room (`ART-01`), where
they belong as human reference. The distinction to hold: **a link is a human
reference; an upload is AI context.**

Accepted: documents, notes, and HTML exports, subject to the existing
`upload-config` allowlist and size limits.

### Honest scope for card 2

"Seeds a Discovery Room from your docs" implies the agent reading and
summarizing them. That is task 10 and does not exist.

What ships: create the room, attach the files, run them through
`attachment-extractor.ts` so the text is real context for the first agent run.
The card works end-to-end today; agent-generated summary arrives with task 10.

Because the card carries no supporting text, this clarification lives in the
upload dialog, not on the card.

## 7. Needs attention

A section, not a card. Cards are for choosing a path when you have none. These
are named items with owners and actions ("Ada asked you to approve the Checkout
PRD"); rendering them as cards would make them look optional and would dilute
the two real entry points.

### State, not events

Items are derived from source-of-truth state, never from a notification event
log. If a teammate approves a PRD, the event "Ada requested approval" still
exists but the item no longer needs anyone's attention. An event-backed list
goes stale; a state-backed list cannot.

The in-app notification inbox (`OPS-02`, task 14) remains the event log and
history. Home does not filter it.

### Item contract

```ts
type AttentionKind =
  | "mention"
  | "agent_run_failed"
  | "agent_result_review"
  | "approval_request"
  | "assigned_work"
  | "decision_needed";

type AttentionItem = {
  id: string;
  kind: AttentionKind;
  title: string;
  roomId: string;
  roomName: string;
  actorName?: string;
  occurredAt: string;
  href: string;
};
```

Each kind is an independent resolver, `(userId, organizationId) =>
Promise<AttentionItem[]>`, registered in a registry that home composes. Tasks
9–14 each add one resolver file and touch nothing else on this screen.

Items sort by `occurredAt`, newest first. There is no urgency or priority field
in the MVP; no source can currently produce a meaningful ranking, and an
invented one would be noise.

### Resolver schedule

| Kind | Lands with | Source |
|---|---|---|
| `mention` | **Now** | `public.mentions` |
| `decision_needed` | Task 5 | `public.decisions` |
| `agent_run_failed` | Task 9 | Task status (`AI-13`) |
| `agent_result_review` | Task 11 | Proposed PRD revisions (`PRD-06`) |
| `approval_request` | Task 11 | PRD acceptance (`PRD-08`) |
| `assigned_work` | Task 13 | Feature Room assignments (`FTR-04`) |

### Blockers are excluded

`ART-03` is explicit that missing flows, prototypes, or answers produce
warnings, never blockers, and `FTR-09` confirms warnings never block a
transition. Nothing in the MVP can be in a blocked state, so there is no
`blocker` kind.

### Mentions ship now

`supabase/migrations/202607240004_discovery.sql:46` already defines
`public.mentions` with `mentioned_user_id`, `room_id`, `message_id`,
`created_by`, and `created_at`.

It has no acknowledged state, so nothing can leave the list. One new migration
adds:

```sql
alter table public.mentions
  add column acknowledged_at timestamptz;
```

The `mention` resolver selects rows where `mentioned_user_id = auth.uid()` and
`acknowledged_at is null`, joined to `discovery_rooms` for `roomName`.
Acknowledging sets `acknowledged_at`. RLS must permit a user to update
`acknowledged_at` only on their own mention rows, and pgTAP must prove a user
cannot acknowledge another user's mention.

This is what makes the section real on day one instead of a permanently empty
box on the first screen after onboarding, and it proves the resolver contract
end-to-end before tasks 9–14 plug into it.

### Empty state

When every resolver returns nothing, the section renders an `EmptyState`
reading that the user is caught up. In the fresh weighting the section is not
rendered at all.

## 8. Your rooms

`List`/`Item`, edge-to-edge dense rows, per the component map.

`repository.ts:88` `listRooms` selects only `id, organization_id, name,
owner_id, created_at`. It gains a last-activity value derived from
`max(messages.created_at)` per room, left-joined so a room with no messages
falls back to `created_at`.

Ships as room name plus last activity. PRD status (none / draft / accepted) and
unresolved-question count are added when tasks 11 and 12 make those states
real. This section is distinct from the sidebar because the sidebar shows names
and this shows state.

## 9. Component boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `app/(app)/[organizationId]/page.tsx` | Route; picks weighting from room count | Actions below |
| `features/home/components/starting-points.tsx` | Two cards; header action pair | `createDiscoveryRoom`, upload dialog |
| `features/home/components/needs-attention.tsx` | Renders `AttentionItem[]`; empty state | Contract only |
| `features/home/attention/registry.ts` | Composes resolvers, sorts, dedupes | Resolver contract |
| `features/home/attention/mention-resolver.ts` | `mention` items | `public.mentions` |
| `features/home/components/room-summary-list.tsx` | Rooms with state | `listDiscoveryRooms` |
| `features/home/components/connection-strip.tsx` | Banner or status line | Connector status |

The renderer depends on the `AttentionItem` contract, never on any resolver, so
a resolver can be added or changed without touching the section.

## 10. Error handling

A failing resolver must not take down the section. The registry settles all
resolvers independently; a failure logs redacted (`OPS-04`) and omits that
kind's items rather than throwing. A partial list is more useful than an error
page, and a resolver added in task 13 must not be able to break mentions.

`listDiscoveryRooms` failure surfaces the existing "We could not load rooms."
message in the Your rooms section only; the cards and Needs attention still
render.

## 11. Testing

**Vitest**

- Fresh weighting: heading at full size, two cards, no Needs attention, no Your rooms
- Established weighting: Needs attention first, cards collapsed to header actions
- Registry composes multiple resolvers and sorts by `occurredAt`
- One failing resolver omits its kind and preserves the rest
- Empty state renders when all resolvers return empty

**pgTAP**

- A user reads only their own unacknowledged mentions
- A user cannot acknowledge another user's mention

**Playwright**

- Onboarding lands on `/{organizationId}`
- A mention appears in Needs attention and clears on acknowledge

## 12. Explicitly out of scope

- Renaming Discovery Rooms
- A third starting-point card
- Prototype link pasting on the import path
- A `blocker` attention kind
- Team activity feed — noise dressed as signal; competes with Needs attention
  for the same attention on a five-person team
- Agent-generated summarization of uploaded documents (task 10)
- Pipeline view grouping Feature Rooms by stage (tasks 12–13)
- Urgency or priority ranking of attention items
