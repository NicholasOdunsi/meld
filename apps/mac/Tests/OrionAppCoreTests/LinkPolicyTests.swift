import Foundation
import Testing
@testable import OrionAppCore

private let origin: URL = {
    guard let url = URL(string: "https://orion-workspace-phi.vercel.app") else { preconditionFailure("bad test URL") }
    return url
}()

struct LinkPolicyTests {
    private let policy = LinkPolicy(appOrigin: origin)

    @Test(arguments: [
        ("https://orion-workspace-phi.vercel.app/abc/rooms/1", LinkDecision.loadInApp),
        ("https://orion-workspace-phi.vercel.app:443/x", .loadInApp),
        ("about:blank", .loadInApp),
        ("blob:https://orion-workspace-phi.vercel.app/123", .loadInApp),
        ("http://orion-workspace-phi.vercel.app/x", .openExternally),
        ("https://www.pinterest.com/pin/1", .openExternally),
        ("https://evil.vercel.app/x", .openExternally),
        ("mailto:me@example.com", .openExternally),
        ("tel:123", .openExternally),
        ("slack://x", .ignore),
        ("javascript:alert(1)", .ignore),
        ("file:///etc/passwd", .ignore),
    ])
    func decides(_ link: String, _ expected: LinkDecision) throws {
        let url = try #require(URL(string: link))
        #expect(policy.decide(url) == expected)
    }
}
