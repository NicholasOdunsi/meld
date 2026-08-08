# Agent Thinking States Design

## Goal

Replace the app's plain "agent is working" affordances — a pulsing dot beside static text — with a single animated treatment shared by every AI waiting surface: a per-character wave that travels through the status label itself.

Scope is agent thinking only. The room conversation's pending reply and PRD generation are in scope. Ordinary data-fetch spinners (teammate lists, file import, connection setup) are deliberately untouched: a shimmering label on a 200ms fetch over-dramatises it and dilutes the signal that an agent is doing something expensive.

## Current Problem

Three separate surfaces each hand-roll their own waiting state, and all of them bottom out in the same primitive:

- `features/ai/components/agent-task-state.tsx:112-131` — a pulsing `StatusDot` plus a static `Text` label, for the pending room reply.
- `features/prd/components/prd-generating.tsx:52-77` — a pulsing `StatusDot`, then a four-item step list.
- `features/ai/components/provider-setup-progress.tsx:75-78` — a pulsing `StatusDot` per setup step. Out of scope, listed for completeness.

Two further problems sit inside those surfaces:

**PRD generation fabricates progress.** `prd-generating.tsx:63-70` renders its step list with `variant={index < 2 ? "accent" : "neutral"}` and `isPulsing={index === 1}`. The indices are hardcoded, so the view claims "Gathered room context" and "Writing sections" are underway from the first frame to the last, regardless of what the task is doing. If generation stalls, it keeps reporting the same two steps indefinitely.

**There is no reasoning content to show.** `AgentTaskState` accepts a `streamedText` prop, but it is populated only by its own test file — never in production. That is not an oversight: `features/ai/room-task-status.ts:10-14` documents the participant-scoped projection as "the ONLY task-status surface the browser may read", carrying "no instruction, manifest, result, or error detail". The reasoning trace is withheld from the client by design.

What the client genuinely knows is therefore: four statuses (`queued`, `waiting_for_device`, `ready_to_run`, `running`), the provider, and `createdAt`/`updatedAt`. The design commits to showing only that.

## Constraints Discovered

`scripts/check-astryx-conventions.mjs` gates CI over `apps/web/src` and constrains this work more tightly than `AGENTS.md` states. From `checkSource` and `checkTree`:

1. **`/<span(?:\s|>)/` is a hard failure** ("raw `<span>` layout"). A per-character wave is inherently spans, so the source must never contain that literal.
2. **`.css` files are scanned** — `checkTree` accepts `.tsx`, `.ts`, and `.css`. A CSS Module gets the same hardcoded-colour and hardcoded-pixel checks as TSX, so `translateY(-1.5px)` fails.
3. **`stylex.create(` and `xstyle=` are failures**, confirming the StyleX path is closed. This is corroborated by `apps/web/package.json`, which has no `@stylexjs/stylex` and no Tailwind, and `next.config.ts`, which has no StyleX plugin. Astryx ships pre-compiled CSS.

All three are satisfiable without evasion, and the resulting design is better than the workarounds would have been. Astryx's own styling docs sanction CSS Modules as the non-StyleX path, and Next.js supports them natively with no new dependency.

## Considered Approaches

### 1. Shared `WaveText` primitive plus an `AgentActivity` wrapper — selected

One motion primitive that knows nothing about AI, and one AI-aware component that composes it. Both consuming surfaces call `AgentActivity`; neither owns motion logic. The wrapper carries a `children` slot so a future reasoning transcript drops in without a redesign.

### 2. Extend `AgentTaskState` in place — rejected

Keeps the animation inside the component that already renders pending status, avoiding a new file. Rejected because `PrdGenerating` is not a task-state component and would either duplicate the animation or import a component whose name and props do not fit it. The motion also has no AI-specific content, so binding it to a task-status type is the wrong seam.

### 3. Swizzle astryx `StatusDot` or `Spinner` — rejected

`astryx swizzle` ejects component source for deep customisation. Rejected because the ejected source is StyleX, which this repo cannot compile, and because the target treatment animates text rather than a graphic — neither component is the right ancestor.

## Component Design

### `WaveText` — `apps/web/src/ui/wave-text.tsx`

The motion primitive. Knows nothing about tasks, providers, or AI.

```
type WaveTextProps = {
  text: string;
  type?: TextType;   // astryx Text type applied to every character; default "label"
};
```

Renders one astryx `<Text as="span">` per character, each carrying a staggered `animationDelay` and a class from `wave-text.module.css`.

Using astryx `Text` rather than a raw span is not a dodge around the linter. `Text` is the sanctioned element for text, it accepts `className` and `style`, it defaults to rendering a `span`, and it exposes `as?: 'span' | 'p' | ...` (`Text.tsx:160`). The source never contains the `<span` literal, so rule 1 is satisfied by using the component the design system already prescribes.

