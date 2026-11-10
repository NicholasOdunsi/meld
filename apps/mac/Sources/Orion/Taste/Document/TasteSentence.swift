import ShelfCore
import SwiftUI

/// Turns a section's segments into one styled sentence. Choice words are grey, bold and underlined
/// (and tappable); a pending change shows the old word struck through and the new one highlighted.
enum TasteSentence {
    static let choiceGray = Color(white: 0.58)
    private static let scheme = "orion-taste"

    static func url(for choice: TasteChoiceID) -> URL? { URL(string: "\(scheme)://choice/\(choice.rawValue)") }

    static func choice(from url: URL) -> TasteChoiceID? {
        guard url.scheme == scheme else { return nil }
        return TasteChoiceID(rawValue: url.lastPathComponent)
    }

    static func attributed(_ segments: [TasteDocSegment], editable: Bool) -> AttributedString {
        var out = AttributedString()
        for segment in segments {
            switch segment {
            case .text(let text):
                out += AttributedString(text)
            case .choice(let id, let word):
                var piece = AttributedString(word)
                piece.font = .system(size: 26, weight: .bold)
                piece.foregroundColor = choiceGray
                piece.underlineStyle = .single
                if editable { piece.link = url(for: id) }
                out += piece
            case .changed(_, let old, let new):
                var struck = AttributedString(old)
                struck.strikethroughStyle = .single
                struck.foregroundColor = Color(white: 0.4)
                var fresh = AttributedString(new)
                fresh.font = .system(size: 26, weight: .bold)
                fresh.foregroundColor = .white
                fresh.backgroundColor = Color.white.opacity(0.14)
                out += struck + AttributedString(" ") + fresh
            }
        }
        return out
    }

    /// The word on the Yes button: the new word when a choice is changing.
    static func yesLabel(for segments: [TasteDocSegment]) -> String {
        for segment in segments {
            if case .changed(_, _, let new) = segment { return String(localized: "Yes, \(new)") }
        }
        return String(localized: "Yes")
    }
}
