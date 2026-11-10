import OrionDesignSystem
import ShelfCore
import SwiftUI

/// One tile of the board: label, specimen, and (when Orion has a suggestion for it) a dashed
/// cyan ring with Keep / Remove right on the tile.
struct TasteTileCard<Content: View>: View {
    let label: LocalizedStringKey
    var pending: [TasteCard] = []
    var isSelected = false
    var isEnabled = true
    let onOpen: () -> Void
    let onPreview: (String?) -> Void
    let onDecide: (TasteCard, TasteDecision) -> Void
    @ViewBuilder var content: () -> Content

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: OrionRadius.large, style: .continuous) }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text(label)
                .font(.caption2.weight(.semibold))
                .tracking(0.4)
                .foregroundStyle(.secondary)
            content()
            Spacer(minLength: 0)
            ForEach(pending, id: \.id) { card in footer(card) }
        }
        .padding(OrionSpacing.sm)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.primary.opacity(0.06), in: shape)
        .overlay { ring }
        .contentShape(shape)
        .onTapGesture { if isEnabled { onOpen() } }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder private var ring: some View {
        if !pending.isEmpty {
            shape.strokeBorder(OrionColor.dayBreakBlue.color, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
        } else if isSelected {
            shape.strokeBorder(OrionColor.dayBreakBlue.color, lineWidth: 2)
        }
    }

    private func footer(_ card: TasteCard) -> some View {
        HStack(spacing: OrionSpacing.xs) {
            Text(TasteCardText.headline(card))
                .font(.caption)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Keep") { onDecide(card, .kept) }
                .buttonStyle(OrionButtonStyle(.primary))
            Button("Remove") { onDecide(card, .rejected) }
                .buttonStyle(OrionButtonStyle(.secondary))
        }
        .padding(OrionSpacing.xs)
        .background(.regularMaterial, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
        .onHover { onPreview($0 ? card.id : nil) }
    }
}
