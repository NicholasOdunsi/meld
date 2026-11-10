import Foundation
import ShelfCore
import Testing
@testable import Orion

struct TastePanelComposeTests {
    @Test func plainWordsAreScopedToTheTile() {
        let request = TastePanelRequests.words("  warmer please ", tile: .colors)
        #expect(request?.words == "warmer please")
        #expect(request?.tile == .colors)
    }

    @Test func blankOrHugeWordsAreRefused() {
        #expect(TastePanelRequests.words("   ", tile: .density) == nil)
        #expect(TastePanelRequests.words(String(repeating: "a", count: 4001), tile: .density) == nil)
    }

    @Test func appleAndImageRequests() {
        #expect(TastePanelRequests.apple().preset == .apple)
        let id = UUID()
        let image = TastePanelRequests.fromImage(id)
        #expect(image.tile == .colors)
        #expect(image.libraryItemIDs == [id])
    }
}
