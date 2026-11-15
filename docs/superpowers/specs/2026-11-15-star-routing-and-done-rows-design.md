# Star routing and Done rows — design

Date: 2026-11-15 · Status: awaiting owner review

## In plain language

Two things, built one after the other:

1. **Done Stars shrink to one line in the main chat.** A finished Star shows as
   *Fintech Profile Screen · Done · 5 replies*. Tap it to open the full thread. Stars still being worked on stay fully
   visible. This removes most of the crowding and needs no AI.
2. **Orion decides "continue an open Star" or "start a new Star".** When you send a
   message from the main chat, a quick check compares it with your recent open Stars
   and picks one of three: continue that Star, start a new one, or (when unsure) ask
   you with a small pill above the composer. Typing inside a Star always means
   "continue this", with no check.

The main chat is the overview, not a log: anything that continues a Star stays in
that Star, and the main chat only shows the reply count going up.

## Decisions already made with the owner

- Done Stars collapse to one row (not "only after a day", not left open).
- When Orion is not sure it **asks**; it never files a message silently in the wrong
  place.
- The check runs **before** the message is sent (a ~1–2 s pause), so a continuation
  never sits in the main chat while Orion thinks.
- If the check is slow (over 3 s) or fails, the message sends as a **new Star**,
  which is today's behaviour. The check can never block sending.
- Messages sent from inside a Star are always continuations (no check).
- The owner can move a message into a Star, or pull it out into its own Star.

## Today (what exists)

- A message sent from the main chat becomes a new Star: its reply task is the Star
  (`room_reply` task → `StreamStar` in `apps/web/src/features/native/stream-snapshot.ts`).
- A message sent from inside a Star carries `starFollowupOfTaskId` through the
  bridge (`native-stream-bridge.tsx` → `postMessage`) and is recorded as a follow-up
  of that Star. The Star's `followupMessageIds` keep it, and Orion's answer to it,
  out of the main chat (`StreamSnapshot.mainChatMessages` in the Mac app).
- A Star has a status: working, needs you, stuck, done (`StreamStar.Status`).
- Nothing reads the meaning of a message; only where it was typed decides.

## Piece 1 — Done Stars as one row

**Behaviour**
- In `StreamSnapshot.mainChatTimeline` a Star whose status is `done` produces a
  single collapsed timeline item instead of its request message and Orion's first
  answer. Working, needs-you and stuck Stars keep today's full display.
- The row shows: Star title, "Done" and the reply count (the same number as the thread). There is no thumbnail: built screens already appear in the chat as their own cards.
- Tapping the row opens the Star panel (the same action as today's "N replies"
  link). Nothing is deleted; the full thread is unchanged.
- A Done Star that is being continued expands again while Orion is working on it. (Its stored status stays `done`; it expands because a running task for a follow-up carries the Star's id, which `activity(forStar:)` matches.)
- The collapse is derived from data already in the snapshot; no web, database or
  connector change.

**Where:** `StreamSnapshot.swift` (timeline item), `ProjectScreen.swift` (row view),
tests in `StreamSnapshotTests.swift`.

**Tests:** done collapses, working/stuck/needs-you do not, request and first answer
are hidden when collapsed and the reply count matches the thread, a new
continuation re-expands it, messages not belonging to any Star are untouched.

## Piece 2 — Routing a main-chat message

**Flow (native composer, main chat only)**
1. The owner sends. The message is held out of the chat (shown as sending above the
   composer).
2. The web bridge asks a quick **route check** with the new message and a short
   summary (title, status, last activity) of up to five recent open Stars.
3. The check answers `continue(starTaskId)`, `new`, or `ask(starTaskId)`.
   - `continue`: send with `starFollowupOfTaskId` set. It lands in that Star; the
     main chat only sees the count increase. No other new code path is needed.
   - `new`: send as today.
   - `ask`: show a pill above the composer, "Part of *<Star title>*, or something
     new?" with two buttons. The choice sends the message accordingly. The pill is
     never a chat message.
4. Timeout of 3 s, or any failure: send as `new`.
5. Messages sent from inside a Star skip this entirely.

**The route check**
- A new, small AI task kind (e.g. `star_route`) run on the owner's connected device
  like other tasks, using the cheapest available model. Input: the message text and
  the Star summaries. Output (structured): decision, the chosen Star, and a short
  confidence. Low confidence maps to `ask`.
- Untrusted content rule: message and Star text are quoted as data, never
  instructions (same encoding the Product Agent prompt uses).
- Skipped (send as `new`, no check) when there are no open Stars.

**Moving afterwards:** a "Move to Star…" / "Make its own Star" action on a message,
using the existing follow-up link action (`linkRoomStarFollowup`), plus its inverse.

**What this needs**
- Contracts: new task kind and result schema.
- Database: one additive migration allowing the new task kind (must pass
  `scripts/orion-online/migration-guard.mjs`).
- Connector: a short route prompt and handler; the owner must reinstall the connector
  after release (the deploy does not update it).
- Web bridge: the pre-send step, the held message, the pill state.
- Mac: the pill above the composer.

**Tests:** clear continue, clear new, unclear shows the pill and sends where chosen,
slow check falls back to new, failure falls back to new, no open Stars skips the
check, in-Star sends skip the check, a continuation never appears in the main chat
at any point (including when realtime delivers it early).

## Out of scope (YAGNI)

- Automatically merging or re-grouping existing Stars.
- Routing messages across different projects.
- Learning from the owner's past corrections.
- Changing how Constellations group Stars.

## Build order

1. Piece 1 (Done rows): small, no AI, ships alone.
2. Piece 2 (routing): its own plan; touches contracts, database, connector, web, Mac.

## Open risk

The 1–2 s pause depends on the connected device answering quickly. If the check is
often slower than 3 s in practice, routing will rarely run; the fallback keeps
sending reliable, but the feature would then need a faster path (for example a
rules-first shortcut for obvious cases). We learn this from real use after Piece 2
ships.
