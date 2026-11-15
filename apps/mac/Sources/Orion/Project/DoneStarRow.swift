import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// A finished Star as one quiet line in the main chat:
/// "Fintech Profile Screen · Done · 5 replies". Tapping opens the Star.
struct DoneStarRow: View {
    let star: StreamStar
    let thread: StarThread
    let open: (String) -> Void

    @State private var hovering = false

    var body: some View {
        Button { open(star.id) } label: {
            HStack(spacing: OrionSpacing.xs) {
                Image(systemName: StreamStar.Status.done.symbol)
                    .foregroundStyle(StreamStar.Status.done.color)
                    .accessibilityHidden(true)
                Text(star.title).fontWeight(.semibold).lineLimit(1)
                Text("·  Done  ·  \(thread.replyCountLabel)").foregroundStyle(.secondary).lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption2).foregroundStyle(.tertiary)
                    .opacity(hovering ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .font(.callout)
            .padding(.horizontal, OrionSpacing.sm)
            .padding(.vertical, OrionSpacing.xs)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(.primary.opacity(hovering ? 0.08 : 0.04))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { inside in
            hovering = inside
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .onDisappear { if hovering { NSCursor.pop(); hovering = false } }
        .accessibilityLabel("Open Star: \(star.title), Done, \(thread.replyCountLabel)")
    }
}
