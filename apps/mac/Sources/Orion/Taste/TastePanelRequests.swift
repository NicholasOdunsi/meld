import Foundation
import ShelfCore

enum TastePanelRequests {
    static func words(_ text: String, tile: TasteTile) -> TasteComposeRequest? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= ComposerDraft.maxWords else { return nil }
        return TasteComposeRequest(words: trimmed, tile: tile)
    }

    static func apple() -> TasteComposeRequest { TasteComposeRequest(preset: .apple) }

    static func fromImage(_ id: UUID) -> TasteComposeRequest {
        TasteComposeRequest(libraryItemIDs: [id], tile: .colors)
    }
}
