# Done Star Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Orion Mac app's main chat, a finished Star shows as one compact row (*Title · Done · N replies*) instead of its request and Orion's full answer; tapping it opens the Star panel.

**Architecture:** Pure logic first, in `OrionAppCore` (testable with `swift test`): `StreamSnapshot.mainChatTimeline` swaps a finished Star's request message and Orion's first answer for one new timeline item, `.doneStar`. Then a SwiftUI row view renders it in the main chat. No web, database or connector change; everything needed is already in the stream snapshot.

**Tech Stack:** Swift 6 / SwiftUI, Swift Testing (`import Testing`), run from `apps/mac`.

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-15-star-routing-and-done-rows-design.md` (Piece 1):

- A Star whose status is `done` collapses to one row; working, needs-you and stuck Stars keep today's full display.
- The row shows the Star title, "Done", and the reply count (`replyCountLabel`, same number as the Star thread). Tapping it opens the Star panel (same action as today's "N replies" link).
- Nothing is deleted; the full thread is unchanged.
- A Done Star that is being continued (there is running activity for it) is shown expanded again.
- No web, database or connector change.
- Environment: Swift commands run in `apps/mac`. Swift code follows the `swiftui-pro` skill. Node is not needed for this plan.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

**Spec adjustment (decided while planning):** the spec said the row may show a screen thumbnail. Built screens already appear in the main chat as their own cards, and the snapshot has no link between a screen and a Star, so the row has **no thumbnail** in this version. Task 2 updates the spec line.

## File Structure

| File | Responsibility |
|---|---|
| `apps/mac/Sources/OrionAppCore/Stream/StreamScreen.swift` | Add the `.doneStar` case to `StreamTimelineItem` (its `id`, `date`, new `scrollID`) |
| `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift` | `collapsedStars`; `mainChatTimeline` hides collapsed Stars' messages and adds their rows |
| `apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift` (new) | Tests for the collapse rules |
| `apps/mac/Sources/Orion/Project/DoneStarRow.swift` (new) | The one-line row view |
| `apps/mac/Sources/Orion/Project/ProjectScreen.swift` | Render `.doneStar` in the main chat; scroll anchor uses the timeline |
| `docs/superpowers/specs/2026-11-15-star-routing-and-done-rows-design.md` | Remove the thumbnail line |

---

### Task 1: Collapse finished Stars in the timeline (core logic)

**Files:**
- Modify: `apps/mac/Sources/OrionAppCore/Stream/StreamScreen.swift` (the `StreamTimelineItem` enum, currently lines ~56-75)
- Modify: `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift` (`mainChatTimeline`, currently lines ~154-157)
- Test: `apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift` (create)

**Interfaces:**
- Consumes (existing): `StreamSnapshot.stars`, `.messages`, `.mainChatMessages`, `.screens`, `.thread(for:)` returning `StarThread` (with `.request`, `.replies`, `.replyCountLabel`), `.activity(forStar:)`, `StreamStar.status` / `.sourceMessageID` / `.createdAt` / `.id`.
- Produces:
  - `StreamTimelineItem.doneStar(StreamStar, StarThread)` — `id` is `"star:<starID>"`, `date` is the request message's `createdAt` (or the Star's `createdAt` when the request is not loaded).
  - `StreamTimelineItem.scrollID: String` — `message.id` for messages, `"screen:<id>"` for screens, `"star:<id>"` for Star rows (these are the SwiftUI `.id` values the main chat uses).
  - `StreamSnapshot.collapsedStars: [StreamStar]` — Stars with status `.done` and no running activity.

- [ ] **Step 1: Write the failing tests** — create `apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct DoneStarRowTests {
    private func message(_ id: String, orion: Bool = false, minute: Int, replyTo: String? = nil,
                         task: String? = nil) -> [String: Any] {
        var row: [String: Any] = [
            "id": id, "authorKind": orion ? "orion" : "human", "authorName": orion ? "Orion" : "Ada",
            "text": id, "createdAt": String(format: "2026-11-14T10:%02d:00.000Z", minute),
        ]
        if let replyTo { row["replyToId"] = replyTo }
        if let task { row["taskId"] = task }
        return row
    }

    /// hello, [request, answer = the Star], chat; optionally one follow-up and its answer.
    private func snapshot(status: String = "done", followUp: Bool = false,
                          activity: [[String: Any]] = [], requestLoaded: Bool = true) -> StreamSnapshot {
        var messages = [message("hello", minute: 0)]
        if requestLoaded { messages.append(message("request", minute: 1)) }
        messages.append(message("answer", orion: true, minute: 2, replyTo: "request", task: "star-1"))
        messages.append(message("chat", minute: 3))
        if followUp {
            messages.append(message("followup-1", minute: 4))
            messages.append(message("followup-answer", orion: true, minute: 5, replyTo: "followup-1", task: "task-f1"))
        }
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": messages,
            "stars": [["id": "star-1", "sourceMessageId": "request", "title": "Review flow",
                       "status": status, "createdAt": "2026-11-14T10:01:00.000Z",
                       "followupMessageIds": followUp ? ["followup-1"] : []]],
            "activity": activity,
        ]
        return StreamSnapshot.decode(fields)!
    }

    @Test func aDoneStarBecomesOneRowInPlaceOfItsRequestAndAnswer() {
        let ids = snapshot().mainChatTimeline.map(\.id)
        #expect(ids == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func starsStillInProgressKeepTheirMessages() {
        for status in ["working", "needs_you", "stuck"] {
            let ids = snapshot(status: status).mainChatTimeline.map(\.id)
            #expect(ids == ["message:hello", "message:request", "message:answer", "message:chat"], "\(status)")
        }
    }

    @Test func theRowCarriesTheSameReplyCountAsTheThread() {
        let plain = snapshot()
        guard case .doneStar(_, let thread) = plain.mainChatTimeline[1] else { Issue.record("no row"); return }
        #expect(thread.replyCountLabel == "1 reply")

        let continued = snapshot(followUp: true)
        guard case .doneStar(_, let longer) = continued.mainChatTimeline[1] else { Issue.record("no row"); return }
        #expect(longer.replyCountLabel == "3 replies")
        // The follow-up and its answer stay out of the main chat, as before.
        #expect(continued.mainChatTimeline.map(\.id) == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func aDoneStarBeingContinuedIsShownExpanded() {
        let busy = snapshot(activity: [["taskId": "task-f1", "starId": "star-1", "phase": "replying"]])
        #expect(busy.collapsedStars.isEmpty)
        #expect(busy.mainChatTimeline.map(\.id) == ["message:hello", "message:request", "message:answer", "message:chat"])
    }

    @Test func theRowStillAppearsWhenTheRequestIsInAnEarlierPartOfTheChat() {
        let ids = snapshot(requestLoaded: false).mainChatTimeline.map(\.id)
        #expect(ids == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func scrollIDsMatchTheRowsTheChatDraws() {
        #expect(snapshot().mainChatTimeline.map(\.scrollID) == ["hello", "star:star-1", "chat"])
    }
}
```

- [ ] **Step 2: Run and watch fail** — `cd apps/mac && swift test --filter DoneStarRowTests 2>&1 | tail -15`. Expected: compile errors (`.doneStar`, `collapsedStars`, `scrollID` do not exist).

- [ ] **Step 3: Add the timeline case** — in `StreamScreen.swift`, replace only the `StreamTimelineItem` enum (about 20 lines; the file continues after it with `ScreenDocument`, which must stay) with:

```swift
public enum StreamTimelineItem: Identifiable, Equatable, Sendable {
    case message(StreamMessage)
    case screen(StreamScreen)
    /// A finished Star shown as one line: its request and answer are folded away.
    case doneStar(StreamStar, StarThread)

