import OrionDesignSystem
import SwiftUI

struct TasteChip: View {
    let text: String
    var isStruck = false

    var body: some View {
        Text(text)
            .font(.caption2)
            .lineLimit(1)
            .strikethrough(isStruck, color: OrionColor.loudRed.color)
            .foregroundStyle(isStruck ? .secondary : .primary)
            .padding(.horizontal, OrionSpacing.xs)
            .padding(.vertical, 3)
            .background(Color.primary.opacity(0.08), in: Capsule(style: .continuous))
    }
}
