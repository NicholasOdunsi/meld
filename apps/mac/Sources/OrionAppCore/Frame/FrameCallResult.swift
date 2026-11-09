import Foundation

/// What came back when the native frame asked the page to do something.
public enum FrameCallResult: Equatable, Sendable {
    /// Done; `path` is where to go next, if anywhere.
    case ok(path: String?)
    /// The page refused or failed, with a message for the person.
    case failed(String)
    /// No page was there to ask (still loading, signed out, offline).
    case unavailable

    public static func parse(_ value: Any?) -> FrameCallResult {
        guard let fields = value as? [String: Any], let status = fields["status"] as? String else { return .unavailable }
        switch status {
        case "ok":
            let path = (fields["path"] as? String).flatMap { $0.hasPrefix("/") && !$0.hasPrefix("//") ? $0 : nil }
            return .ok(path: path)
        case "error":
            let message = (fields["message"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            return .failed(message ?? String(localized: "Orion couldn't do that right now. Try again."))
        default:
            return .unavailable
        }
    }
}
