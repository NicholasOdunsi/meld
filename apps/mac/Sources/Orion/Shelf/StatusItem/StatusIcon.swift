enum StatusIcon: Equatable {
    case idle
    case success
    case rejected
    case waiting(Int)
    case disconnected

    /// SF Symbol for transient feedback. Idle / waiting use the Orion mark instead.
    var symbolName: String? {
        switch self {
        case .idle, .waiting: nil
        case .success: "checkmark.circle.fill"
        case .rejected: "xmark.circle"
        case .disconnected: "exclamationmark.triangle"
        }
    }

    var badgeText: String {
        if case .waiting(let count) = self { "\(count)" } else { "" }
    }

    var accessibilityLabel: String {
        switch self {
        case .idle: String(localized: "Orion Shelf")
        case .success: String(localized: "Saved to Orion")
        case .rejected: String(localized: "Couldn't save")
        case .waiting(let count): String(localized: "Orion Shelf, \(count) waiting")
        case .disconnected: String(localized: "Orion Shelf is disconnected")
        }
    }
}
