import OrionDesignSystem
import ShelfCore
import SwiftUI

/// One section of the page: a label, one big sentence, a live specimen, and any suggestion for it.
struct TasteSectionView: View {
    @Bindable var model: TasteModel
    let section: TasteDocSection
    let board: TasteBoard

    private var cards: [TasteCard] { model.store.pending(in: section.slot) }

    /// The tile whose list the pills under the sentence edit.
    private var listTile: TasteTile? {
        switch section.slot {
        case .shape: .signatureDetails
        case .space: .layoutHabits
        case .avoid: .avoid
        default: nil
        }
    }

    private var choicePopover: Binding<Bool> {
        Binding(
            get: {
                if case .choice(let id) = model.popover { return id.slot == section.slot }
                return false
            },
            set: { if !$0 { model.closePopover() } }
        )
    }

    private var listPopover: Binding<Bool> {
        Binding(
            get: {
                if case .list(let tile) = model.popover { return TasteSlot.slot(for: tile) == section.slot }
                return false
            },
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
                note
                ForEach(cards, id: \.id) { card in ask(card) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            TasteSpecimenView(kind: section.specimen, board: board)
                .frame(width: 220, alignment: .leading)
        }
        .padding(.vertical, 28)
        .overlay(alignment: .top) { Divider().opacity(0.5) }
    }

    @ViewBuilder private var sentence: some View {
        if section.slot != .avoid {
            TasteSentenceView(segments: section.segments, editable: model.store.canEdit) { model.open(.choice($0)) }
                .popover(isPresented: choicePopover, arrowEdge: .bottom) {
                    if case .choice(let choice) = model.popover {
                        TasteChoiceMenu(model: model, choice: choice)
                    }
                }
        }
    }

    @ViewBuilder private var note: some View {
        if let tile = listTile {
            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                if tile != .avoid, !section.noteItems.isEmpty {
                    Text("You often use")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
                FlowLayout(spacing: OrionSpacing.xs) {
                    ForEach(section.noteItems, id: \.self) { item in
                        TasteNotePill(text: item) {
                            guard model.store.canEdit else { return }
                            model.open(.list(tile))
                        }
                    }
                    TasteAddPill { model.open(.list(tile)) }
                        .disabled(!model.store.canEdit)
                        .accessibilityLabel(addLabel(for: tile))
                }
            }
            .padding(.top, section.slot == .avoid ? 0 : OrionSpacing.xxs)
            .popover(isPresented: listPopover, arrowEdge: .bottom) {
                ListEditor(tile: tile, model: model)
                    .padding(OrionSpacing.md)
                    .frame(width: 340)
            }
        }
    }

    private func addLabel(for tile: TasteTile) -> String {
        switch tile {
        case .signatureDetails: String(localized: "Add a detail you repeat")
        case .layoutHabits: String(localized: "Add a habit you keep")
        case .avoid: String(localized: "Add something to steer clear of")
        default: String(localized: "Add")
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
            .pointerStyle(.link)
            Button("No thanks") { Task { await model.store.decide(card, .rejected) } }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .contentShape(.rect)
                .pointerStyle(.link)
        }
        .padding(.top, OrionSpacing.xxs)
    }
}

/// A habit / detail / avoid chip. Click opens the list editor.
private struct TasteNotePill: View {
    let text: String
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Text(text)
                .font(.caption)
                .foregroundStyle(isHovering ? Color.primary : Color.secondary)
                .lineLimit(1)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(minHeight: 28)
                .background(Color.primary.opacity(isHovering ? 0.14 : 0.08), in: Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .contentShape(.capsule)
        .onHover { isHovering = $0 }
        .pointerStyle(.link)
    }
}

/// Same size as a note pill, but only a plus — opens the list editor.
private struct TasteAddPill: View {
    let action: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "plus")
                .font(.caption.weight(.bold))
                .foregroundStyle(isHovering ? Color.primary : Color.secondary)
                .frame(minWidth: 28, minHeight: 28)
                .padding(.horizontal, 10)
                .background(Color.primary.opacity(isHovering ? 0.14 : 0.08), in: Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .contentShape(.capsule)
        .onHover { isHovering = $0 }
        .pointerStyle(.link)
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
                .pointerStyle(.link)
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
