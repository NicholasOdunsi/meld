# Native Project Screen (Swift side of step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening a project in the Orion Mac app shows one native glass screen: a single header (project icon and name, then To-do / Canvas / Artifacts), a Discord-style chat stream on the window glass, and the Taste-style composer with a model selector. The old tab bar goes away.

**Architecture:** The web page (plan `2026-11-14-stream-feed-web.md`) posts a `stream` bridge message and answers `window.__orionStream.post(...)`. `OrionAppCore` decodes it into a pure `StreamSnapshot`. `FrameModel` holds the latest snapshot and the open panel, and sends messages through the existing `FrameCommanding` channel. New SwiftUI views (`ProjectScreen`, `ProjectHeader`, `StreamView`, `ChatComposer`) draw it. The single `WKWebView` stays mounted: hidden while the native chat shows, and shown full-area under the header for Canvas and Artifacts (a stopgap until steps 3-4 turn those into proper panels).

**Tech Stack:** Swift 6.2, SwiftUI (macOS 26, Liquid Glass), Swift Testing, SwiftPM in `apps/mac`. Read `.claude/skills/swiftui-pro` before writing SwiftUI.

Spec: `docs/superpowers/specs/2026-11-14-project-stream-and-stars-design.md` (build step 1).
Depends on: `docs/superpowers/plans/2026-11-14-stream-feed-web.md` (the web side). **Web ships first.** An `OrionFrame/2` Mac build against a website that does not yet feed the stream shows an empty chat; older Mac builds are unaffected by the web change.
Builds on: `docs/superpowers/plans/2026-11-14-composer-refresh.md` (done): this plan reuses `ComposerStatusPill`, `ComposerNoticeCenter`, `iceGlass`, `ComposerMetrics`, `ComposerSendButton`.

## Global Constraints

- Run tests from `apps/mac`: `swift test --filter <Name>`; whole suite `swift test`; `swift build` must stay warning-free for touched files.
- Swift language mode v6; `OrionAppCore` is pure (no SwiftUI/AppKit); views live in the `Orion` target; tests for views' pure helpers go in `Tests/OrionTests`, for core in `Tests/OrionAppCoreTests`.
- Use `OrionSpacing` tokens and existing `FrameMetrics` for spacing; no new colours except the stream tint in Task 3 (`Color.black.opacity(0.18)` behind the text column) and the avatar hash colours.
- The header is **the project's icon and name, then three buttons: To-do, Canvas, Artifacts. No Orion logo, no tab row, no second header.**
- The stream sits **directly on the window glass** (`WindowGlass.content` is already the window background); text is white-ish with the tint above for legibility.
- Orion's replies show a quoted line above them ("↱ Name  snippet") when the snapshot knows the message they answer. Clicking a reply does nothing in step 1 (stars arrive in step 2).
- The composer is the Taste composer's look (ice glass, resting 400 / open 560 width, send circle) plus a **model selector**; the hat, the "Orion" title and the brush line must not appear. Errors and hints use `ComposerStatusPill` through `ComposerNoticeCenter`.
- Text only in step 1: the composer's `+` menu is not shown in chat.
- The user agent token becomes `OrionFrame/2` (the web side keys off it).
- To-do opens the right-hand panel with an empty state ("Ask Orion for something and it will show up here."). Canvas and Artifacts temporarily show the existing web page (`?tab=user-flows` and `?tab=prd`) full-area under the header; pressing the active button again returns to the chat (`?tab=conversation`).
- Opening a project always opens its first chat ("Main"). New chat tabs are no longer created (remove ⌘T / New Chat Tab).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Responsibility |
|---|---|
| Create `Sources/OrionAppCore/Stream/StreamSnapshot.swift` | Pure model + decode of the `stream` bridge message, reply quote, model selection |
| Modify `Sources/OrionAppCore/BridgeMessage.swift` | `.stream` case |
| Modify `Sources/Orion/Bridge/NativeBridge.swift` | Forward `.stream` to `onStream` |
| Modify `Sources/Orion/App/AppDelegate.swift` | Wire `onStream` to `FrameModel` |
| Modify `Sources/Orion/Window/WebViewController.swift` | `OrionFrame/2` |
| Modify `Sources/Orion/Frame/FrameModel.swift` | Stream state, panel state, send, project opens Main, remove `newTab` |
| Modify `Sources/Orion/Frame/FrameCommands.swift` | Remove New Chat Tab |
| Create `Sources/Orion/Project/StreamFormatting.swift` | Pure helpers (day phrase, initials, avatar hue) |
| Create `Sources/Orion/Project/ProjectHeader.swift` | The single glass header |
| Create `Sources/Orion/Project/StreamView.swift` | Message list, row, avatar, quote line |
| Create `Sources/Orion/Project/ChatComposer.swift` | Composer + model selector |
| Create `Sources/Orion/Project/PanelHost.swift` | Right-hand panel container + To-do empty state |
| Create `Sources/Orion/Project/ProjectScreen.swift` | Composes header, stream, composer, panel |
| Modify `Sources/Orion/Window/OrionRootView.swift` | Show `ProjectScreen` for projects; place the web view for Canvas/Artifacts |
| Modify `Sources/Orion/Frame/OrionFrameView.swift` | Drop `DetailTopBar` |
| Delete `Sources/Orion/Frame/DetailTopBar.swift`, `Sources/Orion/Frame/ProjectTabBar.swift`, `Sources/OrionAppCore/Frame/TabOverflow.swift` | Tabs are gone |
| Tests | `Tests/OrionAppCoreTests/StreamSnapshotTests.swift`, `Tests/OrionTests/StreamFormattingTests.swift`, changes to `BridgeMessageTests`, `NativeBridgeTests`, `FrameModelTests`, `FrameTests` |

---

### Task 1: Pure stream model and bridge decoding

**Files:**
- Create: `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift`
- Modify: `apps/mac/Sources/OrionAppCore/BridgeMessage.swift`
- Test: `apps/mac/Tests/OrionAppCoreTests/StreamSnapshotTests.swift`, `apps/mac/Tests/OrionAppCoreTests/BridgeMessageTests.swift`

**Interfaces:**
- Produces (used by every later task, names exact):
  - `public struct StreamMessage: Identifiable, Equatable, Sendable { enum Author { human, orion }; enum Delivery { sending, persisted, failed }; id, author, authorID: String?, authorName, text, createdAt: Date, replyToID: String?, delivery }`
  - `public struct StreamModelChoice: Identifiable, Equatable, Sendable { id (= provider), provider, models: [String], defaultModel: String? }`
  - `public struct ModelSelection: Equatable, Sendable { provider: String; model: String?; var label: String }`
  - `public enum StreamSend: Equatable, Sendable { case canSend; case blocked(String) }`
  - `public struct StreamQuote: Equatable, Sendable { authorName: String; snippet: String }`
  - `public struct StreamSnapshot: Equatable, Sendable { roomID, projectID, currentUserID, currentUserName, orionBusy, send, defaultProvider: String?, choices, messages; static func decode(_ fields: [String: Any]) -> StreamSnapshot?; func quote(for:) -> StreamQuote?; var defaultSelection: ModelSelection?; func selection(provider:) -> ModelSelection }`
  - `BridgeMessage.stream(StreamSnapshot)`

- [ ] **Step 1: Write the failing tests**

Create `apps/mac/Tests/OrionAppCoreTests/StreamSnapshotTests.swift`:

