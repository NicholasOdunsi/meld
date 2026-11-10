import Foundation

public struct TasteRow: Equatable, Sendable, Identifiable {
    public let tile: TasteTile
    public let title: String
    public let explanation: String
    public var id: TasteTile { tile }
}

public struct TasteChapter: Equatable, Sendable, Identifiable {
    public let title: String
    public let blurb: String
    public let rows: [TasteRow]
    public var id: String { title }
}

public enum TasteChapters {
    public static let all: [TasteChapter] = [
        TasteChapter(title: String(localized: "How it looks"), blurb: String(localized: "Your mood, palette and lettering"), rows: [
            row(.designLanguage, "Design language", "The overall mood of your screens"),
            row(.colors, "Colour", "The few colours you keep coming back to"),
            row(.typography, "Typography", "How heavy and tight your lettering is"),
        ]),
        TasteChapter(title: String(localized: "How it feels"), blurb: String(localized: "How roomy or packed screens are"), rows: [
            row(.density, "Density", "How much is on screen at once"),
            row(.spacing, "Spacing", "Breathing room between things"),
        ]),
        TasteChapter(title: String(localized: "How it's put together"), blurb: String(localized: "The patterns you reach for again and again"), rows: [
            row(.layoutHabits, "Layout habits", "How you like screens arranged"),
            row(.signatureDetails, "Signature details", "Small touches you repeat"),
        ]),
        TasteChapter(title: String(localized: "What to steer clear of"), blurb: String(localized: "Things Orion should never do"), rows: [
            row(.avoid, "You avoid", "Things Orion should never do"),
        ]),
    ]

    private static func row(_ tile: TasteTile, _ title: String.LocalizationValue, _ explanation: String.LocalizationValue) -> TasteRow {
        TasteRow(tile: tile, title: String(localized: title), explanation: String(localized: explanation))
    }

    public static func row(for tile: TasteTile) -> TasteRow {
        all.flatMap(\.rows).first { $0.tile == tile }!
    }

    public static func summary(of tile: TasteTile, in board: TasteBoard) -> String {
        switch tile {
        case .designLanguage: return board.designLanguage.prefix(2).joined(separator: " · ")
        case .colors: return "\(board.colors.count) colours"
        case .typography: return "\(board.typography.weight.rawValue.capitalized), \(board.typography.tracking.rawValue) tracking"
        case .spacing: return board.spacing.rawValue.capitalized
        case .density: return board.density.rawValue.capitalized
        case .layoutHabits: return count(board.layoutHabits.count, "habit")
        case .signatureDetails: return count(board.signatureDetails.count, "detail")
        case .avoid: return board.avoid.isEmpty ? "None yet" : board.avoid.prefix(2).map(\.text).joined(separator: " · ")
        case .motion, .shape, .voice: return ""
        }
    }

    private static func count(_ n: Int, _ noun: String) -> String {
        n == 0 ? "None yet" : "\(n) \(noun)\(n == 1 ? "" : "s")"
    }
}
