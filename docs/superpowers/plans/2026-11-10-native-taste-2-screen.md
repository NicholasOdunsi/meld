# Native Taste — Plan 2: the native Taste screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the web Taste page in the Mac app with a SwiftUI screen: four plain-English chapters, a live sample screen, a panel-swap editor with picture controls, the Apple-rules switch, and an offline read-only state.

**Architecture:** Non-UI logic lives in `ShelfCore/Taste` (models, client calls, `TasteStore`, pure presentation helpers) so it is unit-tested without a window. The `Orion` target holds only SwiftUI views and a small `TasteModel` for UI state. It follows the Inspiration pattern exactly: `OrionClient` protocol → `URLSessionOrionClient` → store → model → screen, wired in `AppDelegate` and drawn from `OrionRootView`.

**Tech Stack:** Swift 6.2 (strict concurrency), SwiftUI/macOS 26, Swift Testing, `OrionDesignSystem`. Backend from Plan 1 (`/api/shelf/taste…`).

**Spec:** `docs/superpowers/specs/2026-11-10-native-taste-design.md` (B1–B3, B5, B6, B8 steps 2 and 4). **Depends on:** Plan 1 (built). **Followed by:** Plan 3 (composer).

## Global Constraints

- Swift language mode 6 for every target; types crossing actors are `Sendable`.
- No raw hex or magic numbers in views: use `OrionSpacing`, `OrionRadius`, `OrionColor` / `OrionColorRole`, `OrionButtonStyle`, system fonts and semantic styles (`.primary`, `.secondary`, `.tertiary`).
- Section headers are solid white (`.primary`) at `.subheadline` semibold; explanation text is `.secondary`. (Matches the Inspiration panel the owner approved.)
- Four chapters, exactly: **How it looks**, **How it feels**, **How it's put together**, **What to steer clear of**. Every row has a one-line plain-English explanation.
- Tapping a row swaps the chapter column for the edit panel in place with a **‹ Back to your taste** link. No new page, no accordion.
- Density has three pictured choices (Airy, Balanced, Packed) that write one of the five stored values; two small nudge buttons ("a bit more room" / "a bit tighter") reach the in-between values.
- Every edit sends `expectedVersion`; a 409 shows "Your taste changed in the meantime" and reloads.
- Offline: last loaded board shows read-only with an "Offline" banner; edits disabled.
- Run tests with `cd apps/mac && swift test` (or `swift test --filter <Name>`); build with `swift build`. Preview with `bash apps/mac/scripts/preview.sh`.
- All commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## File Structure

| File | Job |
|---|---|
| `Sources/ShelfCore/Taste/JSONValue.swift` (new) | Small `Codable` JSON enum for tile values and card values |
| `Sources/ShelfCore/Taste/TasteBoard.swift` (new) | The board and its enums; JSON round-trip helpers |
| `Sources/ShelfCore/Taste/TasteSnapshot.swift` (new) | `TasteResponse`, `TasteSnapshot`, `TasteCard`, request/response bodies |
| `Sources/ShelfCore/Taste/TasteCache.swift` (new) | Last snapshot on disk for offline |
| `Sources/ShelfCore/Taste/TasteStore.swift` (new) | Load, optimistic save, decide, Apple switch, preview board |
| `Sources/ShelfCore/Taste/TasteChapters.swift` (new) | Chapters, rows, plain-English copy, summaries |
| `Sources/ShelfCore/Taste/DensityChoice.swift` (new) | 3 pictures ↔ 5 stored values, nudges |
| `Sources/ShelfCore/Taste/TasteSampleStyle.swift` (new) | Board → numbers/colours for the sample |
| `Sources/ShelfCore/Network/OrionClient.swift` (+ URLSession impl, error) | New taste calls, `.conflict` code |
| `Tests/ShelfTestSupport/FakeOrionClient.swift` | Scripted taste results |
| `apps/web/src/app/api/shelf/taste/reset-tile/route.ts` + SQL | "Let Orion decide again" (clears a tile lock) |
| `Sources/Orion/Taste/*.swift` (new) | `TasteModel`, `TasteScreen`, chapter list, sample, edit panels |
| `Sources/Orion/Window/OrionRootView.swift`, `MainWindowController.swift`, `App/AppDelegate.swift` | Wiring |

---

### Task 1: Swift taste models

**Files:**
- Create: `Sources/ShelfCore/Taste/JSONValue.swift`, `TasteBoard.swift`, `TasteSnapshot.swift`
- Test: `Tests/ShelfCoreTests/TasteModelsTests.swift`

**Interfaces:**
- Produces:
  - `enum JSONValue: Codable, Sendable, Hashable` (`.string, .number(Double), .bool, .array([JSONValue]), .object([String: JSONValue]), .null`)
  - `enum TasteTile: String, Codable, CaseIterable, Sendable { designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid }`
  - `struct TasteBoard: Codable, Sendable, Equatable` with `designLanguage: [String]`, `colors: [TasteColor]`, `typography: TasteTypography`, `spacing: TasteSpacing`, `density: TasteDensity`, `layoutHabits: [String]`, `signatureDetails: [String]`, `avoid: [TasteAvoid]`
  - `enum TasteSpacing: String { tight, comfortable, generous }`, `enum TasteDensity: String, CaseIterable { airy, light, balanced, compact, dense }`, `enum TasteWeight: String { light, regular, bold, heavy }`, `enum TasteTracking: String { loose, normal, tight }`, `enum TasteColorRole: String { base, surface, text, action, accent }`
  - `TasteBoard.value(for: TasteTile) -> JSONValue`, `TasteBoard.setting(_ tile: TasteTile, to: JSONValue) -> TasteBoard?` (nil when the result does not decode)
  - `struct TasteCard: Codable, Sendable, Equatable, Identifiable { id: String; tile: TasteTile; op: String; value: JSONValue; reason: String; evidenceItemIds: [String] }`
  - `struct TasteSnapshot: Codable, Sendable, Equatable { board: TasteBoard; version: Int; appleRules: Bool; pending: [TasteCard] }`
  - `enum TasteResponse: Sendable, Equatable { case ready(TasteSnapshot), learning }` with `Decodable` that reads `status`.

- [ ] **Step 1: Write the failing test**

```swift
// TasteModelsTests.swift
import Foundation
import Testing
@testable import ShelfCore

struct TasteModelsTests {
    static let boardJSON = """
    {"designLanguage":["minimal"],"colors":[{"hex":"#ffffff","role":"base"},{"hex":"#ff5a36","role":"accent"}],
     "typography":{"weight":"regular","tracking":"normal","note":""},"spacing":"generous","density":"airy",
     "layoutHabits":["Single column forms"],"signatureDetails":[],"avoid":[{"text":"gradients","source":"typed"}]}
    """

    @Test func decodesAReadyResponse() throws {
        let json = """
        {"status":"ready","board":\(Self.boardJSON),"version":3,"appleRules":true,
         "pending":[{"id":"44444444-4444-4444-8444-444444444444","tile":"density","op":"set","value":"balanced","reason":"Seen lately","evidenceItemIds":[]}]}
        """
        let response = try JSONDecoder().decode(TasteResponse.self, from: Data(json.utf8))
        guard case .ready(let snapshot) = response else { Issue.record("expected ready"); return }
        #expect(snapshot.version == 3)
        #expect(snapshot.appleRules)
        #expect(snapshot.board.density == .airy)
        #expect(snapshot.board.colors[1].role == .accent)
        #expect(snapshot.pending.first?.value == .string("balanced"))
    }

    @Test func decodesLearning() throws {
        let response = try JSONDecoder().decode(TasteResponse.self, from: Data(#"{"status":"learning"}"#.utf8))
        #expect(response == .learning)
    }

    @Test func settingATileChangesOnlyThatTile() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        let next = try #require(board.setting(.density, to: .string("dense")))
        #expect(next.density == .dense)
        #expect(next.spacing == board.spacing)
        #expect(board.density == .airy)
    }

    @Test func settingAnInvalidValueReturnsNil() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        #expect(board.setting(.density, to: .string("roomy")) == nil)
    }

    @Test func valueForATileRoundTrips() throws {
        let board = try JSONDecoder().decode(TasteBoard.self, from: Data(Self.boardJSON.utf8))
        #expect(board.value(for: .spacing) == .string("generous"))
        #expect(board.setting(.layoutHabits, to: board.value(for: .layoutHabits)) == board)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TasteModelsTests`
Expected: FAIL, "cannot find 'TasteResponse' in scope".

- [ ] **Step 3: Implement**

```swift
// JSONValue.swift
import Foundation

/// Any JSON value. Tile edits and cards carry values whose shape depends on the tile.
public enum JSONValue: Codable, Sendable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}
```

