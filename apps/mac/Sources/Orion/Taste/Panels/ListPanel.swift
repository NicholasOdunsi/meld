import OrionDesignSystem
import ShelfCore
import SwiftUI

struct ListPanel: View {
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

    var body: some View {
        TastePanelChrome(tile: tile, model: model) {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                if items.isEmpty {
                    Text("None yet. Add one below, or tap an idea.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(spacing: OrionSpacing.xs) {
                        ForEach(items, id: \.self) { item in
                            HStack {
                                Text(item)
                                    .font(.body)
                                Spacer(minLength: OrionSpacing.sm)
                                Button {
                                    remove(item)
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 24, height: 24)
                                        .contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Remove \(item)")
                            }
                            .padding(.horizontal, OrionSpacing.sm)
                            .padding(.vertical, OrionSpacing.xs)
                            .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.small, style: .continuous))
                        }
                    }
                }

                HStack(spacing: OrionSpacing.xs) {
                    TextField("Add one…", text: $draft)
                        .textFieldStyle(.roundedBorder)
                        .disabled(isFull)
                        .onSubmit { add(draft) }
                    Button {
                        add(draft)
                    } label: {
                        Image(systemName: "plus")
                            .font(.body.weight(.semibold))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    .disabled(isFull || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if isFull {
                    Text("You've reached the limit. Remove one to add another.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Text("Ideas people like you often keep")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TasteDashedChips(items: suggestions.filter { suggestion in
                    !items.contains { $0.caseInsensitiveCompare(suggestion) == .orderedSame }
                }) { suggestion in
                    add(suggestion)
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
