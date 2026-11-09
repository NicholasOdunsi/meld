import OrionDesignSystem
import SwiftUI

struct SelectionBar: View {
    @Bindable var model: InspirationModel

    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            Text("\(model.selection.count) selected")
            Button("Delete") { model.dialog = .delete(model.selection) }
                .buttonStyle(OrionButtonStyle(.secondary))
                .disabled(!model.store.canEdit)
            Button("Add to Chat…") { model.dialog = .addToChat(model.selection) }
                .buttonStyle(OrionButtonStyle())
                .disabled(!model.store.canEdit)
        }
        .padding(.horizontal, OrionSpacing.md)
        .padding(.vertical, OrionSpacing.sm)
        .glassEffect(.regular, in: .capsule)
    }
}
