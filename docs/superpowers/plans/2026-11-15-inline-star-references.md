# Inline Star References and Screen Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Orion Mac app's main chat, a Star shows as a small inline link (status icon + name) after Orion's reply instead of the "N replies · Done" line; three or more screens made together show as one group card; the one-line Done row is removed.

**Architecture:** Pure logic first in `OrionAppCore` (testable with `swift test`): drop the Done-row collapse, add screen clustering to `mainChatTimeline` (new `.screenGroup` item) and a small `StarLink` URL helper. Then SwiftUI: an inline link in `StreamMessageRow`, and a `ScreenGroupCard` view. No web, database or connector change.

**Tech Stack:** Swift 6 / SwiftUI / AppKit, Swift Testing (`import Testing`), run from `apps/mac`.

## Global Constraints

Copied from `docs/superpowers/specs/2026-11-15-inline-star-references-design.md`:

- Inline Star link: shown after the Orion message text in the same text flow; icon and colour by status (working = dotted circle, blue; needs you = exclamation, orange; stuck = octagon, red; done = checkmark, green); link text is the Star's title; activating it opens the Star panel (same action as before); the text stays selectable.
- The "N replies · Done" line under an Orion reply is removed; the one-line Done row and the Done-row collapse are removed (the conversation stays whole).
- Screen group: screens are clustered in time order; a screen joins the previous cluster when created within 120 seconds of the previous screen and no human message was sent between them. A cluster of 3 or more becomes one group item; a smaller cluster keeps one picture card per screen. The group card shows up to five small pictures (cached card pictures; a neutral tile while one is not ready), "N screens", and a one-line summary from counts of done, still drawing and failed screens. Tapping opens a popover list; each row opens that screen on the Canvas; a screen still drawing is not clickable.
- No web, database or connector change.
- Environment: Swift commands run in `apps/mac`. Swift code follows the `swiftui-pro` skill.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `apps/mac/Sources/OrionAppCore/Stream/StreamScreen.swift` | `StreamTimelineItem`: remove `.doneStar`, add `.screenGroup([StreamScreen])` |
| `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift` | Remove `collapsedStars`; `mainChatTimeline` clusters screens |
| `apps/mac/Sources/OrionAppCore/Stream/StarLink.swift` (new) | `orion-star://<id>` URLs for inline links |
| `apps/mac/Tests/OrionAppCoreTests/ScreenGroupTests.swift` (new), `StarLinkTests.swift` (new) | Tests |
| `apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift` | Delete |
| `apps/mac/Sources/Orion/Project/DoneStarRow.swift` | Delete |
| `apps/mac/Sources/Orion/Project/ScreenGroupCard.swift` (new) | The group card + list popover |
| `apps/mac/Sources/Orion/Project/StreamMessageRow.swift` | Inline Star link; remove `StarReplyLink` |
| `apps/mac/Sources/Orion/Project/ProjectScreen.swift` | Draw `.screenGroup`; remove `.doneStar` arm |

---

### Task 1: Core — remove the collapse, cluster screens, Star links

**Files:**
- Modify: `apps/mac/Sources/OrionAppCore/Stream/StreamScreen.swift` (the `StreamTimelineItem` enum only)
- Modify: `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift` (`collapsedStars` and `mainChatTimeline`)
- Create: `apps/mac/Sources/OrionAppCore/Stream/StarLink.swift`
- Create: `apps/mac/Tests/OrionAppCoreTests/ScreenGroupTests.swift`, `apps/mac/Tests/OrionAppCoreTests/StarLinkTests.swift`
- Delete: `apps/mac/Tests/OrionAppCoreTests/DoneStarRowTests.swift`
- Modify (temporary compile fix, replaced in Tasks 2-3): `apps/mac/Sources/Orion/Project/ProjectScreen.swift`; delete `apps/mac/Sources/Orion/Project/DoneStarRow.swift`

