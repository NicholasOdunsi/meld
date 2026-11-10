import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Taste as one page you read: a headline, six sentences with live examples, a quiet footer.
struct TasteDocumentView: View {
    @Bindable var model: TasteModel
    /// The saved board: the headline and sentences come from this, so they never move while you hover a menu option.
    let board: TasteBoard
    /// The board with the hovered option applied: only the small examples use this.
    let previewBoard: TasteBoard
    let isOffline: Bool

    private var moodPending: [TasteCard] { model.store.pending(in: .mood) }

    private var moodBinding: Binding<Bool> {
        Binding(get: { model.popover == .list(.designLanguage) }, set: { if !$0 { model.closePopover() } })
    }

    private var craftBinding: Binding<Bool> {
        Binding(get: { model.popover == .craft }, set: { if !$0 { model.closePopover() } })
    }

    /// The sentences, with the first pending suggestion for each section shown inside it.
    private var sections: [TasteDocSection] {
        TasteDocument.sections(for: board).map { base in
            guard let card = model.store.pending(in: base.slot).first, let preview = model.store.preview(card),
                  let changed = TasteDocument.sections(for: board, previewing: preview).first(where: { $0.slot == base.slot })
            else { return base }
            return changed
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if isOffline {
                    Label("Offline. You can look, but not change anything.", systemImage: "wifi.slash")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.bottom, OrionSpacing.sm)
                }
                Text(TasteDocument.headline(board))
                    .font(.system(size: 56, weight: .heavy))
                    .tracking(-2.6)
                    .lineSpacing(-4)
                    .fixedSize(horizontal: false, vertical: true)
                mood
                    .padding(.top, OrionSpacing.sm)
                    .padding(.bottom, OrionSpacing.lg)
                ForEach(sections) { section in
                    TasteSectionView(model: model, section: section, board: previewBoard)
                }
                footer
                    .padding(.top, OrionSpacing.lg)
            }
            .frame(maxWidth: 780, alignment: .leading)
            .padding(.horizontal, 40)
            .padding(.top, 48)
            .padding(.bottom, 170)
            .frame(maxWidth: .infinity)
        }
    }

    private var mood: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Button { model.open(.list(.designLanguage)) } label: {
                Text(board.designLanguage.isEmpty ? String(localized: "Add mood words") : board.designLanguage.joined(separator: " · "))
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .disabled(!model.store.canEdit)
            .popover(isPresented: moodBinding, arrowEdge: .bottom) {
                ListEditor(tile: .designLanguage, model: model)
                    .padding(OrionSpacing.md)
                    .frame(width: 340)
            }
            ForEach(moodPending, id: \.id) { card in
                HStack(spacing: OrionSpacing.sm) {
                    Text("\(TasteCardText.headline(card)). \(card.reason)").font(.callout).foregroundStyle(.secondary)
                    Button("Yes") { Task { await model.store.decide(card, .kept) } }
                        .buttonStyle(OrionButtonStyle(.primary))
                    Button("No thanks") { Task { await model.store.decide(card, .rejected) } }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            Button("See it on two screens ›") { model.isPreviewing = true }
                .buttonStyle(.plain)
            Button("Orion always follows \(TasteCraftRules.all.count) craft rules ›") { model.open(.craft) }
                .buttonStyle(.plain)
                .popover(isPresented: craftBinding, arrowEdge: .top) { CraftRulesList() }
        }
        .font(.callout)
        .foregroundStyle(.secondary)
    }
}

/// Read-only: what Orion always does, whatever your taste says.
struct CraftRulesList: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.sm) {
                Text("Craft rules").font(.headline)
                Text(TasteSlot.craft.explanation).font(.caption).foregroundStyle(.secondary)
                ForEach(TasteCraftRules.all) { rule in
                    VStack(alignment: .leading, spacing: 1) {
                        Text(rule.title).font(.callout.weight(.semibold))
                        Text(rule.reason).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(OrionSpacing.md)
        }
        .frame(width: 340, height: 420)
    }
}
