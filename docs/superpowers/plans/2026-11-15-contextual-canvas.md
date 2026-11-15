# Contextual Canvas Implementation Plan

> **For agentic workers:** Execute these tasks inline in order, with focused verification after each behavior change.

**Goal:** Keep the matching Star conversation beside its area on the single project Canvas, remove the redundant Canvas row, and slim scrollbars.

**Architecture:** `FrameModel.canvasStarID` records the temporary Canvas focus. `ProjectScreen` chooses the corresponding native conversation and sends a room-scoped focus command to the existing Excalidraw board. The Mac header retains expand and close controls. Native and web scrollbars use their platform's compact rendering.

**Tech Stack:** SwiftUI, AppKit, WebKit, Excalidraw, Astryx tokens.

## Global Constraints

- Keep one board per project room and reuse existing Excalidraw frames and persistence.
- Keep Star replies on the existing `starTaskID` path.
- Preserve the panel resize handle; only scrollbars change thickness.
- Keep the board mounted while switching between project and Star chat contexts.

---

### Task 1: Canvas context state

**Files:** `apps/mac/Sources/Orion/Frame/FrameModel.swift`, `apps/mac/Tests/OrionTests/FrameModelTests.swift`

- [ ] Add temporary `canvasStarID` and `showProjectCanvas()`. Entering Canvas from `.star` copies `openStarID`; entry from project chat leaves it nil.
- [ ] Clear Canvas focus on close, project switch, room switch, and frame sign-out. Keep Star focus while expanding or restoring.
- [ ] Test project entry, Star entry, explicit return, close, and project switch.

### Task 2: Contextual native chat and board focus

**Files:** `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`

- [ ] Replace the left project stream with `starThread` when Canvas has a valid `canvasStarID`; use its existing Star composer.
- [ ] Remove the inline Star Canvas button and the Canvas strip. Add a quiet return action inside the Star chat column.
- [ ] On Canvas context changes, send room-scoped `focusStar` or `focusAll` commands after the board loads. Expose the room ID and a boolean `focusAll` result on `window.__orionBoard`.
- [ ] Verify Star entry, return, and reopening in Orion Preview.

### Task 3: Header and scrollbars

**Files:** `apps/mac/Sources/Orion/Frame/OrionFrameView.swift`, `apps/mac/Sources/Orion/Project/BottomAnchoredScroll.swift`, `apps/web/src/app/global.css`

- [ ] Move Expand/Restore into the native Canvas header beside Close.
- [ ] Use compact AppKit scroller controls for native chat scroll views, keeping scrolling and indicators available.
- [ ] Reduce embedded web scrollbar thickness with existing Astryx spacing tokens.
- [ ] Inspect ordinary and expanded Canvas, including narrow widths.

### Task 4: Final verification and delivery

- [ ] Run focused Mac tests, web test, TypeScript check, Mac build, and `git diff --check`.
- [ ] Capture Orion Preview screenshots in `.context/` and inspect the final state.
- [ ] Commit and push the draft PR branch.
