import ShelfCore
import SwiftUI

/// Shared bits of the sentence styling.
enum TasteSentence {
    static let choiceGray = Color(white: 0.58)

    /// The words on the Yes button: the new word when a choice is changing.
    static func yesLabel(for segments: [TasteDocSegment]) -> String {
        for segment in segments {
            if case .changed(_, _, let new) = segment { return String(localized: "Yes, \(new)") }
        }
        return String(localized: "Yes")
    }
}