```swift
// TasteBoard.swift
import Foundation

public enum TasteTile: String, Codable, CaseIterable, Sendable {
    case designLanguage, colors, typography, spacing, density, layoutHabits, signatureDetails, avoid
}
public enum TasteSpacing: String, Codable, CaseIterable, Sendable { case tight, comfortable, generous }
public enum TasteDensity: String, Codable, CaseIterable, Sendable { case airy, light, balanced, compact, dense }
public enum TasteWeight: String, Codable, CaseIterable, Sendable { case light, regular, bold, heavy }
public enum TasteTracking: String, Codable, CaseIterable, Sendable { case loose, normal, tight }
public enum TasteColorRole: String, Codable, CaseIterable, Sendable { case base, surface, text, action, accent }

public struct TasteColor: Codable, Sendable, Equatable {
    public var hex: String
    public var role: TasteColorRole
    public init(hex: String, role: TasteColorRole) { self.hex = hex; self.role = role }
}
public struct TasteTypography: Codable, Sendable, Equatable {
    public var weight: TasteWeight
    public var tracking: TasteTracking
    public var note: String
    public init(weight: TasteWeight, tracking: TasteTracking, note: String) {
        self.weight = weight; self.tracking = tracking; self.note = note
    }
}
public struct TasteAvoid: Codable, Sendable, Equatable {
    public var text: String
    public var source: String
    public init(text: String, source: String) { self.text = text; self.source = source }
}

public struct TasteBoard: Codable, Sendable, Equatable {
    public var designLanguage: [String]
    public var colors: [TasteColor]
    public var typography: TasteTypography
    public var spacing: TasteSpacing
    public var density: TasteDensity
    public var layoutHabits: [String]
    public var signatureDetails: [String]
    public var avoid: [TasteAvoid]

    /// The tile's current value as JSON, in the exact shape the server stores.
    public func value(for tile: TasteTile) -> JSONValue {
        guard let object = asObject, let value = object[tile.rawValue] else { return .null }
        return value
    }

    /// A copy with one tile replaced. Nil when the new value is not a valid tile value.
    public func setting(_ tile: TasteTile, to value: JSONValue) -> TasteBoard? {
        guard var object = asObject else { return nil }
        object[tile.rawValue] = value
        guard let data = try? JSONEncoder().encode(JSONValue.object(object)) else { return nil }
        return try? JSONDecoder().decode(TasteBoard.self, from: data)
    }

    private var asObject: [String: JSONValue]? {
        guard let data = try? JSONEncoder().encode(self),
              case .object(let object)? = try? JSONDecoder().decode(JSONValue.self, from: data) else { return nil }
        return object
    }
}
```

```swift
// TasteSnapshot.swift
import Foundation

public struct TasteCard: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let tile: TasteTile
    public let op: String
    public let value: JSONValue
    public let reason: String
    public let evidenceItemIds: [String]
    public init(id: String, tile: TasteTile, op: String, value: JSONValue, reason: String, evidenceItemIds: [String]) {
        self.id = id; self.tile = tile; self.op = op; self.value = value; self.reason = reason; self.evidenceItemIds = evidenceItemIds
    }
}

public struct TasteSnapshot: Codable, Sendable, Equatable {
    public var board: TasteBoard
    public var version: Int
    public var appleRules: Bool
    public var pending: [TasteCard]
    public init(board: TasteBoard, version: Int, appleRules: Bool, pending: [TasteCard]) {
        self.board = board; self.version = version; self.appleRules = appleRules; self.pending = pending
    }
}

public enum TasteResponse: Sendable, Equatable, Decodable {
    case ready(TasteSnapshot)
    case learning

    private enum CodingKeys: String, CodingKey { case status }

    public init(from decoder: any Decoder) throws {
        let status = try decoder.container(keyedBy: CodingKeys.self).decode(String.self, forKey: .status)
        self = status == "ready" ? .ready(try TasteSnapshot(from: decoder)) : .learning
    }
}

public struct TasteVersion: Codable, Sendable, Equatable { public let version: Int }
public struct TasteDecisionResult: Codable, Sendable, Equatable { public let status: String }
public struct TasteAppleRules: Codable, Sendable, Equatable { public let enabled: Bool }
public enum TasteDecision: String, Sendable { case kept, rejected }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift test --filter TasteModelsTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Taste apps/mac/Tests/ShelfCoreTests/TasteModelsTests.swift
git commit -m "feat(mac): taste models for the native screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client calls, conflict error, fake client

**Files:**
- Modify: `Sources/ShelfCore/Network/ShelfAPIError.swift`, `OrionClient.swift`, `URLSessionOrionClient.swift`
- Modify: `Tests/ShelfTestSupport/FakeOrionClient.swift`
- Test: `Tests/ShelfCoreTests/TasteClientTests.swift`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (protocol `OrionClient`, all `async throws(ShelfAPIError)`):
  - `taste(token: String) -> TasteResponse` → `GET api/shelf/taste`
  - `saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) -> TasteVersion` → `PUT api/shelf/taste/tile`
  - `decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) -> TasteDecisionResult` → `POST api/shelf/taste/suggestions/<id>`
  - `setAppleRules(_ enabled: Bool, token: String) -> TasteAppleRules` → `PUT api/shelf/taste/apple-rules`
  - `resetTasteTile(_ tile: TasteTile, token: String) -> TasteTileReset` → `POST api/shelf/taste/reset-tile` (route is Task 5)
  - `ShelfAPIError.Code.conflict`; HTTP 409 maps to it.
- FakeOrionClient: `tasteResults: [Result<TasteResponse, ShelfAPIError>]`, `tileResult`, `decideResult`, `appleResult`, `resetResult`, recorders `tilesSaved: [(TasteTile, JSONValue, Int)]`, `decisions: [(String, TasteDecision, Int)]`, `appleSettings: [Bool]`, `resets: [TasteTile]`, plus `setTasteResults(_:)`-style setters (it is an actor).

- [ ] **Step 1: Write the failing test**

```swift
// TasteClientTests.swift
import Foundation
import Testing
@testable import ShelfCore

