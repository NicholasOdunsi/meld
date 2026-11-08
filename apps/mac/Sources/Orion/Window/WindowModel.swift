import Foundation
import Observation
import OrionAppCore

/// What the Orion window should show, and which page to reopen next time.
@MainActor
@Observable
final class WindowModel {
    enum Phase: Equatable {
        case loading, ready, unreachable(SiteProblem)
    }

    static let lastURLKey = "lastPageURL"

    private(set) var phase: Phase = .loading
    let appOrigin: URL
    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults, appOrigin: URL) {
        self.defaults = defaults
        self.appOrigin = appOrigin
    }

    var launchURL: URL {
        RestorableURL.restorable(defaults.url(forKey: Self.lastURLKey), appOrigin: appOrigin) ?? appOrigin
    }

    func didStartLoading() { phase = .loading }
    func didFinishLoading() { phase = .ready }

    func didFail(_ error: any Error) {
        if let problem = SiteReachability.problem(for: error) { phase = .unreachable(problem) }
    }

    func didReceiveMainFrameStatus(_ status: Int) {
        if let problem = SiteReachability.problem(forHTTPStatus: status) { phase = .unreachable(problem) }
    }

    func remember(_ url: URL?) {
        guard let url = RestorableURL.restorable(url, appOrigin: appOrigin) else { return }
        defaults.set(url, forKey: Self.lastURLKey)
    }
}