Character elements are computed with `useMemo` keyed on `text`, so re-renders that do not change the string do not rebuild the character list or reset any delay.

Whitespace is rendered as a non-breaking space character so words do not collapse, and `white-space: nowrap` is not required.

### `AgentActivity` — `apps/web/src/features/ai/components/agent-activity.tsx`

The AI-facing wrapper.

```
type AgentActivityProps = {
  status: AITaskStatus;
  provider: Provider;
  kind?: "room_reply" | "prd_generate";
  startedAt: string;          // task createdAt, ISO
  size?: "inline" | "hero";   // default "inline"
  children?: ReactNode;       // reserved slot, see "The Reserved Slot"
};
```

Responsibilities: resolve the label from `status` × `kind`, render `WaveText` with it, render elapsed time beside it, render the provider attribution line, and render `children` beneath. Returns `null` for any status that is not one of the four active ones, so settled and attention states are unchanged and remain `AgentTaskState`'s concern.

`size` selects the astryx `Text` type used for the wave and nothing else: `"inline"` maps to `type="label"` for the pending bubble in a conversation, `"hero"` maps to `type="large"` for the full-page PRD view. It is not a pixel value, and `WaveText`'s em-based lift means the motion scales with whichever type is chosen without a second knob.

**Ownership boundary.** `AgentActivity` owns the entire pending presentation — wave, elapsed counter, and the `Product Agent · Codex` provider line. `AgentTaskState` keeps only the recovery buttons beneath it and the whole attention-state `Banner` path. That split is what stops both components from rendering provider text.

## States and Labels

Driven strictly by the four real statuses. No status is invented, and no step is claimed that the client cannot observe.

| status | `room_reply` | `prd_generate` |
| --- | --- | --- |
| `queued` | Queued | Queued |
| `waiting_for_device` | Waiting for your device | Waiting for your device |
| `ready_to_run` | Starting | Starting |
| `running` | Responding | Drafting your PRD |

Provider attribution (`Product Agent · Codex`) moves into `AgentActivity` as a separate static `Text`, preserving the wording `agent-task-state.tsx:123-127` renders today. It is not part of the wave.

## The Elapsed Timer

Elapsed time renders **outside** the animated string, as a static secondary `Text`: `Responding · 12s`.

This separation is load-bearing, not cosmetic. If the seconds were inside the wave, the string would change every second, `useMemo` would rebuild the character list, and every `animationDelay` would reset — the wave would visibly stutter once per second. Keeping the wave on the stable status word and the counter beside it removes the problem by construction.

The value is computed from `startedAt` and ticks on a one-second interval only while the status is active; the interval is cleared on unmount and whenever the status settles.

Because elapsed time differs between server and client render, it needs the mount-deferral pattern already established in `apps/web/src/ui/client-timestamp.tsx:20-26` — `useSyncExternalStore` with a server snapshot of `false` — to avoid a hydration mismatch. That hook is extracted and reused rather than reimplemented.

## Motion

The wave animates **`opacity` and `translateY` only, never `color`.**

This is the central decision. A gradient-sweep shimmer has to be redefined per theme, because a white-to-transparent highlight that reads beautifully on dark all but disappears on light, and this app ships `@astryxdesign/theme-neutral` in both modes. Animating opacity instead means the characters keep whatever `--color-*` token they inherit and simply breathe, so **one keyframe block serves dark, light, and any future accent usage** with no theme-conditional CSS.

`wave-text.module.css`:

- **Cycle:** `calc(var(--duration-slow-max) * 2)` ≈ 2.6s. Derived from a token, so no raw millisecond value appears. Astryx's own `StatusDot` uses a 2s ambient pulse (`StatusDot.tsx:47-50`), so this sits inside the established family for continuous idle loops. Astryx's motion docs define the `slow` band as the continuous one.
- **Stagger:** 45ms per character, **capped at 600ms total**, applied as an inline `animationDelay`. The cap matters: without it, "Waiting for your device" would show a visible lag between its first and last letter. The cap is computed in TSX (`Math.min(index * 45, 600)`), not CSS.
- **Lift:** `translateY(-0.08em)`. Em rather than px, which clears the pixel check and scales correctly at both the 16px inline size and the hero size.
- **Opacity range:** 0.3 → 1 → 0.3, `ease-in-out`.

No colour declaration appears in the module at all, which means rule 2's hardcoded-colour check has nothing to flag.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables the animation and pins opacity to a legible constant. This follows `StatusDot`'s precedent (freeze) rather than `Spinner`'s (slow down). A frozen wave is simply legible text, so there is nothing that could be misread as broken; a frozen spinner would be.

**Colour:** neutral, inheriting `--color-text-primary`. Accent was considered and rejected because `StatusDot` already spends `--color-accent` on running tasks, and two elements competing for that signal weakens it.

