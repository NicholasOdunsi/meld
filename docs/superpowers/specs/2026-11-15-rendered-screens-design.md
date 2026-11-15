# Rendered screens in chat, automatic design, and a visible "working" state

Status: approved in conversation on 2026-11-15; pending written review by the owner

## In plain language

Today, when Orion designs a screen, the Mac app shows nothing: the chat has no picture of it, Orion never starts a design unless you type `@Design Agent` (which the Mac app cannot do), there is no sign that Orion is working, and screens you made earlier cannot be seen. This spec fixes all four.

1. **You say it, Orion designs it.** A message like "design a mobile screen for me" is understood. Orion asks one short question, then builds. Typing `@Design Agent` still skips the question.
2. **The screen appears in the chat** as a phone-shaped card with the real design. While it is being built, the card shows a "Designing…" placeholder. Clicking the card opens that screen on the Canvas.
3. **You can see Orion working.** A line above the composer says what is happening: reading, replying, designing, offline, or failed.
4. **Old screens come back** on the Canvas and in the chat history.

User flows rendering is **not** in this spec. It gets its own spec after this ships.

## Decisions made

- Rendered card in chat is a live-looking, non-interactive thumbnail (not a static export, not fully interactive).
- Design intent is detected automatically, by the Product Agent, not by a separate classifier or a manual toggle.
- A vague design request gets exactly one short question before building.
- The "working" line is shown in the main chat and inside Stars (a Star shows only its own task).

## Part 1: Automatic design routing

**Where the decision lives.** The Product Agent already reads every native message and already answers with a structured result that can carry a `proposedAction` (today: `prd_generate`, `prd_revise`, `user_flow_generate`, `decision_capture`).

**Change.** Add a new action `design_screen` with fields `instruction` (the brief), optional `name`, and optional `screenId` (set when the request changes an existing screen):

- `packages/contracts/src/rooms.ts`: add `design_screen` to `RoomProposedActionSchema`.
- `apps/connector/src/tasks/product-agent-prompt.ts`: teach the agent when to use it. Rule: if the person wants a screen designed or an existing screen changed and the request is too thin to build from (no purpose, audience, or content), ask one short question and send `proposedAction: null`; once it has enough, answer in one line and set `design_screen`. Update the JSON output schema in the same file.
- `apps/web/src/features/native/native-stream-bridge.tsx`: when a Product Agent reply carries `design_screen`, call `generateDesignScreen({ roomId, name, instruction, screenId })` (existing function) for a participant who can edit, exactly once per message id. The bridge keeps a set of handled message ids so reconnects and reloads do not rebuild.
- `@Design Agent` (existing web path) is unchanged. The native composer also recognises a leading `@Design Agent` and skips the question by calling `generateDesignScreen` directly with the rest of the text.

**Follow-ups (v1).** Each design request builds a **new** screen. The action keeps an optional `screenId` field so changing an existing screen can be added later, but in v1 the Product Agent is not told which screens exist, so it always sends `screenId: null`.

**Database.** Stored proposals are checked by `public.room_proposed_action_shape_ok` and settlement silently drops any proposal that fails it, so a small **additive migration** teaches it the `design_screen` shape (a strict superset of today's rule). The native app answers the proposal right after it starts the build (existing `dismissMessageProposal`) so it does not show up as an open question in the Overview.

**Fallback.** If the agent never emits the action, nothing breaks: the user still has `@Design Agent`.

## Part 2: The screen card in the chat

**Data (web to Mac).** The stream snapshot (`apps/web/src/features/native/stream-snapshot.ts`, wire type in `bridge.ts`) gains `screens`: for each design screen of the room, `{ id, name, state (building | built | failed), versionId, formFactor, createdAt, updating }`. `listRoomDesignScreens` (`design-screen-generation.ts`) is not used; a new server action reads `design_screens` including `form_factor` and `created_at`. `state` is `built` when the screen is built; otherwise `failed` if the room's latest design task failed or was cancelled, else `building`.

The page document itself is **not** in the snapshot (it is large and the snapshot is re-sent often). For each built `(screenId, versionId)` the web page builds the sandboxed document once with the Canvas's existing `buildFramePreviewDoc` (client side, using the page's theme) and sends it as its own bridge message `{ type: "screen", screenId, versionId, formFactor, html }`.

