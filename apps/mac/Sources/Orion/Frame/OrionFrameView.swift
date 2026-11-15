import OrionAppCore
import SwiftUI

/// The Orion window: a native sidebar column and a detail column. The sidebar
/// toggle lives in the real window toolbar so it shares the traffic-light line.
struct OrionFrameView<Content: View>: View {
    @Bindable var frame: FrameModel
    @ViewBuilder let content: Content
    /// Whole-window width, so the toolbar can follow the side panel's width.
    @State private var windowWidth: Double = 0
    /// The detail column's real width (the window minus whatever sidebar is
    /// showing). The project screen splits this same width with the same
    /// `DetailSplit`, so the divider drawn here sits exactly on its boundary.
    @State private var detailWidth: Double = 0

    var body: some View {
        HStack(spacing: 0) {
            if frame.isAvailable && frame.isSidebarOpen {
                sidebar
                    .frame(width: FrameMetrics.sidebarWidth)
                    .transition(.move(edge: .leading).combined(with: .opacity))
                // Faint rule so the glass columns still read as separate.
                Rectangle()
                    .fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
                    .frame(width: FrameMetrics.columnDividerWidth)
                    .ignoresSafeArea()
            }
            detail
                .onGeometryChange(for: Double.self) { $0.size.width } action: { detailWidth = $0 }
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
                if let project = frame.currentProject {
                    // The project mark + name live here rather than in the
                    // toolbar: toolbar items are placed by AppKit relative to
                    // the traffic lights and the toggle, not to our sidebar,
                    // so a fixed offset there drifted into the sidebar. Here
                    // they start from the detail column's real left edge.
                    if !frame.isCanvasExpanded {
                        projectHeader(project)
                            .frame(height: FrameMetrics.toolbarHeight)
                            .offset(x: markStart(windowWidth: geometry.size.width))
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .allowsHitTesting(false)
                    }
                    if let panel = frame.projectPanel {
                        // The one divider between chat and panel, full height
                        // (through the header), centred on the slot the
                        // project screen leaves for it.
                        Rectangle()
                            .fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
                            .frame(width: split.dividerWidth)
                            .position(x: geometry.size.width - split.panelWidth - split.dividerWidth / 2,
                                      y: geometry.size.height / 2)
                            .allowsHitTesting(false)
                        Text(panel == .todo ? "Constellations" : panel == .star ? "Star" : panel == .canvas ? "Canvas" : "Artifacts")
                            .font(.headline)
                            .lineLimit(1)
                            .frame(width: max(0, split.panelWidth - 2 * FrameMetrics.contentEdge), alignment: .leading)
                            .position(x: geometry.size.width - split.panelWidth / 2, y: FrameMetrics.toolbarHeight / 2)
                            .allowsHitTesting(false)
                    }
                }
            }
            .ignoresSafeArea()
            .animation(.snappy(duration: 0.2), value: detailWidth)
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
                if frame.currentProject != nil {
                    ToolbarSpacer(.flexible, placement: .primaryAction)
                    // The icons end `panelIconGap` before the panel divider:
                    // after them comes a spacer as wide as the panel, with the
                    // panel's close button at its far right. One item, laid out
                    // by us, so its width is exactly what `headerLayout` budgets.
                    ToolbarItem(placement: .primaryAction) {
                        if frame.isCanvasExpanded {
                            HeaderIconButton(title: "Close panel", isActive: false) {
                                frame.togglePanel(.canvas)
                            } label: {
                                Image(systemName: "xmark")
                            }
                        } else {
                        HStack(spacing: 0) {
                            HStack(spacing: FrameMetrics.toolbarIconSpacing) {
                                projectAction("Constellations", icon: "checklist", panel: .todo)
                                projectAction("Canvas", icon: "rectangle.on.rectangle.angled", panel: .canvas)
                                projectAction("Artifacts", icon: "tray.full", panel: .artifacts)
                            }
                            if let panel = frame.projectPanel {
                                HStack(spacing: 0) {
                                    Spacer(minLength: 0)
                                    HeaderIconButton(title: "Close panel", isActive: false) {
                                        frame.togglePanel(panel)
                                    } label: {
                                        Image(systemName: "xmark")
                                    }
                                }
                                .frame(width: headerLayout.spacerWidth(panelWidth: split.panelWidth))
                            }
                        }
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

    /// The chat / panel split of the detail column: the very same value the
    /// project screen lays itself out with.
    private var split: DetailSplit { frame.detailSplit(detailWidth: detailWidth) }

    /// Where the project mark starts: the detail column's left edge plus the
    /// usual inset, but never under the traffic lights or the sidebar toggle.
    private func markStart(windowWidth: Double) -> Double {
        let detailStart = max(0, windowWidth - detailWidth)
        return max(detailStart + FrameMetrics.contentEdge, FrameMetrics.projectNameStartWithoutSidebar)
    }

    /// The header's width budget: the panel spacer gives way first, and the
    /// project name always keeps at least `ProjectHeaderLayout.minimumNameWidth`.
    private var headerLayout: ProjectHeaderLayout {
        ProjectHeaderLayout(
            windowWidth: windowWidth,
            nameStart: markStart(windowWidth: windowWidth) + FrameMetrics.projectMarkWidth,
            iconsWidth: FrameMetrics.toolbarIconsWidth,
            nameSlack: FrameMetrics.toolbarNameSlack,
            panelIconGap: FrameMetrics.panelIconGap,
            trailingInset: FrameMetrics.toolbarTrailingInset
        )
    }

    private var projectNameMaxWidth: CGFloat? {
        let open = frame.projectPanel == nil ? nil : split.panelWidth
        return headerLayout.nameMaxWidth(panelWidth: open).map { CGFloat($0) }
    }

    /// Project mark + name, truncating with "…" at `projectNameMaxWidth`.
    private func projectHeader(_ project: FrameProject) -> some View {
        HStack(spacing: FrameMetrics.iconTextSpacing) {
            ProjectMark(project: project, revision: frame.logoRevision)
            Text(project.displayName).font(.headline).lineLimit(1).truncationMode(.tail)
                .frame(maxWidth: projectNameMaxWidth, alignment: .leading)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func projectAction(_ title: String, icon: String, panel: ProjectPanel) -> some View {
        // A Star is shown inside Constellations, so that icon stays lit.
        let isActive = frame.projectPanel == panel || (panel == .todo && frame.projectPanel == .star)
        return HeaderIconButton(title: title, isActive: isActive) {
            frame.togglePanel(panel)
        } label: {
            HStack(spacing: 2) {
                Image(systemName: icon)
                if panel == .todo {
                    let count = frame.visibleStream?.stars.filter { $0.status == .needs_you || $0.status == .stuck }.count ?? 0
                    if count > 0 { Text("\(count)").font(.system(size: FrameMetrics.toolbarIconGlyph - 2, weight: .medium)) }
                }
            }
        }
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

/// A small header icon button: `toolbarIconSize` square (wider if it carries
/// a count), the glyph at `toolbarIconGlyph`, a soft fill on hover, and the
/// filled symbol when its panel is open.
private struct HeaderIconButton<Label: View>: View {
    let title: String
    let isActive: Bool
    let action: () -> Void
    @ViewBuilder let label: Label
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            label
                .font(.system(size: FrameMetrics.toolbarIconGlyph))
                .symbolVariant(isActive ? .fill : .none)
                .padding(.horizontal, 4)
                .frame(minWidth: FrameMetrics.toolbarIconSize, minHeight: FrameMetrics.toolbarIconSize)
                .background(isHovered ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.clear),
                            in: .rect(cornerRadius: FrameMetrics.cornerRadius - 1))
                .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius - 1))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isActive ? .primary : .secondary)
        .help(title)
        .accessibilityLabel(Text(title))
        .onHover { isHovered = $0 }
    }
}
