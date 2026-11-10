import Foundation

/// A place on the Taste board (or the mood line). Several stored tiles can feed one slot.
public enum TasteSlot: String, CaseIterable, Sendable, Identifiable {
    case motion, lettering, shape, space, voice, avoid, craft, mood

    public var id: String { rawValue }

    /// The seven tiles and strips shown in the grid, in order.
    public static let boardSlots: [TasteSlot] = [.motion, .lettering, .shape, .space, .voice, .avoid, .craft]

    public var tiles: [TasteTile] {
        switch self {
        case .motion: [.motion]
        case .lettering: [.typography]
        case .shape: [.shape, .signatureDetails]
        case .space: [.density, .spacing, .layoutHabits]
        case .voice: [.voice]
        case .avoid: [.avoid]
        case .craft: []
        case .mood: [.designLanguage]
        }
    }

    /// The tile the panel's plain-words box talks to.
    public var primaryTile: TasteTile? { tiles.first }

    /// Colour has no slot: it is not shown in the Mac app.
    public static func slot(for tile: TasteTile) -> TasteSlot? {
        switch tile {
        case .colors: nil
        case .designLanguage: .mood
        case .typography: .lettering
        case .motion: .motion
        case .shape, .signatureDetails: .shape
        case .density, .spacing, .layoutHabits: .space
        case .voice: .voice
        case .avoid: .avoid
        }
    }

    public var title: String {
        switch self {
        case .motion: String(localized: "Motion & feel")
        case .lettering: String(localized: "Lettering")
        case .shape: String(localized: "Shape")
        case .space: String(localized: "Space")
        case .voice: String(localized: "Voice")
        case .avoid: String(localized: "Steer clear of")
        case .craft: String(localized: "Craft rules")
        case .mood: String(localized: "Mood")
        }
    }

    public var explanation: String {
        switch self {
        case .motion: String(localized: "How quickly things move, and how much. Pick by watching.")
        case .lettering: String(localized: "How heavy and how tight your lettering is. Heavier feels bold and confident; lighter feels quiet.")
        case .shape: String(localized: "How rounded things are, whether depth comes from shadows or thin lines, and the small touches you repeat.")
        case .space: String(localized: "How much is on screen at once, the breathing room between things, and how you like screens arranged.")
        case .voice: String(localized: "How labels and messages sound. Errors always stay calm and plain.")
        case .avoid: String(localized: "Things Orion should never do. Add anything that makes you wince.")
        case .craft: String(localized: "What Orion always does, whatever your taste says. Your taste decides the look; these protect how it feels to use.")
        case .mood: String(localized: "The overall mood of your screens. Pick the words that sound like you.")
        }
    }
}

public extension TasteTile {
    var displayName: String {
        switch self {
        case .designLanguage: String(localized: "Design language")
        case .colors: String(localized: "Colour")
        case .typography: String(localized: "Typography")
        case .spacing: String(localized: "Spacing")
        case .density: String(localized: "Density")
        case .layoutHabits: String(localized: "Layout habits")
        case .signatureDetails: String(localized: "Signature details")
        case .avoid: String(localized: "You avoid")
        case .motion: String(localized: "Motion")
        case .shape: String(localized: "Shape")
        case .voice: String(localized: "Voice")
        }
    }
}
