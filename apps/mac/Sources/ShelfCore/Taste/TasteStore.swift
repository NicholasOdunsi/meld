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
