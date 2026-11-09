import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// Confirm deleting a project, in Orion's dialog shape with the red action.
/// Shown by `OrionFrameView`.
struct DeleteProjectDialog: View {
    let frame: FrameModel
    let project: FrameProject

    var body: some View {
        OrionDialog(
            title: Text("Delete \(project.name)?"),
            message: Text("This deletes \(project.name) and its ^[\(frame.chatCount(for: project)) chat](inflect: true). This can't be undone."),
            actionTitle: "Delete",
            isDestructive: true,
            onCancel: close,
            onConfirm: delete
        ) {
            EmptyView()
        }
    }

    private func close() {
        frame.deletingProject = nil
    }

    private func delete() {
        close()
        Task { await frame.delete(project) }
    }
}
