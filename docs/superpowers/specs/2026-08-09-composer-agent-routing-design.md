# Composer Agent Routing — Design

**Date:** 2026-08-09
**Status:** Approved for planning
**Author:** brainstorming session (Nicholas Odunsi)

## Problem

The Discovery Room composer decides two things about an agent mention — which AI answers it,
and (for the Research Agent) which sources it may read — and it renders both as full-width
blocks that appear and disappear while you type.

Three conditional blocks currently stack inside the composer's input column:

- the research-sources `SegmentedControl` (`apps/web/src/features/discovery/components/composer.tsx:454-464`),
  shown only when the draft mentions the Research Agent;
- the provider `Selector` (`composer.tsx:465-485`), shown only when the draft mentions an agent
  **and** readiness resolved ready **and** more than one provider is runnable;
- the "Connect your AI to reply" `Banner` with its button (`composer.tsx:486-503`), shown when
  the draft mentions an agent and readiness resolved not-ready.

Finishing a mention can therefore grow the composer by a segmented control, a select, or a
titled banner, shoving the toolbar and send button down under the cursor. The controls also
read as form fields inside a chat surface, which is the wrong register.

Two further problems are about capability, not looks:

1. **The provider select is a dead end.** It offers `Codex | Claude` and nothing else — no
   notion of *your default*, no room for the labelled accounts the multi-account work is
   heading toward (`docs/superpowers/specs/2026-08-05-multi-account-provider-switching-design.md`),
   and no room for a model.
2. **It hides itself in the single-provider case.** `readyProviders.length > 1` (`composer.tsx:467`)
   means most users never see any indication of which AI is about to answer them.

## Goal

Replace the stacking blocks with a **still, chat-native routing row**: quiet chips that live in
the toolbar row that is already on screen, never change the composer's height, always say who
will answer, and have structural room to grow accounts and models.

## Decisions

Each of these was chosen explicitly during the design session.

1. **Routing is a per-user preference, never a room-wide setting.** Two people in one room can
   hold different subscriptions; forcing them onto one shared account would break for whoever
   does not own it.
2. **Any message can be routed elsewhere, and that override sticks to the room** until changed
   back. It never rewrites the user's global preference.
3. **Placement: a chip on the send row**, in the existing toolbar row, next to send.
4. **The chip is always present — dim at rest, lit when an agent is mentioned.** It changes
   weight, never existence, so the layout is completely still while typing. At rest it states a
   fact ("if you call an agent, Claude answers"); a sticky override therefore stays visible even
   on human-only messages.
5. **The model pin stays.** Phase 1 ships provider routing only; the routing value is shaped
   `{ provider, account?, model? }` from day one so phase 2 is an addition, not a rewrite.
6. **Not-connected becomes an amber chip plus one line of plain words.** The `Banner` block
   leaves the composer.
7. **Research sources get their own sibling chip**, present only when the Research Agent is
   addressed. "Web + room" spends real time and reaches outside the company, so it is worth
   seeing before pressing send rather than one click inside a menu.

### Inferred decisions

These were not asked about directly. They follow from the above, and are called out so they can
be flipped cheaply during planning:

- **The sticky override is per room, not per agent.** Provider is a fact about *your account*,
  not about which agent you addressed, so one override covers both Product and Research in a
  given room.
- **Research scope does not stick.** It stays draft-scoped and resets to `room` on mount, as it
  does today. Web search costs time and reaches outside the company; defaulting it back to the
  safe value each session is deliberate.

## What Already Exists

Two findings that materially shrink phase 1:

- **The per-user preference layer is already built.** `ai_user_preferences` (introduced in
  `supabase/migrations/202607290001_provider_setup.sql:91`) holds the default device and default
  provider under RLS, and `resolveAgentReadiness` (`apps/web/src/features/ai/agent-readiness.ts`)
  already resolves `defaultProvider` from it, falling back deterministically to the first ready
  provider when the saved default is not runnable. **No migration is needed for the preference.**
  The composer simply never presents it as a default.
- **The submission contract already carries the override.** `providerOverride` flows from
  `DiscoveryComposerSubmission` through `actions.ts:219,226` into task creation today.

**Phase 1 therefore changes no contract, no RPC, and no connector code.** It is a web-layer
presentation and persistence change.

## Architecture

### Units

Each unit has one job and is testable on its own. `composer.tsx` is already past 500 lines, so
this work extracts rather than accretes.

| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| `resolveEffectiveRouting` | `discovery/components/routing-model.ts` | Pure. Given saved preference, sticky override, and ready providers → the routing that will actually be sent. | contracts only |
| `readRoomRouting` / `writeRoomRouting` | `discovery/components/room-routing-store.ts` | Pure parse/serialize plus `localStorage` access, hardened against junk input. | contracts only |
| `useRoomRouting` | `discovery/components/use-room-routing.ts` | Owns the override state, hydrates from storage, persists on change. | the two above |
| `ComposerChip` | `discovery/components/composer-chip.tsx` | Presentational. Renders one chip in `rest` / `active` / `warning` / `loading` tone with a menu. | design system |
| `AgentRoutingChip` | `discovery/components/agent-routing-chip.tsx` | Maps readiness + routing into a `ComposerChip` and its menu sections. | above |
| `ResearchScopeChip` | `discovery/components/research-scope-chip.tsx` | Maps `ResearchScope` into a `ComposerChip`. | above |

`composer.tsx` keeps only wiring: it renders the two chips in `footerActions` and passes the
resolved provider into `submit`.

### Routing value

```ts
export type AgentRouting = {
  provider: Provider;
  accountId?: string;  // reserved for multi-account; unset in phase 1
  model?: string;      // reserved for phase 2; unset in phase 1
};
```

Persisted and resolved as this shape from day one. Phase 1 only ever populates `provider`.

### Resolution order

`resolveEffectiveRouting` mirrors the invariant `agent-readiness.ts` already enforces — **the
resolved provider is always one `create_room_reply_task` will accept**:

1. the room's sticky override, **if it is still runnable on the default device**;
2. otherwise the saved `defaultProvider` from readiness;
3. otherwise the first ready provider in the device's stable order.

A stale override (provider signed out, uninstalled, or account removed since it was set) is
dropped silently at step 1 and the chip simply shows what will really answer. Routing state is
never trusted from storage without re-checking it against live readiness.

### Persistence

`localStorage`, keyed per room, alongside the existing draft key convention:

```
discovery-routing:<roomId>
```

(matching the existing `discovery-draft:<roomId>` convention, `composer-model.ts:507`)

`localStorage` rather than `sessionStorage` because the override must survive a tab close —
`sessionStorage` (used for drafts, `composer-model.ts:443`) dies with the tab and cannot hold
"sticks until you change it back." `localStorage` rather than a DB row because the value is
personal, per-room, and cheap to re-set; a `room_agent_routing` table is the upgrade path if the
override should later follow a user across devices.

Parsing follows the hardening already established by `parseRoomDraft` (`composer-model.ts:446-505`):
untrusted storage input is validated against the known `Provider` set and anything unrecognized
is discarded rather than propagated.

## Chip States

The routing chip is always rendered. Only its tone, label, and menu change.

| Readiness | Draft mentions an agent | Chip | Menu |
|---|---|---|---|
| loading (`undefined`) | either | dim `AI`, no caret, not interactive | — |
| ready, 2+ providers | no | dim `● Claude` | full menu |
| ready, 2+ providers | yes | lit `● Claude ▾` | full menu |
| ready, 1 provider | either | same tones, still shown | current provider + "Connect another provider…" |
| not ready | no | dim `⚠ Connect AI` | "Connect your AI →" |
| not ready | yes | amber `⚠ Connect AI ▾` **plus one inline line** | "Connect your AI →" |

Notes:

- **The resting chip is interactive**, not merely decorative: the provider can be set before any
  text is typed. Only the loading state is inert. "Dim" is tone, not disablement.
- The single-provider case **no longer hides**. It is informative, and its menu offers a way
  forward instead of being a dead end — this replaces the `readyProviders.length > 1` gate.
- The one inline line replaces the `Banner`: plain words, roughly a quarter of the height, e.g.
  *"No AI connected — connect yours to get a reply."* It is the only element in this design that
  enters and leaves with the mention, and it is one line rather than a titled block with a button.
- The send path when not ready is **unchanged**: pressing send still hands the full draft to
  `onConnectPersonalAI` and routes to setup with the text intact. Nothing is reserved, cleared,
  or sent.

The research-sources chip is rendered only when the draft addresses the Research Agent, and it
reads `● Room only ▾` / `● Web + room ▾`.

### Accessibility

- Each chip is a real button with an accessible name that includes its current value, e.g.
  "Agent provider: Claude. Change." — the dim resting tone must not be the only carrier of state.
- The dim/lit distinction is weight and contrast, never colour alone; the amber not-connected
  state pairs its colour with the ⚠ glyph and the inline sentence.
- Resting contrast still has to clear the text-contrast bar. If it cannot while reading as
  "quiet", the rest state uses a lighter background rather than lighter text.
- Losing the `Banner` loses a status region, so the not-connected sentence is rendered in a
  polite live region — the connect prompt must still reach a screen reader when a mention
  completes.

## Data Flow (phase 1)

```
ai_user_preferences ──┐
                      ├─→ resolveAgentReadiness ──→ AgentReadiness ──┐
device provider rows ─┘                                             ├─→ resolveEffectiveRouting ─→ AgentRouting
localStorage room override ─────────────────────────────────────────┘                                  │
                                                                                                       ├─→ chip label
                                                                                                       └─→ submission.providerOverride
```

