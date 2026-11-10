import OrionDesignSystem
import SwiftUI

/// Dashed suggestion / quick-start chips for Taste panels.
struct TasteDashedChips: View {
    let items: [String]
    let action: (String) -> Void

    var body: some View {
        FlowLayout(spacing: OrionSpacing.xs) {
            ForEach(items, id: \.self) { item in
                Button(item) { action(item) }
                    .buttonStyle(.plain)
                    .modifier(TasteDashedChipStyle())
            }
        }
    }
}

struct TasteDashedChipStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.caption)
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xxs + 2)
            .overlay {
                Capsule(style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    .foregroundStyle(.secondary)
            }
    }
}
