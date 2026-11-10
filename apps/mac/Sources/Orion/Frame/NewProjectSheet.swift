import AppKit
import OrionDesignSystem
import SwiftUI

/// A new project: optional company logo, then its name. Orion picks the
/// colour. Shown over the window by `OrionFrameView`. On success the new
/// project opens on its Main chat.
struct NewProjectSheet: View {
    let frame: FrameModel

    @State private var name = ""
    @State private var logo: NSImage?
    @State private var isSaving = false
    @FocusState private var isNameFocused: Bool

    var body: some View {
        OrionDialog(
            title: Text("New Project"),
            actionTitle: "Create",
            canConfirm: !trimmedName.isEmpty && !isSaving,
            onCancel: close,
            onConfirm: create
        ) {
            LogoWell(logo: $logo)
                .frame(maxWidth: .infinity)

            TextField("Name", text: $name)
                .orionDialogField()
                .focused($isNameFocused)
                .onSubmit(create)
        }
        // Start typing the name straight away.
        .defaultFocus($isNameFocused, true)
        .onAppear { isNameFocused = true }
    }

    private func close() {
        frame.isCreatingProject = false
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() {
        guard !trimmedName.isEmpty, !isSaving else { return }
        isSaving = true
        let color = ProjectStyle.nextColor(after: frame.snapshot?.projects.map(\.color) ?? [])
        Task {
            let projectID = await frame.createProject(name: trimmedName, color: color)
            isSaving = false
            guard let projectID else { return }
            if let logo, !projectID.isEmpty {
                do {
                    try ProjectLogoStore.save(logo, for: projectID)
                } catch {
                    frame.errorMessage = String(localized: "The project was created, but its company logo could not be saved. Right-click the project to set it again.")
                }
            }
            close()
        }
    }
}
