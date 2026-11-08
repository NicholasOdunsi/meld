import Foundation
import Testing
@testable import OrionAppCore

struct SiteReachabilityTests {
    @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost, .timedOut, .dnsLookupFailed])
    func networkErrorsMeanOffline(_ code: URLError.Code) {
        #expect(SiteReachability.problem(for: URLError(code)) == .offline)
    }

    @Test func cancellationIsNotAProblem() {
        #expect(SiteReachability.problem(for: URLError(.cancelled)) == nil)
    }

    @Test func webKitInterruptionIsNotAProblem() {
        #expect(SiteReachability.problem(for: NSError(domain: "WebKitErrorDomain", code: 102)) == nil)
    }

    @Test(arguments: [500, 502, 503, 599])
    func serverErrors(_ status: Int) {
        #expect(SiteReachability.problem(forHTTPStatus: status) == .serverError)
    }

    @Test(arguments: [200, 304, 404])
    func otherStatusesAreFine(_ status: Int) {
        #expect(SiteReachability.problem(forHTTPStatus: status) == nil)
    }
}
