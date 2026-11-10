import Foundation
import Observation

/// Everything the Inspiration wall shows and changes. Edits are applied at
/// once and undone if Orion refuses.
@MainActor
@Observable
public final class LibraryStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded, offline, needsConnect
    }

    public private(set) var items: [LibraryItem] = []
    public private(set) var phase: Phase = .idle
    public private(set) var hasMore = false
    public private(set) var errorMessage: String?

    @ObservationIgnored public var onUnauthorized: (@MainActor () -> Void)?
    @ObservationIgnored private let client: @MainActor () -> any OrionClient
    @ObservationIgnored private let token: @MainActor () -> String?
    @ObservationIgnored private let cache: LibraryCache
    @ObservationIgnored private var nextOffset: Int?
    @ObservationIgnored private var isLoadingMore = false

    public init(client: @escaping @MainActor () -> any OrionClient, token: @escaping @MainActor () -> String?, cache: LibraryCache) {
        self.client = client
        self.token = token
        self.cache = cache
    }

    public var canEdit: Bool { phase == .loaded }

    public func clearError() {
        errorMessage = nil
    }

    public func reload() async {
        guard let token = token() else {
            phase = .needsConnect
            if items.isEmpty { items = cache.load() }
            return
        }
        if items.isEmpty { phase = .loading }
        do {
            let page = try await client().library(offset: 0, token: token)
            items = page.items
            nextOffset = page.nextOffset
            hasMore = page.nextOffset != nil
            phase = .loaded
            try? cache.save(items)
        } catch {
            handleLoadFailure(error)
        }
    }

    public func loadMore() async {
        guard phase == .loaded, let offset = nextOffset, !isLoadingMore, let token = token() else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await client().library(offset: offset, token: token)
            let known = Set(items.map(\.id))
            items += page.items.filter { !known.contains($0.id) }
            nextOffset = page.nextOffset
            hasMore = page.nextOffset != nil
        } catch {
            handleLoadFailure(error)
        }
    }

    @discardableResult
    public func updateNote(_ id: UUID, to note: String?) async -> Bool {
        guard canEdit, let token = token(), let index = items.firstIndex(where: { $0.id == id }) else { return false }
        let previous = items[index]
        let trimmed = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleaned = (trimmed?.isEmpty ?? true) ? nil : trimmed.map { String($0.prefix(500)) }
        items[index].note = cleaned
        do {
            let saved = try await client().updateNote(itemID: id, note: cleaned, token: token)
            if let current = items.firstIndex(where: { $0.id == id }) { items[current] = saved }
            try? cache.save(items)
            return true
        } catch {
            if let current = items.firstIndex(where: { $0.id == id }) { items[current] = previous }
            fail(error, String(localized: "Your note wasn't saved."))
            return false
        }
    }

    @discardableResult
    public func delete(_ ids: Set<UUID>) async -> Bool {
        guard canEdit, !ids.isEmpty, let token = token() else { return false }
        let previous = items
        items.removeAll { ids.contains($0.id) }
        do {
            _ = try await client().deleteItems(Array(ids), token: token)
            try? cache.save(items)
            return true
        } catch {
            items = previous
            fail(error, String(localized: "Those images weren't deleted."))
            return false
        }
    }

    @discardableResult
    public func addToRoom(_ ids: Set<UUID>, room: ShelfRoom) async -> Bool {
        guard canEdit, !ids.isEmpty, let token = token() else { return false }
        do {
            _ = try await client().addItems(Array(ids), toRoom: room.roomId, token: token)
            for index in items.indices where ids.contains(items[index].id) && !items[index].rooms.contains(room) {
                items[index].rooms.append(room)
            }
            try? cache.save(items)
            return true
        } catch {
            fail(error, String(localized: "Those images weren't added to the chat."))
            return false
        }
    }

    public func rooms() async -> [ShelfRoom] {
        guard let token = token() else { return [] }
        return (try? await client().rooms(token: token)) ?? []
    }

    private func handleLoadFailure(_ error: any Error) {
        if (error as? ShelfAPIError)?.code == .unauthorized {
            phase = .needsConnect
            onUnauthorized?()
            return
        }
        if items.isEmpty { items = cache.load() }
        phase = .offline
    }

    private func fail(_ error: any Error, _ what: String) {
        if (error as? ShelfAPIError)?.code == .unauthorized {
            phase = .needsConnect
            onUnauthorized?()
        }
        let reason = (error as? ShelfAPIError)?.message ?? String(localized: "Orion couldn't be reached.")
        errorMessage = "\(what) \(reason)"
    }
}
