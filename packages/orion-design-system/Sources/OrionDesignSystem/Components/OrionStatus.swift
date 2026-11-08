public enum OrionStatus: CaseIterable, Sendable {
    case success, warning, danger, information
    public var color: OrionColor {
        switch self {
        case .success: .kryptoniteGreen
        case .warning: .summerYellow
        case .danger: .loudRed
        case .information: .dayBreakBlue
        }
    }
    public var symbol: String {
        switch self {
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .danger: "xmark.octagon.fill"
        case .information: "info.circle.fill"
        }
    }
}
