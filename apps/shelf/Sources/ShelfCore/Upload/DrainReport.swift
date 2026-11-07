/// What one pass over the outbox achieved, for the app to show and schedule from.
public struct DrainReport: Sendable, Equatable {
    public var uploaded: [UploadedItem] = []
    public var rejected: [ShelfAPIError] = []
    public var isUnauthorized = false
    /// Set when Orion was unreachable or unavailable; try again after this long.
    public var retryAfter: Duration?
    public var remaining = 0

    public init() {}
}
