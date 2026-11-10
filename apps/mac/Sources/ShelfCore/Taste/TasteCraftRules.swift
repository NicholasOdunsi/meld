import Foundation

public enum TasteCraftGroup: String, CaseIterable, Sendable {
    case motion, typeAndSurfaces, touch, words
    public var title: String {
        switch self {
        case .motion: String(localized: "Motion")
        case .typeAndSurfaces: String(localized: "Type and surfaces")
        case .touch: String(localized: "Touch")
        case .words: String(localized: "Words")
        }
    }
}

public struct TasteCraftRule: Equatable, Sendable, Identifiable {
    public let id: String
    public let group: TasteCraftGroup
    public let title: String
    public let reason: String
}

/// The eight rules Orion always follows (spec Part A). Read-only.
public enum TasteCraftRules {
    public static let all: [TasteCraftRule] = [
        rule("press", .motion, "Pressing a button scales it to 0.96", "So buttons feel pressed. Never on disabled controls."),
        rule("exit", .motion, "Things leave faster and smaller than they arrive", "Exits take 150 ms and move 12 pt; entrances take longer."),
        rule("constant", .motion, "Things used constantly never animate", "Keyboard shortcuts, hovering rows and tab switches respond instantly."),
        rule("reduce", .motion, "Reduced Motion is respected", "People who ask for less motion get a fade, not movement."),
        rule("numbers", .typeAndSurfaces, "Numbers that change line up", "Tabular figures stop digits jumping as values change."),
        rule("corners", .typeAndSurfaces, "Nested rounded corners add up", "Outer radius = inner radius + padding, so curves look even."),
        rule("tap", .touch, "Tap targets are at least 44 px", "Even when the icon is small, the hit area is not."),
        rule("errors", .words, "Errors stay calm and plain", "They say how to fix it, whatever tone you picked."),
    ]

    public static func rules(in group: TasteCraftGroup) -> [TasteCraftRule] { all.filter { $0.group == group } }

    private static func rule(_ id: String, _ group: TasteCraftGroup, _ title: String.LocalizationValue, _ reason: String.LocalizationValue) -> TasteCraftRule {
        TasteCraftRule(id: id, group: group, title: String(localized: title), reason: String(localized: reason))
    }
}