```swift
import Foundation
import Testing
@testable import OrionAppCore

struct StreamSnapshotTests {
    private func fields(
        messages: [[String: Any]] = [],
        send: [String: Any] = ["canSend": true],
        choices: [[String: Any]] = [],
        defaultProvider: Any = NSNull()
    ) -> [String: Any] {
        [
            "v": 1, "type": "stream",
            "roomId": "r1", "projectId": "p1",
            "currentUserId": "u1", "currentUserName": "Odunsi",
            "orionBusy": false,
            "send": send,
            "defaultProvider": defaultProvider,
            "choices": choices,
            "messages": messages,
        ]
    }

    private func row(
        _ id: String, author: String = "human", name: String = "Odunsi", text: String = "hi",
        at time: String = "2026-11-14T10:00:00.000Z", replyTo: Any = NSNull(), delivery: String = "persisted"
    ) -> [String: Any] {
        ["id": id, "authorKind": author, "authorId": NSNull(), "authorName": name, "text": text,
         "createdAt": time, "replyToId": replyTo, "delivery": delivery]
    }

    @Test func decodesTheRoomPersonAndMessages() throws {
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: [
            row("m1", text: "Compare checkouts"),
            row("m2", author: "orion", name: "Orion", text: "Pulled 6 references.", at: "2026-11-14T10:01:00.000Z", replyTo: "m1"),
        ])))
        #expect(snapshot.roomID == "r1")
        #expect(snapshot.projectID == "p1")
        #expect(snapshot.currentUserName == "Odunsi")
        #expect(snapshot.messages.map(\.id) == ["m1", "m2"])
        #expect(snapshot.messages[1].author == .orion)
        #expect(snapshot.messages[1].replyToID == "m1")
        #expect(snapshot.messages[0].createdAt == ISO8601DateFormatter.fractional.date(from: "2026-11-14T10:00:00.000Z"))
    }

    @Test func acceptsDatesWithoutFractionalSeconds() throws {
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: [row("m1", at: "2026-11-14T10:00:00Z")])))
        #expect(snapshot.messages.count == 1)
    }

    @Test func dropsMalformedRowsAndSortsByTime() throws {
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: [
            row("late", at: "2026-11-14T12:00:00.000Z"),
            ["id": "broken"],
            row("early", at: "2026-11-14T09:00:00.000Z"),
            row("badtime", at: "not a date"),
            row("blank", text: "   "),
        ])))
        #expect(snapshot.messages.map(\.id) == ["early", "late"])
    }

    @Test func keepsOnlyTheNewestThousandMessages() throws {
        let base = ISO8601DateFormatter.fractional.date(from: "2026-11-14T10:00:00.000Z")!
        let many = (0..<1_005).map { index in
            row("m\(index)", at: ISO8601DateFormatter.fractional.string(from: base.addingTimeInterval(Double(index) * 60)))
        }
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: many)))
        #expect(snapshot.messages.count == 1_000)
        #expect(snapshot.messages.first?.id == "m5")
        #expect(snapshot.messages.last?.id == "m1004")
    }

    @Test func decodesWhetherSendingIsPossible() throws {
        #expect(try #require(StreamSnapshot.decode(fields())).send == .canSend)
        let blocked = try #require(StreamSnapshot.decode(fields(send: ["canSend": false, "reason": "Your connected device is offline."])))
        #expect(blocked.send == .blocked("Your connected device is offline."))
        let noReason = try #require(StreamSnapshot.decode(fields(send: ["canSend": false])))
        #expect(noReason.send == .blocked("Orion can't answer right now."))
    }

    @Test func rejectsASnapshotWithoutARoomOrPerson() {
        var broken = fields()
        broken["roomId"] = nil
        #expect(StreamSnapshot.decode(broken) == nil)
        var noUser = fields()
        noUser["currentUserId"] = ""
        #expect(StreamSnapshot.decode(noUser) == nil)
    }

    @Test func quotesTheMessageAReplyAnswers() throws {
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: [
            row("m1", name: "Odunsi", text: "Compare how Stripe and Linear handle upgrade checkout\nand sketch both"),
            row("m2", author: "orion", name: "Orion", text: "On it.", at: "2026-11-14T10:01:00.000Z", replyTo: "m1"),
            row("m3", author: "orion", name: "Orion", text: "Orphan", at: "2026-11-14T10:02:00.000Z", replyTo: "gone"),
        ])))
        let quote = try #require(snapshot.quote(for: snapshot.messages[1]))
        #expect(quote.authorName == "Odunsi")
        #expect(quote.snippet == "Compare how Stripe and Linear handle upgrade checkout and sketch both")
        #expect(snapshot.quote(for: snapshot.messages[0]) == nil)
        #expect(snapshot.quote(for: snapshot.messages[2]) == nil)
    }

    @Test func longQuotesAreCutWithAnEllipsis() throws {
        let long = String(repeating: "word ", count: 40)
        let snapshot = try #require(StreamSnapshot.decode(fields(messages: [
            row("m1", text: long),
            row("m2", author: "orion", name: "Orion", at: "2026-11-14T10:01:00.000Z", replyTo: "m1"),
        ])))
        let snippet = try #require(snapshot.quote(for: snapshot.messages[1])?.snippet)
        #expect(snippet.count == 91)
        #expect(snippet.hasSuffix("…"))
    }

    @Test func choosesTheDefaultModelSelection() throws {
        let choices: [[String: Any]] = [
            ["provider": "claude", "models": ["sonnet", "opus"], "defaultModel": "sonnet"],
            ["provider": "codex", "models": [], "defaultModel": NSNull()],
        ]
        let snapshot = try #require(StreamSnapshot.decode(fields(choices: choices, defaultProvider: "claude")))
        #expect(snapshot.defaultSelection == ModelSelection(provider: "claude", model: "sonnet"))
        #expect(snapshot.defaultSelection?.label == "Claude · sonnet")
        #expect(snapshot.selection(provider: "codex") == ModelSelection(provider: "codex", model: nil))
        #expect(snapshot.selection(provider: "codex").label == "Codex")
    }

    @Test func fallsBackToTheFirstChoiceOrNothing() throws {
        let choices: [[String: Any]] = [["provider": "codex", "models": [], "defaultModel": NSNull()]]
        let unknownDefault = try #require(StreamSnapshot.decode(fields(choices: choices, defaultProvider: "claude")))
        #expect(unknownDefault.defaultSelection == ModelSelection(provider: "codex", model: nil))
        let none = try #require(StreamSnapshot.decode(fields()))
        #expect(none.defaultSelection == nil)
    }
}
```

Append to `apps/mac/Tests/OrionAppCoreTests/BridgeMessageTests.swift` (inside `struct BridgeMessageTests`):

```swift
    @Test func decodesTheStreamMessage() {
        let message = BridgeMessage.decode([
            "v": 1, "type": "stream", "roomId": "r1", "projectId": "p1",
            "currentUserId": "u1", "currentUserName": "Odunsi", "orionBusy": true,
            "send": ["canSend": true], "defaultProvider": NSNull(), "choices": [], "messages": [],
        ])
        guard case .stream(let snapshot)? = message else {
            Issue.record("expected a stream message")
            return
        }
        #expect(snapshot.roomID == "r1")
        #expect(snapshot.orionBusy)
        #expect(BridgeMessage.decode(["v": 1, "type": "stream"]) == nil)
    }
```

- [ ] **Step 2: Run to verify the tests fail**

Run (from `apps/mac`): `swift test --filter StreamSnapshotTests`
Expected: build FAIL (`StreamSnapshot` not found).

- [ ] **Step 3: Implement the model**

Create `apps/mac/Sources/OrionAppCore/Stream/StreamSnapshot.swift`:

