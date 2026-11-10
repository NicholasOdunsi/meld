import Foundation
import ShelfCore

enum TastePanelRequests {
    static func words(_ text: String, tile: TasteTile) -> TasteComposeRequest? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= ComposerDraft.maxWords else { return nil }
        return TasteComposeRequest(words: trimmed, tile: tile)
    }
}
