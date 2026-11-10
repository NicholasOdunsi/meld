import OrionDesignSystem
import ShelfCore
import SwiftUI

/// One section of the page: a label, one big sentence, a live specimen, and any suggestion for it.
struct TasteSectionView: View {
    @Bindable var model: TasteModel
    let section: TasteDocSection
    let board: TasteBoard

    private var cards: [TasteCard] { model.store.pending(in: section.slot) }

    /// The tile whose list the grey note under the sentence edits.
    private var listTile: TasteTile? {
        switch section.slot {
        case .shape: .signatureDetails
        case .space: .layoutHabits
        case .avoid: .avoid
        default: nil
        }
    }

    private var popoverBinding: Binding<Bool> {
        Binding(
            get: { model.popover?.slot == section.slot && model.popover != .craft },
            set: { if !$0 { model.closePopover() } }
        )
    }

    var body: some View {
        HStack(alignment: .center, spacing: 40) {
            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                Text(section.label)
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(0.6)
                    .foregroundStyle(.secondary)
                sentence
                ForEach(cards, id: \.id) { card in ask(card) }
                note
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            TasteSpecimenView(kind: section.specimen, board: board)
                .frame(width: 220, alignment: .leading)
        }
        .padding(.vertical, 28)
        .overlay(alignment: .top) { Divider().opacity(0.5) }
    }

    @ViewBuilder private var sentence: some View {
        let text = Text(TasteSentence.attributed(section.segments, editable: model.store.canEdit))
            .font(.system(size: 26, weight: .semibold))
            .tracking(-0.8)
            .lineSpacing(3)
            .foregroundStyle(.primary)
            .tint(TasteSentence.choiceGray)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        Group {
            if section.slot == .avoid {
                Button { model.open(.list(.avoid)) } label: { text }
                    .buttonStyle(.plain)
            } else {
                text.environment(\.openURL, OpenURLAction { url in
                    guard let choice = TasteSentence.choice(from: url) else { return .discarded }
                    model.open(.choice(choice))
                    return .handled
                })
            }
        }
        // Anchored to the sentence itself, so the menu opens right under it.
        .popover(isPresented: popoverBinding, arrowEdge: .bottom) { popoverContent }
    }

    @ViewBuilder private var note: some View {
        if let tile = listTile, tile != .avoid {
            Button { model.open(.list(tile)) } label: {
                Text(section.note ?? (tile == .signatureDetails ? String(localized: "Add a detail you repeat") : String(localized: "Add a habit you keep")))
                    .font(.callout)
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
            .disabled(!model.store.canEdit)
        }
    }

    private func ask(_ card: TasteCard) -> some View {
        let isChoiceCard = TasteSlot.slot(for: card.tile) != nil && [.motion, .typography, .shape, .density, .spacing, .voice].contains(card.tile)
        return HStack(spacing: OrionSpacing.sm) {
            Text(isChoiceCard ? card.reason : "\(TasteCardText.headline(card)). \(card.reason)")
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(isChoiceCard ? TasteSentence.yesLabel(for: section.segments) : String(localized: "Yes")) {
                Task { await model.store.decide(card, .kept) }
            }
            .buttonStyle(OrionButtonStyle(.primary))
            Button("No thanks") { Task { await model.store.decide(card, .rejected) } }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
        }
        .padding(.top, OrionSpacing.xxs)
    }

    @ViewBuilder private var popoverContent: some View {
        switch model.popover {
        case .choice(let choice):
            TasteChoiceMenu(model: model, choice: choice)
        case .list(let tile):
            ListEditor(tile: tile, model: model)
                .padding(OrionSpacing.md)
                .frame(width: 340)
        default:
            EmptyView()
        }
    }
}

/// The small menu that opens under a tapped word. Hovering an option previews it; clicking saves it.
struct TasteChoiceMenu: View {
    @Bindable var model: TasteModel
    let choice: TasteChoiceID

    private var current: String? { model.store.board.map { choice.value(in: $0) } }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(choice.options) { option in
                Button { select(option) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(option.title).font(.body.weight(.semibold))
                            Text(option.meaning).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer(minLength: OrionSpacing.sm)
                        if option.value == current { Image(systemName: "checkmark").font(.callout.weight(.bold)) }
                    }
                    .padding(.horizontal, OrionSpacing.sm)
                    .padding(.vertical, OrionSpacing.xs)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(model.hoveredOption?.value == option.value ? Color.primary.opacity(0.08) : .clear,
                                in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .onHover { model.hoveredOption = $0 ? (choice, option.value) : nil }
            }
        }
        .padding(OrionSpacing.xs)
        .frame(width: 300)
    }

    private func select(_ option: TasteChoiceOption) {
        guard let board = model.store.board, let next = choice.applying(option.value, to: board) else { return }
        let tile = choice.tile
        Task {
            await model.store.save(tile, to: next.value(for: tile))
            model.closePopover()
        }
    }
}