Server-side semantics are untouched: `providerOverride` reaches `create_room_reply_task` exactly
as it does today.

## Error Handling

- **Unavailable or throwing `localStorage`** (private mode, quota): reads return no override and
  writes are swallowed. The chip falls back to the saved preference and the composer stays fully
  usable. Persistence is a convenience, never a dependency.
- **Corrupt or unknown stored value:** discarded by the parser; treated as no override.
- **Override no longer runnable:** dropped during resolution (above). The user sees the provider
  that will really answer rather than a stale promise.
- **Readiness still loading:** the chip is inert and claims no provider. It must not display a
  guess before readiness resolves.
- **Readiness resolves not-ready mid-draft:** the chip switches to the amber state and the inline
  line appears; the draft is untouched.

## Testing

**Unit — `routing-model.test.ts`:** resolution precedence; a stale override falling back to the
saved default; the saved default itself unrunnable falling back to first-ready; the resolved
provider always being a member of `readyProviders`.

**Unit — `room-routing-store.test.ts`:** round-trip; unknown provider rejected; malformed JSON
rejected; throwing `localStorage` degrading to no-override.

**Component — `composer.routing.test.tsx`:** each row of the state table renders the expected
chip; **the chip is present both with and without an agent mention** (the testable proxy for "the
layout never reflows"); the single-provider case renders a chip rather than nothing; the
not-connected case renders the inline line and no `Banner`; choosing a provider from the menu
changes what a subsequent submission carries as `providerOverride`; the research chip appears
only for a Research Agent mention.

**Existing tests that must change**, because they encode the behaviour this design deliberately
reverses:

- `composer.submission.test.tsx:122-147` — "hides the provider picker when only one provider is
  ready" inverts: the chip now shows.
- `composer.submission.test.tsx:149-161` — "hides the provider picker when the draft has no
  Product Agent mention" inverts: the chip is always present.
- `e2e/product-agent-room-reply.spec.ts:117-129` — drives the old `Selector` through
  `combobox`/`option` roles; becomes a menu button and `menuitemradio`.

Keeping the `agent-provider-picker` and `agent-not-ready` test ids on their replacements confines
the churn to those three places; `conversation.test.tsx` (lines 790, 875, 1276) needs no change.

**Existing suites that must keep passing unchanged:** `composer.mentions.test.tsx`,
`composer-model.test.ts`, and the rest of `composer.submission.test.tsx`. Phase 1 must not alter
submission semantics — the same `providerOverride` reaches the action as before.

**Browser acceptance:** a Product Agent mention routed to a non-default provider is sent, and the
choice is still shown after a reload of the same room (proving the override is genuinely sticky),
following the pattern of the existing PRD browser acceptance tests.

## Phase 2 — Model Selection (sketch, not yet specced)

Deliberately deferred. Recorded here because phase 1's shapes are chosen to accommodate it.

The pin is an asset: `apps/connector/src/providers/release-manifest.ts` pins exact model names
(`gpt-5.5`, `claude-opus-4-8`) and refuses aliases and floating identifiers outright, so every
user runs the same model and a bad answer is reproducible. Phase 2 must **narrow** that guarantee,
not abandon it: the manifest pins a *set* of exact models per provider, and nothing outside the
set is runnable.

Layers involved:

1. **Manifest** — `model` becomes a list plus a default; existing per-entry refinements apply
   unchanged.
2. **Contracts** — `ProviderStatusSchema` (`packages/contracts/src/ai.ts:52-64`) gains `models`
   next to the `version` it already reports, so the web learns what each device can actually run
   over the reporting path that exists today.
3. **Database** — a models column on the connection row, plus a model argument on task creation
   carried into the dispatch payload.
4. **Connector** — `claude-adapter.ts:70-71` and `codex-adapter.ts:51-52` take the dispatched
   model instead of a constant, **validate it against their own manifest**, and fall back to
   their default when it is unknown, reporting which model actually ran.
5. **Web** — a model section in the chip menu; the chip label may then read the model.

**The skew rule is the real work.** Connectors are version-pinned per machine, so a newer web can
name a model an older connector has never heard of. Validate at the connector, fall back to its
default, and say so in the reply.

## Out of Scope

- Model selection (phase 2 above).
- Room-wide shared routing, and automatic failover between providers or accounts.
- Multi-account UI: this design leaves `accountId` unpopulated and defers to the multi-account
  spec for how accounts are created, labelled, and switched.
- Choosing a device. Routing swaps the provider only, never the device — offering a provider from
  another device would promise a reply the RPC would reject.
- Showing which provider answered in the transcript. A reasonable follow-up, but the chip makes
  the choice visible before sending, which was the actual requirement.
