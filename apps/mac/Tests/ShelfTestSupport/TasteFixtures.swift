import Foundation
import ShelfCore

/// Shared board/snapshot fixtures for ShelfCore and Orion taste tests.
public enum TasteFixtures {
    public static let boardJSON = """
    {"designLanguage":["minimal"],"colors":[{"hex":"#ffffff","role":"base"},{"hex":"#ff5a36","role":"accent"}],
     "typography":{"weight":"regular","tracking":"normal","note":""},"spacing":"generous","density":"airy",
     "layoutHabits":["Single column forms"],"signatureDetails":[],"avoid":[{"text":"gradients","source":"typed"}]}
    """

    public static let board = try! JSONDecoder().decode(TasteBoard.self, from: Data(boardJSON.utf8))

    public static func snapshot(version: Int = 3, pending: [TasteCard] = []) -> TasteSnapshot {
        TasteSnapshot(board: board, version: version, pending: pending)
    }
}
