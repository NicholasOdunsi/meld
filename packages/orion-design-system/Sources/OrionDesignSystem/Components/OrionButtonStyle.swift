import SwiftUI

public struct OrionButtonStyle: ButtonStyle {
    public enum Variant: CaseIterable, Sendable { case primary, secondary, quiet, destructive }
    private let variant: Variant
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ variant: Variant = .primary) { self.variant = variant }

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            // 12pt caption — clean, light weight on the small pill.
            .orionTextStyle(.caption)
            .padding(.horizontal, OrionSpacing.sm + 2)
            .padding(.vertical, OrionSpacing.xxs + 1)
            .frame(minHeight: Self.compactHeight)
            .foregroundStyle(foreground)
            .background(background, in: Capsule(style: .continuous))
            .overlay {
                Capsule(style: .continuous)
                    .strokeBorder(OrionColorRole.borderStrong.resolve(in: scheme, contrast: contrast),
                                  lineWidth: variant == .secondary ? OrionSize.border : 0)
            }
            .overlay {
                Capsule(style: .continuous)
                    .fill(OrionColor.black.color.opacity(configuration.isPressed ? 0.12 : 0))
                    .allowsHitTesting(false)
            }
            .modifier(OrionHoverModifier())
            .opacity(isEnabled ? 1 : 0.45)
            .contentShape(Capsule(style: .continuous))
            .animation(OrionMotion.interaction(reduceMotion: reduceMotion), value: configuration.isPressed)
    }

    /// Compact pill — a touch under the old 44pt bar, still easy to hit.
    private static let compactHeight: CGFloat = 32

    private var foreground: Color {
        switch variant {
        case .primary: OrionColor.dayBreakBlue.textForeground.color
        case .destructive: OrionColor.loudRed.textForeground.color
        case .secondary, .quiet: OrionColorRole.textPrimary.resolve(in: scheme)
        }
    }
    private var background: Color {
        switch variant {
        case .primary: OrionColor.dayBreakBlue.color
        case .destructive: OrionColor.loudRed.color
        case .secondary: OrionColorRole.surfaceStrong.resolve(in: scheme)
        case .quiet: .clear
        }
    }
}
