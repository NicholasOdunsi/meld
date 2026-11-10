import OrionDesignSystem
import ShelfCore
import SwiftUI

struct ListEditor: View {
    let tile: TasteTile
    @Bindable var model: TasteModel
    @State private var draft = ""

    private var board: TasteBoard? { model.store.board }

    private var items: [String] {
        guard let board else { return [] }
        switch tile {
        case .designLanguage: return board.designLanguage
        case .layoutHabits: return board.layoutHabits
        case .signatureDetails: return board.signatureDetails
        case .avoid: return board.avoid.map(\.text)
        default: return []
        }
    }

    private var limit: Int {
        switch tile {
        case .designLanguage: 4
        case .layoutHabits: 5
        case .signatureDetails: 6
        case .avoid: 12
        default: 0
        }
    }

    private var maxLength: Int {
        switch tile {
        case .designLanguage: 24
        case .layoutHabits, .avoid: 80
        case .signatureDetails: 60
        default: 80
        }
    }

    private var suggestions: [String] {
        switch tile {
        case .designLanguage: ["minimal", "warm", "playful", "bold-type"]
        case .layoutHabits: ["Sticky bottom button", "Big hero number", "Cards in a row", "Sidebar plus one column"]
        case .signatureDetails: ["Pill buttons", "Soft shadows", "Rounded inputs", "Full-width primary button"]
        case .avoid: ["gradients", "drop shadows", "thin type", "stock photos"]
        default: []
        }
    }

    private var isFull: Bool { items.count >= limit }

    private var title: String {
        switch tile {
        case .avoid: String(localized: "Steer clear of")
        case .designLanguage: String(localized: "Mood words")
        case .layoutHabits: String(localized: "Habits you keep")
        case .signatureDetails: String(localized: "Details you repeat")
        default: ""
        }
    }

    private var ideas: [String] {
        suggestions.filter { idea in !items.contains { $0.caseInsensitiveCompare(idea) == .orderedSame } }
    }

    private var canAdd: Bool { !isFull && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.sm) {
            Text(title).font(.headline)

            if !items.isEmpty {
                FlowLayout(spacing: OrionSpacing.xs) {
                    ForEach(items, id: \.self) { item in
                        ListItemChip(text: item) { remove(item) }
                    }
                }
            }

            HStack(spacing: OrionSpacing.xs) {
                Image(systemName: "plus").font(.callout.weight(.semibold)).foregroundStyle(.secondary)
                TextField(isFull ? "Limit reached" : "Add one…", text: $draft)
                    .textFieldStyle(.plain)
                    .focusEffectDisabled()
                    .disabled(isFull)
                    .onSubmit { add(draft) }
                if canAdd {
                    Button("Add") { add(draft) }
                        .buttonStyle(.plain)
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(OrionColor.dayBreakBlue.color)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 4)
                        .contentShape(.rect)
                        .pointerStyle(.link)
                }
            }
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xs + 2)
            .background(Color.white.opacity(0.08), in: Capsule(style: .continuous))
            .overlay { Capsule(style: .continuous).strokeBorder(Color.white.opacity(0.14), lineWidth: 1) }

            if isFull {
                Text("You've reached the limit. Remove one to add another.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if !ideas.isEmpty && !isFull {
                Text("Ideas").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                FlowLayout(spacing: OrionSpacing.xs) {
                    ForEach(ideas, id: \.self) { idea in
                        ListIdeaChip(text: idea) { add(idea) }
                    }
                }
            }
        }
    }

    private func add(_ raw: String) {
        let prepared = tile == .designLanguage
            ? raw.lowercased()
            : raw
        guard let next = TasteEdits.adding(prepared, to: items, limit: limit, maxLength: maxLength) else { return }
        draft = ""
        Task { await save(next) }
    }

    private func remove(_ text: String) {
        let next = TasteEdits.removing(text, from: items)
        Task { await save(next) }
    }

    private func save(_ texts: [String]) async {
        switch tile {
        case .avoid:
            let existing = board?.avoid ?? []
            let next = texts.map { text in
                existing.first { $0.text == text } ?? TasteAvoid(text: text, source: "typed")
            }
            _ = await model.store.save(.avoid, to: TasteEdits.avoidJSON(next))
        default:
            _ = await model.store.save(tile, to: TasteEdits.jsonStrings(texts))
        }
    }
}


/// An item you have already added, with a small x to remove it.
private struct ListItemChip: View {
    let text: String
    let remove: () -> Void
    @State private var isHovering = false

    var body: some View {
        HStack(spacing: 6) {
            Text(text).font(.callout)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(isHovering ? .primary : .tertiary)
                    .frame(width: 22, height: 22)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain)
            .pointerStyle(.link)
            .accessibilityLabel("Remove \(text)")
        }
        .padding(.leading, 12)
        .padding(.trailing, 8)
        .padding(.vertical, 7)
        .frame(minHeight: 28)
        .background(Color.white.opacity(isHovering ? 0.16 : 0.1), in: Capsule(style: .continuous))
        .contentShape(.capsule)
        .onHover { isHovering = $0 }
    }
}

/// An idea you can add with one click.
private struct ListIdeaChip: View {
    let text: String
    let add: () -> Void
    @State private var isHovering = false

    var body: some View {
        Button(action: add) {
            HStack(spacing: 5) {
                Image(systemName: "plus").font(.caption2.weight(.bold))
                Text(text).font(.callout)
            }
            .foregroundStyle(isHovering ? Color.white : Color(white: 0.72))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 28)
            .background(Color.white.opacity(isHovering ? 0.14 : 0.06), in: Capsule(style: .continuous))
        }
        .buttonStyle(.plain)
        .contentShape(.capsule)
        .onHover { isHovering = $0 }
        .pointerStyle(.link)
    }
}