struct TasteClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }
    private func client() -> URLSessionOrionClient { URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session()) }

    @Test func tasteGetsWithTheBearerToken() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/taste")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer t")
            return (200, Data(#"{"status":"learning"}"#.utf8))
        }
        #expect(try await client().taste(token: "t") == .learning)
    }

    @Test func saveTileSendsTileValueAndVersion() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/taste/tile")
            #expect(request.httpMethod == "PUT")
            let body = try JSONDecoder().decode([String: JSONValue].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["tile": .string("density"), "value": .string("dense"), "expectedVersion": .number(3)])
            return (200, Data(#"{"version":4}"#.utf8))
        }
        #expect(try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 3, token: "t") == TasteVersion(version: 4))
    }

    @Test func aConflictMapsToTheConflictCode() async {
        StubURLProtocol.register(host: host) { _ in (409, Data(#"{"status":"conflict"}"#.utf8)) }
        await #expect(throws: ShelfAPIError.self) {
            try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 1, token: "t")
        }
        do { _ = try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 1, token: "t") }
        catch { #expect(error.code == .conflict) }
    }

    @Test func decideAndAppleRulesUseTheirRoutes() async throws {
        StubURLProtocol.register(host: host) { request in
            if request.url?.path() == "/api/shelf/taste/apple-rules" { return (200, Data(#"{"enabled":false}"#.utf8)) }
            #expect(request.url?.path() == "/api/shelf/taste/suggestions/abc")
            let body = try JSONDecoder().decode([String: JSONValue].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["decision": .string("kept"), "expectedVersion": .number(2)])
            return (200, Data(#"{"status":"kept"}"#.utf8))
        }
        #expect(try await client().decideTasteCard(id: "abc", decision: .kept, expectedVersion: 2, token: "t") == TasteDecisionResult(status: "kept"))
        #expect(try await client().setAppleRules(false, token: "t") == TasteAppleRules(enabled: false))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TasteClientTests`
Expected: FAIL, `taste(token:)` not found.

- [ ] **Step 3: Implement.** Add to `ShelfAPIError.Code`: `case conflict`. In `URLSessionOrionClient.error(from:status:)` add `case 409: .conflict` to the status switch. Add `public struct TasteTileReset: Codable, Sendable, Equatable { public let tile: TasteTile }` to `TasteSnapshot.swift`. Add the five methods to the `OrionClient` protocol, then to `URLSessionOrionClient`:

```swift
    public func taste(token: String) async throws(ShelfAPIError) -> TasteResponse {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/taste"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request)
    }

    public func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion {
        try await sendJSON(path: "api/shelf/taste/tile", method: "PUT",
                           body: TileBody(tile: tile, value: value, expectedVersion: expectedVersion), token: token)
    }

    public func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult {
        try await sendJSON(path: "api/shelf/taste/suggestions/\(id.lowercased())", method: "POST",
                           body: DecisionBody(decision: decision.rawValue, expectedVersion: expectedVersion), token: token)
    }

    public func setAppleRules(_ enabled: Bool, token: String) async throws(ShelfAPIError) -> TasteAppleRules {
        try await sendJSON(path: "api/shelf/taste/apple-rules", method: "PUT", body: AppleBody(enabled: enabled), token: token)
    }

    public func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset {
        try await sendJSON(path: "api/shelf/taste/reset-tile", method: "POST", body: ResetBody(tile: tile), token: token)
    }

    private struct TileBody: Encodable { let tile: TasteTile; let value: JSONValue; let expectedVersion: Int }
    private struct DecisionBody: Encodable { let decision: String; let expectedVersion: Int }
    private struct AppleBody: Encodable { let enabled: Bool }
    private struct ResetBody: Encodable { let tile: TasteTile }
```

In `FakeOrionClient` add (follow the existing library-result pattern; it is an `actor`, so setters are `func`):

```swift
    public var tasteResults: [Result<TasteResponse, ShelfAPIError>] = []
    public var tileResult: Result<TasteVersion, ShelfAPIError> = .success(TasteVersion(version: 1))
    public var decideResult: Result<TasteDecisionResult, ShelfAPIError> = .success(TasteDecisionResult(status: "kept"))
    public var appleResult: Result<TasteAppleRules, ShelfAPIError> = .success(TasteAppleRules(enabled: true))
    public var resetResult: Result<TasteTileReset, ShelfAPIError>?
    public private(set) var tilesSaved: [(TasteTile, JSONValue, Int)] = []
    public private(set) var decisions: [(String, TasteDecision, Int)] = []
    public private(set) var appleSettings: [Bool] = []
    public private(set) var resets: [TasteTile] = []

    public func setTasteResults(_ r: [Result<TasteResponse, ShelfAPIError>]) { tasteResults = r }
    public func setTileResult(_ r: Result<TasteVersion, ShelfAPIError>) { tileResult = r }
    public func setDecideResult(_ r: Result<TasteDecisionResult, ShelfAPIError>) { decideResult = r }
    public func setAppleResult(_ r: Result<TasteAppleRules, ShelfAPIError>) { appleResult = r }

    public func taste(token: String) async throws(ShelfAPIError) -> TasteResponse {
        guard !tasteResults.isEmpty else { throw ShelfAPIError.network }
        return try tasteResults.removeFirst().get()
    }
    public func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion {
        tilesSaved.append((tile, value, expectedVersion)); return try tileResult.get()
    }
    public func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult {
        decisions.append((id, decision, expectedVersion)); return try decideResult.get()
    }
    public func setAppleRules(_ enabled: Bool, token: String) async throws(ShelfAPIError) -> TasteAppleRules {
        appleSettings.append(enabled); return try appleResult.get()
    }
    public func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset {
        resets.append(tile); return try (resetResult ?? .success(TasteTileReset(tile: tile))).get()
    }
```

Any other type that conforms to `OrionClient` (grep `: OrionClient` in `Sources` and `Tests`) needs the same five methods.

- [ ] **Step 4: Run the whole ShelfCore suite**

Run: `cd apps/mac && swift test --filter ShelfCoreTests`
Expected: PASS, including the existing client tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore apps/mac/Tests
git commit -m "feat(mac): taste calls on the Orion client

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `TasteStore` and offline cache

**Files:**
- Create: `Sources/ShelfCore/Taste/TasteCache.swift`, `Sources/ShelfCore/Taste/TasteStore.swift`
- Test: `Tests/ShelfCoreTests/TasteStoreTests.swift`

**Interfaces:**
- Consumes: Task 2's client methods; `LibraryCache` (read it first for the directory/atomic-write pattern and mirror it).
- Produces:

```swift
public struct TasteCache: Sendable {
    public init(directory: URL)
    public static var defaultDirectory: URL { get }   // same parent folder LibraryCache uses
    public func load() -> TasteSnapshot?
    public func save(_ snapshot: TasteSnapshot) throws
}
@MainActor @Observable public final class TasteStore {
    public enum Phase: Equatable, Sendable { case idle, loading, loaded, learning, offline, needsConnect }
    public private(set) var snapshot: TasteSnapshot?
    public private(set) var phase: Phase
    public private(set) var errorMessage: String?
    public var onUnauthorized: (@MainActor () -> Void)?
    public init(client: @escaping @MainActor () -> any OrionClient, token: @escaping @MainActor () -> String?, cache: TasteCache)
    public var canEdit: Bool            // phase == .loaded
    public var board: TasteBoard?       // snapshot?.board
    public func reload() async
    @discardableResult public func save(_ tile: TasteTile, to value: JSONValue) async -> Bool
    @discardableResult public func decide(_ card: TasteCard, _ decision: TasteDecision) async -> Bool
    @discardableResult public func setAppleRules(_ enabled: Bool) async -> Bool
    @discardableResult public func resetTile(_ tile: TasteTile) async -> Bool
    public func preview(_ card: TasteCard?) -> TasteBoard?   // board with one card applied (add/remove/set); nil card → board
    public func clearError()
}
```

- [ ] **Step 1: Write the failing test**

```swift
// TasteStoreTests.swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
struct TasteStoreTests {
    let directory = URL.temporaryDirectory.appending(path: "taste-\(UUID().uuidString)", directoryHint: .isDirectory)

    static let board = try! JSONDecoder().decode(TasteBoard.self, from: Data(TasteModelsTests.boardJSON.utf8))
    static func snapshot(version: Int = 3, pending: [TasteCard] = []) -> TasteSnapshot {
        TasteSnapshot(board: board, version: version, appleRules: true, pending: pending)
    }
    func store(_ client: FakeOrionClient, token: String? = "t") -> TasteStore {
        TasteStore(client: { client }, token: { token }, cache: TasteCache(directory: directory))
    }

    @Test func reloadLoadsAndCaches() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot()))])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .loaded)
        #expect(store.board?.density == .airy)
        #expect(TasteCache(directory: directory).load() == Self.snapshot())
    }

    @Test func noBoardYetIsLearning() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.learning)])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .learning)
        #expect(!store.canEdit)
    }

    @Test func offlineFallsBackToTheCacheAndBlocksEdits() async throws {
        try TasteCache(directory: directory).save(Self.snapshot(version: 7))
        let client = FakeOrionClient() // no scripted result → network error
        let store = store(client)
        await store.reload()
        #expect(store.phase == .offline)
        #expect(store.snapshot?.version == 7)
        #expect(!store.canEdit)
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(await client.tilesSaved.isEmpty)
    }

    @Test func saveAppliesAtOnceAndKeepsTheNewVersion() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot()))])
        await client.setTileResult(.success(TasteVersion(version: 4)))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")))
        #expect(store.board?.density == .dense)
        #expect(store.snapshot?.version == 4)
        #expect(await client.tilesSaved.first?.2 == 3)
    }

    @Test func aFailedSaveIsUndone() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot()))])
        await client.setTileResult(.failure(ShelfAPIError(code: .unavailable, message: "x")))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(store.board?.density == .airy)
        #expect(store.errorMessage != nil)
    }

    @Test func aConflictReloadsAndSaysSo() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot())), .success(.ready(Self.snapshot(version: 9)))])
        await client.setTileResult(.failure(ShelfAPIError(code: .conflict, message: "")))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(store.snapshot?.version == 9)
        #expect(store.errorMessage == "Your taste changed in the meantime. Try that again.")
    }

    @Test func invalidValuesNeverReachTheServer() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot()))])
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("roomy")) == false)
        #expect(await client.tilesSaved.isEmpty)
    }

    @Test func decideRemovesTheCardAndReloads() async {
        let card = TasteCard(id: "c1", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot(pending: [card]))), .success(.ready(Self.snapshot(version: 4)))])
        let store = store(client)
        await store.reload()
        #expect(await store.decide(card, .kept))
        #expect(store.snapshot?.pending.isEmpty == true)
        #expect(await client.decisions.first?.2 == 3)
    }

    @Test func previewAppliesOneCardWithoutSaving() async {
        let add = TasteCard(id: "a", tile: .layoutHabits, op: "add", value: .string("Sidebar plus one column"), reason: "r", evidenceItemIds: [])
        let set = TasteCard(id: "s", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot(pending: [add, set])))])
        let store = store(client)
        await store.reload()
        #expect(store.preview(add)?.layoutHabits == ["Single column forms", "Sidebar plus one column"])
        #expect(store.preview(set)?.density == .dense)
        #expect(store.preview(nil) == store.board)
        #expect(store.board?.density == .airy)
    }

    @Test func appleRulesToggleRoundTrips() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(Self.snapshot()))])
        await client.setAppleResult(.success(TasteAppleRules(enabled: false)))
        let store = store(client)
        await store.reload()
        #expect(await store.setAppleRules(false))
        #expect(store.snapshot?.appleRules == false)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TasteStoreTests`
Expected: FAIL, `TasteStore` not found.

- [ ] **Step 3: Implement.** First read `Sources/ShelfCore/Library/LibraryCache.swift` and copy its file-location/atomic-write approach for `TasteCache` (single file `taste.json`; `defaultDirectory` next to `LibraryCache.defaultDirectory`).

```swift
// TasteStore.swift
import Foundation
import Observation

/// The Taste board, the pending cards and the Apple switch. Edits show at once
/// and are undone if Orion refuses.
@MainActor
@Observable
public final class TasteStore {
    public enum Phase: Equatable, Sendable { case idle, loading, loaded, learning, offline, needsConnect }

    public private(set) var snapshot: TasteSnapshot?
    public private(set) var phase: Phase = .idle
    public private(set) var errorMessage: String?

    @ObservationIgnored public var onUnauthorized: (@MainActor () -> Void)?
    @ObservationIgnored private let client: @MainActor () -> any OrionClient
    @ObservationIgnored private let token: @MainActor () -> String?
    @ObservationIgnored private let cache: TasteCache

    public init(client: @escaping @MainActor () -> any OrionClient, token: @escaping @MainActor () -> String?, cache: TasteCache) {
        self.client = client
        self.token = token
        self.cache = cache
    }

    public var canEdit: Bool { phase == .loaded }
    public var board: TasteBoard? { snapshot?.board }
    public func clearError() { errorMessage = nil }

    public func reload() async {
        guard let token = token() else {
            phase = .needsConnect
            if snapshot == nil { snapshot = cache.load() }
            return
        }
        if snapshot == nil { phase = .loading }
        do {
            switch try await client().taste(token: token) {
            case .ready(let fresh):
                snapshot = fresh
                phase = .loaded
                try? cache.save(fresh)
            case .learning:
                phase = .learning
            }
        } catch {
            if error.code == .unauthorized { onUnauthorized?() }
            if snapshot == nil { snapshot = cache.load() }
            phase = .offline
        }
    }

    @discardableResult
    public func save(_ tile: TasteTile, to value: JSONValue) async -> Bool {
        guard canEdit, let token = token(), let current = snapshot, let next = current.board.setting(tile, to: value) else { return false }
        snapshot?.board = next
        do {
            let saved = try await client().saveTasteTile(tile, value: value, expectedVersion: current.version, token: token)
            snapshot?.version = saved.version
            if let snapshot { try? cache.save(snapshot) }
            return true
        } catch {
            snapshot = current
            await fail(error, String(localized: "Your taste wasn't saved."))
            return false
        }
    }

    @discardableResult
    public func decide(_ card: TasteCard, _ decision: TasteDecision) async -> Bool {
        guard canEdit, let token = token(), let current = snapshot else { return false }
        snapshot?.pending.removeAll { $0.id == card.id }
        do {
            _ = try await client().decideTasteCard(id: card.id, decision: decision, expectedVersion: current.version, token: token)
            await reload() // the server applied the card; take its board and version
            return true
        } catch {
            snapshot = current
            await fail(error, String(localized: "That card wasn't saved."))
            return false
        }
    }

    @discardableResult
    public func setAppleRules(_ enabled: Bool) async -> Bool {
        guard canEdit, let token = token(), let current = snapshot else { return false }
        snapshot?.appleRules = enabled
        do {
            let result = try await client().setAppleRules(enabled, token: token)
            snapshot?.appleRules = result.enabled
            if let snapshot { try? cache.save(snapshot) }
            return true
        } catch {
            snapshot = current
            await fail(error, String(localized: "Apple rules weren't changed."))
            return false
        }
    }

    @discardableResult
    public func resetTile(_ tile: TasteTile) async -> Bool {
        guard canEdit, let token = token() else { return false }
        do {
            _ = try await client().resetTasteTile(tile, token: token)
            return true
        } catch {
            await fail(error, String(localized: "Orion couldn't look again right now."))
            return false
        }
    }

    /// The board with one pending card applied, for the live sample. Never saved.
    public func preview(_ card: TasteCard?) -> TasteBoard? {
        guard let board else { return nil }
        guard let card else { return board }
        let current = board.value(for: card.tile)
        switch (card.op, current) {
        case ("set", _):
            return board.setting(card.tile, to: card.value) ?? board
        case ("add", .array(let items)):
            return board.setting(card.tile, to: .array(items + [card.value])) ?? board
        case ("remove", .array(let items)):
            return board.setting(card.tile, to: .array(items.filter { $0 != card.value })) ?? board
        default:
            return board
        }
    }

    private func fail(_ error: ShelfAPIError, _ fallback: String) async {
        switch error.code {
        case .unauthorized:
            onUnauthorized?()
        case .conflict:
            await reload()
            errorMessage = String(localized: "Your taste changed in the meantime. Try that again.")
        case .network:
            phase = .offline
            errorMessage = error.message
        default:
            errorMessage = fallback
        }
    }
}
```

`TasteCache`:

```swift
import Foundation

public struct TasteCache: Sendable {
    private let file: URL
    public init(directory: URL) { file = directory.appending(path: "taste.json") }
    public static var defaultDirectory: URL { LibraryCache.defaultDirectory.deletingLastPathComponent().appending(path: "taste-cache", directoryHint: .isDirectory) }
    public func load() -> TasteSnapshot? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(TasteSnapshot.self, from: data)
    }
    public func save(_ snapshot: TasteSnapshot) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(snapshot).write(to: file, options: .atomic)
    }
}
```

If `error` in a `catch` block is not typed as `ShelfAPIError` (Swift 6 typed throws infers it when the `do` body only throws that type; if it doesn't infer, write `catch let error as ShelfAPIError`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift test --filter TasteStoreTests`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Taste apps/mac/Tests/ShelfCoreTests/TasteStoreTests.swift
git commit -m "feat(mac): TasteStore with optimistic saves and offline cache

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Plain-English chapters, density choices, sample style

**Files:**
- Create: `Sources/ShelfCore/Taste/TasteChapters.swift`, `DensityChoice.swift`, `TasteSampleStyle.swift`
- Test: `Tests/ShelfCoreTests/TastePresentationTests.swift`

**Interfaces:**
- Produces:

```swift
public struct TasteRow: Equatable, Sendable, Identifiable {
    public let tile: TasteTile
    public let title: String          // "Density"
    public let explanation: String    // "How much is on screen at once"
    public var id: TasteTile { tile }
}
public struct TasteChapter: Equatable, Sendable, Identifiable {
    public let title: String; public let blurb: String; public let rows: [TasteRow]
    public var id: String { title }
}
public enum TasteChapters {
    public static let all: [TasteChapter]            // exactly 4, order as in Global Constraints
    public static func row(for tile: TasteTile) -> TasteRow
    public static func summary(of tile: TasteTile, in board: TasteBoard) -> String   // short text for the row's right side
}
public enum DensityChoice: String, CaseIterable, Sendable { case airy, balanced, packed
    public var title: String
    public static func choice(for stored: TasteDensity) -> DensityChoice   // light→airy, compact→packed
    public var stored: TasteDensity                                        // airy, balanced, dense
    public static func nudge(_ stored: TasteDensity, towardPacked: Bool) -> TasteDensity
}
public struct TasteSampleStyle: Equatable, Sendable {
    public let rowGap: Double; public let padding: Double; public let titleSize: Double
    public let titleWeight: TasteWeight; public let tracking: Double
    public let background: String; public let ink: String; public let action: String; public let accent: String
    public let screenTitle: String
    public init(board: TasteBoard)
}
```

- [ ] **Step 1: Write the failing test**

```swift
// TastePresentationTests.swift
import Foundation
import Testing
@testable import ShelfCore

struct TastePresentationTests {
    let board = try! JSONDecoder().decode(TasteBoard.self, from: Data(TasteModelsTests.boardJSON.utf8))

    @Test func fourChaptersInOrderEveryRowExplained() {
        #expect(TasteChapters.all.map(\.title) == ["How it looks", "How it feels", "How it's put together", "What to steer clear of"])
        let tiles = TasteChapters.all.flatMap(\.rows).map(\.tile)
        #expect(Set(tiles) == Set(TasteTile.allCases))
        #expect(tiles.count == TasteTile.allCases.count)
        #expect(TasteChapters.all.flatMap(\.rows).allSatisfy { !$0.explanation.isEmpty })
    }

    @Test func summariesAreShortAndPlain() {
        #expect(TasteChapters.summary(of: .density, in: board) == "Airy")
        #expect(TasteChapters.summary(of: .spacing, in: board) == "Generous")
        #expect(TasteChapters.summary(of: .designLanguage, in: board) == "minimal")
        #expect(TasteChapters.summary(of: .layoutHabits, in: board) == "1 habit")
        #expect(TasteChapters.summary(of: .signatureDetails, in: board) == "None yet")
        #expect(TasteChapters.summary(of: .avoid, in: board) == "gradients")
    }

    @Test func densityPicturesMapOntoFiveStoredValues() {
        #expect(DensityChoice.choice(for: .light) == .airy)
        #expect(DensityChoice.choice(for: .compact) == .packed)
        #expect(DensityChoice.balanced.stored == .balanced)
        #expect(DensityChoice.packed.stored == .dense)
        #expect(DensityChoice.nudge(.airy, towardPacked: true) == .light)
        #expect(DensityChoice.nudge(.balanced, towardPacked: false) == .light)
        #expect(DensityChoice.nudge(.dense, towardPacked: true) == .dense)
        #expect(DensityChoice.nudge(.airy, towardPacked: false) == .airy)
    }

    @Test func sampleStyleFollowsTheBoard() throws {
        let airy = TasteSampleStyle(board: board)
        let dense = TasteSampleStyle(board: try #require(board.setting(.density, to: .string("dense"))))
        #expect(airy.rowGap > dense.rowGap)
        #expect(airy.padding > dense.padding)
        #expect(airy.accent == "#ff5a36")
        #expect(airy.background == "#ffffff")
        let heavy = TasteSampleStyle(board: try #require(board.setting(.typography, to: .object(["weight": .string("heavy"), "tracking": .string("tight"), "note": .string("")]))))
        #expect(heavy.titleWeight == .heavy)
        #expect(heavy.tracking < 0)
    }

    @Test func sampleFallsBackWhenColoursAreMissing() throws {
        let bare = try #require(board.setting(.colors, to: .array([.object(["hex": .string("#112233"), "role": .string("surface")])])))
        let style = TasteSampleStyle(board: bare)
        #expect(style.background == "#ffffff")   // no base colour → white
        #expect(style.accent == style.action)    // no accent → the action colour
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TastePresentationTests`
Expected: FAIL, types not found.

- [ ] **Step 3: Implement**

```swift
// TasteChapters.swift
import Foundation

public struct TasteRow: Equatable, Sendable, Identifiable {
    public let tile: TasteTile
    public let title: String
    public let explanation: String
    public var id: TasteTile { tile }
}

public struct TasteChapter: Equatable, Sendable, Identifiable {
    public let title: String
    public let blurb: String
    public let rows: [TasteRow]
    public var id: String { title }
}

public enum TasteChapters {
    public static let all: [TasteChapter] = [
        TasteChapter(title: String(localized: "How it looks"), blurb: String(localized: "Your mood, palette and lettering"), rows: [
            row(.designLanguage, "Design language", "The overall mood of your screens"),
            row(.colors, "Colour", "The few colours you keep coming back to"),
            row(.typography, "Typography", "How heavy and tight your lettering is"),
        ]),
        TasteChapter(title: String(localized: "How it feels"), blurb: String(localized: "How roomy or packed screens are"), rows: [
            row(.density, "Density", "How much is on screen at once"),
            row(.spacing, "Spacing", "Breathing room between things"),
        ]),
        TasteChapter(title: String(localized: "How it's put together"), blurb: String(localized: "The patterns you reach for again and again"), rows: [
            row(.layoutHabits, "Layout habits", "How you like screens arranged"),
            row(.signatureDetails, "Signature details", "Small touches you repeat"),
        ]),
        TasteChapter(title: String(localized: "What to steer clear of"), blurb: String(localized: "Things Orion should never do"), rows: [
            row(.avoid, "You avoid", "Things Orion should never do"),
        ]),
    ]

    private static func row(_ tile: TasteTile, _ title: String.LocalizationValue, _ explanation: String.LocalizationValue) -> TasteRow {
        TasteRow(tile: tile, title: String(localized: title), explanation: String(localized: explanation))
    }

    public static func row(for tile: TasteTile) -> TasteRow {
        all.flatMap(\.rows).first { $0.tile == tile }!
    }

    public static func summary(of tile: TasteTile, in board: TasteBoard) -> String {
        switch tile {
        case .designLanguage: return board.designLanguage.prefix(2).joined(separator: " · ")
        case .colors: return "\(board.colors.count) colours"
        case .typography: return "\(board.typography.weight.rawValue.capitalized), \(board.typography.tracking.rawValue) tracking"
        case .spacing: return board.spacing.rawValue.capitalized
        case .density: return board.density.rawValue.capitalized
        case .layoutHabits: return count(board.layoutHabits.count, "habit")
        case .signatureDetails: return count(board.signatureDetails.count, "detail")
        case .avoid: return board.avoid.isEmpty ? "None yet" : board.avoid.prefix(2).map(\.text).joined(separator: " · ")
        }
    }

    private static func count(_ n: Int, _ noun: String) -> String {
        n == 0 ? "None yet" : "\(n) \(noun)\(n == 1 ? "" : "s")"
    }
}
```

```swift
// DensityChoice.swift
import Foundation

/// Three pictures for five stored values; two nudges reach the in-betweens.
public enum DensityChoice: String, CaseIterable, Sendable {
    case airy, balanced, packed

    public var title: String {
        switch self {
        case .airy: String(localized: "Airy")
        case .balanced: String(localized: "Balanced")
        case .packed: String(localized: "Packed")
        }
    }

    public static func choice(for stored: TasteDensity) -> DensityChoice {
        switch stored {
        case .airy, .light: .airy
        case .balanced: .balanced
        case .compact, .dense: .packed
        }
    }

    public var stored: TasteDensity {
        switch self {
        case .airy: .airy
        case .balanced: .balanced
        case .packed: .dense
        }
    }

    public static func nudge(_ stored: TasteDensity, towardPacked: Bool) -> TasteDensity {
        let order = TasteDensity.allCases
        guard let index = order.firstIndex(of: stored) else { return stored }
        let next = towardPacked ? min(index + 1, order.count - 1) : max(index - 1, 0)
        return order[next]
    }
}
```

```swift
// TasteSampleStyle.swift
import Foundation

/// What the live sample needs, worked out from a board. Pure numbers and hex strings.
public struct TasteSampleStyle: Equatable, Sendable {
    public let rowGap: Double
    public let padding: Double
    public let titleSize: Double
    public let titleWeight: TasteWeight
    public let tracking: Double
    public let background: String
    public let ink: String
    public let action: String
    public let accent: String
    public let screenTitle = "Welcome back"

    public init(board: TasteBoard) {
        let densityGap: Double = switch board.density {
        case .airy: 22
        case .light: 17
        case .balanced: 12
        case .compact: 8
        case .dense: 5
        }
        let spacingFactor: Double = switch board.spacing {
        case .tight: 0.8
        case .comfortable: 1.0
        case .generous: 1.2
        }
        rowGap = densityGap * spacingFactor
        padding = 12 + densityGap * spacingFactor * 0.6
        titleSize = 22
        titleWeight = board.typography.weight
        tracking = switch board.typography.tracking {
        case .loose: 0.6
        case .normal: 0
        case .tight: -0.8
        }
        func hex(_ role: TasteColorRole) -> String? { board.colors.first { $0.role == role }?.hex }
        background = hex(.base) ?? "#ffffff"
        ink = hex(.text) ?? "#111111"
        action = hex(.action) ?? "#111111"
        accent = hex(.accent) ?? action
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mac && swift test --filter TastePresentationTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mac/Sources/ShelfCore/Taste apps/mac/Tests/ShelfCoreTests/TastePresentationTests.swift
git commit -m "feat(mac): taste chapters, density choices and sample style

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: "Let Orion decide again" route and SQL

Spec B3 says this clears the tile's lock and queues a rethink. The existing refresh job only runs after enough new saves (taste-profile spec), so this plan clears the lock only and the screen says "Orion will look again after your next saves." (Deliberate deviation; no change to the refresh schedule.)

**Files:**
- Create: `supabase/migrations/20261110000003_capture_taste_reset_tile.sql`
- Modify: `supabase/tests/capture_taste.test.sql` (add 2 assertions, bump plan)
- Modify: `apps/web/src/features/inspiration/shelf-taste.ts` (add `resetTile`)
- Create: `apps/web/src/app/api/shelf/taste/reset-tile/route.ts`, `route.test.ts`
- Modify: `packages/contracts/src/taste.ts` (`ShelfTasteResetRequestSchema`)
- Test: `apps/web/src/features/inspiration/shelf-taste.test.ts`

**Interfaces:**
- Produces: SQL `capture_clear_taste_lock(actor_user_id uuid, target_workspace_id uuid, lock_tile text) returns void` (service_role only; `not_authorized` / `invalid_request` / `not_found` as in Plan 1); `ShelfTaste.resetTile(tile: TasteTile): Promise<ShelfTasteResult<{ tile: TasteTile }>>`; `POST /api/shelf/taste/reset-tile` body `{ tile }` → `200 { tile }`.

- [ ] **Step 1: Write the failing pgTAP assertions** (append before `finish()`, change `plan(11)` → `plan(13)`):

```sql
select lives_ok(
  $$ select public.capture_clear_taste_lock('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','density') $$,
  'owner can clear a tile lock');
select is(
  (select locks ? 'density' from public.taste_profiles where workspace_id = 'e2000000-0000-4000-8000-000000000001'),
  false, 'the lock is gone');
```

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db`
Expected: FAIL, function does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261110000003_capture_taste_reset_tile.sql
create function public.capture_clear_taste_lock(actor_user_id uuid, target_workspace_id uuid, lock_tile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if lock_tile not in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles set locks = locks - lock_tile, updated_at = now()
  where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.capture_clear_taste_lock(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.capture_clear_taste_lock(uuid, uuid, text) to service_role;
```

- [ ] **Step 4: Run to verify the SQL passes**

Run: `supabase db reset && supabase test db`
Expected: PASS, 13/13 for `capture_taste.test.sql`.

- [ ] **Step 5: Write the failing service and route tests.** In `shelf-taste.test.ts` add:

```ts
  it("resetTile clears the lock", async () => {
    const { client, rpc } = clientWith({ capture_clear_taste_lock: () => ({ data: null }) });
    expect(await createShelfTaste(client, PRINCIPAL).resetTile("density")).toEqual({ ok: true, value: { tile: "density" } });
    expect(rpc).toHaveBeenCalledWith("capture_clear_taste_lock", { actor_user_id: PRINCIPAL.userId, target_workspace_id: PRINCIPAL.workspaceId, lock_tile: "density" });
  });
```

and `reset-tile/route.test.ts` copying the tile route test: `POST` with `{tile:"density"}` → 200 and `resetTile` called with `"density"`; `{tile:"mood"}` → 422.

- [ ] **Step 6: Implement.** Contracts: `export const ShelfTasteResetRequestSchema = z.object({ tile: z.enum(TASTE_TILES) }).strict();`. Service: add `resetTile(tile: TasteTile): Promise<ShelfTasteResult<{ tile: TasteTile }>>` to the `ShelfTaste` type; real version calls the RPC (`lock_tile: tile`) and maps errors with `failure`; the fake version returns `{ ok: true, value: { tile } }`. Route:

```ts
// api/shelf/taste/reset-tile/route.ts
import { ShelfTasteResetRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "../../library/request-json";
import { tasteError, tasteForRequest } from "../taste-for-request";

export async function POST(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfTasteResetRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.taste.resetTile(body.tile);
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
```

- [ ] **Step 7: Run and commit**

Run: `pnpm --filter web test -- shelf-taste api/shelf/taste && pnpm --filter web exec tsc --noEmit`
Expected: PASS.

```bash
git add supabase apps/web packages/contracts
git commit -m "feat(taste): reset-tile route for Let Orion decide again

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Screen shell, chapters, sample, and window wiring

**Files:**
- Create: `Sources/Orion/Taste/TasteModel.swift`, `TasteScreen.swift`, `TasteChapterList.swift`, `TasteSampleView.swift`
- Modify: `Sources/Orion/App/AppDelegate.swift`, `Sources/Orion/Window/MainWindowController.swift`, `Sources/Orion/Window/OrionRootView.swift`
- Test: `Tests/OrionTests/TasteModelTests.swift`

**Interfaces:**
- Consumes: `TasteStore`, `TasteChapters`, `TasteSampleStyle`, `FrameModel`, `AppModel`.
- Produces:

```swift
@MainActor @Observable final class TasteModel {
    let store: TasteStore
    var openTile: TasteTile?          // nil = chapter list; set = edit panel for that tile
    var previewCardID: String?        // card hovered/selected in the tray (Plan 3)
    var sampleBoard: TasteBoard?      // store.preview(previewCard) — drives TasteSampleView
    func open(_ tile: TasteTile)      // no-op unless store.canEdit
    func closePanel()
}
struct TasteScreen: View { init(model: TasteModel, appModel: AppModel, frame: FrameModel, reconnect: @escaping () -> Void) }
```

- [ ] **Step 1: Write the failing test**

```swift
// TasteModelTests.swift  (Tests/OrionTests)
import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct TasteModelTests {
    func model(editable: Bool = true) async -> (TasteModel, FakeOrionClient) {
        let client = FakeOrionClient()
        if editable { await client.setTasteResults([.success(.ready(TasteStoreTests.snapshot()))]) }
        let directory = URL.temporaryDirectory.appending(path: "tm-\(UUID().uuidString)")
        let store = TasteStore(client: { client }, token: { "t" }, cache: TasteCache(directory: directory))
        await store.reload()
        return (TasteModel(store: store), client)
    }

    @Test func opensAndClosesAPanel() async {
        let (model, _) = await model()
        model.open(.density)
        #expect(model.openTile == .density)
        model.closePanel()
        #expect(model.openTile == nil)
    }

    @Test func cannotOpenAPanelWhileOffline() async {
        let (model, _) = await model(editable: false)
        model.open(.density)
        #expect(model.openTile == nil)
    }

    @Test func sampleBoardIsTheBoardUntilACardIsPreviewed() async {
        let card = TasteCard(id: "c", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteStoreTests.snapshot(pending: [card])))])
        let store = TasteStore(client: { client }, token: { "t" }, cache: TasteCache(directory: URL.temporaryDirectory.appending(path: "tm-\(UUID().uuidString)")))
        await store.reload()
        let model = TasteModel(store: store)
        #expect(model.sampleBoard?.density == .airy)
        model.previewCardID = "c"
        #expect(model.sampleBoard?.density == .dense)
        #expect(store.board?.density == .airy)
    }
}
```

(`TasteStoreTests` is in the `ShelfCoreTests` target. Either duplicate the two-line snapshot helper into `OrionTests/TestDependencies.swift` or move `snapshot(...)` to `ShelfTestSupport` as `TasteFixtures.snapshot(...)` and import it from both. Prefer the move: it is a test-support concern.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TasteModelTests`
Expected: FAIL, `TasteModel` not found.

- [ ] **Step 3: Implement the model**

```swift
// TasteModel.swift
import Observation
import ShelfCore

@MainActor
@Observable
final class TasteModel {
    let store: TasteStore
    var openTile: TasteTile?
    var previewCardID: String?

    init(store: TasteStore) { self.store = store }

    var sampleBoard: TasteBoard? {
        let card = store.snapshot?.pending.first { $0.id == previewCardID }
        return store.preview(card)
    }

    func open(_ tile: TasteTile) {
        guard store.canEdit else { return }
        openTile = tile
    }

    func closePanel() { openTile = nil }
}
```

- [ ] **Step 4: Implement the views.** Follow `InspirationScreen`'s structure (reload on appear, on connect, on app-activate; surface `store.errorMessage` via `frame.errorMessage`). Layout: header "Taste" on the same top margin as `InspirationHeader` (`FrameMetrics.overviewTopMargin`), offline banner like `InspirationStateView.offlineBanner`, then an `HStack` with the left column (chapter list or edit panel, swapped with `.transition(.move(edge: .trailing).combined(with: .opacity))`, width flexible, min 380) and the sample pinned right (width 320, `.frame(maxHeight: .infinity, alignment: .top)`, not inside the scroll view).

```swift
// TasteScreen.swift
import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct TasteScreen: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Taste")
                .font(.title2.weight(.bold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, OrionSpacing.md)
                .padding(.top, FrameMetrics.overviewTopMargin)
                .padding(.bottom, OrionSpacing.sm)
            if model.store.phase == .offline {
                Label("Offline. You can look, but not change anything.", systemImage: "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.bottom, OrionSpacing.xs)
            }
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task { await model.store.reload() }
        .onChange(of: appModel.isConnected) { _, connected in
            if connected { Task { await model.store.reload() } }
        }
        .onChange(of: model.store.errorMessage) { _, message in
            guard let message else { return }
            frame.errorMessage = message
            model.store.clearError()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.store.reload() }
        }
        .onExitCommand { model.closePanel() }
        .animation(.snappy(duration: 0.2), value: model.openTile)
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle, .loading where model.store.snapshot == nil:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.snapshot == nil:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .learning where model.store.snapshot == nil:
            ContentUnavailableView("Orion is still learning",
                                   systemImage: "sparkles",
                                   description: Text("Save a few more images to Inspiration and Orion will draw your taste."))
        default:
            if let board = model.sampleBoard {
                HStack(alignment: .top, spacing: OrionSpacing.lg) {
                    ZStack {
                        if let tile = model.openTile {
                            TasteEditPanel(tile: tile, model: model)
                                .transition(.move(edge: .trailing).combined(with: .opacity))
                        } else {
                            TasteChapterList(model: model, board: board)
                                .transition(.move(edge: .leading).combined(with: .opacity))
                        }
                    }
                    .frame(minWidth: 380, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    TasteSampleView(style: TasteSampleStyle(board: board))
                        .frame(width: 320)
                        .padding(.trailing, OrionSpacing.md)
                }
                .padding(.leading, OrionSpacing.md)
            }
        }
    }
}
```

`TasteChapterList` (scrolls; chapters are `VStack`s with a `.subheadline.weight(.semibold)` white header, `.caption` `.secondary` blurb, then rows as `Button`s in a rounded `.fill.tertiary` container, each showing title (`.body.weight(.medium)`), explanation (`.caption`, `.secondary`) and the right-aligned summary (`TasteChapters.summary`, `.secondary`) plus a chevron; disabled when `!model.store.canEdit`). The last item is the Apple-rules row (Task 8).

`TasteSampleView` renders `TasteSampleStyle` as a white-card sign-in: title with `titleWeight` mapped to `Font.Weight` (`light→.light, regular→.regular, bold→.bold, heavy→.heavy`), `.tracking(style.tracking)`, two rounded input outlines, a full-width action-coloured button, with `VStack(spacing: style.rowGap)` and `.padding(style.padding)`. Convert hex strings with a tiny `Color(hexString:)` helper in `Sources/Orion/Taste/Color+Hex.swift` (returns `.gray` on a bad string; add a unit test `#ff5a36` → expected components). A tag above the card reads "Live sample" in `.caption2`.

`TasteEditPanel` is a stub in this task: `Button("‹ Back to your taste") { model.closePanel() }` plus `Text(TasteChapters.row(for: tile).title)`; Task 7 fills it in.

- [ ] **Step 5: Wire the window.** `AppDelegate`: add `let tasteModel: TasteModel`; in `init()` after `libraryStore`:

```swift
        let tasteStore = TasteStore(
            client: { appModel.libraryClient() },
            token: { appModel.libraryToken() },
            cache: TasteCache(directory: isPreview
                ? TasteCache.defaultDirectory.deletingLastPathComponent().appending(path: "preview-taste-cache")
                : TasteCache.defaultDirectory)
        )
        tasteStore.onUnauthorized = { appModel.libraryUnauthorized() }
        self.tasteModel = TasteModel(store: tasteStore)
```

Pass `taste: tasteModel` through `MainWindowController` → `OrionRootView(taste:)`. In `OrionRootView.nativePage` include `.taste`, and add `case .taste: TasteScreen(model: taste, appModel: appModel, frame: frame, reconnect: reconnect)`.

- [ ] **Step 6: Run tests, build, and look at it**

Run: `cd apps/mac && swift build && swift test`
Expected: build OK, all tests PASS.
Then `bash apps/mac/scripts/preview.sh`, click **Taste** in the sidebar: four chapters with explanations, the sample on the right, and tapping a row shows the stub panel with a working Back link.

- [ ] **Step 7: Commit**

```bash
git add apps/mac
git commit -m "feat(mac): native Taste screen with chapters and live sample

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Edit panels with picture controls

**Files:**
- Modify: `Sources/Orion/Taste/TasteEditPanel.swift` (replace the stub)
- Create: `Sources/Orion/Taste/Panels/DensityPanel.swift`, `SpacingPanel.swift`, `TypographyPanel.swift`, `ColourPanel.swift`, `ListPanel.swift`, `MiniScreen.swift`, `TastePanelChrome.swift`
- Test: `Tests/OrionTests/TastePanelEditsTests.swift` (the pure edit builders)

**Interfaces:**
- Consumes: `TasteModel`, `TasteStore.save`, `DensityChoice`, `TasteBoard`.
- Produces (pure, testable, in `Sources/Orion/Taste/TasteEdits.swift`):

```swift
enum TasteEdits {
    static func palette(setting role: TasteColorRole, to hex: String, in colors: [TasteColor]) -> JSONValue      // replace the colour with that role, or append if missing; keeps other colours; max 6
    static func adding(_ text: String, to items: [String], limit: Int, maxLength: Int) -> [String]?             // nil when empty, duplicate (case-insensitive), too long or over limit
    static func removing(_ text: String, from items: [String]) -> [String]
    static func jsonStrings(_ items: [String]) -> JSONValue
    static func typography(_ value: TasteTypography, weight: TasteWeight? , tracking: TasteTracking?) -> JSONValue
}
```

- [ ] **Step 1: Write the failing test**

```swift
// TastePanelEditsTests.swift
import ShelfCore
import Testing
@testable import Orion

struct TastePanelEditsTests {
    let colors = [TasteColor(hex: "#ffffff", role: .base), TasteColor(hex: "#111111", role: .action), TasteColor(hex: "#ff5a36", role: .accent)]

    @Test func settingAnExistingRoleReplacesIt() {
        let value = TasteEdits.palette(setting: .accent, to: "#00aa66", in: colors)
        #expect(value == .array([
            .object(["hex": .string("#ffffff"), "role": .string("base")]),
            .object(["hex": .string("#111111"), "role": .string("action")]),
            .object(["hex": .string("#00aa66"), "role": .string("accent")]),
        ]))
    }

    @Test func settingAMissingRoleAppends() {
        let value = TasteEdits.palette(setting: .surface, to: "#eeeeee", in: colors)
        guard case .array(let items) = value else { Issue.record("array"); return }
        #expect(items.count == 4)
    }

    @Test func addingRejectsEmptyDuplicateLongAndOverLimit() {
        #expect(TasteEdits.adding("  ", to: [], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding("Pill buttons", to: ["pill BUTTONS"], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding(String(repeating: "a", count: 81), to: [], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding("x", to: ["a", "b"], limit: 2, maxLength: 80) == nil)
        #expect(TasteEdits.adding("  Pill buttons ", to: ["a"], limit: 5, maxLength: 80) == ["a", "Pill buttons"])
    }

    @Test func removingDropsTheMatch() {
        #expect(TasteEdits.removing("b", from: ["a", "b", "c"]) == ["a", "c"])
    }

    @Test func typographyKeepsTheNote() {
        let value = TasteEdits.typography(TasteTypography(weight: .regular, tracking: .normal, note: "Quiet"), weight: .bold, tracking: nil)
        #expect(value == .object(["weight": .string("bold"), "tracking": .string("normal"), "note": .string("Quiet")]))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mac && swift test --filter TastePanelEditsTests`
Expected: FAIL, `TasteEdits` not found.

- [ ] **Step 3: Implement `TasteEdits`**

```swift
// TasteEdits.swift
import ShelfCore

enum TasteEdits {
    static func palette(setting role: TasteColorRole, to hex: String, in colors: [TasteColor]) -> JSONValue {
        var next = colors
        if let index = next.firstIndex(where: { $0.role == role }) {
            next[index].hex = hex
        } else if next.count < 6 {
            next.append(TasteColor(hex: hex, role: role))
        }
        return .array(next.map { .object(["hex": .string($0.hex), "role": .string($0.role.rawValue)]) })
    }

    static func adding(_ text: String, to items: [String], limit: Int, maxLength: Int) -> [String]? {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\n", with: " ")
        guard !clean.isEmpty, clean.count <= maxLength, items.count < limit,
              !items.contains(where: { $0.caseInsensitiveCompare(clean) == .orderedSame }) else { return nil }
        return items + [clean]
    }

    static func removing(_ text: String, from items: [String]) -> [String] { items.filter { $0 != text } }

    static func jsonStrings(_ items: [String]) -> JSONValue { .array(items.map { .string($0) }) }

    static func typography(_ value: TasteTypography, weight: TasteWeight?, tracking: TasteTracking?) -> JSONValue {
        .object([
            "weight": .string((weight ?? value.weight).rawValue),
            "tracking": .string((tracking ?? value.tracking).rawValue),
            "note": .string(value.note),
        ])
    }
}
```

- [ ] **Step 4: Implement the panels.** Shared chrome (`TastePanelChrome`): a view taking `tile`, `model`, and `@ViewBuilder content`, rendering **‹ Back to your taste** (quiet `OrionButtonStyle`), the title (`.title3.weight(.semibold)`), the explanation sentence (`.callout`, `.secondary`; per tile see below), the content, a "Why Orion chose this" box when a reason exists (`.fill.tertiary` rounded rect, `.caption`), and a footer with **Done** (`OrionButtonStyle(.primary)`, calls `model.closePanel()`) and **Let Orion decide again** (`.secondary`; calls `await model.store.resetTile(tile)` then shows toast "Orion will look again after your next saves."). Everything lives in a `ScrollView`. All edits go through `await model.store.save(tile, to: value)`.

Plain-English explanation sentences (exact copy):
- designLanguage: "The overall mood of your screens. Pick the words that sound like you."
- colors: "The few colours you keep coming back to. Orion uses them for backgrounds, text and buttons."
- typography: "How heavy and how tight your lettering is. Heavier feels bold and confident; lighter feels quiet."
- density: "How much is on screen at once. Airy feels calm and premium. Packed feels powerful and busy."
- spacing: "Breathing room between things. Tight feels efficient; generous feels relaxed."
- layoutHabits: "The way you like screens arranged. Orion follows these when it designs."
- signatureDetails: "Small touches you repeat, like a full-width black button."
- avoid: "Things Orion should never do. Add anything that makes you wince."

`MiniScreen` (picture used by Density, Spacing, Typography): a white rounded rectangle of fixed 64pt height containing 2–7 grey bars whose count and gaps come from a `MiniScreen.Kind` (`.density(DensityChoice)`, `.spacing(TasteSpacing)`, `.weight(TasteWeight)`), drawn with `RoundedRectangle` + `VStack(spacing:)` and `OrionRadius` tokens. Weight kind draws the letters "Aa" in that weight instead of bars.

Panel specifics:
- **DensityPanel:** three `PictureChoice` buttons (`MiniScreen(.density(choice))` + label `choice.title`), the selected one outlined (`.strokeBorder(.primary, lineWidth: 2)`); selecting writes `.string(choice.stored.rawValue)`. Under them two quiet buttons "A bit more room" / "A bit tighter" writing `DensityChoice.nudge(...)`.
- **SpacingPanel:** three `PictureChoice`s for tight/comfortable/generous.
- **TypographyPanel:** weight row (light/regular/bold/heavy as "Aa" pictures) and tracking row (loose/normal/tight as three-word samples with `.tracking`); writes `TasteEdits.typography`. When `appleRules` is on and the stored weight is `.light`, show a caption: "Apple rules use Regular instead of Light on iPhone and Mac screens."
- **ColourPanel:** a row of swatches (`Circle`/rounded square filled with `Color(hexString:)`, role label under each, the accent badged "accent"); selecting one reveals a native `ColorPicker("", selection:)` bound through a `Binding<Color>` that on change converts to `#rrggbb` via a `Color.hexString` helper (add to `Color+Hex.swift` with a test) and saves `TasteEdits.palette(setting:to:in:)`. Quick starts (chips): "Black & white" → `[#ffffff base, #111111 text, #111111 action]`, "Warm neutrals" → `[#faf6f0 base, #2b2118 text, #2b2118 action, #c8553d accent]`, "Soft pastels" → `[#fbf7ff base, #2a2540 text, #6c5ce7 action, #ff8fab accent]`. (Plan 3 adds "Pull from an image…".)
- **ListPanel** (design language, layout habits, signature details, avoid): each current item as a row card with a trailing remove (✕) button; below, a text field "Add one…" with a `+` that calls `TasteEdits.adding` (limits: designLanguage 4 / 24 chars lowercase, layoutHabits 5 / 80, signatureDetails 6 / 60, avoid 12 / 80). For **avoid** the stored items are `{text, source}` objects, so the panel adds `{"text": t, "source": "typed"}` and removes by `text`. Suggestion chips ("Ideas people like you often keep") use this fixed list per tile, dashed border, tap to add:
  - designLanguage: minimal, warm, playful, bold-type
  - layoutHabits: "Sticky bottom button", "Big hero number", "Cards in a row", "Sidebar plus one column"
  - signatureDetails: "Pill buttons", "Soft shadows", "Rounded inputs", "Full-width primary button"
  - avoid: "gradients", "drop shadows", "thin type", "stock photos"

  Empty and limit states: when full, the field is disabled with caption "You've reached the limit. Remove one to add another."

`TasteEditPanel` switches on `tile` to the right panel. A Back click or Esc calls `model.closePanel()`.

- [ ] **Step 5: Run tests and build**

Run: `cd apps/mac && swift build && swift test`
Expected: PASS.

- [ ] **Step 6: Look at it.** `bash apps/mac/scripts/preview.sh` → Taste → open Density: the three mini-screens, the selection outline, and the sample reflowing as you pick. Check each of the eight tiles opens its own panel, edits appear in the chapter row summary after Back, and Esc returns.

- [ ] **Step 7: Commit**

```bash
git add apps/mac
git commit -m "feat(mac): Taste edit panels with picture controls

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Apple rules switch, pending-card strip, empty states, and final check

**Files:**
- Modify: `Sources/Orion/Taste/TasteChapterList.swift`
- Create: `Sources/Orion/Taste/AppleRulesRow.swift`, `Sources/Orion/Taste/PendingCardsStrip.swift`
- Test: extend `TasteStoreTests` only if a gap shows; the logic is already covered. Visual checks below.

**Interfaces:**
- Consumes: `TasteStore.setAppleRules`, `TasteStore.decide`, `TasteStore.snapshot?.pending`, `TasteModel.previewCardID`.

- [ ] **Step 1: Apple rules row.** Below the four chapters add a fifth block titled **Apple design rules** (same header style). It contains a `Toggle("Follow Apple's design rules", isOn: Binding(get: { snapshot.appleRules }, set: { value in Task { await model.store.setAppleRules(value) } }))` (disabled when `!canEdit`), the caption "For screens Orion designs for iPhone, iPad and Mac apps. Your taste decides the look; these rules protect usability.", and a collapsed `DisclosureGroup("What the rules say")` listing, in plain language: "Buttons are at least 44 pt tall", "Body text is 17 pt on iPhone and 13 pt on Mac, never below 11 pt", "No Thin or Light type", "At most two typefaces", "Most important things go top and leading", "Controls look different from content, and colours work in Light and Dark".

- [ ] **Step 2: Pending cards strip.** The web screen shows "Keep it / Not me" cards from Orion's learning. Above the chapters, when `snapshot.pending` is non-empty, show a compact tray titled "Orion noticed N things": one row per card with the plain headline (build it in Swift as `"<Tile title> · <op verb> <value text>"`, e.g. "Density · set to Dense", "Layout habits · add Sidebar plus one column"; put this pure function in `ShelfCore/Taste/TasteCardText.swift` with a test), the `reason` in `.caption`/`.secondary`, and **Keep** (primary) / **Remove** (secondary) buttons calling `model.store.decide(card, .kept / .rejected)`. Hovering a row sets `model.previewCardID` so the sample previews it (`.onHover`); leaving clears it. Plan 3 reuses this strip for composer cards.

Test for the headline function:

```swift
// TasteCardTextTests.swift
@Test func headlinesAreReadable() {
    #expect(TasteCardText.headline(TasteCard(id: "1", tile: .density, op: "set", value: .string("dense"), reason: "", evidenceItemIds: [])) == "Density · set to Dense")
    #expect(TasteCardText.headline(TasteCard(id: "2", tile: .layoutHabits, op: "add", value: .string("Sidebar plus one column"), reason: "", evidenceItemIds: [])) == "Layout habits · add “Sidebar plus one column”")
    #expect(TasteCardText.headline(TasteCard(id: "3", tile: .avoid, op: "add", value: .object(["text": .string("gradients"), "source": .string("typed")]), reason: "", evidenceItemIds: [])) == "You avoid · add “gradients”")
    #expect(TasteCardText.headline(TasteCard(id: "4", tile: .colors, op: "add", value: .object(["hex": .string("#ff5a36"), "role": .string("accent")]), reason: "", evidenceItemIds: [])) == "Colour · add accent #ff5a36")
}
```

Implement `TasteCardText.headline(_:)` to satisfy it (set → `set to <Capitalised>`; add/remove with string → `add “text”`; avoid object → its `text`; colour object → `add <role> <hex>`; typography object → `set to <weight>, <tracking> tracking`; fallback `<Title> · changed`).

- [ ] **Step 3: Empty and error states.** `.learning` already shows "Orion is still learning". For `.needsConnect` with no cache, reuse `InspirationStateView(kind: .connecting)`. For a web-only failure (key missing server-side) the API returns `unavailable`; the store goes `.offline`, and with no cache the screen shows `ContentUnavailableView("Taste isn't available right now", systemImage: "exclamationmark.triangle")`. Add that case to `TasteScreen.content` for `.offline where snapshot == nil`.

- [ ] **Step 4: Full verification**

Run: `cd apps/mac && swift build && swift test` then `cd ../.. && pnpm --filter web test`
Expected: all PASS.
Run `bash apps/mac/scripts/preview.sh` and walk through: open each of the eight tiles and change something; toggle Apple rules off and on; break the network (turn Wi-Fi off) and confirm the Offline banner and disabled rows; confirm a pending card previews on hover and Keep/Remove removes it. Take one screenshot of the chapter list and one of the Density panel to `.context/`.

- [ ] **Step 5: Update docs and commit**

Add one line to `apps/mac/README.md` under the existing "native" notes: "Taste is native: four plain-English chapters, a live sample, and picture-based editing." and note in `docs/superpowers/specs/2026-11-10-native-taste-design.md` B3 that "Let Orion decide again" clears the tile lock now and the next normal refresh may suggest again.

```bash
git add apps/mac docs
git commit -m "feat(mac): Apple rules switch and pending cards on the Taste screen

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Native SwiftUI Taste screen replacing the web frame | 6 |
| Four plain-English chapters, one-line explanations | 4, 6 |
| Sticky live sample, restyles with the board and previews cards | 4, 6, 8 |
| Panel swap with Back, no new page | 6, 7 |
| Pictures for density/spacing/typography; swatches, quick starts for colour | 7 |
| Add/remove/describe lists with suggestions | 7 |
| Density 3 pictures → 5 stored values with nudges | 4, 7 |
| Edits use version check; conflict message | 2, 3 |
| Let Orion decide again | 5, 7 |
| Apple rules switch, with the rules listed | 8 |
| Existing learning cards in the new UI | 8 |
| Offline read-only with banner | 3, 6 |
| Errors (key missing, unauthorised) | 3, 8 |

**Not in this plan (Plan 3):** the composer, files/links/words reading, composer cards, "Make it feel like Apple" quick start, "Pull from an image…", the plain-words box in each panel, "Also save images to Inspiration".

**Known deviation:** "Let Orion decide again" clears the tile lock only; it does not force an immediate rethink (the refresh job's save-count rules are unchanged).
