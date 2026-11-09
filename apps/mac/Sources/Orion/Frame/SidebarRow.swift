import OrionDesignSystem
import SwiftUI

/// One sidebar row: icon on the shared left edge, then the label. Selected
/// rows get a soft rounded-rectangle highlight and the filled icon.
struct SidebarRow<Icon: View>: View {
    let title: String
    let isSelected: Bool
    var badge: String?
    var isProject = false
    let action: () -> Void
    @ViewBuilder let icon: (Bool) -> Icon

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: FrameMetrics.iconTextSpacing) {
                icon(isSelected)
                    .frame(width: isProject ? 22 : 16, height: isProject ? 22 : 16)
                Text(title)
                    .font(.body)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 0)
                if let badge {
                    Text(badge)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, FrameMetrics.rowPadding)
            .frame(height: FrameMetrics.rowHeight)
            .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius))
            .background(highlight, in: .rect(cornerRadius: FrameMetrics.cornerRadius))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isSelected ? .primary : .secondary)
        .onHover { isHovered = $0 }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var highlight: AnyShapeStyle {
        if isSelected { AnyShapeStyle(.quaternary) }
        else if isHovered { AnyShapeStyle(.quinary) }
        else { AnyShapeStyle(.clear) }
    }
}

extension SidebarRow where Icon == OrionIconView {
    init(_ title: String, icon: OrionIcon, isSelected: Bool, badge: String? = nil, action: @escaping () -> Void) {
        self.init(title: title, isSelected: isSelected, badge: badge, action: action) { selected in
            OrionIconView(icon, weight: selected ? .fill : .regular)
        }
    }
}
