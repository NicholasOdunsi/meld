/// Wait times between retries when Orion is unreachable: 2s, 4s, 8s… capped at 5 minutes.
public struct BackoffSchedule: Sendable {
    private static let maxExponent = 16

    public let base: Duration
    public let cap: Duration

    public init(base: Duration = .seconds(2), cap: Duration = .seconds(300)) {
        self.base = base
        self.cap = cap
    }

    public func delay(afterFailures failures: Int) -> Duration {
        guard failures > 0 else { return .zero }
        let exponent = min(failures - 1, Self.maxExponent)
        return min(base * (1 << exponent), cap)
    }
}
