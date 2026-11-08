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
            .orionTextStyle(.label)
            .padding(.horizontal, OrionSpacing.md)
            .padding(.vertical, OrionSpacing.xs)
            .frame(minWidth: OrionSize.minimumHitTarget, minHeight: OrionSize.controlHeight)
            .foregroundStyle(foreground)
            .background(background, in: .rect(cornerRadius: OrionRadius.small))
            .overlay {
                RoundedRectangle(cornerRadius: OrionRadius.small)
                    .strokeBorder(OrionColorRole.borderStrong.resolve(in: scheme, contrast: contrast),
                                  lineWidth: variant == .secondary ? OrionSize.border : 0)
            }
            .overlay {
                RoundedRectangle(cornerRadius: OrionRadius.small)
                    .fill(OrionColor.black.color.opacity(configuration.isPressed ? 0.12 : 0))
                    .allowsHitTesting(false)
            }
            .modifier(OrionHoverModifier())
            .opacity(isEnabled ? 1 : 0.45)
            .contentShape(.rect)
            .animation(OrionMotion.interaction(reduceMotion: reduceMotion), value: configuration.isPressed)
    }

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
