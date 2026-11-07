import SwiftUI

struct OrionTypographyModifier: ViewModifier {
    let style: OrionTextStyle
    let emphasized: Bool
    @ScaledMetric private var size: CGFloat

    init(style: OrionTextStyle, emphasized: Bool) {
        self.style = style
        self.emphasized = emphasized
        _size = ScaledMetric(wrappedValue: style.size, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        content
            .font(OrionFont.font(for: style, size: size, emphasized: emphasized))
            .tracking(size * style.trackingEm)
            .lineSpacing(max(0, size * (style.lineHeightMultiple - 1)))
    }
}

extension View {
    /// Applies scaled type to any label. Use OrionText for automatic headline capitalization.
    public func orionTextStyle(_ style: OrionTextStyle, emphasized: Bool = false) -> some View {
        modifier(OrionTypographyModifier(style: style, emphasized: emphasized))
    }
}
