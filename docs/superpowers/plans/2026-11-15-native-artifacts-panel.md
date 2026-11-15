# Native Artifacts Panel Implementation Plan

> **For agentic workers:** Implement these tasks in order, verifying each before moving on.

**Goal:** Replace the Mac Artifacts web tab with a native, filterable inventory of the room's PRDs, built screens, inspiration, and linked files, while retaining the existing rich viewers.

**Architecture:** The room page loads an artifact inventory with its existing authenticated readers and passes it into `NativeStreamBridge`. The stream snapshot posts artifact metadata to SwiftUI. The native panel filters and lists records, and item actions navigate the already mounted web view to rich viewers or open a file URL. Star associations are resolved from source message and task IDs when available.

**Tech Stack:** Next.js, TypeScript, SwiftUI, existing `orion` web bridge.

## Global Constraints

- Keep room access checks in existing authenticated readers and actions.
- Keep PRD and prototype content in their existing web viewers.
- Keep the single panel width and resize behavior shared with To-do and Stars.
- Use the existing design tokens and native Mac components.

---

### Task 1: Inventory contract and room data

**Files:** `apps/web/src/features/native/bridge.ts`, `apps/web/src/features/native/artifact-inventory.ts`, `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`, `apps/web/src/features/native/artifact-inventory.test.ts`.

- [ ] Define `StreamArtifact` with stable ID, kind, title, optional URL, optional source message ID, created date, and optional Star ID.
- [ ] Build a pure inventory mapper that combines PRD, built design screens, linked inspiration, and message attachments; use the room page's existing authenticated readers for the input.
- [ ] Resolve Star IDs from source messages and task metadata; leave unknown associations unset.
- [ ] Test empty data, each kind, duplicates, and Star association.
- [ ] Run the focused Vitest file and TypeScript check.

### Task 2: Bridge and native model

**Files:** `apps/web/src/features/native/native-stream-bridge.tsx`, `apps/web/src/features/native/stream-snapshot.ts`, `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift`, relevant stream snapshot tests.

- [ ] Add artifacts to the posted stream snapshot and decode them into a typed Swift model.
- [ ] Keep malformed individual artifact rows from hiding the chat or other artifacts.
- [ ] Cover bridge shape and Swift decoding in focused tests.

### Task 3: Native inventory panel

**Files:** `apps/mac/Sources/Orion/Project/ArtifactsPanel.swift`, `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `apps/mac/Sources/Orion/Frame/FrameModel.swift`.

- [ ] Host Artifacts beside the chat in the same panel slot and resize handle as Stars.
- [ ] Render kind filters, compact rows, title, kind, and related Star where known; show a clear empty state.
- [ ] Open PRD and prototype in the mounted web viewer; open images and files through an authenticated URL or existing native preview flow.
- [ ] Keep Canvas navigation and panel toggling intact.

### Task 4: Verification

- [ ] Run focused web and Mac tests, web TypeScript, and `swift build --product Orion`.
- [ ] Rebuild Orion Preview in local mode and visually check empty and populated Artifacts, filters, opening a viewer, and panel resize.
- [ ] Commit the feature after verification.
