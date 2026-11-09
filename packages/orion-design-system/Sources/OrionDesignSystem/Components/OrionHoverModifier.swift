import SwiftUI

struct OrionHoverModifier: ViewModifier {
    @State private var hovering = false
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                Capsule(style: .continuous)
                    .fill((scheme == .dark ? OrionColor.offWhite : .black).color
                        .opacity(hovering && isEnabled ? 0.08 : 0))
                    .allowsHitTesting(false)
            }
            .onHover { hovering = $0 }
            .animation(OrionMotion.interaction(reduceMotion: reduceMotion), value: hovering)
    }
}
