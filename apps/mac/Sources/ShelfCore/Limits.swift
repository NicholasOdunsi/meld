/// Mirrors `INSPIRATION_LIMITS` in packages/contracts/src/inspiration.ts.
/// `LimitsTests` fails if the two drift apart.
public enum Limits {
    public static let maxBytes = 10_485_760
    public static let maxEdge = 4096
    public static let fallbackEdge = 2048
    public static let noteMax = 500
    public static let sourceURLMax = 2048
    /// Shelf-only: how many recent saves the panel shows.
    public static let recentCount = 6
}