**Interfaces:**
- Consumes (existing): `StreamSnapshot.screens` (sorted by `createdAt` then `id`), `.messages`, `.mainChatMessages`, `.stars`; `StreamScreen` (`id`, `state`, `createdAt`), `StreamMessage.isOrion`/`.createdAt`.
- Produces:
  - `StreamTimelineItem.screenGroup([StreamScreen])` — `id`/`scrollID` is `"screens:<firstScreenID>"`, `date` is the first screen's `createdAt`. `.doneStar` and `StreamSnapshot.collapsedStars` no longer exist.
  - `StreamSnapshot.screenGroupMinimum` (= 3) and `StreamSnapshot.screenGroupWindow` (= 120 seconds), both `public static let`.
  - `StarLink.url(for starID: String) -> URL` and `StarLink.starID(from url: URL) -> String?` (scheme `orion-star`).

- [ ] **Step 1: Write the failing tests** — `ScreenGroupTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct ScreenGroupTests {
    private func screen(_ id: String, second: Int, state: String = "built") -> [String: Any] {
        ["id": id, "name": id, "state": state, "versionId": state == "built" ? "v-\(id)" : NSNull(),
         "formFactor": "mobile", "createdAt": String(format: "2026-11-15T10:%02d:%02d.000Z", second / 60, second % 60),
         "updating": false]
    }

    private func message(_ id: String, orion: Bool, second: Int, task: String? = nil) -> [String: Any] {
        var row: [String: Any] = ["id": id, "authorKind": orion ? "orion" : "human", "authorName": orion ? "Orion" : "Ada",
                                  "text": id, "createdAt": String(format: "2026-11-15T10:%02d:%02d.000Z", second / 60, second % 60)]
        if let task { row["taskId"] = task }
        return row
    }

    private func snapshot(screens: [[String: Any]], messages: [[String: Any]] = [], stars: [[String: Any]] = []) -> StreamSnapshot {
        StreamSnapshot.decode([
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": messages, "screens": screens, "stars": stars,
        ])!
    }

    @Test func threeScreensCloseTogetherBecomeOneGroup() {
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 40, state: "building")])
        let items = value.mainChatTimeline
        #expect(items.map(\.id) == ["screens:s1"])
        guard case .screenGroup(let group) = items[0] else { Issue.record("no group"); return }
        #expect(group.map(\.id) == ["s1", "s2", "s3"])
        #expect(items.map(\.scrollID) == ["screens:s1"])
    }

    @Test func twoScreensKeepTheirOwnCards() {
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 20)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2"])
    }

    @Test func aLongGapStartsANewCluster() {
        // s3 is 5 minutes after s2, so only s1 and s2 cluster (2 screens: no group).
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 60), screen("s3", second: 360)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2", "screen:s3"])
    }

    @Test func aHumanMessageBetweenScreensStartsANewCluster() {
        let value = snapshot(
            screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 60), screen("s4", second: 80)],
            messages: [message("ask-again", orion: false, second: 40)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2", "message:ask-again", "screen:s3", "screen:s4"])
    }

    @Test func anOrionMessageBetweenScreensDoesNotSplitTheGroup() {
        let value = snapshot(
            screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 40)],
            messages: [message("note", orion: true, second: 30)])
        #expect(value.mainChatTimeline.map(\.id) == ["screens:s1", "message:note"])
    }

    @Test func finishedStarsKeepTheirMessagesInTheTimeline() {
        let value = snapshot(
            screens: [],
            messages: [message("request", orion: false, second: 0), message("answer", orion: true, second: 5, task: "star-1")],
            stars: [["id": "star-1", "sourceMessageId": "request", "title": "Review flow", "status": "done",
                     "createdAt": "2026-11-15T10:00:00.000Z", "followupMessageIds": []]])
        #expect(value.mainChatTimeline.map(\.id) == ["message:request", "message:answer"])
    }
}
```

Then `StarLinkTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct StarLinkTests {
    @Test func aStarIDRoundTripsThroughItsURL() {
        let url = StarLink.url(for: "0f3c-star")
        #expect(url.scheme == "orion-star")
        #expect(StarLink.starID(from: url) == "0f3c-star")
    }

    @Test func otherLinksAreNotStarLinks() {
        #expect(StarLink.starID(from: URL(string: "https://example.com/a")!) == nil)
        #expect(StarLink.starID(from: URL(string: "orion-star://")!) == nil)
    }
}
```

- [ ] **Step 2: Run and watch fail** — `cd apps/mac && swift test --filter "ScreenGroupTests|StarLinkTests" 2>&1 | tail -15`. Expected: compile errors (`.screenGroup`, `StarLink` missing).

