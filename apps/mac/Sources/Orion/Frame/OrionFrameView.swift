import OrionAppCore
import SwiftUI

/// The Orion window: a native sidebar column and a detail column. The sidebar
/// toggle lives in the real window toolbar so it shares the traffic-light line.
struct OrionFrameView<Content: View>: View {
    @Bindable var frame: FrameModel
    @ViewBuilder let content: Content
    /// Whole-window width, so the toolbar can follow the side panel's width.
    @State private var windowWidth: Double = 0

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
                    let panelWidth = panelWidth(for: panel, windowWidth: geometry.size.width)
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
        .onGeometryChange(for: Double.self) { $0.size.width } action: { windowWidth = $0 }
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
                            // Sized by `headerLayout`, then fixed: the toolbar
                            // can't squeeze it further (it used to collapse to
                            // nothing under Canvas and stay gone).
                            Text(project.displayName).font(.headline).lineLimit(1)
                                .frame(maxWidth: projectNameMaxWidth, alignment: .leading)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                        .padding(.leading, frame.isSidebarOpen ? 132 : FrameMetrics.contentEdge)
                    }
                    .sharedBackgroundVisibility(.hidden)
                    ToolbarSpacer(.flexible, placement: .primaryAction)
                    // The icons end `panelIconGap` before the panel divider: the
                    // last item is a spacer as wide as the panel, with the
                    // panel's close button at its far right.
                    ToolbarItemGroup(placement: .primaryAction) {
                        projectAction("Constellations", icon: "checklist", panel: .todo)
                        projectAction("Canvas", icon: "rectangle.on.rectangle.angled", panel: .canvas)
                        projectAction("Artifacts", icon: "tray.full", panel: .artifacts)
                        if let panel = frame.projectPanel {
                            HStack(spacing: 0) {
                                Spacer(minLength: 0)
                                Button { frame.togglePanel(panel) } label: {
                                    Image(systemName: "xmark").font(.system(size: 11))
                                }
                                .help("Close panel")
                                .accessibilityLabel("Close panel")
                            }
                            .frame(width: headerLayout.spacerWidth(
                                panelWidth: panelWidth(for: panel, windowWidth: windowWidth)))
                        }
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

    /// Width of the open side panel (0 when closed), same rule the project
    /// screen uses so the toolbar and the panel always agree.
    private func panelWidth(for panel: ProjectPanel, windowWidth: Double) -> Double {
        let detailWidth = windowWidth - (frame.isSidebarOpen ? 251.0 : 0.0)
        switch panel {
        case .todo, .star: return frame.sidePanelWidth(inDetailWidth: detailWidth)
        case .canvas: return detailWidth * 0.72
        case .artifacts: return detailWidth * 0.45
        }
    }

    /// The toolbar's width budget: the panel spacer gives way first, and the
    /// project name always keeps at least `ProjectHeaderLayout.minimumNameWidth`.
    private var headerLayout: ProjectHeaderLayout {
        let markStart = frame.isSidebarOpen ? 251.0 + FrameMetrics.contentEdge : FrameMetrics.projectNameStartWithoutSidebar
        return ProjectHeaderLayout(
            windowWidth: windowWidth,
            nameStart: markStart + FrameMetrics.projectMarkWidth,
            iconsWidth: FrameMetrics.toolbarIconsWidth,
            nameSlack: FrameMetrics.toolbarNameSlack,
            panelIconGap: FrameMetrics.panelIconGap,
            trailingInset: FrameMetrics.toolbarTrailingInset
        )
    }

    private var projectNameMaxWidth: CGFloat? {
        let open = frame.projectPanel.map { panelWidth(for: $0, windowWidth: windowWidth) }
        return headerLayout.nameMaxWidth(panelWidth: open).map { CGFloat($0) }
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
            // A Star is shown inside Constellations, so that icon stays lit.
            .symbolVariant(frame.projectPanel == panel || (panel == .todo && frame.projectPanel == .star) ? .fill : .none)
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
        if let project = frame.currentProject { return project.displayName }
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
