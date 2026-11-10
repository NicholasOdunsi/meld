import OrionDesignSystem
import SwiftUI

/// New account: empty dashed tiles with one friendly message on top.
struct TasteLearningBoard: View {
    var body: some View {
        ZStack {
            VStack(spacing: OrionSpacing.xs) {
                HStack(spacing: OrionSpacing.xs) { tile("MOTION & FEEL"); tile("LETTERING") }
                HStack(spacing: OrionSpacing.xs) { tile("SHAPE"); tile("SPACE"); tile("VOICE") }
                HStack(spacing: OrionSpacing.xs) { tile("STEER CLEAR OF"); tile("CRAFT RULES") }
            }
            .padding(.horizontal, OrionSpacing.md)
            ContentUnavailableView(
                "Orion is still learning",
                systemImage: "sparkles",
                description: Text("Save a few more images to Inspiration and Orion will draw your style guide.")
            )
            .padding(OrionSpacing.lg)
            .glassEffect(.regular, in: .rect(cornerRadius: 26, style: .continuous))
        }
    }

    private func tile(_ label: LocalizedStringKey) -> some View {
        RoundedRectangle(cornerRadius: OrionRadius.large, style: .continuous)
            .strokeBorder(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))
            .overlay(alignment: .topLeading) {
                Text(label).font(.caption2.weight(.semibold)).foregroundStyle(.tertiary).padding(OrionSpacing.sm)
            }
    }
}