    public var id: String {
        switch self {
        case .message(let message): "message:\(message.id)"
        case .screen(let screen): "screen:\(screen.id)"
        case .doneStar(let star, _): "star:\(star.id)"
        }
    }
    public var date: Date {
        switch self {
        case .message(let message): message.createdAt
        case .screen(let screen): screen.createdAt
        case .doneStar(let star, let thread): thread.request?.createdAt ?? star.createdAt
        }
    }
    /// The `.id` the main chat gives each row, used to scroll to the last one.
    public var scrollID: String {
        switch self {
        case .message(let message): message.id
        case .screen(let screen): "screen:\(screen.id)"
        case .doneStar(let star, _): "star:\(star.id)"
        }
    }
}
```


- [ ] **Step 4: Implement the collapse** — in `StreamSnapshot.swift`, replace `mainChatTimeline` with:

```swift
    /// Stars that are finished and not being continued: shown as one row.
    public var collapsedStars: [StreamStar] {
        stars.filter { $0.status == .done && activity(forStar: $0.id) == nil }
    }

    public var mainChatTimeline: [StreamTimelineItem] {
        let collapsed = collapsedStars
        let hiddenRequests = Set(collapsed.map(\.sourceMessageID))
        let collapsedTasks = Set(collapsed.map(\.id))
        let visible = mainChatMessages.filter { message in
            if hiddenRequests.contains(message.id) { return false }
            if message.isOrion, let task = message.taskID, collapsedTasks.contains(task) { return false }
            return true
        }
        let rows = collapsed.map { StreamTimelineItem.doneStar($0, thread(for: $0)) }
        let items = visible.map(StreamTimelineItem.message) + rows + screens.map(StreamTimelineItem.screen)
        return items.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }
