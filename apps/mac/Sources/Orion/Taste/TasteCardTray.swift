import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Shared tray for learning and composer cards — Keep / Remove / reply.
struct TasteCardTray: View {
    @Bindable var model: TasteModel
    let cards: [TasteCard]

    @State private var reply = ""
    @State private var flashedIDs: Set<String> = []

    private var isComposerTray: Bool {
        cards.contains { $0.origin == "composer" }
    }

    private var sourceCount: Int {
        Set(cards.compactMap { card -> String? in
            guard let source = card.source else { return nil }
            return "\(source.kind)|\(source.name)|\(source.locator)"
        }).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Text(header)
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

            HStack(spacing: OrionSpacing.sm) {
                TextField("Ask Orion to change something…", text: $reply)
                    .textFieldStyle(.plain)
                    .onSubmit { Task { await submitReply() } }
                    .disabled(!model.store.canEdit)

                Button("Remove all") {
                    Task { await model.store.removeAll() }
                }
                .buttonStyle(OrionButtonStyle(.secondary))
                .disabled(!model.store.canEdit)

                Button("Keep all \(cards.count)") {
                    Task { await model.store.keepAll() }
                }
                .buttonStyle(OrionButtonStyle(.primary))
                .disabled(!model.store.canEdit)
            }
            .padding(.top, OrionSpacing.xxs)
        }
    }

    private var header: String {
        if isComposerTray {
            let n = max(sourceCount, 1)
            return "Orion read \(n) thing\(n == 1 ? "" : "s") and found \(cards.count) change\(cards.count == 1 ? "" : "s")"
        }
        return "Orion noticed \(cards.count) thing\(cards.count == 1 ? "" : "s")"
    }

    private func cardRow(_ card: TasteCard) -> some View {
        HStack(alignment: .center, spacing: OrionSpacing.sm) {
            VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                Button {
                    if let slot = TasteSlot.slot(for: card.tile) { model.open(slot) }
                } label: {
                    Text(TasteCardText.headline(card))
                        .font(.body.weight(.medium))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)

                if let line = sourceLine(card) {
                    Text(line)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if !card.reason.isEmpty {
                    Text(card.reason)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: OrionSpacing.sm)
            Button("Keep") {
                Task { await keep(card) }
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
        .background(flashedIDs.contains(card.id) ? Color.green.opacity(0.18) : Color.clear)
        .contentShape(.rect)
        .onHover { hovering in
            model.previewCardID = hovering ? card.id : nil
        }
    }

    private func sourceLine(_ card: TasteCard) -> String? {
        guard let source = card.source else { return nil }
        if source.locator.isEmpty { return source.name }
        return "\(source.name) · \(source.locator)"
    }

    private func keep(_ card: TasteCard) async {
        withAnimation(.snappy(duration: 0.2)) { _ = flashedIDs.insert(card.id) }
        try? await Task.sleep(for: .seconds(0.8))
        _ = await model.store.decide(card, .kept)
        flashedIDs.remove(card.id)
    }

    private func submitReply() async {
        let trimmed = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, model.store.canEdit else { return }
        let ids = cards.map(\.id)
        let ok = await model.store.compose(TasteComposeRequest(words: trimmed, replyTo: ids))
        if ok { reply = "" }
    }
}