- [ ] **Step 3: Replace the timeline enum** — in `StreamScreen.swift`, replace only the `StreamTimelineItem` enum (the file continues after it with `ScreenDocument`, which must stay) with:

```swift
public enum StreamTimelineItem: Identifiable, Equatable, Sendable {
    case message(StreamMessage)
    case screen(StreamScreen)
    /// Three or more screens made together, shown as one card.
    case screenGroup([StreamScreen])

    public var id: String {
        switch self {
        case .message(let message): "message:\(message.id)"
        case .screen(let screen): "screen:\(screen.id)"
        case .screenGroup(let screens): "screens:\(screens.first?.id ?? "")"
        }
    }
    public var date: Date {
        switch self {
        case .message(let message): message.createdAt
        case .screen(let screen): screen.createdAt
        case .screenGroup(let screens): screens.first?.createdAt ?? .distantPast
        }
    }
    /// The `.id` the main chat gives each row, used to scroll to the last one.
    public var scrollID: String {
        switch self {
        case .message(let message): message.id
        case .screen(let screen): "screen:\(screen.id)"
        case .screenGroup(let screens): "screens:\(screens.first?.id ?? "")"
        }
    }
}
```

- [ ] **Step 4: Cluster screens in the timeline** — in `StreamSnapshot.swift` delete `collapsedStars` and replace `mainChatTimeline` with:

```swift
    /// Three or more screens made close together read as one group.
    public static let screenGroupMinimum = 3
    /// How far apart (seconds) two screens may be and still belong to the same group.
    public static let screenGroupWindow: TimeInterval = 120

    private var screenItems: [StreamTimelineItem] {
        var clusters: [[StreamScreen]] = []
        for screen in screens {
            if let last = clusters.last?.last,
               screen.createdAt.timeIntervalSince(last.createdAt) <= Self.screenGroupWindow,
               !messages.contains(where: { !$0.isOrion && $0.createdAt > last.createdAt && $0.createdAt < screen.createdAt }) {
                clusters[clusters.count - 1].append(screen)
            } else {
                clusters.append([screen])
            }
        }
        return clusters.flatMap { cluster -> [StreamTimelineItem] in
            cluster.count >= Self.screenGroupMinimum ? [.screenGroup(cluster)] : cluster.map(StreamTimelineItem.screen)
        }
    }

    public var mainChatTimeline: [StreamTimelineItem] {
        let items = mainChatMessages.map(StreamTimelineItem.message) + screenItems
        return items.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }
```

- [ ] **Step 5: Create `StarLink.swift`**:

```swift
import Foundation

/// The address behind an inline Star link in a chat message, so a tap on the
/// link can be turned back into "open this Star".
public enum StarLink {
    public static let scheme = "orion-star"

    public static func url(for starID: String) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "star"
        components.path = "/" + starID
        return components.url!
    }

    public static func starID(from url: URL) -> String? {
        guard url.scheme == scheme else { return nil }
        let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return id.isEmpty ? nil : id
    }
}
```

- [ ] **Step 6: Remove the Done row and fix the app target so it builds** — delete `Tests/OrionAppCoreTests/DoneStarRowTests.swift` and `Sources/Orion/Project/DoneStarRow.swift` (`git rm`). In `ProjectScreen.swift`'s `stream` view, replace the whole `case .doneStar(let star, let thread):` arm (4 lines) with this one-line placeholder, which Task 3 replaces:

```swift
                        case .screenGroup: EmptyView()
```

- [ ] **Step 7: Run the tests and the build** — `cd apps/mac && swift test --filter "ScreenGroupTests|StarLinkTests" 2>&1 | tail -10` → all pass; then `swift build 2>&1 | grep -E "error|Build"` → `Build complete!`; then full `swift test 2>&1 | grep -E "✘|error:|Test run with"` → all pass.

- [ ] **Step 8: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): cluster screens into groups and drop the Done-row collapse" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Inline Star link in Orion's reply

**Files:**
- Modify: `apps/mac/Sources/Orion/Project/StreamMessageRow.swift`

