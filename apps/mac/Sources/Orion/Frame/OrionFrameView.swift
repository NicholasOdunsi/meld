import OrionAppCore
import SwiftUI

/// The Orion window: a native sidebar column and a detail column. The sidebar
/// toggle lives in the real window toolbar so it shares the traffic-light
/// line; chat tabs stay in the detail column's own top bar so they can't
/// draw across the sidebar edge.
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

    /// Detail column: its own top bar (tabs), then the page.
    /// Only project chats need the tab bar. Overview, Inspiration and the
    /// other top-level pages omit it so their headers sit on the same line.
    private var detail: some View {
        VStack(spacing: 0) {
            if frame.isAvailable, frame.currentProject != nil {
                DetailTopBar(frame: frame)
                    .padding(.top, FrameMetrics.rowPadding)
                    .padding(.bottom, FrameMetrics.rowPadding)
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
