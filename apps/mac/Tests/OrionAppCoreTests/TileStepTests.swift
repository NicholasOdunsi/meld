import Testing
@testable import OrionAppCore

struct TileStepTests {
    @Test func clampsAndSteps() {
        #expect(TileStep(index: 2).width == 230)
        #expect(TileStep(index: 9).index == 4)
        #expect(TileStep(index: -1).index == 0)
        #expect(TileStep(index: 4).bigger().index == 4)
        #expect(TileStep(index: 0).smaller().index == 0)
        #expect(TileStep(index: 2).bigger().width == 290)
    }
}
