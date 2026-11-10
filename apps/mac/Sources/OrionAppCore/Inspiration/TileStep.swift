import Foundation

/// The five tile sizes behind the slider and ⌘+ / ⌘−.
public struct TileStep: Equatable, Sendable {
    public static let widths: [Double] = [140, 180, 230, 290, 360]
    public static let defaultIndex = 2
    public static let defaultsKey = "inspirationTileStep"

    public let index: Int

    public init(index: Int) {
        self.index = min(max(index, 0), Self.widths.count - 1)
    }

    public var width: Double { Self.widths[index] }
    public func bigger() -> TileStep { TileStep(index: index + 1) }
    public func smaller() -> TileStep { TileStep(index: index - 1) }
}
