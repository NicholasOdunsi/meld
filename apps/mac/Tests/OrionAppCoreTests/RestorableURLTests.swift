import Foundation
import Testing
@testable import OrionAppCore

private let origin: URL = {
    guard let url = URL(string: "https://orion-workspace-phi.vercel.app") else { preconditionFailure("bad test URL") }
    return url
}()

struct RestorableURLTests {
    @Test func keepsSameOriginPages() throws {
        let url = try #require(URL(string: "https://orion-workspace-phi.vercel.app/w/rooms/r?tab=canvas"))
        #expect(RestorableURL.restorable(url, appOrigin: origin) == url)
    }

    @Test(arguments: [
        "https://orion-workspace-phi.vercel.app/sign-in?next=%2F",
        "https://orion-workspace-phi.vercel.app/auth/callback?code=1",
        "https://www.pinterest.com/",
    ])
    func dropsAuthAndForeignPages(_ link: String) throws {
        #expect(RestorableURL.restorable(try #require(URL(string: link)), appOrigin: origin) == nil)
    }

    @Test func dropsNil() {
        #expect(RestorableURL.restorable(nil, appOrigin: origin) == nil)
    }

    @Test func resolvesPathsFromNotifications() {
        #expect(RestorableURL.resolve(path: "/w/rooms/r", appOrigin: origin)?.absoluteString == "https://orion-workspace-phi.vercel.app/w/rooms/r")
    }

    @Test(arguments: ["//evil.example/x", "https://evil.example/x", "rooms", "/sign-in"])
    func refusesUnsafePaths(_ path: String) {
        #expect(RestorableURL.resolve(path: path, appOrigin: origin) == nil)
    }
}
