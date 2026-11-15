import Foundation

/// One status group in the Constellations panel: its Stars, newest first.
public struct StarStatusSection: Equatable, Sendable {
    public let status: StreamStar.Status
    public let stars: [StreamStar]
    public var count: Int { stars.count }
}

public enum StarStatusSections {
    /// Display order of the status groups.
    public static let order: [StreamStar.Status] = [.needs_you, .stuck, .working, .done]

    /// Stars grouped by status in `order`, empty groups left out, each group
    /// sorted newest first (ties broken by id so the order is stable).
    public static func make(from stars: [StreamStar]) -> [StarStatusSection] {
        order.compactMap { status in
            let matching = stars.filter { $0.status == status }.sorted {
                $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt > $1.createdAt
            }
            return matching.isEmpty ? nil : StarStatusSection(status: status, stars: matching)
        }
    }

    /// Short relative age: "now" under a minute, then "11m", "2h", "3d".
    /// Dates in the future count as "now".
    public static func shortAge(from date: Date, now: Date) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return "now" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86_400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86_400)d"
    }
}
