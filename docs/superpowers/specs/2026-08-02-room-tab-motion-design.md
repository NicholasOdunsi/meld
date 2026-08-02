# Room Tab Motion Design

## Goal

Make the Conversation/PRD tab switch feel immediate and composed without adding prominent motion to navigation that may be used frequently.

## Current Problem

`RoomTabStrip` renders Astryx tabs with native `href` navigation and an intentional no-op `onChange`. A click therefore does not update the selected tab locally. The browser waits for the discovery-room server component and its data queries, then replaces the selected state when the response arrives. That delayed replacement makes the icon and underline appear to jump.

## Considered Approaches

### 1. Client navigation with optimistic tab feedback — selected

Render each Astryx `Tab` through Next.js `Link`, keep a local visual tab value, and update it from `TabList.onChange` as soon as the user selects a tab. Synchronize the local value whenever the server-owned `activeTab` prop changes so browser history and external URL changes remain authoritative.

This preserves the existing Astryx color and indicator transitions. Once the component remains mounted and its value changes locally, those short transitions can run instead of being skipped by a document navigation.

### 2. Custom sliding underline — rejected

Measure the selected tab and animate one shared underline between positions. This would create more obvious movement but require bespoke measurement, resize handling, reduced-motion behavior, and styling outside the standard Astryx tab behavior. It is excessive for frequent navigation.

### 3. Fully instant selection — rejected

Use client navigation and update selection with no transition. This removes the jump but loses the small continuity cue already supplied by Astryx. The existing short opacity and color transitions are restrained enough to keep.

## Component Design

`RoomTabStrip` remains the only client-side owner of interaction state.

- Initialize `visualTab` from the server-provided `activeTab`.
- Pass `visualTab` to `TabList`.
- Set `visualTab` in `TabList.onChange` for immediate feedback.
- Synchronize `visualTab` from `activeTab` in an effect for browser back/forward navigation and server-side clamping.
- Pass Next.js `Link` through each Tab's supported `as` prop while keeping the existing deep-linkable `href` values.
- Keep the existing icons, status dot, divider, size, and Astryx motion tokens unchanged.

The discovery-room page remains the authority for which content is rendered and whether the PRD tab is available. No data-loading or repository behavior changes.

## Interaction Flow

1. The user selects Conversation or PRD.
2. `TabList.onChange` updates `visualTab` during the click, immediately changing the selected icon, label color, and underline.
3. Next.js performs an in-app URL transition rather than a document reload.
4. The existing content remains stable until the new server-rendered surface is ready.
5. The new `activeTab` prop synchronizes the local state with the URL-backed result.

Rapid repeated selections remain interruptible because the selected value is retargeted rather than played through a keyframe sequence.

## Motion and Accessibility

The interaction adds no positional animation, spring, keyframe, or content entrance. It relies on Astryx's existing tokenized color and opacity transitions, keeping the effect brief and appropriate for navigation used tens of times per day. Reduced-motion users receive no new movement; the retained transitions communicate state without translating or scaling content.

## Error and History Behavior

The URL remains the durable source of truth. Browser back/forward updates `activeTab`, and the synchronization effect updates `visualTab`. Invalid or unavailable PRD URLs continue to be clamped by `parseRoomTab`. Navigation failures continue through Next.js error handling; this change introduces no separate loading or error state.

## Verification

- Component test: clicking PRD changes `aria-current` immediately before any server prop rerender.
- Component test: rerendering with a different `activeTab` synchronizes selection, covering browser-history behavior.
- Existing test: the PRD tab remains hidden until a PRD exists.
- Targeted typecheck and unit tests pass.
- Browser check: switching both directions does not reload the document, the tab chrome responds immediately, and rapid reversals do not leave the wrong tab selected.

## Scope

Only `RoomTabStrip` and its colocated tests change. The PRD document, conversation surface, server queries, Astryx package source, and global theme remain unchanged.
