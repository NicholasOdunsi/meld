import Observation
import ShelfCore

@MainActor
@Observable
final class TasteModel {
    let store: TasteStore
    var openSlot: TasteSlot?
    var isPreviewing = false
    var previewCardID: String?
    var toast: String?

    init(store: TasteStore) {
        self.store = store
    }

    /// The board with the hovered pending card applied, for the preview. Never saved.
    var sampleBoard: TasteBoard? {
        let card = store.snapshot?.pending.first { $0.id == previewCardID }
        return store.preview(card)
    }

    func open(_ slot: TasteSlot) {
        guard store.canEdit || slot == .craft else { return }
        openSlot = slot
    }

    func closePanel() { openSlot = nil }
}
