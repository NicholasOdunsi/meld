# Native Canvas Panel Implementation Plan

> **For agentic workers:** Execute the tasks in order and verify each result before committing.

**Goal:** Make the existing Excalidraw room board usable as the Mac Canvas panel, with project-wide view, Star sections, focus, and expand.

**Architecture:** The existing `BoardLoader` continues to read and save the room's board. `ExcalidrawBoard` exposes idempotent Star section and focus commands on its existing `window.__orionBoard` handle. The Mac Canvas panel places native Star selection and expand controls above the mounted web view; it sends commands to the board through `WKWebView.callAsyncJavaScript`. Width changes stay in `DetailSplit` and the sidebar remains managed by `FrameModel`.

**Tech Stack:** SwiftUI, WebKit, Next.js, Excalidraw, existing room board persistence.

## Global Constraints

- Use existing authenticated room board read and save operations; no schema change.
- Preserve the project's current chat and composer when Canvas opens.
- Keep one Excalidraw board per room; Star sections live in that board.
- The project-wide view shows the entire board; selecting a Star focuses its named section.

---

### Task 1: Board section commands

**Files:** `apps/web/src/features/canvas-excalidraw/star-section.ts`, `apps/web/src/features/canvas-excalidraw/star-section.test.ts`, `apps/web/src/features/canvas-excalidraw/excalidraw-board.tsx`.

- [x] Define a stable Excalidraw frame ID from a Star task ID and find an existing section by ID.
- [x] Add a named frame only when the selected Star has no section; place it to the right of existing content.
- [x] Expose `focusStar(taskId,title)` and `focusAll()` through `window.__orionBoard`, using `scrollToContent` to move the viewport.
- [x] Cover stable IDs, idempotent section creation, and malformed input in a focused test.

### Task 2: Native controls and width

**Files:** `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `apps/mac/Sources/Orion/Frame/FrameModel.swift`, `apps/mac/Sources/OrionAppCore/Frame/DetailSplit.swift`, relevant Mac tests.

- [x] Add a native Canvas toolbar with All sections, Star selection, and Expand/Restore.
- [x] Pass Star focus commands to the mounted web board and handle a board that is still loading.
- [x] In expanded mode, give Canvas the width available after the chat's minimum; restore the previous width and sidebar when closed.
- [x] Test split widths and panel transitions.

### Task 3: Verification

- [x] Run focused web and Mac tests, web TypeScript, and `swift build --product Orion`.
- [x] Rebuild Orion Preview and inspect ordinary and expanded Canvas; cover narrow split widths in tests.
- [x] Test Star focus, All sections, and persistence after reopening Canvas.
- [x] Commit and open a draft PR stacked on the Artifacts branch.
