import SwiftUI

/// Orion's icon set: Phosphor (https://phosphoricons.com, MIT), compiled into
/// native SwiftUI shapes. Use `OrionIconView` to draw one.
///
/// To add an icon, see `scripts/generate-phosphor-icons.mjs`.
public enum OrionIcon: String, CaseIterable, Sendable {
    case house, lightbulb, sparkle, plus, paintBrush, gearSix, sidebar, caretDown
    case dotsThree, pencil, trash, x, chatCircle
    case folder, rocketLaunch, target, flag, star, heart, briefcase, chartBar, calendar
    case bookmark, trophy, shield, compass, puzzlePiece, megaphone, gift, camera, palette
    case globe, bank, coins, creditCard, wallet, crown, graduationCap, chartLineUp
    case receipt, storefront, plant

    /// Phosphor weights Orion uses: regular for resting, fill for selected.
    public enum Weight: Sendable { case regular, fill }

    /// Shapes are parsed once and reused.
    @MainActor private static var cache: [String: Path] = [:]

    @MainActor
    func path(_ weight: Weight) -> Path {
        let key = "\(rawValue)-\(weight)"
        if let cached = Self.cache[key] { return cached }
        let data = (weight == .fill ? PhosphorPaths.fill : PhosphorPaths.regular)[self] ?? ""
        let path = SVGPathParser.path(data)
        Self.cache[key] = path
        return path
    }

    /// Phosphor draws on a 256×256 grid.
    static let gridSize: Double = 256
}

/// One Orion icon, filled with the current foreground style (so it follows
/// tint, selection and light/dark mode like a system symbol). Sizes with text.
public struct OrionIconView: View {
    private let icon: OrionIcon
    private let weight: OrionIcon.Weight
    @ScaledMetric(relativeTo: .body) private var size: Double = 16

    public init(_ icon: OrionIcon, weight: OrionIcon.Weight = .regular) {
        self.icon = icon
        self.weight = weight
    }

    public var body: some View {
        OrionIconShape(path: icon.path(weight))
            .fill(.foreground)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

private struct OrionIconShape: Shape {
    let path: Path

    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width, rect.height) / OrionIcon.gridSize
        return path.applying(
            CGAffineTransform(scaleX: scale, y: scale)
                .concatenating(CGAffineTransform(translationX: rect.minX, y: rect.minY))
        )
    }
}
