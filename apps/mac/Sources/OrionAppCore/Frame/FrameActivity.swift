import Foundation

/// A project's or tab's live AI state, as the web page last reported it.
/// Idle is never sent, so absence means idle.
public struct FrameActivity: Equatable, Sendable {
    public enum State: String, Sendable {
        case working
        case needsYou = "needs_you"
    }

    public let id: String
    public let state: State
    /// Ready-to-show tooltip / accessibility text, e.g. "Mark needs you · Write the PRD?".
    public let label: String

    public init(id: String, state: State, label: String) {
        self.id = id
        self.state = state
        self.label = label
    }

    static func decodeMap(_ rows: Any?) -> [String: FrameActivity] {
        let entries = (rows as? [[String: Any]] ?? []).prefix(FrameSnapshot.maxItems).compactMap { row -> FrameActivity? in
            guard let id = row["id"] as? String, let raw = row["state"] as? String,
                  let state = State(rawValue: raw), let label = row["label"] as? String else { return nil }
            return FrameActivity(id: id, state: state, label: label)
        }
        return Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }
}
