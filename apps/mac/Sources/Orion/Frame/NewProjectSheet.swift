import SwiftUI

/// Name and colour for a new project. On success the new project opens on
/// its Main chat.
struct NewProjectSheet: View {
    let frame: FrameModel

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var color = "blue"
    @State private var isSaving = false

    var body: some View {
        Form {
            TextField("Name", text: $name)
            Picker("Colour", selection: $color) {
                ForEach(ProjectStyle.colorKeys, id: \.self) { key in
                    Label {
                        Text(ProjectStyle.colorName(key))
                    } icon: {
                        Circle()
                            .fill(ProjectStyle.color(key))
                            .frame(width: 10, height: 10)
                    }
                    .tag(key)
                }
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 360)
        .navigationTitle("New Project")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Create", action: create)
                    .disabled(trimmedName.isEmpty || isSaving)
            }
        }
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func create() {
        isSaving = true
        Task {
            let created = await frame.createProject(name: trimmedName, color: color)
            isSaving = false
            if created { dismiss() }
        }
    }
}