```

- [ ] **Step 5: Run the new tests, then the whole suite** — `swift test --filter DoneStarRowTests 2>&1 | tail -6` → all 6 pass. Then `swift build 2>&1 | grep -E "error|Build"`. Expected: the app target fails to compile with *"switch must be exhaustive"* in `ProjectScreen.swift` (the `.doneStar` case) — that is expected and is fixed in Task 2. Run `swift test --filter OrionAppCoreTests 2>&1 | tail -4` instead for this step: expected all pass (the app target is not part of that run). If `swift test --filter` still builds the app target and fails on the exhaustive switch, do Task 2 Step 2's one-line placeholder `case .doneStar: EmptyView()` first, then re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/mac/Sources/OrionAppCore apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift
git commit -m "feat(mac): finished Stars collapse to one row in the main chat timeline" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The row view in the main chat

**Files:**
- Create: `apps/mac/Sources/Orion/Project/DoneStarRow.swift`
- Modify: `apps/mac/Sources/Orion/Project/ProjectScreen.swift` (the `stream` view, currently lines ~486-505)
- Modify: `docs/superpowers/specs/2026-11-15-star-routing-and-done-rows-design.md` (remove the thumbnail)

**Interfaces:**
- Consumes: `StreamTimelineItem.doneStar(StreamStar, StarThread)` and `.scrollID` (Task 1); `StarThread.replyCountLabel`; `StreamStar.Status.color` / `.label` (existing, in `ProjectScreen.swift`); `FrameModel.openStar(_ id: String)`.
- Produces: `DoneStarRow(star:thread:open:)`.

- [ ] **Step 1: Create the row view** — `apps/mac/Sources/Orion/Project/DoneStarRow.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// A finished Star as one quiet line in the main chat:
/// "Fintech Profile Screen · Done · 5 replies". Tapping opens the Star.
struct DoneStarRow: View {
    let star: StreamStar
    let thread: StarThread
    let open: (String) -> Void

    @State private var hovering = false

