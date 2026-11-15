import OrionDesignSystem
import SwiftUI

/// A circle with an up arrow. Dim when there is nothing to send, bright cyan when there is.
struct ComposerSendButton: View {
    let size: CGFloat
    let isBright: Bool
    let action: () -> Void
    var accessibilityLabel = "Send to Orion"

    private var cyan: Color { OrionColor.dayBreakBlue.color }
    private var brightFill: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.56, green: 0.96, blue: 1.0), cyan],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    var body: some View {
        Button(action: action) {
            ZStack {
                // One stable circle — swap fills with opacity, never replace the shape mid-animation.
                Circle()
                    .fill(Color.white.opacity(0.14))
                Circle()
                    .fill(brightFill)
                    .opacity(isBright ? 1 : 0)
                Circle()
                    .strokeBorder(Color.white.opacity(0.28), lineWidth: 1)
                    .opacity(isBright ? 0 : 1)
                Image(systemName: "arrow.up")
                    .font(.system(size: size * 0.42, weight: .bold))
                    .foregroundStyle(isBright ? Color(red: 0.016, green: 0.15, blue: 0.17) : Color.white.opacity(0.55))
            }
            .frame(width: size, height: size)
            .shadow(color: cyan.opacity(isBright ? 0.55 : 0), radius: 9)
            // Keep the glyph centered as a unit so layout grow can't squash the circle.
            .compositingGroup()
        }
        .buttonStyle(.plain)
        .contentShape(.circle)
        .frame(width: size, height: size)
        .pointerStyle(isBright ? .link : .default)
        .disabled(!isBright)
        .accessibilityLabel(accessibilityLabel)
        .animation(.easeOut(duration: 0.2), value: isBright)
    }
}

/// The round "+" mark on the composer bar: a faint glass disc with a thin rim.
/// Shared so Taste's menu and the chat composer's button look the same.
struct ComposerPlusCircle: View {
    var body: some View {
        Image(systemName: "plus")
            .font(.system(size: ComposerMetrics.plusGlyphSize, weight: .light))
            .frame(width: ComposerMetrics.plusSize, height: ComposerMetrics.plusSize)
            .contentShape(.circle)
            .background(Circle().fill(Color.white.opacity(0.14)))
            .overlay { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1) }
    }
}
