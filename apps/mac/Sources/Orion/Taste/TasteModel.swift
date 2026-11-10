import Observation
import ShelfCore

@MainActor
@Observable
final class TasteModel {
    let store: TasteStore
    /// Inspiration library + thumbnails for "Pull from an image…" in ColourPanel.
    let inspiration: InspirationModel?
    var openTile: TasteTile?
    var previewCardID: String?
    var toast: String?

    init(store: TasteStore, inspiration: InspirationModel? = nil) {
        self.store = store
        self.inspiration = inspiration
    }

    var sampleBoard: TasteBoard? {
        let card = store.snapshot?.pending.first { $0.id == previewCardID }
        return store.preview(card)
    }

    func open(_ tile: TasteTile) {
        guard store.canEdit else { return }
        openTile = tile
    }

    func closePanel() { openTile = nil }

    /// Compose the Apple preset and close the panel so the tray is visible.
    func composeAppleQuickStart() async {
        guard await store.compose(TastePanelRequests.apple()) else { return }
        closePanel()
    }
}
