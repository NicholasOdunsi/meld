import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Title, the mood line (tap to edit), the suggestions pill and the Preview button.
struct TasteHeader: View {
    @Bindable var model: TasteModel
    let board: TasteBoard?

    private var moodPending: [TasteCard] { model.store.pending(in: .mood) }
    private var moodText: String {
        let words = board?.designLanguage.prefix(2).joined(separator: " · ") ?? ""
        return words.isEmpty ? String(localized: "Add mood words") : words
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: OrionSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Taste").font(.title2.weight(.bold))
                if board != nil {
                    HStack(spacing: OrionSpacing.xs) {
                        Button { model.open(.mood) } label: {
                            Text(moodText).font(.caption).foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .disabled(!model.store.canEdit)
                        ForEach(moodPending, id: \.id) { card in
                            Text(TasteCardText.headline(card)).font(.caption)
                            Button("Keep") { Task { await model.store.decide(card, .kept) } }
                                .buttonStyle(OrionButtonStyle(.primary))
                            Button("Remove") { Task { await model.store.decide(card, .rejected) } }
                                .buttonStyle(OrionButtonStyle(.secondary))
                        }
                    }
                }
            }
            Spacer(minLength: OrionSpacing.sm)
            if !model.store.pendingCards.isEmpty {
                Button {
                    Task { await model.store.keepAll() }
                } label: {
                    Text("✦ \(model.store.pendingCards.count) suggestions · Keep all")
                }
                .buttonStyle(OrionButtonStyle(.secondary))
                .contextMenu { Button("Remove all") { Task { await model.store.removeAll() } } }
                .disabled(!model.store.canEdit)
            }
            if board != nil {
                Button("▶ Preview on a screen") { model.isPreviewing = true }
                    .buttonStyle(OrionButtonStyle(.secondary))
            }
        }
    }
}
