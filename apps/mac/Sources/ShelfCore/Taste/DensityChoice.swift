import Foundation

/// Three pictures for five stored values; two nudges reach the in-betweens.
public enum DensityChoice: String, CaseIterable, Sendable {
    case airy, balanced, packed

    public var title: String {
        switch self {
        case .airy: String(localized: "Airy")
        case .balanced: String(localized: "Balanced")
        case .packed: String(localized: "Packed")
        }
    }

    public static func choice(for stored: TasteDensity) -> DensityChoice {
        switch stored {
        case .airy, .light: .airy
        case .balanced: .balanced
        case .compact, .dense: .packed
        }
    }

    public var stored: TasteDensity {
        switch self {
        case .airy: .airy
        case .balanced: .balanced
        case .packed: .dense
        }
    }

    public static func nudge(_ stored: TasteDensity, towardPacked: Bool) -> TasteDensity {
        let order = TasteDensity.allCases
        guard let index = order.firstIndex(of: stored) else { return stored }
        let next = towardPacked ? min(index + 1, order.count - 1) : max(index - 1, 0)
        return order[next]
    }
}
