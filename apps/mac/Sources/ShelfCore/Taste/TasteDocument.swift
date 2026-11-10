import Foundation

/// One tappable choice inside a sentence of the Taste document.
public enum TasteChoiceID: String, CaseIterable, Sendable, Hashable {
    case motion, weight, tracking, corners, depth, density, spacing, tone

    /// The stored tile this choice edits.
    public var tile: TasteTile {
        switch self {
        case .motion: .motion
        case .weight, .tracking: .typography
        case .corners, .depth: .shape
        case .density: .density
        case .spacing: .spacing
        case .tone: .voice
        }
    }

    /// The document section this choice lives in.
    public var slot: TasteSlot {
        switch self {
        case .motion: .motion
        case .weight, .tracking: .lettering
        case .corners, .depth: .shape
        case .density, .spacing: .space
        case .tone: .voice
        }
    }

    /// The stored value as plain text (for example "airy").
    public func value(in board: TasteBoard) -> String {
        switch self {
        case .motion: board.motion.rawValue
        case .weight: board.typography.weight.rawValue
        case .tracking: board.typography.tracking.rawValue
        case .corners: board.shape.corners.rawValue
        case .depth: board.shape.depth.rawValue
        case .density: board.density.rawValue
        case .spacing: board.spacing.rawValue
        case .tone: board.voice.tone.rawValue
        }
    }

    /// The word shown in the sentence for a stored value.
    public func word(for value: String) -> String {
        if self == .depth {
            switch value {
            case "hairlines": return "thin lines"
            case "flat": return "nothing"
            default: return value
            }
        }
        return value
    }

    public var options: [TasteChoiceOption] {
        func option(_ value: String, _ title: String.LocalizationValue, _ meaning: String.LocalizationValue) -> TasteChoiceOption {
            TasteChoiceOption(value: value, title: String(localized: title), meaning: String(localized: meaning))
        }
        switch self {
        case .motion:
            return TasteMotion.allCases.map { motion in
                let spec = TasteMotionSpec(motion)
                return TasteChoiceOption(value: motion.rawValue, title: spec.title, meaning: spec.meaning)
            }
        case .weight:
            return [option("light", "Light", "Quiet and delicate"), option("regular", "Regular", "Plain and even"),
                    option("bold", "Bold", "Confident"), option("heavy", "Heavy", "Loud and strong")]
        case .tracking:
            return [option("loose", "Loose", "Airy, open letters"), option("normal", "Normal", "Everyday spacing"),
                    option("tight", "Tight", "Compact and modern")]
        case .corners:
            return [option("sharp", "Sharp", "Square edges"), option("soft", "Soft", "Gently rounded"),
                    option("round", "Round", "Very rounded")]
        case .depth:
            return [option("shadows", "Shadows", "Soft shadows lift things"), option("hairlines", "Thin lines", "Hairline borders, no shadows"),
                    option("flat", "Flat", "No shadows or lines")]
        case .density:
            return [option("airy", "Airy", "Lots of empty space"), option("light", "Light", "Roomy"),
                    option("balanced", "Balanced", "A comfortable middle"), option("compact", "Compact", "Tight and efficient"),
                    option("dense", "Dense", "A lot on screen at once")]
        case .spacing:
            return [option("tight", "Tight", "Things sit close together"), option("comfortable", "Comfortable", "An easy middle"),
                    option("generous", "Generous", "Plenty of breathing room")]
        case .tone:
            return TasteVoiceTone.allCases.map {
                TasteChoiceOption(value: $0.rawValue, title: $0.title, meaning: TasteVoiceExamples.successLine(for: $0))
            }
        }
    }

    /// The board with this choice set to `value`, or nil when the value is not one of the options.
    public func applying(_ value: String, to board: TasteBoard) -> TasteBoard? {
        guard options.contains(where: { $0.value == value }) else { return nil }
        switch self {
        case .motion: return board.setting(.motion, to: .string(value))
        case .density: return board.setting(.density, to: .string(value))
        case .spacing: return board.setting(.spacing, to: .string(value))
        case .weight, .tracking:
            let type = board.typography
            return board.setting(.typography, to: .object([
                "weight": .string(self == .weight ? value : type.weight.rawValue),
                "tracking": .string(self == .tracking ? value : type.tracking.rawValue),
                "note": .string(type.note),
            ]))
        case .corners, .depth:
            return board.setting(.shape, to: .object([
                "corners": .string(self == .corners ? value : board.shape.corners.rawValue),
                "depth": .string(self == .depth ? value : board.shape.depth.rawValue),
            ]))
        case .tone:
            return board.setting(.voice, to: .object(["tone": .string(value), "note": .string(board.voice.note)]))
        }
    }
}

public struct TasteChoiceOption: Equatable, Sendable, Identifiable {
    public let value: String
    public let title: String
    public let meaning: String
    public var id: String { value }
}

