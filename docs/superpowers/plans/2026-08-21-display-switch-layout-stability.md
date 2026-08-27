# Display Switch Layout Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan inline task-by-task.

**Goal:** Keep Room panes alive while a window crosses the mobile breakpoint and keep the tldraw toolbar at the top center at every canvas width.

**Architecture:** The desktop application remains mounted behind the existing mobile-unavailable message, with interaction disabled while the message is shown. The tldraw layout bottom row is repositioned as a single top-centered overlay, avoiding breakpoint-specific toolbar offsets.

**Tech Stack:** Next.js, React, Astryx components, CSS Modules, Vitest.

## Global Constraints

- Keep the current development server and workspace in use.
- Preserve the existing mobile-unavailable message.
- Do not change room/database pane persistence.
- Run only focused verification and the Astryx convention check.

### Task 1: Preserve the mounted desktop workspace

**Files:**
- Modify: `apps/web/src/ui/desktop-only-gate.tsx`
- Modify: `apps/web/src/ui/desktop-only-gate.test.tsx`

**Interfaces:**
- Consume the existing `useMediaQuery` result and `MobileUnavailableMessage`.
- Produce a gate that keeps `children` mounted while preventing interaction and hiding them at mobile widths.

- [ ] Update the gate to render the desktop children and mobile message together, using the existing Astryx shell/layout primitives and an accessibility-safe inert/hidden state for the desktop layer.
- [ ] Update the focused gate assertion to verify the desktop children remain mounted when the mobile message is rendered.
- [ ] Run the focused gate test only.

### Task 2: Normalize tldraw toolbar placement

**Files:**
- Modify: `apps/web/src/features/canvas/user-flow-generating-glow.module.css`

**Interfaces:**
- Consume the existing `.editorHost` wrapper around `<Tldraw>`.
- Produce a top-centered tldraw bottom-row layout with the toolbar in normal flow.

- [ ] Position `.tlui-layout__bottom` absolutely at the editor top, center its contents, and reset the toolbar child to normal flow with zero responsive bottom padding.
- [ ] Remove the narrower selector that only positioned `.tlui-main-toolbar` so tldraw’s layout breakpoint cannot restore the old gap.

### Task 3: Fast verification

**Files:**
- No additional files.

- [ ] Run `pnpm exec vitest run apps/web/src/ui/desktop-only-gate.test.tsx`.
- [ ] Run `pnpm run check:astryx`.
- [ ] Run `git diff --check` for the two implementation files.
