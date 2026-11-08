import SwiftUI

public struct OrionSurface<Content: View>: View {
    private let tone: OrionTone?
    private let variant: OrionToneVariant
    private let content: Content
    @Environment(\.colorScheme) private var scheme

    public init(tone: OrionTone? = nil, variant: OrionToneVariant = .offWhiteBackground, @ViewBuilder content: () -> Content) {
        self.tone = tone
        self.variant = variant
        self.content = content()
    }

    public var body: some View {
        let palette = tone?.palette(for: variant)
        content
            .foregroundStyle(palette?.textForeground.color ?? OrionColorRole.textPrimary.resolve(in: scheme))
            .background(palette?.background.color ?? OrionColorRole.canvas.resolve(in: scheme))
    }
}
