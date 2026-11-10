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