```swift
import Foundation

/// One chat line in a project's stream.
public struct StreamMessage: Identifiable, Equatable, Sendable {
    public enum Author: String, Sendable { case human, orion }
    public enum Delivery: String, Sendable { case sending, persisted, failed }

    public let id: String
    public let author: Author
    public let authorID: String?
    public let authorName: String
    public let text: String
    public let createdAt: Date
    /// For an Orion reply: the message it answers.
    public let replyToID: String?
    public let delivery: Delivery

    public init(
        id: String, author: Author, authorID: String?, authorName: String, text: String,
        createdAt: Date, replyToID: String?, delivery: Delivery
    ) {
        self.id = id
        self.author = author
        self.authorID = authorID
        self.authorName = authorName
        self.text = text
        self.createdAt = createdAt
        self.replyToID = replyToID
        self.delivery = delivery
    }
}

public struct StreamModelChoice: Identifiable, Equatable, Sendable {
    public var id: String { provider }
    public let provider: String
    public let models: [String]
    public let defaultModel: String?

    public init(provider: String, models: [String], defaultModel: String?) {
        self.provider = provider
        self.models = models
        self.defaultModel = defaultModel
    }
}

/// A provider (and optionally a model) the person picked for their next message.
public struct ModelSelection: Equatable, Sendable {
    public let provider: String
    public let model: String?

    public init(provider: String, model: String?) {
        self.provider = provider
        self.model = model
    }

    /// "Claude · sonnet", or just "Claude" when no model is named.
    public var label: String {
        let name = provider.prefix(1).uppercased() + provider.dropFirst()
        guard let model else { return name }
        return "\(name) · \(model)"
    }
}

public enum StreamSend: Equatable, Sendable {
    case canSend
    case blocked(String)
}

/// The line a reply quotes above itself.
public struct StreamQuote: Equatable, Sendable {
    public let authorName: String
    public let snippet: String
}

/// Everything the native project screen draws, as last posted by the page
/// (bridge message `stream`, see apps/web/src/features/native/bridge.ts).
public struct StreamSnapshot: Equatable, Sendable {
    public let roomID: String
    public let projectID: String
    public let currentUserID: String
    public let currentUserName: String
    public let orionBusy: Bool
    public let send: StreamSend
    public let defaultProvider: String?
    public let choices: [StreamModelChoice]
    public let messages: [StreamMessage]

    public init(
        roomID: String, projectID: String, currentUserID: String, currentUserName: String,
        orionBusy: Bool, send: StreamSend, defaultProvider: String?,
        choices: [StreamModelChoice], messages: [StreamMessage]
    ) {
        self.roomID = roomID
        self.projectID = projectID
        self.currentUserID = currentUserID
        self.currentUserName = currentUserName
        self.orionBusy = orionBusy
        self.send = send
        self.defaultProvider = defaultProvider
        self.choices = choices
        self.messages = messages
    }

    static let maxMessages = 1_000
    static let snippetLimit = 90
    static let blockedFallback = "Orion can't answer right now."

    /// Lenient about extra fields, strict about the ones it needs. Rows with
    /// missing fields or an unreadable time are dropped rather than failing the whole snapshot.
    static func decode(_ fields: [String: Any]) -> StreamSnapshot? {
        guard let roomID = nonEmpty(fields["roomId"]), let projectID = nonEmpty(fields["projectId"]),
              let userID = nonEmpty(fields["currentUserId"]), let userName = fields["currentUserName"] as? String
        else { return nil }
        let plain = ISO8601DateFormatter.plain
        let fractional = ISO8601DateFormatter.fractional
        let rows = (fields["messages"] as? [[String: Any]] ?? []).compactMap { row -> StreamMessage? in
            guard let id = nonEmpty(row["id"]),
                  let kind = (row["authorKind"] as? String).flatMap(StreamMessage.Author.init(rawValue:)),
                  let name = row["authorName"] as? String,
                  let text = nonEmpty(row["text"]),
                  let created = row["createdAt"] as? String,
                  let date = fractional.date(from: created) ?? plain.date(from: created) else { return nil }
            let delivery = (row["delivery"] as? String).flatMap(StreamMessage.Delivery.init(rawValue:)) ?? .persisted
            return StreamMessage(
                id: id, author: kind, authorID: row["authorId"] as? String, authorName: name,
                text: text, createdAt: date, replyToID: row["replyToId"] as? String, delivery: delivery
            )
        }
        let sorted = rows.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        let send: StreamSend
        let sendFields = fields["send"] as? [String: Any]
        if (sendFields?["canSend"] as? Bool) == true {
            send = .canSend
        } else {
            send = .blocked(nonEmpty(sendFields?["reason"]) ?? blockedFallback)
        }
        let choices = (fields["choices"] as? [[String: Any]] ?? []).compactMap { row -> StreamModelChoice? in
            guard let provider = nonEmpty(row["provider"]) else { return nil }
            return StreamModelChoice(
                provider: provider,
                models: (row["models"] as? [String]) ?? [],
                defaultModel: row["defaultModel"] as? String
            )
        }
        return StreamSnapshot(
            roomID: roomID, projectID: projectID, currentUserID: userID, currentUserName: userName,
            orionBusy: (fields["orionBusy"] as? Bool) ?? false, send: send,
            defaultProvider: fields["defaultProvider"] as? String, choices: choices,
            messages: Array(sorted.suffix(maxMessages))
        )
    }

    /// The message an Orion reply answers, if the page told us and we still have it.
    public func quote(for message: StreamMessage) -> StreamQuote? {
        guard message.author == .orion, let replyToID = message.replyToID,
              let source = messages.first(where: { $0.id == replyToID }) else { return nil }
        let flat = source.text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let snippet = flat.count > Self.snippetLimit ? String(flat.prefix(Self.snippetLimit)) + "…" : flat
        return StreamQuote(authorName: source.authorName, snippet: snippet)
    }

    /// What the composer starts on: the page's default provider with its default model,
    /// else the first choice, else nothing (the page picks).
    public var defaultSelection: ModelSelection? {
        let choice = choices.first { $0.provider == defaultProvider } ?? choices.first
        return choice.map { ModelSelection(provider: $0.provider, model: $0.defaultModel) }
    }

    /// The selection that goes with a provider the person picked (its default model).
    public func selection(provider: String) -> ModelSelection {
        let model = choices.first { $0.provider == provider }?.defaultModel
        return ModelSelection(provider: provider, model: model)
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}

extension ISO8601DateFormatter {
    nonisolated(unsafe) static let fractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    nonisolated(unsafe) static let plain: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
```

In `apps/mac/Sources/OrionAppCore/BridgeMessage.swift` add the case and decode branch:

```swift
    case frame(FrameSnapshot)
    case stream(StreamSnapshot)
```
```swift
        case "frame":
            return FrameSnapshot.decode(fields).map(BridgeMessage.frame)
        case "stream":
            return StreamSnapshot.decode(fields).map(BridgeMessage.stream)
```

Note: the test file uses `ISO8601DateFormatter.fractional` through `@testable import OrionAppCore`, which is why it is `internal`, not private.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --filter StreamSnapshotTests && swift test --filter BridgeMessageTests`
Expected: all PASS. If Swift 6 rejects `nonisolated(unsafe)` on the formatters, use `private static let` guarded by a lock, or create the formatters inside `decode` per call; keep the public behaviour identical.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/OrionAppCore apps/mac/Tests/OrionAppCoreTests
git commit -m "feat(mac): decode the page's stream message into a pure snapshot

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Frame model, bridge wiring and user agent

**Files:**
- Modify: `apps/mac/Sources/Orion/Bridge/NativeBridge.swift`
- Modify: `apps/mac/Sources/Orion/App/AppDelegate.swift`
- Modify: `apps/mac/Sources/Orion/Window/WebViewController.swift`
- Modify: `apps/mac/Sources/Orion/Frame/FrameModel.swift`
- Modify: `apps/mac/Sources/Orion/Frame/FrameCommands.swift`
- Test: `apps/mac/Tests/OrionTests/FrameModelTests.swift`, `apps/mac/Tests/OrionTests/NativeBridgeTests.swift`

**Interfaces:**
- Consumes (Task 1): `StreamSnapshot`, `ModelSelection`.
- Produces:
  - `enum ProjectPanel: Equatable { case todo, canvas, artifacts }` (in `FrameModel.swift`)
  - `FrameModel.stream: StreamSnapshot?` (private(set)), `FrameModel.currentStream: StreamSnapshot?` (the snapshot only when its `roomID` equals the page's current room), `FrameModel.activePanel: ProjectPanel?`, `FrameModel.updateStream(_:)`, `FrameModel.togglePanel(_:)`, `FrameModel.sendStreamMessage(_:selection:) async -> String?` (nil on success, else a message for the person)
  - `NativeBridge.init(... onStream:)`

- [ ] **Step 1: Write the failing tests**

In `apps/mac/Tests/OrionTests/FrameModelTests.swift` **replace** the test `switchingBackToAProjectReturnsToItsLastChat` with:

```swift
    @Test func openingAProjectAlwaysOpensItsFirstChat() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/design"))
        model.update(snapshot("/rooms/other"))

        model.sidebarSelection = .project("p1")
        #expect(model.destination == .project("p1"))
        await settle()
        #expect(commander.navigatedPaths() == ["/ws/rooms/main"])
    }
