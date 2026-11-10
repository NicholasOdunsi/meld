import OrionDesignSystem
import ShelfCore
import SwiftUI

struct SpacingControls: View {
    @Bindable var model: TasteModel

    private var selected: TasteSpacing { model.store.board?.spacing ?? .comfortable }

    var body: some View {
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

        }
    }
}
