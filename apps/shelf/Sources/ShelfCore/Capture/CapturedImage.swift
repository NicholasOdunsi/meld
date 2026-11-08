import Foundation

/// Image bytes exactly as they arrived from a drop, a paste, or the hotkey.
/// The format is sniffed later by `ImageNormalizer`, so no type hint is kept.
public struct CapturedImage: Sendable, Equatable {
    public let data: Data
    public let sourceURL: URL?

    public init(data: Data, sourceURL: URL?) {
        self.data = data
        self.sourceURL = sourceURL
    }
}