    var body: some View {
        Button { open(star.id) } label: {
            HStack(spacing: OrionSpacing.xs) {
                Image(systemName: StreamStar.Status.done.symbol)
                    .foregroundStyle(StreamStar.Status.done.color)
                    .accessibilityHidden(true)
                Text(star.title).fontWeight(.semibold).lineLimit(1)
                Text("·  Done  ·  \(thread.replyCountLabel)").foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2).foregroundStyle(.tertiary)
                    .opacity(hovering ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .font(.callout)
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xs)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(.primary.opacity(hovering ? 0.08 : 0.04))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { inside in
            hovering = inside
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .onDisappear { if hovering { NSCursor.pop(); hovering = false } }
        .accessibilityLabel("Open Star: \(star.title), Done, \(thread.replyCountLabel)")
    }
}
```

- [ ] **Step 2: Draw it in the main chat** — in `ProjectScreen.swift`'s `stream` view: change the scroll anchor and add the case. Replace `BottomAnchoredScroll(lastID: stream.mainChatMessages.last?.id) {` with `BottomAnchoredScroll(lastID: stream.mainChatTimeline.last?.scrollID) {`, and inside the `switch item` add after the `.screen` case:

```swift
                        case .doneStar(let star, let thread):
                            DoneStarRow(star: star, thread: thread) { frame.openStar($0) }
                                .padding(.leading, 28 + OrionSpacing.sm)
                                .id("star:\(star.id)")
```

- [ ] **Step 3: Build and run all Mac tests** — `cd apps/mac && swift build 2>&1 | grep -E "error|warning: unused|Build"; swift test 2>&1 | grep -E "✘|error:|Test run with"`. Expected: `Build complete!`; every test run line passes. If the compiler reports another exhaustive `switch` over `StreamTimelineItem`, add the `.doneStar` arm there (it should do the same as the row above, or nothing if it only counts messages).

- [ ] **Step 4: Remove the thumbnail from the spec** — in `docs/superpowers/specs/2026-11-15-star-routing-and-done-rows-design.md`, in Piece 1 "Behaviour" replace the bullet beginning "The row shows: Star title, "Done", the reply count" with: `- The row shows: Star title, "Done" and the reply count (the same number as the thread). There is no thumbnail: built screens already appear in the chat as their own cards.` Also change the plain-language line "(with the screen thumbnail if it built one)" to nothing, and the tests line is unchanged.

- [ ] **Step 5: Look at it** — run `apps/mac/scripts/preview.sh` and open a project with a finished Star (the demo project has them). Confirm: the finished Star is one line; an in-progress one is not; clicking the line opens the Star panel; the chat still scrolls to the newest item. Save a screenshot in `.context/`. (Agents cannot see the GUI: if you cannot run it, say so in the PR instead of claiming it was checked.)

- [ ] **Step 6: Commit and open the PR**

```bash
git add apps/mac docs
git commit -m "feat(mac): show a finished Star as one row in the main chat" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
gh pr create --base main --title "Finished Stars collapse to one row in the main chat" --body "Piece 1 of docs/superpowers/specs/2026-11-15-star-routing-and-done-rows-design.md. Mac app only; no web, database or connector change. A Done Star shows as 'Title · Done · N replies'; tap opens the Star. Stars in progress, or being continued, stay expanded.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Merging this triggers the Mac release (about 4 minutes); the owner then updates the app. It does not deploy the website.

---

## Self-review

**Spec coverage (Piece 1):** collapse when done → Task 1 (`collapsedStars`, tests 1-2); not for working/needs-you/stuck → test 2; reply count equals the thread's → test 3; tap opens the Star → Task 2 Step 2 (`frame.openStar`); nothing deleted → no data change, only the timeline derivation; re-expands when continued → test 4 (running activity keeps it expanded); no web/db/connector change → none touched. Thumbnail removed with a recorded reason (Task 2 Step 4).

**Placeholders:** none; every code step has full code. One conditional (Task 1 Step 5) names its exact fallback.

**Type consistency:** `StreamTimelineItem.doneStar(StreamStar, StarThread)`, `scrollID`, `collapsedStars`, `DoneStarRow(star:thread:open:)` are used with the same names in both tasks and the tests.
