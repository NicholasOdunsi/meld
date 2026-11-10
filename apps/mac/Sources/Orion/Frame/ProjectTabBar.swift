import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// The open project's chats, oldest (Main) first, in the window's top bar —
/// vertically centred with the traffic lights. Same rounded-rectangle shape
/// and height as the sidebar rows. Past six tabs the rest are under "More"
/// (Apple HIG: tab views); + opens a new chat.
struct ProjectTabBar: View {
    @Bindable var frame: FrameModel

    var body: some View {
        let projectColor = frame.currentProject?.color ?? "blue"
        let split = TabOverflow.split(frame.currentTabs, selectedID: frame.tabSelection)
        HStack(spacing: FrameMetrics.rowSpacing) {
            ForEach(split.visible) { tab in
                ChatTab(
                    title: tab.name,
                    isSelected: tab.id == frame.tabSelection,
                    activity: frame.snapshot?.tabActivity[tab.id],
                    projectColor: projectColor
                ) {
                    frame.openTab(tab.id)
                }
            }
            if !split.overflow.isEmpty {
                Menu {
                    ForEach(split.overflow) { tab in
                        Button(tab.name) { frame.openTab(tab.id) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text("More")
                        OrionIconView(.caretDown)
                            .scaleEffect(0.75)
                    }
                    .padding(.horizontal, FrameMetrics.rowPadding + 2)
                    .frame(height: FrameMetrics.rowHeight)
                    .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius))
                }
                .menuStyle(.button)
                .buttonStyle(.plain)
                .pointerStyle(.link)
                .menuIndicator(.hidden)
                .foregroundStyle(.secondary)
                .fixedSize()
            }
            SquareIconButton("New Chat Tab", icon: .plus) {
                Task { await frame.newTab() }
            }
            .help("New chat tab (⌘T)")
            .padding(.leading, FrameMetrics.rowSpacing * 2)
        }
    }
}

/// One chat tab: a rounded rectangle, filled when selected.
private struct ChatTab: View {
    let title: String
    let isSelected: Bool
    let activity: FrameActivity?
    let projectColor: String
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let activity {
                    OrionHatMark(
                        state: activity.state == .working ? .working : .needsYou,
                        tint: ProjectStyle.color(projectColor),
                        hop: false,
                        label: activity.label
                    )
                    .frame(width: 16, height: 16)
                }
                Text(title)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .frame(maxWidth: 200)
            .padding(.horizontal, FrameMetrics.rowPadding + 2)
            .frame(height: FrameMetrics.rowHeight)
            .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius))
            .background(highlight, in: .rect(cornerRadius: FrameMetrics.cornerRadius))
        }
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .foregroundStyle(isSelected ? .primary : .secondary)
        .fontWeight(isSelected ? .medium : .regular)
        .onHover { isHovered = $0 }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var highlight: AnyShapeStyle {
        if isSelected { AnyShapeStyle(.quaternary) }
        else if isHovered { AnyShapeStyle(.quinary) }
        else { AnyShapeStyle(.clear) }
    }
}
