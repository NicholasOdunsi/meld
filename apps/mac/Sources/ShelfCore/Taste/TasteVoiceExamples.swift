import Foundation

public extension TasteVoiceTone {
    var title: String {
        switch self {
        case .plain: String(localized: "Plain")
        case .warm: String(localized: "Warm")
        case .formal: String(localized: "Formal")
        case .playful: String(localized: "Playful")
        }
    }
}

/// Example lines per tone. Fixed text, no model. Errors never change with tone.
public enum TasteVoiceExamples {
    public static func successLine(for tone: TasteVoiceTone) -> String {
        switch tone {
        case .plain: String(localized: "Saved.")
        case .warm: String(localized: "All saved. Nice work.")
        case .formal: String(localized: "Your changes have been saved.")
        case .playful: String(localized: "Boom, saved!")
        }
    }

    public static func emptyLine(for tone: TasteVoiceTone) -> String {
        switch tone {
        case .plain: String(localized: "Nothing here yet.")
        case .warm: String(localized: "Nothing here yet. Add your first one.")
        case .formal: String(localized: "There are no items to display.")
        case .playful: String(localized: "Nothing here yet. Go on, add one!")
        }
    }

    public static let errorLine = String(localized: "Couldn't save. Check your connection and try again.")
    public static let errorsStayPlain = String(localized: "Errors stay calm and plain.")
}
