import Foundation

/// A failure the owner may see. `message` is already human-readable: it comes
/// from Orion (spec E1 messages) or from the local cases below.
public struct ShelfAPIError: Error, Equatable, Sendable {
    public enum Code: String, Sendable {
        case unauthorized
        case invalidCode = "invalid_code"
        case rateLimited = "rate_limited"
        case unsupportedType = "unsupported_type"
        case tooLarge = "too_large"
        case invalidImage = "invalid_image"
        case unavailable
        /// Orion could not be reached at all.
        case network
        /// The waiting image could not be read back from the outbox.
        case unreadable
    }

    public static let network = ShelfAPIError(code: .network, message: String(localized: "Can't reach Orion. Is it running?"))
    public static let unreadable = ShelfAPIError(code: .unreadable, message: String(localized: "A waiting image could not be read and was set aside."))

    public let code: Code
    public let message: String

    public init(code: Code, message: String) {
        self.code = code
        self.message = message
    }
}