public enum TasteDocSegment: Equatable, Sendable {
    case text(String)
    case choice(TasteChoiceID, String)
    /// A pending change: the old word is struck through, the new one is highlighted.
    case changed(TasteChoiceID, old: String, new: String)
}

public enum TasteSpecimen: Sendable, Equatable { case motion, lettering, shape, room, voice, none }

public struct TasteDocSection: Equatable, Sendable, Identifiable {
    public let slot: TasteSlot
    public let label: String
    public let segments: [TasteDocSegment]
    public let specimen: TasteSpecimen
    public let note: String?
    public var id: TasteSlot { slot }
}

/// The Taste screen as a page of plain sentences. Pure: a board in, sections out.
public enum TasteDocument {
    public static func headline(_ board: TasteBoard) -> String {
        let motion: String = switch board.motion {
        case .instant: "Instant"
        case .snappy: "Quick"
        case .smooth: "Calm"
        case .playful: "Playful"
        }
        let lettering: String = switch board.typography.weight {
        case .light: "light"
        case .regular: "clear"
        case .bold: "bold"
        case .heavy: "heavy"
        }
        let voice: String = switch board.voice.tone {
        case .plain: "plain-spoken"
        case .warm: "warm"
        case .formal: "formal"
        case .playful: "light-hearted"
        }
        return "\(motion), \(lettering) and \(voice)."
    }

    /// `previewing`: the board with a pending suggestion applied. Choices that differ become `.changed`.
    public static func sections(for board: TasteBoard, previewing preview: TasteBoard? = nil) -> [TasteDocSection] {
        func make(_ slot: TasteSlot, _ label: String.LocalizationValue, _ specimen: TasteSpecimen, note: String? = nil) -> TasteDocSection {
            let base = segments(slot, board)
            let shown = preview.map { merge(base, segments(slot, $0)) } ?? base
            return TasteDocSection(slot: slot, label: String(localized: label), segments: shown, specimen: specimen, note: note)
        }
        return [
            make(.motion, "How it moves", .motion),
            make(.lettering, "How it's lettered", .lettering),
            make(.shape, "How it's shaped", .shape, note: often(board.signatureDetails)),
            make(.space, "How much room", .room, note: often(board.layoutHabits)),
            make(.voice, "How it sounds", .voice),
            make(.avoid, "Steer clear of", .none),
        ]
    }

    private static func often(_ items: [String]) -> String? {
        items.isEmpty ? nil : "You often use: \(items.joined(separator: ", "))."
    }

    private static func merge(_ base: [TasteDocSegment], _ preview: [TasteDocSegment]) -> [TasteDocSegment] {
        guard base.count == preview.count else { return preview }
        return zip(base, preview).map { old, new in
            if case .choice(let id, let oldWord) = old, case .choice(_, let newWord) = new, oldWord != newWord {
                return .changed(id, old: oldWord, new: newWord)
            }
            return new
        }
    }

    private static func choice(_ id: TasteChoiceID, _ board: TasteBoard) -> TasteDocSegment {
        .choice(id, id.word(for: id.value(in: board)))
    }

    private static func segments(_ slot: TasteSlot, _ board: TasteBoard) -> [TasteDocSegment] {
        switch slot {
        case .motion:
            let tail: String = switch board.motion {
            case .instant: ": nothing moves, it just appears."
            case .snappy: ": quick, with no bounce, about a tenth of a second."
            case .smooth: ": calm and soft, about a third of a second."
            case .playful: ": with a little overshoot, about half a second."
            }
            return [.text(board.motion == .instant ? "Everything is " : "Everything moves "), choice(.motion, board), .text(tail)]
        case .lettering:
            return [.text("Headings are "), choice(.weight, board), .text(" with "), choice(.tracking, board),
                    .text(" spacing between the letters. Numbers always line up.")]
        case .shape:
            let tail: String = switch board.shape.depth {
            case .shadows: ", not lines."
            case .hairlines: ", not shadows."
            case .flat: ": everything is flat."
            }
            return [.text("Corners are "), choice(.corners, board), .text(". Depth comes from "), choice(.depth, board), .text(tail)]
        case .space:
            return [.text("Screens feel "), choice(.density, board), .text(", with "), choice(.spacing, board), .text(" gaps between things.")]
        case .voice:
            return [.text("Words are "), choice(.tone, board), .text(". Errors always stay calm.")]
        case .avoid:
            let names = board.avoid.map(\.text)
            if names.isEmpty { return [.text("Nothing to steer clear of yet.")] }
            let shown = Array(names.prefix(4))
            let rest = names.count - shown.count
            let list: String
            if rest > 0 {
                list = shown.joined(separator: ", ") + " and \(rest) more"
            } else if shown.count > 1 {
                list = shown.dropLast().joined(separator: ", ") + " and " + (shown.last ?? "")
            } else {
                list = shown.joined()
            }
            return [.text("Steer clear of \(list).")]
        case .craft, .mood:
            return []
        }
    }
}
