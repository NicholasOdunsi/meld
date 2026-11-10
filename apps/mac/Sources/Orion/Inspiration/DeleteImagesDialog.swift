import SwiftUI

struct DeleteImagesDialog: View {
    let ids: Set<UUID>
    @Bindable var model: InspirationModel

    var body: some View {
        OrionDialog(
            title: Text(ids.count == 1 ? "Delete this image?" : "Delete \(ids.count) images?"),
            message: Text("They'll be removed from Inspiration and from any chats using them. This can't be undone."),
            actionTitle: "Delete",
            isDestructive: true,
            onCancel: { model.dialog = nil },
            onConfirm: {
                model.dialog = nil
                Task {
                    if await model.store.delete(ids) { model.selection.subtract(ids) }
                }
            }
        ) {
            EmptyView()
        }
    }
}
