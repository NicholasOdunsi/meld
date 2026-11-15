import OrionAppCore
import SwiftUI

/// The Orion window: a native sidebar column and a detail column. The sidebar
/// toggle lives in the real window toolbar so it shares the traffic-light line.
struct OrionFrameView<Content: View>: View {
    @Bindable var frame: FrameModel
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: 0) {
            if frame.isAvailable && frame.isSidebarOpen {
                sidebar
                    .frame(width: 250)
                    .transition(.move(edge: .leading).combined(with: .opacity))
                // Faint rule so the glass columns still read as separate.
                Rectangle()
                    .fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
                    .frame(width: FrameMetrics.columnDividerWidth)
                    .ignoresSafeArea()
            }
            detail
        }
        .animation(.snappy(duration: 0.2), value: frame.isSidebarOpen)
        .animation(.snappy(duration: 0.2), value: frame.isAvailable)
        // Whole window sits on glass; the web page paints transparent so this shows through.
        .background {
            WindowGlass.content
                .ignoresSafeArea()
        }
        .overlay {
            GeometryReader { geometry in
                if frame.currentProject != nil, let panel = frame.projectPanel {
                    let detailWidth = geometry.size.width - (frame.isSidebarOpen ? 251.0 : 0.0)
                    let panelWidth = panel == .todo || panel == .star ? 310.0 : detailWidth * (panel == .canvas ? 0.72 : 0.45)
                    Rectangle()
                        .fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
                        .frame(width: FrameMetrics.columnDividerWidth)
                        .position(x: geometry.size.width - panelWidth, y: geometry.size.height / 2)
                        .ignoresSafeArea()
                        .allowsHitTesting(false)
                    Text(panel == .todo ? "Constellations" : panel == .star ? "Star" : panel == .canvas ? "Canvas" : "Artifacts")
                        .font(.headline)
                        .frame(width: panelWidth - 32, alignment: .leading)
                        .position(x: geometry.size.width - panelWidth / 2, y: 26)
                        .allowsHitTesting(false)
                }
            }
            .ignoresSafeArea()
        }
        .navigationTitle(title)
        // Fullscreen still paints an opaque titlebar unless both the style and
        // the visibility are cleared — otherwise a solid black strip sits above
        // the glass sidebar/content.
        .toolbarBackground(.hidden, for: .windowToolbar)
        .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        .toolbar(removing: frame.isAvailable ? .title : nil)
        .toolbar {
            if frame.isAvailable {
                ToolbarItem(placement: .navigation) {
                    SquareIconButton(
                        frame.isSidebarOpen ? "Hide Sidebar" : "Show Sidebar",
                        icon: .sidebar,
                        isQuiet: true
                    ) {
                        frame.toggleSidebar()
                    }
                    .help(frame.isSidebarOpen
                          ? String(localized: "Hide sidebar (⌃⌘S)")
                          : String(localized: "Show sidebar (⌃⌘S)"))
                    // Gap after the traffic lights. Hidden shared background
                    // so padding isn't swallowed inside the system capsule.
                    .padding(.leading, FrameMetrics.toolbarToggleLeading)
                }
                .sharedBackgroundVisibility(.hidden)
                if let project = frame.currentProject {
                    ToolbarItem(placement: .navigation) {
                        HStack(spacing: FrameMetrics.iconTextSpacing) {
                            ProjectMark(project: project, revision: frame.logoRevision)
                            Text(project.name).font(.headline).lineLimit(1)
                        }
                        .padding(.leading, frame.isSidebarOpen ? 132 : FrameMetrics.contentEdge)
                    }
                    .sharedBackgroundVisibility(.hidden)
                    ToolbarSpacer(.flexible, placement: .primaryAction)
                    ToolbarItemGroup(placement: .primaryAction) {
                        projectAction("Constellations", icon: "checklist", panel: .todo)
                        projectAction("Canvas", icon: "rectangle.on.rectangle.angled", panel: .canvas)
                        projectAction("Artifacts", icon: "tray.full", panel: .artifacts)
                    }
                    .sharedBackgroundVisibility(.hidden)
                }
            }
        }
        // Orion's dialogs are drawn in the window (not system sheets/alerts)
        // so they share one shape and Orion's own button colours.
        .overlay {
            if frame.isShowingDialog {
                ZStack {
                    Color.black.opacity(0.25)
                        .ignoresSafeArea()
                        .contentShape(.rect)
                        .onTapGesture {}
                        .accessibilityHidden(true)
                    dialog
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
                .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.18), value: frame.isShowingDialog)
        .alert("Orion couldn't do that", isPresented: $frame.isShowingError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(frame.errorMessage ?? "")
        }
    }

    private func projectAction(_ title: String, icon: String, panel: ProjectPanel) -> some View {
        Button { frame.togglePanel(panel) } label: {
            HStack(spacing: 2) {
                Image(systemName: icon).font(.system(size: 11))
                if panel == .todo {
                    let count = frame.visibleStream?.stars.filter { $0.status == .needs_you || $0.status == .stuck }.count ?? 0
                    if count > 0 { Text("\(count)").font(.system(size: 10, weight: .medium)) }
                }
            }
        }
            .help(title)
            .accessibilityLabel(title)
            .symbolVariant(frame.projectPanel == panel ? .fill : .none)
    }

    @ViewBuilder
    private var dialog: some View {
        if let project = frame.deletingProject {
            DeleteProjectDialog(frame: frame, project: project)
        } else if let project = frame.editingProject {
            EditProjectDialog(frame: frame, project: project)
        } else if frame.isCreatingProject {
            NewProjectSheet(frame: frame)
        }
    }

    /// Sidebar column: list only. The toggle is in the window toolbar above.
    private var sidebar: some View {
        FrameSidebar(frame: frame)
            .padding(.top, FrameMetrics.rowPadding)
            .background {
                WindowGlass.sidebar
                    .ignoresSafeArea()
            }
    }

    /// Detail column: native screens draw their own header.
    private var detail: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .top) {
                if frame.currentProject != nil {
                    Rectangle()
                        .fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
                        .frame(height: FrameMetrics.columnDividerWidth)
                        .allowsHitTesting(false)
                }
            }
    }

    private var title: String {
        if let project = frame.currentProject { return project.name }
        return switch frame.destination {
        case .home: String(localized: "Overview")
        case .inspiration: String(localized: "Inspiration")
        case .taste: String(localized: "Taste")
        case .designSystem: String(localized: "Design System")
        case .settings: String(localized: "Settings")
        default: String(localized: "Orion")
        }
    }
}
