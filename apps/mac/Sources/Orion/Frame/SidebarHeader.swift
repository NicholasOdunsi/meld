import OrionDesignSystem
import SwiftUI

/// A small rounded-rectangle icon button, the same height and corners as the
/// sidebar rows and chat tabs. `isQuiet` drops the resting fill (just the
/// icon, highlighted on hover).
struct SquareIconButton: View {
    let title: String
    let icon: OrionIcon
    var isQuiet = false
    var weight: OrionIcon.Weight = .regular
    let action: () -> Void
    @State private var isHovered = false

    init(_ title: String, icon: OrionIcon, isQuiet: Bool = false, weight: OrionIcon.Weight = .regular, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.isQuiet = isQuiet
        self.weight = weight
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            OrionIconView(icon, weight: weight)
                // Quiet toolbar buttons skip the side padding so they can sit
                // closer to the traffic lights.
                .frame(
                    width: isQuiet ? FrameMetrics.rowHeight - 6 : FrameMetrics.rowHeight,
                    height: FrameMetrics.rowHeight
                )
                .background(fill, in: .rect(cornerRadius: FrameMetrics.cornerRadius))
        }
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .contentShape(.rect(cornerRadius: FrameMetrics.cornerRadius))
        .foregroundStyle(isQuiet ? .secondary : .primary)
        .accessibilityLabel(Text(title))
        .onHover { isHovered = $0 }
    }

    private var fill: AnyShapeStyle {
        if isHovered { AnyShapeStyle(.quaternary) }
        else if isQuiet { AnyShapeStyle(.clear) }
        else { AnyShapeStyle(.quinary) }
    }
}
