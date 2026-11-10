import OrionDesignSystem
import SwiftUI

/// A circle with an up arrow. Dim when there is nothing to send, bright cyan when there is.
struct ComposerSendButton: View {
    let size: CGFloat
    let isBright: Bool
    let action: () -> Void

    private var cyan: Color { OrionColor.dayBreakBlue.color }

    var body: some View {
        Button(action: action) {
            Image(systemName: "arrow.up")
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(isBright ? Color(red: 0.016, green: 0.15, blue: 0.17) : Color.white.opacity(0.55))
                .frame(width: size, height: size)
                .background {
                    if isBright {
                        Circle().fill(LinearGradient(colors: [Color(red: 0.56, green: 0.96, blue: 1.0), cyan], startPoint: .top, endPoint: .bottom))
                    } else {
                        Circle().fill(Color.white.opacity(0.14))
                    }
                }
                .overlay { if !isBright { Circle().strokeBorder(Color.white.opacity(0.28), lineWidth: 1) } }
                .shadow(color: isBright ? cyan.opacity(0.55) : .clear, radius: 9)
        }
        .buttonStyle(.plain)
        .disabled(!isBright)
        .accessibilityLabel("Send to Orion")
    }
}
