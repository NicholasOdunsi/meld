import SwiftUI
import Testing
@testable import OrionDesignSystem

@MainActor
struct IconTests {
    @Test func everyIconHasBothWeightsInsideTheGrid() {
        let grid = CGRect(x: -1, y: -1, width: 258, height: 258)
        for icon in OrionIcon.allCases {
            for weight in [OrionIcon.Weight.regular, .fill] {
                let bounds = icon.path(weight).boundingRect
                #expect(!bounds.isEmpty, "\(icon) \(weight) is empty")
                #expect(grid.contains(bounds), "\(icon) \(weight) spills outside the grid: \(bounds)")
            }
        }
    }

    @Test func parsesRelativeCommandsAndImplicitLines() {
        let bounds = SVGPathParser.path("m10 10 20 0 v20 h-20 z").boundingRect
        #expect(bounds == CGRect(x: 10, y: 10, width: 20, height: 20))
    }

    @Test func parsesArcsWithPackedFlags() {
        // A circle of radius 8 around (16,16), written the way Phosphor packs arc flags.
        let bounds = SVGPathParser.path("M8,16a8,8,0,1,1,16,0a8,8,0,1,1-16,0Z").boundingRect
        #expect(abs(bounds.minX - 8) < 0.01 && abs(bounds.maxX - 24) < 0.01)
        #expect(abs(bounds.minY - 8) < 0.01 && abs(bounds.maxY - 24) < 0.01)
    }

    @Test func parsesSmoothCurvesAndExponents() {
        let path = SVGPathParser.path("M0 0C0 10 10 10 10 0S20 -10 20 0L1e1 5")
        #expect(path.boundingRect.maxX <= 20.001)
        #expect(!path.isEmpty)
    }
}
