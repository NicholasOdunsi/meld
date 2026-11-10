import SwiftUI
import Testing
@testable import Orion

struct BrushStrokeShapeTests {
    @Test func theStrokeStaysInsideItsRectAndTapersAtBothEnds() {
        let rect = CGRect(x: 0, y: 0, width: 320, height: 8)
        let path = BrushStrokeShape().path(in: rect)
        let bounds = path.boundingRect
        #expect(!path.isEmpty)
        #expect(bounds.minX >= rect.minX - 0.5 && bounds.maxX <= rect.maxX + 0.5)
        #expect(bounds.minY >= rect.minY - 3 && bounds.maxY <= rect.maxY + 3)
        // Thicker in the middle than at the very start.
        let middle = BrushStrokeShape.thickness(at: 0.5, height: 8)
        let start = BrushStrokeShape.thickness(at: 0.0, height: 8)
        let end = BrushStrokeShape.thickness(at: 1.0, height: 8)
        #expect(middle > start)
        #expect(middle > end)
    }
}