```

**Delete** the test `newTabOpensWhereThePageSays`. Then append inside `struct FrameModelTests`:

```swift
    private func stream(roomID: String = "main") -> StreamSnapshot {
        StreamSnapshot(
            roomID: roomID, projectID: "p1", currentUserID: "u1", currentUserName: "Odunsi",
            orionBusy: false, send: .canSend, defaultProvider: nil, choices: [], messages: []
        )
    }

    @Test func theStreamIsOnlyCurrentForThePagesRoom() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(stream(roomID: "main"))
        #expect(model.currentStream?.roomID == "main")
        model.update(snapshot("/rooms/design"))
        #expect(model.currentStream == nil)
        model.updateStream(stream(roomID: "design"))
        #expect(model.currentStream?.roomID == "design")
    }

    @Test func leavingTheFrameForgetsTheStream() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(stream())
        model.pageDidLeaveFrame()
        #expect(model.currentStream == nil)
    }

    @Test func sendingAsksThePageToPostTheMessage() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))
        model.updateStream(stream())
        let error = await model.sendStreamMessage("Hello Orion", selection: ModelSelection(provider: "claude", model: "sonnet"))
        #expect(error == nil)
        let call = commander.calls.last
        #expect(call?.body.contains("window.__orionStream") == true)
        #expect(call?.arguments["roomId"] as? String == "main")
        #expect(call?.arguments["body"] as? String == "Hello Orion")
        #expect(call?.arguments["providerOverride"] as? String == "claude")
        #expect(call?.arguments["modelOverride"] as? String == "sonnet")
    }

    @Test func sendingWithoutASelectionLetsThePageChoose() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))
        model.updateStream(stream())
        _ = await model.sendStreamMessage("Hi", selection: nil)
        #expect(commander.calls.last?.arguments["providerOverride"] is NSNull)
        #expect(commander.calls.last?.arguments["modelOverride"] is NSNull)
    }

    @Test func sendingReportsWhatWentWrong() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))
        model.updateStream(stream())
        commander.result = .failed("We could not ask the agent to reply. Please try again.")
        #expect(await model.sendStreamMessage("Hi", selection: nil) == "We could not ask the agent to reply. Please try again.")
        commander.result = .unavailable
        #expect(await model.sendStreamMessage("Hi", selection: nil) == "Orion isn't ready yet. Wait for the page to load, then try again.")
    }

    @Test func sendingWithNoStreamIsRefusedWithoutCallingThePage() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))
        let error = await model.sendStreamMessage("Hi", selection: nil)
        #expect(error == "Orion isn't ready yet. Wait for the page to load, then try again.")
        #expect(commander.calls.isEmpty)
    }

    @Test func panelsToggleAndTheWebOnesNavigateThePage() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))

        model.togglePanel(.todo)
        #expect(model.activePanel == .todo)
        await settle()
        #expect(commander.navigatedPaths().isEmpty)

        model.togglePanel(.canvas)
        #expect(model.activePanel == .canvas)
        await settle()
        #expect(commander.navigatedPaths() == ["/ws/rooms/main?tab=user-flows"])

        model.togglePanel(.artifacts)
        #expect(model.activePanel == .artifacts)
        await settle()
        #expect(commander.navigatedPaths().last == "/ws/rooms/main?tab=prd")

        model.togglePanel(.artifacts)
        #expect(model.activePanel == nil)
        await settle()
        #expect(commander.navigatedPaths().last == "/ws/rooms/main?tab=conversation")
    }

    @Test func closingTheTodoPanelNeverTouchesThePage() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/main"))
        model.togglePanel(.todo)
        model.togglePanel(.todo)
        #expect(model.activePanel == nil)
        await settle()
        #expect(commander.navigatedPaths().isEmpty)
    }

    @Test func openingAnotherPlaceClosesThePanel() async {
        let model = FrameModel()
        model.commander = FakeFrameCommander()
        model.update(snapshot("/rooms/main"))
        model.togglePanel(.todo)
        model.sidebarSelection = .taste
        #expect(model.activePanel == nil)
    }
```

In `apps/mac/Tests/OrionTests/NativeBridgeTests.swift` extend `make` and add a test. Replace the `make` function with:

```swift
    private func make(looking: Bool = false, shelf: FakeShelf = FakeShelf(), asks: @escaping () -> Void = {}, now: @escaping () -> Date = Date.init, onStream: @escaping (StreamSnapshot) -> Void = { _ in }) -> (NativeBridge, RecordingPresenter) {
        let presenter = RecordingPresenter()
        return (NativeBridge(appOrigin: origin, isLookingAtOrion: { looking }, presenter: presenter, shelf: shelf, askForShelfCode: asks, onStream: onStream, now: now), presenter)
    }
```

and add:

```swift
    @Test func forwardsTheStreamToTheFrame() async {
        var received: [StreamSnapshot] = []
        let (bridge, _) = make(onStream: { received.append($0) })
        let snapshot = StreamSnapshot(
            roomID: "r1", projectID: "p1", currentUserID: "u1", currentUserName: "Odunsi",
            orionBusy: false, send: .canSend, defaultProvider: nil, choices: [], messages: []
        )
        await bridge.handle(.stream(snapshot))
        #expect(received == [snapshot])
    }
```

- [ ] **Step 2: Run to verify the tests fail**

Run: `swift test --filter FrameModelTests && swift test --filter NativeBridgeTests`
Expected: build FAIL (`updateStream`, `ProjectPanel`, `onStream` do not exist).

- [ ] **Step 3: Implement**

`NativeBridge.swift`: add the stored property and init parameter (place `onStream` right after `onFrame`, before `now`), and the handler case:

```swift
    private let onStream: (StreamSnapshot) -> Void
```
```swift
        onFrame: @escaping (FrameSnapshot) -> Void = { _ in },
        onStream: @escaping (StreamSnapshot) -> Void = { _ in },
        now: @escaping () -> Date = Date.init
```
```swift
        self.onFrame = onFrame
        self.onStream = onStream
```
```swift
        case .frame(let snapshot):
            onFrame(snapshot)
        case .stream(let snapshot):
            onStream(snapshot)
```

`AppDelegate.swift`: in the `NativeBridge(...)` call after the `onFrame:` argument add:

```swift
            onFrame: { [frameModel] snapshot in frameModel.update(snapshot) },
            onStream: { [frameModel] snapshot in frameModel.updateStream(snapshot) }
```

`WebViewController.swift`: change the comment and the user agent:

```swift
        // "OrionFrame/2" tells Orion pages that this app draws the sidebar and
        // the project's chat natively, so they render content only (and feed
        // the chat over the bridge).
        configuration.applicationNameForUserAgent = "OrionMac/\(version) OrionFrame/2"
```

`FrameModel.swift`:

1. Add above `final class FrameModel` (after the imports):

```swift
/// The right-hand side of a project screen. To-do is a native panel; Canvas and
/// Artifacts show the web page full-area for now.
enum ProjectPanel: Equatable {
    case todo, canvas, artifacts

    /// The room surface the page shows for this panel, or nil for a native panel.
    var webTab: String? {
        switch self {
        case .todo: nil
        case .canvas: "user-flows"
        case .artifacts: "prd"
        }
    }
}
```

2. Add state next to `snapshot`:

```swift
    private(set) var stream: StreamSnapshot?
    /// Which panel is open on the project screen.
    var activePanel: ProjectPanel?
```

3. Remove `lastRoomByProject` (the property, its assignment in `update`, its reset in `pageDidLeaveFrame`, and its use in `open`). Replace `open(_:)` with:

```swift
    func open(_ destination: FrameDestination) {
        guard let snapshot, destination != self.destination else { return }
        pendingDestination = destination
        activePanel = nil
        if case .project(let id) = destination, let roomID = snapshot.tabs(in: id).first?.id {
            // Straight to the project's chat (its first, "Main").
            navigate(to: "/\(snapshot.workspaceID)/rooms/\(roomID)")
        } else {
            navigate(to: destination.path(workspaceID: snapshot.workspaceID))
        }
    }
