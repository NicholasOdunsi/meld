# Canvas Icon Rail (History + Agents) — Design

Date: 2026-08-16
Status: Approved (brainstorm), pending implementation plan

## Problem

The Canvas surface (`UserFlowTrialCanvas`,
`apps/web/src/features/canvas/user-flow-trial-canvas.tsx`) currently
exposes History and the AI generate/chat composer through two
inconsistent, independently-positioned overlays:

- **History** — a `Button` in a top-right cluster toggles the
  `HistoryDrawer`, which slides in from the right.
- **Agents** (today: `ScreenComposer`, the sketch-aware
  generate/regenerate chat box) — an always-open floating `Card`
  pinned to the bottom-right, permanently occupying canvas space for
  edit-access users.

This is a UI cleanup: consolidate both behind a single, consistent
right-edge icon rail (stacked icon+label buttons with an active
state), styled after a reference rail from another app. No new
functionality — same two capabilities, one consistent entry point.
`Preview prototype` is explicitly out of scope: Prototype is already
reachable as its own room tab (`RoomTabStrip`, `?tab=prototype`) and
does not need a rail entry.

## Chosen approach

A full-height vertical icon rail docked to the canvas's right edge,
built from the DS `SideNav` primitive in its collapsed/icon-only mode
(the same primitive already powering `workspace-navigation.tsx` and
`project-room-navigation.tsx`, rather than a bespoke component). Two
items, top-down: **History**, **Agents**.

- Both start collapsed (no panel open by default) — this also reclaims
  the canvas space `ScreenComposer` currently occupies unconditionally
  for editors.
- Clicking an item slides in a panel from the right edge, anchored
  immediately left of the rail — reusing `HistoryDrawer`'s existing
  slide-in mechanics for both panels.
- Only one panel open at a time: selecting the other item swaps the
  panel; clicking the active item again collapses it (single
  `activeRailItem: "history" | "agents" | null` state replaces today's
  separate `historyOpen` boolean and always-mounted composer).
- Selected item renders with the active/filled treatment (background
  highlight + filled icon variant), matching the reference rail's
  selected "File" state.

### Why this approach

- **Reuse over new components**: `SideNav`'s collapsible mode is
  already the app's established sidebar pattern (two existing call
  sites); a bespoke icon-rail component would duplicate behavior the
  DS already provides.
- **Reuse existing panel mechanics**: `HistoryDrawer`'s slide-in
  positioning/z-index treatment (already tuned against tldraw's own
  floating chrome at z-index 300, see `TLDRAW_CHROME_Z_INDEX` in
  `user-flow-trial-canvas.tsx`) is proven; the Agents panel adopts the
  same anchor/z-index treatment rather than inventing a second scheme.
- **Single-panel-at-a-time**: matches the reference rail's spirit (one
  focused surface) and reclaims screen space `ScreenComposer` currently
  always spends.

## Components

### 1. `PixelHistory` — new glyph in `apps/web/src/ui/pixel-icons.tsx`

The pixel-icon set (hand-inlined from the HackerNoon Pixel Icon
Library) has no clock/history glyph yet. Add one the same way the
file's existing business-substitute glyphs were added: inline the
library's outline + filled paths as a new `pixelIcon(...)` export,
following the file's existing `pack="basic"|"filled"` contract.

### 2. `PixelRobot` — reused for Agents

Already exported (`apps/web/src/ui/pixel-icons.tsx:603`); no change
needed beyond wiring it into the rail with the existing basic/filled
swap-on-select convention `RoomTabStrip` already uses for its
`icon`/`selectedIcon` pair.

### 3. `CanvasRail` — new component in `apps/web/src/features/canvas/`

Wraps a `SideNav` (collapsed/icon-only) with two `SideNavItem`s:

```
<CanvasRail
  active={activeRailItem}           // "history" | "agents" | null
  onSelect={(item) => setActiveRailItem(
    (prev) => (prev === item ? null : item)
  )}
/>
```

- History item: `icon={<PixelHistory pack="basic" />}`,
  `selectedIcon={<PixelHistory pack="filled" />}`.
- Agents item: `icon={<PixelRobot pack="basic" />}`,
  `selectedIcon={<PixelRobot pack="filled" />}`.
- `isSelected` on each item derives from `active`.

### 4. `user-flow-trial-canvas.tsx` changes

- Remove the top-right `Button` cluster's `History` button (Preview
  prototype button stays — it's unrelated to this rail).
- Replace `historyOpen` boolean state with
  `activeRailItem: "history" | "agents" | null`.
- Mount `CanvasRail` at the canvas's right edge (new
  `CANVAS_RAIL_Z_INDEX`, following the existing
  `TLDRAW_CHROME_Z_INDEX`-relative pattern already used for the History
  drawer and control cluster).
- `HistoryDrawer`'s `open` prop becomes
  `activeRailItem === "history"`; its anchor position shifts to sit
  left of the rail instead of flush right.
- `ScreenComposer` (plus its `DesignSystemBanner`) moves from the
  always-mounted bottom-right `Card` into the same right-edge panel
  slot, mounted only when `activeRailItem === "agents"` (and only for
  `effectiveAccess === "edit"`, matching `ScreenComposer`'s existing
  view-access no-op).

## Data flow

No data/generation logic changes. This is purely a chrome
reorganization:

```
rail click → setActiveRailItem(item | toggle-off)
  → activeRailItem === "history"  → mount <HistoryDrawer open />
  → activeRailItem === "agents"   → mount <DesignSystemBanner /> + <ScreenComposer />
  → activeRailItem === null       → neither panel mounted
```

`HistoryDrawer` and `ScreenComposer` keep their existing props/data
fetching untouched; only their mount condition and container
position change.

## Error handling

No new failure modes. Existing guards carry over unchanged:
`ScreenComposer` still no-ops (`return null`) for `access === "view"`,
so the Agents rail item's panel is simply empty/inactive for viewers
(rail item itself stays visible and clickable — clicking it opens an
empty slot rather than being hidden, consistent with the drawer's
existing "controlled by parent, no internal gating" contract).

## Testing

- `CanvasRail` component test: renders both items, `onSelect` toggles
  the clicked item and clears when re-clicked, `isSelected`/icon-swap
  matches `active`.
- `PixelHistory` icon: covered by the pixel-icon file's existing
  snapshot/lint conventions (no new test pattern needed).
- `user-flow-trial-canvas` integration: existing History drawer e2e
  coverage repoints its open/close trigger from the old button to the
  rail item; new coverage confirms selecting Agents swaps out an open
  History panel (and vice versa) rather than stacking both.

## Out of scope

- A Prototype rail item (Prototype stays a room-level tab).
- Any change to `ScreenComposer`'s or `HistoryDrawer`'s internal
  behavior, data fetching, or generation logic.
- Multi-panel-open (e.g. History + Agents simultaneously).
- Persisting the rail's open/closed state across sessions.
