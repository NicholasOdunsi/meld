import Foundation
import Observation
import OrionAppCore
import ShelfCore

/// Selection, tile size and keyboard movement for the Inspiration wall.
@MainActor
@Observable
final class InspirationModel {
    let store: LibraryStore
    let thumbnails: ThumbnailCache
    var selection: Set<UUID> = []
    var anchor: UUID?
    var tileStep: TileStep {
        didSet { defaults.set(tileStep.index, forKey: TileStep.defaultsKey) }
    }

    var isEditingNote = false

    enum Dialog: Equatable {
        case addToChat(Set<UUID>)
        case delete(Set<UUID>)
    }

    var dialog: Dialog?
    var toast: String?

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var didRefreshLinks = false

    init(store: LibraryStore, thumbnails: ThumbnailCache, defaults: UserDefaults = .standard) {
        self.store = store
        self.thumbnails = thumbnails
        self.defaults = defaults
        let saved = defaults.object(forKey: TileStep.defaultsKey) as? Int
        tileStep = TileStep(index: saved ?? TileStep.defaultIndex)
    }

    /// The images an action applies to: the right-clicked one unless it is part of the selection.
    func targets(for id: UUID?) -> Set<UUID> {
        guard let id else { return selection }
        return selection.contains(id) ? selection : [id]
    }

    var isPanelOpen: Bool { selection.count == 1 }

    var selectedItem: LibraryItem? {
        guard isPanelOpen, let id = selection.first else { return nil }
        return store.items.first { $0.id == id }
    }

    func click(_ id: UUID, command: Bool, shift: Bool) {
        let order = store.items.map(\.id)
        if shift, let anchor, let from = order.firstIndex(of: anchor), let to = order.firstIndex(of: id) {
            selection = Set(order[min(from, to)...max(from, to)])
            return
        }
        if command {
            if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
        } else {
            selection = selection == [id] ? [] : [id]
        }
        anchor = id
    }

    /// Arrow keys: with nothing (or several) selected, start at the newest image.
    func move(_ direction: WallDirection, columns: [[Int]]) {
        let order = store.items.map(\.id)
        guard !order.isEmpty else { return }
        let next: Int?
        if selection.count == 1, let id = selection.first, let current = order.firstIndex(of: id) {
            next = WallNavigation.next(from: current, direction: direction, columns: columns)
        } else {
            next = 0
        }
        guard let next, order.indices.contains(next) else { return }
        selection = [order[next]]
        anchor = order[next]
    }

    /// Signed image links expire after an hour; the first failed thumbnail
    /// reloads the list once to get fresh links before tiles show ↻.
    func thumbnailFailed() {
        guard !didRefreshLinks else { return }
        didRefreshLinks = true
        Task { await store.reload() }
    }

    func clearSelection() {
        selection = []
    }

    func selectAll() {
        selection = Set(store.items.map(\.id))
    }

    func biggerTiles() { tileStep = tileStep.bigger() }
    func smallerTiles() { tileStep = tileStep.smaller() }
}
