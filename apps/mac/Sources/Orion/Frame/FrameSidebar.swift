import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The Orion sidebar: header (logo, name), Overview, New Project, Inspiration,
/// Taste, a flat list of projects, and Settings pinned to the footer. Every icon, the logo and the section label share one left
/// edge (`FrameMetrics.contentEdge`); every row has the same height and
/// corners. Nothing opens up under a project (Apple HIG: ≤ two levels).
struct FrameSidebar: View {
    @Bindable var frame: FrameModel

    @State private var renameTarget: FrameProject?
    @State private var renameText = ""
    @State private var deleteTarget: FrameProject?
    /// Project waiting for a logo pick. Kept separate from `isChoosingLogo` so
    /// dismissing the importer (which sets the Bool false) can't clear the
    /// project before the result handler reads it.
    @State private var logoTarget: FrameProject?
    @State private var isChoosingLogo = false
    @State private var logoRevision = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: FrameMetrics.groupSpacing) {
                group {
                    row("Overview", .house, .home)
                    SidebarRow("New Project", icon: .plus, isSelected: false) {
                        frame.isCreatingProject = true
                    }
                    .help("New project (⌘N)")
                    row("Inspiration", .lightbulb, .inspiration)
                    row("Taste", .sparkle, .taste, badge: frame.snapshot?.hasTasteUpdates == true ? String(localized: "New") : nil)
                }

                VStack(alignment: .leading, spacing: FrameMetrics.projectRowSpacing) {
                    Text("Projects")
                        .font(.system(size: FrameMetrics.sectionLabelSize, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .padding(.leading, FrameMetrics.rowPadding)
                        .padding(.bottom, FrameMetrics.sectionLabelBottom)
                    ForEach(frame.snapshot?.projects ?? []) { project in
                        projectRow(project)
                    }
                }
                .padding(.horizontal, FrameMetrics.sidebarInset)
            }
            .padding(.bottom, FrameMetrics.rowPadding)
        }
        .scrollIndicators(.never)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            group {
                row("Settings", .gearSix, .settings)
            }
            .padding(.vertical, FrameMetrics.rowPadding)
        }
        .alert("Rename Project", isPresented: isRenaming, presenting: renameTarget) { project in
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Rename") {
                let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name != project.name else { return }
                Task { await frame.rename(project, to: name) }
            }
        }
        .confirmationDialog(
            deleteTitle,
            isPresented: isDeleting,
            titleVisibility: .visible,
            presenting: deleteTarget
        ) { project in
            Button("Delete", role: .destructive) {
                Task { await frame.delete(project) }
            }
        } message: { project in
            Text("This deletes \(project.name) and its ^[\(frame.chatCount(for: project)) chat](inflect: true). This can't be undone.")
        }
        .fileImporter(isPresented: $isChoosingLogo, allowedContentTypes: [.image]) { result in
            let project = logoTarget
            logoTarget = nil
            guard let project else { return }
            if case .success(let url) = result {
                do {
                    try ProjectLogoStore.save(url, for: project.id)
                    logoRevision += 1
                } catch {
                    frame.errorMessage = "The company logo could not be saved. Choose an image and try again."
                }
            }
        }
    }

    private func group<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: FrameMetrics.rowSpacing, content: content)
            .padding(.horizontal, FrameMetrics.sidebarInset)
    }

    private func row(_ title: String, _ icon: OrionIcon, _ destination: FrameDestination, badge: String? = nil) -> some View {
        SidebarRow(title, icon: icon, isSelected: frame.destination == destination, badge: badge) {
            frame.open(destination)
        }
    }

    private func projectRow(_ project: FrameProject) -> some View {
        SidebarRow(title: project.name, isSelected: frame.destination == .project(project.id), isProject: true, action: {
            frame.open(.project(project.id))
        }) { _ in
            // Company logo wins once set — otherwise a working/needs-you hat
            // would cover it and look like the logo never stuck.
            if ProjectLogoStore.image(for: project.id) != nil {
                ProjectMark(project: project, revision: logoRevision)
            } else if let activity = frame.snapshot?.projectActivity[project.id] {
                OrionHatMark(
                    state: activity.state == .working ? .working : .needsYou,
                    tint: ProjectStyle.color(project.color),
                    hop: true,
                    label: activity.label
                )
            } else {
                ProjectMark(project: project, revision: logoRevision)
            }
        }
        .contextMenu {
            Button("Set Company Logo…") {
                logoTarget = project
                isChoosingLogo = true
            }
            if ProjectLogoStore.image(for: project.id) != nil {
                Button("Remove Company Logo") {
                    ProjectLogoStore.remove(for: project.id)
                    logoRevision += 1
                }
            }
            Button("Rename…") {
                renameText = project.name
                renameTarget = project
            }
            Button("Delete…", role: .destructive) {
                deleteTarget = project
            }
        }
    }

    private var deleteTitle: Text {
        Text("Delete \(deleteTarget?.name ?? "")?")
    }

    private var isRenaming: Binding<Bool> {
        Binding { renameTarget != nil } set: { if !$0 { renameTarget = nil } }
    }

    private var isDeleting: Binding<Bool> {
        Binding { deleteTarget != nil } set: { if !$0 { deleteTarget = nil } }
    }

}
