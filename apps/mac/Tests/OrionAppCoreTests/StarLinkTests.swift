import Foundation
import Testing
@testable import OrionAppCore

struct StarLinkTests {
    @Test func aStarIDRoundTripsThroughItsURL() {
        let url = StarLink.url(for: "0f3c-star")
        #expect(url.scheme == "orion-star")
        #expect(StarLink.starID(from: url) == "0f3c-star")
    }

    @Test func otherLinksAreNotStarLinks() {
        #expect(StarLink.starID(from: URL(string: "https://example.com/a")!) == nil)
        #expect(StarLink.starID(from: URL(string: "orion-star://")!) == nil)
    }
}
