import Foundation
import Testing
@testable import OrionAppCore

struct OriginTests {
    private let app = URL(string: "https://orion.test")!
    private let appWithPort = URL(string: "http://localhost:3000")!

    @Test func portZeroMeansTheDefaultPort() {
        #expect(isSameOrigin(scheme: "https", host: "orion.test", port: 0, as: app))
        #expect(isSameOrigin(scheme: "https", host: "orion.test", port: 443, as: app))
    }

    @Test func differentPortSchemeOrHostIsRejected() {
        #expect(!isSameOrigin(scheme: "https", host: "orion.test", port: 8443, as: app))
        #expect(!isSameOrigin(scheme: "http", host: "orion.test", port: 0, as: app))
        #expect(!isSameOrigin(scheme: "https", host: "evil.test", port: 0, as: app))
    }

    @Test func explicitAppPortMustMatch() {
        #expect(isSameOrigin(scheme: "http", host: "localhost", port: 3000, as: appWithPort))
        #expect(!isSameOrigin(scheme: "http", host: "localhost", port: 0, as: appWithPort))
    }
}
