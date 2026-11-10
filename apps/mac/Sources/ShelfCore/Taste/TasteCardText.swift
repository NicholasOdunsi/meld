import Foundation

/// Plain-English headlines for pending taste cards ("Density · set to Dense").
public enum TasteCardText {
    private static let openQuote = "\u{201C}"
    private static let closeQuote = "\u{201D}"

    public static func headline(_ card: TasteCard) -> String {
        let title = card.tile.displayName
        guard let detail = detail(for: card) else { return "\(title) · changed" }
        return "\(title) · \(detail)"
    }

    private static func detail(for card: TasteCard) -> String? {
        switch (card.op, card.value) {
        case ("set", .string(let text)):
            return "set to \(text.capitalized)"
        case ("add", .string(let text)), ("remove", .string(let text)):
            return "\(card.op) \(quoted(text))"
        case let (op, .object(fields)) where ["add", "remove", "set"].contains(op):
            if case .string(let text)? = fields["text"] {
                return "\(op) \(quoted(text))"
            }
            if case .string(let role)? = fields["role"], case .string(let hex)? = fields["hex"] {
                return "\(op) \(role) \(hex)"
            }
            if case .string(let weight)? = fields["weight"], case .string(let tracking)? = fields["tracking"] {
                return "set to \(weight.capitalized), \(tracking) tracking"
            }
            if case .string(let corners)? = fields["corners"], case .string(let depth)? = fields["depth"] {
                return "set to \(corners.capitalized), \(depth.capitalized)"
            }
            if case .string(let tone)? = fields["tone"] {
                return "set to \(tone.capitalized)"
            }
            return nil
        default:
            return nil
        }
    }

    private static func quoted(_ text: String) -> String {
        "\(openQuote)\(text)\(closeQuote)"
    }
}
