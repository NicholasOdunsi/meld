import OrionAppCore
import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Pick a project to attach the selected inspiration images to (via that
/// project's main chat — the Shelf API links images to rooms).
struct UseInProjectDialog: View {
    let ids: Set<UUID>
    @Bindable var model: InspirationModel
    let frame: FrameModel

    @State private var projects: [ProjectChoice] = []
    @State private var picked: ProjectChoice?
    @State private var isLoading = true

    var body: some View {
        OrionDialog(
            title: Text("Use in project"),
            actionTitle: "Use",
            canConfirm: picked != nil,
            onCancel: { model.dialog = nil },
            onConfirm: confirm
        ) {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else if projects.isEmpty {
                Text("No projects yet.").foregroundStyle(.secondary)
            } else {
                VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                    ForEach(projects) { project in
                        Button {
                            picked = project
                        } label: {
                            HStack(spacing: OrionSpacing.sm) {
                                projectMark(for: project)
                                Text(project.name)
                                    .lineLimit(1)
                                Spacer(minLength: 0)
                                if picked == project {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(OrionColor.dayBreakBlue.color)
                                }
                            }
                            .padding(.horizontal, OrionSpacing.sm)
                            .frame(minHeight: 36)
                            .background(
                                picked == project ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.clear),
                                in: .rect(cornerRadius: 8)
                            )
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .task {
            let rooms = await model.store.rooms()
            projects = ProjectChoice.from(rooms: rooms, frameProjects: frame.snapshot?.projects ?? [])
            isLoading = false
        }
    }

    @ViewBuilder
    private func projectMark(for choice: ProjectChoice) -> some View {
        if let id = choice.projectID,
           let project = frame.snapshot?.projects.first(where: { $0.id == id }) {
            ProjectMark(project: project, revision: frame.logoRevision)
        } else {
            // Fallback monogram when the Shelf room's project isn't in the frame yet.
            Text(String(choice.name.prefix(1)).uppercased())
                .font(.system(size: 12, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(
                    LinearGradient(
                        colors: [OrionColor.dayBreakBlue.color, OrionColor.dayBreakBlue.color.opacity(0.65)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: .rect(cornerRadius: 5)
                )
        }
    }

    private func confirm() {
        guard let project = picked else { return }
        model.dialog = nil
        Task {
            if await model.store.addToRoom(ids, room: project.room) {
                model.toast = String(localized: "Added \(ids.count) images to \(project.name)")
                model.selection = []
            }
        }
    }
}
