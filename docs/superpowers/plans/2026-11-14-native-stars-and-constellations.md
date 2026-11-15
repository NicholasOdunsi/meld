# Native Stars and Constellations Implementation Plan

> **For agentic workers:** Execute the checked steps inline on the current branch. The approved design is `docs/superpowers/specs/2026-11-14-project-stream-and-stars-design.md`.

**Goal:** Show task-backed Stars in the native stream, open their details, and list them in the native Constellations panel with persistent grouping.

**Architecture:** The web room feed already has messages and participant-scoped task status. It projects task-backed requests as Stars, then joins optional title and grouping metadata from RLS-protected room tables. Swift decodes that projection and draws the Star chip, detail, and Constellations list. The web page remains a bridge and does not gain a second chat UI.

**Tech Stack:** Next.js server actions, Supabase Postgres, TypeScript, SwiftUI, Swift Testing.

## Global Constraints

- Keep one native project header and one native chat stream. Canvas remains web.
- Project messages and tasks remain the authority for Star source, reply, and state.
- A failed metadata write must never roll back a posted message or queued task.
- Every new public table has room-scoped RLS and explicit grants.
- The browser room UI remains unchanged.

## Tasks

### Task 1: Live Star projection

**Files:** `apps/web/src/features/native/bridge.ts`, `stream-snapshot.ts`, tests; `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift`, tests.

- [x] Add `StreamStar` to the bridge and `stars` to `StreamSnapshot`.
- [x] Project only `room_reply` tasks with a known source message. Derive Working, Needs you, Done from task status. Use the request text or first filename as fallback title.
- [x] Decode Stars and task IDs in Swift. Keep attachment-only sources.
- [x] Test projection and decoding, then run TypeScript and Swift checks.

### Task 2: Native interaction

**Files:** `apps/mac/Sources/Orion/Project/ProjectScreen.swift`, `apps/mac/Sources/Orion/Frame/FrameModel.swift`, `OrionFrameView.swift`, tests.

- [x] Show a Star control under each matching Orion reply; it opens that Star without leaving chat.
- [x] Replace the Constellations empty panel with rows of Stars and their live states, preserving the line-divided panel style.
- [x] Show a Star detail with request, replies, and state. Back returns to Constellations.
- [x] Verify switching panels, sidebar restoration, and narrow windows in the Mac preview.

### Task 3: Persistent Star metadata and grouping

**Files:** new `supabase/migrations/*_room_stars.sql`, `supabase/tests/room_stars.test.sql`, `apps/web/src/features/rooms/star-actions.ts`, native bridge and panel files.

- [x] Create room-scoped `room_stars` and `room_constellations`, unique by task and room, with RLS and indexes.
- [x] After queuing a reply task, save fallback title without delaying or rolling back the message. List metadata with each stream snapshot.
- [x] Provide authenticated rename, move, ungroup and constellation-rename actions; enforce edit permission and same-room IDs.
- [x] Add native controls for those actions and refresh the feed after each change.
- [x] Run database policy tests and the focused web/Mac suites.

### Task 4: Follow-ups and history

**Files:** message schema/action, Star bridge, native detail view, tests.

- [x] Associate a Star reply with its parent task in a validated room-scoped field, and show follow-ups in its detail.
- [x] Show earlier chats at the bottom of Constellations, opening the selected chat without creating a new one.
- [x] Verify follow-up association with bridge and database tests, and project restoration with FrameModel tests.

## Verification note

The demo preview's connected device reports offline, so it cannot send a live Star request. The native layout was reviewed in the preview; task projection, follow-up linking, state restoration and room access are covered by focused tests.
