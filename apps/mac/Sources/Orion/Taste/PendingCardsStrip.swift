import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Compact tray of learning cards Orion noticed; Keep / Remove via `decide`.
struct PendingCardsStrip: View {
    @Bindable var model: TasteModel
    let cards: [TasteCard]

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text("Orion noticed \(cards.count) things")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.primary)
            VStack(spacing: 0) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                    if index > 0 {
                        Divider().opacity(0.35)
                    }
                    cardRow(card)
                }
            }
            .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
        }
    }

    private func cardRow(_ card: TasteCard) -> some View {
        HStack(alignment: .center, spacing: OrionSpacing.sm) {
            VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                Text(TasteCardText.headline(card))
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                if !card.reason.isEmpty {
                    Text(card.reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: OrionSpacing.sm)
            Button("Keep") {
                Task { await model.store.decide(card, .kept) }
            }
            .buttonStyle(OrionButtonStyle(.primary))
            .disabled(!model.store.canEdit)
            Button("Remove") {
                Task { await model.store.decide(card, .rejected) }
            }
            .buttonStyle(OrionButtonStyle(.secondary))
            .disabled(!model.store.canEdit)
        }
        .padding(.horizontal, OrionSpacing.md)
        .padding(.vertical, OrionSpacing.sm)
        .contentShape(.rect)
        .onHover { hovering in
            model.previewCardID = hovering ? card.id : nil
        }
    }
}