**Rendering (Mac).** A `ScreenCard` view in `apps/mac/Sources/Orion/Project/`:
- On receiving that `screen` message, loads the HTML once in a hidden, script-disabled web view sized to the form factor (phone 390x844, desktop wider), takes a snapshot image, and caches it on disk keyed by `(screenId, versionId)`. The card shows the cached image, so long chats scroll smoothly.
- A new `versionId` re-renders it; otherwise it never reloads.
- `building` shows a placeholder labelled "Designing…"; `failed` shows "Couldn't build this screen" (to try again, send the request again; a Retry button is a later step).
- Click opens the Canvas panel and focuses that screen (a `focusScreen` command next to the existing `focusStar` / `focusAll`).

**Placement.** In v1 cards appear in the main chat only, in time order with the messages (at the screen's `createdAt`). Star threads do not show cards yet, because a screen is not linked to a Star.

## Part 3: The "working" line

`StreamSnapshot` already has `orionBusy` and the web side has per-task statuses (`queued`, `waiting_for_device`, `ready_to_run`, `running`, `needs_reauthentication`, `usage_limit_reached`, `failed`, plus terminal ones). Add `activity` to the snapshot: `{ taskId, starId?, kind, phase, screenName? }` where `phase` is one of `reading` (queued / ready), `replying` (running a room reply), `designing` (running design), `offline` (waiting_for_device), `needs_signin`, `limit_reached`, `failed`.

The Mac chat shows one text line above the composer with the hat mascot swaying while active (v1 is text only: no buttons on the line). `offline` says "Your Mac is offline. Orion will answer when it's back." `needs_signin`, `limit_reached` and `failed` say what is wrong in a short sentence. In a Star thread only that Star's task is shown. The line disappears when the task completes.

## Part 4: Old screens come back

Production has 3 built screens (with saved versions) in one room and a board holding one item, so existing screens were never placed on the new Excalidraw board.

- **Canvas.** The Canvas preview page for a frame reads its HTML from the board document, not from the design tables. So when a room's Canvas first loads, for every built, non-deleted design screen that has no frame on the board, add one: the board screen id is `ds-<design screen id>` (it must match the board's id rule), the document is the same sandboxed page used for the chat card, and the frame goes in a row after the existing items (`nextFramePosition`). Check-then-add makes it idempotent; it only adds. `focusScreen(designScreenId)` does the same add for one screen and then zooms to it, so a screen built a minute ago also works.
- **Chat.** Existing built screens appear as cards in the stream at their creation time (Part 2 data), so history is complete.
- **Artifacts.** A screen row opens that screen on the Canvas (the old `?tab=prototype&screen=` web page is no longer the target).
- Nothing in the database is changed, moved, or deleted.

## Error handling

- Build fails: the card shows "Couldn't build this screen"; send the request again to retry.
- No editor permission: the Product Agent still answers; the build is refused by the server and no card appears.
- Connector offline: `offline` phase; the task waits and runs when the device returns.
- Picture not ready yet: the card shows "Loading…" until the screen's document arrives.

## Testing

- Web unit: snapshot includes `screens` and `activity`; a `design_screen` action triggers exactly one `generateDesignScreen` per message id; back-fill adds missing frames only once.
- Connector unit: prompt/schema snapshot tests include `design_screen`; the one-question rule is covered by existing prompt-contract style tests.
- Mac unit: card state mapping (building / built / failed), cache key `(screenId, versionId)`, activity phase to line text, Star-scoped activity.
- e2e (existing fake room): a design request shows the card placeholder then the screen; old built screens appear on the Canvas.
- Manual in Orion Preview and after deploy against production's three screens.

## Rollout and risk

- **Order.** Ship web + Mac together (the app waits for the new feed). The connector change needs the connector bundle rebuilt and reinstalled on the owner's Mac once, then paired to production (never to localhost). Until reinstalled, the Product Agent keeps answering in text and `@Design Agent` still works.
- **Deploy.** Merging to `main` deploys database, gateway and website automatically. One additive migration (the proposal shape above) is included; the deploy's migration guard must pass.
- **Risk.** The Product Agent may sometimes miss design intent; the fallback is `@Design Agent`. Snapshot images are cached per version, so storage stays small.

## Out of scope

User flows rendering, interactive screens inside chat, exporting screens as images or Figma, changing how the Design Agent builds screens.
