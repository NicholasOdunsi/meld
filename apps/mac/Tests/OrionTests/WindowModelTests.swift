import Foundation
import OrionAppCore
import Testing
@testable import Orion

private func url(_ string: String) -> URL {
    guard let url = URL(string: string) else { preconditionFailure("Bad test URL: \(string)") }
    return url
}

@MainActor
struct WindowModelTests {
    private let origin = url("https://orion.test")
    private func defaults() -> UserDefaults { UserDefaults(suiteName: "orion-window-\(UUID().uuidString)") ?? .standard }

    @Test func startsAtTheSiteWhenNothingWasRemembered() {
        #expect(WindowModel(defaults: defaults(), appOrigin: origin).launchURL == origin)
    }

    @Test func reopensTheLastPage() {
        let store = defaults()
        let page = url("https://orion.test/w/rooms/r")
        WindowModel(defaults: store, appOrigin: origin).remember(page)
        #expect(WindowModel(defaults: store, appOrigin: origin).launchURL == page)
    }

    @Test func neverRemembersSignInOrForeignPages() {
        let store = defaults()
        let model = WindowModel(defaults: store, appOrigin: origin)
        model.remember(url("https://orion.test/w"))
        model.remember(url("https://orion.test/sign-in"))
        model.remember(url("https://example.com"))
        #expect(WindowModel(defaults: store, appOrigin: origin).launchURL.absoluteString == "https://orion.test/w")
    }

    @Test func phasesFollowLoading() {
        let model = WindowModel(defaults: defaults(), appOrigin: origin)
        #expect(model.phase == .loading)
        model.didFinishLoading()
        #expect(model.phase == .ready)
        model.didFail(URLError(.notConnectedToInternet))
        #expect(model.phase == .unreachable(.offline))
        model.didStartLoading()
        #expect(model.phase == .loading)
        model.didReceiveMainFrameStatus(503)
        #expect(model.phase == .unreachable(.serverError))
    }

    @Test func cancelledLoadsDoNotShowAnError() {
        let model = WindowModel(defaults: defaults(), appOrigin: origin)
        model.didFinishLoading()
        model.didFail(URLError(.cancelled))
        #expect(model.phase == .ready)
    }
}
