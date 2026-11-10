import Testing
@testable import OrionAppCore

struct MasonryLayoutTests {
    @Test func columnCountFitsTilesAndSpacing() {
        #expect(MasonryLayout.columnCount(width: 1000, tileWidth: 230, spacing: 12) == 4)
        #expect(MasonryLayout.columnCount(width: 100, tileWidth: 230, spacing: 12) == 1)
        #expect(MasonryLayout.columnCount(width: 0, tileWidth: 230, spacing: 12) == 1)
    }

    @Test func placesEachItemInTheShortestColumn() {
        // Heights are 1 / ratio: tall 2, wide 0.5, square 1, square 1.
        // 0 → col0 (2). 1 → col1 (0.5). 2 → col1 (1.5 < 2). 3 → col1 (1.5 < 2, now 2.5).
        let columns = MasonryLayout.columns(aspectRatios: [0.5, 2, 1, 1], count: 2)
        #expect(columns == [[0], [1, 2, 3]])
    }

    @Test func keepsNewestFirstWithinAColumnAndTiesGoLeft() {
        let columns = MasonryLayout.columns(aspectRatios: [1, 1, 1, 1, 1, 1], count: 3)
        #expect(columns == [[0, 3], [1, 4], [2, 5]])
    }

    @Test func handlesEmptyAndOneColumn() {
        #expect(MasonryLayout.columns(aspectRatios: [], count: 3) == [[], [], []])
        #expect(MasonryLayout.columns(aspectRatios: [1, 2], count: 1) == [[0, 1]])
    }
}
