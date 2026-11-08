public enum NormalizationError: Error, Equatable, Sendable {
    /// The bytes could not be decoded as an image.
    case notAnImage
    /// Still over `Limits.maxBytes` after shrinking to `Limits.fallbackEdge`.
    case tooLarge
}
