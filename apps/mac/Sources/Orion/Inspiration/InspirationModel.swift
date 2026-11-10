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
    /// Checkbox multi-select for Use in project / Delete.
    var selection: Set<UUID> = []
    /// The image open in the overlay viewer (click on a tile).
    var inspectedID: UUID?
    /// Latest masonry columns from the wall — used by overlay arrow keys.
    var columns: [[Int]] = []
    var anchor: UUID?
    var tileStep: TileStep {
        didSet { defaults.set(tileStep.index, forKey: TileStep.defaultsKey) }
    }

    var isEditingNote = false

    enum Dialog: Equatable {
        case useInProject(Set<UUID>)
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

    /// Move / Delete in the header: checked tiles, or the open image if none are checked.
    var actionTargets: Set<UUID> {
        if !selection.isEmpty { return selection }
        if let inspectedID { return [inspectedID] }
        return []
    }

    var isInspecting: Bool { inspectedID != nil }

    var inspectedItem: LibraryItem? {
        guard let inspectedID else { return nil }
        return store.items.first { $0.id == inspectedID }
    }

    var canInspectPrevious: Bool {
        guard let inspectedID, let index = store.items.firstIndex(where: { $0.id == inspectedID }) else {
            return false
        }
        return index > 0
    }

    var canInspectNext: Bool {
        guard let inspectedID, let index = store.items.firstIndex(where: { $0.id == inspectedID }) else {
            return false
        }
        return index + 1 < store.items.count
    }

    /// Plain click opens the overlay; ⌘/⇧ still multi-check without opening it.
    func click(_ id: UUID, command: Bool, shift: Bool) {
        let order = store.items.map(\.id)
        if shift, let anchor, let from = order.firstIndex(of: anchor), let to = order.firstIndex(of: id) {
            selection = Set(order[min(from, to)...max(from, to)])
            inspectedID = nil
            return
        }
        if command {
            if selection.contains(id) { selection.remove(id) } else { selection.insert(id) }
            inspectedID = nil
            anchor = id
            return
        }
        inspectedID = inspectedID == id ? nil : id
        anchor = id
    }

    func toggleChecked(_ id: UUID) {
        if selection.contains(id) {
            selection.remove(id)
        } else {
            selection.insert(id)
        }
        anchor = id
    }

    /// Arrow keys / chevrons move the open overlay image; with nothing open, start at the newest.
    /// Left/right follow the flat newest-first list so they still work when the
    /// masonry columns haven't been measured yet (or were cleared under the overlay).
    func move(_ direction: WallDirection, columns: [[Int]]) {
        let order = store.items.map(\.id)
        guard !order.isEmpty else { return }
        let next: Int?
        if let inspectedID, let current = order.firstIndex(of: inspectedID) {
            switch direction {
            case .left:
                next = current > 0 ? current - 1 : nil
            case .right:
                next = current + 1 < order.count ? current + 1 : nil
            case .up, .down:
                let layout = columns.isEmpty ? [Array(order.indices)] : columns
                next = WallNavigation.next(from: current, direction: direction, columns: layout)
            }
        } else {
            next = 0
        }
        guard let next, order.indices.contains(next) else { return }
        inspectedID = order[next]
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
        inspectedID = nil
    }

    func closeInspector() {
        inspectedID = nil
    }

    func selectAll() {
        selection = Set(store.items.map(\.id))
    }

    func biggerTiles() { tileStep = tileStep.bigger() }
    func smallerTiles() { tileStep = tileStep.smaller() }
}