```

4. In `update(_:)` delete the `if let roomID = snapshot.currentRoomID, let tab = ...` block. In `pageDidLeaveFrame()` replace `lastRoomByProject = [:]` with `stream = nil` and `activePanel = nil`.

5. Delete `func newTab() async { ... }` entirely.

6. Add the stream API in a new extension at the bottom of the file:

```swift
extension FrameModel {
    private static let notReady = String(localized: "Orion isn't ready yet. Wait for the page to load, then try again.")

    /// The chat for the room the page is showing. A stale snapshot from another room is ignored.
    var currentStream: StreamSnapshot? {
        guard let stream, stream.roomID == snapshot?.currentRoomID else { return nil }
        return stream
    }

    func updateStream(_ stream: StreamSnapshot) {
        self.stream = stream
    }

    /// Opens or closes a panel. Canvas and Artifacts also point the page at the
    /// matching surface so the web view shows it; closing returns it to the chat.
    func togglePanel(_ panel: ProjectPanel) {
        let previous = activePanel
        activePanel = previous == panel ? nil : panel
        guard let snapshot, let roomID = snapshot.currentRoomID else { return }
        let target = activePanel?.webTab ?? (previous?.webTab != nil ? "conversation" : nil)
        guard let target else { return }
        navigate(to: "/\(snapshot.workspaceID)/rooms/\(roomID)?tab=\(target)")
    }

    /// Sends a message to Orion through the page. Returns nil on success, else a message for the person.
    func sendStreamMessage(_ text: String, selection: ModelSelection?) async -> String? {
        guard let roomID = currentStream?.roomID, let commander else { return Self.notReady }
        let result = await commander.callFrame(
            "const s = window.__orionStream; return s ? await s.post({ roomId, body, providerOverride: providerOverride ?? undefined, modelOverride: modelOverride ?? undefined }) : null;",
            arguments: [
                "roomId": roomID,
                "body": text,
                "providerOverride": selection?.provider ?? NSNull(),
                "modelOverride": selection?.model ?? NSNull(),
            ]
        )
        switch result {
        case .ok: return nil
        case .failed(let message): return message
        case .unavailable: return Self.notReady
        }
    }
}
```

(`navigate(to:)` is `private` in the class body; make it `fileprivate`-visible to the extension in the same file by changing `private func navigate` to `fileprivate func navigate`. Both extensions live in `FrameModel.swift`.)

`FrameCommands.swift`: delete the "New Chat Tab" button and update the doc comment to "File ▸ New Project (⌘N), View ▸ Hide/Show Sidebar (⌃⌘S), and Inspiration tile size (⌘+ / ⌘−)".

- [ ] **Step 4: Run the tests**

Run: `swift build && swift test --filter FrameModelTests && swift test --filter NativeBridgeTests && swift test --filter FrameTests`
Expected: PASS. `FrameTests` still compiles because `TabOverflow` is deleted only in Task 4. If a pre-existing `FrameModelTests` case still expects "last chat" behaviour or `newTab`, it is one of the two edits above; no other test should need to change.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources apps/mac/Tests
git commit -m "feat(mac): frame model holds the stream and panel; projects open Main; OrionFrame/2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The project screen views

**Files:**
- Create: `apps/mac/Sources/Orion/Project/StreamFormatting.swift`
- Create: `apps/mac/Sources/Orion/Project/ProjectHeader.swift`
- Create: `apps/mac/Sources/Orion/Project/StreamView.swift`
- Create: `apps/mac/Sources/Orion/Project/ChatComposer.swift`
- Create: `apps/mac/Sources/Orion/Project/PanelHost.swift`
- Create: `apps/mac/Sources/Orion/Project/ProjectScreen.swift`
- Test: `apps/mac/Tests/OrionTests/StreamFormattingTests.swift`

**Interfaces:**
- Consumes (Tasks 1-2): `StreamSnapshot`, `StreamMessage`, `ModelSelection`, `FrameModel.currentStream`, `FrameModel.activePanel`, `FrameModel.togglePanel(_:)`, `FrameModel.sendStreamMessage(_:selection:)`, `ComposerNoticeCenter`, `ComposerStatusPill`.
- Produces: `ProjectScreen(frame: FrameModel)` and `ProjectHeader.height: CGFloat` (used by Task 4 to place the web view under the header).

- [ ] **Step 1: Write the failing tests for the pure helpers**

Create `apps/mac/Tests/OrionTests/StreamFormattingTests.swift`:

```swift
import Foundation
import Testing
@testable import Orion

