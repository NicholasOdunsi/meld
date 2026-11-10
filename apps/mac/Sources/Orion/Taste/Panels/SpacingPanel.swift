import OrionDesignSystem
import ShelfCore
import SwiftUI

struct SpacingPanel: View {
    @Bindable var model: TasteModel

    private var selected: TasteSpacing { model.store.board?.spacing ?? .comfortable }

    var body: some View {
        TastePanelChrome(tile: .spacing, model: model) {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                HStack(alignment: .top, spacing: OrionSpacing.xs) {
                    ForEach(TasteSpacing.allCases, id: \.self) { spacing in
                        PictureChoice(
                            title: spacing.rawValue.capitalized,
                            isSelected: selected == spacing
                        ) {
                            Task { await model.store.save(.spacing, to: .string(spacing.rawValue)) }
                        } picture: {
                            MiniScreen(.spacing(spacing))
                        }
                    }
                }

                Text("Quick starts")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TasteDashedChips(items: ["Make it feel like Apple"]) { _ in
                    Task { await model.composeAppleQuickStart() }
                }
            }
        }
    }
}
