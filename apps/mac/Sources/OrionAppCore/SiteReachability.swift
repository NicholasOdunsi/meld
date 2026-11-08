import Foundation

public enum SiteProblem: Equatable, Sendable {
    case offline, serverError
}

/// Turns load failures into the one of two screens the user sees, or nil when nothing is wrong.
public enum SiteReachability {
    private static let frameLoadInterrupted = 102

    public static func problem(for error: any Error) -> SiteProblem? {
        let error = error as NSError
        if error.domain == NSURLErrorDomain, error.code == NSURLErrorCancelled { return nil }
        if error.domain == "WebKitErrorDomain", error.code == frameLoadInterrupted { return nil }
        return .offline
    }

    public static func problem(forHTTPStatus status: Int) -> SiteProblem? {
        (500...599).contains(status) ? .serverError : nil
    }
}
