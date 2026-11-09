import Foundation

/// Words for the Overview header: the learning quote, and what the hat says.
enum OverviewGreeting {
    static let quote = String(
        localized: "Many things moving. One thing in your hands."
    )

    static let attribution = String(localized: "Orion")

    /// "Morning, Nicholas." — by local hour; no name if we don't know it.
    static func salutation(hour: Int, firstName: String?) -> String {
        let word = switch hour {
        case 5..<12: String(localized: "Morning")
        case 12..<17: String(localized: "Afternoon")
        case 17..<22: String(localized: "Evening")
        default: String(localized: "Hello")
        }
        guard let firstName else { return "\(word)." }
        return String(localized: "\(word), \(firstName).")
    }

    /// The given name, however the Mac account orders it ("Odunsi Nicholas" → "Nicholas").
    static func firstName(from fullName: String) -> String? {
        let trimmed = fullName.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        let given = PersonNameComponentsFormatter().personNameComponents(from: trimmed)?.givenName
        return given ?? trimmed.split(separator: " ").first.map(String.init)
    }

    /// One sentence about the three lists, done first, then going, then waiting.
    static func summary(todo: Int, inProgress: Int, completed: Int) -> String {
        var parts: [String] = []
        if completed > 0 { parts.append(completed == 1 ? "1 thing is done" : "\(completed) things are done") }
        if inProgress > 0 {
            let lead = parts.isEmpty
            parts.append(inProgress == 1
                ? (lead ? "1 thing is still going" : "1 is still going")
                : (lead ? "\(inProgress) things are still going" : "\(inProgress) are still going"))
        }
        if todo > 0 {
            let lead = parts.isEmpty
            parts.append(todo == 1
                ? (lead ? "1 thing is waiting on your list" : "1 is waiting on your list")
                : (lead ? "\(todo) things are waiting on your list" : "\(todo) are waiting on your list"))
        }
        guard !parts.isEmpty else {
            return String(localized: "Nothing on your plate yet. Write what you want done below.")
        }
        let sentence = parts.count <= 2
            ? parts.joined(separator: " and ")
            : parts.dropLast().joined(separator: ", ") + ", and " + parts[parts.count - 1]
        return sentence.prefix(1).uppercased() + sentence.dropFirst() + "."
    }
}
