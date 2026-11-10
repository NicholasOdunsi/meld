import Foundation

/// What the live sample needs, worked out from a board. Pure numbers and hex strings.
public struct TasteSampleStyle: Equatable, Sendable {
    public let rowGap: Double
    public let padding: Double
    public let titleSize: Double
    public let titleWeight: TasteWeight
    public let tracking: Double
    public let background: String
    public let ink: String
    public let action: String
    public let accent: String
    public let screenTitle = "Welcome back"

    public init(board: TasteBoard) {
        let densityGap: Double = switch board.density {
        case .airy: 22
        case .light: 17
        case .balanced: 12
        case .compact: 8
        case .dense: 5
        }
        let spacingFactor: Double = switch board.spacing {
        case .tight: 0.8
        case .comfortable: 1.0
        case .generous: 1.2
        }
        rowGap = densityGap * spacingFactor
        padding = 12 + densityGap * spacingFactor * 0.6
        titleSize = 22
        titleWeight = board.typography.weight
        tracking = switch board.typography.tracking {
        case .loose: 0.6
        case .normal: 0
        case .tight: -0.8
        }
        func hex(_ role: TasteColorRole) -> String? { board.colors.first { $0.role == role }?.hex }
        background = hex(.base) ?? "#ffffff"
        ink = hex(.text) ?? "#111111"
        action = hex(.action) ?? "#111111"
        accent = hex(.accent) ?? action
    }
}
