import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Stub editor; Task 7 fills in the tile panels.
struct TasteEditPanel: View {
    let tile: TasteTile
    @Bindable var model: TasteModel

    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Button("‹ Back to your taste") { model.closePanel() }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            Text(TasteChapters.row(for: tile).title)
                .font(.title3.weight(.semibold))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(.trailing, OrionSpacing.md)
    }
}
