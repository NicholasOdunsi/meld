import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The Orion sidebar: header (logo, name), Overview, New Project, Inspiration,
/// Taste, a flat list of projects, and Settings pinned to the footer. Every icon, the logo and the section label share one left
/// edge (`FrameMetrics.contentEdge`); every row has the same height and
/// corners. Nothing opens up under a project (Apple HIG: ≤ two levels).
struct FrameSidebar: View {
    @Bindable var frame: FrameModel


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
                ProjectMark(project: project, revision: frame.logoRevision)
            } else if let activity = frame.snapshot?.projectActivity[project.id] {
                OrionHatMark(
                    state: activity.state == .working ? .working : .needsYou,
                    tint: ProjectStyle.color(project.color),
                    hop: true,
                    label: activity.label
                )
            } else {
                ProjectMark(project: project, revision: frame.logoRevision)
            }
        }
        .contextMenu {
            Button("Edit Project…") {
                frame.editingProject = project
            }
            Button("Delete…", role: .destructive) {
                frame.deletingProject = project
            }
        }
    }
}
