import CoreGraphics
import Testing
@testable import OrionDesignSystem

@Test func hatFramesShipInTheBundle() {
    for index in 0..<OrionHatFrames.neutralGazeCount {
        #expect(OrionHatFrames.image("hat-neutral-\(index)") != nil)
    }
    #expect(OrionHatFrames.image("hat-curious") != nil)
}

@Test func gazeFrameFollowsTheSway() {
    #expect(OrionHatMark.gazeIndex(phase: 0) == 0)
    #expect(OrionHatMark.gazeIndex(phase: 0.5) == OrionHatFrames.neutralGazeCount - 1)
    #expect(OrionHatMark.gazeIndex(phase: 1) == 0)
}

@Test func workingSwayPivotsNearTheBottom() {
    let height: CGFloat = 100
    let skew = 5 * Double.pi / 180
    let transform = OrionHatMark.workingSwayTransform(skewRadians: skew, height: height)
    let k = CGFloat(tan(skew))
    #expect(transform.a == 1 && transform.b == 0 && transform.c == k && transform.d == 1)
    #expect(transform.tx == -k * height * 0.95)
    #expect(transform.ty == 0)
    let pivot = CGPoint(x: 50, y: height * 0.95).applying(transform)
    #expect(abs(pivot.x - 50) < 0.0001)
    #expect(abs(pivot.y - height * 0.95) < 0.0001)
}