## Accessibility

Per-character spans break screen-reader output — several engines announce the string letter by letter.

`WaveText` therefore renders the decorative character elements with `aria-hidden`, and exposes the real label once through a `role="status" aria-live="polite"` region carrying the plain string. Assistive technology announces "Responding", never "R-e-s-p-o-n-d-i-n-g".

`aria-live="polite"` rather than `assertive`: a status change is informational and must not interrupt whatever the user is reading.

## The Reserved Slot

`AgentActivity` renders `children` in a region beneath the label. Nothing passes children today.

This is the seam for reasoning content, should a future task plumb it from the connector through a safe projection. Both pieces needed to fill it already ship in astryx 0.1.8 and were confirmed present during discovery: `Collapsible` (with `useCollapsible`) for the expand/collapse behaviour, and the `useStreamingText` hook, which smooths bursty streamed text into a steady reveal on word and syntax boundaries.

The slot is the entire commitment. The transcript itself is explicitly not built here — there is no data to put in it, and building a renderer for content the security model withholds would be speculative work.

## What Gets Deleted

- **`GENERATION_STEPS` and the step list** — `prd-generating.tsx:22-27` and `:63-70`. The fabricated progress goes entirely, replaced by a single `AgentActivity` at hero size.
- **`streamedText` and `StreamedProgress`** — `agent-task-state.tsx:37`, `:74-89`, `:129-131`, plus the prop's assertions in `agent-task-state.test.tsx`. Dead in production and superseded by the general `children` slot; keeping two mechanisms for the same seam is the thing to avoid.
- The three `Skeleton` cards in `PrdGenerating` **stay**. Content genuinely is coming, so they are an honest promise rather than invented progress.

## Consuming Surfaces

**`AgentTaskState`** — the pending branch (`:113-159`) replaces its `StatusDot` + `Text` pair with `AgentActivity`. The recovery buttons (Cancel, Reconnect) and the entire attention-state `Banner` path below it are unchanged; those are settled states with actions, not thinking states.

**`PrdGenerating`** — the header block (`:52-64`) becomes one `AgentActivity` with `kind="prd_generate"`, followed by the surviving skeletons. It needs the task's `createdAt`, which it can read from `useRoomTaskStatus().latestPrdTask`.

No repository, backend, contract, or data-loading behaviour changes. This is presentation only.

## Testing

Colocated beside their subjects, per `pnpm check:test-colocation`.

- **`wave-text.test.tsx`** — one character element per source character including spaces; delays staggered at 45ms and capped at 600ms; decorative characters carry `aria-hidden`; the accessible name equals the plain input string; the character list is not rebuilt when an unrelated prop changes.
- **`agent-activity.test.tsx`** — correct label for each status × kind pair; returns `null` for `completed`, `cancelled`, and every attention status; elapsed time formats and advances; `children` render when provided and the region is absent when not.
- **`agent-task-state.test.tsx`** — updated for the removed `streamedText` branch; existing attention-state and recovery-action assertions unchanged.
- **`prd-generating.test.tsx`** — asserts the fabricated step strings are **absent**, so the hardcoded progress cannot quietly return; asserts the skeletons remain.
- **`pnpm check:astryx`** over the new `.css` and `.tsx`. This is the real gate on the motion work and should be run explicitly, not just as part of `pnpm test`.

Reduced-motion behaviour is asserted at the class level (the module class is applied) rather than by simulating the media query, which jsdom does not evaluate.

## Files

New:

- `apps/web/src/ui/wave-text.tsx`
- `apps/web/src/ui/wave-text.module.css`
- `apps/web/src/ui/wave-text.test.tsx`
- `apps/web/src/features/ai/components/agent-activity.tsx`
- `apps/web/src/features/ai/components/agent-activity.test.tsx`

Modified:

- `apps/web/src/features/ai/components/agent-task-state.tsx`
- `apps/web/src/features/ai/components/agent-task-state.test.tsx`
- `apps/web/src/features/prd/components/prd-generating.tsx`
- `apps/web/src/ui/client-timestamp.tsx` — extract the `useIsMounted` hook for reuse

`wave-text.module.css` is the first CSS Module in the repo. Next.js supports them natively, so no build configuration changes.

## Toolchain Note

The astryx CLI requires Node ≥22.13.0 and the workspace was pinned to 20.19.0, which meant `astryx build` and `astryx component` — the discovery workflow `AGENTS.md` mandates before writing UI — could not run at all. Node is bumped to 22.23.2 across `.nvmrc`, the root `engines` field, and all three CI jobs as a prerequisite for this work.

One follow-up this exposes, deliberately left out of scope: `apps/web/package.json` still pins `@types/node` to `20.19.43`, which now trails the runtime. Worth aligning separately, since it affects every package rather than this feature.
