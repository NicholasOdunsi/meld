import SwiftUI

public struct OrionCard<Content: View>: View {
    private let content: Content
    @Environment(\.colorScheme) private var scheme
    @Environment(\.colorSchemeContrast) private var contrast

    public init(@ViewBuilder content: () -> Content) { self.content = content() }

    public var body: some View {
        content
            .padding(OrionSpacing.lg)
            .background(OrionColorRole.surface.resolve(in: scheme), in: .rect(cornerRadius: OrionRadius.medium))
            .overlay {
                RoundedRectangle(cornerRadius: OrionRadius.medium)
                    .strokeBorder(OrionColorRole.border.resolve(in: scheme, contrast: contrast), lineWidth: OrionSize.border)
            }
    }
}
