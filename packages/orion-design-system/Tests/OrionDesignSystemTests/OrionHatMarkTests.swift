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