**Interfaces:**
- Consumes: `StarLink.url(for:)` / `StarLink.starID(from:)` (Task 1); `StreamStar.Status.symbol` / `.color` / `.label` (existing, in `ProjectScreen.swift`); `StreamSnapshot.stars`; the existing `openStar: ((String) -> Void)?` property of `StreamMessageRow`.
- Produces: no new public interface; `StreamMessageRow` draws the link.

- [ ] **Step 1: Replace the message text and the reply link** — in `StreamMessageRow.swift`:

1. Replace
```swift
                if !message.text.isEmpty {
                    Text(message.text).textSelection(.enabled)
                }
```
with
```swift
                if !message.text.isEmpty { messageText }
```
2. Delete the whole block
```swift
                if let openStar, message.isOrion, let taskID = message.taskID,
                   let star = stream.stars.first(where: { $0.id == taskID }) {
                    StarReplyLink( ... ) { openStar(star.id) }
                    .padding(.top, OrionSpacing.xxs)
                }
```
and delete the entire `private struct StarReplyLink: View { ... }` at the bottom of the file.
3. Add these members to `StreamMessageRow` (before `body`'s closing context, as private members of the struct):

```swift
    /// The Star this Orion message started, when links are enabled (not inside a thread).
    private var star: StreamStar? {
        guard openStar != nil, message.isOrion, let taskID = message.taskID else { return nil }
        return stream.stars.first { $0.id == taskID }
    }

    /// The reply text, with the Star as a small inline link at the end of it.
    @ViewBuilder private var messageText: some View {
        if let star {
            Text("\(Text(message.text))  \(starLink(for: star))")
                .textSelection(.enabled)
                .environment(\.openURL, OpenURLAction { url in
                    guard let id = StarLink.starID(from: url) else { return .systemAction }
                    openStar?(id)
                    return .handled
                })
                .accessibilityHint("Opens the Star \(star.title)")
        } else {
            Text(message.text).textSelection(.enabled)
        }
    }

    private func starLink(for star: StreamStar) -> Text {
        var title = AttributedString(star.title)
        title.link = StarLink.url(for: star.id)
        title.foregroundColor = OrionColor.dayBreakBlue.color
        return Text("\(Text(Image(systemName: star.status.symbol)).foregroundStyle(star.status.color)) \(Text(title))")
    }
```

If the compiler rejects the `Text` interpolation form, use `Text(message.text) + Text("  ") + starLink(for: star)` and `Text(Image(systemName: star.status.symbol)).foregroundColor(star.status.color) + Text(" ") + Text(title)` instead; keep the behaviour identical.

- [ ] **Step 2: Build and test** — `cd apps/mac && swift build 2>&1 | grep -E "error|warning: |Build"` → `Build complete!` with no new warnings; `swift test 2>&1 | grep -E "✘|error:|Test run with"` → all pass. A thread panel (where `openStar` is nil) must still show plain text with no link: confirm by reading the code path (`star` is nil when `openStar == nil`).

- [ ] **Step 3: Commit**

```bash
git add apps/mac
git commit -m "feat(mac): show a Star as an inline link after Orion's reply" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The screen group card

**Files:**
- Create: `apps/mac/Sources/Orion/Project/ScreenGroupCard.swift`
- Modify: `apps/mac/Sources/Orion/Project/ProjectScreen.swift` (the `stream` view's `switch item`)

**Interfaces:**
- Consumes: `StreamTimelineItem.screenGroup([StreamScreen])` (Task 1); `ScreenCardStore.image(for: StreamScreen) -> NSImage?` and `ScreenCardStore.shared` (existing); `FrameModel.openScreenInCanvas(_ id: String)`; `OrionSpacing` tokens.
- Produces: `ScreenGroupCard(screens:store:open:)`.

- [ ] **Step 1: Create the card** — `apps/mac/Sources/Orion/Project/ScreenGroupCard.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// Several screens made together as one card: a stack of small pictures and a
/// one-line summary. Tapping lists them; picking one opens it on the Canvas.
struct ScreenGroupCard: View {
    let screens: [StreamScreen]
    let store: ScreenCardStore
    let open: (StreamScreen) -> Void

    @State private var showsList = false

    private var summary: String {
        let done = screens.filter { $0.state == .built }.count
        let drawing = screens.filter { $0.state == .building }.count
        let failed = screens.filter { $0.state == .failed }.count
        var parts = ["\(done) done"]
        if drawing > 0 { parts.append("\(drawing) still drawing") }
        if failed > 0 { parts.append("\(failed) couldn't build") }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        Button { showsList.toggle() } label: {
            HStack(spacing: OrionSpacing.sm) {
                stack
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(screens.count) screens").fontWeight(.semibold)
                    Text(summary).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
            .padding(OrionSpacing.sm)
            .frame(maxWidth: 360, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(.primary.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.10)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(screens.count) screens, \(summary)")
        .popover(isPresented: $showsList, arrowEdge: .bottom) { list }
    }

    private var stack: some View {
        HStack(spacing: -10) {
            ForEach(Array(screens.prefix(5))) { screen in
                thumbnail(for: screen)
            }
        }
    }

    private func thumbnail(for screen: StreamScreen) -> some View {
        let shape = RoundedRectangle(cornerRadius: 6, style: .continuous)
        return Group {
            if screen.state == .built, let image = store.image(for: screen) {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Rectangle().fill(.white.opacity(0.08))
            }
        }
        .frame(width: 26, height: 44)
        .clipShape(shape)
        .overlay(shape.strokeBorder(.black.opacity(0.35), lineWidth: 2))
    }

    private var list: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(screens) { screen in
                Button {
                    showsList = false
                    open(screen)
                } label: {
                    HStack(spacing: OrionSpacing.sm) {
                        thumbnail(for: screen)
                        Text(screen.name).lineLimit(1)
                        Spacer(minLength: OrionSpacing.md)
                        Text(statusText(screen)).font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, OrionSpacing.xxs)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(screen.state != .built)
                .accessibilityLabel("Open \(screen.name) on the Canvas")
            }
        }
        .padding(OrionSpacing.sm)
        .frame(minWidth: 240)
    }

    private func statusText(_ screen: StreamScreen) -> String {
        switch screen.state {
        case .built: "Done"
        case .building: "Drawing…"
        case .failed: "Couldn't build"
        }
    }
}
```

- [ ] **Step 2: Draw it in the main chat** — in `ProjectScreen.swift`'s `stream` view, replace the placeholder arm `case .screenGroup: EmptyView()` (from Task 1) with:

```swift
                        case .screenGroup(let screens):
                            ScreenGroupCard(screens: screens, store: .shared) { frame.openScreenInCanvas($0.id) }
                                .padding(.leading, 28 + OrionSpacing.sm)
                                .id(item.scrollID)
```

- [ ] **Step 3: Build, test and look** — `cd apps/mac && swift build 2>&1 | grep -E "error|warning: |Build"` → `Build complete!`; `swift test 2>&1 | grep -E "✘|error:|Test run with"` → all pass. Visual check (`apps/mac/scripts/preview.sh`) needs a GUI: try it; if it cannot be seen say so plainly, never claim it was checked, and leave no preview process running.

- [ ] **Step 4: Commit and open the PR**

```bash
git add apps/mac
git commit -m "feat(mac): group three or more screens into one card" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(The controller pushes and opens the PR after the reviews.)

---

## Self-review

**Spec coverage:** inline link after the reply with status icon/colour, opens the Star, selectable → Task 2; "N replies · Done" line removed → Task 2 (deletes `StarReplyLink` usage); Done row and collapse removed → Task 1 Step 6 and the timeline; conversation stays whole → Task 1 test `finishedStarsKeepTheirMessagesInTheTimeline`; clustering rule (120 s, no human message between, minimum 3) → Task 1 Step 4 and tests (three together, two stay separate, long gap, human message between, Orion message does not split); group card (pictures, "N screens", summary, popover list, drawing not clickable) → Task 3; no web/db/connector change → none touched.

**Placeholders:** the only deliberate temporary placeholder (`case .screenGroup: EmptyView()`) is created in Task 1 and replaced in Task 3.

**Type consistency:** `.screenGroup([StreamScreen])`, `scrollID`, `screenGroupMinimum`, `screenGroupWindow`, `StarLink.url(for:)`, `StarLink.starID(from:)`, `ScreenGroupCard(screens:store:open:)` are used with the same names throughout.
