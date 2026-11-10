import AppKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// Edit a project's company logo and name in one place — the same dialog as
/// New Project, filled in. Shown by `OrionFrameView`.
struct EditProjectDialog: View {
    let frame: FrameModel
    let project: FrameProject

    @State private var name: String
    @State private var logo: NSImage?
    @State private var logoChanged = false
    @FocusState private var isNameFocused: Bool

    init(frame: FrameModel, project: FrameProject) {
        self.frame = frame
        self.project = project
        _name = State(initialValue: project.name)
        _logo = State(initialValue: ProjectLogoStore.image(for: project.id))
    }

    var body: some View {
        OrionDialog(
            title: Text("Edit Project"),
            actionTitle: "Save",
            canConfirm: !trimmedName.isEmpty,
            onCancel: close,
            onConfirm: save
        ) {
            LogoWell(logo: $logo)
                .frame(maxWidth: .infinity)
                .onChange(of: logo) { logoChanged = true }

            TextField("Name", text: $name)
                .orionDialogField()
                .focused($isNameFocused)
                .onSubmit(save)
        }
        .defaultFocus($isNameFocused, true)
        .onAppear { isNameFocused = true }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func close() {
        frame.editingProject = nil
    }

    private func save() {
        let newName = trimmedName
        guard !newName.isEmpty else { return }
        if logoChanged {
            if let logo {
                do {
                    try ProjectLogoStore.save(logo, for: project.id)
                } catch {
                    frame.errorMessage = String(localized: "The company logo could not be saved. Choose an image and try again.")
                }
            } else {
                ProjectLogoStore.remove(for: project.id)
            }
            frame.logoRevision += 1
        }
        close()
        guard newName != project.name else { return }
        Task { await frame.rename(project, to: newName) }
    }
}