struct StreamFormattingTests {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }
    private func date(_ iso: String) -> Date { ISO8601DateFormatter().date(from: iso)! }

    @Test func daysAreTodayYesterdayOrOther() {
        let now = date("2026-11-14T15:00:00Z")
        #expect(StreamFormatting.day(of: date("2026-11-14T09:30:00Z"), now: now, calendar: calendar) == .today)
        #expect(StreamFormatting.day(of: date("2026-11-13T23:59:00Z"), now: now, calendar: calendar) == .yesterday)
        #expect(StreamFormatting.day(of: date("2026-11-12T10:00:00Z"), now: now, calendar: calendar) == .other)
    }

    @Test func initialsComeFromTheFirstLetterOfTheName() {
        #expect(StreamFormatting.initial(of: "Odunsi") == "O")
        #expect(StreamFormatting.initial(of: "  ini") == "I")
        #expect(StreamFormatting.initial(of: "") == "?")
    }

    @Test func avatarHueIsStablePerPerson() {
        #expect(StreamFormatting.hue(for: "u1") == StreamFormatting.hue(for: "u1"))
        #expect(StreamFormatting.hue(for: "u1") != StreamFormatting.hue(for: "u2"))
        #expect((0..<1).contains(StreamFormatting.hue(for: "anything")))
    }

    @Test func aMessageStartsAGroupWhenTheAuthorOrTheQuietGapChanges() {
        let a = date("2026-11-14T10:00:00Z")
        let soon = date("2026-11-14T10:03:00Z")
        let later = date("2026-11-14T10:20:00Z")
        #expect(StreamFormatting.startsGroup(previousAuthorID: nil, previousTime: nil, authorID: "u1", time: a))
        #expect(!StreamFormatting.startsGroup(previousAuthorID: "u1", previousTime: a, authorID: "u1", time: soon))
        #expect(StreamFormatting.startsGroup(previousAuthorID: "u1", previousTime: a, authorID: "u2", time: soon))
        #expect(StreamFormatting.startsGroup(previousAuthorID: "u1", previousTime: a, authorID: "u1", time: later))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `swift test --filter StreamFormattingTests`
Expected: build FAIL (`StreamFormatting` not found).

- [ ] **Step 3: Implement the helpers**

Create `apps/mac/Sources/Orion/Project/StreamFormatting.swift`:

```swift
import Foundation

/// Small pure helpers for drawing the stream.
enum StreamFormatting {
    enum Day: Equatable { case today, yesterday, other }

    static func day(of date: Date, now: Date, calendar: Calendar = .current) -> Day {
        if calendar.isDate(date, inSameDayAs: now) { return .today }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
            return .yesterday
        }
        return .other
    }

    /// "Today at 9:30 AM", "Yesterday at 4:12 PM", or "14 Nov 2026 at 10:00".
    static func timeLabel(for date: Date, now: Date = .now, calendar: Calendar = .current) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        switch day(of: date, now: now, calendar: calendar) {
        case .today: return String(localized: "Today at \(time)")
        case .yesterday: return String(localized: "Yesterday at \(time)")
        case .other: return String(localized: "\(date.formatted(date: .abbreviated, time: .omitted)) at \(time)")
        }
    }

    static func initial(of name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).uppercased() } ?? "?"
    }

    /// A stable 0..<1 hue so each person keeps one avatar colour.
    static func hue(for id: String) -> Double {
        let hash = id.utf8.reduce(UInt64(14695981039346656037)) { ($0 ^ UInt64($1)) &* 1099511628211 }
        return Double(hash % 360) / 360
    }

    /// Consecutive messages from one person within five minutes share a header.
    static func startsGroup(previousAuthorID: String?, previousTime: Date?, authorID: String?, time: Date) -> Bool {
        guard let previousAuthorID, let previousTime, previousAuthorID == authorID else { return true }
        return time.timeIntervalSince(previousTime) > 5 * 60
    }
}
```

Run: `swift test --filter StreamFormattingTests` → PASS.

- [ ] **Step 4: Write the header**

Create `apps/mac/Sources/Orion/Project/ProjectHeader.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The project screen's one header: the project's icon and name, then To-do,
/// Canvas and Artifacts. It sits on the window glass in the traffic-light row's
/// neighbourhood; there is no Orion logo and no second header.
struct ProjectHeader: View {
    @Bindable var frame: FrameModel
    let project: FrameProject

    /// Total height, so other views can sit directly below it.
    static let height: CGFloat = FrameMetrics.rowHeight + FrameMetrics.rowPadding * 2

    var body: some View {
        HStack(spacing: OrionSpacing.xs) {
            ProjectMark(project: project, revision: frame.logoRevision)
            Text(project.name)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
            Spacer(minLength: OrionSpacing.sm)
            panelButton(.todo, title: String(localized: "To-do"), symbol: "checklist", badge: nil)
            panelButton(.canvas, title: String(localized: "Canvas"), symbol: "square.on.square.dashed", badge: nil)
            panelButton(.artifacts, title: String(localized: "Artifacts"), symbol: "doc.on.doc", badge: nil)
        }
        .padding(.horizontal, FrameMetrics.contentEdge)
        .frame(height: Self.height)
        .frame(maxWidth: .infinity)
    }

    private func panelButton(_ panel: ProjectPanel, title: String, symbol: String, badge: Int?) -> some View {
        let isActive = frame.activePanel == panel
        return Button {
            frame.togglePanel(panel)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                Text(title)
                if let badge, badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10.5, weight: .bold))
                        .padding(.horizontal, 6)
                        .background(Capsule().fill(.orange))
                        .foregroundStyle(.black)
                }
            }
            .font(.system(size: 12))
            .padding(.horizontal, FrameMetrics.rowPadding + 1)
            .frame(height: FrameMetrics.rowHeight)
            .background(isActive ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: FrameMetrics.cornerRadius))
            .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius))
        }
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .foregroundStyle(isActive ? .primary : .secondary)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .help(title)
    }
}
```

- [ ] **Step 5: Write the stream**

Create `apps/mac/Sources/Orion/Project/StreamView.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The project's chat, laid out like Discord: avatar, name, time, flat spacing,
/// and a quoted line above Orion's replies. It sits directly on the window glass.
struct StreamView: View {
    let stream: StreamSnapshot

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(stream.messages.enumerated()), id: \.element.id) { index, message in
                        let previous = index > 0 ? stream.messages[index - 1] : nil
                        StreamMessageRow(
                            message: message,
                            quote: stream.quote(for: message),
                            startsGroup: StreamFormatting.startsGroup(
                                previousAuthorID: previous.map(Self.speaker),
                                previousTime: previous?.createdAt,
                                authorID: Self.speaker(message),
                                time: message.createdAt
                            ),
                            isLatestOrionWorking: stream.orionBusy && message.id == stream.messages.last?.id
                        )
                        .id(message.id)
                    }
                    if stream.orionBusy {
                        WorkingRow()
                            .id("working")
                    }
                    Color.clear.frame(height: 150).id("bottom") // room for the floating composer
                }
                .padding(.top, OrionSpacing.sm)
            }
            .scrollIndicators(.never)
            .defaultScrollAnchor(.bottom)
            .onChange(of: stream.messages.last?.id) { _, _ in
                withAnimation(.snappy(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: stream.orionBusy) { _, _ in
                withAnimation(.snappy(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
        .overlay {
            if stream.messages.isEmpty {
                ContentUnavailableView(
                    "Say something to Orion",
                    systemImage: "bubble.left",
                    description: Text("Ask for research, a draft or a screen. Orion answers right here.")
                )
                .foregroundStyle(.white.opacity(0.75))
            }
        }
    }

    /// The identity used to group a person's consecutive messages.
    private static func speaker(_ message: StreamMessage) -> String {
        message.author == .orion ? "orion" : (message.authorID ?? message.authorName)
    }
}

struct StreamMessageRow: View {
    let message: StreamMessage
    let quote: StreamQuote?
    let startsGroup: Bool
    let isLatestOrionWorking: Bool

    var body: some View {
        HStack(alignment: .top, spacing: OrionSpacing.sm) {
            if startsGroup {
                StreamAvatar(message: message, isWorking: isLatestOrionWorking)
            } else {
                Color.clear.frame(width: StreamAvatar.size, height: 1)
            }
            VStack(alignment: .leading, spacing: 2) {
                if startsGroup, let quote {
                    ReplyQuoteLine(quote: quote)
                }
                if startsGroup {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(message.authorName).font(.system(size: 13, weight: .semibold))
                        if message.author == .orion {
                            Text("AI")
                                .font(.system(size: 9.5, weight: .bold))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(RoundedRectangle(cornerRadius: 4).fill(Color(red: 0.36, green: 0.36, blue: 0.84)))
                                .foregroundStyle(.white)
                        }
                        Text(StreamFormatting.timeLabel(for: message.createdAt))
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                Text(message.text)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(message.delivery == .failed ? 0.5 : 0.92))
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if message.delivery == .failed {
                    Text("Not sent").font(.caption).foregroundStyle(.red.opacity(0.9))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, OrionSpacing.md)
        .padding(.top, startsGroup ? OrionSpacing.sm : 2)
        .padding(.bottom, 2)
        .accessibilityElement(children: .combine)
    }
}

private struct ReplyQuoteLine: View {
    let quote: StreamQuote

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "arrow.turn.up.right")
                .font(.system(size: 10))
            Text(quote.authorName).fontWeight(.medium)
            Text(quote.snippet).lineLimit(1)
        }
        .font(.system(size: 11.5))
        .foregroundStyle(.secondary)
        .accessibilityLabel("Replying to \(quote.authorName): \(quote.snippet)")
    }
}

struct StreamAvatar: View {
    static let size: CGFloat = 34
    let message: StreamMessage
    let isWorking: Bool

    var body: some View {
        Group {
            if message.author == .orion {
                OrionHatMark(
                    state: isWorking ? .working : .needsYou,
                    tint: OrionColor.dayBreakBlue.color,
                    hop: false,
                    label: isWorking ? "Orion is working" : "Orion"
                )
                .padding(4)
                .background(Circle().fill(Color(red: 0.36, green: 0.36, blue: 0.84).opacity(0.35)))
            } else {
                Text(StreamFormatting.initial(of: message.authorName))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Circle().fill(Color(hue: StreamFormatting.hue(for: message.authorID ?? message.authorName), saturation: 0.55, brightness: 0.7)))
            }
        }
        .frame(width: Self.size, height: Self.size)
        .accessibilityHidden(true)
    }
}

private struct WorkingRow: View {
    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            ProgressView().controlSize(.small)
            Text("Orion is working…")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
        }
        .padding(.leading, OrionSpacing.md + StreamAvatar.size + OrionSpacing.sm)
        .padding(.vertical, OrionSpacing.xs)
    }
}
```

- [ ] **Step 6: Write the composer**

Create `apps/mac/Sources/Orion/Project/ChatComposer.swift`:

```swift
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The Taste composer's look (ice glass, resting bar that grows, send circle),
/// for chatting with Orion, plus a model selector. Text only for now. Problems
/// and hints show in the status pill above it.
struct ChatComposer: View {
    @Bindable var frame: FrameModel
    let stream: StreamSnapshot
    let projectName: String
    let availableWidth: CGFloat

    @State private var text = ""
    @State private var isExpanded = false
    @State private var isSending = false
    @State private var picked: ModelSelection?
    @State private var notices = ComposerNoticeCenter()
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var phase: ComposerPhase { isExpanded ? .open : .resting }
    private var selection: ModelSelection? { picked ?? stream.defaultSelection }
    private var canSend: Bool {
        guard case .canSend = stream.send else { return false }
        return !isSending && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var blockedReason: String? {
        if case .blocked(let reason) = stream.send { return reason }
        return nil
    }
    private var grow: Animation { .smooth(duration: 0.32) }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            if let notice = notices.current {
                ComposerStatusPill(notice: notice) { notices.dismiss(id: notice.id) }
                    .frame(maxWidth: ComposerMetrics.width(for: phase, available: availableWidth))
                    .padding(.bottom, OrionSpacing.sm)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .zIndex(-1)
            }
            shell
                .frame(width: ComposerMetrics.width(for: phase, available: availableWidth), alignment: .leading)
                .clipped()
                .iceGlass(cornerRadius: ComposerMetrics.cornerRadius)
                .foregroundStyle(.white)
                .padding(.bottom, OrionSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(grow, value: phase)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.28), value: notices.current?.id)
        .task(id: notices.current?.id) {
            guard let notice = notices.current, let lifetime = notice.lifetime else { return }
            do { try await Task.sleep(for: lifetime) } catch { return }
            notices.dismiss(id: notice.id)
        }
        .onChange(of: stream.send) { _, send in
            if case .blocked(let reason) = send, isExpanded { notices.show(reason, kind: .hint) }
        }
    }

    private var shell: some View {
        VStack(alignment: .leading, spacing: 0) {
            if phase == .open {
                TextField("Message \(projectName)…", text: $text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 15, weight: .light))
                    .lineLimit(1...6)
                    .focused($isFocused)
                    .onKeyPress(keys: [.return]) { press in
                        guard !press.modifiers.contains(.shift) else { return .ignored }
                        guard canSend else { return .handled }
                        Task { await send() }
                        return .handled
                    }
                    .onKeyPress(keys: [.escape]) { _ in
                        collapse()
                        return .handled
                    }
                    .onAppear { isFocused = true }
            }
            HStack(spacing: OrionSpacing.sm) {
                if phase == .resting {
                    Text("Message \(projectName)…")
                        .font(.system(size: 13, weight: .light))
                        .foregroundStyle(.white.opacity(0.6))
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    modelMenu
                    Spacer(minLength: OrionSpacing.sm)
                }
            }
            .padding(.top, phase == .resting ? 0 : OrionSpacing.sm)
            .contentShape(.rect)
            .onTapGesture {
                guard phase == .resting else { return }
                expand()
            }
            .pointerStyle(phase == .resting ? .link : .default)
        }
        .padding(.leading, phase == .resting ? OrionSpacing.md : 24)
        .padding(.trailing, OrionSpacing.sm + ComposerMetrics.sendSize + OrionSpacing.sm)
        .padding(.top, phase == .resting ? 11 : 14)
        .padding(.bottom, 11)
        .overlay(alignment: .bottomTrailing) {
            ComposerSendButton(
                size: ComposerMetrics.sendSize,
                isBright: phase == .resting ? false : canSend,
                action: { Task { await send() } }
            )
            .padding(.trailing, OrionSpacing.sm)
            .padding(.bottom, 11)
            .geometryGroup()
        }
    }

    private var modelMenu: some View {
        Menu {
            ForEach(stream.choices) { choice in
                if choice.models.isEmpty {
                    Button(ModelSelection(provider: choice.provider, model: nil).label) {
                        picked = ModelSelection(provider: choice.provider, model: nil)
                    }
                } else {
                    Section(ModelSelection(provider: choice.provider, model: nil).label) {
                        ForEach(choice.models, id: \.self) { model in
                            Button(model) { picked = ModelSelection(provider: choice.provider, model: model) }
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(selection?.label ?? String(localized: "Model"))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 9))
            }
            .font(.system(size: 12, weight: .regular))
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(Capsule().fill(Color.white.opacity(0.12)))
            .overlay { Capsule().strokeBorder(Color.white.opacity(0.25), lineWidth: 1) }
            .contentShape(.capsule)
        }
        .menuStyle(.button)
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .fixedSize()
        .disabled(stream.choices.isEmpty)
        .accessibilityLabel("Model")
    }

    private func expand() {
        withAnimation(grow) { isExpanded = true }
        if let blockedReason { notices.show(blockedReason, kind: .hint) }
    }

    private func collapse() {
        isFocused = false
        withAnimation(grow) { isExpanded = false }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard canSend else {
            if let blockedReason { notices.show(blockedReason, kind: .error) }
            return
        }
        isSending = true
        notices.dismiss()
        let failure = await frame.sendStreamMessage(body, selection: selection)
        isSending = false
        if let failure {
            notices.show(failure, kind: .error) // keep the draft so nothing is lost
        } else {
            text = ""
            collapse()
        }
    }
}
```

- [ ] **Step 7: Write the panel host and the screen**

Create `apps/mac/Sources/Orion/Project/PanelHost.swift`:

```swift
import OrionDesignSystem
import SwiftUI

/// The right-hand panel. In step 1 only To-do is native, and it is empty until
/// stars arrive. Canvas and Artifacts show the web page instead (see ProjectScreen).
struct PanelHost: View {
    @Bindable var frame: FrameModel

    static let width: CGFloat = 300

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("To-do").font(.system(size: 13, weight: .semibold))
                Spacer()
                Button {
                    frame.togglePanel(.todo)
                } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .medium))
                        .frame(width: 24, height: 24)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .pointerStyle(.link)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Close")
            }
            .padding(.horizontal, OrionSpacing.md)
            .frame(height: 40)
            Divider().opacity(0.4)
            ContentUnavailableView(
                "Nothing here yet",
                systemImage: "checklist",
                description: Text("Ask Orion for something and it will show up here.")
            )
            .foregroundStyle(.white.opacity(0.75))
        }
        .frame(width: Self.width)
        .frame(maxHeight: .infinity)
        .background(Color.black.opacity(0.22))
        .overlay(alignment: .leading) {
            Rectangle().fill(.primary.opacity(FrameMetrics.columnDividerOpacity)).frame(width: FrameMetrics.columnDividerWidth)
        }
    }
}
```

Create `apps/mac/Sources/Orion/Project/ProjectScreen.swift`:

```swift
import OrionAppCore
import SwiftUI

/// A project, drawn natively: one header, the chat stream on the window glass,
/// the composer, and an optional right-hand panel. Canvas and Artifacts leave
/// the area below the header empty: `OrionRootView` shows the web page there.
struct ProjectScreen: View {
    @Bindable var frame: FrameModel
    let project: FrameProject

    /// Whether the area below the header belongs to the web page.
    static func showsWebSurface(_ panel: ProjectPanel?) -> Bool {
        panel?.webTab != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            ProjectHeader(frame: frame, project: project)
            if Self.showsWebSurface(frame.activePanel) {
                Color.clear // the web view is laid over this area by OrionRootView
            } else {
                HStack(spacing: 0) {
                    chat
                    if frame.activePanel == .todo {
                        PanelHost(frame: frame)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
                .animation(.snappy(duration: 0.2), value: frame.activePanel)
            }
        }
    }

    @ViewBuilder
    private var chat: some View {
        if let stream = frame.currentStream {
            GeometryReader { proxy in
                ZStack(alignment: .bottom) {
                    StreamView(stream: stream)
                        .background(Color.black.opacity(0.18))
                    ChatComposer(frame: frame, stream: stream, projectName: project.name, availableWidth: proxy.size.width)
                }
            }
        } else {
            ProgressView()
                .controlSize(.large)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}
```

- [ ] **Step 8: Build**

Run: `swift build`
Expected: Build complete, no new warnings from these files. Fix compile errors in these new files only (for example if `ComposerStatusPill` / `ComposerNoticeCenter` are internal to the `Orion` target they are already visible; if `OrionColor.dayBreakBlue` needs `import OrionDesignSystem`, it is imported). Do not change the composer-refresh files.

- [ ] **Step 9: Run the whole Orion test target**

Run: `swift test --filter OrionTests`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/mac/Sources/Orion/Project apps/mac/Tests/OrionTests/StreamFormattingTests.swift
git commit -m "feat(mac): native project screen with header, stream and chat composer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Put the screen in the window and retire the tabs

**Files:**
- Modify: `apps/mac/Sources/Orion/Window/OrionRootView.swift`
- Modify: `apps/mac/Sources/Orion/Frame/OrionFrameView.swift`
- Delete: `apps/mac/Sources/Orion/Frame/DetailTopBar.swift`, `apps/mac/Sources/Orion/Frame/ProjectTabBar.swift`, `apps/mac/Sources/OrionAppCore/Frame/TabOverflow.swift`
- Modify: `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift` (remove the overflow test)
- Modify: `apps/mac/README.md`

**Interfaces:**
- Consumes (Task 3): `ProjectScreen`, `ProjectHeader.height`, `ProjectScreen.showsWebSurface(_:)`.

- [ ] **Step 1: Show the project screen and place the web view**

In `OrionRootView.swift` replace `nativePage` and `page` with:

```swift
    /// Overview, Inspiration, Taste and projects are drawn natively; other places keep the
    /// web page. The web view stays mounted (hidden) so the frame bridge keeps
    /// posting snapshots, and it is shown under the project header for Canvas and Artifacts.
    private var nativePage: FrameDestination? {
        guard frame.isAvailable, let destination = frame.destination else { return nil }
        switch destination {
        case .home, .inspiration, .taste, .project: return destination
        default: return nil
        }
    }

    /// Canvas/Artifacts on a project: the web page fills the area below the header.
    private var webSurfaceBelowHeader: Bool {
        guard case .project? = nativePage else { return false }
        return ProjectScreen.showsWebSurface(frame.activePanel)
    }

    private var isWebViewVisible: Bool { nativePage == nil || webSurfaceBelowHeader }

    private var page: some View {
        ZStack {
            WebViewHost(webView: webView)
                .padding(.top, webSurfaceBelowHeader ? ProjectHeader.height : 0)
                .opacity(isWebViewVisible ? 1 : 0)
                .allowsHitTesting(isWebViewVisible)
                .accessibilityHidden(!isWebViewVisible)
            switch nativePage {
            case .home:
                OverviewPage(frame: frame)
            case .inspiration:
                InspirationScreen(model: inspiration, appModel: appModel, frame: frame, reconnect: reconnect)
            case .taste:
                TasteScreen(model: taste, appModel: appModel, frame: frame, reconnect: reconnect)
            case .project?:
                if let project = frame.currentProject {
                    ProjectScreen(frame: frame, project: project)
                }
            default:
                EmptyView()
            }
            switch model.phase {
            case .loading where webView.url == nil:
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(.background)
            case .unreachable(let problem):
                UnreachableView(problem: problem, retry: retry)
            default:
                EmptyView()
            }
        }
    }
```

If the Swift compiler rejects `case .project?:` for the associated-value case, use `case .project:` with `nativePage` being `FrameDestination?` (switch over the unwrapped value): `switch nativePage { case .some(.project): ... }`.

- [ ] **Step 2: Remove the tab bar from the detail column**

In `OrionFrameView.swift` replace the `detail` property with:

```swift
    /// Detail column: the page (a native screen or the web view) fills it. Project
    /// screens draw their own single header.
    private var detail: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
```

and update the type's doc comment to: "The Orion window: a native sidebar column and a detail column. The sidebar toggle lives in the real window toolbar so it shares the traffic-light line."

- [ ] **Step 3: Delete the tab code and its test**

```bash
git rm apps/mac/Sources/Orion/Frame/DetailTopBar.swift apps/mac/Sources/Orion/Frame/ProjectTabBar.swift apps/mac/Sources/OrionAppCore/Frame/TabOverflow.swift
```

In `apps/mac/Tests/OrionAppCoreTests/FrameTests.swift` delete the whole `@Test func overflowKeepsSixAndTheSelectedTab()` function.

Then confirm nothing else referenced them:
Run: `grep -rn "TabOverflow\|ProjectTabBar\|DetailTopBar\|ChatTab\b" apps/mac/Sources apps/mac/Tests`
Expected: no output.

- [ ] **Step 4: Build and test everything**

Run (from `apps/mac`): `swift build && swift test`
Expected: Build complete; all three test targets PASS.

- [ ] **Step 5: README**

In `apps/mac/README.md`, directly under the "Taste is native…" lines add:

```
Projects are native too: one header (the project's icon and name, then To-do, Canvas and Artifacts) over a single Discord-style chat with Orion on the window glass. The website feeds the chat to the app, so the app needs the matching website release first.
```

- [ ] **Step 6: Look at it (human check)**

Run (repo root): `apps/mac/scripts/preview.sh` (the preview site must be running the web side from `2026-11-14-stream-feed-web.md`, which `preview.sh` serves from this checkout).
Check in "Orion Preview", with a project open:
- One header only: project icon and name on the left; To-do, Canvas, Artifacts on the right. No tab row, no Orion logo, no second header.
- The chat shows messages with avatar, name, time; Orion's replies carry the small "AI" tag and a quoted line when they answer a message.
- Type in the composer (it grows from the resting bar); choose a model from the menu; press Return. Your message appears; Orion answers (demo mode may answer with a canned reply or report no device). An error appears in the pill above the composer, not as an alert.
- To-do opens the right panel with the empty state; pressing it again closes it.
- Canvas shows the board full-area under the header; pressing Canvas again returns to the chat. Same for Artifacts (shows the PRD page).
- Taste's composer still works and looks unchanged.
Save screenshots to `.context/project-chat.png`, `.context/project-todo.png`, `.context/project-canvas.png`.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mac
git commit -m "feat(mac): show the native project screen and retire the chat tabs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (against the spec)

- **One glass header: project icon and name, then To-do / Canvas / Artifacts; no Orion logo, no second header:** `ProjectHeader` (Task 3), tab bar and `DetailTopBar` removed (Task 4), web room header/tab strip hidden in the web plan.
- **Discord-style stream with avatar, name, time, quoted-reply line, "AI" tag, on the window glass:** `StreamView` / `StreamMessageRow` / `ReplyQuoteLine` (Task 3); quote data from `StreamSnapshot.quote(for:)` (Task 1).
- **Composer = Taste composer look + model selector, no hat/title, errors in the pill:** `ChatComposer` (Task 3) reusing `iceGlass`, `ComposerMetrics`, `ComposerSendButton`, `ComposerStatusPill`, `ComposerNoticeCenter`. **Design note:** the spec describes one extracted shared composer; this plan shares the primitives instead and builds `ChatComposer` beside `FrostedComposer`, because the Taste composer's reading phase, attachments and draft are Taste-specific and a forced single view would have to be a large refactor of working code. The look matches; nothing is duplicated except the small layout shell.
- **Native except the canvas; page owns the data:** Tasks 1-2 (decode, `FrameModel` stream, `sendStreamMessage` through `FrameCommanding`).
- **Panel host with To-do empty state; Canvas/Artifacts reachable:** Task 3 `PanelHost`; Task 4 web surface under the header (temporary full-area, replaced by proper panels in steps 3-4).
- **Opening a project opens Main; no new chat tabs:** Task 2 (`open`, `newTab` removed, ⌘T removed).
- **Out of scope here:** stars/constellations/To-do data (step 2), Artifacts and Canvas panels (steps 3-4), attachments in chat, the "Earlier chats" list (step 2; until then, other rooms of a project are reachable only from Inspiration's "open room").
- **Type consistency:** `StreamSnapshot`, `StreamMessage`, `StreamModelChoice`, `StreamSend`, `StreamQuote`, `ModelSelection`, `ProjectPanel`, `currentStream`, `activePanel`, `togglePanel`, `sendStreamMessage(_:selection:)`, `ProjectHeader.height`, `ProjectScreen.showsWebSurface(_:)` are named identically in every task.
