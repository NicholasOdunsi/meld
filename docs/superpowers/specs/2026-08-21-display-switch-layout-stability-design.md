# Display Switch Layout Stability

## Problem

Moving the browser between displays can briefly move the viewport through the
mobile breakpoint. `DesktopOnlyGate` currently replaces the complete desktop
application at that breakpoint, unmounting the Room and discarding its
optimistic pane state. Tldraw also positions its toolbar inside its bottom
layout row, so moving only the toolbar child does not produce stable top
placement across its responsive layouts.

## Design

`DesktopOnlyGate` will keep the desktop application mounted at every viewport
width. At mobile widths it will place `MobileUnavailableMessage` above the
application and make the application non-interactive and visually hidden. When
the viewport returns to desktop width, the same mounted Room becomes visible,
preserving its open panes and editor state.

The canvas override will position tldraw's complete bottom layout row at the
top of the editor and center its contents. The toolbar itself will return to
normal flow within that row. This removes dependence on tldraw's responsive
toolbar positioning while leaving its tool overflow behavior intact.

## Boundaries

- Room pane persistence and database behavior do not change.
- The existing mobile-unavailable message remains the only visible mobile UI.
- Tldraw's drawing tools, overflow behavior, and style panel remain unchanged.
- The existing development server remains in use.

## Verification

- Confirm the desktop application remains mounted while the mobile message is
  visible and returns with the same component state.
- Confirm the toolbar row uses the same top-center geometry at wide and narrow
  editor widths.
- Run the focused `DesktopOnlyGate` tests and the Astryx convention check.
